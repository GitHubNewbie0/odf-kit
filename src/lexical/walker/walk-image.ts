import type { OdtDocument } from "../../odt/document.js";
import type { InlineContentBuilder } from "../types.js";
import type { LexicalImageNode, LexicalSerializedNode, LexicalToOdtOptions } from "../types.js";
import { isBase64Image, base64ToUint8Array, detectMime } from "../util/detect-mime.js";
import { pxToCm } from "../util/px-to-cm.js";
import { walkInline } from "./walk-inline.js";

/**
 * Walk context passed through to image walkers.
 */
export interface WalkContext {
  options: LexicalToOdtOptions;
}

/**
 * Walk a top-level Lexical image decorator node and add it to the document.
 *
 * Image handling (confirmed from Proton's getImageRun.ts):
 * 1. If src is a base64 data URL — decode directly
 * 2. Otherwise call fetchImage(src) — skip with warning if absent or returns undefined
 * 3. width/height of 0 means 'inherit' — omit from ImageOptions (prerequisite change)
 * 4. If showCaption && caption has content — walk recursively, add centered paragraph below
 */
export async function walkImage(
  node: LexicalImageNode,
  doc: OdtDocument,
  context: WalkContext,
): Promise<void> {
  const imageBytes = await resolveImage(node.src, context.options.fetchImage);
  if (!imageBytes) return;

  const mimeType = detectMime(node.src, imageBytes);
  const width = pxToCm(node.width);
  const height = pxToCm(node.height);

  doc.addImage(imageBytes, { width, height, mimeType, alt: node.altText });

  // Caption — walk recursively, render as centered paragraph below the image
  if (node.showCaption && hasCaptionContent(node)) {
    const captionChildren = node.caption!.editorState!.root!.children!;
    doc.addParagraph(
      (p) => {
        for (const block of captionChildren) {
          const blockChildren = (block.children ?? []) as LexicalSerializedNode[];
          for (const inline of blockChildren) {
            walkInline(inline, p);
          }
        }
      },
      { align: "center" },
    );
  }
}

/**
 * Walk an inline Lexical image node inside a paragraph or cell.
 *
 * Same resolution logic as walkImage() but uses p.addImage() for inline placement.
 */
export async function walkInlineImage(
  node: LexicalImageNode,
  p: InlineContentBuilder,
  context: WalkContext,
): Promise<void> {
  const imageBytes = await resolveImage(node.src, context.options.fetchImage);
  if (!imageBytes) return;

  const mimeType = detectMime(node.src, imageBytes);
  const width = pxToCm(node.width);
  const height = pxToCm(node.height);

  p.addImage(imageBytes, { width, height, mimeType, alt: node.altText });
}

/**
 * Resolve an image src to raw bytes.
 *
 * Returns undefined (with a warning) if:
 * - src is not base64 and no fetchImage callback is provided
 * - src is not base64 and fetchImage returns undefined
 */
async function resolveImage(
  src: string,
  fetchImage: LexicalToOdtOptions["fetchImage"],
): Promise<Uint8Array | undefined> {
  if (isBase64Image(src)) {
    return base64ToUint8Array(src);
  }

  if (!fetchImage) {
    console.warn(
      `[odf-kit] lexicalToOdt: image "${truncateSrc(src)}" skipped — no fetchImage callback provided`,
    );
    return undefined;
  }

  const result = await fetchImage(src);
  if (!result) {
    console.warn(
      `[odf-kit] lexicalToOdt: fetchImage returned undefined for "${truncateSrc(src)}" — image skipped`,
    );
  }
  return result;
}

/**
 * Check whether an image node has non-empty caption content.
 */
function hasCaptionContent(node: LexicalImageNode): boolean {
  const children = node.caption?.editorState?.root?.children;
  return Array.isArray(children) && children.length > 0;
}

/**
 * Truncate a long src string for readable warning messages.
 * Data URLs can be very long — show only the first 60 characters.
 */
function truncateSrc(src: string): string {
  return src.length > 60 ? `${src.slice(0, 60)}…` : src;
}
