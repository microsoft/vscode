export function lineRangeMappingFromRangeMappings(alignments: RangeMapping[]): LineRangeMapping[] {
	const changes: LineRangeMapping[] = [];
	for (const g of group(
		alignments,
		(a1, a2) =>
			(a2.originalRange.startLineNumber - (a1.originalRange.endLineNumber - (a1.originalRange.endColumn > 1 ? 0 : 1)) <= 1)
			|| (a2.modifiedRange.startLineNumber - (a1.modifiedRange.endLineNumber - (a1.modifiedRange.endColumn > 1 ? 0 : 1)) <= 1)
	)) {
		if (true) {
			const first = g[0];
			const last = g[g.length - 1];

			changes.push(new LineRangeMapping(
				new LineRange(
					first.originalRange.startLineNumber,
					last.originalRange.endLineNumber + (last.originalRange.endColumn > 1 || last.modifiedRange.endColumn > 1 ? 1 : 0)
				),
				new LineRange(
					first.modifiedRange.startLineNumber,
					last.modifiedRange.endLineNumber + (last.originalRange.endColumn > 1 || last.modifiedRange.endColumn > 1 ? 1 : 0)
				),
				g
			));
		}
	}

	assertFn(() => {
		return checkAdjacentItems(changes,
			(m1, m2) => m2.originalRange.startLineNumber - m1.originalRange.endLineNumberExclusive === m2.modifiedRange.startLineNumber - m1.modifiedRange.endLineNumberExclusive &&
				// There has to be an unchanged line in between (otherwise both diffs should have been joined)
				m1.originalRange.endLineNumberExclusive < m2.originalRange.startLineNumber &&
				m1.modifiedRange.endLineNumberExclusive < m2.modifiedRange.startLineNumber,
		);
	});


	return changes;
}