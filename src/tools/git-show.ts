import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isGitRepo, runGit } from "../git.ts";
import {
	resolveWorkingDir,
	type WorkingDirParam,
	workingDirParameter,
} from "../working-dir.ts";

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_show",
		label: "Git Show",
		description:
			"Show details of a specific git commit. Returns the full diff, author, date, and message.",
		parameters: Type.Object({
			commit: Type.String({
				description:
					"The commit to show. Can be a SHA, branch name, tag, or relative ref like HEAD~2.",
			}),
			path: Type.Optional(
				Type.String({
					description: "Limit output to this file or directory.",
				}),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: { commit: string; path?: string } & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const args: string[] = ["show", params.commit];

			if (params.path) {
				args.push("--", params.path);
			}

			const output = await runGit(args, cwd);

			return {
				content: [
					{
						type: "text" as const,
						text: output || "(no output)",
					},
				],
				details: { output, commit: params.commit, args, workingDir: cwd },
			};
		},
	});
}
