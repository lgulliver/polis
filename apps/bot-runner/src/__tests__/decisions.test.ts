import { describe, expect, it } from "vitest";
import { decideFromChat, validateAction } from "../decisions.js";

const mockAgent = {
  name: "Ada",
  username: "Ada",
  archetype: "cautious cooperative village-builder",
  persona: "steady and civic-minded",
  description: "Builds slowly, coordinates often, avoids chaos."
};

describe("decideFromChat", () => {
  it("maps a follow command to a validated action", () => {
    const action = decideFromChat({
      botUsername: "Ada",
      sender: "Steve",
      message: "Ada follow me",
      agent: mockAgent
    });

    expect(validateAction(action)).toEqual({
      kind: "follow_player",
      targetPlayer: "Steve"
    });
  });

  it("ignores unrelated chat", () => {
    const action = decideFromChat({
      botUsername: "Ada",
      sender: "Steve",
      message: "hello there",
      agent: mockAgent
    });

    expect(action).toEqual({ kind: "noop" });
  });

  it("rejects malformed actions", () => {
    expect(() =>
      validateAction({
        kind: "follow_player"
      })
    ).toThrow();
  });
});
