import { execFile } from "node:child_process";

function exec(
	command: string,
	args: string[],
	cwd: string,
	encoding: BufferEncoding = "utf-8",
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(
			command,
			args,
			{ cwd, encoding, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					const msg =
						typeof stderr === "string" && stderr.trim()
							? stderr.trim()
							: `${command} ${args[0]} failed`;
					reject(new Error(msg));
				} else {
					resolve({
						stdout: stdout as string,
						stderr: stderr as string,
					});
				}
			},
		);
	});
}

export async function isGitRepo(cwd: string): Promise<boolean> {
	try {
		await exec("git", ["rev-parse", "--git-dir"], cwd);
		return true;
	} catch {
		return false;
	}
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
	try {
		await exec("git", ["diff", "--cached", "--quiet"], cwd);
		return false;
	} catch {
		return true;
	}
}

export async function getStagedFiles(cwd: string): Promise<string[]> {
	try {
		const { stdout } = await exec(
			"git",
			["diff", "--cached", "--name-only"],
			cwd,
		);
		return stdout.trim().split("\n").filter(Boolean);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || "git diff --cached failed");
	}
}

export async function stageFiles(cwd: string, files: string[]): Promise<void> {
	try {
		await exec("git", ["add", "--", ...files], cwd);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || "git add failed");
	}
}

export async function runCommit(cwd: string, message: string): Promise<string> {
	try {
		const { stdout } = await exec("git", ["commit", "-m", message], cwd);
		return stdout.trim();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || "git commit failed");
	}
}

export async function runGit(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await exec("git", args, cwd);
		return stdout.trim();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || `git ${args[0]} failed`);
	}
}

export async function runGh(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await exec("gh", args, cwd);
		return stdout.trim();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(msg || `gh ${args[0]} failed`);
	}
}
