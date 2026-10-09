/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { countEOL } from '../../../common/core/misc/eolCounter.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IModelDeltaDecoration, ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { IModelContentChangedEvent } from '../../../common/textModelEvents.js';

interface LineRange {
	readonly startLineNumber: number;
	readonly endLineNumber: number;
}

export class ShrinkEmptyLinesController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.shrinkEmptyLines';

	private _mode: 'off' | 'compact' | 'veryCompact' = 'off';
	private _decorationIds = new Set<string>();

	constructor(private readonly editor: ICodeEditor) {
		super();

		this._register(this.editor.onDidChangeModel(() => this._updateAllDecorations()));
		this._register(this.editor.onDidChangeConfiguration(event => {
			if (event.hasChanged(EditorOption.effectiveShrinkEmptyLines)) {
				this._updateMode();
				this._updateAllDecorations();
			}
			if (event.hasChanged(EditorOption.lineHeight) && this._mode !== 'off') {
				this._updateAllDecorations();
			}
		}));
		this._register(this.editor.onDidChangeModelContent(event => this._updateDecorations(event)));
		this._updateMode();
		this._updateAllDecorations();
	}

	private _updateMode(): void {
		this._mode = this.editor.getOption(EditorOption.effectiveShrinkEmptyLines);
	}

	private _getLineHeightMultiplier(): number | undefined {
		switch (this._mode) {
			case 'compact':
				return 0.5;
			case 'veryCompact':
				return 0.25;
			case 'off':
				return undefined;
		}
	}

	private _isEmptyLine(lineContent: string): boolean {
		return lineContent.trim().length === 0;
	}

	private _createDecoration(model: ITextModel, lineNumber: number, lineHeight: number): IModelDeltaDecoration {
		return {
			range: new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
			options: ModelDecorationOptions.createDynamic({
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				description: 'shrink-empty-line',
				lineHeight
			})
		};
	}

	private _getDecorations(model: ITextModel, ranges: readonly LineRange[], lineHeight: number): IModelDeltaDecoration[] {
		const decorations: IModelDeltaDecoration[] = [];
		for (const range of ranges) {
			for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
				if (this._isEmptyLine(model.getLineContent(lineNumber))) {
					decorations.push(this._createDecoration(model, lineNumber, lineHeight));
				}
			}
		}
		return decorations;
	}

	private _updateAllDecorations(): void {
		const model = this.editor.getModel();
		const lineHeight = this._getLineHeightMultiplier();
		let decorations: IModelDeltaDecoration[] = [];
		if (model && lineHeight) {
			decorations = this._getDecorations(model, [{ startLineNumber: 1, endLineNumber: model.getLineCount() }], lineHeight);
		}
		this._replaceDecorations(Array.from(this._decorationIds), decorations);
	}

	private _updateDecorations(event: IModelContentChangedEvent): void {
		if (this._mode === 'off') {
			return;
		}
		const model = this.editor.getModel();
		const lineHeight = this._getLineHeightMultiplier();
		if (!model || !lineHeight) {
			return;
		}
		const changedRanges = event.changes.map(change => ({
			startLineNumber: change.range.startLineNumber,
			endLineNumber: Math.min(change.range.startLineNumber + countEOL(change.text)[0], model.getLineCount()),
		}));
		const oldDecorations = new Set<string>();
		for (const range of changedRanges) {
			const modelRange = new Range(range.startLineNumber, 1, range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
			for (const decoration of model.getDecorationsInRange(modelRange)) {
				if (this._decorationIds.has(decoration.id)) {
					oldDecorations.add(decoration.id);
				}
			}
		}
		const newDecorations = this._getDecorations(model, changedRanges, lineHeight);
		this._replaceDecorations(Array.from(oldDecorations), newDecorations);
	}

	private _replaceDecorations(oldDecorations: string[], newDecorations: readonly IModelDeltaDecoration[]): void {
		this.editor.changeDecorations(accessor => {
			const newDecorationIds = accessor.deltaDecorations(oldDecorations, newDecorations);
			for (const decorationId of oldDecorations) {
				this._decorationIds.delete(decorationId);
			}
			for (const decorationId of newDecorationIds) {
				this._decorationIds.add(decorationId);
			}
		});
	}

	public override dispose(): void {
		this._replaceDecorations(Array.from(this._decorationIds), []);
		super.dispose();
	}
}

registerEditorContribution(ShrinkEmptyLinesController.ID, ShrinkEmptyLinesController, EditorContributionInstantiation.Eager);
