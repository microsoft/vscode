/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h, svgElem } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, observableFromEvent } from '../../../../../../base/common/observable.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EmbeddedCodeEditorWidget } from '../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { appendRemoveOnDispose } from '../../../../../browser/widget/diffEditor/utils.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { Range } from '../../../../../common/core/range.js';
import { StringText } from '../../../../../common/core/textEdit.js';
import { lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import './inlineEditsView.css';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineDiffView.js';
import { applyEditToModifiedRangeMappings, createReindentEdit, getOffsetForPos, maxContentWidthInRange, PathBuilder, Point, StatusBarViewItem } from './utils.js';
import { IInlineEditsIndicatorState, InlineEditsIndicator } from './inlineEditsIndicatorView.js';
import { darken, lighten, registerColor } from '../../../../../../platform/theme/common/colorUtils.js';
import { diffInserted, diffRemoved } from '../../../../../../platform/theme/common/colorRegistry.js';
import { CustomizedMenuWorkbenchToolBar } from '../../hintsWidget/inlineCompletionsHintsWidget.js';
import { Command } from '../../../../../common/languages.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { editorLineHighlightBorder } from '../../../../../common/core/editorColorRegistry.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEditWithChanges } from './inlineEditsViewAndDiffProducer.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { Color } from '../../../../../../base/common/color.js';

export const originalBackgroundColor = registerColor(
	'inlineEdit.originalBackground',
	Color.transparent,
	'',
	true
);
export const modifiedBackgroundColor = registerColor(
	'inlineEdit.modifiedBackground',
	Color.transparent,
	'',
	true
);

export const originalChangedLineBackgroundColor = registerColor(
	'inlineEdit.originalChangedLineBackground',
	Color.transparent,
	'',
	true
);

export const originalChangedTextOverlayColor = registerColor(
	'inlineEdit.originalChangedTextBackground',
	diffRemoved,
	'',
	true
);

export const modifiedChangedLineBackgroundColor = registerColor(
	'inlineEdit.modifiedChangedLineBackground',
	Color.transparent,
	'',
	true
);

export const modifiedChangedTextOverlayColor = registerColor(
	'inlineEdit.modifiedChangedTextBackground',
	diffInserted,
	'',
	true
);

export const originalBorder = registerColor(
	'inlineEdit.originalBorder',
	{
		light: darken(editorLineHighlightBorder, 0.15),
		dark: lighten(editorLineHighlightBorder, 0.50),
		hcDark: editorLineHighlightBorder,
		hcLight: editorLineHighlightBorder
	},
	''
);

