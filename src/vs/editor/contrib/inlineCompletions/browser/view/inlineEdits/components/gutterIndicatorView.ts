/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n, trackFocus } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, constObservable, debouncedObservable, derived, observableFromEvent, observableValue, runOnChange } from '../../../../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { IEditorMouseEvent } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { Rect } from '../../../../../../browser/rect.js';
import { HoverService } from '../../../../../../browser/services/hoverService/hoverService.js';
import { HoverWidget } from '../../../../../../browser/services/hoverService/hoverWidget.js';
import { EditorOption, RenderLineNumbersType } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { StickyScrollController } from '../../../../../stickyScroll/browser/stickyScrollController.js';
import { IInlineEditModel, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryBorder, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorsuccessfulBackground, inlineEditIndicatorsuccessfulBorder, inlineEditIndicatorsuccessfulForeground } from '../theme.js';
import { mapOutFalsy, rectToProps } from '../utils/utils.js';
import { GutterIndicatorMenuContent } from './gutterIndicatorMenu.js';

export class InlineEditsGutterIndicator extends Disposable {

	private get model() {
		const model = this._model.get();
		if (!model) { throw new BugIndicatingError('Inline Edit Model not available'); }
		return model;
	}

	private readonly _gutterIndicatorStyles: IObservable<{ background: string; foreground: string; border: string }>;
	private readonly _isHoveredOverInlineEditDebounced: IObservable<boolean>;

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _originalRange: IObservable<LineRange | undefined>,
		private readonly _verticalOffset: IObservable<number>,
		private readonly _model: IObservable<IInlineEditModel | undefined>,
		private readonly _isHoveringOverInlineEdit: IObservable<boolean>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IHoverService private readonly _hoverService: HoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		super();

