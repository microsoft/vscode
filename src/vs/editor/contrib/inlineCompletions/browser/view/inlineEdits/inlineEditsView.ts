/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h, svgElem } from '../../../../../../base/browser/dom.js';
import { numberComparator } from '../../../../../../base/common/arrays.js';
import { findFirstMin } from '../../../../../../base/common/arraysFind.js';
import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedDisposable, derivedOpts, derivedWithCancellationToken, IObservable, observableFromEvent, ObservablePromise } from '../../../../../../base/common/observable.js';
import { getIndentationLength, splitLines } from '../../../../../../base/common/strings.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EmbeddedCodeEditorWidget } from '../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { IDiffProviderFactoryService } from '../../../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { appendRemoveOnDispose } from '../../../../../browser/widget/diffEditor/utils.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { SingleLineEdit } from '../../../../../common/core/lineEdit.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { AbstractText, SingleTextEdit, StringText, TextEdit } from '../../../../../common/core/textEdit.js';
import { TextLength } from '../../../../../common/core/textLength.js';
import { lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import { TextModelText } from '../../../../../common/model/textModelText.js';
import { IModelService } from '../../../../../common/services/model.js';
import { InlineEdit } from '../../model/inlineEdit.js';
import './inlineEditsView.css';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineDiffView.js';
import { applyEditToModifiedRangeMappings, maxLeftInRange, Point, StatusBarViewItem, UniqueUriGenerator } from './utils.js';
import { IInlineEditsIndicatorState, InlineEditsIndicator } from './inlineEditsIndicatorView.js';
import { darken, lighten, registerColor, transparent } from '../../../../../../platform/theme/common/colorUtils.js';
import { diffInserted, diffRemoved } from '../../../../../../platform/theme/common/colorRegistry.js';
import { CustomizedMenuWorkbenchToolBar } from '../../hintsWidget/inlineCompletionsHintsWidget.js';
import { Command } from '../../../../../common/languages.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { editorLineHighlightBorder } from '../../../../../common/core/editorColorRegistry.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';

export class InlineEditsViewAndDiffProducer extends Disposable {
	public static readonly hot = createHotClass(InlineEditsViewAndDiffProducer);

	private readonly _modelUriGenerator = new UniqueUriGenerator('inline-edits');

	private readonly _originalModel = derivedDisposable(() => this._modelService.createModel(
		'', null, this._modelUriGenerator.getUniqueUri())).keepObserved(this._store);
	private readonly _modifiedModel = derivedDisposable(() => this._modelService.createModel(
		'', null, this._modelUriGenerator.getUniqueUri())).keepObserved(this._store);

	private readonly _inlineEditPromise = derivedWithCancellationToken<ObservablePromise<InlineEditWithChanges | undefined> | undefined>(this, (reader, token) => {
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) { return undefined; }

		//if (inlineEdit.text.trim() === '') { return undefined; }

		const text = new TextModelText(this._editor.getModel()!);
		const edit = inlineEdit.edit.extendToFullLine(text);

		this._originalModel.get().setValue(this._editor.getModel()!.getValueInRange(edit.range));
		this._modifiedModel.get().setValue(edit.text);

		const diffAlgo = this._diffProviderFactoryService.createDiffProvider({ diffAlgorithm: 'advanced' });
		return ObservablePromise.fromFn(async () => {
			const result = await diffAlgo.computeDiff(this._originalModel.get(), this._modifiedModel.get(), {
				computeMoves: false,
				ignoreTrimWhitespace: false,
				maxComputationTimeMs: 1000,
			}, token);

			if (token.isCancellationRequested || result.identical) { return undefined; }

			const rangeStartPos = edit.range.getStartPosition();
			const innerChanges = result.changes.flatMap(c => c.innerChanges!);

			function addRangeToPos(pos: Position, range: Range): Range {
				const start = TextLength.fromPosition(range.getStartPosition());
				return TextLength.ofRange(range).createRange(start.addToPosition(pos));
			}

			const edits = innerChanges.map(c => new SingleTextEdit(
				addRangeToPos(rangeStartPos, c.originalRange),
				this._modifiedModel.get()!.getValueInRange(c.modifiedRange)
			));
			const diffEdits = new TextEdit(edits);

			return new InlineEditWithChanges(text, diffEdits, inlineEdit.isCollapsed, true, inlineEdit.commands); //inlineEdit.showInlineIfPossible);
		});
	});

	private readonly _inlineEdit = this._inlineEditPromise.map((p, reader) => p?.promiseResult?.read(reader)?.data);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEdit | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IDiffProviderFactoryService private readonly _diffProviderFactoryService: IDiffProviderFactoryService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();

		this._register(this._instantiationService.createInstance(InlineEditsView, this._editor, this._inlineEdit, this._model));
	}
}

