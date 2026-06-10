import { execFile } from "node:child_process";
import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isGitRepo } from "../git.ts";
import {
	resolveWorkingDir,
	type WorkingDirParam,
	workingDirParameter,
} from "../working-dir.ts";

interface RepoInfo {
	owner: string;
	repo: string;
}

function execGh(
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(
			"gh",
			args,
			{ cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					const msg =
						typeof stderr === "string" && stderr.trim()
							? stderr.trim()
							: `gh ${args[0]} failed`;
					reject(new Error(msg));
				} else {
					resolve({
						stdout: stdout as string,
						stderr: stderr as string,
					});
				}
			},
		);
	});
}

async function detectRepo(cwd: string): Promise<RepoInfo> {
	let stdout: string;
	try {
		const result = await execGh(
			["repo", "view", "--json", "nameWithOwner"],
			cwd,
		);
		stdout = result.stdout;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Could not detect GitHub repository. ${msg || "Pass `repo` or run inside a git repo with a GitHub remote."}`,
		);
	}

	let data: { nameWithOwner: string };
	try {
		data = JSON.parse(stdout);
	} catch {
		throw new Error("Failed to parse repo info from gh.");
	}

	const [owner, repo] = data.nameWithOwner.split("/");
	if (!owner || !repo) {
		throw new Error("Unexpected repo format from gh.");
	}

	return { owner, repo };
}

function parseRepo(repoStr: string): RepoInfo {
	const [owner, repo] = repoStr.split("/");
	if (!owner || !repo || repoStr.split("/").length !== 2) {
		throw new Error(
			'repo must be in "owner/name" format (e.g. "matter-js/matter.js").',
		);
	}
	return { owner, repo };
}

function getRepo(
	cwd: string,
	repoOverride?: string,
): RepoInfo | Promise<RepoInfo> {
	if (repoOverride) {
		return parseRepo(repoOverride);
	}
	return detectRepo(cwd);
}

const QUERY = `\
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      url
      comments(first: 100) {
        totalCount
        nodes {
          author { login }
          body
          createdAt
          url
          databaseId
        }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            totalCount
            nodes {
              author { login }
              body
              url
              createdAt
              databaseId
              pullRequestReview { url }
            }
          }
        }
      }
      reviews(first: 100) {
        totalCount
        nodes {
          author { login }
          body
          createdAt
          url
          state
        }
      }
    }
  }
}`;

export interface CommentNode {
	author: { login: string };
	body: string;
	createdAt: string;
	url: string;
	databaseId?: number;
	pullRequestReview?: { url: string };
}

export interface ThreadNode {
	id: string;
	isResolved: boolean;
	isOutdated: boolean;
	path: string;
	line: number | null;
	comments: {
		totalCount: number;
		nodes: CommentNode[];
	};
}

export interface ReviewNode {
	author: { login: string };
	body: string;
	createdAt: string;
	url: string;
	state: string;
}

export interface QueryResult {
	repository: {
		pullRequest: {
			title: string;
			url: string;
			comments: {
				totalCount: number;
				nodes: CommentNode[];
			};
			reviewThreads: {
				totalCount: number;
				nodes: ThreadNode[];
			};
			reviews: {
				totalCount: number;
				nodes: ReviewNode[];
			};
		};
	};
}

async function runGraphql(
	cwd: string,
	owner: string,
	repo: string,
	number: number,
): Promise<string> {
	const args = [
		"api",
		"graphql",
		"-f",
		`query=${QUERY}`,
		"-F",
		`owner=${owner}`,
		"-F",
		`repo=${repo}`,
		"-F",
		`number=${number}`,
	];

	try {
		const result = await execGh(args, cwd);
		return result.stdout;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || "gh api graphql failed");
	}
}

function formatDate(iso: string): string {
	return iso.slice(0, 10);
}

function indent(text: string, prefix: string): string {
	const trimmed = text.trimEnd();
	if (!trimmed) return "";
	return prefix + trimmed.replace(/\n/g, `\n${prefix}`);
}

export type TimelineEntry =
	| { type: "comment"; date: string; node: CommentNode }
	| { type: "review"; date: string; node: ReviewNode; threads: ThreadNode[] };

function formatTags(t: ThreadNode): string {
	const tags: string[] = [];
	if (t.isOutdated) tags.push("outdated");
	if (t.isResolved) tags.push("resolved");
	return tags.length ? ` · ${tags.join(" · ")}` : "";
}

function formatStateLabel(state: string): string {
	if (state === "APPROVED") return " · approved";
	if (state === "CHANGES_REQUESTED") return " · changes requested";
	return "";
}

function groupThreadsByReview(
	threads: ThreadNode[],
): Map<string, ThreadNode[]> {
	const map = new Map<string, ThreadNode[]>();
	for (const t of threads) {
		const firstComment = t.comments.nodes[0];
		const reviewUrl = firstComment?.pullRequestReview?.url;
		if (reviewUrl) {
			let list = map.get(reviewUrl);
			if (!list) {
				list = [];
				map.set(reviewUrl, list);
			}
			list.push(t);
		}
	}
	return map;
}

export function formatThreadLines(t: ThreadNode): string[] {
	const lines: string[] = [];
	const loc = t.line !== null ? `${t.path}:${t.line}` : t.path;
	lines.push(`### 🧵 ${t.id} · ${loc}${formatTags(t)}`);
	lines.push("");
	const comments = t.comments.nodes;
	for (let i = 0; i < comments.length; i++) {
		const c = comments[i];
		if (!c) continue;
		if (i > 0) {
			lines.push("");
		}
		lines.push(`#### 👤 ${c.author.login} · ${formatDate(c.createdAt)}`);
		lines.push("");
		lines.push(indent(c.body, "> "));
	}
	return lines;
}

