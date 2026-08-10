/**
 * Public API for converting Lexical editor state to ODT.
 *
 * Import from "odf-kit/lexical/to-odt":
 *
 * ```typescript
 * import { lexicalToOdt } from "odf-kit/lexical/to-odt";
 * ```
 */
export { VERSION } from "../../version.js";

export { lexicalToOdt } from "./lexical-to-odt.js";
export type {
  LexicalToOdtOptions,
  LexicalSerializedEditorState,
  LexicalSerializedNode,
} from "./types.js";
