/**
 * extract-odf-grammar.mjs
 *
 * Extracts the complete ODF 1.4 grammar from the three OASIS ODF 1.4 RelaxNG
 * schemas (main, manifest, dsig) into machine-readable JSON: every element's
 * content model, every attribute declaration with the define that encloses
 * it and the elements that reach it (per-context legality), and every
 * datatype define with its enumerations.
 *
 * Everything emitted is STRUCTURAL: patterns are recorded as the schema
 * writes them, and derived indices are graph reachability over those
 * patterns. No RELAX NG semantics (occurrence, simplification rules) are
 * asserted — the RELAX NG specification is not an on-disk source, so any
 * such interpretation would be a spec fact stated from memory.
 *
 * Usage:
 *   npm run build                         (the script reuses our own XML parser)
 *   node tools/extract-odf-grammar.mjs
 *
 * Reads (T4: Move 1 answer 1, Scott 2026-10-21 — the schemas are read from
 * the internal repo and never copied into public spec/, per R5; the run
 * HARD-STOPS if any file's sha256 differs from the value recorded below):
 *   ../odf-kit-internal/spec/odf-1.4/schemas/OpenDocument-v1.4-schema.rng
 *   ../odf-kit-internal/spec/odf-1.4/schemas/OpenDocument-v1.4-manifest-schema.rng
 *   ../odf-kit-internal/spec/odf-1.4/schemas/OpenDocument-v1.4-dsig-schema.rng
 *
 * Writes (T4: Move 1 layout — version-stable paths, spec version inside the
 * generated header, never in the filename):
 *   spec/odf-elements.json    — content models, children, attributes, parents
 *   spec/odf-attributes.json  — every attribute declaration and its contexts
 *   spec/odf-datatypes.json   — every datatype define and its enumerations
 *
 * Every define lands in exactly one place (checked below): an element define
 * (body is a single <rng:element>) is an element declaration; a define that
 * reaches no element and no attribute but does reach a value, data or list
 * is a datatype (T4: Move 1 classification); every other define is a
 * pattern, inlined into the content models that reference it (each inlined
 * node names its define in `via`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Dogfood: parse the spec's schemas with odf-kit's own XML parser.
import { parseXml } from "../dist/odt/read/xml-parser.js";

// T4: bump on any change that alters the generated output.
const EXTRACTOR_VERSION = "1.0.0";
const EXTRACTOR_NAME = "tools/extract-odf-grammar.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const INTERNAL = join(REPO, "..", "odf-kit-internal");
const SCHEMA_DIR = "spec/odf-1.4/schemas";

// sha256 values as recorded in odf-kit-internal spec/odf-1.4/PROVENANCE.md
// l.33, l.35, l.37 (Files table; retrieved 2026-10-05).
const SCHEMAS = [
  {
    file: "OpenDocument-v1.4-schema.rng",
    sha256: "4034ec6be29205d5fc1ee5f42468ac6ef824287b3aba6d9289032af4fafbda7f",
  },
  {
    file: "OpenDocument-v1.4-manifest-schema.rng",
    sha256: "f96e1fe95f4e3609717a307c28e2fe0654c890fe70ea03eb8a53caa20b684782",
  },
  {
    file: "OpenDocument-v1.4-dsig-schema.rng",
    sha256: "e8a22d312eeaaa53068f4f84f7f4abd46312d9e18519452049a69cf496995305",
  },
];

// T1: each schema's opening comment: "Version 1.4 / OASIS Standard /
// 6 October 2025" (OpenDocument-v1.4-schema.rng l.3-5; checked per file below).
const SPEC = {
  title: "Open Document Format for Office Applications (OpenDocument) Version 1.4",
  stage: "OASIS Standard",
  date: "6 October 2025",
};

function fail(msg) {
  console.error(`extract-odf-grammar: HARD STOP — ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load, verify, parse
// ---------------------------------------------------------------------------

const RNG_NS = "http://relaxng.org/ns/structure/1.0";
// The RNG vocabulary the three schemas use (probe-move1 survey); anything
// else is a hard stop so nothing is silently dropped.
const PATTERN_TAGS = new Set([
  "element", "attribute", "group", "interleave", "choice", "optional",
  "zeroOrMore", "oneOrMore", "list", "mixed", "ref", "empty", "text",
  "value", "data", "notAllowed",
]);
const NAMECLASS_TAGS = new Set(["name", "anyName", "nsName", "choice"]);

/**
 * Start-tag line numbers in document order. parseXml keeps no positions, so
 * the raw text is scanned for start tags (skipping comments, PIs, end tags)
 * and the sequence is checked tag-for-tag against parseXml's pre-order.
 */
