import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildPrArgs,
	type CreatePrParams,
	formatPrSummary,
	parsePrEditedText,
	parsePrHeaderLine,
	parsePrHeaders,
} from "../src/tools/create-pr.ts";

describe("buildPrArgs", () => {
	it("builds minimal args with just a title", () => {
		const args = buildPrArgs({ title: "Fix the bug" });
		assert.deepEqual(args, ["pr", "create", "--title", "Fix the bug"]);
	});

	it("includes body when provided", () => {
		const args = buildPrArgs({
			title: "Fix",
			body: "This fixes the bug.",
		});
		assert.deepEqual(args, [
			"pr",
			"create",
			"--title",
			"Fix",
			"--body",
			"This fixes the bug.",
		]);
	});

	it("includes base when provided", () => {
		const args = buildPrArgs({ title: "Fix", base: "develop" });
		assert.ok(args.includes("--base"));
		assert.ok(args.includes("develop"));
	});

	it("includes draft flag", () => {
		const args = buildPrArgs({ title: "Fix", draft: true });
		assert.ok(args.includes("--draft"));
	});

	it("does not include draft flag when false", () => {
		const args = buildPrArgs({ title: "Fix", draft: false });
		assert.ok(!args.includes("--draft"));
	});

	it("includes dry-run flag", () => {
		const args = buildPrArgs({ title: "Fix", dryRun: true });
		assert.ok(args.includes("--dry-run"));
	});

	it("includes reviewers", () => {
		const args = buildPrArgs({
			title: "Fix",
			reviewers: ["user1", "user2"],
		});
		const reviewerFlags = args.filter((a) => a === "--reviewer");
		assert.equal(reviewerFlags.length, 2);
		assert.ok(args.includes("user1"));
		assert.ok(args.includes("user2"));
	});

	it("handles all params combined", () => {
		const args = buildPrArgs({
			title: "Full PR",
			body: "Description here",
			base: "main",
			draft: true,
			dryRun: true,
			reviewers: ["@copilot"],
		});
		assert.ok(args.includes("--title"));
		assert.ok(args.includes("Full PR"));
		assert.ok(args.includes("--body"));
		assert.ok(args.includes("Description here"));
		assert.ok(args.includes("--base"));
		assert.ok(args.includes("main"));
		assert.ok(args.includes("--draft"));
		assert.ok(args.includes("--dry-run"));
		assert.ok(args.includes("--reviewer"));
		assert.ok(args.includes("@copilot"));
	});
});

describe("formatPrSummary", () => {
	it("formats minimal params with just a title", () => {
		const result = formatPrSummary({ title: "Fix" });
		assert.equal(result, "Title: Fix");
	});

	it("includes base line", () => {
		const result = formatPrSummary({ title: "Fix", base: "develop" });
		assert.ok(result.includes("Base: develop"));
	});

	it("includes draft line", () => {
		const result = formatPrSummary({ title: "Fix", draft: true });
		assert.ok(result.includes("Draft: yes"));
	});

	it("includes dry run line", () => {
		const result = formatPrSummary({ title: "Fix", dryRun: true });
		assert.ok(result.includes("Dry run: yes"));
	});

	it("includes reviewers on separate lines", () => {
		const result = formatPrSummary({
			title: "Fix",
			reviewers: ["user1", "user2"],
		});
		assert.ok(result.includes("Reviewer: user1"));
		assert.ok(result.includes("Reviewer: user2"));
	});

	it("places body after blank line (HTTP style)", () => {
		const result = formatPrSummary({
			title: "Fix",
			body: "The body text.",
		});
		const lines = result.split("\n");
		const bodyIndex = lines.indexOf("The body text.");
		assert.ok(bodyIndex > 0);
		assert.equal(lines[bodyIndex - 1], ""); // blank line before body
	});

	it("orders headers before body", () => {
		const result = formatPrSummary({
			title: "Fix",
			body: "Body",
			base: "main",
			draft: true,
		});
		const lines = result.split("\n");
		const titleIndex = lines.findIndex((l) => l.startsWith("Title:"));
		const baseIndex = lines.findIndex((l) => l.startsWith("Base:"));
		const draftIndex = lines.findIndex((l) => l.startsWith("Draft:"));
		const bodyIndex = lines.indexOf("Body");

		assert.ok(titleIndex < baseIndex);
		assert.ok(baseIndex < draftIndex);
		assert.ok(draftIndex < bodyIndex);
	});
});

