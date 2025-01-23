/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, getWindow } from '../../../../../../base/browser/dom.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Color } from '../../../../../../base/common/color.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, autorun, constObservable, derived, derivedObservableWithCache, derivedOpts, observableFromEvent } from '../../../../../../base/common/observable.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { diffInserted, diffRemoved, editorHoverBorder } from '../../../../../../platform/theme/common/colorRegistry.js';
import { registerColor, transparent } from '../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../browser/point.js';
import { EmbeddedCodeEditorWidget } from '../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { Command } from '../../../../../common/languages.js';
import { ITextModel } from '../../../../../common/model.js';
import { StickyScrollController } from '../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineCompletionContextKeys } from '../../controller/inlineCompletionContextKeys.js';
import { CustomizedMenuWorkbenchToolBar } from '../../hintsWidget/inlineCompletionsHintsWidget.js';
import { PathBuilder, StatusBarViewItem, createRectangle, getOffsetForPos, mapOutFalsy, maxContentWidthInRange, n } from './utils.js';
import { InlineEditWithChanges } from './viewAndDiffProducer.js';
import { localize } from '../../../../../../nls.js';

export const originalBackgroundColor = registerColor(
	'inlineEdit.originalBackground',
	Color.transparent,
	localize('inlineEdit.originalBackground', 'Background color for the original text in inline edits.'),
	true
);
export const modifiedBackgroundColor = registerColor(
	'inlineEdit.modifiedBackground',
	Color.transparent,
	localize('inlineEdit.modifiedBackground', 'Background color for the modified text in inline edits.'),
	true
);

export const originalChangedLineBackgroundColor = registerColor(
	'inlineEdit.originalChangedLineBackground',
	Color.transparent,
	localize('inlineEdit.originalChangedLineBackground', 'Background color for the changed lines in the original text of inline edits.'),
	true
);

export const originalChangedTextOverlayColor = registerColor(
	'inlineEdit.originalChangedTextBackground',
	diffRemoved,
	localize('inlineEdit.originalChangedTextBackground', 'Overlay color for the changed text in the original text of inline edits.'),
	true
);

export const modifiedChangedLineBackgroundColor = registerColor(
	'inlineEdit.modifiedChangedLineBackground',
	Color.transparent,
	localize('inlineEdit.modifiedChangedLineBackground', 'Background color for the changed lines in the modified text of inline edits.'),
	true
);

export const modifiedChangedTextOverlayColor = registerColor(
	'inlineEdit.modifiedChangedTextBackground',
	diffInserted,
	localize('inlineEdit.modifiedChangedTextBackground', 'Overlay color for the changed text in the modified text of inline edits.'),
	true
);
export const originalBorder = registerColor(
	'inlineEdit.originalBorder',
	{
		light: editorHoverBorder,
		dark: editorHoverBorder,
		hcDark: editorHoverBorder,
		hcLight: editorHoverBorder
	},
	localize('inlineEdit.originalBorder', 'Border color for the original text in inline edits.')
);

export const modifiedBorder = registerColor(
	'inlineEdit.modifiedBorder',
	{
		light: editorHoverBorder,
		dark: editorHoverBorder,
		hcDark: editorHoverBorder,
		hcLight: editorHoverBorder
	},
	localize('inlineEdit.modifiedBorder', 'Border color for the modified text in inline edits.')
);

export const acceptedDecorationBackgroundColor = registerColor(
	'inlineEdit.acceptedBackground',
	{
		light: transparent(modifiedChangedTextOverlayColor, 0.75),
		dark: transparent(modifiedChangedTextOverlayColor, 0.75),
		hcDark: modifiedChangedTextOverlayColor,
		hcLight: modifiedChangedTextOverlayColor
	},
	localize('inlineEdit.acceptedBackground', 'Background color for the accepted text after applying an inline edit.'),
	true
);

export interface IInlineEditsView {
	isHovered: IObservable<boolean>;
}

export class InlineEditsSideBySideDiff extends Disposable implements IInlineEditsView {
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
		@ICommandService private readonly _commandService: ICommandService,
		@IThemeService private readonly _themeService: IThemeService,
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

			const editorTopLeft = layoutInfo.editStart1.deltaY(layoutInfo.padding);
			const editorBottomLeft = layoutInfo.editStart2.deltaY(-layoutInfo.padding);

