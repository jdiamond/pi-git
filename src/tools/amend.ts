import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getStagedFiles, isGitRepo, stageFiles } from "../git.ts";

function getLastCommitMessage(cwd: string): string {
	const result = spawnSync("git", ["log", "-1", "--format=%B"], {
		cwd,
		encoding: "utf-8",
		stdio: "pipe",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || "git log failed");
	}
	return result.stdout.trim();
}

function getLastCommitFiles(cwd: string): string[] {
	const result = spawnSync(
		"git",
		["diff-tree", "--no-commit-id", "-r", "--name-only", "HEAD"],
		{
			cwd,
			encoding: "utf-8",
			stdio: "pipe",
		},
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || "git diff-tree failed");
	}
	return result.stdout.trim().split("\n").filter(Boolean);
}

function formatFilesSection(
	files: string[],
	label: string,
): string | undefined {
	if (!files.length) return undefined;
	return `${label}:\n  ${files.join("\n  ")}`;
}

function runAmend(cwd: string, message: string): string {
	const args = message
		? ["commit", "--amend", "-m", message]
		: ["commit", "--amend", "--no-edit"];

	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf-8",
		stdio: "pipe",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || "git commit --amend failed");
	}
	return result.stdout.trim();
}

interface AmendReviewState {
	cwd: string;
	lastMessage: string;
	commitFiles: string[];
	files: string[] | undefined;
	stagedFiles: string[];
	amendMessage: string;
}

function buildSummary(state: AmendReviewState): string {
	const sections: string[] = [];
	sections.push(`Old message: ${state.lastMessage}`);

	if (state.amendMessage !== state.lastMessage) {
		sections.push(`New message: ${state.amendMessage}`);
	}

	sections.push(`Files in commit:\n  ${state.commitFiles.join("\n  ")}`);

	if (state.files?.length) {
		const fs = formatFilesSection(state.files, "Files to stage");
		if (fs) sections.push(fs);

		const es = formatFilesSection(state.stagedFiles, "Already staged");
		if (es) sections.push(es);
	}

	return sections.join("\n\n");
}

async function reviewAmend(
	ctx: ExtensionContext,
	state: AmendReviewState,
): Promise<void> {
	for (;;) {
		const summary = buildSummary(state);
		const choice = await ctx.ui.select(`📝 Amend Commit:\n\n${summary}`, [
			"Approve",
			"Edit",
			"Cancel",
		]);

		if (choice === "Approve") return;
		if (choice === "Cancel" || choice === undefined) {
			throw new Error("Amend cancelled by user.");
		}

		const edited = await ctx.ui.editor(
			"Edit commit message:",
			state.amendMessage,
		);
		if (edited === undefined || edited.trim() === "") {
			throw new Error("Amend cancelled by user.");
		}

		state.amendMessage = edited;
	}
}

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_amend",
		label: "Git Amend",
		description:
			"Amend the most recent commit. Optionally provide a new message and/or files to stage. Shows a review overlay where the user can approve, edit, or cancel before the amend executes.",
		parameters: Type.Object({
			message: Type.Optional(
				Type.String({
					description:
						"New commit message (leave out to keep the current message)",
				}),
			),
			files: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Files to stage and amend into the commit (leave out to amend without new changes)",
				}),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { message?: string; files?: string[] },
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolve(ctx.cwd);

			if (!isGitRepo(cwd)) {
				throw new Error("Not inside a git repository.");
			}

			const files = params.files?.length ? params.files : undefined;

			const state: AmendReviewState = {
				cwd,
				lastMessage: getLastCommitMessage(cwd),
				commitFiles: getLastCommitFiles(cwd),
				files,
				stagedFiles: files ? getStagedFiles(cwd) : [],
				amendMessage: params.message ?? getLastCommitMessage(cwd),
			};

			await reviewAmend(ctx, state);

			if (state.files) {
				stageFiles(cwd, state.files);
			}

			const output = runAmend(cwd, state.amendMessage);

			return {
				content: [
					{
						type: "text" as const,
						text: output || "Commit amended.",
					},
				],
				details: {
					message: state.amendMessage,
					files: state.files,
					output,
				},
			};
		},
	});
}
