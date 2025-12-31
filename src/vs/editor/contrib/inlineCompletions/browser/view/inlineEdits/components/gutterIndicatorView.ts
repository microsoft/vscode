/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModifierKeyEmitter, n, trackFocus } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, constObservable, debouncedObservable, derived, observableFromEvent, observableValue, runOnChange } from '../../../../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { IEditorMouseEvent } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { HoverService } from '../../../../../../../platform/hover/browser/hoverService.js';
import { HoverWidget } from '../../../../../../../platform/hover/browser/hoverWidget.js';
import { EditorOption, RenderLineNumbersType } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { StickyScrollController } from '../../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryBorder, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorSuccessfulBackground, inlineEditIndicatorSuccessfulBorder, inlineEditIndicatorSuccessfulForeground } from '../theme.js';
import { mapOutFalsy, rectToProps } from '../utils/utils.js';
import { GutterIndicatorMenuContent } from './gutterIndicatorMenu.js';
import { assertNever } from '../../../../../../../base/common/assert.js';
import { Command, InlineCompletionCommand, IInlineCompletionModelInfo } from '../../../../../../common/languages.js';
import { InlineSuggestionItem } from '../../../model/inlineSuggestionItem.js';
import { localize } from '../../../../../../../nls.js';
import { InlineCompletionsModel } from '../../../model/inlineCompletionsModel.js';
import { InlineSuggestAlternativeAction } from '../../../model/InlineSuggestAlternativeAction.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';

export class InlineEditsGutterIndicatorData {
	constructor(
		readonly gutterMenuData: InlineSuggestionGutterMenuData,
		readonly originalRange: LineRange,
		readonly model: SimpleInlineSuggestModel,
		readonly altAction: InlineSuggestAlternativeAction | undefined,
	) { }
}

export class InlineSuggestionGutterMenuData {
	public static fromInlineSuggestion(suggestion: InlineSuggestionItem): InlineSuggestionGutterMenuData {
		const alternativeAction = suggestion.action?.kind === 'edit' ? suggestion.action.alternativeAction : undefined;
		return new InlineSuggestionGutterMenuData(
			suggestion.gutterMenuLinkAction,
			suggestion.source.provider.displayName ?? localize('inlineSuggestion', "Inline Suggestion"),
			suggestion.source.inlineSuggestions.commands ?? [],
			alternativeAction,
			suggestion.source.provider.modelInfo,
			suggestion.source.provider.setModelId?.bind(suggestion.source.provider),
		);
	}

	constructor(
		readonly action: Command | undefined,
		readonly displayName: string,
		readonly extensionCommands: InlineCompletionCommand[],
		readonly alternativeAction: InlineSuggestAlternativeAction | undefined,
		readonly modelInfo: IInlineCompletionModelInfo | undefined,
		readonly setModelId: ((modelId: string) => Promise<void>) | undefined,
	) { }
}

// TODO this class does not make that much sense yet.
export class SimpleInlineSuggestModel {
	public static fromInlineCompletionModel(model: InlineCompletionsModel): SimpleInlineSuggestModel {
		return new SimpleInlineSuggestModel(
			() => model.accept(),
			() => model.jump(),
		);
	}

	constructor(
		readonly accept: () => void,
		readonly jump: () => void,
	) { }
}

const CODICON_SIZE_PX = 16;
const CODICON_PADDING_PX = 2;

export class InlineEditsGutterIndicator extends Disposable {
	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _data: IObservable<InlineEditsGutterIndicatorData | undefined>,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		private readonly _verticalOffset: IObservable<number>,
		private readonly _isHoveringOverInlineEdit: IObservable<boolean>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,

		@IHoverService private readonly _hoverService: HoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();

		this._originalRangeObs = mapOutFalsy(this._data.map(d => d?.originalRange));

