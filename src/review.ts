import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

let reviewQueue: Promise<void> = Promise.resolve();

export async function withReviewLock<T>(fn: () => Promise<T>): Promise<T> {
	let release = (): void => {};
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	const previous = reviewQueue;
	reviewQueue = previous.catch(() => undefined).then(() => next);

	await previous.catch(() => undefined);

	try {
		return await fn();
	} finally {
		release();
	}
}

export async function reviewCommit(
	ctx: ExtensionContext,
	cwd: string,
	initialMessage: string,
	buildSections: (cwd: string) => string[],
): Promise<{ message: string; approved: boolean }> {
	let message = initialMessage;
	const sections = buildSections(cwd);
	const header = sections.length
		? `📝 Git Commit:\n\n${sections.join("\n\n")}\n\n`
		: `📝 Git Commit:\n\n`;

	for (;;) {
		const choice = await ctx.ui.select(`${header}${message}`, [
			"Accept",
			"Edit",
			"Cancel",
		]);

		if (choice === "Accept") return { message, approved: true };
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

export type ReviewAction<Params> = (
	ctx: ExtensionContext,
	params: Params,
) => Promise<{ params: Params; approved: boolean }>;

export function createReviewLoop<Params>({
	label,
	format,
	parse,
}: {
	label: (params: Params) => string;
	format: (params: Params) => string;
	parse: (current: Params, edited: string) => void;
}): ReviewAction<Params> {
	return async (
		ctx: ExtensionContext,
		params: Params,
	): Promise<{ params: Params; approved: boolean }> => {
		const current = { ...params };

		for (;;) {
			const summary = format(current);
			const choice = await ctx.ui.select(`${label(current)}${summary}`, [
				"Accept",
				"Edit",
				"Cancel",
			]);

			if (choice === "Accept") return { params: current, approved: true };
			if (choice === "Cancel" || choice === undefined) {
				return { params: current, approved: false };
			}

			const edited = await ctx.ui.editor("Edit details:", summary);
			if (edited === undefined || edited.trim() === "") {
				return { params: current, approved: false };
			}

			parse(current, edited);
		}
	};
}
