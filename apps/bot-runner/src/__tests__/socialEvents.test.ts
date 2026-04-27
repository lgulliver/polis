import { describe, expect, it } from "vitest";
import { validateSocialEvent } from "../social/events.js";

describe("social event validation", () => {
  it("validates the shelter proposal event shape", () => {
    expect(
      validateSocialEvent("shelter_proposed", {
        username: "Ada",
        agent: "Ada",
        role: "steward",
        style: "cautious",
        anchor: "spawn",
        message: "propose shared shelter near spawn. safety before wandering."
      })
    ).toEqual({
      username: "Ada",
      agent: "Ada",
      role: "steward",
      style: "cautious",
      anchor: "spawn",
      message: "propose shared shelter near spawn. safety before wandering."
    });
  });
});
