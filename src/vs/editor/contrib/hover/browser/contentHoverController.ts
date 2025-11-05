/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from './hoverActionIds.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent, IPartialEditorMouseEvent } from '../../../browser/editorBrowser.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution, IScrollEvent } from '../../../common/editorCommon.js';
import { HoverStartMode, HoverStartSource } from './hoverOperation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InlineSuggestionHintsContentWidget } from '../../inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { isMousePositionWithinElement } from './hoverUtils.js';
import { ContentHoverWidgetWrapper } from './contentHoverWidgetWrapper.js';
import './hover.css';
import { Emitter } from '../../../../base/common/event.js';
import { isOnColorDecorator } from '../../colorPicker/browser/hoverColorPicker/hoverColorPicker.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';

// sticky hover widget which doesn't disappear on focus out and such
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

interface IHoverSettings {
	readonly enabled: boolean;
	readonly sticky: boolean;
	readonly hidingDelay: number;
}

export class ContentHoverController extends Disposable implements IEditorContribution {

	private readonly _onHoverContentsChanged = this._register(new Emitter<void>());
	public readonly onHoverContentsChanged = this._onHoverContentsChanged.event;

	public static readonly ID = 'editor.contrib.contentHover';

	public shouldKeepOpenOnEditorMouseMoveOrLeave: boolean = false;

	private readonly _listenersStore = new DisposableStore();

	private _contentWidget: ContentHoverWidgetWrapper | undefined;

	private _mouseMoveEvent: IEditorMouseEvent | undefined;
	private _reactToEditorMouseMoveRunner: RunOnceScheduler;

	private _hoverSettings!: IHoverSettings;
	private _isMouseDown: boolean = false;

