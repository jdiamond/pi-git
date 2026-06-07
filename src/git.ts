import { spawnSync } from "node:child_process";

export function isGitRepo(cwd: string): boolean {
	const result = spawnSync("git", ["rev-parse", "--git-dir"], {
		cwd,
		stdio: "ignore",
	});
	return result.status === 0;
}

export function hasStagedChanges(cwd: string): boolean {
	const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
		cwd,
		stdio: "ignore",
	});
	return result.status !== 0;
}

export function getStagedFiles(cwd: string): string[] {
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

export function stageFiles(cwd: string, files: string[]): void {
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

export function runCommit(cwd: string, message: string): string {
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

export function runGh(args: string[], cwd: string): string {
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
