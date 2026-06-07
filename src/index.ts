import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function isGitRepo(cwd: string): boolean {
	const result = spawnSync("git", ["rev-parse", "--git-dir"], {
		cwd,
		stdio: "ignore",
	});
	return result.status === 0;
}

function hasStagedChanges(cwd: string): boolean {
	const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
		cwd,
		stdio: "ignore",
	});
	return result.status !== 0;
}

function runCommit(cwd: string, message: string): string {
	const result = spawnSync("git", ["commit", "-m", message], {
		cwd,
		encoding: "utf-8",
		stdio: "pipe",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || "git commit failed");
	}
	return result.stdout.trim();
}

async function reviewCommit(
	ctx: ExtensionContext,
	initialMessage: string,
): Promise<{ message: string; approved: boolean }> {
	let message = initialMessage;

	for (;;) {
		const choice = await ctx.ui.select(`Commit:\n${message}`, [
			"approve",
			"edit",
			"cancel",
		]);

		if (choice === "approve") return { message, approved: true };
		if (choice === "cancel" || choice === undefined) {
			return { message, approved: false };
		}

		// edit
		const edited = await ctx.ui.editor("Edit commit message:", message);
		if (edited === undefined || edited.trim() === "") {
			return { message, approved: false };
		}
		message = edited;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "git_commit",
		label: "Git Commit",
		description:
			"Create a git commit with the currently staged changes. Shows a review overlay showing the commit message — the user can approve, edit, or cancel before the commit executes.",
		parameters: Type.Object({
			message: Type.String({ description: "The commit message" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = resolve(ctx.cwd);

			if (!isGitRepo(cwd)) {
				throw new Error("Not inside a git repository.");
			}

			if (!hasStagedChanges(cwd)) {
				throw new Error(
					"Nothing staged for commit. Use `git add ...` to stage files first.",
				);
			}

			const result = await reviewCommit(ctx, params.message);

			if (!result.approved) {
				throw new Error("Commit cancelled by user.");
			}

			const output = runCommit(cwd, result.message);

			return {
				content: [{ type: "text" as const, text: output || "Commit created." }],
				details: { message: result.message, output },
			};
		},
	});
}