export function formatComment(c: CommentNode): string[] {
	const lines: string[] = [];
	lines.push(`## 💬 ${c.author.login} · ${formatDate(c.createdAt)}`);
	if (c.body) {
		lines.push("");
		lines.push(indent(c.body, "> "));
	}
	return lines;
}

export function formatReview(r: ReviewNode, threads: ThreadNode[]): string[] {
	const lines: string[] = [];
	const threadNote =
		threads.length === 0
			? ""
			: ` · ${threads.length} thread${threads.length === 1 ? "" : "s"}`;
	lines.push(
		`## 🔍 ${r.author.login} · ${formatDate(r.createdAt)}${formatStateLabel(r.state)}${threadNote}`,
	);
	if (r.body) {
		lines.push("");
		lines.push(indent(r.body, "> "));
	}
	if (!r.body && threads.length === 0) {
		lines.push("");
		lines.push("_no comment_");
	}
	for (const t of threads) {
		lines.push("");
		for (const line of formatThreadLines(t)) {
			lines.push(line);
		}
	}
	return lines;
}

function formatEntryLines(entry: TimelineEntry): string[] {
	if (entry.type === "comment") {
		return formatComment(entry.node);
	}
	return formatReview(entry.node, entry.threads);
}

export function formatTimeline(
	comments: CommentNode[],
	reviews: ReviewNode[],
	threads: ThreadNode[],
): string[] {
	const threadsByReview = groupThreadsByReview(threads);

	const entries: TimelineEntry[] = [];
	for (const c of comments) {
		entries.push({ type: "comment", date: c.createdAt, node: c });
	}
	for (const r of reviews) {
		const reviewThreads = threadsByReview.get(r.url) ?? [];
		// Skip empty pending reviews (e.g. auto-created by thread replies)
		if (!r.body && reviewThreads.length === 0) continue;
		entries.push({
			type: "review",
			date: r.createdAt,
			node: r,
			threads: reviewThreads,
		});
	}
	entries.sort((a, b) => a.date.localeCompare(b.date));

	const lines: string[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		if (i > 0) {
			lines.push("");
		}
		for (const line of formatEntryLines(entry)) {
			lines.push(line);
		}
	}
	if (entries.length === 0) {
		lines.push("_none_");
	}
	return lines;
}

export function formatOutput(
	data: QueryResult,
	owner: string,
	repo: string,
	number: number,
): string {
	const pr = data.repository.pullRequest;
	const lines: string[] = [];

	const reviewThreadComments = pr.reviewThreads.nodes.reduce(
		(sum, t) => sum + t.comments.totalCount,
		0,
	);
	const total =
		pr.comments.totalCount +
		pr.reviews.nodes.filter((r) => r.body).length +
		reviewThreadComments;

	lines.push(`# PR #${number} · ${owner}/${repo}`);
	lines.push("");
	lines.push(pr.url);
	lines.push("");
	lines.push(`${total} comment${total === 1 ? "" : "s"}`);
	lines.push("");

	if (total === 0) {
		lines.push("_none_");
	} else {
		for (const line of formatTimeline(
			pr.comments.nodes,
			pr.reviews.nodes,
			pr.reviewThreads.nodes,
		)) {
			lines.push(line);
		}
	}

	return lines.join("\n").trimEnd();
}

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_pr_comments",
		label: "Read PR Comments",
		description:
			"Read comments on a GitHub pull request. Returns conversation comments, inline review threads, and review body summaries (including Copilot feedback).",
		parameters: Type.Object({
			number: Type.Number({
				description: "The pull request number.",
			}),
			repo: Type.Optional(
				Type.String({
					description:
						'Repository in "owner/name" format. Auto-detected from the current directory if omitted.',
				}),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: { number: number; repo?: string } & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const { owner, repo } = await getRepo(cwd, params.repo);

			let raw: string;
			try {
				raw = await runGraphql(cwd, owner, repo, params.number);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes("Could not resolve to a PullRequest")) {
					throw new Error(
						`PR #${params.number} not found in ${owner}/${repo}.`,
					);
				}
				throw err;
			}

			let parsed: { data: QueryResult };
			try {
				parsed = JSON.parse(raw) as { data: QueryResult };
			} catch {
				throw new Error("Failed to parse GraphQL response.");
			}

			const pr = parsed.data.repository.pullRequest;
			if (!pr) {
				throw new Error(`PR #${params.number} not found in ${owner}/${repo}.`);
			}

			const text = formatOutput(parsed.data, owner, repo, params.number);

			return {
				content: [{ type: "text" as const, text }],
				details: {
					repo: `${owner}/${repo}`,
					number: params.number,
					title: pr.title,
					url: pr.url,
					conversationCount: pr.comments.totalCount,
					threadCount: pr.reviewThreads.totalCount,
					reviewCount: pr.reviews.totalCount,
					workingDir: cwd,
					threads: pr.reviewThreads.nodes.map((t) => ({
						id: t.id,
						path: t.path,
						line: t.line,
						isResolved: t.isResolved,
						isOutdated: t.isOutdated,
						commentIds: t.comments.nodes
							.map((c) => c.databaseId)
							.filter((id): id is number => id !== undefined),
					})),
				},
			};
		},
	});
}
