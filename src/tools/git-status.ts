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
		name: "git_status",
		label: "Git Status",
		description:
			"Show the working tree status. Lists staged, unstaged, and untracked files.",
		parameters: Type.Object({
			short: Type.Optional(
				Type.Boolean({
					description: "Use short-format output.",
				}),
			),
			path: Type.Optional(
				Type.String({
					description: "Limit to a specific file or directory.",
				}),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: { short?: boolean; path?: string } & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const args: string[] = ["status"];

			if (params.short) {
				args.push("--short");
			}

			if (params.path) {
				args.push("--", params.path);
			}

			const output = await runGit(args, cwd);

			return {
				content: [
					{
						type: "text" as const,
						text: output || "(clean)",
					},
				],
				details: { output, args, workingDir: cwd },
			};
		},
	});
}
