import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { register as registerAddIssueComment } from "./tools/add-issue-comment.ts";
import { register as registerAddPrComment } from "./tools/add-pr-comment.ts";
import { register as registerAmend } from "./tools/amend.ts";
import { register as registerCommit } from "./tools/commit.ts";
import { register as registerCreateIssue } from "./tools/create-issue.ts";
import { register as registerCreatePr } from "./tools/create-pr.ts";
import { register as registerGitDiff } from "./tools/git-diff.ts";
import { register as registerGitLog } from "./tools/git-log.ts";
import { register as registerGitShow } from "./tools/git-show.ts";
import { register as registerGitStatus } from "./tools/git-status.ts";
import { register as registerReadPrComments } from "./tools/read-pr-comments.ts";
import { register as registerReplyToPrThread } from "./tools/reply-to-pr-thread.ts";

export default function (pi: ExtensionAPI) {
	registerCommit(pi);
	registerAmend(pi);
	registerCreatePr(pi);
	registerCreateIssue(pi);
	registerAddPrComment(pi);
	registerAddIssueComment(pi);
	registerReadPrComments(pi);
	registerReplyToPrThread(pi);
	registerGitDiff(pi);
	registerGitLog(pi);
	registerGitShow(pi);
	registerGitStatus(pi);
}
