/**
 * Legacy alias. Preserved for backwards compatibility with callers that
 * import from "odf-kit/lexical". The Lexical pathway now lives at:
 *   - "odf-kit/lexical/to-odt"
 *
 * New code should import from that canonical path.
 */
export { VERSION } from "../version.js";

export { lexicalToOdt } from "./to-odt/lexical-to-odt.js";
export type {
  LexicalToOdtOptions,
  LexicalSerializedEditorState,
  LexicalSerializedNode,
} from "./to-odt/types.js";
