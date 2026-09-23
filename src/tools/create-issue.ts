import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isGitRepo, runGh } from "../git.ts";
import {
	createCancelledResult,
	createReviewLoop,
	withReviewLock,
} from "../review.ts";
import {
	resolveWorkingDir,
	type WorkingDirParam,
	workingDirParameter,
} from "../working-dir.ts";

export interface CreateIssueParams {
	title: string;
	body?: string | undefined;
	assignees?: string[] | undefined;
	labels?: string[] | undefined;
	milestone?: string | undefined;
}

export function buildIssueArgs(params: CreateIssueParams): string[] {
	const args = ["issue", "create", "--title", params.title];

	if (params.body) {
		args.push("--body", params.body);
	}

	if (params.assignees?.length) {
		for (const assignee of params.assignees) {
			args.push("--assignee", assignee);
		}
	}

	if (params.labels?.length) {
		for (const label of params.labels) {
			args.push("--label", label);
		}
	}

	if (params.milestone) {
		args.push("--milestone", params.milestone);
	}

	return args;
}

export function formatIssueSummary(params: CreateIssueParams): string {
	const headers: string[] = [`Title: ${params.title}`];

	if (params.milestone) {
		headers.push(`Milestone: ${params.milestone}`);
	}

	if (params.assignees?.length) {
		for (const assignee of params.assignees) {
			headers.push(`Assignee: ${assignee}`);
		}
	}

	if (params.labels?.length) {
		for (const label of params.labels) {
			headers.push(`Label: ${label}`);
		}
	}

	const parts: string[] = [headers.join("\n")];

	if (params.body) {
		parts.push("");
		parts.push(params.body);
	}

	return parts.join("\n");
}

export function parseIssueHeaderLine(
	line: string,
	params: Partial<CreateIssueParams>,
): void {
	if (line.startsWith("Title: ")) {
		params.title = line.slice("Title: ".length);
	} else if (line.startsWith("Milestone: ")) {
		params.milestone = line.slice("Milestone: ".length);
	} else if (line.startsWith("Assignee: ")) {
		const val = line.slice("Assignee: ".length);
		if (val) {
			if (!params.assignees) {
				params.assignees = [];
			}
			params.assignees.push(val);
		}
	} else if (line.startsWith("Label: ")) {
		const val = line.slice("Label: ".length);
		if (val) {
			if (!params.labels) {
				params.labels = [];
			}
			params.labels.push(val);
		}
	}
}

export function parseIssueHeaders(lines: string[]): {
	headerEnd: number;
	params: Partial<CreateIssueParams>;
} {
	const params: Partial<CreateIssueParams> = {};
	let headerEnd = 0;

	for (const [i, line] of lines.entries()) {
		if (line === "") {
			headerEnd = i;
			break;
		}

		parseIssueHeaderLine(line, params);
	}

	if (headerEnd === 0 && lines.length > 0 && lines[0] !== "") {
		headerEnd = lines.length;
	}

	return { headerEnd, params };
}

export function parseIssueEditedText(
	current: CreateIssueParams,
	edited: string,
): void {
	const lines = edited.split("\n");
	const { headerEnd, params } = parseIssueHeaders(lines);

	if (params.title !== undefined) {
		current.title = params.title;
	}

	if (params.milestone !== undefined) {
		current.milestone = params.milestone;
	}

	if (params.assignees !== undefined) {
		current.assignees = params.assignees;
	}

	if (params.labels !== undefined) {
		current.labels = params.labels;
	}

	const bodyLines = lines.slice(headerEnd + 1);
	const body = bodyLines.join("\n").trim();
	current.body = body || undefined;
}

const reviewIssue = createReviewLoop<CreateIssueParams>({
	label: () => "📝 Create Issue:\n\n",
	format: formatIssueSummary,
	parse: parseIssueEditedText,
});

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_create_issue",
		label: "Git Create Issue",
		description:
			"Create an issue on GitHub. Shows a review prompt where the user can accept, edit, or cancel before the issue is created.",
		parameters: Type.Object({
			title: Type.String({ description: "The issue title" }),
			body: Type.Optional(
				Type.String({ description: "The issue body / description" }),
			),
			assignees: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"GitHub usernames to assign (use `@me` to assign yourself)",
				}),
			),
			labels: Type.Optional(
				Type.Array(Type.String(), {
					description: "Labels to add to the issue",
				}),
			),
			milestone: Type.Optional(
				Type.String({ description: "Milestone to add the issue to" }),
			),
			workingDir: workingDirParameter(),
		}),
		async execute(
			_toolCallId: string,
			params: {
				title: string;
				body?: string;
				assignees?: string[];
				labels?: string[];
				milestone?: string;
			} & WorkingDirParam,
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolveWorkingDir(ctx.cwd, params.workingDir);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const issueParams: CreateIssueParams = {
				title: params.title,
				body: params.body,
				assignees: params.assignees?.length ? params.assignees : undefined,
				labels: params.labels?.length ? params.labels : undefined,
				milestone: params.milestone,
			};

			const result = await withReviewLock(() => reviewIssue(ctx, issueParams));

			if (!result.approved) {
				return createCancelledResult("Issue creation cancelled by user.", {
					...result.params,
					workingDir: cwd,
				});
			}

			const args = buildIssueArgs(result.params);
			const output = await runGh(args, cwd);

			return {
				content: [{ type: "text" as const, text: output || "Issue created." }],
				details: { ...result.params, output, workingDir: cwd },
			};
		},
	});
}
