// docs/tests/disclosure.test.ts

import { disclosureMessage } from "../tools/disclosure.js";

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
