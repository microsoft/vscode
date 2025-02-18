/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, getWindow, n } from '../../../../../../../base/browser/dom.js';
import { Color } from '../../../../../../../base/common/color.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun, constObservable, derived, derivedObservableWithCache, observableFromEvent } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../browser/rect.js';
import { EmbeddedCodeEditorWidget } from '../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { ITextModel } from '../../../../../../common/model.js';
import { StickyScrollController } from '../../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineCompletionContextKeys } from '../../../controller/inlineCompletionContextKeys.js';
import { IInlineEditsView, IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../inlineEditWithChanges.js';
import { getModifiedBorderColor, getOriginalBorderColor, modifiedBackgroundColor, originalBackgroundColor } from '../theme.js';
import { PathBuilder, createRectangle, getOffsetForPos, mapOutFalsy, maxContentWidthInRange } from '../utils/utils.js';

const PADDING = 4;
const ENABLE_OVERFLOW = false;

export class InlineEditsSideBySideView extends Disposable implements IInlineEditsView {

	// This is an approximation and should be improved by using the real parameters used bellow
	static fitsInsideViewport(editor: ICodeEditor, edit: InlineEditWithChanges, originalDisplayRange: LineRange, reader: IReader): boolean {
		const editorObs = observableCodeEditor(editor);
		const editorWidth = editorObs.layoutInfoWidth.read(reader);
		const editorContentLeft = editorObs.layoutInfoContentLeft.read(reader);
		const editorVerticalScrollbar = editor.getLayoutInfo().verticalScrollbarWidth;
		const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const minimapWidth = editorObs.layoutInfoMinimap.read(reader).minimapLeft !== 0 ? editorObs.layoutInfoMinimap.read(reader).minimapWidth : 0;

		const maxOriginalContent = maxContentWidthInRange(editorObs, originalDisplayRange, undefined/* do not reconsider on each layout info change */);
		const maxModifiedContent = edit.lineEdit.newLines.reduce((max, line) => Math.max(max, line.length * w), 0);
		const endOfEditorPadding = 20; // padding after last line of editor
		const editorsPadding = edit.modifiedLineRange.length <= edit.originalLineRange.length ? PADDING * 3 + endOfEditorPadding : 60 + endOfEditorPadding * 2;

		return maxOriginalContent + maxModifiedContent + editorsPadding < editorWidth - editorContentLeft - editorVerticalScrollbar - minimapWidth;
	}

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
		private readonly _host: IInlineEditsViewHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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
				return;
			}
			const editorRect = layoutInfo.editRect.deltaTop(layoutInfo.padding).deltaBottom(-layoutInfo.padding);

			this.previewEditor.layout({ height: editorRect.height, width: layoutInfo.previewEditorWidth + 15 /* Make sure editor does not scroll horizontally */ });
			this._editorContainer.element.style.top = `${editorRect.top}px`;
			this._editorContainer.element.style.left = `${editorRect.left}px`;
			this._editorContainer.element.style.width = `${layoutInfo.previewEditorWidth}px`; // Set width to clip view zone
		}));

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

	private readonly _editorContainer = n.div({
		class: ['editorContainer', this._editorObs.getOption(EditorOption.inlineSuggest).map(v => !v.edits.useGutterIndicator && 'showHover')],
		style: { position: 'absolute', overflow: 'hidden', cursor: 'pointer' },
		onclick: () => {
			this._host.accept();
		}
	}, [
		n.div({ class: 'preview', style: { pointerEvents: 'none' }, ref: this.previewRef }),
	]).keepUpdated(this._store);

	public readonly isHovered = this._editorContainer.didMouseMoveDuringHover;

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
		this._previewEditorObs.model.read(reader); // update when the model is set

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
		const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getBottomForLineNumber(range.endLineNumberExclusive - 1) - this._editorObs.scrollTop.read(reader);

		// TODO: const { prefixLeftOffset } = getPrefixTrim(inlineEdit.edit.edits.map(e => e.range), inlineEdit.originalLineRange, [], this._editor);
		const codeLeft = editorLayout.contentLeft;

		let codeRect = Rect.fromLeftTopRightBottom(codeLeft, selectionTop, left, selectionBottom);

		const editHeight = this._editor.getOption(EditorOption.lineHeight) * inlineEdit.modifiedLineRange.length;
		const codeHeight = selectionBottom - selectionTop;
		const previewEditorHeight = Math.max(codeHeight, editHeight);

		const editIsSameHeight = codeRect.height === previewEditorHeight;
		const codeEditDistRange = editIsSameHeight
			? new OffsetRange(4, 61)
			: new OffsetRange(60, 61);

		const clipped = dist === 0;
		const codeEditDist = editIsSameHeight ? PADDING : codeEditDistRange.clip(dist); // TODO: Is there a better way to specify the distance?
		const previewEditorWidth = Math.min(previewContentWidth, remainingWidthRightOfEditor + editorLayout.width - editorLayout.contentLeft - codeEditDist);

		let editRect = Rect.fromLeftTopWidthHeight(left + codeEditDist, selectionTop, previewEditorWidth, previewEditorHeight);

		const isInsertion = codeRect.height === 0;
		if (!isInsertion) {
			codeRect = codeRect.withMargin(PADDING).deltaRight(-PADDING);
			editRect = editRect.withMargin(PADDING).deltaLeft(PADDING);
		} else {
			// Align top of edit with insertion line
			editRect = editRect.withMargin(PADDING).translateY(PADDING);
		}

		// debugView(debugLogRects({ codeRect, editRect }, this._editor.getDomNode()!), reader);

		return {
			codeRect,
			editRect,
			codeScrollLeft: horizontalScrollOffset,

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
		if (!ENABLE_OVERFLOW) {
			return false;
		}
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

		const path = new PathBuilder()
			.moveTo(layoutInfo.codeRect.getRightBottom())
			.lineTo(layoutInfo.codeRect.getRightTop())
			.lineTo(layoutInfo.editRect.getLeftTop())
			.lineTo(layoutInfo.editRect.getRightTop().deltaX(-layoutInfo.borderRadius))
			.curveTo(layoutInfo.editRect.getRightTop(), layoutInfo.editRect.getRightTop().deltaY(layoutInfo.borderRadius))
			.lineTo(layoutInfo.editRect.getRightBottom().deltaY(-layoutInfo.borderRadius))
			.curveTo(layoutInfo.editRect.getRightBottom(), layoutInfo.editRect.getRightBottom().deltaX(-layoutInfo.borderRadius))
			.lineTo(layoutInfo.editRect.getLeftBottom());

		if (layoutInfo.editRect.bottom !== layoutInfo.codeRect.bottom) {
			path.curveTo2(layoutInfo.editRect.getLeftBottom().deltaX(-20), layoutInfo.codeRect.getRightBottom().deltaX(20), layoutInfo.codeRect.getRightBottom().deltaX(0));
		}
		path.lineTo(layoutInfo.codeRect.getRightBottom());
		return path.build();
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
					.moveTo(layoutInfo.codeRect.getRightTop())
					.lineTo(layoutInfo.codeRect.getRightTop().deltaX(1000))
					.lineTo(layoutInfo.codeRect.getRightBottom().deltaX(1000))
					.lineTo(layoutInfo.codeRect.getRightBottom())
					.build();
			}),
			style: {
				fill: 'var(--vscode-editor-background, transparent)',
			}
		}),
	]).keepUpdated(this._store);

	private readonly _modifiedBackgroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, [
		n.svgElem('path', {
			class: 'extendedModifiedBackgroundCoverUp',
			d: this._extendedModifiedPath,
			style: {
				fill: 'var(--vscode-editor-background, transparent)',
				strokeWidth: '0px',
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
				fill: 'var(--vscode-inlineEdit-modifiedChangedLineBackground, transparent)',
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
			left: this._previewEditorLayoutInfo.map(i => i ? i.codeRect.right - 6 : 0),
			top: this._previewEditorLayoutInfo.map(i => i ? i.codeRect.top : 0),
			height: this._previewEditorLayoutInfo.map(i => i ? i.codeRect.height : 0),
		},
	}, []).keepUpdated(this._store);

	private readonly _foregroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, derived(reader => {
		const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		const modifiedBorderColor = getModifiedBorderColor(this._host.tabAction).read(reader);
		const originalBorderColor = getOriginalBorderColor(this._host.tabAction).read(reader);

		return [
			n.svgElem('path', {
				class: 'originalOverlay',
				d: layoutInfoObs.map(layoutInfo => createRectangle(
					{ topLeft: layoutInfo.codeRect.getLeftTop(), width: layoutInfo.codeRect.width, height: layoutInfo.codeRect.height },
					0,
					{ topLeft: layoutInfo.borderRadius, bottomLeft: layoutInfo.borderRadius, topRight: 0, bottomRight: 0 },
					{ hideRight: true, hideLeft: layoutInfo.codeScrollLeft !== 0 }
				)),
				style: {
					fill: asCssVariable(originalBackgroundColor),
					stroke: originalBorderColor,
					strokeWidth: '1px',
				}
			}),

			n.svgElem('path', {
				class: 'extendedModifiedOverlay',
				d: this._extendedModifiedPath,
				style: {
					fill: asCssVariable(modifiedBackgroundColor),
					stroke: modifiedBorderColor,
					strokeWidth: '1px',
				}
			}),
			n.svgElem('path', {
				class: 'middleBorder',
				d: layoutInfoObs.map(layoutInfo => new PathBuilder()
					.moveTo(layoutInfo.codeRect.getRightTop())
					.lineTo(layoutInfo.codeRect.getRightBottom())
					.build()
				),
				style: {
					display: layoutInfoObs.map(i => i.shouldShowShadow ? 'none' : 'block'),
					stroke: modifiedBorderColor,
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
		derived(this, reader => this._shouldOverflow.read(reader) ? [] : [this._modifiedBackgroundSvg, this._foregroundBackgroundSvg, this._editorContainer, this._foregroundSvg, this._middleBorderWithShadow]),
	]).keepUpdated(this._store);

	private readonly _overflowView = n.div({
		class: 'inline-edits-view',
		style: {
			overflow: 'visible',
			zIndex: '20',
			display: this._display,
		},
	}, [
		derived(this, reader => this._shouldOverflow.read(reader) ? [this._modifiedBackgroundSvg, this._foregroundBackgroundSvg, this._editorContainer, this._foregroundSvg, this._middleBorderWithShadow] : []),
	]).keepUpdated(this._store);
}
