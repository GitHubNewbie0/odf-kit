// src/core/css/index.ts
//
// Barrel for the CSS engine in core (canon MR-4: an engine is its own module
// with its own barrel). Internal only: never re-exported from core/index.ts,
// never added to package.json exports (T4: DS1-5).

export { checkDeclarationValue } from "./declaration-value.js";
export type { DeclarationValueCheck, DeclarationValueRule } from "./declaration-value.js";
