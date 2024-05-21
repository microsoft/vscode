import { getFilename } from "./getFilename";
import { getLanguage } from "./getLanguage";
import { getSelectedText } from "./getSelectedText";
import { Variable } from "../template/PearAITemplate";
import { Message } from "../Message";
import { getSelectedLocationText } from "./getSelectedLocationText";
import { getSelectedTextWithDiagnostics } from "./getSelectionWithDiagnostics";
import { getOpenFiles } from "./getOpenFiles";

export async function resolveVariable(
	variable: Variable,
	{ messages }: { messages?: Array<Message> } = {}
): Promise<unknown> {
	const variableType = variable.type;
	switch (variableType) {
		case "context":
			return getOpenFiles();
		case "constant":
			return variable.value;
		case "message":
			return messages?.at(variable.index)?.[variable.property];
		case "selected-text":
			return getSelectedText();
		case "selected-location-text":
			return getSelectedLocationText();
		case "filename":
			return getFilename();
		case "language":
			return getLanguage();
		case "selected-text-with-diagnostics":
			return getSelectedTextWithDiagnostics({
				diagnosticSeverities: variable.severities,
			});
		default: {
			const exhaustiveCheck: never = variableType;
			throw new Error(`unsupported type: ${exhaustiveCheck}`);
		}
	}
}
