/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, IObservable } from '../../../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { rangeIsSingleLine } from '../../../../../browser/widget/diffEditor/components/diffEditorViewZones/diffEditorViewZones.js';
import { diffLineDeleteDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineAddDecorationBackground, diffWholeLineAddDecoration, diffAddDecorationEmpty, diffAddDecoration } from '../../../../../browser/widget/diffEditor/registrations.contribution.js';
import { Range } from '../../../../../common/core/range.js';
import { AbstractText } from '../../../../../common/core/textEdit.js';
import { DetailedLineRangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { IModelDeltaDecoration } from '../../../../../common/model.js';
import { ModelDecorationOptions } from '../../../../../common/model/textModel.js';
import { classNames } from './inlineEditsView.js';

export interface IOriginalEditorInlineDiffViewState {
	diff: DetailedLineRangeMapping[];
	modifiedText: AbstractText;
	showInline: boolean;
	modifiedCodeEditor: ICodeEditor;
}

export class OriginalEditorInlineDiffView extends Disposable {
	public static supportsInlineDiffRendering(mapping: DetailedLineRangeMapping): boolean {
		return allowsTrueInlineDiffRendering(mapping);
	}

	constructor(
		private readonly _originalEditor: ICodeEditor,
		private readonly _state: IObservable<IOriginalEditorInlineDiffViewState | undefined>,
	) {
		super();

		this._register(observableCodeEditor(this._originalEditor).setDecorations(this._decorations.map(d => d?.originalDecorations ?? [])));

		const modifiedCodeEditor = this._state.map(s => s?.modifiedCodeEditor);
		this._register(autorunWithStore((reader, store) => {
			const e = modifiedCodeEditor.read(reader);
			if (e) {
				store.add(observableCodeEditor(e).setDecorations(this._decorations.map(d => d?.modifiedDecorations ?? [])));
			}
		}));
	}

	private readonly _decorations = derived(this, reader => {
		const diff = this._state.read(reader);
		if (!diff) { return undefined; }

		const modified = diff.modifiedText;
		const showInline = diff.showInline;

		const renderIndicators = false;
		const showEmptyDecorations = true;

		const originalDecorations: IModelDeltaDecoration[] = [];
		const modifiedDecorations: IModelDeltaDecoration[] = [];

		for (const m of diff.diff) {
			const showFullLineDecorations = false;
			if (showFullLineDecorations) {
				if (!m.original.isEmpty) {
					originalDecorations.push({ range: m.original.toInclusiveRange()!, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
				}
				if (!m.modified.isEmpty) {
					modifiedDecorations.push({ range: m.modified.toInclusiveRange()!, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
				}
			}

			if (m.modified.isEmpty || m.original.isEmpty) {
				if (!m.original.isEmpty) {
					const diffWholeLineDeleteDecoration = ModelDecorationOptions.register({
						className: 'char-delete',
						description: 'char-delete',
						isWholeLine: false,
					});

					originalDecorations.push({ range: m.original.toInclusiveRange()!, options: diffWholeLineDeleteDecoration });
				}
				if (!m.modified.isEmpty) {
					modifiedDecorations.push({ range: m.modified.toInclusiveRange()!, options: diffWholeLineAddDecoration });
				}
			} else {
				const useInlineDiff = showInline && allowsTrueInlineDiffRendering(m);
				for (const i of m.innerChanges || []) {
					// Don't show empty markers outside the line range
					if (m.original.contains(i.originalRange.startLineNumber)) {
						originalDecorations.push({
							range: i.originalRange, options: {
								description: 'char-delete',
								shouldFillLineOnLineBreak: false,
								className: classNames(
									'char-delete',
									(i.originalRange.isEmpty() && showEmptyDecorations && !useInlineDiff) && 'diff-range-empty'
								),
								inlineClassName: useInlineDiff ? 'strike-through' : null,
								zIndex: 1
							}
						});
					}
					if (m.modified.contains(i.modifiedRange.startLineNumber)) {
						modifiedDecorations.push({ range: i.modifiedRange, options: (i.modifiedRange.isEmpty() && showEmptyDecorations && !useInlineDiff) ? diffAddDecorationEmpty : diffAddDecoration });
					}
					if (useInlineDiff) {
						const insertedText = modified.getValueOfRange(i.modifiedRange);
						originalDecorations.push({
							range: Range.fromPositions(i.originalRange.getEndPosition()),
							options: {
								description: 'inserted-text',
								before: {
									content: insertedText,
									inlineClassName: 'char-insert',
								},
								zIndex: 2,
								showIfCollapsed: true,
							}
						});
					}
				}
			}
		}

		return { originalDecorations, modifiedDecorations };
	});
}

function allowsTrueInlineDiffRendering(mapping: DetailedLineRangeMapping): boolean {
	if (!mapping.innerChanges) {
		return false;
	}
	return mapping.innerChanges.every(c =>
		(rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange))
		|| c.originalRange.equalsRange(new Range(1, 1, 1, 1))
	);
}
