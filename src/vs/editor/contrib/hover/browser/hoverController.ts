/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, IPartialEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IScrollEvent } from 'vs/editor/common/editorCommon';
import { HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IHoverWidget } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsHintsWidget';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResultKind } from 'vs/platform/keybinding/common/keybindingResolver';
import { HoverVerbosityAction } from 'vs/editor/common/languages';
import { RunOnceScheduler } from 'vs/base/common/async';
import { ContentHoverWidget } from 'vs/editor/contrib/hover/browser/contentHoverWidget';
import { ContentHoverController } from 'vs/editor/contrib/hover/browser/contentHoverController';
import 'vs/css!./hover';
import { MarginHoverWidget } from 'vs/editor/contrib/hover/browser/marginHoverWidget';

// sticky hover widget which doesn't disappear on focus out and such
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

interface IHoverSettings {
	readonly enabled: boolean;
	readonly sticky: boolean;
	readonly hidingDelay: number;
}

interface IHoverState {
	mouseDown: boolean;
	activatedByDecoratorClick: boolean;
}

const enum HoverWidgetType {
	Content,
	Glyph,
}

export class HoverController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.hover';

	private readonly _listenersStore = new DisposableStore();

	private _glyphWidget: MarginHoverWidget | undefined;
	private _contentWidget: ContentHoverController | undefined;

	private _mouseMoveEvent: IEditorMouseEvent | undefined;
	private _reactToEditorMouseMoveRunner: RunOnceScheduler;

	private _hoverSettings!: IHoverSettings;
	private _hoverState: IHoverState = {
		mouseDown: false,
		activatedByDecoratorClick: false
	};

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this._reactToEditorMouseMoveRunner = this._register(
			new RunOnceScheduler(
				() => this._reactToEditorMouseMove(this._mouseMoveEvent), 0
			)
		);
		this._hookListeners();
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.hover)) {
				this._unhookListeners();
				this._hookListeners();
			}
		}));
	}

	static get(editor: ICodeEditor): HoverController | null {
		return editor.getContribution<HoverController>(HoverController.ID);
	}

	private _hookListeners(): void {

		const hoverOpts = this._editor.getOption(EditorOption.hover);
		this._hoverSettings = {
			enabled: hoverOpts.enabled,
			sticky: hoverOpts.sticky,
			hidingDelay: hoverOpts.delay
		};

		if (hoverOpts.enabled) {
			this._listenersStore.add(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
			this._listenersStore.add(this._editor.onMouseUp(() => this._onEditorMouseUp()));
			this._listenersStore.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._listenersStore.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
		} else {
			this._listenersStore.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._listenersStore.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
		}

		this._listenersStore.add(this._editor.onMouseLeave((e) => this._onEditorMouseLeave(e)));
		this._listenersStore.add(this._editor.onDidChangeModel(() => {
			this._cancelScheduler();
			this._hideWidgets();
		}));
		this._listenersStore.add(this._editor.onDidChangeModelContent(() => this._cancelScheduler()));
		this._listenersStore.add(this._editor.onDidScrollChange((e: IScrollEvent) => this._onEditorScrollChanged(e)));
	}

	private _unhookListeners(): void {
		this._listenersStore.clear();
	}

	private _cancelScheduler() {
		this._mouseMoveEvent = undefined;
		this._reactToEditorMouseMoveRunner.cancel();
	}

	private _onEditorScrollChanged(e: IScrollEvent): void {
		if (e.scrollTopChanged || e.scrollLeftChanged) {
			this._hideWidgets();
		}
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {

		this._hoverState.mouseDown = true;

		const shouldNotHideCurrentHoverWidget = this._shouldNotHideCurrentHoverWidget(mouseEvent);
		if (shouldNotHideCurrentHoverWidget) {
			return;
		}

		this._hideWidgets();
	}

	private _shouldNotHideCurrentHoverWidget(mouseEvent: IPartialEditorMouseEvent): boolean {
		if (
			this._isMouseOnContentHoverWidget(mouseEvent)
			|| this._isMouseOnMarginHoverWidget(mouseEvent)
			|| this._isContentWidgetResizing()
		) {
			return true;
		}
		return false;
	}

	private _isMouseOnMarginHoverWidget(mouseEvent: IPartialEditorMouseEvent): boolean {
		const target = mouseEvent.target;
		if (!target) {
			return false;
		}
		return target.type === MouseTargetType.OVERLAY_WIDGET && target.detail === MarginHoverWidget.ID;
	}

	private _isMouseOnContentHoverWidget(mouseEvent: IPartialEditorMouseEvent): boolean {
		const target = mouseEvent.target;
		if (!target) {
			return false;
		}
		return target.type === MouseTargetType.CONTENT_WIDGET && target.detail === ContentHoverWidget.ID;
	}

	private _onEditorMouseUp(): void {
		this._hoverState.mouseDown = false;
	}

	private _onEditorMouseLeave(mouseEvent: IPartialEditorMouseEvent): void {

		this._cancelScheduler();

		const shouldNotHideCurrentHoverWidget = this._shouldNotHideCurrentHoverWidget(mouseEvent);
		if (shouldNotHideCurrentHoverWidget) {
			return;
		}
		if (_sticky) {
			return;
		}
		this._hideWidgets();
	}

	private _shouldNotRecomputeCurrentHoverWidget(mouseEvent: IEditorMouseEvent): boolean {

		const isHoverSticky = this._hoverSettings.sticky;

		const isMouseOnStickyMarginHoverWidget = (mouseEvent: IEditorMouseEvent, isHoverSticky: boolean) => {
			const isMouseOnMarginHoverWidget = this._isMouseOnMarginHoverWidget(mouseEvent);
			return isHoverSticky && isMouseOnMarginHoverWidget;
		};
		const isMouseOnStickyContentHoverWidget = (mouseEvent: IEditorMouseEvent, isHoverSticky: boolean) => {
			const isMouseOnContentHoverWidget = this._isMouseOnContentHoverWidget(mouseEvent);
			return isHoverSticky && isMouseOnContentHoverWidget;
		};
		const isMouseOnColorPicker = (mouseEvent: IEditorMouseEvent) => {
			const isMouseOnContentHoverWidget = this._isMouseOnContentHoverWidget(mouseEvent);
			const isColorPickerVisible = this._contentWidget?.isColorPickerVisible;
			return isMouseOnContentHoverWidget && isColorPickerVisible;
		};
		// TODO@aiday-mar verify if the following is necessary code
		const isTextSelectedWithinContentHoverWidget = (mouseEvent: IEditorMouseEvent, sticky: boolean) => {
			return sticky
				&& this._contentWidget?.containsNode(mouseEvent.event.browserEvent.view?.document.activeElement)
				&& !mouseEvent.event.browserEvent.view?.getSelection()?.isCollapsed;
		};

		if (
			isMouseOnStickyMarginHoverWidget(mouseEvent, isHoverSticky)
			|| isMouseOnStickyContentHoverWidget(mouseEvent, isHoverSticky)
			|| isMouseOnColorPicker(mouseEvent)
			|| isTextSelectedWithinContentHoverWidget(mouseEvent, isHoverSticky)
		) {
			return true;
		}
		return false;
	}

	private _onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {

		this._mouseMoveEvent = mouseEvent;
		if (this._contentWidget?.isFocused || this._contentWidget?.isResizing) {
			return;
		}
		const sticky = this._hoverSettings.sticky;
		if (sticky && this._contentWidget?.isVisibleFromKeyboard) {
			// Sticky mode is on and the hover has been shown via keyboard
			// so moving the mouse has no effect
			return;
		}

		const shouldNotRecomputeCurrentHoverWidget = this._shouldNotRecomputeCurrentHoverWidget(mouseEvent);
		if (shouldNotRecomputeCurrentHoverWidget) {
			this._reactToEditorMouseMoveRunner.cancel();
			return;
		}

		const hidingDelay = this._hoverSettings.hidingDelay;
		const isContentHoverWidgetVisible = this._contentWidget?.isVisible;
		// If the mouse is not over the widget, and if sticky is on,
		// then give it a grace period before reacting to the mouse event
		const shouldRescheduleHoverComputation = isContentHoverWidgetVisible && sticky && hidingDelay > 0;

		if (shouldRescheduleHoverComputation) {
			if (!this._reactToEditorMouseMoveRunner.isScheduled()) {
				this._reactToEditorMouseMoveRunner.schedule(hidingDelay);
			}
			return;
		}
		this._reactToEditorMouseMove(mouseEvent);
	}

	private _reactToEditorMouseMove(mouseEvent: IEditorMouseEvent | undefined): void {

		if (!mouseEvent) {
			return;
		}

		const target = mouseEvent.target;
		const mouseOnDecorator = target.element?.classList.contains('colorpicker-color-decoration');
		const decoratorActivatedOn = this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);

		const enabled = this._hoverSettings.enabled;
		const activatedByDecoratorClick = this._hoverState.activatedByDecoratorClick;
		if (
			(
				mouseOnDecorator && (
					(decoratorActivatedOn === 'click' && !activatedByDecoratorClick) ||
					(decoratorActivatedOn === 'hover' && !enabled && !_sticky) ||
					(decoratorActivatedOn === 'clickAndHover' && !enabled && !activatedByDecoratorClick))
			) || (
				!mouseOnDecorator && !enabled && !activatedByDecoratorClick
			)
		) {
			this._hideWidgets();
			return;
		}

		const contentHoverShowsOrWillShow = this._tryShowHoverWidget(mouseEvent, HoverWidgetType.Content);
		if (contentHoverShowsOrWillShow) {
			return;
		}

		const glyphWidgetShowsOrWillShow = this._tryShowHoverWidget(mouseEvent, HoverWidgetType.Glyph);
		if (glyphWidgetShowsOrWillShow) {
			return;
		}
		if (_sticky) {
			return;
		}
		this._hideWidgets();
	}

	private _tryShowHoverWidget(mouseEvent: IEditorMouseEvent, hoverWidgetType: HoverWidgetType): boolean {
		const contentWidget: IHoverWidget = this._getOrCreateContentWidget();
		const glyphWidget: IHoverWidget = this._getOrCreateGlyphWidget();
		let currentWidget: IHoverWidget;
		let otherWidget: IHoverWidget;
		switch (hoverWidgetType) {
			case HoverWidgetType.Content:
				currentWidget = contentWidget;
				otherWidget = glyphWidget;
				break;
			case HoverWidgetType.Glyph:
				currentWidget = glyphWidget;
				otherWidget = contentWidget;
				break;
			default:
				throw new Error(`HoverWidgetType ${hoverWidgetType} is unrecognized`);
		}

		const showsOrWillShow = currentWidget.showsOrWillShow(mouseEvent);
		if (showsOrWillShow) {
			otherWidget.hide();
		}
		return showsOrWillShow;
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const resolvedKeyboardEvent = this._keybindingService.softDispatch(e, this._editor.getDomNode());

		// If the beginning of a multi-chord keybinding is pressed,
		// or the command aims to focus the hover,
		// set the variable to true, otherwise false
		const shouldKeepHoverVisible = (
			resolvedKeyboardEvent.kind === ResultKind.MoreChordsNeeded ||
			(resolvedKeyboardEvent.kind === ResultKind.KbFound
				&& (resolvedKeyboardEvent.commandId === SHOW_OR_FOCUS_HOVER_ACTION_ID
					|| resolvedKeyboardEvent.commandId === INCREASE_HOVER_VERBOSITY_ACTION_ID
					|| resolvedKeyboardEvent.commandId === DECREASE_HOVER_VERBOSITY_ACTION_ID)
				&& this._contentWidget?.isVisible
			)
		);

		if (
			e.keyCode === KeyCode.Ctrl
			|| e.keyCode === KeyCode.Alt
			|| e.keyCode === KeyCode.Meta
			|| e.keyCode === KeyCode.Shift
			|| shouldKeepHoverVisible
		) {
			// Do not hide hover when a modifier key is pressed
			return;
		}

		this._hideWidgets();
	}

	private _hideWidgets(): void {
		if (_sticky) {
			return;
		}
		if ((
			this._hoverState.mouseDown
			&& this._contentWidget?.isColorPickerVisible
		) || InlineSuggestionHintsContentWidget.dropDownVisible) {
			return;
		}
		this._hoverState.activatedByDecoratorClick = false;
		this._glyphWidget?.hide();
		this._contentWidget?.hide();
	}

	private _getOrCreateContentWidget(): ContentHoverController {
		if (!this._contentWidget) {
			this._contentWidget = this._instantiationService.createInstance(ContentHoverController, this._editor);
		}
		return this._contentWidget;
	}

	private _getOrCreateGlyphWidget(): MarginHoverWidget {
		if (!this._glyphWidget) {
			this._glyphWidget = this._instantiationService.createInstance(MarginHoverWidget, this._editor);
		}
		return this._glyphWidget;
	}

	public hideContentHover(): void {
		this._hideWidgets();
	}

	public showContentHover(
		range: Range,
		mode: HoverStartMode,
		source: HoverStartSource,
		focus: boolean,
		activatedByColorDecoratorClick: boolean = false
	): void {
		this._hoverState.activatedByDecoratorClick = activatedByColorDecoratorClick;
		this._getOrCreateContentWidget().startShowingAtRange(range, mode, source, focus);
	}

	private _isContentWidgetResizing(): boolean {
		return this._contentWidget?.widget.isResizing || false;
	}

	public updateFocusedMarkdownHoverVerbosityLevel(action: HoverVerbosityAction): void {
		this._getOrCreateContentWidget().updateFocusedMarkdownHoverVerbosityLevel(action);
	}

	public focus(): void {
		this._contentWidget?.focus();
	}

	public scrollUp(): void {
		this._contentWidget?.scrollUp();
	}

	public scrollDown(): void {
		this._contentWidget?.scrollDown();
	}

	public scrollLeft(): void {
		this._contentWidget?.scrollLeft();
	}

	public scrollRight(): void {
		this._contentWidget?.scrollRight();
	}

	public pageUp(): void {
		this._contentWidget?.pageUp();
	}

	public pageDown(): void {
		this._contentWidget?.pageDown();
	}

	public goToTop(): void {
		this._contentWidget?.goToTop();
	}

	public goToBottom(): void {
		this._contentWidget?.goToBottom();
	}

	public getWidgetContent(): string | undefined {
		return this._contentWidget?.getWidgetContent();
	}

	public get isColorPickerVisible(): boolean | undefined {
		return this._contentWidget?.isColorPickerVisible;
	}

	public get isHoverVisible(): boolean | undefined {
		return this._contentWidget?.isVisible;
	}

	public override dispose(): void {
		super.dispose();
		this._unhookListeners();
		this._listenersStore.dispose();
		this._glyphWidget?.dispose();
		this._contentWidget?.dispose();
	}
}
