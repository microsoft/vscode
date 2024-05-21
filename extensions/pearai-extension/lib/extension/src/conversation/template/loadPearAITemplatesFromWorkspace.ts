import * as vscode from "vscode";
import { loadConversationFromFile } from "./loadPearAITemplateFromFile";
import { PearAITemplateLoadResult } from "./PearAITemplateLoadResult";

const TEMPLATE_GLOB = ".pearai/template/**/*.rdt.md";

export async function loadPearAITemplatesFromWorkspace(): Promise<
	Array<PearAITemplateLoadResult>
> {
	const files = await vscode.workspace.findFiles(TEMPLATE_GLOB);
	return await Promise.all(files.map(loadConversationFromFile));
}
