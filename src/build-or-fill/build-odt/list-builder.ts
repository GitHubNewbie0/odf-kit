import type { TextRun, ListItemData } from "./types.js";
import { ParagraphBuilder } from "./paragraph-builder.js";

/**
 * Builder for list content with items and nesting.
 *
 * Passed to the callback form of `addList()`.
 * `addNested()` attaches a sub-list to the most recently added item.
 *
 * @example
 * doc.addList((l) => {
 *   l.addItem("First item");
 *   l.addItem("Second item");
 *   l.addItem((p) => {
 *     p.addText("Formatted ", { bold: true });
 *     p.addText("item");
 *   });
 * });
 *
 * @example
 * // Nesting
 * doc.addList((l) => {
 *   l.addItem("Parent");
 *   l.addNested((sub) => {
 *     sub.addItem("Child 1");
 *     sub.addItem("Child 2");
 *   });
 * });
 */
export class ListBuilder {
  /** @internal */
  readonly items: ListItemData[] = [];

  /**
   * Add an item to the list.
   *
   * Pass a string for plain text, or a callback to build formatted content.
   *
   * @param content - A string or a callback receiving a {@link ParagraphBuilder}.
   * @returns This builder, for chaining.
   */
  addItem(content: string | ((builder: ParagraphBuilder) => void)): this {
    const runs = buildItemRuns(content);
    this.items.push({ runs });
    return this;
  }

  /**
   * Attach a nested sub-list to the most recently added item.
   *
   * @param callback - A callback receiving a new {@link ListBuilder} for the sub-list.
   * @returns This builder, for chaining.
   *
   * @example
   * l.addItem("Parent item");
   * l.addNested((sub) => {
   *   sub.addItem("Child 1");
   *   sub.addItem("Child 2");
   * });
   */
  addNested(callback: (builder: ListBuilder) => void): this {
    if (this.items.length === 0) {
      throw new Error("addNested() requires at least one item added first");
    }

    const subBuilder = new ListBuilder();
    callback(subBuilder);

    const lastItem = this.items[this.items.length - 1];
    lastItem.nested = { items: subBuilder.items };

    return this;
  }
}

/**
 * Convert a string or builder callback into text runs for a list item.
 */
function buildItemRuns(content: string | ((builder: ParagraphBuilder) => void)): TextRun[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  const builder = new ParagraphBuilder();
  content(builder);
  return builder.runs;
}