		this._stickyScrollController = StickyScrollController.get(this._editorObs.editor);
		this._stickyScrollHeight = this._stickyScrollController
			? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController!.stickyScrollWidgetHeight)
			: constObservable(0);

		const indicator = this._indicator.keepUpdated(this._store);

		this._register(this._editorObs.createOverlayWidget({
			domNode: indicator.element,
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
			indicator.readEffect(reader);
			if (indicator.element) {
				// For the line number
				this._editorObs.editor.applyFontInfo(indicator.element);
			}
		}));
	}

	private readonly _isHoveredOverInlineEditDebounced: IObservable<boolean>;

	private readonly _modifierPressed = observableFromEvent(this, ModifierKeyEmitter.getInstance().event, () => ModifierKeyEmitter.getInstance().keyStatus.shiftKey);
	private readonly _gutterIndicatorStyles = derived(this, reader => {
		let v = this._tabAction.read(reader);

		// TODO: add source of truth for alt action active and key pressed
		const altAction = this._data.read(reader)?.altAction;
		const modifiedPressed = this._modifierPressed.read(reader);
		if (altAction && modifiedPressed) {
			v = InlineEditTabAction.Inactive;
		}

		switch (v) {
			case InlineEditTabAction.Inactive: return {
				background: getEditorBlendedColor(inlineEditIndicatorSecondaryBackground, this._themeService).read(reader).toString(),
				foreground: getEditorBlendedColor(inlineEditIndicatorSecondaryForeground, this._themeService).read(reader).toString(),
				border: getEditorBlendedColor(inlineEditIndicatorSecondaryBorder, this._themeService).read(reader).toString(),
			};
			case InlineEditTabAction.Jump: return {
				background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
				foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
				border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString()
			};
			case InlineEditTabAction.Accept: return {
				background: getEditorBlendedColor(inlineEditIndicatorSuccessfulBackground, this._themeService).read(reader).toString(),
				foreground: getEditorBlendedColor(inlineEditIndicatorSuccessfulForeground, this._themeService).read(reader).toString(),
				border: getEditorBlendedColor(inlineEditIndicatorSuccessfulBorder, this._themeService).read(reader).toString()
			};
			default:
				assertNever(v);
		}
	});

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

	private readonly _originalRangeObs;

	private readonly _state = derived(this, reader => {
		const range = this._originalRangeObs.read(reader);
		if (!range) { return undefined; }
		return {
			range,
			lineOffsetRange: this._editorObs.observeLineOffsetRange(range, reader.store),
		};
	});

	private readonly _stickyScrollController;
	private readonly _stickyScrollHeight;

	private readonly _lineNumberToRender = derived(this, reader => {
		if (this._verticalOffset.read(reader) !== 0) {
			return '';
		}

		const lineNumber = this._data.read(reader)?.originalRange.startLineNumber;
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

		const lineHeight = this._editorObs.observeLineHeightForLine(s.range.map(r => r.startLineNumber)).read(reader);
		const gutterViewPortPaddingLeft = 1;
		const gutterViewPortPaddingTop = 2;

		// Entire gutter view from top left to bottom right
		const gutterWidthWithoutPadding = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft - 2 * gutterViewPortPaddingLeft;
		const gutterHeightWithoutPadding = layout.height - 2 * gutterViewPortPaddingTop;
		const gutterViewPortWithStickyScroll = Rect.fromLeftTopWidthHeight(gutterViewPortPaddingLeft, gutterViewPortPaddingTop, gutterWidthWithoutPadding, gutterHeightWithoutPadding);
		const gutterViewPortWithoutStickyScrollWithoutPaddingTop = gutterViewPortWithStickyScroll.withTop(this._stickyScrollHeight.read(reader));
		const gutterViewPortWithoutStickyScroll = gutterViewPortWithStickyScroll.withTop(gutterViewPortWithoutStickyScrollWithoutPaddingTop.top + gutterViewPortPaddingTop);

		// The glyph margin area across all relevant lines
		const verticalEditRange = s.lineOffsetRange.read(reader);
		const gutterEditArea = Rect.fromRanges(OffsetRange.fromTo(gutterViewPortWithoutStickyScroll.left, gutterViewPortWithoutStickyScroll.right), verticalEditRange);

		// The gutter view container (pill)
		const pillHeight = lineHeight;
		const pillOffset = this._verticalOffset.read(reader);
		const pillFullyDockedRect = gutterEditArea.withHeight(pillHeight).translateY(pillOffset);
		const pillIsFullyDocked = gutterViewPortWithoutStickyScrollWithoutPaddingTop.containsRect(pillFullyDockedRect);

		// The icon which will be rendered in the pill
		const iconNoneDocked = this._tabAction.map(action => action === InlineEditTabAction.Accept ? Codicon.keyboardTab : Codicon.arrowRight);
		const iconDocked = derived(this, reader => {
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

		const idealIconAreaWidth = 22;
		const iconWidth = (pillRect: Rect) => {
			const availableIconAreaWidth = this._availableWidthForIcon.read(undefined)(pillRect.bottom + this._editorObs.editor.getScrollTop()) - gutterViewPortPaddingLeft;
			return Math.max(Math.min(availableIconAreaWidth, idealIconAreaWidth), CODICON_SIZE_PX);
		};

		if (pillIsFullyDocked) {
			const pillRect = pillFullyDockedRect;

			let widthUntilLineNumberEnd;
			if (layout.lineNumbersWidth === 0) {
				widthUntilLineNumberEnd = Math.min(Math.max(layout.lineNumbersLeft - gutterViewPortWithStickyScroll.left, 0), pillRect.width - idealIconAreaWidth);
			} else {
				widthUntilLineNumberEnd = Math.max(layout.lineNumbersLeft + layout.lineNumbersWidth - gutterViewPortWithStickyScroll.left, 0);
			}

			const lineNumberRect = pillRect.withWidth(widthUntilLineNumberEnd);
			const minimalIconWidthWithPadding = CODICON_SIZE_PX + CODICON_PADDING_PX;
			const iconWidth = Math.min(pillRect.width - widthUntilLineNumberEnd, idealIconAreaWidth);
			const iconRect = pillRect.withWidth(Math.max(iconWidth, minimalIconWidthWithPadding)).translateX(widthUntilLineNumberEnd);
			const iconVisible = iconWidth >= minimalIconWidthWithPadding;

			return {
				gutterEditArea,
				icon: iconDocked,
				iconDirection: 'right' as const,
				iconRect,
				iconVisible,
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
				iconVisible: true,
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
			iconVisible: true,
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

		const data = this._data.get();
		if (!data) {
			throw new BugIndicatingError('Gutter indicator data not available');
		}
		const disposableStore = new DisposableStore();
		const content = disposableStore.add(this._instantiationService.createInstance(
			GutterIndicatorMenuContent,
			this._editorObs,
			data.gutterMenuData,
			(focusEditor) => {
				if (focusEditor) {
					this._editorObs.editor.focus();
				}
				h?.dispose();
			},
		).toDisposableLiveElement());

		const focusTracker = disposableStore.add(trackFocus(content.element)); // TODO@benibenj should this be removed?
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

	private readonly _indicator = n.div({
		class: 'inline-edits-view-gutter-indicator',
		style: {
			position: 'absolute',
			overflow: 'visible',
		},
	}, mapOutFalsy(this._layout).map(layout => !layout ? [] : [
		n.div({
			style: {
				position: 'absolute',
				background: asCssVariable(inlineEditIndicatorBackground),
				borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
				...rectToProps(reader => layout.read(reader).gutterEditArea),
			}
		}),
		n.div({
			class: 'icon',
			ref: this._iconRef,

			tabIndex: 0,
			onclick: () => {
				const layout = this._layout.get();
				const acceptOnClick = layout?.icon.get() === Codicon.check;

				const data = this._data.get();
				if (!data) { throw new BugIndicatingError('Gutter indicator data not available'); }

				this._editorObs.editor.focus();
				if (acceptOnClick) {
					data.model.accept();
				} else {
					data.model.jump();
				}
			},

			onmouseenter: () => {
				// TODO show hover when hovering ghost text etc.
				this._showHover();
			},
			style: {
				cursor: 'pointer',
				zIndex: '20',
				position: 'absolute',
				backgroundColor: this._gutterIndicatorStyles.map(v => v.background),
				// eslint-disable-next-line local/code-no-any-casts
				['--vscodeIconForeground' as any]: this._gutterIndicatorStyles.map(v => v.foreground),
				border: this._gutterIndicatorStyles.map(v => `1px solid ${v.border}`),
				boxSizing: 'border-box',
				borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
				display: 'flex',
				justifyContent: layout.map(l => l.iconDirection === 'bottom' ? 'flex-start' : 'flex-end'),
				transition: this._modifierPressed.map(m => m ? '' : 'background-color 0.2s ease-in-out, width 0.2s ease-in-out'),
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
					transform: layout.map(l => `rotate(${getRotationFromDirection(l.iconDirection)}deg)`),
					transition: 'rotate 0.2s ease-in-out, opacity 0.2s ease-in-out',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					opacity: layout.map(l => l.iconVisible ? '1' : '0'),
					marginRight: layout.map(l => l.pillRect.width - l.iconRect.width - (l.lineNumberRect?.width ?? 0)),
					width: layout.map(l => l.iconRect.width),
					position: 'relative',
					right: layout.map(l => l.iconDirection === 'top' ? '1px' : '0'),
				}
			}, [
				layout.map((l, reader) => withStyles(renderIcon(l.icon.read(reader)), { fontSize: toPx(Math.min(l.iconRect.width - CODICON_PADDING_PX, CODICON_SIZE_PX)) })),
			])
		]),
	]));
}

function getRotationFromDirection(direction: 'top' | 'bottom' | 'right'): number {
	switch (direction) {
		case 'top': return 90;
		case 'bottom': return -90;
		case 'right': return 0;
	}
}

function withStyles<T extends HTMLElement>(element: T, styles: { [key: string]: string }): T {
	for (const key in styles) {
		// eslint-disable-next-line local/code-no-any-casts
		element.style[key as any] = styles[key];
	}
	return element;
}

function toPx(n: number): string {
	return `${n}px`;
}
