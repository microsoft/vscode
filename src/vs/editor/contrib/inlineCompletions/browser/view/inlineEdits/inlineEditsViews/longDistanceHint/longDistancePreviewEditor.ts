/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n } from '../../../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { IObservable, derived, constObservable, IReader, autorun, observableValue } from '../../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../../browser/observableCodeEditor.js';
import { EmbeddedCodeEditorWidget } from '../../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { IDimension } from '../../../../../../../common/core/2d/dimension.js';
import { Position } from '../../../../../../../common/core/position.js';
import { Range } from '../../../../../../../common/core/range.js';
import { LineRange } from '../../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../../common/core/ranges/offsetRange.js';
import { DetailedLineRangeMapping } from '../../../../../../../common/diff/rangeMapping.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../../../../common/model.js';
import { ModelDecorationOptions } from '../../../../../../../common/model/textModel.js';
import { InlineCompletionContextKeys } from '../../../../controller/inlineCompletionContextKeys.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../components/gutterIndicatorView.js';
import { InlineEditTabAction } from '../../inlineEditsViewInterface.js';
import { classNames, maxContentWidthInRange } from '../../utils/utils.js';
import { JumpToView } from '../jumpToView.js';

export interface ILongDistancePreviewProps {
	nextCursorPosition: Position | null; // assert: nextCursorPosition !== null  xor  diff.length > 0
	diff: DetailedLineRangeMapping[];
	model: SimpleInlineSuggestModel;
	inlineSuggestInfo: InlineSuggestionGutterMenuData;
}

export class LongDistancePreviewEditor extends Disposable {
	public readonly previewEditor;
	private readonly _previewEditorObs;

	private readonly _previewRef = n.ref<HTMLDivElement>();
	public readonly element = n.div({ class: 'preview', style: { /*pointerEvents: 'none'*/ }, ref: this._previewRef });

	private _parentEditorObs: ObservableCodeEditor;

	constructor(
		private readonly _previewTextModel: ITextModel,
		private readonly _properties: IObservable<ILongDistancePreviewProps | undefined>,
		private readonly _parentEditor: ICodeEditor,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.previewEditor = this._register(this._createPreviewEditor());
		this._parentEditorObs = observableCodeEditor(this._parentEditor);

		this._register(autorun(reader => {
			const tm = this._state.read(reader)?.textModel || null;

			if (tm) {
				// Avoid transitions from tm -> null -> tm, where tm -> tm would be a no-op.
				this.previewEditor.setModel(tm);
			}
		}));

		this._previewEditorObs = observableCodeEditor(this.previewEditor);
		this._register(this._previewEditorObs.setDecorations(derived(reader => {
			const state = this._state.read(reader);
			const decorations = this._editorDecorations.read(reader);
			return (state?.mode === 'original' ? decorations?.originalDecorations : decorations?.modifiedDecorations) ?? [];
		})));

		const showJumpToDecoration = false;

		if (showJumpToDecoration) {
			this._register(this._instantiationService.createInstance(JumpToView, this._previewEditorObs, { style: 'cursor' }, derived(reader => {
				const p = this._properties.read(reader);
				if (!p || !p.nextCursorPosition) {
					return undefined;
				}
				return {
					jumpToPosition: p.nextCursorPosition,

				};
			})));
		}

		// Mirror the cursor position. Allows the gutter arrow to point in the correct direction.
		this._register(autorun((reader) => {
			if (!this._properties.read(reader)) {
				return;
			}
			const cursorPosition = this._parentEditorObs.cursorPosition.read(reader);
			if (cursorPosition) {
				this.previewEditor.setPosition(this._previewTextModel.validatePosition(cursorPosition), 'longDistanceHintPreview');
			}
		}));

		this._register(autorun(reader => {
			const state = this._state.read(reader);
			if (!state) {
				return;
			}
			// Ensure there is enough space to the left of the line number for the gutter indicator to fits.
			const lineNumberDigets = state.visibleLineRange.startLineNumber.toString().length;
			this.previewEditor.updateOptions({ lineNumbersMinChars: lineNumberDigets + 1 });
		}));

		this._register(this._instantiationService.createInstance(
			InlineEditsGutterIndicator,
			this._previewEditorObs,
			derived(reader => {
				const state = this._state.read(reader);
				if (!state) { return undefined; }
				const props = this._properties.read(reader);
				if (!props) { return undefined; }
				return new InlineEditsGutterIndicatorData(
					props.inlineSuggestInfo,
					LineRange.ofLength(state.visibleLineRange.startLineNumber, 1),
					props.model,
					undefined,
				);
			}),
			this._tabAction,
			constObservable(0),
			constObservable(false),
			observableValue(this, false),
		));

		this.updatePreviewEditorEffect.recomputeInitiallyAndOnChange(this._store);
	}

