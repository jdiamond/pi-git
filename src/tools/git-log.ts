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

const FORMATS = ["oneline", "short", "medium", "full", "fuller"] as const;

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_log",
		label: "Git Log",
		description:
			"Show git commit history. Returns commits in reverse chronological order.",
		parameters: Type.Object({
			count: Type.Optional(
				Type.Number({
					description: "Number of commits to show (default: 20).",
				}),
			),
			path: Type.Optional(
				Type.String({
					description: "Limit to commits touching this file or directory.",
				}),
			),
			author: Type.Optional(
				Type.String({
					description: "Filter by author name or email.",
				}),
			),
			since: Type.Optional(
				Type.String({
					description:
						'Show commits more recent than this date (e.g. "2 weeks ago", "2024-01-15").',
				}),
			),
			format: Type.Optional(
				Type.Union(
					FORMATS.map((f) => Type.Literal(f)),
					{
						description:
							'Output format (default: "medium"). Use "oneline" for compact output.',
					},
				),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: {
				count?: number;
				path?: string;
				author?: string;
				since?: string;
				format?: string;
			} & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const args: string[] = [
				"log",
				`--max-count=${params.count ?? 20}`,
				`--format=${params.format ?? "medium"}`,
			];

			if (params.author) {
				args.push("--author", params.author);
			}

			if (params.since) {
				args.push("--since", params.since);
			}

			if (params.path) {
				args.push("--", params.path);
			}

			const output = await runGit(args, cwd);

			return {
				content: [
					{
						type: "text" as const,
						text: output || "(no commits)",
					},
				],
				details: { output, args, workingDir: cwd },
			};
		},
	});
}
