import { resolve } from "node:path";
import type {
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isGitRepo, runGh } from "../git.ts";
import { createReviewLoop } from "../review.ts";

export interface CreatePrParams {
	title: string;
	body?: string | undefined;
	base?: string | undefined;
	draft?: boolean | undefined;
	dryRun?: boolean | undefined;
	reviewers?: string[] | undefined;
}

export function buildPrArgs(params: CreatePrParams): string[] {
	const args = ["pr", "create", "--title", params.title];

	if (params.body) {
		args.push("--body", params.body);
	}

	if (params.base) {
		args.push("--base", params.base);
	}

	if (params.draft) {
		args.push("--draft");
	}

	if (params.reviewers?.length) {
		for (const reviewer of params.reviewers) {
			args.push("--reviewer", reviewer);
		}
	}

	if (params.dryRun) {
		args.push("--dry-run");
	}

	return args;
}

export function formatPrSummary(params: CreatePrParams): string {
	const headers: string[] = [];
	headers.push(`Title: ${params.title}`);

	if (params.base) {
		headers.push(`Base: ${params.base}`);
	}

	if (params.draft) {
		headers.push("Draft: yes");
	}

	if (params.dryRun) {
		headers.push("Dry run: yes");
	}

	if (params.reviewers?.length) {
		for (const reviewer of params.reviewers) {
			headers.push(`Reviewer: ${reviewer}`);
		}
	}

	const parts: string[] = [headers.join("\n")];

	if (params.body) {
		parts.push("");
		parts.push(params.body);
	}

	return parts.join("\n");
}

export function parsePrHeaderLine(
	line: string,
	params: Partial<CreatePrParams>,
): void {
	if (line.startsWith("Title: ")) {
		params.title = line.slice("Title: ".length);
	} else if (line.startsWith("Base: ")) {
		params.base = line.slice("Base: ".length);
	} else if (line.startsWith("Draft: ")) {
		params.draft = line.slice("Draft: ".length) === "yes";
	} else if (line.startsWith("Dry run: ")) {
		params.dryRun = line.slice("Dry run: ".length) === "yes";
	} else if (line.startsWith("Reviewer: ")) {
		const val = line.slice("Reviewer: ".length);
		if (val) {
			if (!params.reviewers) {
				params.reviewers = [];
			}
			params.reviewers.push(val);
		}
	}
}

export function parsePrHeaders(lines: string[]): {
	headerEnd: number;
	params: Partial<CreatePrParams>;
} {
	const params: Partial<CreatePrParams> = {};
	let headerEnd = 0;

	for (const [i, line] of lines.entries()) {
		if (line === "") {
			headerEnd = i;
			break;
		}

		parsePrHeaderLine(line, params);
	}

	if (headerEnd === 0 && lines.length > 0 && lines[0] !== "") {
		headerEnd = lines.length;
	}

	return { headerEnd, params };
}

export function parsePrEditedText(
	current: CreatePrParams,
	edited: string,
): void {
	const lines = edited.split("\n");
	const { headerEnd, params } = parsePrHeaders(lines);

	if (params.title !== undefined) {
		current.title = params.title;
	}

	if (params.base !== undefined) {
		current.base = params.base;
	}

	if (params.draft !== undefined) {
		current.draft = params.draft;
	}

	if (params.dryRun !== undefined) {
		current.dryRun = params.dryRun;
	}

	if (params.reviewers !== undefined) {
		current.reviewers = params.reviewers;
	}

	const bodyLines = lines.slice(headerEnd + 1);
	const body = bodyLines.join("\n").trim();
	current.body = body || undefined;
}

const prLabel = (params: CreatePrParams): string =>
	params.dryRun
		? "📝 (dry run) Create Pull Request:\n\n"
		: "📝 Create Pull Request:\n\n";

const reviewPr = createReviewLoop<CreatePrParams>({
	label: prLabel,
	format: formatPrSummary,
	parse: parsePrEditedText,
});

export function register(pi: {
	registerTool: (tool: ToolDefinition) => void;
}): void {
	pi.registerTool({
		name: "git_create_pr",
		label: "Git Create PR",
		description:
			"Create a pull request on GitHub. Shows a review overlay where the user can approve, edit, or cancel before the PR is created.",
		parameters: Type.Object({
			title: Type.String({ description: "The PR title" }),
			body: Type.Optional(
				Type.String({ description: "The PR body / description" }),
			),
			base: Type.Optional(
				Type.String({
					description:
						"The branch you want to merge into (defaults to repository default branch)",
				}),
			),
			draft: Type.Optional(
				Type.Boolean({
					description: "Mark the PR as a draft (default: false)",
				}),
			),
			dryRun: Type.Optional(
				Type.Boolean({
					description:
						"Print details instead of creating the PR (default: false)",
				}),
			),
			reviewers: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Reviewers to request (handles like `monalisa`, `myorg/team-name`, or `copilot-pull-request-reviewer[bot]`)",
				}),
			),
		}),
		async execute(
			_toolCallId: string,
			params: {
				title: string;
				body?: string;
				base?: string;
				draft?: boolean;
				dryRun?: boolean;
				reviewers?: string[];
			},
			_signal: AbortSignal,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const cwd = resolve(ctx.cwd);

			if (!(await isGitRepo(cwd))) {
				throw new Error("Not inside a git repository.");
			}

			const prParams: CreatePrParams = {
				title: params.title,
				body: params.body,
				base: params.base,
				draft: params.draft,
				dryRun: params.dryRun,
				reviewers: params.reviewers?.length ? params.reviewers : undefined,
			};

			const result = await reviewPr(ctx, prParams);

			if (!result.approved) {
				throw new Error("PR creation cancelled by user.");
			}

			const args = buildPrArgs(result.params);
			const output = await runGh(args, cwd);

			return {
				content: [
					{ type: "text" as const, text: output || "Pull request created." },
				],
				details: { ...result.params, output },
			};
		},
	});
}
