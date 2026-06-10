import { resolve } from "node:path";
import { Type } from "typebox";

export interface WorkingDirParam {
	workingDir?: string | undefined;
}

export function workingDirParameter() {
	return Type.Optional(
		Type.String({
			description:
				"Working directory to run the git/GitHub command in (defaults to the current working directory). Relative paths are resolved from the current working directory.",
		}),
	);
}

export function resolveWorkingDir(
	defaultCwd: string,
	workingDir?: string,
): string {
	return resolve(defaultCwd, workingDir ?? ".");
}