function startTagLines(src) {
  const out = [];
  let line = 1;
  let i = 0;
  const advance = (to) => {
    for (; i < to; i++) if (src.charCodeAt(i) === 10) line++;
  };
  while (true) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;
    advance(lt);
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt);
      advance(end + 3);
    } else if (src.startsWith("<?", lt)) {
      advance(src.indexOf("?>", lt) + 2);
    } else if (src.startsWith("<!", lt)) {
      fail(`unexpected markup declaration at line ${line}`);
    } else if (src[lt + 1] === "/") {
      advance(src.indexOf(">", lt) + 1);
    } else {
      const m = /^<([^\s/>]+)/.exec(src.slice(lt, lt + 200));
      out.push({ tag: m[1], line });
      advance(lt + 1);
    }
  }
  return out;
}

function load(schema) {
  const rel = `${SCHEMA_DIR}/${schema.file}`;
  const path = join(INTERNAL, rel);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    fail(`cannot read ${path}`);
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== schema.sha256) fail(`${rel} sha256 ${sha} != recorded ${schema.sha256}`);
  const src = bytes.toString("utf8");
  const head = src.slice(0, 600);
  for (const s of Object.values(SPEC)) if (!head.includes(s)) fail(`${rel} header lacks "${s}"`);

  const root = parseXml(src);
  const tags = startTagLines(src);
  let k = 0;
  (function annotate(node) {
    const t = tags[k++];
    if (!t || t.tag !== node.tag) fail(`${rel}: line scan out of step at <${node.tag}>`);
    node.line = t.line;
    for (const c of node.children) if (c.type === "element") annotate(c);
  })(root);
  if (k !== tags.length) fail(`${rel}: ${tags.length - k} start tags not in the parse tree`);

  if (root.tag !== "rng:grammar" || root.attrs["xmlns:rng"] !== RNG_NS) fail(`${rel}: root is not rng:grammar`);
  const namespaces = {};
  for (const [k2, v] of Object.entries(root.attrs)) if (k2.startsWith("xmlns:")) namespaces[k2.slice(6)] = v;
  return { ...schema, rel, src, root, namespaces, datatypeLibrary: root.attrs.datatypeLibrary };
}

const loaded = SCHEMAS.map(load);

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

const elems = (n) => n.children.filter((c) => c.type === "element");
const text = (n) => n.children.filter((c) => c.type === "text").map((c) => c.text).join("");
function local(n) {
  if (!n.tag.startsWith("rng:")) return null;
  return n.tag.slice(4);
}
const ALLOWED_ATTRS = {
  define: ["name"], ref: ["name"], element: ["name"], attribute: ["name"],
  data: ["type"], param: ["name"], value: [], name: [],
};
function checkAttrs(n) {
  const allowed = ALLOWED_ATTRS[local(n)] ?? [];
  for (const a of Object.keys(n.attrs)) {
    if (!allowed.includes(a)) fail(`unexpected attribute ${a} on <${n.tag}> line ${n.line}`);
  }
}

// ---------------------------------------------------------------------------
// Defines
// ---------------------------------------------------------------------------

