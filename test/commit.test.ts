import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildCommitSections,
	formatFilesSection,
} from "../src/tools/commit.ts";

describe("formatFilesSection", () => {
	it("returns undefined for empty files", () => {
		assert.equal(formatFilesSection([], "Label"), undefined);
	});

	it("formats single file", () => {
		const result = formatFilesSection(["src/index.ts"], "Files");
		assert.equal(result, "Files:\n  src/index.ts");
	});

	it("formats multiple files", () => {
		const result = formatFilesSection(
			["src/index.ts", "src/git.ts"],
			"Files to stage",
		);
		assert.equal(result, "Files to stage:\n  src/index.ts\n  src/git.ts");
	});
});

describe("buildCommitSections", () => {
	it("returns empty array when no files provided", () => {
		const result = buildCommitSections(undefined, []);
		assert.deepEqual(result, []);
	});

	it("shows both already staged files and files to stage", () => {
		const result = buildCommitSections(
			["src/new.ts"],
			["src/existing.ts", "src/new.ts"],
		);
		assert.ok(result.some((s) => s.includes("Already staged")));
		assert.ok(result.some((s) => s.includes("src/existing.ts")));
		assert.ok(result.some((s) => s.includes("Files to stage")));
		assert.ok(result.some((s) => s.includes("src/new.ts")));
	});

	it("shows only files to stage when nothing already staged", () => {
		const result = buildCommitSections(["src/new.ts"], []);
		assert.equal(result.length, 1);
		assert.ok(result[0]?.includes("Files to stage"));
		assert.ok(result[0]?.includes("src/new.ts"));
	});

	it("shows already staged files not in the files param", () => {
		const result = buildCommitSections(
			["src/a.ts", "src/b.ts"],
			["src/a.ts", "src/b.ts", "src/c.ts"],
		);
		// Two sections: Already staged (src/a.ts, src/b.ts, src/c.ts) and Files to stage (src/a.ts, src/b.ts)
		assert.equal(result.length, 2);
		assert.ok(result[0]?.includes("Already staged"));
		assert.ok(result[0]?.includes("src/a.ts"));
		assert.ok(result[0]?.includes("src/c.ts"));
		assert.ok(result[1]?.includes("Files to stage"));
		assert.ok(result[1]?.includes("src/a.ts"));
	});
});
