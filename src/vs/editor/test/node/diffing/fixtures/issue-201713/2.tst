const deletedCodeLineBreaksComputer = !renderSideBySide ? this._editors.modified._getViewModel()?.createLineBreaksComputer() : undefined;
if (deletedCodeLineBreaksComputer) {
	const originalModel = this._editors.original.getModel()!;
	for (const a of alignmentsVal) {
		if (a.diff) {
			for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
				// `i` can be out of bound when the diff has not been updated yet.
				// In this case, we do an early return.
				// TODO@hediet: Fix this by applying the edit directly to the diff model, so that the diff is always valid.
				if (i > originalModel.getLineCount()) {
					return { orig: origViewZones, mod: modViewZones };
				}
				deletedCodeLineBreaksComputer?.addRequest(originalModel.getLineContent(i), null, null);
			}
		}
	}
}

const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
let lineBreakDataIdx = 0;