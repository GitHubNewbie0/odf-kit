// jest.config.js
//
// Jest configuration. Discovers tests under both tests/ (library tests) and
// docs/tests/ (page tests). For path resolution, this config sources from
// tsconfig.test.json's `paths` entry via ts-jest's pathsToModuleNameMapper
// helper — keeps the path mapping in a single source of truth (tsconfig)
// rather than duplicating it here.
//
// Today the only mapped path is `odf-kit/*` → `./src/*/index.ts`, which
// teaches Jest to resolve the page bundle's package-subpath imports (e.g.
// `odf-kit/odt`, `odf-kit/reader`) back to the library's own source for
// in-project testing. Adding a new subpath only requires updating tsconfig.

import { readFileSync } from "node:fs";
import { pathsToModuleNameMapper } from "ts-jest";

const tsconfig = JSON.parse(readFileSync("./tsconfig.test.json", "utf-8"));
const tsPaths = tsconfig.compilerOptions.paths ?? {};

/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/tests", "<rootDir>/docs/tests"],
  testMatch: ["**/*.test.ts", "**/*_test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // Strip .js extension from relative imports so ts-jest can resolve to
    // the .ts source. Matches the project's existing convention (library
    // tests import "../src/odt/index.js" etc.).
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // Map odf-kit/* package-subpath imports back to ./src/*/index.ts so
    // page code that uses the published-package import shape can be
    // tested without going through node_modules. Derived from tsconfig
    // compilerOptions.paths via ts-jest's helper; useESM: true makes the
    // mapping compatible with the .js-extension-on-imports convention.
    ...pathsToModuleNameMapper(tsPaths, { prefix: "<rootDir>/", useESM: true }),
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
};
