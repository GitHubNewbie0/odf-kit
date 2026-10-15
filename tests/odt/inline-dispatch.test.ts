/**
 * ODT emitters — inline dispatch over an unknown InlineNode kind.
 *
 * T4: LEAD-044 (canon §5) — every outbound emitter's inline dispatch must be
 * exhaustive over the InlineNode union, so a new kind is a compile error
 * rather than a runtime throw or a silent drop. T4: Scott, 2026-10-15,
 * option B — the dispatcher's default branch carries the `never` check and
 * throws an Error naming the kind, for models built outside the type system
 * (plain-JS callers of the public model-taking functions).
 *
 * Before the fix all three dispatchers fell through to the TextSpan renderer
 * via `node as TextSpan`: a node without a `text` string threw an unrelated
 * TypeError from the escaper, and a node with one was emitted as plain text.
 * These tests cover both shapes, so a later `default` that returns "" (a
 * silent drop) fails them too.
 *
 * The models are hand-built and cast, because no typed model can hold an
 * unknown kind — that impossibility is what the fix enforces.
 */

import { renderOdtHtml } from "../../src/odt/to-html/index.js";
import { modelToMarkdown } from "../../src/odt/to-markdown/index.js";
import { modelToTypst } from "../../src/odt/to-typst/index.js";
import type { BodyNode, InlineNode, OdtDocumentModel } from "../../src/odt/read/types.js";

/** A paragraph [A, node, B] whose middle node is outside the InlineNode union. */
function bodyWith(node: object): BodyNode[] {
  return [{ kind: "paragraph", spans: [{ text: "A" }, node as InlineNode, { text: "B" }] }];
}

function doc(body: BodyNode[]): OdtDocumentModel {
  return { metadata: {}, body, toHtml: () => "" };
}

/** The shape a D97-1 drawing-text node will have: block content, no `text`. */
const NO_TEXT = { kind: "textBox", body: [{ kind: "paragraph", spans: [{ text: "BOX" }] }] };
/** An unknown kind that also carries a `text` string. */
const WITH_TEXT = { kind: "mystery", text: "LEAKED" };

const emitters: [string, (body: BodyNode[]) => string][] = [
  ["renderOdtHtml", (body) => renderOdtHtml(body)],
  ["modelToMarkdown", (body) => modelToMarkdown(doc(body))],
  ["modelToTypst", (body) => modelToTypst(doc(body))],
];

describe.each(emitters)("%s — unknown InlineNode kind (T4: LEAD-044, option B)", (_name, emit) => {
  test("a kind without a text field throws an Error naming the kind", () => {
    expect(() => emit(bodyWith(NO_TEXT))).toThrow('unknown InlineNode kind "textBox"');
  });

  test("a kind with a text field throws naming the kind, rather than emitting the text", () => {
    expect(() => emit(bodyWith(WITH_TEXT))).toThrow('unknown InlineNode kind "mystery"');
  });
});
