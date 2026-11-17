// tests/types/css-tree.d.ts
//
// A local declaration of the part of css-tree 3.x (a devDependency) that
// tests/core/style-attr.property.test.ts uses, and nothing else. css-tree
// ships no TypeScript types; @types/css-tree is deliberately not added
// (T4: DS1-16). The test uses css-tree for its parse and its tokenizer only;
// its lexer (value checking) is never called (T4: DS1-12).

declare module "css-tree" {
  /** Source offsets of a node, present when parsed with `positions: true`. */
  export interface CssLocation {
    start: { offset: number };
    end: { offset: number };
  }

  /** A child of a declaration list: a `Declaration`, or a `Raw` item. */
  export interface CssNode {
    type: string;
    loc: CssLocation;
    /** `true` for `!important`, else the ident text as written (e.g. `"IMPORTANT"`). */
    important?: boolean | string;
  }

  export interface CssList {
    forEach(callback: (node: CssNode) => void): void;
  }

  export function parse(
    text: string,
    options: {
      context: "declarationList";
      positions: true;
      parseValue: boolean;
      onParseError?: (error: Error) => void;
    },
  ): { children: CssList };

  /** Calls `onToken` with each token's type and source range [start, end). */
  export function tokenize(
    source: string,
    onToken: (type: number, start: number, end: number) => void,
  ): void;

  export const tokenTypes: {
    Function: number;
    BadString: number;
    BadUrl: number;
    Semicolon: number;
    LeftSquareBracket: number;
    RightSquareBracket: number;
    LeftParenthesis: number;
    RightParenthesis: number;
    LeftCurlyBracket: number;
    RightCurlyBracket: number;
  };
}