		this._gutterIndicatorStyles = this._tabAction.map((v, reader) => {
			switch (v) {
				case InlineEditTabAction.Inactive: return {
					background: getEditorBlendedColor(inlineEditIndicatorSecondaryBackground, themeService).read(reader).toString(),
					foreground: getEditorBlendedColor(inlineEditIndicatorSecondaryForeground, themeService).read(reader).toString(),
					border: getEditorBlendedColor(inlineEditIndicatorSecondaryBorder, themeService).read(reader).toString(),
				};
				case InlineEditTabAction.Jump: return {
					background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, themeService).read(reader).toString(),
					foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, themeService).read(reader).toString(),
					border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, themeService).read(reader).toString()
				};
				case InlineEditTabAction.Accept: return {
					background: getEditorBlendedColor(inlineEditIndicatorsuccessfulBackground, themeService).read(reader).toString(),
					foreground: getEditorBlendedColor(inlineEditIndicatorsuccessfulForeground, themeService).read(reader).toString(),
					border: getEditorBlendedColor(inlineEditIndicatorsuccessfulBorder, themeService).read(reader).toString()
				};
			}
		});

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._indicator.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
		}));

		this._register(this._editorObs.editor.onMouseMove((e: IEditorMouseEvent) => {
			const state = this._state.get();
			if (state === undefined) { return; }

			const el = this._iconRef.element;
			const rect = el.getBoundingClientRect();
			const rectangularArea = Rect.fromLeftTopWidthHeight(rect.left, rect.top, rect.width, rect.height);
			const point = new Point(e.event.posx, e.event.posy);
			this._isHoveredOverIcon.set(rectangularArea.containsPoint(point), undefined);
		}));

		this._register(this._editorObs.editor.onDidScrollChange(() => {
			this._isHoveredOverIcon.set(false, undefined);
		}));

		this._isHoveredOverInlineEditDebounced = debouncedObservable(this._isHoveringOverInlineEdit, 100);

		// pulse animation when hovering inline edit
		this._register(runOnChange(this._isHoveredOverInlineEditDebounced, (isHovering) => {
			if (isHovering) {
				this.triggerAnimation();
			}
		}));

		this._register(autorun(reader => {
			this._indicator.readEffect(reader);
			if (this._indicator.element) {
				this._editorObs.editor.applyFontInfo(this._indicator.element);
			}
		}));
	}

	public triggerAnimation(): Promise<Animation> {
		if (this._accessibilityService.isMotionReduced()) {
			return new Animation(null, null).finished;
		}

		// PULSE ANIMATION:
		const animation = this._iconRef.element.animate([
			{
				outline: `2px solid ${this._gutterIndicatorStyles.map(v => v.border).get()}`,
				outlineOffset: '-1px',
				offset: 0
			},
			{
				outline: `2px solid transparent`,
				outlineOffset: '10px',
				offset: 1
			},
		], { duration: 500 });

		return animation.finished;
	}

	private readonly _originalRangeObs = mapOutFalsy(this._originalRange);

	private readonly _state = derived(reader => {
		const range = this._originalRangeObs.read(reader);
		if (!range) { return undefined; }
		return {
			range,
			lineOffsetRange: this._editorObs.observeLineOffsetRange(range, this._store),
		};
	});

	private readonly _stickyScrollController = StickyScrollController.get(this._editorObs.editor);
	private readonly _stickyScrollHeight = this._stickyScrollController
		? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController!.stickyScrollWidgetHeight)
		: constObservable(0);

	private readonly _lineNumberToRender = derived(this, reader => {
		if (this._verticalOffset.read(reader) !== 0) {
			return '';
		}

		const lineNumber = this._originalRange.read(reader)?.startLineNumber;
		const lineNumberOptions = this._editorObs.getOption(EditorOption.lineNumbers).read(reader);

		if (lineNumber === undefined || lineNumberOptions.renderType === RenderLineNumbersType.Off) {
			return '';
		}

		if (lineNumberOptions.renderType === RenderLineNumbersType.Interval) {
			const cursorPosition = this._editorObs.cursorPosition.read(reader);
			if (lineNumber % 10 === 0 || cursorPosition && cursorPosition.lineNumber === lineNumber) {
				return lineNumber.toString();
			}
			return '';
		}

		if (lineNumberOptions.renderType === RenderLineNumbersType.Relative) {
			const cursorPosition = this._editorObs.cursorPosition.read(reader);
			if (!cursorPosition) {
				return '';
			}
			const relativeLineNumber = Math.abs(lineNumber - cursorPosition.lineNumber);
			if (relativeLineNumber === 0) {
				return lineNumber.toString();
			}
			return relativeLineNumber.toString();
		}

		if (lineNumberOptions.renderType === RenderLineNumbersType.Custom) {
			if (lineNumberOptions.renderFn) {
				return lineNumberOptions.renderFn(lineNumber);
			}
			return '';
		}

		return lineNumber.toString();
	});

	private readonly _availableWidthForIcon = derived(this, reader => {
		const textModel = this._editorObs.editor.getModel();
		const editor = this._editorObs.editor;
		const layout = this._editorObs.layoutInfo.read(reader);
		const gutterWidth = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft;

		if (!textModel || gutterWidth <= 0) {
			return () => 0;
		}

		// no glyph margin => the entire gutter width is available as there is no optimal place to put the icon
		if (layout.lineNumbersLeft === 0) {
			return () => gutterWidth;
		}

		const lineNumberOptions = this._editorObs.getOption(EditorOption.lineNumbers).read(reader);
		if (lineNumberOptions.renderType === RenderLineNumbersType.Relative || /* likely to flicker */
			lineNumberOptions.renderType === RenderLineNumbersType.Off) {
			return () => gutterWidth;
		}

		const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const rightOfLineNumber = layout.lineNumbersLeft + layout.lineNumbersWidth;
		const totalLines = textModel.getLineCount();
		const totalLinesDigits = (totalLines + 1 /* 0 based to 1 based*/).toString().length;

		const offsetDigits: {
			firstLineNumberWithDigitCount: number;
			topOfLineNumber: number;
			usableWidthLeftOfLineNumber: number;
		}[] = [];

		// We only need to pre compute the usable width left of the line number for the first line number with a given digit count
		for (let digits = 1; digits <= totalLinesDigits; digits++) {
			const firstLineNumberWithDigitCount = 10 ** (digits - 1);
			const topOfLineNumber = editor.getTopForLineNumber(firstLineNumberWithDigitCount);
			const digitsWidth = digits * w;
			const usableWidthLeftOfLineNumber = Math.min(gutterWidth, Math.max(0, rightOfLineNumber - digitsWidth - layout.glyphMarginLeft));
			offsetDigits.push({ firstLineNumberWithDigitCount, topOfLineNumber, usableWidthLeftOfLineNumber });
		}

		return (topOffset: number) => {
			for (let i = offsetDigits.length - 1; i >= 0; i--) {
				if (topOffset >= offsetDigits[i].topOfLineNumber) {
					return offsetDigits[i].usableWidthLeftOfLineNumber;
				}
			}
			throw new BugIndicatingError('Could not find avilable width for icon');
		};
	});

	private readonly _layout = derived(this, reader => {
		const s = this._state.read(reader);
		if (!s) { return undefined; }

		const layout = this._editorObs.layoutInfo.read(reader);

		const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
		const gutterViewPortPadding = 1;

		// Entire gutter view from top left to bottom right
		const gutterWidthWithoutPadding = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft - 2 * gutterViewPortPadding;
		const gutterHeightWithoutPadding = layout.height - 2 * gutterViewPortPadding;
		const gutterViewPortWithStickyScroll = Rect.fromLeftTopWidthHeight(gutterViewPortPadding, gutterViewPortPadding, gutterWidthWithoutPadding, gutterHeightWithoutPadding);
		const gutterViewPortWithoutStickyScroll = gutterViewPortWithStickyScroll.withTop(this._stickyScrollHeight.read(reader) + gutterViewPortPadding);

		// The glyph margin area across all relevant lines
		const verticalEditRange = s.lineOffsetRange.read(reader);
		const gutterEditArea = Rect.fromRanges(OffsetRange.fromTo(gutterViewPortWithoutStickyScroll.left, gutterViewPortWithoutStickyScroll.right), verticalEditRange);

		// The gutter view container (pill)
		const pillHeight = lineHeight;
		const pillOffset = this._verticalOffset.read(reader);
		const pillFullyDockedRect = gutterEditArea.withHeight(pillHeight).translateY(pillOffset);
		const pillIsFullyDocked = gutterViewPortWithoutStickyScroll.containsRect(pillFullyDockedRect);

		// The icon which will be rendered in the pill
		const iconNoneDocked = this._tabAction.map(action => action === InlineEditTabAction.Accept ? Codicon.keyboardTab : Codicon.arrowRight);
		const iconDocked = derived(reader => {
			if (this._isHoveredOverIconDebounced.read(reader) || this._isHoveredOverInlineEditDebounced.read(reader)) {
				return Codicon.check;
			}
			if (this._tabAction.read(reader) === InlineEditTabAction.Accept) {
				return Codicon.keyboardTab;
			}
			const cursorLineNumber = this._editorObs.cursorLineNumber.read(reader) ?? 0;
			const editStartLineNumber = s.range.read(reader).startLineNumber;
			return cursorLineNumber <= editStartLineNumber ? Codicon.keyboardTabAbove : Codicon.keyboardTabBelow;
		});

		const idealIconWidth = 22;
		const minimalIconWidth = 16; // codicon size
		const iconWidth = (pillRect: Rect) => {
			const availableWidth = this._availableWidthForIcon.get()(pillRect.bottom + this._editorObs.editor.getScrollTop()) - gutterViewPortPadding;
			return Math.max(Math.min(availableWidth, idealIconWidth), minimalIconWidth);
		};

		if (pillIsFullyDocked) {
			const pillRect = pillFullyDockedRect;
			const lineNumberWidth = Math.max(layout.lineNumbersLeft + layout.lineNumbersWidth - gutterViewPortWithStickyScroll.left, 0);
			const lineNumberRect = pillRect.withWidth(lineNumberWidth);
			const iconWidth = Math.max(Math.min(layout.decorationsWidth, idealIconWidth), minimalIconWidth);
			const iconRect = pillRect.withWidth(iconWidth).translateX(lineNumberWidth);

			return {
				gutterEditArea,
				icon: iconDocked,
				iconDirection: 'right' as const,
				iconRect,
				pillRect,
				lineNumberRect,
			};
		}

		const pillPartiallyDockedPossibleArea = gutterViewPortWithStickyScroll.intersect(gutterEditArea); // The area in which the pill could be partially docked
		const pillIsPartiallyDocked = pillPartiallyDockedPossibleArea && pillPartiallyDockedPossibleArea.height >= pillHeight;

		if (pillIsPartiallyDocked) {
			// pillFullyDockedRect is outside viewport, move it into the viewport under sticky scroll as we prefer the pill to not be on top of the sticky scroll
			// then move it into the possible area which will only cause it to move if it has to be rendered on top of the sticky scroll
			const pillRectMoved = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithoutStickyScroll).moveToBeContainedIn(pillPartiallyDockedPossibleArea);
			const pillRect = pillRectMoved.withWidth(iconWidth(pillRectMoved));
			const iconRect = pillRect;

			return {
				gutterEditArea,
				icon: iconDocked,
				iconDirection: 'right' as const,
				iconRect,
				pillRect,
			};
		}

		// pillFullyDockedRect is outside viewport, so move it into viewport
		const pillRectMoved = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithStickyScroll);
		const pillRect = pillRectMoved.withWidth(iconWidth(pillRectMoved));
		const iconRect = pillRect;

		// docked = pill was already in the viewport
		const iconDirection = pillRect.top < pillFullyDockedRect.top ?
			'top' as const :
			'bottom' as const;

		return {
			gutterEditArea,
			icon: iconNoneDocked,
			iconDirection,
			iconRect,
			pillRect,
		};
	});


	private readonly _iconRef = n.ref<HTMLDivElement>();

	public readonly isVisible = this._layout.map(l => !!l);

	private readonly _hoverVisible = observableValue(this, false);
	public readonly isHoverVisible: IObservable<boolean> = this._hoverVisible;

	private readonly _isHoveredOverIcon = observableValue(this, false);
	private readonly _isHoveredOverIconDebounced: IObservable<boolean> = debouncedObservable(this._isHoveredOverIcon, 100);
	public readonly isHoveredOverIcon: IObservable<boolean> = this._isHoveredOverIconDebounced;

	private _showHover(): void {
		if (this._hoverVisible.get()) {
			return;
		}

		const disposableStore = new DisposableStore();
		const content = disposableStore.add(this._instantiationService.createInstance(
			GutterIndicatorMenuContent,
			this.model,
			(focusEditor) => {
				if (focusEditor) {
					this._editorObs.editor.focus();
				}
				h?.dispose();
			},
			this._editorObs,
		).toDisposableLiveElement());

		const focusTracker = disposableStore.add(trackFocus(content.element));
		disposableStore.add(focusTracker.onDidBlur(() => this._focusIsInMenu.set(false, undefined)));
		disposableStore.add(focusTracker.onDidFocus(() => this._focusIsInMenu.set(true, undefined)));
		disposableStore.add(toDisposable(() => this._focusIsInMenu.set(false, undefined)));

		const h = this._hoverService.showInstantHover({
			target: this._iconRef.element,
			content: content.element,
		}) as HoverWidget | undefined;
		if (h) {
			this._hoverVisible.set(true, undefined);
			disposableStore.add(this._editorObs.editor.onDidScrollChange(() => h.dispose()));
			disposableStore.add(h.onDispose(() => {
				this._hoverVisible.set(false, undefined);
				disposableStore.dispose();
			}));
		} else {
			disposableStore.dispose();
		}
	}

	private readonly _tabAction = derived(this, reader => {
		const model = this._model.read(reader);
		if (!model) { return InlineEditTabAction.Inactive; }
		return model.tabAction.read(reader);
	});

	private readonly _indicator = n.div({
		class: 'inline-edits-view-gutter-indicator',
		onclick: () => {
			const layout = this._layout.get();
			const acceptOnClick = layout?.icon.get() === Codicon.check;

			this._editorObs.editor.focus();
			if (acceptOnClick) {
				this.model.accept();
			} else {
				this.model.jump();
			}
		},
		tabIndex: 0,
		style: {
			position: 'absolute',
			overflow: 'visible',
		},
	}, mapOutFalsy(this._layout).map(layout => !layout ? [] : [
		n.div({
			style: {
				position: 'absolute',
				background: asCssVariable(inlineEditIndicatorBackground),
				borderRadius: '4px',
				...rectToProps(reader => layout.read(reader).gutterEditArea),
			}
		}),
		n.div({
			class: 'icon',
			ref: this._iconRef,
			onmouseenter: () => {
				// TODO show hover when hovering ghost text etc.
				this._showHover();
			},
			style: {
				cursor: 'pointer',
				zIndex: '20',
				position: 'absolute',
				backgroundColor: this._gutterIndicatorStyles.map(v => v.background),
				['--vscodeIconForeground' as any]: this._gutterIndicatorStyles.map(v => v.foreground),
				border: this._gutterIndicatorStyles.map(v => `1px solid ${v.border}`),
				boxSizing: 'border-box',
				borderRadius: '4px',
				display: 'flex',
				justifyContent: 'flex-end',
				transition: 'background-color 0.2s ease-in-out, width 0.2s ease-in-out',
				...rectToProps(reader => layout.read(reader).pillRect),
			}
		}, [
			n.div({
				className: 'line-number',
				style: {
					lineHeight: layout.map(l => l.lineNumberRect ? l.lineNumberRect.height : 0),
					display: layout.map(l => l.lineNumberRect ? 'flex' : 'none'),
					alignItems: 'center',
					justifyContent: 'flex-end',
					width: layout.map(l => l.lineNumberRect ? l.lineNumberRect.width : 0),
					height: '100%',
					color: this._gutterIndicatorStyles.map(v => v.foreground),
				}
			},
				this._lineNumberToRender
			),
			n.div({
				style: {
					rotate: layout.map(l => `${getRotationFromDirection(l.iconDirection)}deg`),
					transition: 'rotate 0.2s ease-in-out',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					marginRight: layout.map(l => l.pillRect.width - l.iconRect.width - (l.lineNumberRect?.width ?? 0)),
					width: layout.map(l => l.iconRect.width),
				}
			}, [
				layout.map((l, reader) => renderIcon(l.icon.read(reader))),
			])
		]),
	])).keepUpdated(this._store);
}

function getRotationFromDirection(direction: 'top' | 'bottom' | 'right'): number {
	switch (direction) {
		case 'top': return 90;
		case 'bottom': return -90;
		case 'right': return 0;
	}
}
