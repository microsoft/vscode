/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n, trackFocus } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, autorunWithStore, constObservable, derived, observableFromEvent, observableValue, runOnChange } from '../../../../../../../base/common/observable.js';
import { debouncedObservable } from '../../../../../../../base/common/observableInternal/utils.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
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
import { InlineEditHost } from '../inlineEditsModel.js';
import { IInlineEditModel, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryBorder, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorsuccessfulBackground, inlineEditIndicatorsuccessfulBorder, inlineEditIndicatorsuccessfulForeground } from '../theme.js';
import { mapOutFalsy, rectToProps } from '../utils/utils.js';
import { GutterIndicatorMenuContent } from './gutterIndicatorMenu.js';

// Represents the user's familiarity with the inline edits feature.
enum UserKind {
	FirstTime = 'firstTime',
	SecondTime = 'secondTime',
	Active = 'active'
}

export class InlineEditsGutterIndicator extends Disposable {

	private get model() {
		const model = this._model.get();
		if (!model) { throw new BugIndicatingError('Inline Edit Model not available'); }
		return model;
	}

	private readonly _activeCompletionId = derived<string | undefined>(reader => {
		const layout = this._layout.read(reader);
		if (!layout) { return undefined; }
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		return model.inlineEdit.inlineCompletion.id;
	});

	private readonly _gutterIndicatorStyles: IObservable<{ background: string; foreground: string; border: string }>;
	private readonly _isHoveredOverInlineEditDebounced: IObservable<boolean>;

	private readonly _newUserAnimationDisposable = this._register(new MutableDisposable());
	private readonly _firstToSecondTimeUserDisposable = this._register(new MutableDisposable());
	private readonly _secondTimeToActiveUserDisposable = this._register(new MutableDisposable());

