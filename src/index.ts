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

function getStagedFiles(cwd: string): string[] {
	const result = spawnSync("git", ["diff", "--cached", "--name-only"], {
		cwd,
		encoding: "utf-8",
		stdio: "pipe",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || "git diff --cached failed");
	}
	return result.stdout.trim().split("\n").filter(Boolean);
}

function stageFiles(cwd: string, files: string[]): void {
	const result = spawnSync("git", ["add", "--", ...files], {
		cwd,
		stdio: "pipe",
		encoding: "utf-8",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || "git add failed");
	}
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

function formatFilesSection(
	files: string[],
	label: string,
): string | undefined {
	if (!files.length) return undefined;
	return `${label}:\n  ${files.join("\n  ")}`;
}

function buildCommitSections(
	files: string[] | undefined,
	cwd: string,
): string[] {
	const sections: string[] = [];

	if (files?.length) {
		const existingFiles = getStagedFiles(cwd).filter((f) => !files.includes(f));
		const es = formatFilesSection(existingFiles, "Already staged");
		if (es) sections.push(es);

		const s = formatFilesSection(files, "Files to stage");
		if (s) sections.push(s);
	}

	return sections;
}

async function reviewCommit(
	ctx: ExtensionContext,
	cwd: string,
	initialMessage: string,
	files?: string[],
): Promise<{ message: string; approved: boolean }> {
	let message = initialMessage;
	const sections = buildCommitSections(files, cwd);
	const header = sections.length
		? `📝 Git Commit:\n\n${sections.join("\n\n")}\n\n`
		: `📝 Git Commit:\n\n`;

	for (;;) {
		const choice = await ctx.ui.select(`${header}${message}`, [
			"Approve",
			"Edit",
			"Cancel",
		]);

		if (choice === "Approve") return { message, approved: true };
		if (choice === "Cancel" || choice === undefined) {
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
			"Create a git commit. Optionally takes a list of files to stage; otherwise commits already-staged changes. Shows a review overlay where the user can approve, edit, or cancel before the commit executes.",
		parameters: Type.Object({
			message: Type.String({ description: "The commit message" }),
			files: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Files to stage and commit (if omitted, commits already-staged changes)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = resolve(ctx.cwd);

			if (!isGitRepo(cwd)) {
				throw new Error("Not inside a git repository.");
			}

			const files = params.files?.length ? params.files : undefined;

			if (!files && !hasStagedChanges(cwd)) {
				throw new Error(
					"Nothing staged for commit. Pass `files` to stage specific files, or stage changes first.",
				);
			}

			const result = await reviewCommit(ctx, cwd, params.message, files);

			if (!result.approved) {
				throw new Error("Commit cancelled by user.");
			}

			if (files) {
				stageFiles(cwd, files);
			}

			const output = runCommit(cwd, result.message);

			return {
				content: [{ type: "text" as const, text: output || "Commit created." }],
				details: { message: result.message, output, files },
			};
		},
	});
}
