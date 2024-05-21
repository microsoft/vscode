export type LinePosition = {
	start: number;
	end: number;
};

export function calculateLinePositions(lines: string[], lineSeparator: string) {
	const linePositions: Array<LinePosition> = [];

	let position = 0;

	for (const line of lines) {
		linePositions.push({
			start: position,
			end: position + line.length, // note: separator is not included
		});

		position += line.length + lineSeparator.length;
	}

	return linePositions;
}