export class InlineEditWithChanges {
	public readonly lineEdit = SingleLineEdit.fromSingleTextEdit(this.edit.toSingle(this.originalText), this.originalText);

	public readonly originalLineRange = this.lineEdit.lineRange;
	public readonly modifiedLineRange = this.lineEdit.toLineEdit().getNewLineRanges()[0];

	constructor(
		public readonly originalText: AbstractText,
		public readonly edit: TextEdit,
		public readonly isCollapsed: boolean,
		public readonly showInlineIfPossible: boolean,
		public readonly commands: readonly Command[],
	) {
	}
}

export const originalBackgroundColor = registerColor(
	'inlineEdit.originalBackground',
	transparent(diffRemoved, 0.4),
	'',
	true
);
export const modifiedBackgroundColor = registerColor(
	'inlineEdit.modifiedBackground',
	transparent(diffInserted, 0.4),
	'',
	true
);

export const border = registerColor(
	'inlineEdit.border',
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
		h('div.editorContainer@editorContainer', { style: { position: 'absolute' } }, [
			h('div.preview@editor', { style: {} }),
			h('div.toolbar@toolbar', { style: {} }),
		]),
		svgElem('svg@svg', { style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' }, }, [

		]),
	]);

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
				const x = this._previewEditorLeft.read(reader)?.left;
				if (x === undefined) { return 0; }
				const width = this._previewEditorWidth.read(reader);
				return x + width;
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

			const width = this._previewEditorWidth.read(reader) + 10;

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
			pathBuilder2.curveTo2(layoutInfo.edit2.deltaX(-20), layoutInfo.code2.deltaX(20), layoutInfo.code2.deltaX(0));
			pathBuilder2.lineTo(layoutInfo.code2);

			const pathBuilder3 = new PathBuilder();
			pathBuilder3.moveTo(layoutInfo.code1);
			pathBuilder3.lineTo(layoutInfo.code2);

			const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path1.setAttribute('d', pathBuilder1.build());
			path1.style.fill = 'var(--vscode-inlineEdit-originalBackground, transparent)';
			path1.style.stroke = 'var(--vscode-inlineEdit-border)';
			path1.style.strokeWidth = '1px';

			const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path2.setAttribute('d', pathBuilder2.build());
			path2.style.fill = 'var(--vscode-inlineEdit-modifiedBackground, transparent)';
			path2.style.stroke = 'var(--vscode-inlineEdit-border)';
			path2.style.strokeWidth = '1px';

			const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path3.setAttribute('d', pathBuilder3.build());
			path3.style.stroke = 'var(--vscode-inlineEdit-border)';
			path3.style.strokeWidth = '1px';

			this._elements.svg.replaceChildren(path1, path2, path3);

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

		let newText = edit.edit.apply(edit.originalText);
		const indentationAdjustmentEdit = createReindentEdit(newText, edit.modifiedLineRange);
		newText = indentationAdjustmentEdit.applyToString(newText);

		let mappings = RangeMapping.fromEdit(edit.edit);
		mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);

		const diff = lineRangeMappingFromRangeMappings(mappings, edit.originalText, new StringText(newText));

		const originalDisplayRange = edit.originalText.lineRange.intersect(
			edit.originalLineRange.join(
				LineRange.ofLength(edit.originalLineRange.startLineNumber, edit.lineEdit.newLines.length)
			)
		)!;

		let state: 'collapsed' | 'inline' | 'sideBySide' = 'sideBySide';
		if (edit.isCollapsed) {
			state = 'collapsed';
		} else if (edit.showInlineIfPossible && diff.every(m => OriginalEditorInlineDiffView.supportsInlineDiffRendering(m))) {
			state = 'inline';
		}

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


		this._previewTextModel.setValue(uiState.newText);
		const range = uiState.edit.originalLineRange;

		this._previewEditor.setHiddenAreas([
			new Range(1, 1, range.startLineNumber - 1, 1),
			new Range(range.startLineNumber + uiState.newTextLineCount, 1, this._previewTextModel.getLineCount() + 1, 1),
		], undefined, true);

	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _previewEditorWidth = derived(this, reader => {
		const edit = this._edit.read(reader);
		if (!edit) { return 0; }
		this._updatePreviewEditor.read(reader);

		return maxLeftInRange(this._previewEditorObs, edit.modifiedLineRange, reader);
	});

	private readonly _previewEditorLeft = derived(this, reader => {
		const state = this._uiState.read(reader);
		if (!state) { return null; }

		const maxLeft = maxLeftInRange(this._editorObs, state.originalDisplayRange, reader);
		const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);

		return { left: contentLeft + maxLeft };
	});

	/**
	 * ![test](./layout.dio.svg)
	*/
	private readonly _previewEditorLayoutInfo = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) { return null; }

		const range = inlineEdit.originalLineRange;

		const scrollLeft = this._editorObs.scrollLeft.read(reader);

		const left = this._previewEditorLeft.read(reader)!.left + 20 - scrollLeft;

		const selectionTop = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);

		const codeLeft = this._editorObs.layoutInfoContentLeft.read(reader);

		const code1 = new Point(left, selectionTop);
		const codeStart1 = new Point(codeLeft, selectionTop);
		const code2 = new Point(left, selectionBottom);
		const codeStart2 = new Point(codeLeft, selectionBottom);
		const codeHeight = selectionBottom - selectionTop;

		const codeEditDist = 60;
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
		};
	});

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e) { return undefined; }

		return {
			modifiedText: new StringText(e.newText),
			diff: e.diff,
			showInline: e.edit.showInlineIfPossible,
			modifiedCodeEditor: this._previewEditor,
		};
	});
	protected readonly _inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState));

	protected readonly _indicator = this._register(new InlineEditsIndicator(
		this._editorObs,
		derived<IInlineEditsIndicatorState | undefined>(reader => {
			const state = this._uiState.read(reader);
			const edit1 = this._previewEditorLayoutInfo.read(reader)?.edit1;
			if (!edit1 || !state) { return undefined; }
			return { editTopLeft: edit1, showAlways: state.state === 'collapsed' || state.state === 'inline' };
		}),
		this._model,
	));
}

