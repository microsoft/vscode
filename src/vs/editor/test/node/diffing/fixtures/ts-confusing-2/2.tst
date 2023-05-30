class Test {
	// ---- BEGIN diff --------------------------------------------------------------------------

	public async computeDiff(originalUrl: string, modifiedUrl: string, options: ILinesDiffComputerOptions): Promise<IDiffComputationResult | null> {
		const original = this._getModel(originalUrl);
		const modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		return EditorSimpleWorker.computeDiff(original, modified, options);
	}

	public static computeDiff(originalTextModel: ICommonModel | ITextModel, modifiedTextModel: ICommonModel | ITextModel, options: ILinesDiffComputerOptions): IDiffComputationResult {

		const diffAlgorithm: ILinesDiffComputer = options.diffAlgorithm === 'experimental' ? linesDiffComputers.experimental : linesDiffComputers.smart;

		const originalLines = originalTextModel.getLinesContent();
		const modifiedLines = modifiedTextModel.getLinesContent();

		const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);

		const identical = (result.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel));

		return {
			identical,
			quitEarly: result.quitEarly,
			changes: result.changes.map(m => ([m.originalRange.startLineNumber, m.originalRange.endLineNumberExclusive, m.modifiedRange.startLineNumber, m.modifiedRange.endLineNumberExclusive, m.innerChanges?.map(m => [
				m.originalRange.startLineNumber,
				m.originalRange.startColumn,
				m.originalRange.endLineNumber,
				m.originalRange.endColumn,
				m.modifiedRange.startLineNumber,
				m.modifiedRange.startColumn,
				m.modifiedRange.endLineNumber,
				m.modifiedRange.endColumn,
			])]))
		};
	}
}