			this.previewEditor.layout({ height: editorBottomLeft.y - editorTopLeft.y, width: layoutInfo.previewEditorWidth + 15 /* Make sure editor does not scroll horizontally */ });
			this._editorContainer.element.style.top = `${editorTopLeft.y}px`;
			this._editorContainer.element.style.left = `${editorTopLeft.x}px`;
			this._editorContainer.element.style.width = `${layoutInfo.previewEditorWidth}px`; // Set width to clip view zone
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
	}

	private readonly _display = derived(this, reader => !!this._uiState.read(reader) ? 'block' : 'none');

	private readonly previewRef = n.ref<HTMLDivElement>();
	private readonly toolbarRef = n.ref<HTMLDivElement>();

	private readonly _editorContainer = n.div({
		class: ['editorContainer', this._editorObs.getOption(EditorOption.inlineSuggest).map(v => !v.edits.experimental.useGutterIndicator && 'showHover')],
		style: { position: 'absolute', overflow: 'hidden' },
	}, [
		n.div({ class: 'preview', style: {}, ref: this.previewRef }),
		n.div({ class: 'toolbar', style: {}, ref: this.toolbarRef }),
	]).keepUpdated(this._store);

	public readonly isHovered = this._editorContainer.getIsHovered(this._store);

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
		this._editor
	));

	private readonly _previewEditorObs = observableCodeEditor(this.previewEditor);

	private _activeViewZones: string[] = [];
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

		// TODO: is this the proper way to handle viewzones?
		const previousViewZones = [...this._activeViewZones];
		this._activeViewZones = [];

		const reducedLinesCount = (range.endLineNumberExclusive - range.startLineNumber) - uiState.newTextLineCount;
		this.previewEditor.changeViewZones((changeAccessor) => {
			previousViewZones.forEach(id => changeAccessor.removeZone(id));

			if (reducedLinesCount > 0) {
				this._activeViewZones.push(changeAccessor.addZone({
					afterLineNumber: range.startLineNumber + uiState.newTextLineCount - 1,
					heightInLines: reducedLinesCount,
					showInHiddenAreas: true,
					domNode: $('div.diagonal-fill.inline-edits-view-zone'),
				}));
			}
		});

	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _previewEditorWidth = derived(this, reader => {
		const edit = this._edit.read(reader);
		if (!edit) { return 0; }
		this._updatePreviewEditor.read(reader);

		return maxContentWidthInRange(this._previewEditorObs, edit.modifiedLineRange, reader);
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
		const remainingWidthRightOfContent = getWindow(this._editor.getContainerDomNode()).innerWidth - clientContentAreaRight;
		const remainingWidthRightOfEditor = getWindow(this._editor.getContainerDomNode()).innerWidth - editorBoundingClientRect.right;
		const desiredMinimumWidth = Math.min(editorLayout.contentWidth * 0.3, previewContentWidth, 100);
		const IN_EDITOR_DISPLACEMENT = 0;
		const maximumAvailableWidth = IN_EDITOR_DISPLACEMENT + remainingWidthRightOfContent;

		const cursorPos = this._cursorPosIfTouchesEdit.read(reader);

		const maxPreviewEditorLeft = Math.max(
			// We're starting from the content area right and moving it left by IN_EDITOR_DISPLACEMENT and also by an amount to ensure some minimum desired width
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

		let code1 = new Point(left, selectionTop);
		let codeStart1 = new Point(codeLeft, selectionTop);
		let code2 = new Point(left, selectionBottom);
		let codeStart2 = new Point(codeLeft, selectionBottom);

		const editHeight = this._editor.getOption(EditorOption.lineHeight) * inlineEdit.modifiedLineRange.length;
		const codeHeight = selectionBottom - selectionTop;
		const previewEditorHeight = Math.max(codeHeight, editHeight);

		const editIsSameHeight = codeHeight === previewEditorHeight;
		const codeEditDistRange = editIsSameHeight
			? new OffsetRange(4, 61)
			: new OffsetRange(60, 61);

		const clipped = dist === 0;
		const PADDING = 4;

		const codeEditDist = editIsSameHeight ? PADDING : codeEditDistRange.clip(dist); // TODO: Is there a better way to specify the distance?

		const previewEditorWidth = Math.min(previewContentWidth, remainingWidthRightOfEditor + editorLayout.width - editorLayout.contentLeft - codeEditDist);

		let editStart1 = new Point(left + codeEditDist, selectionTop);
		let edit1 = editStart1.deltaX(previewEditorWidth);
		let editStart2 = new Point(left + codeEditDist, selectionTop + previewEditorHeight);
		let edit2 = editStart2.deltaX(previewEditorWidth);

		// padding
		const isInsertion = codeHeight === 0;
		if (!isInsertion) {
			codeStart1 = codeStart1.deltaY(-PADDING).deltaX(-PADDING);
			code1 = code1.deltaY(-PADDING);
			codeStart2 = codeStart2.deltaY(PADDING).deltaX(-PADDING);
			code2 = code2.deltaY(PADDING);

			editStart1 = editStart1.deltaY(-PADDING);
			edit1 = edit1.deltaY(-PADDING).deltaX(PADDING);
			editStart2 = editStart2.deltaY(PADDING);
			edit2 = edit2.deltaY(PADDING).deltaX(PADDING);
		} else {
			// Align top of edit with insertion line
			edit1 = edit1.deltaX(PADDING);
			editStart2 = editStart2.deltaY(2 * PADDING);
			edit2 = edit2.deltaY(2 * PADDING).deltaX(PADDING);
		}

		return {
			code1,
			codeStart1,
			code2,
			codeStart2,
			codeHeight,
			codeScrollLeft: horizontalScrollOffset,

			editStart1,
			edit1,
			editStart2,
			edit2,
			editHeight,
			maxContentWidth,
			shouldShowShadow: clipped,
			desiredPreviewEditorScrollLeft,
			previewEditorWidth,
			padding: PADDING,
			borderRadius: PADDING
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

		const extendedModifiedPathBuilder = createRectangle(
			{ topLeft: layoutInfo.editStart1, width: layoutInfo.edit1.x - layoutInfo.editStart1.x, height: layoutInfo.editStart2.y - layoutInfo.editStart1.y },
			0,
			{ topLeft: 0, bottomLeft: 0, topRight: layoutInfo.borderRadius, bottomRight: layoutInfo.borderRadius },
			{ hideLeft: true }
		);

		if (layoutInfo.editStart2.y !== layoutInfo.code2.y) {
			extendedModifiedPathBuilder.moveTo(layoutInfo.editStart2);
			extendedModifiedPathBuilder.curveTo2(layoutInfo.editStart2.deltaX(-20), layoutInfo.code2.deltaX(20), layoutInfo.code2.deltaX(0));
		}
		extendedModifiedPathBuilder.lineTo(layoutInfo.code2).moveTo(layoutInfo.code1).lineTo(layoutInfo.editStart1);
		return extendedModifiedPathBuilder.build();
	});

	private readonly _originalBackgroundColor = observableFromEvent(this, this._themeService.onDidColorThemeChange, () => {
		return this._themeService.getColorTheme().getColor(originalBackgroundColor) ?? Color.transparent;
	});

	private readonly _backgroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, [
		n.svgElem('path', {
			class: 'rightOfModifiedBackgroundCoverUp',
			d: derived(reader => {
				const layoutInfo = this._previewEditorLayoutInfo.read(reader);
				if (!layoutInfo) {
					return undefined;
				}
				const originalBackgroundColor = this._originalBackgroundColor.read(reader);
				if (originalBackgroundColor.isTransparent()) {
					return undefined;
				}

				return new PathBuilder()
					.moveTo(layoutInfo.code1)
					.lineTo(layoutInfo.code1.deltaX(1000))
					.lineTo(layoutInfo.code2.deltaX(1000))
					.lineTo(layoutInfo.code2)
					.build();
			}),
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

	private readonly _middleBorderWithShadow = n.div({
		class: ['middleBorderWithShadow'],
		style: {
			position: 'absolute',
			display: this._previewEditorLayoutInfo.map(i => i?.shouldShowShadow ? 'block' : 'none'),
			width: '6px',
			boxShadow: 'var(--vscode-scrollbar-shadow) -6px 0 6px -6px inset',
			left: this._previewEditorLayoutInfo.map(i => i ? i.code1.x - 6 : 0),
			top: this._previewEditorLayoutInfo.map(i => i ? i.code1.y : 0),
			height: this._previewEditorLayoutInfo.map(i => i ? i.code2.y - i.code1.y : 0),
		},
	}, []).keepUpdated(this._store);

	private readonly _foregroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, derived(reader => {
		const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		return [
			n.svgElem('path', {
				class: 'originalOverlay',
				d: layoutInfoObs.map(layoutInfo => createRectangle(
					{ topLeft: layoutInfo.codeStart1, width: layoutInfo.code1.x - layoutInfo.codeStart1.x, height: layoutInfo.code2.y - layoutInfo.code1.y },
					0,
					{ topLeft: layoutInfo.borderRadius, bottomLeft: layoutInfo.borderRadius, topRight: 0, bottomRight: 0 },
					{ hideRight: true, hideLeft: layoutInfo.codeScrollLeft !== 0 }
				).build()),
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
			n.svgElem('path', {
				class: 'middleBorder',
				d: layoutInfoObs.map(layoutInfo => new PathBuilder()
					.moveTo(layoutInfo.code1)
					.lineTo(layoutInfo.code2)
					.build()
				),
				style: {
					display: layoutInfoObs.map(i => i.shouldShowShadow ? 'none' : 'block'),
					stroke: 'var(--vscode-inlineEdit-modifiedBorder)',
					strokeWidth: '1px'
				}
			})
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
		derived(this, reader => this._shouldOverflow.read(reader) ? [] : [this._foregroundBackgroundSvg, this._editorContainer, this._foregroundSvg, this._middleBorderWithShadow]),
	]).keepUpdated(this._store);

	private readonly _overflowView = n.div({
		class: 'inline-edits-view',
		style: {
			overflow: 'visible',
			zIndex: '20',
			display: this._display,
		},
	}, [
		derived(this, reader => this._shouldOverflow.read(reader) ? [this._foregroundBackgroundSvg, this._editorContainer, this._foregroundSvg, this._middleBorderWithShadow] : []),
	]).keepUpdated(this._store);
}
