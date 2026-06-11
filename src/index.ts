import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { register as registerAmend } from "./tools/amend.ts";
import { register as registerCommit } from "./tools/commit.ts";
import { register as registerCreatePr } from "./tools/create-pr.ts";
import { register as registerAddPrComment } from "./tools/add-pr-comment.ts";
import { register as registerReadPrComments } from "./tools/read-pr-comments.ts";
import { register as registerReplyToPrThread } from "./tools/reply-to-pr-thread.ts";

export default function (pi: ExtensionAPI) {
	registerCommit(pi);
	registerAmend(pi);
	registerCreatePr(pi);
	registerAddPrComment(pi);
	registerReadPrComments(pi);
	registerReplyToPrThread(pi);
}