	private readonly _state = derived(this, reader => {
		const props = this._properties.read(reader);
		if (!props) {
			return undefined;
		}

		let mode: 'original' | 'modified';
		let visibleRange: LineRange;

		if (props.nextCursorPosition !== null) {
			mode = 'original';
			visibleRange = LineRange.ofLength(props.nextCursorPosition.lineNumber, 1);
		} else {
			if (props.diff[0].innerChanges?.every(c => c.modifiedRange.isEmpty())) {
				mode = 'original';
				visibleRange = LineRange.ofLength(props.diff[0].original.startLineNumber, 1);
			} else {
				mode = 'modified';
				visibleRange = LineRange.ofLength(props.diff[0].modified.startLineNumber, 1);
			}
		}

		const textModel = mode === 'original' ? this._parentEditorObs.model.read(reader) : this._previewTextModel;
		return {
			mode,
			visibleLineRange: visibleRange,
			textModel,
			diff: props.diff,
		};
	});

	private _createPreviewEditor() {
		return this._instantiationService.createInstance(
			EmbeddedCodeEditorWidget,
			this._previewRef.element,
			{
				glyphMargin: false,
				lineNumbers: 'on',
				minimap: { enabled: false },
				guides: {
					indentation: false,
					bracketPairs: false,
					bracketPairsHorizontal: false,
					highlightActiveIndentation: false,
				},
				editContext: false, // is a bit faster
				rulers: [],
				padding: { top: 0, bottom: 0 },
				//folding: false,
				selectOnLineNumbers: false,
				selectionHighlight: false,
				columnSelection: false,
				overviewRulerBorder: false,
				overviewRulerLanes: 0,
				//lineDecorationsWidth: 0,
				//lineNumbersMinChars: 0,
				revealHorizontalRightPadding: 0,
				bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
				scrollBeyondLastLine: false,
				scrollbar: {
					vertical: 'hidden',
					horizontal: 'hidden',
					handleMouseWheel: false,
				},
				readOnly: true,
				wordWrap: 'off',
				wordWrapOverride1: 'off',
				wordWrapOverride2: 'off',
			},
			{
				contextKeyValues: {
					[InlineCompletionContextKeys.inInlineEditsPreviewEditor.key]: true,
				},
				contributions: [],
			},
			this._parentEditor
		);
	}

	public readonly updatePreviewEditorEffect = derived(this, reader => {
		// this._widgetContent.readEffect(reader);
		this._previewEditorObs.model.read(reader); // update when the model is set

		const range = this._state.read(reader)?.visibleLineRange;
		if (!range) {
			return;
		}
		const hiddenAreas: Range[] = [];
		if (range.startLineNumber > 1) {
			hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
		}
		if (range.endLineNumberExclusive < this._previewTextModel.getLineCount() + 1) {
			hiddenAreas.push(new Range(range.endLineNumberExclusive, 1, this._previewTextModel.getLineCount() + 1, 1));
		}
		this.previewEditor.setHiddenAreas(hiddenAreas, undefined, true);
	});

	public readonly horizontalContentRangeInPreviewEditorToShow = derived(this, reader => {
		return this._getHorizontalContentRangeInPreviewEditorToShow(this.previewEditor, reader);
	});

	public readonly contentHeight = derived(this, (reader) => {
		const viewState = this._state.read(reader);
		if (!viewState) {
			return constObservable(null);
		}

		const previewEditorHeight = this._previewEditorObs.observeLineHeightForLine(viewState.visibleLineRange.startLineNumber);
		return previewEditorHeight;
	}).flatten();

