import { describe, expect, it } from "vitest";
import { decideFromChat, validateAction } from "../decisions.js";

const mockAgent = {
  name: "Ada",
  username: "Ada",
  role: "steward",
  archetype: "cautious cooperative village-builder",
  persona: "steady and civic-minded",
  description: "Builds slowly, coordinates often, avoids chaos.",
  language: {
    style: "cautious"
  }
};

describe("decideFromChat", () => {
  it("maps a collect wood command to a validated action", () => {
    const action = decideFromChat({
      botUsername: "Ada",
      sender: "Steve",
      message: "Ada collect wood",
      agent: mockAgent
    });

    expect(validateAction(action)).toEqual({
      kind: "collect_wood"
    });
  });

  it("maps a create chest command to a validated action", () => {
    const action = decideFromChat({
      botUsername: "Ada",
      sender: "Steve",
      message: "Ada create chest",
      agent: mockAgent
    });

    expect(validateAction(action)).toEqual({
      kind: "create_chest"
    });
  });

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

  it("recognizes all social commands", () => {
    expect(
      validateAction(
        decideFromChat({
          botUsername: "Ada",
          sender: "Steve",
          message: "Ada greet",
          agent: mockAgent
        })
      )
    ).toEqual({ kind: "greet" });

    expect(
      validateAction(
        decideFromChat({
          botUsername: "Ada",
          sender: "Steve",
          message: "Ada ask help",
          agent: mockAgent
        })
      )
    ).toEqual({ kind: "ask_help" });

    expect(
      validateAction(
        decideFromChat({
          botUsername: "Ada",
          sender: "Steve",
          message: "Ada thank Hopper",
          agent: mockAgent
        })
      )
    ).toEqual({ kind: "thank_player", targetPlayer: "Hopper" });

    expect(
      validateAction(
        decideFromChat({
          botUsername: "Ada",
          sender: "Steve",
          message: "Ada propose shelter",
          agent: mockAgent
        })
      )
    ).toEqual({ kind: "propose_shelter" });

    expect(
      validateAction(
        decideFromChat({
          botUsername: "Ada",
          sender: "Steve",
          message: "Ada report status",
          agent: mockAgent
        })
      )
    ).toEqual({ kind: "report_status" });
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