// Define names are scoped per schema (each file is its own grammar; e.g.
// anyAttListOrElements is defined in both main and manifest).
const defines = new Map(); // `${schema}#${name}` -> { name, schema, line, body, description }
const defKey = (schema, name) => `${schema}#${name}`;
function getDef(schema, name) {
  const def = defines.get(defKey(schema, name));
  if (!def) fail(`ref to undefined define "${name}" in ${schema}`);
  return def;
}
const starts = [];
for (const s of loaded) {
  for (const c of elems(s.root)) {
    if (c.tag === "rng:start") {
      starts.push({ schema: s.file, line: c.line, body: elems(c) });
    } else if (c.tag === "rng:define") {
      checkAttrs(c);
      const name = c.attrs.name;
      if (defines.has(defKey(s.file, name))) fail(`define "${name}" declared twice (${s.file}:${c.line})`);
      const body = [];
      const description = [];
      for (const d of elems(c)) {
        if (d.tag === "dc:description") description.push(text(d));
        else if (local(d) && PATTERN_TAGS.has(local(d))) body.push(d);
        else fail(`unexpected <${d.tag}> in define ${name} (${s.file}:${d.line})`);
      }
      defines.set(defKey(s.file, name), { name, schema: s.file, line: c.line, body, description });
    } else {
      fail(`unexpected top-level <${c.tag}> (${s.file}:${c.line})`);
    }
  }
}

// Does a define reach one of `tags` through refs? (Structural; a fresh
// visited set per define, so a ref cycle cannot memoise a wrong answer.)
function reaches(start, tags) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const def = getDef(start.schema, queue.shift().name);
    const stack = [...def.body];
    while (stack.length) {
      const n = stack.pop();
      const t = local(n);
      if (tags.includes(t)) return true;
      if (t === "ref") {
        const target = getDef(def.schema, n.attrs.name);
        if (!seen.has(target)) seen.add(target), queue.push(target);
      } else stack.push(...elems(n));
    }
  }
  return false;
}

for (const def of defines.values()) {
  if (def.body.length === 1 && def.body[0].tag === "rng:element") def.kind = "element";
  // A datatype reaches no element/attribute and does reach a value, data or
  // list. That excludes the schema's <rng:empty/>-only placeholder defines
  // (e.g. db-forms-attlist, l.3590), which stay patterns and are inlined.
  else if (!reaches(def, ["element", "attribute"]) && reaches(def, ["value", "data", "list"])) def.kind = "datatype";
  else def.kind = "pattern";
}

// ---------------------------------------------------------------------------
// Name classes
// ---------------------------------------------------------------------------

