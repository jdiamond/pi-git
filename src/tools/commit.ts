import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	getStagedFiles,
	hasStagedChanges,
	isGitRepo,
	runCommit,
	stageFiles,
} from "../git.ts";
import { reviewCommit } from "../review.ts";
import {
	resolveWorkingDir,
	type WorkingDirParam,
	workingDirParameter,
} from "../working-dir.ts";

export function formatFilesSection(
	files: string[],
	label: string,
): string | undefined {
	if (!files.length) return undefined;
	return `${label}:\n  ${files.join("\n  ")}`;
}

export function buildCommitSections(
	files: string[] | undefined,
	stagedFiles: string[],
): string[] {
	const sections: string[] = [];

	if (files?.length) {
		const es = formatFilesSection(stagedFiles, "Already staged");
		if (es) sections.push(es);

		const s = formatFilesSection(files, "Files to stage");
		if (s) sections.push(s);
	}

	return sections;
}

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_commit",
		label: "Git Commit",
		description:
			"Create a git commit. Optionally takes a list of files to stage; otherwise commits already-staged changes. Shows a review prompt where the user can accept, edit, or cancel before the commit executes.",
		parameters: Type.Object({
			message: Type.String({ description: "The commit message" }),
			files: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Files to stage and commit (if omitted, commits already-staged changes)",
				}),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: { message: string; files?: string[] } & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const files = params.files?.length ? params.files : undefined;

			if (!files && !(await hasStagedChanges(cwd))) {
				throw new Error(
					"Nothing staged for commit. Pass `files` to stage specific files, or stage changes first.",
				);
			}

			const stagedFiles = files ? await getStagedFiles(cwd) : [];

			const result = await reviewCommit(ctx, cwd, params.message, () =>
				buildCommitSections(files, stagedFiles),
			);

			if (!result.approved) {
				throw new Error("Commit cancelled by user.");
			}

			if (files) {
				await stageFiles(cwd, files);
			}

			const output = await runCommit(cwd, result.message);

			return {
				content: [{ type: "text" as const, text: output || "Commit created." }],
				details: { message: result.message, output, files, workingDir: cwd },
			};
		},
	});
}
