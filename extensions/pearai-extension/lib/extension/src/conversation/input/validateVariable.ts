import { Variable } from "../template/PearAITemplate";

export function validateVariable({
	value,
	variable,
}: {
	value: unknown;
	variable: Variable;
}) {
	for (const constraint of variable.constraints ?? []) {
		if (constraint.type === "text-length") {
			if (value == undefined) {
				throw new Error(`Variable '${variable.name}' is undefined`);
			}

			if (typeof value !== "string") {
				throw new Error(`Variable '${variable.name}' is not a string`);
			}
			if (value.length < constraint.min) {
				throw new Error(`Variable '${variable.name}' is too short`);
			}
		}
	}
}
