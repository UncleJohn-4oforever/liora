import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import type { MemoryStoreData } from "../../types/memory";
import { assembleChatContext } from "./budgetAssemble";

const emptyStore: MemoryStoreData = {
  version: 1,
  memories: [],
  episodes: [],
  chunks: [],
  cursors: [],
  recentUpdates: [],
  scopeMigrated: true,
  scopeVersion: 2,
};

describe("context budget assembly", () => {
  it("keeps a very long chat inside the prompt budget", () => {
    const messages: Message[] = Array.from({ length: 240 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `Turn ${index}: ${"long conversation detail ".repeat(30)}`,
      createdAt: index,
    }));

    const result = assembleChatContext({
      messages,
      sessionId: "session-1",
      store: emptyStore,
      locale: "en",
      answerLength: "normal",
      memoryEnabled: true,
      showThinking: true,
      contextSize: 4096,
    });

    expect(result.budget.estimatedPrompt).toBeLessThanOrEqual(
      result.budget.limit - result.budget.reservedGen,
    );
    expect(result.budget.hotCount).toBeLessThan(messages.length);
    expect(result.budget.coldCount).toBeGreaterThan(0);
    expect(result.hotMessages[result.hotMessages.length - 1]?.id).toBe(
      messages[messages.length - 1]?.id,
    );
  });
});
