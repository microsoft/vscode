/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, getWindow, n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Color } from '../../../../../../../base/common/color.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun, constObservable, derived, derivedObservableWithCache, observableFromEvent } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { editorBackground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable, asCssVariableWithDefault } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../browser/rect.js';
import { EmbeddedCodeEditorWidget } from '../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { ITextModel } from '../../../../../../common/model.js';
import { StickyScrollController } from '../../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineCompletionContextKeys } from '../../../controller/inlineCompletionContextKeys.js';
import { IInlineEditsView, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../inlineEditWithChanges.js';
import { getEditorBlendedColor, getModifiedBorderColor, getOriginalBorderColor, modifiedBackgroundColor, originalBackgroundColor } from '../theme.js';
import { PathBuilder, getContentRenderWidth, getOffsetForPos, mapOutFalsy, maxContentWidthInRange } from '../utils/utils.js';

const HORIZONTAL_PADDING = 0;
const VERTICAL_PADDING = 0;
const ENABLE_OVERFLOW = false;

const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const BORDER_RADIUS = 4;
const ORIGINAL_END_PADDING = 20;
const MODIFIED_END_PADDING = 12;

export class InlineEditsSideBySideView extends Disposable implements IInlineEditsView {

	// This is an approximation and should be improved by using the real parameters used bellow
	static fitsInsideViewport(editor: ICodeEditor, textModel: ITextModel, edit: InlineEditWithChanges, reader: IReader): boolean {
		const editorObs = observableCodeEditor(editor);
		const editorWidth = editorObs.layoutInfoWidth.read(reader);
		const editorContentLeft = editorObs.layoutInfoContentLeft.read(reader);
		const editorVerticalScrollbar = editor.getLayoutInfo().verticalScrollbarWidth;
		const minimapWidth = editorObs.layoutInfoMinimap.read(reader).minimapLeft !== 0 ? editorObs.layoutInfoMinimap.read(reader).minimapWidth : 0;

		const maxOriginalContent = maxContentWidthInRange(editorObs, edit.displayRange, undefined/* do not reconsider on each layout info change */);
		const maxModifiedContent = edit.lineEdit.newLines.reduce((max, line) => Math.max(max, getContentRenderWidth(line, editor, textModel)), 0);
		const originalPadding = ORIGINAL_END_PADDING; // padding after last line of original editor
		const modifiedPadding = MODIFIED_END_PADDING + 2 * BORDER_WIDTH; // padding after last line of modified editor

		return maxOriginalContent + maxModifiedContent + originalPadding + modifiedPadding < editorWidth - editorContentLeft - editorVerticalScrollbar - minimapWidth;
	}

	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _previewTextModel: ITextModel,
		private readonly _uiState: IObservable<{
			newTextLineCount: number;
		} | undefined>,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

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
			const editorRect = layoutInfo.editRect.withMargin(-VERTICAL_PADDING, -HORIZONTAL_PADDING);

			this.previewEditor.layout({ height: editorRect.height, width: layoutInfo.previewEditorWidth + 15 /* Make sure editor does not scroll horizontally */ });
			this._editorContainer.element.style.top = `${editorRect.top}px`;
			this._editorContainer.element.style.left = `${editorRect.left}px`;
			this._editorContainer.element.style.width = `${layoutInfo.previewEditorWidth + HORIZONTAL_PADDING}px`; // Set width to clip view zone
			//this._editorContainer.element.style.borderRadius = `0 ${BORDER_RADIUS}px ${BORDER_RADIUS}px 0`;
		}));

		this._register(autorun(reader => {
			const layoutInfo = this._previewEditorLayoutInfo.read(reader);
			if (!layoutInfo) {
				return;
			}

			this._previewEditorObs.editor.setScrollLeft(layoutInfo.desiredPreviewEditorScrollLeft);
		}));

		this._updatePreviewEditor.recomputeInitiallyAndOnChange(this._store);
	}

	private readonly _display = derived(this, reader => !!this._uiState.read(reader) ? 'block' : 'none');

	private readonly previewRef = n.ref<HTMLDivElement>();

	private readonly _editorContainer = n.div({
		class: ['editorContainer'],
		style: { position: 'absolute', overflow: 'hidden', cursor: 'pointer' },
		onmousedown: e => {
			e.preventDefault(); // This prevents that the editor loses focus
		},
		onclick: (e) => {
			this._onDidClick.fire(new StandardMouseEvent(getWindow(e), e));
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
		if (this._nonOverflowView) {
			this._nonOverflowView.element.style.display = this._display.read(reader);
		}

		const uiState = this._uiState.read(reader);
		const edit = this._edit.read(reader);
		if (!uiState || !edit) {
			return;
		}

		const range = edit.originalLineRange;

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
	});

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

	private readonly _originalDisplayRange = this._edit.map(e => e?.displayRange);
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
		const previewEditorLeftInTextArea = Math.min(editorContentMaxWidthInRange + ORIGINAL_END_PADDING, maxPreviewEditorLeft);

		const maxContentWidth = editorContentMaxWidthInRange + ORIGINAL_END_PADDING + previewContentWidth + 70;

		const dist = maxPreviewEditorLeft - previewEditorLeftInTextArea;

		let desiredPreviewEditorScrollLeft;
		let codeRight;
		if (previewEditorLeftInTextArea > horizontalScrollOffset) {
			desiredPreviewEditorScrollLeft = 0;
			codeRight = editorLayout.contentLeft + previewEditorLeftInTextArea - horizontalScrollOffset;
		} else {
			desiredPreviewEditorScrollLeft = horizontalScrollOffset - previewEditorLeftInTextArea;
			codeRight = editorLayout.contentLeft;
		}

		const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getBottomForLineNumber(range.endLineNumberExclusive - 1) - this._editorObs.scrollTop.read(reader);

		// TODO: const { prefixLeftOffset } = getPrefixTrim(inlineEdit.edit.edits.map(e => e.range), inlineEdit.originalLineRange, [], this._editor);
		const codeLeft = editorLayout.contentLeft - horizontalScrollOffset;

		let codeRect = Rect.fromLeftTopRightBottom(codeLeft, selectionTop, codeRight, selectionBottom);
		const isInsertion = codeRect.height === 0;
		if (!isInsertion) {
			codeRect = codeRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING);
		}

		const editHeight = this._editor.getOption(EditorOption.lineHeight) * inlineEdit.modifiedLineRange.length;
		const codeHeight = selectionBottom - selectionTop;
		const previewEditorHeight = Math.max(codeHeight, editHeight);

		const clipped = dist === 0;
		const codeEditDist = 0;
		const previewEditorWidth = Math.min(previewContentWidth + MODIFIED_END_PADDING, remainingWidthRightOfEditor + editorLayout.width - editorLayout.contentLeft - codeEditDist);

		let editRect = Rect.fromLeftTopWidthHeight(codeRect.right + codeEditDist, selectionTop, previewEditorWidth, previewEditorHeight);
		if (!isInsertion) {
			editRect = editRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING).translateX(HORIZONTAL_PADDING + BORDER_WIDTH);
		} else {
			// Align top of edit with insertion line
			editRect = editRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING).translateY(VERTICAL_PADDING);
		}

		// debugView(debugLogRects({ codeRect, editRect }, this._editor.getDomNode()!), reader);

		return {
			codeRect,
			editRect,
			codeScrollLeft: horizontalScrollOffset,
			contentLeft: editorLayout.contentLeft,

			isInsertion,
			maxContentWidth,
			shouldShowShadow: clipped,
			desiredPreviewEditorScrollLeft,
			previewEditorWidth,
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
				fill: asCssVariableWithDefault(editorBackground, 'transparent'),
			}
		}),
	]).keepUpdated(this._store);

	private readonly _originalOverlay = n.div({
		style: { pointerEvents: 'none', display: this._previewEditorLayoutInfo.map(layoutInfo => layoutInfo?.isInsertion ? 'none' : 'block') },
	}, derived(reader => {
		const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		const borderStyling = getOriginalBorderColor(this._tabAction).map(bc => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`);
		const borderStylingSeparator = `${BORDER_WIDTH + WIDGET_SEPARATOR_WIDTH}px solid ${asCssVariable(editorBackground)}`;

		const hasBorderLeft = layoutInfoObs.read(reader).codeScrollLeft !== 0;
		const isModifiedLower = layoutInfoObs.map(layoutInfo => layoutInfo.codeRect.bottom < layoutInfo.editRect.bottom);
		const transitionRectSize = BORDER_RADIUS * 2 + BORDER_WIDTH * 2;

		// Create an overlay which hides the left hand side of the original overlay when it overflows to the left
		// such that there is a smooth transition at the edge of content left
		const overlayHider = layoutInfoObs.map(layoutInfo => Rect.fromLeftTopRightBottom(
			layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
			layoutInfo.codeRect.top,
			layoutInfo.contentLeft,
			layoutInfo.codeRect.bottom + transitionRectSize
		)).read(reader);

		const intersectionLine = new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER);
		const overlayRect = layoutInfoObs.map(layoutInfo => layoutInfo.codeRect.intersectHorizontal(intersectionLine));
		const separatorRect = overlayRect.map(overlayRect => overlayRect.withMargin(WIDGET_SEPARATOR_WIDTH, 0, WIDGET_SEPARATOR_WIDTH, WIDGET_SEPARATOR_WIDTH).intersectHorizontal(intersectionLine));

		const transitionRect = overlayRect.map(overlayRect => Rect.fromLeftTopWidthHeight(overlayRect.right - transitionRectSize + BORDER_WIDTH, overlayRect.bottom - BORDER_WIDTH, transitionRectSize, transitionRectSize).intersectHorizontal(intersectionLine));

		return [
			n.div({
				class: 'originalSeparatorSideBySide',
				style: {
					...separatorRect.read(reader).toStyles(),
					boxSizing: 'border-box',
					borderRadius: `${BORDER_RADIUS}px 0 0 ${BORDER_RADIUS}px`,
					borderTop: borderStylingSeparator,
					borderBottom: borderStylingSeparator,
					borderLeft: hasBorderLeft ? 'none' : borderStylingSeparator,
				}
			}),

			n.div({
				class: 'originalOverlaySideBySide',
				style: {
					...overlayRect.read(reader).toStyles(),
					boxSizing: 'border-box',
					borderRadius: `${BORDER_RADIUS}px 0 0 ${BORDER_RADIUS}px`,
					borderTop: borderStyling,
					borderBottom: borderStyling,
					borderLeft: hasBorderLeft ? 'none' : borderStyling,
					backgroundColor: asCssVariable(originalBackgroundColor),
				}
			}),

			n.div({
				class: 'originalCornerCutoutSideBySide',
				style: {
					pointerEvents: 'none',
					display: isModifiedLower.map(isLower => isLower ? 'block' : 'none'),
					...transitionRect.read(reader).toStyles(),
				}
			}, [
				n.div({
					class: 'originalCornerCutoutBackground',
					style: {
						position: 'absolute', top: '0px', left: '0px', width: '100%', height: '100%',
						backgroundColor: getEditorBlendedColor(originalBackgroundColor, this._themeService).map(c => c.toString()),
					}
				}),
				n.div({
					class: 'originalCornerCutoutBorder',
					style: {
						position: 'absolute', top: '0px', left: '0px', width: '100%', height: '100%',
						boxSizing: 'border-box',
						borderTop: borderStyling,
						borderRight: borderStyling,
						borderRadius: `0 100% 0 0`,
						backgroundColor: asCssVariable(editorBackground)
					}
				})
			]),
			n.div({
				class: 'originalOverlaySideBySideHider',
				style: {
					...overlayHider.toStyles(),
					backgroundColor: asCssVariable(editorBackground),
				}
			}),
		];
	})).keepUpdated(this._store);

	private readonly _modifiedOverlay = n.div({
		style: { pointerEvents: 'none', }
	}, derived(reader => {
		const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		const isModifiedLower = layoutInfoObs.map(layoutInfo => layoutInfo.codeRect.bottom < layoutInfo.editRect.bottom);

		const borderRadius = isModifiedLower.map(isLower => `0 ${BORDER_RADIUS}px ${BORDER_RADIUS}px ${isLower ? BORDER_RADIUS : 0}px`);
		const borderStyling = getEditorBlendedColor(getModifiedBorderColor(this._tabAction), this._themeService).map(c => `1px solid ${c.toString()}`);
		const borderStylingSeparator = `${BORDER_WIDTH + WIDGET_SEPARATOR_WIDTH}px solid ${asCssVariable(editorBackground)}`;

		const overlayRect = layoutInfoObs.map(layoutInfo => layoutInfo.editRect.withMargin(0, BORDER_WIDTH));
		const separatorRect = overlayRect.map(overlayRect => overlayRect.withMargin(WIDGET_SEPARATOR_WIDTH, WIDGET_SEPARATOR_WIDTH, WIDGET_SEPARATOR_WIDTH, 0));

		const insertionRect = derived(reader => {
			const overlay = overlayRect.read(reader);
			const layoutinfo = layoutInfoObs.read(reader);
			if (!layoutinfo.isInsertion || layoutinfo.contentLeft >= overlay.left) {
				return Rect.fromLeftTopWidthHeight(overlay.left, overlay.top, 0, 0);
			}
			return new Rect(layoutinfo.contentLeft, overlay.top, overlay.left, overlay.top + BORDER_WIDTH * 2);
		});

		return [
			n.div({
				class: 'modifiedInsertionSideBySide',
				style: {
					...insertionRect.read(reader).toStyles(),
					backgroundColor: getModifiedBorderColor(this._tabAction).map(c => asCssVariable(c)),
				}
			}),
			n.div({
				class: 'modifiedSeparatorSideBySide',
				style: {
					...separatorRect.read(reader).toStyles(),
					borderRadius,
					borderTop: borderStylingSeparator,
					borderBottom: borderStylingSeparator,
					borderRight: borderStylingSeparator,
					boxSizing: 'border-box',
				}
			}),
			n.div({
				class: 'modifiedOverlaySideBySide',
				style: {
					...overlayRect.read(reader).toStyles(),
					borderRadius,
					border: borderStyling,
					boxSizing: 'border-box',
					backgroundColor: asCssVariable(modifiedBackgroundColor),
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
			display: this._display,
		},
	}, [
		this._backgroundSvg,
		derived(this, reader => this._shouldOverflow.read(reader) ? [] : [this._editorContainer, this._originalOverlay, this._modifiedOverlay]),
	]).keepUpdated(this._store);
}