	private _ignoreMouseEvents: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextMenuService _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this._reactToEditorMouseMoveRunner = this._register(new RunOnceScheduler(
			() => {
				if (this._mouseMoveEvent) {
					this._reactToEditorMouseMove(this._mouseMoveEvent);
				}
			}, 0
		));
		this._register(_contextMenuService.onDidShowContextMenu(() => {
			this.hideContentHover();
			this._ignoreMouseEvents = true;
		}));
		this._register(_contextMenuService.onDidHideContextMenu(() => {
			this._ignoreMouseEvents = false;
		}));
		this._hookListeners();
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.hover)) {
				this._unhookListeners();
				this._hookListeners();
			}
		}));
	}

	static get(editor: ICodeEditor): ContentHoverController | null {
		return editor.getContribution<ContentHoverController>(ContentHoverController.ID);
	}

	private _hookListeners(): void {
		const hoverOpts = this._editor.getOption(EditorOption.hover);
		this._hoverSettings = {
			enabled: hoverOpts.enabled,
			sticky: hoverOpts.sticky,
			hidingDelay: hoverOpts.hidingDelay
		};
		if (!hoverOpts.enabled) {
			this._cancelSchedulerAndHide();
		}
		this._listenersStore.add(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
		this._listenersStore.add(this._editor.onMouseUp(() => this._onEditorMouseUp()));
		this._listenersStore.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
		this._listenersStore.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
		this._listenersStore.add(this._editor.onMouseLeave((e) => this._onEditorMouseLeave(e)));
		this._listenersStore.add(this._editor.onDidChangeModel(() => this._cancelSchedulerAndHide()));
		this._listenersStore.add(this._editor.onDidChangeModelContent(() => this._cancelScheduler()));
		this._listenersStore.add(this._editor.onDidScrollChange((e: IScrollEvent) => this._onEditorScrollChanged(e)));
	}

	private _unhookListeners(): void {
		this._listenersStore.clear();
	}

	private _cancelSchedulerAndHide(): void {
		this._cancelScheduler();
		this.hideContentHover();
	}

	private _cancelScheduler() {
		this._mouseMoveEvent = undefined;
		this._reactToEditorMouseMoveRunner.cancel();
	}

	private _onEditorScrollChanged(e: IScrollEvent): void {
		if (this._ignoreMouseEvents) {
			return;
		}

		if (e.scrollTopChanged || e.scrollLeftChanged) {
			this.hideContentHover();
		}
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		if (this._ignoreMouseEvents) {
			return;
		}

		this._isMouseDown = true;

		if (!this._shouldKeepHoverWidgetVisible(mouseEvent)) {
			this.hideContentHover();
		}
	}

	private _shouldKeepHoverWidgetVisible(mouseEvent: IPartialEditorMouseEvent): boolean {
		return this._isMouseOnContentHoverWidget(mouseEvent) || this._isContentWidgetResizing() || isOnColorDecorator(mouseEvent);
	}

	private _isMouseOnContentHoverWidget(mouseEvent: IPartialEditorMouseEvent): boolean {
		if (!this._contentWidget) {
			return false;
		}
		return isMousePositionWithinElement(this._contentWidget.getDomNode(), mouseEvent.event.posx, mouseEvent.event.posy);
	}

	private _onEditorMouseUp(): void {
		if (this._ignoreMouseEvents) {
			return;
		}
		this._isMouseDown = false;
	}

	private _onEditorMouseLeave(mouseEvent: IPartialEditorMouseEvent): void {
		if (this._ignoreMouseEvents || this.shouldKeepOpenOnEditorMouseMoveOrLeave || _sticky) {
			return;
		}

		this._cancelScheduler();

		if (this._shouldKeepHoverWidgetVisible(mouseEvent)) {
			return;
		}

		this.hideContentHover();
	}

	private _shouldKeepCurrentHover(mouseEvent: IEditorMouseEvent): boolean {
		const contentWidget = this._contentWidget;
		if (!contentWidget) {
			return false;
		}

		if (this.shouldKeepOpenOnEditorMouseMoveOrLeave) {
			return true;
		}

		if (contentWidget.isFocused || contentWidget.isResizing) {
			return true;
		}

		const isHoverSticky = this._hoverSettings.sticky;
		if (isHoverSticky && contentWidget.isVisibleFromKeyboard) {
			return true;
		}

		if (this._isMouseOnStickyContentHoverWidget(mouseEvent, isHoverSticky)) {
			return true;
		}

		if (this._isMouseOnColorPickerOrChoosingColor(mouseEvent, contentWidget)) {
			return true;
		}

		if (this._isTextSelectedWithinContentHoverWidget(mouseEvent, contentWidget, isHoverSticky)) {
			return true;
		}

		return false;
	}

	private _isMouseOnStickyContentHoverWidget(mouseEvent: IEditorMouseEvent, isHoverSticky: boolean): boolean {
		return isHoverSticky && this._isMouseOnContentHoverWidget(mouseEvent);
	}

	private _isMouseOnColorPickerOrChoosingColor(mouseEvent: IEditorMouseEvent, contentWidget: ContentHoverWidgetWrapper): boolean {
		const isColorPickerVisible = contentWidget.isColorPickerVisible;
		if (!isColorPickerVisible) {
			return false;
		}
		const isMouseOnContentHoverWidget = this._isMouseOnContentHoverWidget(mouseEvent);
		return isMouseOnContentHoverWidget || this._isMouseDown;
	}

	// TODO@aiday-mar verify if the following is necessary code
	private _isTextSelectedWithinContentHoverWidget(mouseEvent: IEditorMouseEvent, contentWidget: ContentHoverWidgetWrapper, sticky: boolean): boolean {
		if (!sticky) {
			return false;
		}
		const view = mouseEvent.event.browserEvent.view;
		if (!view) {
			return false;
		}
		return contentWidget.containsNode(view.document.activeElement) && !view.getSelection()?.isCollapsed;
	}

	private _onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		if (this._ignoreMouseEvents) {
			return;
		}

		this._mouseMoveEvent = mouseEvent;

		if (this._shouldKeepCurrentHover(mouseEvent)) {
			this._reactToEditorMouseMoveRunner.cancel();
			return;
		}

		if (this._shouldRescheduleHoverComputation()) {
			if (!this._reactToEditorMouseMoveRunner.isScheduled()) {
				this._reactToEditorMouseMoveRunner.schedule(this._hoverSettings.hidingDelay);
			}
			return;
		}

		this._reactToEditorMouseMove(mouseEvent);
	}

	private _shouldRescheduleHoverComputation(): boolean {
		const hidingDelay = this._hoverSettings.hidingDelay;
		const isContentHoverWidgetVisible = this._contentWidget?.isVisible ?? false;
		// If the mouse is not over the widget, and if sticky is on,
		// then give it a grace period before reacting to the mouse event
		return isContentHoverWidgetVisible && this._hoverSettings.sticky && hidingDelay > 0;
	}

	private _reactToEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		if (_sticky) {
			return;
		}

		if (this._hoverSettings.enabled) {
			const contentWidget = this._getOrCreateContentWidget();
			if (contentWidget.showsOrWillShow(mouseEvent)) {
				return;
			}
		}

		this.hideContentHover();
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		if (this._ignoreMouseEvents || !this._contentWidget) {
			return;
		}

		if (this._shouldIgnoreKeyDown(e)) {
			return;
		}

		this.hideContentHover();
	}

	private _shouldIgnoreKeyDown(e: IKeyboardEvent): boolean {
		if (this._isPotentialKeyboardShortcut(e) || this._isModifierKeyPressed(e)) {
			return true;
		}

		// Allow Tab navigation when the hover widget is focused
		if (this._contentWidget && this._contentWidget.isFocused && e.keyCode === KeyCode.Tab) {
			return true;
		}

		return false;
	}

	private _isPotentialKeyboardShortcut(e: IKeyboardEvent): boolean {
		if (!this._editor.hasModel() || !this._contentWidget) {
			return false;
		}

		const resolvedKeyboardEvent = this._keybindingService.softDispatch(e, this._editor.getDomNode());

		if (resolvedKeyboardEvent.kind === ResultKind.MoreChordsNeeded) {
			return true;
		}

		if (resolvedKeyboardEvent.kind === ResultKind.KbFound && this._contentWidget.isVisible && resolvedKeyboardEvent.commandId) {
			return this._isHoverActionCommand(resolvedKeyboardEvent.commandId);
		}

		return false;
	}

	private _isHoverActionCommand(commandId: string): boolean {
		return commandId === SHOW_OR_FOCUS_HOVER_ACTION_ID
			|| commandId === INCREASE_HOVER_VERBOSITY_ACTION_ID
			|| commandId === DECREASE_HOVER_VERBOSITY_ACTION_ID;
	}

	private _isModifierKeyPressed(e: IKeyboardEvent): boolean {
		return e.keyCode === KeyCode.Ctrl
			|| e.keyCode === KeyCode.Alt
			|| e.keyCode === KeyCode.Meta
			|| e.keyCode === KeyCode.Shift;
	}

	public hideContentHover(): void {
		if (_sticky) {
			return;
		}
		if (InlineSuggestionHintsContentWidget.dropDownVisible) {
			return;
		}
		this._contentWidget?.hide();
	}

	private _getOrCreateContentWidget(): ContentHoverWidgetWrapper {
		if (!this._contentWidget) {
			this._contentWidget = this._instantiationService.createInstance(ContentHoverWidgetWrapper, this._editor);
			this._listenersStore.add(this._contentWidget.onContentsChanged(() => this._onHoverContentsChanged.fire()));
		}
		return this._contentWidget;
	}

	public showContentHover(
		range: Range,
		mode: HoverStartMode,
		source: HoverStartSource,
		focus: boolean
	): void {
		this._getOrCreateContentWidget().startShowingAtRange(range, mode, source, focus);
	}

	private _isContentWidgetResizing(): boolean {
		return this._contentWidget?.widget.isResizing || false;
	}

	public focusedHoverPartIndex(): number {
		return this._getOrCreateContentWidget().focusedHoverPartIndex();
	}

	public doesHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		return this._getOrCreateContentWidget().doesHoverAtIndexSupportVerbosityAction(index, action);
	}

	public updateHoverVerbosityLevel(action: HoverVerbosityAction, index: number, focus?: boolean): void {
		this._getOrCreateContentWidget().updateHoverVerbosityLevel(action, index, focus);
	}

	public focus(): void {
		this._contentWidget?.focus();
	}

	public focusHoverPartWithIndex(index: number): void {
		this._contentWidget?.focusHoverPartWithIndex(index);
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

	public getAccessibleWidgetContent(): string | undefined {
		return this._contentWidget?.getAccessibleWidgetContent();
	}

	public getAccessibleWidgetContentAtIndex(index: number): string | undefined {
		return this._contentWidget?.getAccessibleWidgetContentAtIndex(index);
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
		this._contentWidget?.dispose();
	}
}
