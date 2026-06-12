import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isGitRepo, runGh } from "../git.ts";
import {
	resolveWorkingDir,
	type WorkingDirParam,
	workingDirParameter,
} from "../working-dir.ts";

async function reviewComment(
	ctx: ExtensionContext,
	body: string,
): Promise<{ body: string; approved: boolean }> {
	let currentBody = body;

	for (;;) {
		const choice = await ctx.ui.select(
			`📝 Add PR Comment:\n\n${currentBody}`,
			["Approve", "Edit", "Cancel"],
		);

		if (choice === "Approve") {
			return { body: currentBody, approved: true };
		}
		if (choice === "Cancel" || choice === undefined) {
			return { body: currentBody, approved: false };
		}

		const edited = await ctx.ui.editor("Edit comment:", currentBody);
		if (edited === undefined || edited.trim() === "") {
			return { body: currentBody, approved: false };
		}
		currentBody = edited;
	}
}

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_add_pr_comment",
		label: "Add PR Comment",
		description:
			"Add a top-level conversation comment on a GitHub pull request. Shows a review prompt where the user can accept, edit, or cancel before the comment is posted.",
		parameters: Type.Object({
			number: Type.Number({
				description: "The pull request number.",
			}),
			body: Type.String({
				description: "The comment body text.",
			}),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: { number: number; body: string } & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const result = await reviewComment(ctx, params.body);

			if (!result.approved) {
				throw new Error("Comment cancelled by user.");
			}

			try {
				const output = await runGh(
					["pr", "comment", String(params.number), "--body", result.body],
					cwd,
				);
				const url = output || "";

				return {
					content: [{ type: "text" as const, text: `Comment posted.\n\n${url}`.trim() }],
					details: {
						number: params.number,
						body: result.body,
						url: url || undefined,
						workingDir: cwd,
					},
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(`Failed to post comment: ${msg}`);
			}
		},
	});
}
