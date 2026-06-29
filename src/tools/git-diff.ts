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
		name: "git_diff",
		label: "Git Diff",
		description:
			"Show git changes. By default shows unstaged changes. Use `staged` for staged changes, or specify commits/refs to compare.",
		parameters: Type.Object({
			staged: Type.Optional(
				Type.Boolean({
					description: "Show staged changes (--cached) instead of unstaged.",
				}),
			),
			commit: Type.Optional(
				Type.String({
					description:
						"Show changes from this commit onward. Can be a SHA, branch, tag, or relative ref like HEAD~3.",
				}),
			),
			compareWith: Type.Optional(
				Type.String({
					description:
						"Second ref to compare against. When set, shows the diff between `commit` and `compareWith`.",
				}),
			),
			path: Type.Optional(
				Type.String({
					description: "Limit diff to a specific file or directory.",
				}),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: {
				staged?: boolean;
				commit?: string;
				compareWith?: string;
				path?: string;
			} & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const args: string[] = ["diff"];

			if (params.staged) {
				args.push("--cached");
			}

			if (params.commit) {
				args.push(params.commit);
			}

			if (params.compareWith) {
				args.push(params.compareWith);
			} else if (params.commit && !params.staged) {
				// Without a second ref, show uncommitted changes relative to commit
				// but only if staged isn't also set (which changes semantics)
			}

			if (params.path) {
				args.push("--", params.path);
			}

			const output = await runGit(args, cwd);

			return {
				content: [
					{
						type: "text" as const,
						text: output || "(no changes)",
					},
				],
				details: { output, args, workingDir: cwd },
			};
		},
	});
}