function nameClass(n) {
  const t = local(n);
  if (!t || !NAMECLASS_TAGS.has(t)) fail(`unexpected name class <${n.tag}> line ${n.line}`);
  if (t === "name") return { name: text(n).trim() };
  if (t === "choice") return { choice: elems(n).map(nameClass) };
  const out = { [t]: {} };
  for (const c of elems(n)) {
    if (c.tag !== "rng:except") fail(`unexpected <${c.tag}> in <${n.tag}> line ${c.line}`);
    out[t].except = elems(c).map(nameClass);
  }
  return out;
}
/** Finite name set of a name class, or null when it is open (anyName/nsName). */
function finiteNames(nc) {
  if (nc.name) return [nc.name];
  if (nc.choice) {
    const parts = nc.choice.map(finiteNames);
    return parts.includes(null) ? null : parts.flat();
  }
  return null;
}
/** Split an element/attribute node into its name class and its pattern children. */
function splitDecl(n) {
  checkAttrs(n);
  const kids = elems(n);
  if (n.attrs.name !== undefined) return { nc: { name: n.attrs.name }, pattern: kids };
  if (kids.length === 0) fail(`<${n.tag}> without name or name class, line ${n.line}`);
  return { nc: nameClass(kids[0]), pattern: kids.slice(1) };
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

const declId = (schema, line) => `${schema}:${line}`;
const elementDecls = new Map(); // id -> decl
const attributeDecls = new Map();

// Collect every element/attribute declaration with its enclosing define.
function collect(n, schema, enclosing) {
  const t = local(n);
  if (t === "element" || t === "attribute") {
    const { nc, pattern } = splitDecl(n);
    const id = declId(schema, n.line);
    const map = t === "element" ? elementDecls : attributeDecls;
    if (elementDecls.has(id) || attributeDecls.has(id)) fail(`two declarations at ${id}`);
    map.set(id, { id, schema, line: n.line, define: enclosing, nameClass: nc, names: finiteNames(nc), pattern });
  }
  for (const c of elems(n)) if (local(c) && c.tag !== "rng:except") collect(c, schema, enclosing);
}
for (const def of defines.values()) for (const b of def.body) collect(b, def.schema, def.name);
for (const st of starts) for (const b of st.body) collect(b, st.schema, "(start)");

// Cross-check the tree walk against an independent count over the raw text
// with XML comments removed. The schemas keep removed declarations inside
// comments (e.g. OpenDocument-v1.4-schema.rng l.817 "Deleted as per
// https://issues.oasis-open.org/browse/OFFICE-3741 for ODF 1.4"); those are
// not grammar and are not extracted.
for (const s of loaded) {
  const live = s.src.replace(/<!--[\s\S]*?-->/g, "");
  const count = (re) => (live.match(re) || []).length;
  const e = [...elementDecls.values()].filter((d) => d.schema === s.file).length;
  const a = [...attributeDecls.values()].filter((d) => d.schema === s.file).length;
  const df = [...defines.values()].filter((d) => d.schema === s.file).length;
  if (e !== count(/<rng:element\b/g)) fail(`${s.file}: ${e} element decls vs raw ${count(/<rng:element\b/g)}`);
  if (a !== count(/<rng:attribute\b/g)) fail(`${s.file}: ${a} attribute decls vs raw ${count(/<rng:attribute\b/g)}`);
  if (df !== count(/<rng:define\b/g)) fail(`${s.file}: ${df} defines vs raw ${count(/<rng:define\b/g)}`);
}

// ---------------------------------------------------------------------------
// Pattern rendering
// ---------------------------------------------------------------------------

const elementDeclOfDefine = (def) => declId(def.schema, def.body[0].line);
const ncLabel = (d) => (d.names && d.names.length === 1 ? d.names[0] : d.nameClass);

/**
 * Render a pattern node as JSON, as written. In content mode, element and
 * attribute declarations become references ({element|attribute, decl}),
 * refs to element defines become element references, refs to datatypes stay
 * refs, and refs to pattern defines are inlined with `via`.
 */
function render(n, stack) {
  const t = local(n);
  if (!t || !PATTERN_TAGS.has(t)) fail(`unexpected <${n.tag}> line ${n.line}`);
  checkAttrs(n);
  switch (t) {
    case "element":
    case "attribute": {
      const d = (t === "element" ? elementDecls : attributeDecls).get(declId(currentSchema, n.line));
      return { [t]: ncLabel(d), decl: d.id };
    }
    case "ref": {
      const name = n.attrs.name;
      const def = getDef(currentSchema, name);
      if (def.kind === "element") {
        const d = elementDecls.get(elementDeclOfDefine(def));
        return { element: ncLabel(d), decl: d.id, define: name };
      }
      if (def.kind === "datatype") return { ref: name };
      if (stack.includes(name)) return { ref: name, recursive: true };
      return {
        via: name,
        ...(def.description.length ? { description: def.description } : {}),
        pattern: renderSeq(def.body, [...stack, name], def.schema),
      };
    }
    case "empty":
    case "text":
    case "notAllowed":
      return t;
    case "value":
      return { value: text(n) };
    case "data": {
      const out = { data: n.attrs.type };
      for (const p of elems(n)) {
        if (p.tag === "rng:param") (out.params ??= {})[p.attrs.name] = text(p);
        else if (p.tag === "rng:except") out.except = elems(p).map((c) => render(c, stack));
        else fail(`unexpected <${p.tag}> in <rng:data> line ${p.line}`);
      }
      return out;
    }
    default:
      return { [t]: elems(n).map((c) => render(c, stack)) };
  }
}
let currentSchema = null;
function renderSeq(nodes, stack, schema) {
  const saved = currentSchema;
  currentSchema = schema;
  const out = nodes.map((c) => render(c, stack));
  currentSchema = saved;
  return out;
}

// ---------------------------------------------------------------------------
// Reachability over rendered patterns
// ---------------------------------------------------------------------------

/** Walk a rendered pattern; element/attribute references are leaves. */
function walkRendered(p, fn) {
  if (typeof p === "string") return fn(p);
  if (Array.isArray(p)) return p.forEach((q) => walkRendered(q, fn));
  fn(p);
  if (p.element !== undefined || p.attribute !== undefined) return;
  for (const [k, v] of Object.entries(p)) {
    if (k === "pattern" || Array.isArray(v)) walkRendered(v, fn);
  }
}

// Datatype closure: literal values and xsd data types reachable from a value
// pattern. Rendered refs are always to defines in the rendering schema.
const dtMemo = new Map();
const dtBusy = new Set();
function datatypeFacts(def) {
  if (dtMemo.has(def)) return dtMemo.get(def);
  if (dtBusy.has(def)) fail(`datatype ref cycle through ${def.name} (${def.schema}:${def.line})`);
  dtBusy.add(def);
  const facts = { values: new Set(), data: new Set(), refs: new Set() };
  walkRendered(renderSeq(def.body, [], def.schema), (q) => collectValueFacts(q, facts, def.schema));
  dtBusy.delete(def);
  dtMemo.set(def, facts);
  return facts;
}
function collectValueFacts(q, facts, schema) {
  if (typeof q !== "object") return;
  if (q.value !== undefined) facts.values.add(q.value);
  if (q.data !== undefined) facts.data.add(q.data);
  if (q.ref !== undefined && getDef(schema, q.ref).kind === "datatype") {
    facts.refs.add(q.ref);
    const sub = datatypeFacts(getDef(schema, q.ref));
    sub.values.forEach((v) => facts.values.add(v));
    sub.data.forEach((v) => facts.data.add(v));
  }
}
const sorted = (set) => [...set].sort();
// Declaration ids in schema order (SCHEMAS), then by line number.
const schemaRank = (file) => SCHEMAS.findIndex((s) => s.file === file);
const byDecl = (a, b) => {
  const [fa, la] = a.split(":");
  const [fb, lb] = b.split(":");
  return schemaRank(fa) - schemaRank(fb) || Number(la) - Number(lb);
};
const sortedDecls = (ids) => [...ids].sort(byDecl);

// ---------------------------------------------------------------------------
// Build the three datasets
// ---------------------------------------------------------------------------

const attrContexts = new Map(); // attribute decl id -> Set of element decl ids
const byName = (decls) => {
  const named = {};
  const open = [];
  for (const d of decls) {
    if (d.names) for (const nm of d.names) (named[nm] ??= []).push(d);
    else open.push(d);
  }
  return { named, open };
};

const elementOut = new Map();
for (const d of elementDecls.values()) {
  // An element is a boundary: its content starts a fresh inlining path, so a
  // ref back to the define that encloses the declaration is inlined, not cut.
  const content = renderSeq(d.pattern, [], d.schema);
  const children = new Map();
  const attributes = new Set();
  let textAllowed = false;
  const typed = { values: new Set(), data: new Set(), refs: new Set() };
  walkRendered(content, (q) => {
    if (q === "text") textAllowed = true;
    if (typeof q !== "object") return;
    if (q.element !== undefined) children.set(q.decl, q.element);
    else if (q.attribute !== undefined) {
      attributes.add(q.decl);
      (attrContexts.get(q.decl) ?? attrContexts.set(q.decl, new Set()).get(q.decl)).add(d.id);
    } else collectValueFacts(q, typed, d.schema);
  });
  elementOut.set(d.id, {
    schema: d.schema,
    line: d.line,
    define: d.define,
    ...(d.names && d.names.length === 1 ? {} : { nameClass: d.nameClass }),
    contentModel: content,
    children: sortedDecls(children.keys()).map((decl) => ({ element: children.get(decl), decl })),
    attributes: sortedDecls(attributes).map((id) => ({ attribute: ncLabel(attributeDecls.get(id)), decl: id })),
    text: textAllowed,
    ...(typed.values.size || typed.data.size || typed.refs.size
      ? { typedContent: { datatypes: sorted(typed.refs), values: sorted(typed.values), data: sorted(typed.data) } }
      : {}),
  });
}

// Parents: element names whose declarations list a child declaration.
const parentsOfDecl = new Map();
for (const [id, e] of elementOut) {
  for (const c of e.children) {
    (parentsOfDecl.get(c.decl) ?? parentsOfDecl.set(c.decl, new Set()).get(c.decl)).add(id);
  }
}
const declLabel = (id) => {
  const n = elementDecls.get(id).names;
  return n ? n.join("|") : "(open name class)";
};

function elementsDataset() {
  const { named, open } = byName(elementDecls.values());
  const entry = (d) => ({
    ...elementOut.get(d.id),
    parents: sortedDecls(parentsOfDecl.get(d.id) ?? []).map((id) => ({ element: declLabel(id), decl: id })),
  });
  const elements = {};
  for (const nm of Object.keys(named).sort()) elements[nm] = { declarations: named[nm].map(entry) };
  const roots = starts.map((st) => ({
    schema: st.schema,
    line: st.line,
    pattern: renderSeq(st.body, [], st.schema),
  }));
  return { roots, elements, openNameClassElements: open.map((d) => ({ decl: d.id, ...entry(d) })) };
}

function attributesDataset() {
  const { named, open } = byName(attributeDecls.values());
  const entry = (d) => {
    const value = renderSeq(d.pattern, [], d.schema);
    const facts = { values: new Set(), data: new Set(), refs: new Set() };
    walkRendered(value, (q) => collectValueFacts(q, facts, d.schema));
    const ctx = sortedDecls(attrContexts.get(d.id) ?? []);
    return {
      schema: d.schema,
      line: d.line,
      define: d.define,
      ...(d.names && d.names.length === 1 ? {} : { nameClass: d.nameClass }),
      value,
      datatypes: sorted(facts.refs),
      values: sorted(facts.values),
      data: sorted(facts.data),
      elements: ctx.map((id) => ({ element: declLabel(id), decl: id })),
    };
  };
  const attributes = {};
  for (const nm of Object.keys(named).sort()) attributes[nm] = { declarations: named[nm].map(entry) };
  return { attributes, openNameClassAttributes: open.map((d) => ({ decl: d.id, ...entry(d) })) };
}

function datatypesDataset() {
  const datatypes = {};
  const usedBy = new Map();
  for (const d of attributeDecls.values()) {
    const facts = { values: new Set(), data: new Set(), refs: new Set() };
    walkRendered(renderSeq(d.pattern, [], d.schema), (q) => collectValueFacts(q, facts, d.schema));
    for (const r of facts.refs) {
      const def = getDef(d.schema, r);
      (usedBy.get(def) ?? usedBy.set(def, new Set()).get(def)).add(d.id);
    }
  }
  const all = [...defines.values()].filter((x) => x.kind === "datatype");
  for (const name of sorted(new Set(all.map((x) => x.name)))) {
    datatypes[name] = {
      declarations: all
        .filter((x) => x.name === name)
        .map((def) => {
          const f = datatypeFacts(def);
          return {
            schema: def.schema,
            line: def.line,
            ...(def.description.length ? { description: def.description } : {}),
            pattern: renderSeq(def.body, [], def.schema),
            datatypes: sorted(f.refs),
            values: sorted(f.values),
            data: sorted(f.data),
            attributeDeclarations: (usedBy.get(def) ?? new Set()).size,
          };
        }),
    };
  }
  return { datatypes };
}

// ---------------------------------------------------------------------------
// Completeness checks
// ---------------------------------------------------------------------------

const elementsData = elementsDataset();
const attributesData = attributesDataset();
const datatypesData = datatypesDataset();

const kinds = { element: 0, datatype: 0, pattern: 0 };
for (const d of defines.values()) kinds[d.kind]++;
if (kinds.element + kinds.datatype + kinds.pattern !== defines.size) fail("define classification incomplete");
// Every pattern define must be inlined somewhere, or it would be lost.
const inlined = new Set();
const noteVia = (p, schema) =>
  walkRendered(p, (q) => typeof q === "object" && q.via && inlined.add(defKey(schema, q.via)));
for (const e of elementOut.values()) noteVia(e.contentModel, e.schema);
for (const r of elementsData.roots) noteVia(r.pattern, r.schema);
for (const a of Object.values(attributesData.attributes).flatMap((x) => x.declarations)) noteVia(a.value, a.schema);
for (const a of attributesData.openNameClassAttributes) noteVia(a.value, a.schema);
const orphans = [...defines.values()].filter((d) => d.kind === "pattern" && !inlined.has(defKey(d.schema, d.name)));
if (orphans.length) fail(`pattern defines never inlined (would be lost): ${orphans.map((d) => `${d.name} (${d.schema}:${d.line})`)}`);
// A description on an element define has no home in the output; stop if one appears.
const lostDescriptions = [...defines.values()].filter((d) => d.description.length && d.kind === "element");
if (lostDescriptions.length) fail(`dc:description on element defines: ${lostDescriptions.map((d) => d.name)}`);

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
function header(file, counts) {
  return {
    notice: `GENERATED by ${EXTRACTOR_NAME} — regenerate (npm run build && node ${EXTRACTOR_NAME}), never edit by hand. Derived from OASIS ODF 1.4 schemas; see spec/NOTICE.md.`,
    file,
    extractor: { name: EXTRACTOR_NAME, version: EXTRACTOR_VERSION },
    generated: today,
    spec: SPEC,
    schemas: loaded.map((s) => ({
      file: s.file,
      path: `odf-kit-internal/${s.rel}`,
      sha256: s.sha256,
      datatypeLibrary: s.datatypeLibrary,
      namespaces: s.namespaces,
    })),
    conventions: {
      decl: "declaration id = '<schema file>:<line of its <rng:element>/<rng:attribute> start tag>'",
      define: "the <rng:define> enclosing the declaration ('(start)' for <rng:start>)",
      pattern: "RNG patterns as written; element/attribute declarations appear as references {element|attribute, decl}; refs to datatype defines stay {ref}; refs to other non-element defines are inlined as {via, pattern}; {ref, recursive:true} marks a define already on the inlining path",
      reachability: "children/attributes/elements/parents are structural reachability over the patterns, stopping at element and attribute boundaries; no RELAX NG semantics (occurrence, simplification) are asserted",
    },
    counts,
  };
}
function write(file, counts, body) {
  writeFileSync(join(REPO, "spec", file), JSON.stringify({ _generated: header(file, counts), ...body }, null, 2) + "\n");
}

const elementDeclCount = elementDecls.size;
write("odf-elements.json", {
  elementDeclarations: elementDeclCount,
  elementNames: Object.keys(elementsData.elements).length,
  openNameClassElements: elementsData.openNameClassElements.length,
  defines: defines.size,
  elementDefines: kinds.element,
  patternDefinesInlined: kinds.pattern,
}, elementsData);
write("odf-attributes.json", {
  attributeDeclarations: attributeDecls.size,
  attributeNames: Object.keys(attributesData.attributes).length,
  openNameClassAttributes: attributesData.openNameClassAttributes.length,
}, attributesData);
write("odf-datatypes.json", { datatypeDefines: kinds.datatype }, datatypesData);

console.log("defines", defines.size, kinds);
console.log("element decls", elementDeclCount, "names", Object.keys(elementsData.elements).length, "open", elementsData.openNameClassElements.length);
console.log("attribute decls", attributeDecls.size, "names", Object.keys(attributesData.attributes).length, "open", attributesData.openNameClassAttributes.length);