	private get _newUserType(): UserKind {
		return this._storageService.get('inlineEditsGutterIndicatorUserKind', StorageScope.APPLICATION, UserKind.FirstTime) as UserKind;
	}
	private set _newUserType(value: UserKind) {
		switch (value) {
			case UserKind.FirstTime:
				throw new BugIndicatingError('UserKind should not be set to first time');
			case UserKind.SecondTime:
				this._firstToSecondTimeUserDisposable.clear();
				break;
			case UserKind.Active:
				this._newUserAnimationDisposable.clear();
				this._firstToSecondTimeUserDisposable.clear();
				this._secondTimeToActiveUserDisposable.clear();
				break;
		}

		this._storageService.store('inlineEditsGutterIndicatorUserKind', value, StorageScope.APPLICATION, StorageTarget.USER);
	}

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _originalRange: IObservable<LineRange | undefined>,
		private readonly _verticalOffset: IObservable<number>,
		private readonly _host: IObservable<InlineEditHost | undefined>,
		private readonly _model: IObservable<IInlineEditModel | undefined>,
		private readonly _isHoveringOverInlineEdit: IObservable<boolean>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IHoverService private readonly _hoverService: HoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
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
				this._triggerAnimation();
			}
		}));

		if (this._newUserType === UserKind.Active) {
			this._register(this.setupNewUserExperience());
		}

		this._register(autorun(reader => {
			this._indicator.readEffect(reader);
			if (this._indicator.element) {
				this._editorObs.editor.applyFontInfo(this._indicator.element);
			}
		}));

		this._register(autorunWithStore((reader, store) => {
			const host = this._host.read(reader);
			if (!host) { return; }
			store.add(host.onDidAccept(() => {
				this._storageService.store('inlineEditsGutterIndicatorUserKind', UserKind.Active, StorageScope.APPLICATION, StorageTarget.USER);
			}));
		}));
	}

	private setupNewUserExperience(): IDisposable {
		if (this._newUserType === UserKind.Active) {
			return Disposable.None;
		}

		const disposableStore = new DisposableStore();

		let userHasHoveredOverIcon = false;
		let inlineEditHasBeenAccepted = false;
		let firstTimeUserAnimationCount = 0;
		let secondTimeUserAnimationCount = 0;

		// pulse animation for new users
		disposableStore.add(runOnChange(this._activeCompletionId, async (id) => {
			if (id === undefined) { return; }
			const userType = this._newUserType;

			// Animation
			switch (userType) {
				case UserKind.FirstTime: {
					for (let i = 0; i < 3 && this._activeCompletionId.get() === id; i++) {
						await this._triggerAnimation();
						await timeout(500);
					}
					break;
				}
				case UserKind.SecondTime: {
					this._triggerAnimation();
					break;
				}
			}

			// User Kind Transition
			switch (userType) {
				case UserKind.FirstTime: {
					if (++firstTimeUserAnimationCount >= 5 || userHasHoveredOverIcon) {
						this._newUserType = UserKind.SecondTime;
					}
					break;
				}
				case UserKind.SecondTime: {
					if (++secondTimeUserAnimationCount >= 5 && inlineEditHasBeenAccepted) {
						this._newUserType = UserKind.Active;
					}
					break;
				}
			}
		}));

		// Remember when the user has hovered over the icon
		disposableStore.add(runOnChange(this._isHoveredOverIconDebounced, async (isHovered) => {
			if (isHovered) {
				userHasHoveredOverIcon = true;
			}
		}));

		// Remember when the user has accepted an inline edit
		disposableStore.add(autorunWithStore((reader, store) => {
			const host = this._host.read(reader);
			if (!host) { return; }
			store.add(host.onDidAccept(() => {
				inlineEditHasBeenAccepted = true;
			}));
		}));

		return disposableStore;
	}

	private _triggerAnimation(): Promise<Animation> {
		if (this._accessibilityService.isMotionReduced()) {
			return new Animation(null, null).finished;
		}
		// WIGGLE ANIMATION:
		/* this._iconRef.element.animate([
			{ transform: 'rotate(0) scale(1)', offset: 0 },
			{ transform: 'rotate(14.4deg) scale(1.1)', offset: 0.15 },
			{ transform: 'rotate(-14.4deg) scale(1.2)', offset: 0.3 },
			{ transform: 'rotate(14.4deg) scale(1.1)', offset: 0.45 },
			{ transform: 'rotate(-14.4deg) scale(1.2)', offset: 0.6 },
			{ transform: 'rotate(0) scale(1)', offset: 1 }
		], { duration: 800 }); */

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

	private readonly _layout = derived(this, reader => {
		const s = this._state.read(reader);
		if (!s) { return undefined; }

		const layout = this._editorObs.layoutInfo.read(reader);

		const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
		const bottomPadding = 1;
		const leftPadding = 1;
		const rightPadding = 1;

		// Entire editor area without sticky scroll
		const fullViewPort = Rect.fromLeftTopRightBottom(0, 0, layout.width, layout.height - bottomPadding);
		const viewPortWithStickyScroll = fullViewPort.withTop(this._stickyScrollHeight.read(reader));

		// The glyph margin area across all relevant lines
		const targetVertRange = s.lineOffsetRange.read(reader);
		const targetRect = Rect.fromRanges(OffsetRange.fromTo(leftPadding + layout.glyphMarginLeft, layout.decorationsLeft + layout.decorationsWidth - rightPadding), targetVertRange);

		// The gutter view container (pill)
		const pillOffset = this._verticalOffset.read(reader);
		let pillRect = targetRect.withHeight(lineHeight).withWidth(22).translateY(pillOffset);
		const pillRectMoved = pillRect.moveToBeContainedIn(viewPortWithStickyScroll);

		const rect = targetRect;

		// Move pill to be in viewport if it is not
		pillRect = (targetRect.containsRect(pillRectMoved))
			? pillRectMoved
			: pillRectMoved.moveToBeContainedIn(fullViewPort.intersect(targetRect.union(fullViewPort.withHeight(lineHeight)))!); //viewPortWithStickyScroll.intersect(rect)!;

		// docked = pill was already in the viewport
		const docked = rect.containsRect(pillRect) && viewPortWithStickyScroll.containsRect(pillRect);
		let iconDirecion = targetRect.containsRect(pillRect) ?
			'right' as const
			: pillRect.top > targetRect.top ?
				'top' as const :
				'bottom' as const;

		// Grow icon the the whole glyph margin area if it is docked
		let lineNumberRect = pillRect.withWidth(0);
		let iconRect = pillRect;
		if (docked && pillRect.top === targetRect.top + pillOffset) {
			pillRect = pillRect.withWidth(layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft - leftPadding - rightPadding);
			lineNumberRect = pillRect.intersectHorizontal(new OffsetRange(0, Math.max(layout.lineNumbersLeft + layout.lineNumbersWidth - leftPadding - 1, 0)));
			iconRect = iconRect.translateX(lineNumberRect.width);
		}

		let icon;
		if (docked && (this._isHoveredOverIconDebounced.read(reader) || this._isHoveredOverInlineEditDebounced.read(reader))) {
			icon = renderIcon(Codicon.check);
			iconDirecion = 'right';
		} else {
			icon = this._tabAction.read(reader) === InlineEditTabAction.Accept ? renderIcon(Codicon.keyboardTab) : renderIcon(Codicon.arrowRight);
		}

		let rotation = 0;
		switch (iconDirecion) {
			case 'right': rotation = 0; break;
			case 'bottom': rotation = 90; break;
			case 'top': rotation = -90; break;
		}

		return {
			rect,
			icon,
			rotation,
			docked,
			iconRect,
			pillRect,
			lineHeight,
			lineNumberRect,
		};
	});

	private readonly _iconRef = n.ref<HTMLDivElement>();
	private readonly _hoverVisible = observableValue(this, false);
	public readonly isHoverVisible: IObservable<boolean> = this._hoverVisible;
	private readonly _isHoveredOverIcon = observableValue(this, false);
	private readonly _isHoveredOverIconDebounced: IObservable<boolean> = debouncedObservable(this._isHoveredOverIcon, 100);

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
			const docked = this._layout.map(l => l && l.docked).get();
			this._editorObs.editor.focus();
			if (docked) {
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
				...rectToProps(reader => layout.read(reader).rect),
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
				zIndex: '1000',
				position: 'absolute',
				backgroundColor: this._gutterIndicatorStyles.map(v => v.background),
				['--vscodeIconForeground' as any]: this._gutterIndicatorStyles.map(v => v.foreground),
				border: this._gutterIndicatorStyles.map(v => `1px solid ${v.border}`),
				boxSizing: 'border-box',
				borderRadius: '4px',
				display: 'flex',
				justifyContent: 'center',
				transition: 'background-color 0.2s ease-in-out, width 0.2s ease-in-out',
				...rectToProps(reader => layout.read(reader).pillRect),
			}
		}, [
			n.div({
				className: 'line-number',
				style: {
					lineHeight: layout.map(l => `${l.lineHeight}px`),
					display: layout.map(l => l.lineNumberRect.width > 0 ? 'flex' : 'none'),
					alignItems: 'center',
					justifyContent: 'flex-end',
					width: layout.map(l => l.lineNumberRect.width),
					height: '100%',
					color: this._gutterIndicatorStyles.map(v => v.foreground),
				}
			},
				this._lineNumberToRender
			),
			n.div({
				style: {
					rotate: layout.map(i => `${i.rotation}deg`),
					transition: 'rotate 0.2s ease-in-out',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					width: layout.map(l => `${l.iconRect.width}px`),
				}
			}, [
				layout.map(i => i.icon),
			])
		]),
	])).keepUpdated(this._store);
}
