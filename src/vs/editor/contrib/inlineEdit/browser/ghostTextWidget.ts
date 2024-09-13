/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import './inlineEdit.css';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { IModelDeltaDecoration, ITextModel, InjectedTextCursorStops } from '../../../common/model.js';
import { LineDecoration } from '../../../common/viewLayout/lineDecorations.js';
import { InlineDecorationType } from '../../../common/viewModel.js';
import { AdditionalLinesWidget, LineData } from '../../inlineCompletions/browser/view/ghostTextView.js';
import { GhostText } from '../../inlineCompletions/browser/model/ghostText.js';
import { ColumnRange } from '../../inlineCompletions/browser/utils.js';
import { diffDeleteDecoration, diffLineDeleteDecorationBackgroundWithIndicator } from '../../../browser/widget/diffEditor/registrations.contribution.js';
import { LineTokens } from '../../../common/tokens/lineTokens.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';

export const INLINE_EDIT_DESCRIPTION = 'inline-edit';
export interface IGhostTextWidgetModel {
	readonly targetTextModel: IObservable<ITextModel | undefined>;
	readonly ghostText: IObservable<GhostText | undefined>;
	readonly minReservedLineCount: IObservable<number>;
	readonly range: IObservable<IRange | undefined>;
}

export class GhostTextWidget extends Disposable {
	private readonly isDisposed = observableValue(this, false);
	private readonly currentTextModel = observableFromEvent(this, this._editor.onDidChangeModel, () => /** @description editor.model */ this._editor.getModel());

	private readonly _editorObs = observableCodeEditor(this._editor);

	constructor(
		private readonly _editor: ICodeEditor,
		readonly model: IGhostTextWidgetModel,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		this._register(toDisposable(() => { this.isDisposed.set(true, undefined); }));

		this._register(this._editorObs.setDecorations(this.decorations));
	}

	private readonly uiState = derived(this, reader => {
		if (this.isDisposed.read(reader)) {
			return undefined;
		}
		const textModel = this.currentTextModel.read(reader);
		if (textModel !== this.model.targetTextModel.read(reader)) {
			return undefined;
		}
		const ghostText = this.model.ghostText.read(reader);
		if (!ghostText) {
			return undefined;
		}

		let range = this.model.range?.read(reader);
		//if range is empty, we want to remove it
		if (range && range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
			range = undefined;
		}
		//check if both range and text are single line - in this case we want to do inline replacement
		//rather than replacing whole lines
		const isSingleLine = (range ? range.startLineNumber === range.endLineNumber : true) && ghostText.parts.length === 1 && ghostText.parts[0].lines.length === 1;

		//check if we're just removing code
		const isPureRemove = ghostText.parts.length === 1 && ghostText.parts[0].lines.every(l => l.length === 0);

		const inlineTexts: { column: number; text: string; preview: boolean }[] = [];
		const additionalLines: { content: string; decorations: LineDecoration[] }[] = [];

		function addToAdditionalLines(lines: readonly string[], className: string | undefined) {
			if (additionalLines.length > 0) {
				const lastLine = additionalLines[additionalLines.length - 1];
				if (className) {
					lastLine.decorations.push(
						new LineDecoration(
							lastLine.content.length + 1,
							lastLine.content.length + 1 + lines[0].length,
							className,
							InlineDecorationType.Regular
						)
					);
				}
				lastLine.content += lines[0];

				lines = lines.slice(1);
			}
			for (const line of lines) {
				additionalLines.push({
					content: line,
					decorations: className ? [new LineDecoration(1, line.length + 1, className, InlineDecorationType.Regular)] : []
				});
			}
		}

		const textBufferLine = textModel.getLineContent(ghostText.lineNumber);

		let hiddenTextStartColumn: number | undefined = undefined;
		let lastIdx = 0;
		if (!isPureRemove && (isSingleLine || !range)) {
			for (const part of ghostText.parts) {
				let lines = part.lines;
				//If remove range is set, we want to push all new liens to virtual area
				if (range && !isSingleLine) {
					addToAdditionalLines(lines, INLINE_EDIT_DESCRIPTION);
					lines = [];
				}
				if (hiddenTextStartColumn === undefined) {
					inlineTexts.push({
						column: part.column,
						text: lines[0],
						preview: part.preview,
					});
					lines = lines.slice(1);
				} else {
					addToAdditionalLines([textBufferLine.substring(lastIdx, part.column - 1)], undefined);
				}

				if (lines.length > 0) {
					addToAdditionalLines(lines, INLINE_EDIT_DESCRIPTION);
					if (hiddenTextStartColumn === undefined && part.column <= textBufferLine.length) {
						hiddenTextStartColumn = part.column;
					}
				}

				lastIdx = part.column - 1;
			}
			if (hiddenTextStartColumn !== undefined) {
				addToAdditionalLines([textBufferLine.substring(lastIdx)], undefined);
			}
		}

		const hiddenRange = hiddenTextStartColumn !== undefined ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : undefined;

		const lineNumber =
			(isSingleLine || !range) ? ghostText.lineNumber : range.endLineNumber - 1;

		return {
			inlineTexts,
			additionalLines,
			hiddenRange,
			lineNumber,
			additionalReservedLineCount: this.model.minReservedLineCount.read(reader),
			targetTextModel: textModel,
			range,
			isSingleLine,
			isPureRemove,
		};
	});

