/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import platform = require('vs/base/common/platform');
import touch = require('vs/base/browser/touch');
import errors = require('vs/base/common/errors');
import dom = require('vs/base/browser/dom');
import mouse = require('vs/base/browser/mouseEvent');
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import _ = require('vs/base/parts/tree/browser/tree');
import { KeyCode, KeyMod, Keybinding, createKeybinding, SimpleKeybinding } from 'vs/base/common/keyCodes';

export interface IKeyBindingCallback {
	(tree: _.ITree, event: IKeyboardEvent): void;
}

export interface ICancelableEvent {
	preventDefault(): void;
	stopPropagation(): void;
}

export enum ClickBehavior {

	/**
	 * Handle the click when the mouse button is pressed but not released yet.
	 */
	ON_MOUSE_DOWN,

	/**
	 * Handle the click when the mouse button is released.
	 */
	ON_MOUSE_UP
}

export enum OpenMode {
	SINGLE_CLICK,
	DOUBLE_CLICK
}

export interface IControllerOptions {
	clickBehavior?: ClickBehavior;
	openMode?: OpenMode;
	keyboardSupport?: boolean;
}

interface IKeybindingDispatcherItem {
	keybinding: Keybinding;
	callback: IKeyBindingCallback;
}

export class KeybindingDispatcher {

	private _arr: IKeybindingDispatcherItem[];

	constructor() {
		this._arr = [];
	}

	public set(keybinding: number, callback: IKeyBindingCallback) {
		this._arr.push({
			keybinding: createKeybinding(keybinding, platform.OS),
			callback: callback
		});
	}

	public dispatch(keybinding: SimpleKeybinding): IKeyBindingCallback {
		// Loop from the last to the first to handle overwrites
		for (let i = this._arr.length - 1; i >= 0; i--) {
			let item = this._arr[i];
			if (keybinding.equals(item.keybinding)) {
				return item.callback;
			}
		}
		return null;
	}
}

export class DefaultController implements _.IController {

	protected downKeyBindingDispatcher: KeybindingDispatcher;
	protected upKeyBindingDispatcher: KeybindingDispatcher;

	private options: IControllerOptions;

