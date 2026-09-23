import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { register as registerAddIssueComment } from "../src/tools/add-issue-comment.ts";
import { register as registerAddPrComment } from "../src/tools/add-pr-comment.ts";
import { register as registerAmend } from "../src/tools/amend.ts";
import { register as registerCommit } from "../src/tools/commit.ts";
import { register as registerCreateIssue } from "../src/tools/create-issue.ts";
import { register as registerCreatePr } from "../src/tools/create-pr.ts";
import { register as registerReplyToPrThread } from "../src/tools/reply-to-pr-thread.ts";

type RegisteredTool = ToolDefinition & {
	execute: (...args: unknown[]) => Promise<unknown>;
};

function getTool(
	register: (pi: { registerTool: (tool: ToolDefinition) => void }) => void,
): RegisteredTool {
	let tool: ToolDefinition | undefined;
	register({
		registerTool(registered) {
			tool = registered;
		},
	});
	assert.ok(tool);
	return tool as RegisteredTool;
}

function createContext(): ExtensionContext {
	return {
		cwd: process.cwd(),
		ui: {
			select: async () => "Cancel",
			editor: async () => undefined,
		},
	} as unknown as ExtensionContext;
}

describe("review-gated tools", () => {
	it("returns terminating cancelled results when review is rejected", async () => {
		const ctx = createContext();
		const signal = new AbortController().signal;
		const cases = [
			{
				tool: getTool(registerCommit),
				params: { message: "test commit", files: ["README.md"] },
				text: "Commit cancelled by user.",
			},
			{
				tool: getTool(registerAmend),
				params: { message: "test amend" },
				text: "Amend cancelled by user.",
			},
			{
				tool: getTool(registerCreatePr),
				params: { title: "test pr" },
				text: "PR creation cancelled by user.",
			},
			{
				tool: getTool(registerCreateIssue),
				params: { title: "test issue" },
				text: "Issue creation cancelled by user.",
			},
			{
				tool: getTool(registerAddPrComment),
				params: { number: 1, body: "test comment" },
				text: "Comment cancelled by user.",
			},
			{
				tool: getTool(registerAddIssueComment),
				params: { number: 1, body: "test comment" },
				text: "Comment cancelled by user.",
			},
			{
				tool: getTool(registerReplyToPrThread),
				params: { threadId: "thread-id", body: "test reply" },
				text: "Reply cancelled by user.",
			},
		] as const;

		for (const testCase of cases) {
			const result = (await testCase.tool.execute(
				"tool-call-id",
				testCase.params,
				signal,
				undefined,
				ctx,
			)) as {
				content: Array<{ type: string; text: string }>;
				details: { cancelled?: boolean; workingDir?: string };
				terminate?: boolean;
			};

			assert.equal(result.content[0]?.text, testCase.text);
			assert.equal(result.details.cancelled, true);
			assert.equal(result.details.workingDir, process.cwd());
			assert.equal(result.terminate, true);
		}
	});
});
