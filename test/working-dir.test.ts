import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { resolveWorkingDir } from "../src/working-dir.ts";

describe("resolveWorkingDir", () => {
	it("defaults to the current working directory", () => {
		assert.equal(resolveWorkingDir("/repo/current"), resolve("/repo/current"));
	});

	it("resolves relative paths from the current working directory", () => {
		assert.equal(
			resolveWorkingDir("/repo/current", "../other"),
			resolve("/repo/other"),
		);
	});

	it("preserves absolute working directories", () => {
		assert.equal(
			resolveWorkingDir("/repo/current", "/tmp/other"),
			resolve("/tmp/other"),
		);
	});
});
