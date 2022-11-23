class Test {
    public getDecorationsViewportData(viewRange: Range): IDecorationsViewportData {
		return null!;
	}

	public getInlineDecorationsOnLine(lineNumber: number): InlineDecoration[] {
		const range = new Range(lineNumber, this._linesCollection.getViewLineMinColumn(lineNumber), lineNumber, this._linesCollection.getViewLineMaxColumn(lineNumber));
		return this._getDecorationsInRange(range).inlineDecorations[0];
	}

	private _getDecorationsInRange(viewRange: Range): IDecorationsViewportData {
		const modelDecorations = this._linesCollection.getDecorationsInRange(viewRange, this.editorId, filterValidationDecorations(this.configuration.options));
		const startLineNumber = viewRange.startLineNumber;
		const endLineNumber = viewRange.endLineNumber;

		const decorationsInViewport: ViewModelDecoration[] = [];
		let decorationsInViewportLen = 0;
		const inlineDecorations: InlineDecoration[][] = [];
		for (let j = startLineNumber; j <= endLineNumber; j++) {
			inlineDecorations[j - startLineNumber] = [];
		}

		for (let i = 0, len = modelDecorations.length; i < len; i++) {
			const modelDecoration = modelDecorations[i];
			const decorationOptions = modelDecoration.options;

			if (!isModelDecorationVisible(this.model, modelDecoration)) {
				continue;
			}

			const viewModelDecoration = this._getOrCreateViewModelDecoration(modelDecoration);
			const viewRange = viewModelDecoration.range;

			decorationsInViewport[decorationsInViewportLen++] = viewModelDecoration;

			if (decorationOptions.inlineClassName) {
				const inlineDecoration = new InlineDecoration(viewRange, decorationOptions.inlineClassName, decorationOptions.inlineClassNameAffectsLetterSpacing ? InlineDecorationType.RegularAffectingLetterSpacing : InlineDecorationType.Regular);
				const intersectedStartLineNumber = Math.max(startLineNumber, viewRange.startLineNumber);
				const intersectedEndLineNumber = Math.min(endLineNumber, viewRange.endLineNumber);
				for (let j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
					inlineDecorations[j - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.beforeContentClassName) {
				if (startLineNumber <= viewRange.startLineNumber && viewRange.startLineNumber <= endLineNumber) {
					const inlineDecoration = new InlineDecoration(
						new Range(viewRange.startLineNumber, viewRange.startColumn, viewRange.startLineNumber, viewRange.startColumn),
						decorationOptions.beforeContentClassName,
						InlineDecorationType.Before
					);
					inlineDecorations[viewRange.startLineNumber - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.afterContentClassName) {
				if (startLineNumber <= viewRange.endLineNumber && viewRange.endLineNumber <= endLineNumber) {
					const inlineDecoration = new InlineDecoration(
						new Range(viewRange.endLineNumber, viewRange.endColumn, viewRange.endLineNumber, viewRange.endColumn),
						decorationOptions.afterContentClassName,
						InlineDecorationType.After
					);
					inlineDecorations[viewRange.endLineNumber - startLineNumber].push(inlineDecoration);
				}
			}
		}

		return {
			decorations: decorationsInViewport,
			inlineDecorations: inlineDecorations
		};
	}
}