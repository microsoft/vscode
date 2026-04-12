export class EditorWorkerServiceDiffComputer implements IDiffComputer {
	constructor(@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService) { }

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<LineDiff[] | null> {
		const diffs = await this.editorWorkerService.computeDiff(textModel1.uri, textModel2.uri, false, 1000);
		if (!diffs || diffs.quitEarly) {
			return null;
		}
		return EditorWorkerServiceDiffComputer.fromDiffComputationResult(diffs, textModel1, textModel2);
	}

	public static fromDiffComputationResult(result: IDiffComputationResult, textModel1: ITextModel, textModel2: ITextModel): LineDiff[] {
		return result.changes.map((c) => fromLineChange(c, textModel1, textModel2));
	}
}

function fromLineChange(lineChange: ILineChange, originalTextModel: ITextModel, modifiedTextModel: ITextModel): LineDiff {
	let originalRange: LineRange;
	if (lineChange.originalEndLineNumber === 0) {
		// Insertion
		originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
	} else {
		originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
	}

	let modifiedRange: LineRange;
	if (lineChange.modifiedEndLineNumber === 0) {
		// Deletion
		modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
	} else {
		modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
	}

	let innerDiffs = lineChange.charChanges?.map(c => fromCharChange(c));
	if (!innerDiffs) {
		innerDiffs = [diffFromLineRanges(originalRange, modifiedRange)];
	}

	return new LineDiff(
		originalTextModel,
		originalRange,
		modifiedTextModel,
		modifiedRange,
		innerDiffs
	);
}

function diffFromLineRanges(originalRange: LineRange, modifiedRange: LineRange): Diff {
	// [1,1) -> [100, 101)

	if (originalRange.startLineNumber !== 1 && modifiedRange.startLineNumber !== 1) {

	}

	let original = new Range(
		originalRange.startLineNumber - 1,
		Number.MAX_SAFE_INTEGER,
		originalRange.endLineNumberExclusive - 1,
		Number.MAX_SAFE_INTEGER,
	);

	let modified = new Range(
		modifiedRange.startLineNumber - 1,
		Number.MAX_SAFE_INTEGER,
		modifiedRange.endLineNumberExclusive - 1,
		Number.MAX_SAFE_INTEGER,
	);

	return new Diff(
		original,
		modified
	);
}

function fromCharChange(charChange: ICharChange): Diff {
	return new Diff(
		new Range(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn),
		new Range(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn)
	);
}
