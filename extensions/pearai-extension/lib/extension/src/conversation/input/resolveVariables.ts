import { webviewApi } from "@pearai/common";
import { Variable } from "../template/PearAITemplate";
import { resolveVariable } from "./resolveVariable";
import { validateVariable } from "./validateVariable";

export async function resolveVariables(
	variables: Array<Variable> | undefined,
	{
		time,
		messages,
	}: {
		time: Variable["time"];
		messages?: Array<webviewApi.Message>;
	}
) {
	const variableValues: Record<string, unknown> = {
		messages,
	};

	// messages is a special variable that is always available:
	if (messages != null) {
		variableValues.messages = messages;
	}

	for (const variable of variables ?? []) {
		if (variable.time !== time) {
			continue;
		}

		if (variableValues[variable.name] != undefined) {
			throw new Error(`Variable '${variable.name}' is already defined`);
		}

		const value = await resolveVariable(variable, { messages });

		validateVariable({ value, variable });

		variableValues[variable.name] = value;
	}

	return variableValues;
}