export const modifiedBorder = registerColor(
	'inlineEdit.modifiedBorder',
	{
		light: darken(editorLineHighlightBorder, 0.15),
		dark: lighten(editorLineHighlightBorder, 0.50),
		hcDark: editorLineHighlightBorder,
		hcLight: editorLineHighlightBorder
	},
	''
);

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _elements = h('div.inline-edits-view', {
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
		},
	}, [
		svgElem('svg@svg', { transform: 'translate(-0.5 -0.5)', style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' }, }, []),
		h('div.editorContainer@editorContainer', { style: { position: 'absolute' } }, [
			h('div.preview@editor', { style: {} }),
			h('div.toolbar@toolbar', { style: {} }),
		]),
		svgElem('svg@svg2', { transform: 'translate(-0.5 -0.5)', style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' }, }, []),
	]);

	private readonly _useMixedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useInterleavedLinesDiff);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._register(appendRemoveOnDispose(this._editor.getDomNode()!, this._elements.root));

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._elements.root,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(reader => {
				const x = this._previewEditorLayoutInfo.read(reader)?.maxContentWidth;
				if (x === undefined) { return 0; }
				return x;
			}),
		}));

		this._previewEditor.setModel(this._previewTextModel);


		this._register(autorun(reader => {
			const layoutInfo = this._previewEditorLayoutInfo.read(reader);
			if (!layoutInfo) {
				this._elements.svg.replaceChildren();
				return;
			}

			const topEdit = layoutInfo.edit1;
			const editHeight = layoutInfo.editHeight;

			const width = this._previewEditorWidth.read(reader);

			const pathBuilder1 = new PathBuilder();
			pathBuilder1.moveTo(layoutInfo.code2);
			pathBuilder1.lineTo(layoutInfo.codeStart2);
			pathBuilder1.lineTo(layoutInfo.codeStart1);
			pathBuilder1.lineTo(layoutInfo.code1);


			const pathBuilder2 = new PathBuilder();
			pathBuilder2.moveTo(layoutInfo.code1);
			pathBuilder2.lineTo(layoutInfo.edit1);
			pathBuilder2.lineTo(layoutInfo.edit1.deltaX(width));
			pathBuilder2.lineTo(layoutInfo.edit2.deltaX(width));
			pathBuilder2.lineTo(layoutInfo.edit2);
			if (layoutInfo.edit2.y !== layoutInfo.code2.y) {
				pathBuilder2.curveTo2(layoutInfo.edit2.deltaX(-20), layoutInfo.code2.deltaX(20), layoutInfo.code2.deltaX(0));
			}
			pathBuilder2.lineTo(layoutInfo.code2);

			const pathBuilder4 = new PathBuilder();
			pathBuilder4.moveTo(layoutInfo.code1);
			pathBuilder4.lineTo(layoutInfo.code1.deltaX(1000));
			pathBuilder4.lineTo(layoutInfo.code2.deltaX(1000));
			pathBuilder4.lineTo(layoutInfo.code2);

			const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path1.setAttribute('d', pathBuilder1.build());
			path1.style.fill = 'var(--vscode-inlineEdit-originalBackground, transparent)';
			path1.style.stroke = 'var(--vscode-inlineEdit-originalBorder)';
			path1.style.strokeWidth = '1px';


			const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path2.setAttribute('d', pathBuilder2.build());
			path2.style.fill = 'var(--vscode-inlineEdit-modifiedBackground, transparent)';
			path2.style.stroke = 'var(--vscode-inlineEdit-modifiedBorder)';
			path2.style.strokeWidth = '1px';

			const pathModifiedBackground = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			pathModifiedBackground.setAttribute('d', pathBuilder2.build());
			pathModifiedBackground.style.fill = 'var(--vscode-editor-background, transparent)';
			pathModifiedBackground.style.strokeWidth = '1px';



			const elements: SVGElement[] = [];
			if (layoutInfo.shouldShowShadow) {
				const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
				const linearGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
				linearGradient.setAttribute('id', 'gradient');
				linearGradient.setAttribute('x1', '0%');
				linearGradient.setAttribute('x2', '100%');

				const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
				stop1.setAttribute('offset', '0%');
				stop1.setAttribute('style', 'stop-color:var(--vscode-inlineEdit-modifiedBorder);stop-opacity:0');

				const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
				stop2.setAttribute('offset', '100%');
				stop2.setAttribute('style', 'stop-color:var(--vscode-inlineEdit-modifiedBorder);stop-opacity:1');

				linearGradient.appendChild(stop1);
				linearGradient.appendChild(stop2);
				defs.appendChild(linearGradient);

				const width = 6;
				const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				rect.setAttribute('x', `${layoutInfo.code1.x - width}`);
				rect.setAttribute('y', `${layoutInfo.code1.y}`);
				rect.setAttribute('width', `${width}`);
				rect.setAttribute('height', `${layoutInfo.code2.y - layoutInfo.code1.y}`);
				rect.setAttribute('fill', 'url(#gradient)');
				rect.style.strokeWidth = '0';
				rect.style.stroke = 'transparent';

				elements.push(defs);
				elements.push(rect);
			} else {
				const pathBuilder3 = new PathBuilder();
				pathBuilder3.moveTo(layoutInfo.code1);
				pathBuilder3.lineTo(layoutInfo.code2);

				const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				path3.setAttribute('d', pathBuilder3.build());
				path3.style.stroke = 'var(--vscode-inlineEdit-modifiedBorder)';
				path3.style.strokeWidth = '1px';
				elements.push(path3);
			}

			const path4 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path4.setAttribute('d', pathBuilder4.build());
			path4.style.fill = 'var(--vscode-editor-background, transparent)';

			this._elements.svg.replaceChildren(path4, pathModifiedBackground);
			this._elements.svg2.replaceChildren(path1, path2, ...elements);

			this._elements.editorContainer.style.top = `${topEdit.y}px`;
			this._elements.editorContainer.style.left = `${topEdit.x}px`;

			this._previewEditor.layout({ height: editHeight, width });
		}));

		const toolbarDropdownVisible = observableFromEvent(this, this._toolbar.onDidChangeDropdownVisibility, (e) => e ?? false);

		this._register(autorun(reader => {
			this._elements.root.classList.toggle('toolbarDropdownVisible', toolbarDropdownVisible.read(reader));
		}));
	}

	private readonly _uiState = derived(this, reader => {
		const edit = this._edit.read(reader);
		if (!edit) { return undefined; }

		this._model.get()?.handleInlineCompletionShown(edit.inlineCompletion);

		let mappings = RangeMapping.fromEdit(edit.edit);
		let newText = edit.edit.apply(edit.originalText);
		let diff = lineRangeMappingFromRangeMappings(mappings, edit.originalText, new StringText(newText));

		let state: 'collapsed' | 'mixedLines' | 'interleavedLines' | 'sideBySide';
		if (edit.isCollapsed) {
			state = 'collapsed';
		} else if (diff.every(m => OriginalEditorInlineDiffView.supportsInlineDiffRendering(m)) &&
			(this._useMixedLinesDiff.read(reader) === 'whenPossible' || (edit.userJumpedToIt && this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible'))) {
			state = 'mixedLines';
		} else if ((this._useInterleavedLinesDiff.read(reader) === 'always' || (edit.userJumpedToIt && this._useInterleavedLinesDiff.read(reader) === 'afterJump'))) {
			state = 'interleavedLines';
		} else {
			state = 'sideBySide';
		}

		if (state === 'sideBySide') {
			const indentationAdjustmentEdit = createReindentEdit(newText, edit.modifiedLineRange);
			newText = indentationAdjustmentEdit.applyToString(newText);

			mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);
			diff = lineRangeMappingFromRangeMappings(mappings, edit.originalText, new StringText(newText));
		}

		const originalDisplayRange = edit.originalText.lineRange.intersect(
			edit.originalLineRange.join(
				LineRange.ofLength(edit.originalLineRange.startLineNumber, edit.lineEdit.newLines.length)
			)
		)!;

		return {
			state,
			diff,
			edit,
			newText,
			newTextLineCount: edit.modifiedLineRange.length,
			originalDisplayRange: originalDisplayRange,
		};
	});

	protected readonly _toolbar = this._register(this._instantiationService.createInstance(CustomizedMenuWorkbenchToolBar, this._elements.toolbar, MenuId.InlineEditsActions, {
		menuOptions: { renderShortTitle: true },
		toolbarOptions: {
			primaryGroup: g => g.startsWith('primary'),
		},
		actionViewItemProvider: (action, options) => {
			if (action instanceof MenuItemAction) {
				return this._instantiationService.createInstance(StatusBarViewItem, action, undefined);
			}
			if (action.class === undefined) {
				return this._instantiationService.createInstance(ActionViewItem, {}, action, { icon: false });
			}
			return undefined;
		},
		telemetrySource: 'inlineEditsToolbar'
	}));

	private readonly _extraCommands = derivedOpts<readonly Command[]>({ owner: this, equalsFn: structuralEquals }, reader => {
		return this._uiState.read(reader)?.edit.commands ?? [];
	});

	protected readonly _updateToolbarAutorun = this._register(autorun(reader => {
		/** @description extra commands */
		const extraCommands = this._extraCommands.read(reader);
		const primaryExtraActions: IAction[] = [];
		const secondaryExtraActions: IAction[] = [];
		for (const c of extraCommands) {
			const action: IAction = {
				class: undefined,
				id: c.id,
				enabled: true,
				tooltip: c.tooltip || '',
				label: c.title,
				run: (event) => {
					return this._commandService.executeCommand(c.id, ...(c.arguments ?? []));
				},
			};
			// TODO this is a hack just to make the feedback action more visible.
			if (c.title.toLowerCase().indexOf('feedback') !== -1) {
				primaryExtraActions.push(action);
			} else {
				secondaryExtraActions.push(action);
			}
		}

		this._toolbar.setAdditionalPrimaryActions(primaryExtraActions);
		this._toolbar.setAdditionalSecondaryActions(secondaryExtraActions);
	}));

	// #region preview editor

	private readonly _previewTextModel = this._register(this._instantiationService.createInstance(
		TextModel,
		'',
		this._editor.getModel()!.getLanguageId(),
		{ ...TextModel.DEFAULT_CREATION_OPTIONS, bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false } },
		null
	));

	private readonly _previewEditor = this._register(this._instantiationService.createInstance(
		EmbeddedCodeEditorWidget,
		this._elements.editor,
		{
			glyphMargin: false,
			lineNumbers: 'off',
			minimap: { enabled: false },
			guides: {
				indentation: false,
				bracketPairs: false,
				bracketPairsHorizontal: false,
				highlightActiveIndentation: false,
			},
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			columnSelection: false,
			overviewRulerBorder: false,
			overviewRulerLanes: 0,
			lineDecorationsWidth: 0,
			lineNumbersMinChars: 0,
			bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
			scrollBeyondLastLine: false,
			scrollbar: {
				vertical: 'hidden',
				horizontal: 'hidden',
				handleMouseWheel: false,
			},
			readOnly: true,
			wordWrap: 'off',
		},
		{ contributions: [], },
		this._editor
	));

	private readonly _previewEditorObs = observableCodeEditor(this._previewEditor);

	private readonly _previewEditorRootVisibility = derived(this, reader => this._uiState.read(reader)?.state === 'sideBySide' ? 'block' : 'none');
	private readonly _updatePreviewEditorRootVisibility = derived(reader => {
		this._elements.root.style.display = this._previewEditorRootVisibility.read(reader);
	});

	private readonly _updatePreviewEditor = derived(reader => {
		this._updatePreviewEditorRootVisibility.read(reader);

		const uiState = this._uiState.read(reader);
		if (!uiState) { return; }


		this._previewTextModel.setLanguage(this._editor.getModel()!.getLanguageId());
		this._previewTextModel.setValue(uiState.newText);
		const range = uiState.edit.originalLineRange;

		const hiddenAreas: Range[] = [];
		if (range.startLineNumber > 1) {
			hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
		}
		if (range.startLineNumber + uiState.newTextLineCount < this._previewTextModel.getLineCount() + 1) {
			hiddenAreas.push(new Range(range.startLineNumber + uiState.newTextLineCount, 1, this._previewTextModel.getLineCount() + 1, 1));
		}

		this._previewEditor.setHiddenAreas(hiddenAreas, undefined, true);

	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _previewEditorWidth = derived(this, reader => {
		const edit = this._edit.read(reader);
		if (!edit) { return 0; }
		this._updatePreviewEditor.read(reader);

		return maxContentWidthInRange(this._previewEditorObs, edit.modifiedLineRange, reader) + 10;
	});

	private readonly _cursorPosIfTouchesEdit = derived(this, reader => {
		const cursorPos = this._editorObs.cursorPosition.read(reader);
		const edit = this._edit.read(reader);
		if (!edit || !cursorPos) { return undefined; }
		return edit.modifiedLineRange.contains(cursorPos.lineNumber) ? cursorPos : undefined;
	});

	/**
	 * ![test](./layout.dio.svg)
	*/
	private readonly _previewEditorLayoutInfo = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) {
			return null;
		}
		const state = this._uiState.read(reader);
		if (!state) {
			return null;
		}

		const range = inlineEdit.originalLineRange;

		const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);

		const editorContentMaxWidthInRange = maxContentWidthInRange(this._editorObs, state.originalDisplayRange, reader);
		const editorLayout = this._editorObs.layoutInfo.read(reader);
		const previewWidth = this._previewEditorWidth.read(reader);
		const editorContentAreaWidth = editorLayout.width - editorLayout.contentLeft - editorLayout.minimap.minimapWidth - editorLayout.verticalScrollbarWidth;

		const cursorPos = this._cursorPosIfTouchesEdit.read(reader);

		const maxPreviewEditorLeft = Math.max(
			editorContentAreaWidth * 0.65 + horizontalScrollOffset - 10,
			editorContentAreaWidth - previewWidth - 70 + horizontalScrollOffset - 10,
			cursorPos ? getOffsetForPos(this._editorObs, cursorPos, reader) + 50 : 0,
		);
		const previewEditorLeftInTextArea = Math.min(editorContentMaxWidthInRange + 20, maxPreviewEditorLeft);

		const previewEditorLeft = editorLayout.contentLeft + previewEditorLeftInTextArea;
		const maxContentWidth = editorContentMaxWidthInRange + 20 + previewWidth + 70;

		const dist = maxPreviewEditorLeft - previewEditorLeftInTextArea;

		const left = Math.max(editorLayout.contentLeft, previewEditorLeft - horizontalScrollOffset);

		const selectionTop = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);

		const codeLeft = editorLayout.contentLeft;

		const code1 = new Point(left, selectionTop);
		const codeStart1 = new Point(codeLeft, selectionTop);
		const code2 = new Point(left, selectionBottom);
		const codeStart2 = new Point(codeLeft, selectionBottom);
		const codeHeight = selectionBottom - selectionTop;

		const codeEditDistRange =
			inlineEdit.modifiedLineRange.length === inlineEdit.originalLineRange.length
				? new OffsetRange(4, 61)
				: new OffsetRange(60, 61);

		const clipped = dist === 0;

		const codeEditDist = codeEditDistRange.clip(dist);
		const editHeight = this._editor.getOption(EditorOption.lineHeight) * inlineEdit.modifiedLineRange.length;

		const edit1 = new Point(left + codeEditDist, selectionTop);
		const edit2 = new Point(left + codeEditDist, selectionTop + editHeight);

		return {
			code1,
			codeStart1,
			code2,
			codeStart2,
			codeHeight,

			edit1,
			edit2,
			editHeight,
			previewEditorLeft,
			maxContentWidth,
			shouldShowShadow: clipped,
		};
	});

	// #endregion

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e) { return undefined; }

		return {
			modifiedText: new StringText(e.newText),
			diff: e.diff,
			mode: e.state === 'collapsed' ? 'sideBySide' : e.state,
			modifiedCodeEditor: this._previewEditor,
		};
	});
	protected readonly _inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));

	protected readonly _indicator = this._register(new InlineEditsIndicator(
		this._editorObs,
		derived<IInlineEditsIndicatorState | undefined>(reader => {
			const state = this._uiState.read(reader);
			const edit1 = this._previewEditorLayoutInfo.read(reader)?.edit1;
			if (!edit1 || !state) { return undefined; }
			return { editTopLeft: edit1, showAlways: state.state !== 'sideBySide' };
		}),
		this._model,
	));
}
