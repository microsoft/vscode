/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow } from '../../../../../../base/browser/dom.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Color } from '../../../../../../base/common/color.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, autorun, constObservable, derived, derivedObservableWithCache, derivedOpts, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { diffInserted, diffRemoved } from '../../../../../../platform/theme/common/colorRegistry.js';
import { darken, lighten, registerColor } from '../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../browser/point.js';
import { EmbeddedCodeEditorWidget } from '../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { editorLineHighlightBorder } from '../../../../../common/core/editorColorRegistry.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { Command } from '../../../../../common/languages.js';
import { ITextModel } from '../../../../../common/model.js';
import { StickyScrollController } from '../../../../stickyScroll/browser/stickyScrollController.js';
import { CustomizedMenuWorkbenchToolBar } from '../../hintsWidget/inlineCompletionsHintsWidget.js';
import { PathBuilder, StatusBarViewItem, getOffsetForPos, mapOutFalsy, maxContentWidthInRange, n } from './utils.js';
import { InlineEditWithChanges } from './viewAndDiffProducer.js';


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

export class InlineEditsSideBySideDiff extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _previewTextModel: ITextModel,
		private readonly _uiState: IObservable<{
			edit: InlineEditWithChanges;
			newTextLineCount: number;
			originalDisplayRange: LineRange;
		} | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		super();

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._overflowView.element,
			position: constObservable({
				preference: {
					top: 0,
					left: 0
				}
			}),
			allowEditorOverflow: true,
			minContentWidthInPx: constObservable(0),
		}));

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._nonOverflowView.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(reader => {
				const x = this._previewEditorLayoutInfo.read(reader)?.maxContentWidth;
				if (x === undefined) { return 0; }
				return x;
			}),
		}));

		this.previewEditor.setModel(this._previewTextModel);

		this._register(autorun(reader => {

			const layoutInfo = this._previewEditorLayoutInfo.read(reader);
			if (!layoutInfo) {
				//this._elements.svg.replaceChildren();
				return;
			}

			this.previewEditor.layout({ height: layoutInfo.editHeight, width: layoutInfo.previewEditorWidth });

			const topEdit = layoutInfo.edit1;
			this._editorContainer.element.style.top = `${topEdit.y}px`;
			this._editorContainer.element.style.left = `${topEdit.x}px`;
		}));

		/*const toolbarDropdownVisible = observableFromEvent(this, this._toolbar.onDidChangeDropdownVisibility, (e) => e ?? false);

		this._register(autorun(reader => {
			this._elements.root.classList.toggle('toolbarDropdownVisible', toolbarDropdownVisible.read(reader));
		}));*/

		this._register(autorun(reader => {
			const layoutInfo = this._previewEditorLayoutInfo.read(reader);
			if (!layoutInfo) {
				return;
			}

			this._previewEditorObs.editor.setScrollLeft(layoutInfo.desiredPreviewEditorScrollLeft);
		}));

		this._editorContainerTopLeft.set(this._previewEditorLayoutInfo.map(i => i?.edit1), undefined);
	}

	private readonly _display = derived(this, reader => !!this._uiState.read(reader) ? 'block' : 'none');

	private readonly previewRef = n.ref<HTMLDivElement>();
	private readonly toolbarRef = n.ref<HTMLDivElement>();

	private readonly _editorContainerTopLeft = observableValue<IObservable<Point | undefined> | undefined>(this, undefined);

	private readonly _editorContainer = n.div({
		class: 'editorContainer',
		style: { position: 'absolute' },
	}, [
		n.div({ class: 'preview', style: {}, ref: this.previewRef }),
		n.div({ class: 'toolbar', style: {}, ref: this.toolbarRef }),
	]).keepUpdated(this._store);

	protected readonly _toolbar = this._register(this._instantiationService.createInstance(CustomizedMenuWorkbenchToolBar, this.toolbarRef.element, MenuId.InlineEditsActions, {
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

	public readonly previewEditor = this._register(this._instantiationService.createInstance(
		EmbeddedCodeEditorWidget,
		this.previewRef.element,
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
			rulers: [],
			padding: { top: 0, bottom: 0 },
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

	private readonly _previewEditorObs = observableCodeEditor(this.previewEditor);

	private readonly _updatePreviewEditor = derived(reader => {
		this._editorContainer.readEffect(reader);

		// Setting this here explicitly to make sure that the preview editor is
		// visible when needed, we're also checking that these fields are defined
		// because of the auto run initial
		// Before removing these, verify with a non-monospace font family
		this._display.read(reader);
		if (this._overflowView) {
			this._overflowView.element.style.display = this._display.read(reader);
		}
		if (this._nonOverflowView) {
			this._nonOverflowView.element.style.display = this._display.read(reader);
		}

		const uiState = this._uiState.read(reader);
		if (!uiState) {
			return;
		}

		const range = uiState.edit.originalLineRange;

		const hiddenAreas: Range[] = [];
		if (range.startLineNumber > 1) {
			hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
		}
		if (range.startLineNumber + uiState.newTextLineCount < this._previewTextModel.getLineCount() + 1) {
			hiddenAreas.push(new Range(range.startLineNumber + uiState.newTextLineCount, 1, this._previewTextModel.getLineCount() + 1, 1));
		}

		this.previewEditor.setHiddenAreas(hiddenAreas, undefined, true);

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

	private readonly _originalStartPosition = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		return inlineEdit ? new Position(inlineEdit.originalLineRange.startLineNumber, 1) : null;
	});

	private readonly _originalEndPosition = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		return inlineEdit ? new Position(inlineEdit.originalLineRange.endLineNumberExclusive, 1) : null;
	});

	private readonly _originalVerticalStartPosition = this._editorObs.observePosition(this._originalStartPosition, this._store).map(p => p?.y);
	private readonly _originalVerticalEndPosition = this._editorObs.observePosition(this._originalEndPosition, this._store).map(p => p?.y);

	private readonly _originalDisplayRange = this._uiState.map(s => s?.originalDisplayRange);
	private readonly _editorMaxContentWidthInRange = derived(this, reader => {
		const originalDisplayRange = this._originalDisplayRange.read(reader);
		if (!originalDisplayRange) {
			return constObservable(0);
		}
		this._editorObs.versionId.read(reader);

		// Take the max value that we observed.
		// Reset when either the edit changes or the editor text version.
		return derivedObservableWithCache<number>(this, (reader, lastValue) => {
			const maxWidth = maxContentWidthInRange(this._editorObs, originalDisplayRange, reader);
			return Math.max(maxWidth, lastValue ?? 0);
		});
	}).map((v, r) => v.read(r));

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

		const editorContentMaxWidthInRange = this._editorMaxContentWidthInRange.read(reader);
		const editorLayout = this._editorObs.layoutInfo.read(reader);
		const previewContentWidth = this._previewEditorWidth.read(reader);
		const editorContentAreaWidth = editorLayout.contentWidth - editorLayout.verticalScrollbarWidth;
		const editorBoundingClientRect = this._editor.getContainerDomNode().getBoundingClientRect();
		const clientContentAreaRight = editorLayout.contentLeft + editorLayout.contentWidth + editorBoundingClientRect.left;
		const remainingWidthRightOfContent = getWindow(this._editor.getContainerDomNode()).outerWidth - clientContentAreaRight;
		const remainingWidthRightOfEditor = getWindow(this._editor.getContainerDomNode()).outerWidth - editorBoundingClientRect.right;
		const desiredMinimumWidth = Math.min(editorLayout.contentWidth * 0.3, previewContentWidth, 100);
		const IN_EDITOR_DISPLACEMENT = 0;
		const maximumAvailableWidth = IN_EDITOR_DISPLACEMENT + remainingWidthRightOfContent;

		const cursorPos = this._cursorPosIfTouchesEdit.read(reader);

		const maxPreviewEditorLeft = Math.max(
			// We're starting from the content area right and moving it left by IN_EDITOR_DISPLACEMENT and also by an ammount to ensure some mimum desired width
			editorContentAreaWidth + horizontalScrollOffset - IN_EDITOR_DISPLACEMENT - Math.max(0, desiredMinimumWidth - maximumAvailableWidth),
			// But we don't want that the moving left ends up covering the cursor, so this will push it to the right again
			Math.min(
				cursorPos ? getOffsetForPos(this._editorObs, cursorPos, reader) + 50 : 0,
				editorContentAreaWidth + horizontalScrollOffset
			)
		);
		const previewEditorLeftInTextArea = Math.min(editorContentMaxWidthInRange + 20, maxPreviewEditorLeft);

		const maxContentWidth = editorContentMaxWidthInRange + 20 + previewContentWidth + 70;

		const dist = maxPreviewEditorLeft - previewEditorLeftInTextArea;

		let desiredPreviewEditorScrollLeft;
		let left;
		if (previewEditorLeftInTextArea > horizontalScrollOffset) {
			desiredPreviewEditorScrollLeft = 0;
			left = editorLayout.contentLeft + previewEditorLeftInTextArea - horizontalScrollOffset;
		} else {
			desiredPreviewEditorScrollLeft = horizontalScrollOffset - previewEditorLeftInTextArea;
			left = editorLayout.contentLeft;
		}

		const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);

		const codeLeft = editorLayout.contentLeft;

		const code1 = new Point(left, selectionTop);
		const codeStart1 = new Point(codeLeft, selectionTop);
		const code2 = new Point(left, selectionBottom);
		const codeStart2 = new Point(codeLeft, selectionBottom);
		const codeHeight = selectionBottom - selectionTop;

		const codeEditDistRange = inlineEdit.modifiedLineRange.length === inlineEdit.originalLineRange.length
			? new OffsetRange(4, 61)
			: new OffsetRange(60, 61);

		const clipped = dist === 0;

		const codeEditDist = codeEditDistRange.clip(dist);
		const editHeight = this._editor.getOption(EditorOption.lineHeight) * inlineEdit.modifiedLineRange.length;

		const previewEditorWidth = Math.min(previewContentWidth, remainingWidthRightOfEditor + editorLayout.width - editorLayout.contentLeft - codeEditDist);

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
			maxContentWidth,
			shouldShowShadow: clipped,
			desiredPreviewEditorScrollLeft,
			previewEditorWidth
		};
	});

	private _stickyScrollController = StickyScrollController.get(this._editorObs.editor);
	private readonly _stickyScrollHeight = this._stickyScrollController ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController!.stickyScrollWidgetHeight) : constObservable(0);

	private readonly _shouldOverflow = derived(reader => {
		const range = this._edit.read(reader)?.originalLineRange;
		if (!range) {
			return false;
		}
		const stickyScrollHeight = this._stickyScrollHeight.read(reader);
		const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		if (top <= stickyScrollHeight) {
			return false;
		}
		const bottom = this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);
		if (bottom >= this._editorObs.layoutInfo.read(reader).height) {
			return false;
		}
		return true;
	});


	private readonly _extendedModifiedPath = derived(reader => {
		const layoutInfo = this._previewEditorLayoutInfo.read(reader);
		if (!layoutInfo) { return undefined; }
		const width = layoutInfo.previewEditorWidth;
		const extendedModifiedPathBuilder = new PathBuilder()
			.moveTo(layoutInfo.code1)
			.lineTo(layoutInfo.edit1)
			.lineTo(layoutInfo.edit1.deltaX(width))
			.lineTo(layoutInfo.edit2.deltaX(width))
			.lineTo(layoutInfo.edit2);
		if (layoutInfo.edit2.y !== layoutInfo.code2.y) {
			extendedModifiedPathBuilder.curveTo2(layoutInfo.edit2.deltaX(-20), layoutInfo.code2.deltaX(20), layoutInfo.code2.deltaX(0));
		}
		extendedModifiedPathBuilder.lineTo(layoutInfo.code2);
		return extendedModifiedPathBuilder.build();
	});

	private readonly _backgroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, [
		n.svgElem('path', {
			class: 'rightOfModifiedBackgroundCoverUp',
			d: this._previewEditorLayoutInfo.map(layoutInfo => layoutInfo && new PathBuilder()
				.moveTo(layoutInfo.code1)
				.lineTo(layoutInfo.code1.deltaX(1000))
				.lineTo(layoutInfo.code2.deltaX(1000))
				.lineTo(layoutInfo.code2)
				.build()
			),
			style: {
				fill: 'var(--vscode-editor-background, transparent)',
			}
		}),
	]).keepUpdated(this._store);

	private readonly _foregroundBackgroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, [
		n.svgElem('path', {
			class: 'extendedModifiedBackgroundCoverUp',
			d: this._extendedModifiedPath,
			style: {
				fill: 'var(--vscode-editor-background, transparent)',
				strokeWidth: '1px',
			}
		}),
	]).keepUpdated(this._store);

	private readonly _foregroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, derived(reader => {
		const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		const shadowWidth = 6;
		return [
			n.svgElem('path', {
				class: 'originalOverlay',
				d: layoutInfoObs.map(layoutInfo => new PathBuilder()
					.moveTo(layoutInfo.code2)
					.lineTo(layoutInfo.codeStart2)
					.lineTo(layoutInfo.codeStart1)
					.lineTo(layoutInfo.code1)
					.build()
				),
				style: {
					fill: 'var(--vscode-inlineEdit-originalBackground, transparent)',
					stroke: 'var(--vscode-inlineEdit-originalBorder)',
					strokeWidth: '1px',
				}
			}),

			n.svgElem('path', {
				class: 'extendedModifiedOverlay',
				d: this._extendedModifiedPath,
				style: {
					fill: 'var(--vscode-inlineEdit-modifiedBackground, transparent)',
					stroke: 'var(--vscode-inlineEdit-modifiedBorder)',
					strokeWidth: '1px',
				}
			}),

			...(!layoutInfoObs.map(i => i.shouldShowShadow).read(reader)
				? [
					n.svgElem('path', {
						class: 'middleBorder',
						d: layoutInfoObs.map(layoutInfo => new PathBuilder()
							.moveTo(layoutInfo.code1)
							.lineTo(layoutInfo.code2)
							.build()
						),
						style: {
							stroke: 'var(--vscode-inlineEdit-modifiedBorder)',
							strokeWidth: '1px'
						}
					})
				]
				: [
					n.svgElem('defs', {}, [
						n.svgElem('linearGradient', { id: 'gradient', x1: '0%', x2: '100%', }, [
							n.svgElem('stop', {
								offset: '0%',
								style: { stopColor: 'var(--vscode-inlineEdit-modifiedBorder)', stopOpacity: '0', }
							}),
							n.svgElem('stop', {
								offset: '100%',
								style: { stopColor: 'var(--vscode-inlineEdit-modifiedBorder)', stopOpacity: '1', }
							})
						])
					]),
					n.svgElem('rect', {
						class: 'middleBorderWithShadow',
						x: layoutInfoObs.map(layoutInfo => layoutInfo.code1.x - shadowWidth),
						y: layoutInfoObs.map(layoutInfo => layoutInfo.code1.y),
						width: shadowWidth,
						height: layoutInfoObs.map(layoutInfo => layoutInfo.code2.y - layoutInfo.code1.y),
						fill: 'url(#gradient)',
						style: { strokeWidth: '0', stroke: 'transparent', }
					})
				]
			)
		];
	})).keepUpdated(this._store);

	private readonly _nonOverflowView = n.div({
		class: 'inline-edits-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			zIndex: '0',
			display: this._display,
		},
	}, [
		this._backgroundSvg,
		derived(this, reader => this._shouldOverflow.read(reader) ? [] : [this._foregroundBackgroundSvg, this._editorContainer, this._foregroundSvg]),
	]).keepUpdated(this._store);

	private readonly _overflowView = n.div({
		class: 'inline-edits-view',
		style: {
			overflow: 'visible',
			zIndex: '20',
			display: this._display,
		},
	}, [
		derived(this, reader => this._shouldOverflow.read(reader) ? [this._foregroundBackgroundSvg, this._editorContainer, this._foregroundSvg] : []),
	]).keepUpdated(this._store);
}
