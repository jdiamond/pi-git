import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { register as registerCommit } from "./tools/commit.ts";
import { register as registerCreatePr } from "./tools/create-pr.ts";

export default function (pi: ExtensionAPI) {
	registerCommit(pi);
	registerCreatePr(pi);
}
