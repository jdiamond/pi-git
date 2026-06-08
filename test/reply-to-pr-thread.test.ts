import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "../src/tools/reply-to-pr-thread.ts";

describe("git_reply_to_pr_thread", () => {
	it("registers the tool with correct name", () => {
		const registered: Array<{ name: string }> = [];
		const pi = {
			registerTool(tool: { name: string }) {
				registered.push(tool);
			},
		};

		register(pi);

		assert.equal(registered.length, 1);
		assert.equal(registered[0]?.name, "git_reply_to_pr_thread");
	});
});