	constructor(options: IControllerOptions = { clickBehavior: ClickBehavior.ON_MOUSE_DOWN, keyboardSupport: true, openMode: OpenMode.SINGLE_CLICK }) {
		this.options = options;

		this.downKeyBindingDispatcher = new KeybindingDispatcher();
		this.upKeyBindingDispatcher = new KeybindingDispatcher();

		if (typeof options.keyboardSupport !== 'boolean' || options.keyboardSupport) {
			this.downKeyBindingDispatcher.set(KeyCode.UpArrow, (t, e) => this.onUp(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.DownArrow, (t, e) => this.onDown(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.LeftArrow, (t, e) => this.onLeft(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.RightArrow, (t, e) => this.onRight(t, e));
			if (platform.isMacintosh) {
				this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.UpArrow, (t, e) => this.onLeft(t, e));
				this.downKeyBindingDispatcher.set(KeyMod.WinCtrl | KeyCode.KEY_N, (t, e) => this.onDown(t, e));
				this.downKeyBindingDispatcher.set(KeyMod.WinCtrl | KeyCode.KEY_P, (t, e) => this.onUp(t, e));
			}
			this.downKeyBindingDispatcher.set(KeyCode.PageUp, (t, e) => this.onPageUp(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.PageDown, (t, e) => this.onPageDown(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.Home, (t, e) => this.onHome(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.End, (t, e) => this.onEnd(t, e));

			this.downKeyBindingDispatcher.set(KeyCode.Space, (t, e) => this.onSpace(t, e));
			this.downKeyBindingDispatcher.set(KeyCode.Escape, (t, e) => this.onEscape(t, e));

			this.upKeyBindingDispatcher.set(KeyCode.Enter, this.onEnter.bind(this));
			this.upKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.Enter, this.onEnter.bind(this));
		}
	}

	public onMouseDown(tree: _.ITree, element: any, event: mouse.IMouseEvent, origin: string = 'mouse'): boolean {
		if (this.options.clickBehavior === ClickBehavior.ON_MOUSE_DOWN && (event.leftButton || event.middleButton)) {
			if (event.target) {
				if (event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
					return false; // Ignore event if target is a form input field (avoids browser specific issues)
				}

				if (dom.findParentWithClass(event.target, 'monaco-action-bar', 'row')) { // TODO@Joao not very nice way of checking for the action bar (implicit knowledge)
					return false; // Ignore event if target is over an action bar of the row
				}
			}

			// Propagate to onLeftClick now
			return this.onLeftClick(tree, element, event, origin);
		}

		return false;
	}

	public onClick(tree: _.ITree, element: any, event: mouse.IMouseEvent): boolean {
		const isMac = platform.isMacintosh;

		// A Ctrl click on the Mac is a context menu event
		if (isMac && event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			return false;
		}

		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false; // Ignore event if target is a form input field (avoids browser specific issues)
		}

		if (this.options.clickBehavior === ClickBehavior.ON_MOUSE_DOWN && (event.leftButton || event.middleButton)) {
			return false; // Already handled by onMouseDown
		}

		return this.onLeftClick(tree, element, event);
	}

	protected onLeftClick(tree: _.ITree, element: any, eventish: ICancelableEvent, origin: string = 'mouse'): boolean {
		const payload = { origin: origin, originalEvent: eventish };
		const event = <mouse.IMouseEvent>eventish;
		const isDoubleClick = (origin === 'mouse' && event.detail === 2);

		if (tree.getInput() === element) {
			tree.clearFocus(payload);
			tree.clearSelection(payload);
		} else {
			const isMouseDown = eventish && event.browserEvent && event.browserEvent.type === 'mousedown';
			if (!isMouseDown) {
				eventish.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
			}
			eventish.stopPropagation();

			tree.domFocus();
			tree.setSelection([element], payload);
			tree.setFocus(element, payload);

			if (this.openOnSingleClick || isDoubleClick || this.isClickOnTwistie(event)) {
				if (tree.isExpanded(element)) {
					tree.collapse(element).done(null, errors.onUnexpectedError);
				} else {
					tree.expand(element).done(null, errors.onUnexpectedError);
				}
			}
		}

		return true;
	}

	protected setOpenMode(openMode: OpenMode) {
		this.options.openMode = openMode;
	}

	protected get openOnSingleClick(): boolean {
		return this.options.openMode === OpenMode.SINGLE_CLICK;
	}

	protected isClickOnTwistie(event: mouse.IMouseEvent): boolean {
		const target = event.target as HTMLElement;

		// There is no way to find out if the ::before element is clicked where
		// the twistie is drawn, but the <div class="content"> element in the
		// tree item is the only thing we get back as target when the user clicks
		// on the twistie.
		return target && target.className === 'content' && dom.hasClass(target.parentElement, 'monaco-tree-row');
	}

	public onContextMenu(tree: _.ITree, element: any, event: _.ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false; // allow context menu on input fields
		}

		// Prevent native context menu from showing up
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}

		return false;
	}

	public onTap(tree: _.ITree, element: any, event: touch.GestureEvent): boolean {
		const target = <HTMLElement>event.initialTarget;

		if (target && target.tagName && target.tagName.toLowerCase() === 'input') {
			return false; // Ignore event if target is a form input field (avoids browser specific issues)
		}

		return this.onLeftClick(tree, element, event, 'touch');
	}

	public onKeyDown(tree: _.ITree, event: IKeyboardEvent): boolean {
		return this.onKey(this.downKeyBindingDispatcher, tree, event);
	}

	public onKeyUp(tree: _.ITree, event: IKeyboardEvent): boolean {
		return this.onKey(this.upKeyBindingDispatcher, tree, event);
	}

	private onKey(bindings: KeybindingDispatcher, tree: _.ITree, event: IKeyboardEvent): boolean {
		const handler = bindings.dispatch(event.toKeybinding());
		if (handler) {
			if (handler(tree, event)) {
				event.preventDefault();
				event.stopPropagation();
				return true;
			}
		}
		return false;
	}

	protected onUp(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusPrevious(1, payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onPageUp(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusPreviousPage(payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onDown(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusNext(1, payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onPageDown(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusNextPage(payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onHome(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusFirst(payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onEnd(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusLast(payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onLeft(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			const focus = tree.getFocus();
			tree.collapse(focus).then(didCollapse => {
				if (focus && !didCollapse) {
					tree.focusParent(payload);
					return tree.reveal(tree.getFocus());
				}
				return undefined;
			}).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onRight(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			const focus = tree.getFocus();
			tree.expand(focus).then(didExpand => {
				if (focus && !didExpand) {
					tree.focusFirstChild(payload);
					return tree.reveal(tree.getFocus());
				}
				return undefined;
			}).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onEnter(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			return false;
		}
		const focus = tree.getFocus();
		if (focus) {
			tree.setSelection([focus], payload);
		}
		return true;
	}

	protected onSpace(tree: _.ITree, event: IKeyboardEvent): boolean {
		if (tree.getHighlight()) {
			return false;
		}
		const focus = tree.getFocus();
		if (focus) {
			tree.toggleExpansion(focus);
		}
		return true;
	}

	protected onEscape(tree: _.ITree, event: IKeyboardEvent): boolean {
		const payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
			return true;
		}

		if (tree.getSelection().length) {
			tree.clearSelection(payload);
			return true;
		}

		if (tree.getFocus()) {
			tree.clearFocus(payload);
			return true;
		}

		return false;
	}
}

export class DefaultDragAndDrop implements _.IDragAndDrop {

	public getDragURI(tree: _.ITree, element: any): string {
		return null;
	}

	public onDragStart(tree: _.ITree, data: _.IDragAndDropData, originalEvent: mouse.DragMouseEvent): void {
		return;
	}

	public onDragOver(tree: _.ITree, data: _.IDragAndDropData, targetElement: any, originalEvent: mouse.DragMouseEvent): _.IDragOverReaction {
		return null;
	}

	public drop(tree: _.ITree, data: _.IDragAndDropData, targetElement: any, originalEvent: mouse.DragMouseEvent): void {
		return;
	}
}

export class DefaultFilter implements _.IFilter {

	public isVisible(tree: _.ITree, element: any): boolean {
		return true;
	}
}

export class DefaultSorter implements _.ISorter {

	public compare(tree: _.ITree, element: any, otherElement: any): number {
		return 0;
	}
}

export class DefaultAccessibilityProvider implements _.IAccessibilityProvider {

	getAriaLabel(tree: _.ITree, element: any): string {
		return null;
	}
}

export class DefaultTreestyler implements _.ITreeStyler {

	constructor(private styleElement: HTMLStyleElement, private selectorSuffix?: string) { }

	style(styles: _.ITreeStyles): void {
		const suffix = this.selectorSuffix ? `.${this.selectorSuffix}` : '';
		const content: string[] = [];

		if (styles.listFocusBackground) {
			content.push(`.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.focused:not(.highlighted) { background-color: ${styles.listFocusBackground}; }`);
		}

		if (styles.listFocusForeground) {
			content.push(`.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.focused:not(.highlighted) { color: ${styles.listFocusForeground}; }`);
		}

		if (styles.listActiveSelectionBackground) {
			content.push(`.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) { background-color: ${styles.listActiveSelectionBackground}; }`);
		}

		if (styles.listActiveSelectionForeground) {
			content.push(`.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) { color: ${styles.listActiveSelectionForeground}; }`);
		}

		if (styles.listFocusAndSelectionBackground) {
			content.push(`
				.monaco-tree-drag-image,
				.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.focused.selected:not(.highlighted) { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
		}

		if (styles.listFocusAndSelectionForeground) {
			content.push(`
				.monaco-tree-drag-image,
				.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.focused.selected:not(.highlighted) { color: ${styles.listFocusAndSelectionForeground}; }
			`);
		}

		if (styles.listInactiveSelectionBackground) {
			content.push(`.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) { background-color: ${styles.listInactiveSelectionBackground}; }`);
		}

		if (styles.listInactiveSelectionForeground) {
			content.push(`.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) { color: ${styles.listInactiveSelectionForeground}; }`);
		}

		if (styles.listHoverBackground) {
			content.push(`.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row:hover:not(.highlighted):not(.selected):not(.focused) { background-color: ${styles.listHoverBackground}; }`);
		}

		if (styles.listHoverForeground) {
			content.push(`.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row:hover:not(.highlighted):not(.selected):not(.focused) { color: ${styles.listHoverForeground}; }`);
		}

		if (styles.listDropBackground) {
			content.push(`
				.monaco-tree${suffix} .monaco-tree-wrapper.drop-target,
				.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row.drop-target { background-color: ${styles.listDropBackground} !important; color: inherit !important; }
			`);
		}

		if (styles.listFocusOutline) {
			content.push(`
				.monaco-tree-drag-image																															{ border: 1px solid ${styles.listFocusOutline}; background: #000; }
				.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row 														{ border: 1px solid transparent; }
				.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.focused:not(.highlighted) 						{ border: 1px dotted ${styles.listFocusOutline}; }
				.monaco-tree${suffix}.focused .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) 						{ border: 1px solid ${styles.listFocusOutline}; }
				.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted)  							{ border: 1px solid ${styles.listFocusOutline}; }
				.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row:hover:not(.highlighted):not(.selected):not(.focused)  	{ border: 1px dashed ${styles.listFocusOutline}; }
				.monaco-tree${suffix} .monaco-tree-wrapper.drop-target,
				.monaco-tree${suffix} .monaco-tree-rows > .monaco-tree-row.drop-target												{ border: 1px dashed ${styles.listFocusOutline}; }
			`);
		}

		const newStyles = content.join('\n');
		if (newStyles !== this.styleElement.innerHTML) {
			this.styleElement.innerHTML = newStyles;
		}
	}
}

export class CollapseAllAction extends Action {

	constructor(private viewer: _.ITree, enabled: boolean) {
		super('vs.tree.collapse', nls.localize('collapse', "Collapse"), 'monaco-tree-action collapse-all', enabled);
	}

	public run(context?: any): TPromise<any> {
		if (this.viewer.getHighlight()) {
			return TPromise.as(null); // Global action disabled if user is in edit mode from another action
		}

		this.viewer.collapseAll();
		this.viewer.clearSelection();
		this.viewer.clearFocus();
		this.viewer.domFocus();
		this.viewer.focusFirst();

		return TPromise.as(null);
	}
}
