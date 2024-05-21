import * as vscode from "vscode";
import { PearAITemplateLoadResult } from "./PearAITemplateLoadResult";
import { parsePearAITemplate } from "./parsePearAITemplate";
import { readFileContent } from "../../vscode/readFileContent";

export const loadConversationFromFile = async (
	file: vscode.Uri
): Promise<PearAITemplateLoadResult> => {
	try {
		const parseResult = parsePearAITemplate(await readFileContent(file));

		if (parseResult.type === "error") {
			return {
				type: "error" as const,
				file,
				error: parseResult.error,
			};
		}

		return {
			type: "success" as const,
			file,
			template: parseResult.template,
		};
	} catch (error) {
		return {
			type: "error" as const,
			file,
			error,
		};
	}
};
