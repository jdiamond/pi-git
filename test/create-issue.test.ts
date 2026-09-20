import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildIssueArgs,
	type CreateIssueParams,
	formatIssueSummary,
	parseIssueEditedText,
	parseIssueHeaderLine,
	register,
} from "../src/tools/create-issue.ts";

describe("buildIssueArgs", () => {
	it("builds minimal args with just a title", () => {
		const args = buildIssueArgs({ title: "Bug report" });
		assert.deepEqual(args, ["issue", "create", "--title", "Bug report"]);
	});

	it("includes body, assignees, labels, and milestone", () => {
		const args = buildIssueArgs({
			title: "Full issue",
			body: "Description here",
			assignees: ["@me", "user1"],
			labels: ["bug", "help wanted"],
			milestone: "v1.0",
		});

		assert.deepEqual(args, [
			"issue",
			"create",
			"--title",
			"Full issue",
			"--body",
			"Description here",
			"--assignee",
			"@me",
			"--assignee",
			"user1",
			"--label",
			"bug",
			"--label",
			"help wanted",
			"--milestone",
			"v1.0",
		]);
	});
});

describe("formatIssueSummary", () => {
	it("formats a minimal issue", () => {
		assert.equal(
			formatIssueSummary({ title: "Bug report" }),
			"Title: Bug report",
		);
	});

	it("formats optional fields before the body", () => {
		const result = formatIssueSummary({
			title: "Bug report",
			body: "Details",
			assignees: ["user1"],
			labels: ["bug"],
			milestone: "v1.0",
		});
		const lines = result.split("\n");
		const bodyIndex = lines.indexOf("Details");

		assert.ok(lines.includes("Milestone: v1.0"));
		assert.ok(lines.includes("Assignee: user1"));
		assert.ok(lines.includes("Label: bug"));
		assert.equal(lines[bodyIndex - 1], "");
	});
});

describe("parseIssueHeaderLine", () => {
	it("parses scalar and repeated fields", () => {
		const params: Partial<CreateIssueParams> = {};
		parseIssueHeaderLine("Title: Bug report", params);
		parseIssueHeaderLine("Milestone: v1.0", params);
		parseIssueHeaderLine("Assignee: user1", params);
		parseIssueHeaderLine("Label: bug", params);

		assert.equal(params.title, "Bug report");
		assert.equal(params.milestone, "v1.0");
		assert.deepEqual(params.assignees, ["user1"]);
		assert.deepEqual(params.labels, ["bug"]);
	});
});

describe("parseIssueEditedText", () => {
	it("round-trips a complete issue", () => {
		const original: CreateIssueParams = {
			title: "Bug report",
			body: "Details here.",
			assignees: ["user1"],
			labels: ["bug", "help wanted"],
			milestone: "v1.0",
		};
		const result: CreateIssueParams = { title: "" };

		parseIssueEditedText(result, formatIssueSummary(original));

		assert.deepEqual(result, original);
	});
});

describe("git_create_issue", () => {
	it("registers the tool with correct name", () => {
		const registered: Array<{ name: string }> = [];
		const pi = {
			registerTool(tool: { name: string }) {
				registered.push(tool);
			},
		};

		register(pi);

		assert.equal(registered.length, 1);
		assert.equal(registered[0]?.name, "git_create_issue");
	});
});