	private _getHorizontalContentRangeInPreviewEditorToShow(editor: ICodeEditor, reader: IReader) {
		const state = this._state.read(reader);
		if (!state) { return undefined; }

		const diff = state.diff;
		const jumpToPos = this._properties.read(reader)?.nextCursorPosition;

		const visibleRange = state.visibleLineRange;
		const l = this._previewEditorObs.layoutInfo.read(reader);
		const trueContentWidth = maxContentWidthInRange(this._previewEditorObs, visibleRange, reader);

		let firstCharacterChange: Range;
		if (jumpToPos) {
			firstCharacterChange = Range.fromPositions(jumpToPos);
		} else if (diff[0].innerChanges) {
			firstCharacterChange = state.mode === 'modified' ? diff[0].innerChanges[0].modifiedRange : diff[0].innerChanges[0].originalRange;
		} else {
			return undefined;
		}


		// find the horizontal range we want to show.
		const preferredRange = growUntilVariableBoundaries(editor.getModel()!, firstCharacterChange, 5);
		const left = this._previewEditorObs.getLeftOfPosition(preferredRange.getStartPosition(), reader);
		const right = Math.min(left, trueContentWidth); //this._previewEditorObs.getLeftOfPosition(preferredRange.getEndPosition(), reader);

		const indentCol = editor.getModel()!.getLineFirstNonWhitespaceColumn(preferredRange.startLineNumber);
		const indentationEnd = this._previewEditorObs.getLeftOfPosition(new Position(preferredRange.startLineNumber, indentCol), reader);

		const preferredRangeToReveal = new OffsetRange(left, right);

		return {
			indentationEnd,
			preferredRangeToReveal,
			maxEditorWidth: trueContentWidth + l.contentLeft,
			contentWidth: trueContentWidth,
			nonContentWidth: l.contentLeft, // Width of area that is not content
		};
	}

	public layout(dimension: IDimension, desiredPreviewEditorScrollLeft: number): void {
		this.previewEditor.layout(dimension);
		this._previewEditorObs.editor.setScrollLeft(desiredPreviewEditorScrollLeft);
	}

	private readonly _editorDecorations = derived(this, reader => {
		const state = this._state.read(reader);
		if (!state) { return undefined; }

		const diff = {
			mode: 'insertionInline' as const,
			diff: state.diff,
		};
		const originalDecorations: IModelDeltaDecoration[] = [];
		const modifiedDecorations: IModelDeltaDecoration[] = [];

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

		const hideEmptyInnerDecorations = true; // diff.mode === 'lineReplacement';
		for (const m of diff.diff) {
			if (m.modified.isEmpty || m.original.isEmpty) {
				if (!m.original.isEmpty) {
					originalDecorations.push({ range: m.original.toInclusiveRange()!, options: diffWholeLineDeleteDecoration });
				}
				if (!m.modified.isEmpty) {
					modifiedDecorations.push({ range: m.modified.toInclusiveRange()!, options: diffWholeLineAddDecoration });
				}
			} else {
				for (const i of m.innerChanges || []) {
					// Don't show empty markers outside the line range
					if (m.original.contains(i.originalRange.startLineNumber) && !(hideEmptyInnerDecorations && i.originalRange.isEmpty())) {
						originalDecorations.push({
							range: i.originalRange,
							options: {
								description: 'char-delete',
								shouldFillLineOnLineBreak: false,
								className: classNames(
									'inlineCompletions-char-delete',
									// i.originalRange.isSingleLine() && diff.mode === 'insertionInline' && 'single-line-inline',
									i.originalRange.isEmpty() && 'empty',
								),
								zIndex: 1
							}
						});
					}
					if (m.modified.contains(i.modifiedRange.startLineNumber)) {
						modifiedDecorations.push({
							range: i.modifiedRange,
							options: diffAddDecoration
						});
					}
				}
			}
		}

		return { originalDecorations, modifiedDecorations };
	});
}

/*
 * Grows the range on each ends until it includes a none-variable-name character
 * or the next character would be a whitespace character
 * or the maxGrow limit is reached
 */
function growUntilVariableBoundaries(textModel: ITextModel, range: Range, maxGrow: number): Range {
	const startPosition = range.getStartPosition();
	const endPosition = range.getEndPosition();
	const line = textModel.getLineContent(startPosition.lineNumber);

	function isVariableNameCharacter(col: number): boolean {
		const char = line.charAt(col - 1);
		return (/[a-zA-Z0-9_]/).test(char);
	}

	function isWhitespace(col: number): boolean {
		const char = line.charAt(col - 1);
		return char === ' ' || char === '\t';
	}

	let startColumn = startPosition.column;
	while (startColumn > 1 && isVariableNameCharacter(startColumn) && !isWhitespace(startColumn - 1) && startPosition.column - startColumn < maxGrow) {
		startColumn--;
	}

	let endColumn = endPosition.column - 1;
	while (endColumn <= line.length && isVariableNameCharacter(endColumn) && !isWhitespace(endColumn + 1) && endColumn - endPosition.column < maxGrow) {
		endColumn++;
	}

	return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endColumn + 1);
}
