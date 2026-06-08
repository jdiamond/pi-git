import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isGitRepo } from "../git.ts";

const REPLY_MUTATION = `\
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment { url body }
  }
}`;

const RESOLVE_MUTATION = `\
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}`;

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

async function runGraphql(
	cwd: string,
	query: string,
	variables: Record<string, string>,
): Promise<string> {
	const args = ["api", "graphql", "-f", `query=${query}`];
	for (const [key, value] of Object.entries(variables)) {
		args.push("-F", `${key}=${value}`);
	}

	try {
		const result = await execGh(args, cwd);
		return result.stdout;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || "gh api graphql failed");
	}
}

async function reviewReply(
	ctx: ExtensionContext,
	body: string,
): Promise<{ body: string; approved: boolean; resolve: boolean }> {
	let currentBody = body;

	for (;;) {
		const choice = await ctx.ui.select(
			`📝 Reply to PR thread:\n\n${currentBody}`,
			["Approve & resolve", "Approve", "Edit", "Cancel"],
		);

		if (choice === "Approve & resolve") {
			return { body: currentBody, approved: true, resolve: true };
		}
		if (choice === "Approve") {
			return { body: currentBody, approved: true, resolve: false };
		}
		if (choice === "Cancel" || choice === undefined) {
			return { body: currentBody, approved: false, resolve: false };
		}

		const edited = await ctx.ui.editor("Edit reply:", currentBody);
		if (edited === undefined || edited.trim() === "") {
			return { body: currentBody, approved: false, resolve: false };
		}
		currentBody = edited;
	}
}

async function executeReply(
	cwd: string,
	threadId: string,
	result: { body: string; resolve: boolean },
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
}> {
	let replyOutput: string;
	try {
		replyOutput = await runGraphql(cwd, REPLY_MUTATION, {
			threadId,
			body: result.body,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to post reply: ${msg}`);
	}

	let resolveOutput: string | undefined;
	if (result.resolve) {
		try {
			resolveOutput = await runGraphql(cwd, RESOLVE_MUTATION, { threadId });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`Reply posted but failed to resolve thread: ${msg}`);
		}
	}

	let replyData: { url?: string; body?: string } = {};
	try {
		const parsed = JSON.parse(replyOutput);
		replyData = parsed.data?.addPullRequestReviewThreadReply?.comment ?? {};
	} catch {
		// ignore parse failures
	}

	const text = resolveOutput
		? `Reply posted. Thread resolved.\n\n${replyData.url ?? ""}`
		: `Reply posted.\n\n${replyData.url ?? ""}`;

	return {
		content: [{ type: "text" as const, text: text.trim() }],
		details: {
			threadId,
			body: result.body,
			resolved: result.resolve,
			replyUrl: replyData.url,
		},
	};
}

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_reply_to_pr_thread",
		label: "Reply to PR Thread",
		description:
			"Reply to an inline review thread on a GitHub pull request. After the body review step, optionally resolves the thread in the same turn. Thread IDs come from git_pr_comments output.",
		parameters: Type.Object({
			threadId: Type.String({
				description:
					"The review thread node ID (e.g. PRRT_kwDO...). Get this from git_pr_comments details.",
			}),
			body: Type.String({
				description: "The reply body text.",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { threadId: string; body: string },
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolve(ctx.cwd);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const result = await reviewReply(ctx, params.body);

			if (!result.approved) {
				throw new Error("Reply cancelled by user.");
			}

			return executeReply(cwd, params.threadId, result);
		},
	});
}