export function classNames(...classes: (string | false | undefined | null)[]) {
	return classes.filter(c => typeof c === 'string').join(' ');
}

function offsetRangeToRange(columnOffsetRange: OffsetRange, startPos: Position): Range {
	return new Range(
		startPos.lineNumber,
		startPos.column + columnOffsetRange.start,
		startPos.lineNumber,
		startPos.column + columnOffsetRange.endExclusive,
	);
}

function createReindentEdit(text: string, range: LineRange): TextEdit {
	const newLines = splitLines(text);
	const edits: SingleTextEdit[] = [];
	const minIndent = findFirstMin(range.mapToLineArray(l => getIndentationLength(newLines[l - 1])), numberComparator)!;
	range.forEach(lineNumber => {
		edits.push(new SingleTextEdit(offsetRangeToRange(new OffsetRange(0, minIndent), new Position(lineNumber, 1)), ''));
	});
	return new TextEdit(edits);
}

class PathBuilder {
	private _data: string = '';

	public moveTo(point: Point): this {
		this._data += `M ${point.x} ${point.y} `;
		return this;
	}

	public lineTo(point: Point): this {
		this._data += `L ${point.x} ${point.y} `;
		return this;
	}

	public curveTo(cp: Point, to: Point): this {
		this._data += `Q ${cp.x} ${cp.y} ${to.x} ${to.y} `;
		return this;
	}

	public curveTo2(cp1: Point, cp2: Point, to: Point): this {
		this._data += `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y} `;
		return this;
	}

	public build(): string {
		return this._data;
	}
}
