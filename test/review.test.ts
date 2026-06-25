import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withReviewLock } from "../src/review.ts";

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => {};
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("withReviewLock", () => {
	it("serializes concurrent review prompts", async () => {
		const firstCanFinish = deferred();
		const events: string[] = [];

		const first = withReviewLock(async () => {
			events.push("first:start");
			await firstCanFinish.promise;
			events.push("first:end");
		});

		const second = withReviewLock(async () => {
			events.push("second:start");
		});

		await Promise.resolve();
		await Promise.resolve();

		assert.deepEqual(events, ["first:start"]);

		firstCanFinish.resolve();
		await Promise.all([first, second]);

		assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
	});

	it("releases the queue when a review throws", async () => {
		const events: string[] = [];

		const first = withReviewLock(async () => {
			events.push("first:start");
			throw new Error("boom");
		});

		const second = withReviewLock(async () => {
			events.push("second:start");
		});

		await assert.rejects(first, /boom/);
		await second;

		assert.deepEqual(events, ["first:start", "second:start"]);
	});
});
