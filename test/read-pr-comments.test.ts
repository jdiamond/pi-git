import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	type CommentNode,
	formatOutput,
	type QueryResult,
	type ReviewNode,
	type ThreadNode,
} from "../src/tools/read-pr-comments.ts";

const dir = fileURLToPath(new URL(".", import.meta.url));

const comment = (overrides: Partial<CommentNode> = {}): CommentNode => ({
	author: { login: "alice" },
	body: "Hello world",
	createdAt: "2026-01-15T10:30:00Z",
	url: "https://github.com/owner/repo/pull/1#issuecomment-100",
	databaseId: 100,
	...overrides,
});

const thread = (overrides: Partial<ThreadNode> = {}): ThreadNode => ({
	id: "PRRT_thread1",
	isResolved: false,
	isOutdated: false,
	path: "src/index.ts",
	line: 42,
	comments: {
		totalCount: 1,
		nodes: [
			{
				author: { login: "bob" },
				body: "This looks wrong",
				url: "https://github.com/owner/repo/pull/1#discussion_r1",
				createdAt: "2026-01-15T11:00:00Z",
				databaseId: 200,
				pullRequestReview: {
					url: "https://github.com/owner/repo/pull/1#pullrequestreview-1",
				},
			},
		],
	},
	...overrides,
});

const review = (overrides: Partial<ReviewNode> = {}): ReviewNode => ({
	author: { login: "carol" },
	body: "Looks good overall",
	createdAt: "2026-01-15T12:00:00Z",
	url: "https://github.com/owner/repo/pull/1#pullrequestreview-1",
	state: "APPROVED",
	...overrides,
});

describe("PR comments formatting", () => {
	it("formats output with conversation, reviews, and threads", (t) => {
		const data: QueryResult = {
			repository: {
				pullRequest: {
					title: "Fix the thing",
					url: "https://github.com/example/repo/pull/42",
					comments: {
						totalCount: 2,
						nodes: [
							comment({
								author: { login: "alice" },
								body: "I think we should do X",
								createdAt: "2026-01-10T09:00:00Z",
								databaseId: 1,
							}),
							comment({
								author: { login: "dave" },
								body: "Agreed, X makes sense",
								createdAt: "2026-01-10T10:00:00Z",
								databaseId: 2,
							}),
						],
					},
					reviewThreads: {
						totalCount: 3,
						nodes: [
							// Thread on review 1 with a reply
							thread({
								id: "PRRT_thread1",
								path: "src/app.ts",
								line: 15,
								comments: {
									totalCount: 2,
									nodes: [
										{
											author: { login: "carol" },
											body: "Should this be const?",
											url: "https://github.com/example/repo/pull/42#discussion_r1",
											createdAt: "2026-01-11T08:00:00Z",
											databaseId: 10,
											pullRequestReview: {
												url: "https://github.com/example/repo/pull/42#pullrequestreview-1",
											},
										},
										{
											author: { login: "alice" },
											body: "Good catch, fixed",
											url: "https://github.com/example/repo/pull/42#discussion_r2",
											createdAt: "2026-01-11T09:00:00Z",
											databaseId: 11,
											pullRequestReview: {
												url: "https://github.com/example/repo/pull/42#pullrequestreview-1",
											},
										},
									],
								},
							}),
							// Resolved thread on review 1
							thread({
								id: "PRRT_thread2",
								path: "src/util.ts",
								line: 99,
								isResolved: true,
								comments: {
									totalCount: 1,
									nodes: [
										{
											author: { login: "carol" },
											body: "This can be simplified",
											url: "https://github.com/example/repo/pull/42#discussion_r3",
											createdAt: "2026-01-11T08:05:00Z",
											databaseId: 12,
											pullRequestReview: {
												url: "https://github.com/example/repo/pull/42#pullrequestreview-1",
											},
										},
									],
								},
							}),
							// Outdated thread on review 2
							thread({
								id: "PRRT_thread3",
								path: "src/old.ts",
								line: 7,
								isOutdated: true,
								isResolved: true,
								comments: {
									totalCount: 1,
									nodes: [
										{
											author: { login: "bob" },
											body: "This file was deleted",
											url: "https://github.com/example/repo/pull/42#discussion_r4",
											createdAt: "2026-01-12T14:00:00Z",
											databaseId: 20,
											pullRequestReview: {
												url: "https://github.com/example/repo/pull/42#pullrequestreview-2",
											},
										},
									],
								},
							}),
						],
					},
					reviews: {
						totalCount: 3,
						nodes: [
							// Review with body and threads
							review({
								author: { login: "carol" },
								body: "A few things to address but overall looks good.",
								createdAt: "2026-01-11T08:00:00Z",
								url: "https://github.com/example/repo/pull/42#pullrequestreview-1",
								state: "CHANGES_REQUESTED",
							}),
							// Bare approval
							review({
								author: { login: "bob" },
								body: "",
								createdAt: "2026-01-12T14:00:00Z",
								url: "https://github.com/example/repo/pull/42#pullrequestreview-2",
								state: "APPROVED",
							}),
							// Review body without threads
							review({
								author: { login: "erin" },
								body: "Just a drive-by comment: nice work!",
								createdAt: "2026-01-13T16:00:00Z",
								url: "https://github.com/example/repo/pull/42#pullrequestreview-3",
								state: "APPROVED",
							}),
						],
					},
				},
			},
		};

		const output = formatOutput(data, "example", "repo", 42);
		t.assert.fileSnapshot(
			output,
			resolve(dir, "__snapshots__/read-pr-comments-output.md"),
			{
				serializers: [(v) => v as string],
			},
		);
	});
});
