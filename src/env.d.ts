/**
 * Universal platform APIs used by odf-kit.
 *
 * These are available in all modern JavaScript environments:
 * Node.js 18+, browsers, Deno, Bun, Cloudflare Workers.
 *
 * Declared here because tsconfig.json sets "types": [] to prevent
 * Node-specific APIs (Buffer, process, fs, etc.) from leaking into
 * library code. This guarantees odf-kit works in any environment.
 */
declare class TextEncoder {
  constructor();
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string;
}
declare const console: {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
};
declare function atob(data: string): string;
