/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { ClassNameReference, DynamicCssRules } from '../../../browser/editorDom.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../common/config/editorOptions.js';
import { countEOL } from '../../../common/core/misc/eolCounter.js';
import { Range } from '../../../common/core/range.js';
import { LineRange, LineRangeSet } from '../../../common/core/ranges/lineRange.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IModelDeltaDecoration, ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { IModelContentChangedEvent } from '../../../common/textModelEvents.js';

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
				this._updateDecorationOptions(event);
			}
		}));
		this._register(this.editor.onDidChangeModelContent(event => this._updateDecorations(event)));
		this._updateDecorationOptions();
	}

	private _updateDecorationOptions(event?: ConfigurationChangedEvent): void {
		const multiplier = this.editor.getOption(EditorOption.effectiveShrinkEmptyLines);
		if (multiplier === 1) {
			this._decorationOptions = undefined;
			this._fontSizeRule.clear();
			this._updateAllDecorations();
			return;
		}
		const previousOptions = this._decorationOptions;
		const fontSize = `${this.editor.getOption(EditorOption.fontInfo).fontSize * multiplier}px`;
		let fontSizeOptions = previousOptions?.fontSize;
		if (!fontSizeOptions || fontSizeOptions.fontSize !== fontSize) {
			const fontSizeRule = this._ruleFactory.createClassNameRef({ fontSize });
			this._fontSizeRule.value = fontSizeRule;
			fontSizeOptions = ModelDecorationOptions.createDynamic({
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				description: 'shrink-empty-line-font-size',
				fontSize,
				inlineClassName: fontSizeRule.className
			});
		}
		let lineHeightOptions = previousOptions?.lineHeight;
		const lineHeightChanged = event?.hasChanged(EditorOption.lineHeight) ?? false;
		if (!lineHeightOptions || lineHeightChanged || lineHeightOptions.lineHeight !== multiplier) {
			lineHeightOptions = ModelDecorationOptions.createDynamic({
				stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
				description: 'shrink-empty-line-line-height',
				isWholeLine: true,
				lineHeight: multiplier,
			});
		}
		const decorationOptions = {
			lineHeight: lineHeightOptions,
			fontSize: fontSizeOptions,
		};
		this._decorationOptions = decorationOptions;
		if (!previousOptions) {
			this._updateAllDecorations();
			return;
		}
		if (previousOptions.lineHeight === decorationOptions.lineHeight && previousOptions.fontSize === decorationOptions.fontSize) {
			return;
		}
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		// Reuse ranges for style-only changes instead of rescanning the entire model with _updateAllDecorations.
		this.editor.changeDecorations(accessor => {
			for (const decorationId of this._decorationIds) {
				const options = model.getDecorationOptions(decorationId);
				if (options === previousOptions.lineHeight && options !== decorationOptions.lineHeight) {
					accessor.changeDecorationOptions(decorationId, decorationOptions.lineHeight);
				} else if (options === previousOptions.fontSize && options !== decorationOptions.fontSize) {
					accessor.changeDecorationOptions(decorationId, decorationOptions.fontSize);
				}
			}
		});
	}

	private _shouldShrinkLine(lineContent: string): boolean {
		return !/[\p{L}\p{N}]/u.test(lineContent);
	}

	private _getDecorations(model: ITextModel, ranges: readonly LineRange[]): IModelDeltaDecoration[] {
		const decorations: IModelDeltaDecoration[] = [];
		if (!this._decorationOptions) {
			return decorations;
		}
		for (const range of ranges) {
			for (let lineNumber = range.startLineNumber; lineNumber < range.endLineNumberExclusive; lineNumber++) {
				const lineContent = model.getLineContent(lineNumber);
				if (this._shouldShrinkLine(lineContent)) {
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
			decorations = this._getDecorations(model, [new LineRange(1, model.getLineCount() + 1)]);
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
		let lineDelta = 0;
		const changedRanges = new LineRangeSet();
		// Changes use pre-edit coordinates and are ordered from bottom to top.
		for (let i = event.changes.length - 1; i >= 0; i--) {
			const change = event.changes[i];
			const insertedLines = countEOL(change.text)[0];
			const startLineNumber = change.range.startLineNumber + lineDelta;
			changedRanges.addRange(new LineRange(startLineNumber, Math.min(startLineNumber + insertedLines + 1, model.getLineCount() + 1)));
			lineDelta += insertedLines - (change.range.endLineNumber - change.range.startLineNumber);
		}
		const oldDecorations = new Set<string>();
		for (const range of changedRanges.ranges) {
			const endLineNumber = range.endLineNumberExclusive - 1;
			const modelRange = new Range(range.startLineNumber, 1, endLineNumber, model.getLineMaxColumn(endLineNumber));
			for (const decoration of model.getDecorationsInRange(modelRange)) {
				if (this._decorationIds.has(decoration.id)) {
					oldDecorations.add(decoration.id);
				}
			}
		}
		const newDecorations = this._getDecorations(model, changedRanges.ranges);
		this._replaceDecorations(Array.from(oldDecorations), newDecorations);
	}

	private _replaceDecorations(oldDecorations: string[], newDecorations: readonly IModelDeltaDecoration[]): void {
		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			return;
		}
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
