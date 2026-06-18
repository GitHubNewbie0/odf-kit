// docs/tests/disclosure.test.ts

import { disclosureMessage } from "../tools/disclosure.js";
import { disclosureMessage, DISCLOSURE_INPUT_PREVIEW } from "../tools/disclosure.js";

describe("DISCLOSURE_INPUT_PREVIEW", () => {
  it("is the approximate-preview note without the saved-file clause", () => {
    expect(DISCLOSURE_INPUT_PREVIEW).toBe("Preview is rendered approximately.");
  });
});

describe("disclosureMessage", () => {
  it("returns the fresh honest-preview note when the output is in sync", () => {
    expect(disclosureMessage(false)).toBe(
      "Preview is rendered approximately. The saved file is exact.",
    );
  });

  it("returns the stale reminder when the output is stale", () => {
    expect(disclosureMessage(true)).toBe("Stale — click Generate to refresh.");
  });
});
