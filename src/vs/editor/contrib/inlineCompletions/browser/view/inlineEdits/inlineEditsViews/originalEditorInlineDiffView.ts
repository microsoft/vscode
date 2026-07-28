/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, IObservable, observableFromEvent } from '../../../../../../../base/common/observable.js';
import { ICodeEditor, MouseTargetType } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { rangeIsSingleLine } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/diffEditorViewZones.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../common/core/range.js';
import { AbstractText } from '../../../../../../common/core/text/abstractText.js';
import { DetailedLineRangeMapping } from '../../../../../../common/diff/rangeMapping.js';
import { EndOfLinePreference, IModelDeltaDecoration, InjectedTextCursorStops, ITextModel } from '../../../../../../common/model.js';
import { ModelDecorationOptions } from '../../../../../../common/model/textModel.js';
import { IInlineEditsView, InlineEditClickEvent } from '../inlineEditsViewInterface.js';
import { classNames } from '../utils/utils.js';
import { InlineCompletionEditorType } from '../../../model/provideInlineCompletions.js';

export interface IOriginalEditorInlineDiffViewState {
	diff: DetailedLineRangeMapping[];
	modifiedText: AbstractText;
	mode: 'insertionInline' | 'sideBySide' | 'deletion' | 'lineReplacement';
	editorType: InlineCompletionEditorType;

	modifiedCodeEditor: ICodeEditor;
}

export class OriginalEditorInlineDiffView extends Disposable implements IInlineEditsView {
	public static supportsInlineDiffRendering(mapping: DetailedLineRangeMapping): boolean {
		return allowsTrueInlineDiffRendering(mapping);
	}

	private readonly _onDidClick = this._register(new Emitter<InlineEditClickEvent>());
	readonly onDidClick = this._onDidClick.event;

	readonly isHovered;

	private readonly _tokenizationFinished;

