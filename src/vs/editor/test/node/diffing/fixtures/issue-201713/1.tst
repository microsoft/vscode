const deletedCodeLineBreaksComputer = !renderSideBySide ? this._editors.modified._getViewModel()?.createLineBreaksComputer() : undefined;
if (deletedCodeLineBreaksComputer) {
	for (const a of alignmentsVal) {
		if (a.diff) {
			for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
				deletedCodeLineBreaksComputer?.addRequest(this._editors.original.getModel()!.getLineContent(i), null, null);
			}
		}
	}
}

const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
let lineBreakDataIdx = 0;