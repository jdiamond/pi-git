import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
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

interface ReviewResult {
	message: string;
	action: "approved" | "cancelled" | "edit";
}

class CommitReview implements Component {
	private message: string;
	private theme: Theme;
	private resolve: (result: ReviewResult) => void;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		message: string,
		theme: Theme,
		resolve: (result: ReviewResult) => void,
	) {
		this.message = message;
		this.theme = theme;
		this.resolve = resolve;
	}

	handleInput(data: string): boolean {
		const lower = data.toLowerCase();
		if (lower === "a" || matchesKey(data, Key.enter)) {
			this.resolve({ message: this.message, action: "approved" });
			return true;
		}
		if (lower === "c" || matchesKey(data, Key.escape)) {
			this.resolve({ message: this.message, action: "cancelled" });
			return true;
		}
		if (lower === "e") {
			this.resolve({ message: this.message, action: "edit" });
			return true;
		}
		return false;
	}

	render(width: number): string[] {
		if (this.cachedLines !== undefined && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const boxWidth = Math.min(width, 72);
		const innerWidth = boxWidth - 4; // 2 padding + 2 borders
		const title = " Commit Message ";
		const titlePad = Math.max(0, boxWidth - title.length - 3);

		const lines: string[] = [];
		lines.push(
			this.theme.fg("border", `╭─`) +
				this.theme.fg("toolTitle", title) +
				this.theme.fg("border", `${"─".repeat(titlePad)}╮`),
		);

		const borderFg = (s: string) => this.theme.fg("border", s);
		const messageFg = (s: string) => this.theme.fg("text", s);

		// Message area
		const messageLines = this.message.split("\n");
		for (const msgLine of messageLines) {
			if (msgLine === "") {
				lines.push(
					`${borderFg("│")}${" ".repeat(boxWidth - 2)}${borderFg("│")}`,
				);
			} else {
				const wrapped = wrapTextWithAnsi(msgLine, innerWidth);
				for (const wl of wrapped) {
					const wlVisible = visibleWidth(wl);
					const pad = Math.max(0, innerWidth - wlVisible);
					lines.push(
						`${borderFg("│")}  ${messageFg(wl)}${" ".repeat(pad)}${borderFg("│")}`,
					);
				}
			}
		}

		// Separator
		lines.push(borderFg(`│${"─".repeat(boxWidth - 2)}│`));

		// Actions
		const actionLine =
			this.theme.fg("dim", "  [") +
			this.theme.fg("accent", "a") +
			this.theme.fg("dim", "] approve    [") +
			this.theme.fg("accent", "e") +
			this.theme.fg("dim", "] edit    [") +
			this.theme.fg("accent", "c") +
			this.theme.fg("dim", "] cancel  ");
		const actionVisible = visibleWidth(
			"  [a] approve    [e] edit    [c] cancel  ",
		);
		const actionPad = Math.max(0, boxWidth - actionVisible - 2);
		lines.push(
			`${borderFg("│")}${actionLine}${" ".repeat(actionPad)}${borderFg("│")}`,
		);

		// Bottom border
		lines.push(borderFg(`╰${"─".repeat(boxWidth - 2)}╯`));

		this.cachedLines = lines;
		this.cachedWidth = width;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

async function reviewCommit(
	ctx: ExtensionContext,
	initialMessage: string,
): Promise<ReviewResult> {
	let message = initialMessage;

	for (;;) {
		const result = await ctx.ui.custom<ReviewResult>(
			(_tui, theme, _keybindings, done) => {
				const review = new CommitReview(message, theme, (r) => done(r));
				return review;
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: 72,
					margin: 2,
				},
			},
		);

		if (result.action !== "edit") return result;

		// User wants to edit the message
		const edited = await ctx.ui.editor("Edit commit message:", result.message);
		if (edited === undefined || edited.trim() === "") {
			// Cancelled the editor or submitted empty -> cancel the commit
			return { message: result.message, action: "cancelled" };
		}
		message = edited;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "git_commit",
		label: "Git Commit",
		description:
			"Create a git commit with the currently staged changes. Shows a review overlay showing the commit message — the user can approve, edit, or cancel before the commit executes.",
		parameters: Type.Object({
			message: Type.String({ description: "The commit message" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = resolve(ctx.cwd);

			if (!isGitRepo(cwd)) {
				throw new Error("Not inside a git repository.");
			}

			if (!hasStagedChanges(cwd)) {
				throw new Error(
					"Nothing staged for commit. Use `git add ...` to stage files first.",
				);
			}

			const result = await reviewCommit(ctx, params.message);

			if (result.action === "cancelled") {
				throw new Error("Commit cancelled by user.");
			}

			const output = runCommit(cwd, result.message);

			return {
				content: [{ type: "text" as const, text: output || "Commit created." }],
				details: { message: result.message, output },
			};
		},
	});
}
