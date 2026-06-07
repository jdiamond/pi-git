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

function runGh(args: string[], cwd: string): string {
	const result = spawnSync("gh", args, {
		cwd,
		encoding: "utf-8",
		stdio: "pipe",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || `gh ${args[0]} failed`);
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

interface CreatePrParams {
	title: string;
	body?: string | undefined;
	base?: string | undefined;
	draft?: boolean | undefined;
	dryRun?: boolean | undefined;
	reviewers?: string[] | undefined;
}

function buildPrArgs(params: CreatePrParams): string[] {
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

function formatPrSummary(params: CreatePrParams): string {
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
		headers.push(`Reviewers: ${params.reviewers.join(", ")}`);
	}

	const parts: string[] = [headers.join("\n")];

	// blank line separator before body (HTTP style)
	if (params.body) {
		parts.push("");
		parts.push(params.body);
	}

	return parts.join("\n");
}

function parsePrHeaderLine(
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
	} else if (line.startsWith("Reviewers: ")) {
		const val = line.slice("Reviewers: ".length);
		params.reviewers = val ? val.split(", ") : [];
	}
}

function parsePrHeaders(lines: string[]): {
	headerEnd: number;
	params: Partial<CreatePrParams>;
} {
	const params: Partial<CreatePrParams> = {};
	let headerEnd = 0;

	for (const [i, line] of lines.entries()) {
		if (line === "") {
			// blank line marks end of headers
			headerEnd = i;
			break;
		}

		parsePrHeaderLine(line, params);
	}

	// If no blank line found, everything is headers
	if (headerEnd === 0 && lines.length > 0 && lines[0] !== "") {
		headerEnd = lines.length;
	}

	return { headerEnd, params };
}

function parsePrEditedText(current: CreatePrParams, edited: string): void {
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

	// Body is everything after the header block
	const bodyLines = lines.slice(headerEnd + 1);
	const body = bodyLines.join("\n").trim();
	current.body = body || undefined;
}

async function reviewPr(
	ctx: ExtensionContext,
	params: CreatePrParams,
): Promise<{ params: CreatePrParams; approved: boolean }> {
	const current = { ...params };
	const header = "📝 Create Pull Request:\n\n";

	for (;;) {
		const summary = formatPrSummary(current);
		const label = current.dryRun
			? "📝 (dry run) Create Pull Request:\n\n"
			: header;
		const choice = await ctx.ui.select(`${label}${summary}`, [
			"Approve",
			"Edit",
			"Cancel",
		]);

		if (choice === "Approve") return { params: current, approved: true };
		if (choice === "Cancel" || choice === undefined) {
			return { params: current, approved: false };
		}

		// edit — open editor with a structured representation
		const edited = await ctx.ui.editor("Edit PR details:", summary);
		if (edited === undefined || edited.trim() === "") {
			return { params: current, approved: false };
		}

		parsePrEditedText(current, edited);
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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = resolve(ctx.cwd);

			if (!isGitRepo(cwd)) {
				throw new Error("Not inside a git repository.");
			}

			const result = await reviewPr(ctx, {
				title: params.title,
				body: params.body,
				base: params.base,
				draft: params.draft,
				dryRun: params.dryRun,
				reviewers: params.reviewers?.length ? params.reviewers : undefined,
			});

			if (!result.approved) {
				throw new Error("PR creation cancelled by user.");
			}

			const args = buildPrArgs(result.params);
			const output = runGh(args, cwd);

			return {
				content: [
					{ type: "text" as const, text: output || "Pull request created." },
				],
				details: { ...result.params, output },
			};
		},
	});
}
