import { OdtDocument } from "../odt/document.js";
import type { LexicalSerializedEditorState, LexicalToOdtOptions } from "./types.js";
import { walkRoot } from "./walker/walk-root.js";

/**
 * Page format dimensions — mirrors tiptap-to-odt.ts and html-to-odt.ts.
 */
const PAGE_FORMATS: Record<string, { width: string; height: string; margin: string }> = {
  A4: { width: "21cm", height: "29.7cm", margin: "2.5cm" },
  letter: { width: "21.59cm", height: "27.94cm", margin: "2.54cm" },
  legal: { width: "21.59cm", height: "35.56cm", margin: "2.54cm" },
  A3: { width: "29.7cm", height: "42cm", margin: "2.5cm" },
  A5: { width: "14.8cm", height: "21cm", margin: "2cm" },
};

/**
 * Convert a Lexical SerializedEditorState to a valid ODT file.
 *
 * Produces a ZIP-packaged `.odt` file that passes the OASIS ODF validator.
 * Works in Node.js 22+, browsers, Deno, Bun, and Cloudflare Workers.
 *
 * @param editorState - The Lexical serialized editor state (from `editor.getEditorState().toJSON()`).
 * @param options     - Page format, margins, and image resolution callback.
 * @returns Promise resolving to a valid `.odt` file as a `Uint8Array`.
 *
 * @example
 * import { lexicalToOdt } from "odf-kit/lexical"
 *
 * const bytes = await lexicalToOdt(editorState, { pageFormat: "A4" })
 *
 * @example
 * // With image resolution
 * const bytes = await lexicalToOdt(editorState, {
 *   pageFormat: "A4",
 *   fetchImage: async (src) => {
 *     const response = await fetch(src)
 *     return new Uint8Array(await response.arrayBuffer())
 *   },
 * })
 */
export async function lexicalToOdt(
  editorState: LexicalSerializedEditorState,
  options?: LexicalToOdtOptions,
): Promise<Uint8Array> {
  const doc = new OdtDocument();
  const format = PAGE_FORMATS[options?.pageFormat ?? "A4"];

  doc.setPageLayout({
    width: format.width,
    height: format.height,
    marginTop: options?.marginTop ?? format.margin,
    marginBottom: options?.marginBottom ?? format.margin,
    marginLeft: options?.marginLeft ?? format.margin,
    marginRight: options?.marginRight ?? format.margin,
  });

  await walkRoot(editorState, doc, { options: options ?? {} });

  return doc.save();
}
