import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "../src/tools/add-pr-comment.ts";

describe("git_add_pr_comment", () => {
	it("registers the tool with correct name", () => {
		const registered: Array<{ name: string }> = [];
		const pi = {
			registerTool(tool: { name: string }) {
				registered.push(tool);
			},
		};

		register(pi);

		assert.equal(registered.length, 1);
		assert.equal(registered[0]?.name, "git_add_pr_comment");
	});
});
