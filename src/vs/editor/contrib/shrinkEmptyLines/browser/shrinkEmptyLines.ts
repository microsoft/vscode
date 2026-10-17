/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { ClassNameReference, DynamicCssRules } from '../../../browser/editorDom.js';
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

	private _decorationOptions: { lineHeight: ModelDecorationOptions; fontSize: ModelDecorationOptions } | undefined;
	private _decorationIds = new Set<string>();
	private readonly _ruleFactory: DynamicCssRules;
	private readonly _fontSizeRule = this._register(new MutableDisposable<ClassNameReference>());

	constructor(private readonly editor: ICodeEditor) {
		super();
		this._ruleFactory = this._register(new DynamicCssRules(editor));
		this._register(this.editor.onDidChangeModel(() => {
			this._decorationIds.clear();
			this._updateAllDecorations();
		}));
		this._register(this.editor.onDidChangeConfiguration(event => {
			if (event.hasChanged(EditorOption.effectiveShrinkEmptyLines)
				|| event.hasChanged(EditorOption.fontInfo)
				|| event.hasChanged(EditorOption.lineHeight)) {
				this._updateDecorationOptions();
				this._updateAllDecorations();
			}
		}));
		this._register(this.editor.onDidChangeHiddenAreas(() => this._updateAllDecorations()));
		this._register(this.editor.onDidChangeModelContent(event => this._updateDecorations(event)));
		this._updateDecorationOptions();
		this._updateAllDecorations();
	}

	private _updateDecorationOptions(): void {
		const multiplier = this.editor.getOption(EditorOption.effectiveShrinkEmptyLines);
		if (multiplier === 0 || multiplier === 1) {
			this._decorationOptions = undefined;
			this._fontSizeRule.clear();
			return;
		}
		const fontSize = `${this.editor.getOption(EditorOption.fontInfo).fontSize * multiplier}px`;
		this._fontSizeRule.value = this._ruleFactory.createClassNameRef({ fontSize });
		this._decorationOptions = {
			lineHeight: ModelDecorationOptions.createDynamic({
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				description: 'shrink-empty-line-line-height',
				isWholeLine: true,
				lineHeight: multiplier,
			}),
			fontSize: ModelDecorationOptions.createDynamic({
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				description: 'shrink-empty-line-font-size',
				fontSize,
				inlineClassName: this._fontSizeRule.value.className
			}),
		};
	}

	private _shouldShrinkLine(lineContent: string): boolean {
		return !/[\p{L}\p{N}]/u.test(lineContent);
	}

	private _getDecorations(model: ITextModel, ranges: readonly LineRange[]): IModelDeltaDecoration[] {
		const decorations: IModelDeltaDecoration[] = [];
		if (!this._decorationOptions) {
			return decorations;
		}
		const hiddenAreas = this.editor._getViewModel()?.getHiddenAreas() ?? [];
		for (const range of ranges) {
			for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
				const isHidden = hiddenAreas.some(area => area.startLineNumber <= lineNumber && lineNumber <= area.endLineNumber);
				const lineContent = model.getLineContent(lineNumber);
				if (!isHidden && this._shouldShrinkLine(lineContent)) {
					decorations.push({
						range: new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
						options: this._decorationOptions.lineHeight,
					});
					const lineStartOffset = model.getOffsetAt({ lineNumber, column: 1 });
					for (const match of lineContent.matchAll(/\S+/g)) {
						const startOffset = lineStartOffset + match.index;
						decorations.push({
							range: Range.fromPositions(
								model.getPositionAt(startOffset),
								model.getPositionAt(startOffset + match[0].length),
							),
							options: this._decorationOptions.fontSize,
						});
					}
				}
			}
		}
		return decorations;
	}

	private _updateAllDecorations(): void {
		const model = this.editor.getModel();
		let decorations: IModelDeltaDecoration[] = [];
		if (model) {
			decorations = this._getDecorations(model, [{ startLineNumber: 1, endLineNumber: model.getLineCount() }]);
		}
		this._replaceDecorations(Array.from(this._decorationIds), decorations);
	}

	private _updateDecorations(event: IModelContentChangedEvent): void {
		if (event.isFlush) {
			this._updateAllDecorations();
			return;
		}
		const model = this.editor.getModel();
		if (!model || !this._decorationOptions) {
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
		const newDecorations = this._getDecorations(model, changedRanges);
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
