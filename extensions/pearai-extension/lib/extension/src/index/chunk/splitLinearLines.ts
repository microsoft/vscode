import { calculateLinePositions } from "./calculateLinePositions";
import { Chunk } from "./Chunk";

type Segment = {
	lines: string[];
	startLine: number;
	characterCount: number;
};

export function createSplitLinearLines({
	maxChunkCharacters,
	lineSeparator = "\n",
}: {
	maxChunkCharacters: number;
	lineSeparator?: string | undefined;
}) {
	return function splitLinearLines(content: string): Array<Chunk> {
		const lines = content.split(lineSeparator);
		const linePositions = calculateLinePositions(lines, lineSeparator);

		const chunks: Array<Chunk> = [];

		let segment: Segment | undefined = undefined;

		function addSegmentToChunks(currentLine: number) {
			if (segment == undefined) {
				return;
			}

			chunks.push({
				startPosition: linePositions[segment.startLine]!.start,
				endPosition: linePositions[currentLine]!.end,
				content: segment.lines.join(lineSeparator),
			});

			segment = undefined;
		}

		for (let i = 0; i < lines.length; i++) {
			const lineText = lines[i]!;

			if (segment == null) {
				segment = {
					lines: [lineText],
					startLine: i,
					characterCount: lineText.length,
				};
			} else {
				segment.lines.push(lineText);
				segment.characterCount += lineText.length + lineSeparator.length;
			}

			// this leads to chunks that are too big (by 1 line)
			if (segment.characterCount > maxChunkCharacters) {
				addSegmentToChunks(i);
			}
		}

		addSegmentToChunks(lines.length - 1);

		return chunks;
	};
}