describe("parsePrHeaderLine", () => {
	it("parses title", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Title: My PR", params);
		assert.equal(params.title, "My PR");
	});

	it("parses base", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Base: develop", params);
		assert.equal(params.base, "develop");
	});

	it("parses draft: yes", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Draft: yes", params);
		assert.equal(params.draft, true);
	});

	it("parses draft: no", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Draft: no", params);
		assert.equal(params.draft, false);
	});

	it("parses dry run: yes", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Dry run: yes", params);
		assert.equal(params.dryRun, true);
	});

	it("parses a single reviewer", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Reviewer: user1", params);
		assert.deepEqual(params.reviewers, ["user1"]);
	});

	it("accumulates multiple reviewer lines", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Reviewer: @copilot", params);
		parsePrHeaderLine("Reviewer: user1", params);
		assert.deepEqual(params.reviewers, ["@copilot", "user1"]);
	});

	it("skips empty reviewer value", () => {
		const params: Partial<CreatePrParams> = {};
		parsePrHeaderLine("Reviewer: ", params);
		assert.equal(params.reviewers, undefined);
	});
});

describe("parsePrHeaders", () => {
	it("parses headers until blank line", () => {
		const { headerEnd, params } = parsePrHeaders([
			"Title: My PR",
			"Base: main",
			"",
			"Body text here",
		]);
		assert.equal(headerEnd, 2);
		assert.equal(params.title, "My PR");
		assert.equal(params.base, "main");
	});

	it("treats all lines as headers when no blank line", () => {
		const { headerEnd, params } = parsePrHeaders([
			"Title: My PR",
			"Draft: yes",
		]);
		assert.equal(headerEnd, 2);
		assert.equal(params.title, "My PR");
		assert.equal(params.draft, true);
	});

	it("returns empty params for empty input", () => {
		const { headerEnd, params } = parsePrHeaders([]);
		assert.equal(headerEnd, 0);
		assert.deepEqual(params, {});
	});
});

describe("parsePrEditedText (round-trip)", () => {
	it("round-trips a complete PR spec", () => {
		const original: CreatePrParams = {
			title: "My PR",
			body: "Description here.",
			base: "main",
			draft: true,
			dryRun: true,
			reviewers: ["@copilot", "user1"],
		};

		const formatted = formatPrSummary(original);
		const result: CreatePrParams = {
			title: "",
		};
		parsePrEditedText(result, formatted);

		assert.equal(result.title, original.title);
		assert.equal(result.body, original.body);
		assert.equal(result.base, original.base);
		assert.equal(result.draft, original.draft);
		assert.equal(result.dryRun, original.dryRun);
		assert.deepEqual(result.reviewers, original.reviewers);
	});

	it("round-trips minimal params", () => {
		const original: CreatePrParams = { title: "Minimal" };

		const formatted = formatPrSummary(original);
		const result: CreatePrParams = {
			title: "",
		};
		parsePrEditedText(result, formatted);

		assert.equal(result.title, "Minimal");
		assert.equal(result.body, undefined);
		assert.equal(result.base, undefined);
		assert.equal(result.draft, undefined);
		assert.equal(result.dryRun, undefined);
		assert.equal(result.reviewers, undefined);
	});

	it("round-trips multi-line body", () => {
		const original: CreatePrParams = {
			title: "Multi-line body",
			body: "Line one\n\nLine two\nLine three",
		};

		const formatted = formatPrSummary(original);
		const result: CreatePrParams = {
			title: "",
		};
		parsePrEditedText(result, formatted);

		assert.equal(result.body, original.body);
	});

	it("updates title when edited", () => {
		const result: CreatePrParams = {
			title: "Original title",
			body: "Body text",
		};
		parsePrEditedText(result, "Title: New title\n\nNew body");
		assert.equal(result.title, "New title");
		assert.equal(result.body, "New body");
	});
});