	constructor(
		private readonly _originalEditor: ICodeEditor,
		private readonly _state: IObservable<IOriginalEditorInlineDiffViewState | undefined>,
		private readonly _modifiedTextModel: ITextModel,
	) {
		super();
		this.isHovered = observableCodeEditor(this._originalEditor).isTargetHovered(
			p => p.target.type === MouseTargetType.CONTENT_TEXT &&
				p.target.detail.injectedText?.options.attachedData instanceof InlineEditAttachedData &&
				p.target.detail.injectedText.options.attachedData.owner === this,
			this._store
		);
		this._tokenizationFinished = modelTokenizationFinished(this._modifiedTextModel);
		this._decorations = derived(this, reader => {
			const diff = this._state.read(reader);
			if (!diff) { return undefined; }

			const modified = diff.modifiedText;
			const showInline = diff.mode === 'insertionInline';
			const hasOneInnerChange = diff.diff.length === 1 && diff.diff[0].innerChanges?.length === 1;

			const showEmptyDecorations = true;

			const originalDecorations: IModelDeltaDecoration[] = [];
			const modifiedDecorations: IModelDeltaDecoration[] = [];

			const diffLineAddDecorationBackground = ModelDecorationOptions.register({
				className: 'inlineCompletions-line-insert',
				description: 'line-insert',
				isWholeLine: true,
				marginClassName: 'gutter-insert',
			});

			const diffLineDeleteDecorationBackground = ModelDecorationOptions.register({
				className: 'inlineCompletions-line-delete',
				description: 'line-delete',
				isWholeLine: true,
				marginClassName: 'gutter-delete',
			});

			const diffWholeLineDeleteDecoration = ModelDecorationOptions.register({
				className: 'inlineCompletions-char-delete',
				description: 'char-delete',
				isWholeLine: false,
				zIndex: 1, // be on top of diff background decoration
			});

			const diffWholeLineAddDecoration = ModelDecorationOptions.register({
				className: 'inlineCompletions-char-insert',
				description: 'char-insert',
				isWholeLine: true,
			});

			const diffAddDecoration = ModelDecorationOptions.register({
				className: 'inlineCompletions-char-insert',
				description: 'char-insert',
				shouldFillLineOnLineBreak: true,
			});

			const diffAddDecorationEmpty = ModelDecorationOptions.register({
				className: 'inlineCompletions-char-insert diff-range-empty',
				description: 'char-insert diff-range-empty',
			});

			const NESOriginalBackground = ModelDecorationOptions.register({
				className: 'inlineCompletions-original-lines',
				description: 'inlineCompletions-original-lines',
				isWholeLine: false,
				shouldFillLineOnLineBreak: true,
			});

			const showFullLineDecorations = diff.mode !== 'sideBySide' && diff.mode !== 'deletion' && diff.mode !== 'insertionInline' && diff.mode !== 'lineReplacement';
			const hideEmptyInnerDecorations = diff.mode === 'lineReplacement';
			for (const m of diff.diff) {
				if (showFullLineDecorations) {
					if (!m.original.isEmpty) {
						originalDecorations.push({
							range: m.original.toInclusiveRange()!,
							options: diffLineDeleteDecorationBackground,
						});
					}
					if (!m.modified.isEmpty) {
						modifiedDecorations.push({
							range: m.modified.toInclusiveRange()!,
							options: diffLineAddDecorationBackground,
						});
					}
				}

				if (m.modified.isEmpty || m.original.isEmpty) {
					if (!m.original.isEmpty) {
						originalDecorations.push({ range: m.original.toInclusiveRange()!, options: diffWholeLineDeleteDecoration });
					}
					if (!m.modified.isEmpty) {
						modifiedDecorations.push({ range: m.modified.toInclusiveRange()!, options: diffWholeLineAddDecoration });
					}
				} else {
					const useInlineDiff = showInline && allowsTrueInlineDiffRendering(m);
					for (const i of m.innerChanges || []) {
						// Don't show empty markers outside the line range
						if (m.original.contains(i.originalRange.startLineNumber) && !(hideEmptyInnerDecorations && i.originalRange.isEmpty())) {
							const replacedText = this._originalEditor.getModel()?.getValueInRange(i.originalRange, EndOfLinePreference.LF);
							originalDecorations.push({
								range: i.originalRange,
								options: {
									description: 'char-delete',
									shouldFillLineOnLineBreak: false,
									className: classNames(
										'inlineCompletions-char-delete',
										i.originalRange.isSingleLine() && diff.mode === 'insertionInline' && 'single-line-inline',
										i.originalRange.isEmpty() && 'empty',
										((i.originalRange.isEmpty() && hasOneInnerChange || diff.mode === 'deletion' && replacedText === '\n') && showEmptyDecorations && !useInlineDiff) && 'diff-range-empty'
									),
									inlineClassName: useInlineDiff ? classNames('strike-through', 'inlineCompletions') : null,
									zIndex: 1
								}
							});
						}
						if (m.modified.contains(i.modifiedRange.startLineNumber)) {
							modifiedDecorations.push({
								range: i.modifiedRange,
								options: (i.modifiedRange.isEmpty() && showEmptyDecorations && !useInlineDiff && hasOneInnerChange)
									? diffAddDecorationEmpty
									: diffAddDecoration
							});
						}
						if (useInlineDiff) {
							const insertedText = modified.getValueOfRange(i.modifiedRange);
							// when the injected text becomes long, the editor will split it into multiple spans
							// to be able to get the border around the start and end of the text, we need to split it into multiple segments
							const textSegments = insertedText.length > 3 ?
								[
									{ text: insertedText.slice(0, 1), extraClasses: ['start'], offsetRange: new OffsetRange(i.modifiedRange.startColumn - 1, i.modifiedRange.startColumn) },
									{ text: insertedText.slice(1, -1), extraClasses: [], offsetRange: new OffsetRange(i.modifiedRange.startColumn, i.modifiedRange.endColumn - 2) },
									{ text: insertedText.slice(-1), extraClasses: ['end'], offsetRange: new OffsetRange(i.modifiedRange.endColumn - 2, i.modifiedRange.endColumn - 1) }
								] :
								[
									{ text: insertedText, extraClasses: ['start', 'end'], offsetRange: new OffsetRange(i.modifiedRange.startColumn - 1, i.modifiedRange.endColumn) }
								];

							// Tokenization
							this._tokenizationFinished.read(reader); // reconsider when tokenization is finished
							const lineTokens = this._modifiedTextModel.tokenization.getLineTokens(i.modifiedRange.startLineNumber);

							for (const { text, extraClasses, offsetRange } of textSegments) {
								originalDecorations.push({
									range: Range.fromPositions(i.originalRange.getEndPosition()),
									options: {
										description: 'inserted-text',
										before: {
											tokens: lineTokens.getTokensInRange(offsetRange),
											content: text,
											inlineClassName: classNames(
												'inlineCompletions-char-insert',
												i.modifiedRange.isSingleLine() && diff.mode === 'insertionInline' && 'single-line-inline',
												...extraClasses // include extraClasses for additional styling if provided
											),
											cursorStops: InjectedTextCursorStops.None,
											attachedData: new InlineEditAttachedData(this),
										},
										zIndex: 2,
										showIfCollapsed: true,
									}
								});
							}
						}
					}
				}
			}

			if (diff.editorType === InlineCompletionEditorType.DiffEditor) {
				for (const m of diff.diff) {
					if (!m.original.isEmpty) {
						originalDecorations.push({
							range: m.original.toExclusiveRange(),
							options: NESOriginalBackground,
						});
					}
				}
			}

			return { originalDecorations, modifiedDecorations };
		});

		this._register(observableCodeEditor(this._originalEditor).setDecorations(this._decorations.map(d => d?.originalDecorations ?? [])));

		const modifiedCodeEditor = this._state.map(s => s?.modifiedCodeEditor);
		this._register(autorunWithStore((reader, store) => {
			const e = modifiedCodeEditor.read(reader);
			if (e) {
				store.add(observableCodeEditor(e).setDecorations(this._decorations.map(d => d?.modifiedDecorations ?? [])));
			}
		}));

		this._register(this._originalEditor.onMouseUp(e => {
			if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
				return;
			}
			const a = e.target.detail.injectedText?.options.attachedData;
			if (a instanceof InlineEditAttachedData && a.owner === this) {
				this._onDidClick.fire(new InlineEditClickEvent(e.event));
			}
		}));
	}

	private readonly _decorations;
}

class InlineEditAttachedData {
	constructor(public readonly owner: OriginalEditorInlineDiffView) { }
}

function allowsTrueInlineDiffRendering(mapping: DetailedLineRangeMapping): boolean {
	if (!mapping.innerChanges) {
		return false;
	}
	return mapping.innerChanges.every(c =>
		(rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange)));
}

let i = 0;
function modelTokenizationFinished(model: ITextModel): IObservable<number> {
	return observableFromEvent(model.onDidChangeTokens, () => i++);
}
