import { describe, expect, it } from "vitest";
import { hashBufferSha256 } from "../src/utils/hash-file.js";

describe("deduplicacion por hash", () => {
  it("dos CSV identicos generan el mismo SHA-256", () => {
    const content = Buffer.from("a,b\n1,2\n", "utf8");
    expect(hashBufferSha256(content)).toBe(hashBufferSha256(content));
  });
});
