/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChildNode, n, ObserverNode, ObserverNodeWithElement } from '../../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun, constObservable, debouncedObservable2, derived, derivedDisposable } from '../../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../../common/core/2d/rect.js';
import { Position } from '../../../../../../../common/core/position.js';
import { ITextModel } from '../../../../../../../common/model.js';
import { IInlineEditsView, InlineEditTabAction } from '../../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../../inlineEditWithChanges.js';
import { getContentSizeOfLines, rectToProps } from '../../utils/utils.js';
import { DetailedLineRangeMapping } from '../../../../../../../common/diff/rangeMapping.js';
import { OffsetRange } from '../../../../../../../common/core/ranges/offsetRange.js';
import { LineRange } from '../../../../../../../common/core/ranges/lineRange.js';
import { HideUnchangedRegionsFeature } from '../../../../../../../browser/widget/diffEditor/features/hideUnchangedRegionsFeature.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { SymbolKinds } from '../../../../../../../common/languages.js';
import { debugLogHorizontalOffsetRanges, debugLogRects, debugView } from '../debugVisualization.js';
import { distributeFlexBoxLayout } from '../../utils/flexBoxLayout.js';
import { Point } from '../../../../../../../common/core/2d/point.js';
import { Size2D } from '../../../../../../../common/core/2d/size.js';
import { getMaxTowerHeightInAvailableArea } from '../../utils/towersLayout.js';
import { IThemeService } from '../../../../../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../../../../../platform/keybinding/common/keybinding.js';
import { getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSuccessfulBackground } from '../../theme.js';
import { asCssVariable, descriptionForeground, editorBackground, editorWidgetBackground } from '../../../../../../../../platform/theme/common/colorRegistry.js';
import { ILongDistancePreviewProps, LongDistancePreviewEditor } from './longDistancePreviewEditor.js';
import { InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../components/gutterIndicatorView.js';
import { jumpToNextInlineEditId } from '../../../../controller/commandIds.js';

const BORDER_RADIUS = 4;
const MAX_WIDGET_WIDTH = { EMPTY_SPACE: 425, OVERLAY: 375 };
const MIN_WIDGET_WIDTH = 250;

export class InlineEditsLongDistanceHint extends Disposable implements IInlineEditsView {

	private readonly _editorObs;
	readonly onDidClick = Event.None;
	private _viewWithElement: ObserverNodeWithElement<HTMLDivElement> | undefined = undefined;

	private readonly _previewEditor;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _viewState: IObservable<ILongDistanceViewState | undefined>,
		private readonly _previewTextModel: ITextModel,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._styles = this._tabAction.map((v, reader) => {
			let border;
			switch (v) {
				case InlineEditTabAction.Inactive: border = inlineEditIndicatorSecondaryBackground; break;
				case InlineEditTabAction.Jump: border = inlineEditIndicatorPrimaryBackground; break;
				case InlineEditTabAction.Accept: border = inlineEditIndicatorSuccessfulBackground; break;
			}
			return {
				border: getEditorBlendedColor(border, this._themeService).read(reader).toString(),
				background: asCssVariable(editorBackground)
			};
		});

		this._editorObs = observableCodeEditor(this._editor);

		this._previewEditor = this._register(
			this._instantiationService.createInstance(
				LongDistancePreviewEditor,
				this._previewTextModel,
				derived(reader => {
					const viewState = this._viewState.read(reader);
					if (!viewState) {
						return undefined;
					}
					return {
						diff: viewState.diff,
						model: viewState.model,
						inlineSuggestInfo: viewState.inlineSuggestInfo,
						nextCursorPosition: viewState.nextCursorPosition,
					} satisfies ILongDistancePreviewProps;
				}),
				this._editor,
				this._tabAction,
			)
		);

		this._viewWithElement = this._view.keepUpdated(this._store);
		this._register(this._editorObs.createOverlayWidget({
			domNode: this._viewWithElement.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
		}));

		this._widgetContent.get().keepUpdated(this._store);

		this._register(autorun(reader => {
			const layoutInfo = this._previewEditorLayoutInfo.read(reader);
			if (!layoutInfo) {
				return;
			}
			this._previewEditor.layout(layoutInfo.codeEditorSize.toDimension(), layoutInfo.desiredPreviewEditorScrollLeft);
		}));

		this._isVisibleDelayed.recomputeInitiallyAndOnChange(this._store);
	}

	private readonly _styles;

	public get isHovered() { return this._widgetContent.get().didMouseMoveDuringHover; }

	private readonly _hintTextPosition = derived(this, (reader) => {
		const viewState = this._viewState.read(reader);
		return viewState ? new Position(viewState.hint.lineNumber, Number.MAX_SAFE_INTEGER) : null;
	});

	private readonly _lineSizesAroundHintPosition = derived(this, (reader) => {
		const viewState = this._viewState.read(reader);
		const p = this._hintTextPosition.read(reader);
		if (!viewState || !p) {
			return undefined;
		}

		const model = this._editorObs.model.read(reader);
		if (!model) {
			return undefined;
		}
		const range = LineRange.ofLength(p.lineNumber, 1).addMargin(5, 5).intersect(LineRange.ofLength(1, model.getLineCount()));

		if (!range) {
			return undefined;
		}

		const sizes = getContentSizeOfLines(this._editorObs, range, reader);
		const top = this._editorObs.observeTopForLineNumber(range.startLineNumber).read(reader);

		return {
			lineRange: range,
			top: top,
			sizes: sizes,
		};
	});

	private readonly _isVisibleDelayed = debouncedObservable2(
		derived(this, reader => this._viewState.read(reader)?.hint.isVisible),
		(lastValue, newValue) => lastValue === true && newValue === false ? 200 : 0,
	);

	private readonly _previewEditorLayoutInfo = derived(this, (reader) => {
		const viewState = this._viewState.read(reader);

		if (!viewState || !this._isVisibleDelayed.read(reader)) {
			return undefined;
		}

		const lineSizes = this._lineSizesAroundHintPosition.read(reader);
		if (!lineSizes) {
			return undefined;
		}

		const editorScrollTop = this._editorObs.scrollTop.read(reader);
		const editorScrollLeft = this._editorObs.scrollLeft.read(reader);
		const editorLayout = this._editorObs.layoutInfo.read(reader);

		const previewContentHeight = this._previewEditor.contentHeight.read(reader);
		const previewEditorContentLayout = this._previewEditor.horizontalContentRangeInPreviewEditorToShow.read(reader);

		if (!previewContentHeight || !previewEditorContentLayout) {
			return undefined;
		}

		// const debugRects = stackSizesDown(new Point(editorLayout.contentLeft, lineSizes.top - scrollTop), lineSizes.sizes);

		const editorTrueContentWidth = editorLayout.contentWidth - editorLayout.verticalScrollbarWidth;
		const editorTrueContentRight = editorLayout.contentLeft + editorTrueContentWidth;

		// drawEditorWidths(this._editor, reader);

		const c = this._editorObs.cursorLineNumber.read(reader);
		if (!c) {
			return undefined;
		}

		const availableSpaceSizes = lineSizes.sizes.map((s, idx) => {
			const lineNumber = lineSizes.lineRange.startLineNumber + idx;
			let linePaddingLeft = 20;
			if (lineNumber === viewState.hint.lineNumber) {
				linePaddingLeft = 40;
			}
			return new Size2D(Math.max(0, editorTrueContentWidth - s.width - linePaddingLeft), s.height);
		});

		const showRects = false;
		if (showRects) {
			const rects2 = stackSizesDown(new Point(editorTrueContentRight, lineSizes.top - editorScrollTop), availableSpaceSizes, 'right');
			debugView(debugLogRects({ ...rects2 }, this._editor.getDomNode()!), reader);
		}

		const availableSpaceHeightPrefixSums = getSums(availableSpaceSizes, s => s.height);
		const availableSpaceSizesTransposed = availableSpaceSizes.map(s => s.transpose());

		const previewEditorMargin = 2;
		const widgetPadding = 2;
		const lowerBarHeight = 20;
		const widgetBorder = 1;

		const extraGutterMarginToAvoidScrollBar = 2;
		const previewEditorHeight = previewContentHeight! + extraGutterMarginToAvoidScrollBar;

		function getWidgetVerticalOutline(lineNumber: number): OffsetRange {
			const sizeIdx = lineNumber - lineSizes!.lineRange.startLineNumber;
			const top = lineSizes!.top + availableSpaceHeightPrefixSums[sizeIdx];
			const editorRange = OffsetRange.ofStartAndLength(top, previewEditorHeight);
			const verticalWidgetRange = editorRange.withMargin(previewEditorMargin + widgetPadding + widgetBorder).withMargin(0, lowerBarHeight);
			return verticalWidgetRange;
		}

		let possibleWidgetOutline = findFirstMinimzeDistance(lineSizes.lineRange.addMargin(-1, -1), viewState.hint.lineNumber, lineNumber => {
			const verticalWidgetRange = getWidgetVerticalOutline(lineNumber);
			const maxWidth = getMaxTowerHeightInAvailableArea(verticalWidgetRange.delta(-lineSizes.top), availableSpaceSizesTransposed);
			if (maxWidth < MIN_WIDGET_WIDTH) {
				return undefined;
			}
			const horizontalWidgetRange = OffsetRange.ofStartAndLength(editorTrueContentRight - maxWidth, maxWidth);
			return { horizontalWidgetRange, verticalWidgetRange };
		});

		let position: 'overlay' | 'empty-space' = 'empty-space';
		if (!possibleWidgetOutline) {
			position = 'overlay';
			const maxAvailableWidth = Math.min(editorLayout.width - editorLayout.contentLeft, MAX_WIDGET_WIDTH.OVERLAY);
			possibleWidgetOutline = {
				horizontalWidgetRange: OffsetRange.ofStartAndLength(editorTrueContentRight - maxAvailableWidth, maxAvailableWidth),
				verticalWidgetRange: getWidgetVerticalOutline(viewState.hint.lineNumber + 2).delta(10),
			};
		}

		if (!possibleWidgetOutline) {
			return undefined;
		}

		const rectAvailableSpace = Rect.fromRanges(
			possibleWidgetOutline.horizontalWidgetRange,
			possibleWidgetOutline.verticalWidgetRange
		).translateX(-editorScrollLeft).translateY(-editorScrollTop);

		const showAvailableSpace = false;
		if (showAvailableSpace) {
			debugView(debugLogRects({ rectAvailableSpace }, this._editor.getDomNode()!), reader);
		}

		const maxWidgetWidth = Math.min(position === 'overlay' ? MAX_WIDGET_WIDTH.OVERLAY : MAX_WIDGET_WIDTH.EMPTY_SPACE, previewEditorContentLayout.maxEditorWidth + previewEditorMargin + widgetPadding);

		const layout = distributeFlexBoxLayout(rectAvailableSpace.width, {
			spaceBefore: { min: 0, max: 10, priority: 1 },
			content: { min: 50, rules: [{ max: 150, priority: 2 }, { max: maxWidgetWidth, priority: 1 }] },
			spaceAfter: { min: 10 },
		});

		if (!layout) {
			return null;
		}

		const ranges = lengthsToOffsetRanges([layout.spaceBefore, layout.content, layout.spaceAfter], rectAvailableSpace.left);
		const spaceBeforeRect = rectAvailableSpace.withHorizontalRange(ranges[0]);
		const widgetRect = rectAvailableSpace.withHorizontalRange(ranges[1]);
		const spaceAfterRect = rectAvailableSpace.withHorizontalRange(ranges[2]);

		const showRects2 = false;
		if (showRects2) {
			debugView(debugLogRects({ spaceBeforeRect, widgetRect, spaceAfterRect }, this._editor.getDomNode()!), reader);
		}

		const previewEditorRect = widgetRect.withMargin(-widgetPadding - widgetBorder - previewEditorMargin).withMargin(0, 0, -lowerBarHeight, 0);

		const showEditorRect = false;
		if (showEditorRect) {
			debugView(debugLogRects({ previewEditorRect }, this._editor.getDomNode()!), reader);
		}

		const previewEditorContentWidth = previewEditorRect.width - previewEditorContentLayout.nonContentWidth;
		const maxPrefferedRangeLength = previewEditorContentWidth * 0.8;
		const preferredRangeToReveal = previewEditorContentLayout.preferredRangeToReveal.intersect(OffsetRange.ofStartAndLength(
			previewEditorContentLayout.preferredRangeToReveal.start,
			maxPrefferedRangeLength
		)) ?? previewEditorContentLayout.preferredRangeToReveal;
		const desiredPreviewEditorScrollLeft = scrollToReveal(previewEditorContentLayout.indentationEnd, previewEditorContentWidth, preferredRangeToReveal);

		return {
			codeEditorSize: previewEditorRect.getSize(),
			codeScrollLeft: editorScrollLeft,
			contentLeft: editorLayout.contentLeft,

			widgetRect,

			previewEditorMargin,
			widgetPadding,
			widgetBorder,

			lowerBarHeight,

			desiredPreviewEditorScrollLeft: desiredPreviewEditorScrollLeft.newScrollPosition,
		};
	});

	private readonly _view = n.div({
		class: 'inline-edits-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			display: derived(this, reader => !!this._previewEditorLayoutInfo.read(reader) ? 'block' : 'none'),
		},
	}, [
		derived(this, _reader => [this._widgetContent]),
	]);

	private readonly _widgetContent = derived(this, reader => // TODO@hediet: remove when n.div lazily creates previewEditor.element node
		n.div({
			class: 'inline-edits-long-distance-hint-widget',
			style: {
				position: 'absolute',
				overflow: 'hidden',
				cursor: 'pointer',
				background: asCssVariable(editorWidgetBackground),
				padding: this._previewEditorLayoutInfo.map(i => i?.widgetPadding),
				boxSizing: 'border-box',
				borderRadius: BORDER_RADIUS,
				border: derived(reader => `${this._previewEditorLayoutInfo.read(reader)?.widgetBorder}px solid ${this._styles.read(reader).border}`),
				display: 'flex',
				flexDirection: 'column',
				opacity: derived(reader => this._viewState.read(reader)?.hint.isVisible ? '1' : '0'),
				transition: 'opacity 200ms ease-in-out',
				...rectToProps(reader => this._previewEditorLayoutInfo.read(reader)?.widgetRect)
			},
			onmousedown: e => {
				e.preventDefault(); // This prevents that the editor loses focus
			},
			onclick: () => {
				this._viewState.read(undefined)?.model.jump();
			}
		}, [
			n.div({
				class: ['editorContainer'],
				style: {
					overflow: 'hidden',
					padding: this._previewEditorLayoutInfo.map(i => i?.previewEditorMargin),
					background: asCssVariable(editorBackground),
					pointerEvents: 'none',
				},
			}, [
				derived(this, r => this._previewEditor.element), // --
			]),
			n.div({ class: 'bar', style: { color: asCssVariable(descriptionForeground), pointerEvents: 'none', margin: '0 4px', height: this._previewEditorLayoutInfo.map(i => i?.lowerBarHeight), display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
				derived(this, reader => {
					const children: (HTMLElement | ObserverNode<HTMLDivElement>)[] = [];
					const viewState = this._viewState.read(reader);
					if (!viewState) {
						return children;
					}

					// Outline Element
					const source = this._originalOutlineSource.read(reader);
					const originalTargetLineNumber = this._originalTargetLineNumber.read(reader);
					const outlineItems = source?.getAt(originalTargetLineNumber, reader).slice(0, 1) ?? [];
					const outlineElements: ChildNode[] = [];
					if (outlineItems.length > 0) {
						for (let i = 0; i < outlineItems.length; i++) {
							const item = outlineItems[i];
							const icon = SymbolKinds.toIcon(item.kind);
							outlineElements.push(n.div({
								class: 'breadcrumb-item',
								style: { display: 'flex', alignItems: 'center', flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
							}, [
								renderIcon(icon),
								'\u00a0',
								item.name,
								...(i === outlineItems.length - 1
									? []
									: [renderIcon(Codicon.chevronRight)]
								)
							]));
						}
					}
					children.push(n.div({ class: 'outline-elements', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, outlineElements));

					// Show Edit Direction
					const arrowIcon = viewState.hint.lineNumber < originalTargetLineNumber ? Codicon.arrowDown : Codicon.arrowUp;
					const keybinding = this._keybindingService.lookupKeybinding(jumpToNextInlineEditId);
					let label = 'Go to suggestion';
					if (keybinding && keybinding.getLabel() === 'Tab') {
						label = 'Tab to jump';
					}
					children.push(n.div({
						class: 'go-to-label',
						style: { position: 'relative', display: 'flex', alignItems: 'center', flex: '0 0 auto', paddingLeft: '6px' },
					}, [
						label,
						'\u00a0',
						renderIcon(arrowIcon),
					]));

					return children;
				})
			]),
		])
	);

	// Drives breadcrumbs and symbol icon
	private readonly _originalTargetLineNumber = derived(this, (reader) => {
		const viewState = this._viewState.read(reader);
		if (!viewState) {
			return -1;
		}

		if (viewState.edit.action?.kind === 'jumpTo') {
			return viewState.edit.action.position.lineNumber;
		}

		return viewState.diff[0]?.original.startLineNumber ?? -1;
	});

	private readonly _originalOutlineSource = derivedDisposable(this, (reader) => {
		const m = this._editorObs.model.read(reader);
		const factory = HideUnchangedRegionsFeature._breadcrumbsSourceFactory.read(reader);
		return (!m || !factory) ? undefined : factory(m, this._instantiationService);
	});
}

export interface ILongDistanceHint {
	lineNumber: number;
	isVisible: boolean;
}

export interface ILongDistanceViewState {
	hint: ILongDistanceHint;
	newTextLineCount: number;
	edit: InlineEditWithChanges;
	diff: DetailedLineRangeMapping[];
	nextCursorPosition: Position | null;

	model: SimpleInlineSuggestModel;
	inlineSuggestInfo: InlineSuggestionGutterMenuData;
}

function lengthsToOffsetRanges(lengths: number[], initialOffset = 0): OffsetRange[] {
	const result: OffsetRange[] = [];
	let offset = initialOffset;
	for (const length of lengths) {
		result.push(new OffsetRange(offset, offset + length));
		offset += length;
	}
	return result;
}

function stackSizesDown(at: Point, sizes: Size2D[], alignment: 'left' | 'right' = 'left'): Rect[] {
	const rects: Rect[] = [];
	let offset = 0;
	for (const s of sizes) {
		rects.push(
			Rect.fromLeftTopWidthHeight(
				at.x + (alignment === 'left' ? 0 : -s.width),
				at.y + offset,
				s.width,
				s.height
			)
		);
		offset += s.height;
	}
	return rects;
}

function findFirstMinimzeDistance<T>(range: LineRange, targetLine: number, predicate: (lineNumber: number) => T | undefined): T | undefined {
	for (let offset = 0; ; offset++) {
		const down = targetLine + offset;
		if (down <= range.endLineNumberExclusive) {
			const result = predicate(down);
			if (result !== undefined) {
				return result;
			}
		}
		const up = targetLine - offset;
		if (up >= range.startLineNumber) {
			const result = predicate(up);
			if (result !== undefined) {
				return result;
			}
		}
		if (up < range.startLineNumber && down > range.endLineNumberExclusive) {
			return undefined;
		}
	}
}

function getSums<T>(array: T[], fn: (item: T) => number): number[] {
	const result: number[] = [0];
	let sum = 0;
	for (const item of array) {
		sum += fn(item);
		result.push(sum);
	}
	return result;
}

export function drawEditorWidths(e: ICodeEditor, reader: IReader) {
	const layoutInfo = e.getLayoutInfo();
	const contentLeft = new OffsetRange(0, layoutInfo.contentLeft);
	const trueContent = OffsetRange.ofStartAndLength(layoutInfo.contentLeft, layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth);
	const minimap = OffsetRange.ofStartAndLength(trueContent.endExclusive, layoutInfo.minimap.minimapWidth);
	const verticalScrollbar = OffsetRange.ofStartAndLength(minimap.endExclusive, layoutInfo.verticalScrollbarWidth);

	const r = new OffsetRange(0, 200);
	debugView(debugLogHorizontalOffsetRanges({
		contentLeft: Rect.fromRanges(contentLeft, r),
		trueContent: Rect.fromRanges(trueContent, r),
		minimap: Rect.fromRanges(minimap, r),
		verticalScrollbar: Rect.fromRanges(verticalScrollbar, r),
	}, e.getDomNode()!), reader);
}


/**
 * Changes the scroll position as little as possible just to reveal the given range in the window.
*/
export function scrollToReveal(currentScrollPosition: number, windowWidth: number, contentRangeToReveal: OffsetRange): { newScrollPosition: number } {
	const visibleRange = new OffsetRange(currentScrollPosition, currentScrollPosition + windowWidth);
	if (visibleRange.containsRange(contentRangeToReveal)) {
		return { newScrollPosition: currentScrollPosition };
	}
	if (contentRangeToReveal.length > windowWidth) {
		return { newScrollPosition: contentRangeToReveal.start };
	}
	if (contentRangeToReveal.endExclusive > visibleRange.endExclusive) {
		return { newScrollPosition: contentRangeToReveal.endExclusive - windowWidth };
	}
	if (contentRangeToReveal.start < visibleRange.start) {
		return { newScrollPosition: contentRangeToReveal.start };
	}
	return { newScrollPosition: currentScrollPosition };
}