	private readonly decorations = derived(this, reader => {
		const uiState = this.uiState.read(reader);
		if (!uiState) {
			return [];
		}

		const decorations: IModelDeltaDecoration[] = [];

		if (uiState.hiddenRange) {
			decorations.push({
				range: uiState.hiddenRange.toRange(uiState.lineNumber),
				options: { inlineClassName: 'inline-edit-hidden', description: 'inline-edit-hidden', }
			});
		}

		if (uiState.range) {
			const ranges = [];
			if (uiState.isSingleLine) {
				ranges.push(uiState.range);
			}
			else if (!uiState.isPureRemove) {
				const lines = uiState.range.endLineNumber - uiState.range.startLineNumber;
				for (let i = 0; i < lines; i++) {
					const line = uiState.range.startLineNumber + i;
					const firstNonWhitespace = uiState.targetTextModel.getLineFirstNonWhitespaceColumn(line);
					const lastNonWhitespace = uiState.targetTextModel.getLineLastNonWhitespaceColumn(line);
					const range = new Range(line, firstNonWhitespace, line, lastNonWhitespace);
					ranges.push(range);
				}
			}
			for (const range of ranges) {
				decorations.push({
					range,
					options: diffDeleteDecoration
				});
			}
		}
		if (uiState.range && !uiState.isSingleLine && uiState.isPureRemove) {
			const r = new Range(uiState.range.startLineNumber, 1, uiState.range.endLineNumber - 1, 1);

			decorations.push({
				range: r,
				options: diffLineDeleteDecorationBackgroundWithIndicator
			});

		}

		for (const p of uiState.inlineTexts) {

			decorations.push({
				range: Range.fromPositions(new Position(uiState.lineNumber, p.column)),
				options: {
					description: INLINE_EDIT_DESCRIPTION,
					after: { content: p.text, inlineClassName: p.preview ? 'inline-edit-decoration-preview' : 'inline-edit-decoration', cursorStops: InjectedTextCursorStops.Left },
					showIfCollapsed: true,
				}
			});
		}

		return decorations;
	});

	private readonly additionalLinesWidget = this._register(
		new AdditionalLinesWidget(
			this._editor,
			derived(reader => {
				/** @description lines */
				const uiState = this.uiState.read(reader);
				return uiState && !uiState.isPureRemove && (uiState.isSingleLine || !uiState.range) ? {
					lineNumber: uiState.lineNumber,
					additionalLines: uiState.additionalLines.map(l => ({
						content: LineTokens.createEmpty(l.content, this.languageService.languageIdCodec),
						decorations: l.decorations
					} satisfies LineData)),
					minReservedLineCount: uiState.additionalReservedLineCount,
					targetTextModel: uiState.targetTextModel,
				} : undefined;
			})
		)
	);

	public ownsViewZone(viewZoneId: string): boolean {
		return this.additionalLinesWidget.viewZoneId === viewZoneId;
	}
}
