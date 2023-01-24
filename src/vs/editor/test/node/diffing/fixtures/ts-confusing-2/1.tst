class Test {
    // ---- BEGIN diff --------------------------------------------------------------------------

	public async computeDiff(originalUrl: string, modifiedUrl: string, ignoreTrimWhitespace: boolean, maxComputationTime: number): Promise<IDiffComputationResult | null> {
		const original = this._getModel(originalUrl);
		const modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		return EditorSimpleWorker.computeDiff(original, modified, ignoreTrimWhitespace, maxComputationTime);
	}

	public static computeDiff(originalTextModel: ICommonModel | ITextModel, modifiedTextModel: ICommonModel | ITextModel, ignoreTrimWhitespace: boolean, maxComputationTime: number): IDiffComputationResult | null {
		const originalLines = originalTextModel.getLinesContent();
		const modifiedLines = modifiedTextModel.getLinesContent();
		const diffComputer = new DiffComputer(originalLines, modifiedLines, {
			shouldComputeCharChanges: true,
			shouldPostProcessCharChanges: true,
			shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
			shouldMakePrettyDiff: true,
			maxComputationTime: maxComputationTime
		});

		const diffResult = diffComputer.computeDiff();
		const identical = (diffResult.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel));
		return {
			quitEarly: diffResult.quitEarly,
			identical: identical,
			changes: diffResult.changes
		};
	}
}