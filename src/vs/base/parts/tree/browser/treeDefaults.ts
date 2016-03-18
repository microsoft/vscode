/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/base/common/platform');
import touch = require('vs/base/browser/touch');
import errors = require('vs/base/common/errors');
import dom = require('vs/base/browser/dom');
import mouse = require('vs/base/browser/mouseEvent');
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import _ = require('vs/base/parts/tree/browser/tree');
import {CommonKeybindings} from 'vs/base/common/keyCodes';

export interface ILegacyTemplateData {
	root: HTMLElement;
	element: any;
	previousCleanupFn: _.IElementCallback;
}

export class LegacyRenderer implements _.IRenderer {

	public getHeight(tree:_.ITree, element:any):number {
		return 20;
	}

	public getTemplateId(tree: _.ITree, element: any): string {
		return 'legacy';
	}

	public renderTemplate(tree: _.ITree, templateId: string, container: HTMLElement): any {
		return <ILegacyTemplateData> {
			root: container,
			element: null,
			previousCleanupFn: null
		};
	}

	public renderElement(tree: _.ITree, element: any, templateId: string, templateData: ILegacyTemplateData): void {
		if (templateData.previousCleanupFn) {
			templateData.previousCleanupFn(tree, templateData.element);
		}

		while (templateData.root.firstChild) {
			templateData.root.removeChild(templateData.root.firstChild);
		}

		templateData.element = element;
		templateData.previousCleanupFn = this.render(tree, element, templateData.root);
	}

	public disposeTemplate(tree: _.ITree, templateId: string, templateData: any): void {
		if (templateData.previousCleanupFn) {
			templateData.previousCleanupFn(tree, templateData.element);
		}

		templateData.root = null;
		templateData.element = null;
		templateData.previousCleanupFn = null;
	}

	protected render(tree:_.ITree, element:any, container:HTMLElement, previousCleanupFn?: _.IElementCallback):_.IElementCallback {
		container.textContent = '' + element;
		return null;
	}
}

export interface IKeyBindingCallback {
	(tree:_.ITree, event:IKeyboardEvent):void;
}

export interface ICancelableEvent {
	preventDefault():void;
	stopPropagation():void;
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

export interface IControllerOptions {
	clickBehavior?:ClickBehavior;
}

interface IKeybindingDispatcherItem {
	keybinding: number;
	callback: IKeyBindingCallback;
}

export class KeybindingDispatcher {

	private _arr: IKeybindingDispatcherItem[];

	constructor() {
		this._arr = [];
	}

	public set(keybinding:number, callback:IKeyBindingCallback) {
		this._arr.push({
			keybinding: keybinding,
			callback: callback
		});
	}

	public dispatch(keybinding:number): IKeyBindingCallback {
		// Loop from the last to the first to handle overwrites
		for (let i = this._arr.length - 1; i >= 0; i--) {
			let item = this._arr[i];
			if (keybinding === item.keybinding) {
				return item.callback;
			}
		}
		return null;
	}
}

export class DefaultController implements _.IController {

	protected downKeyBindingDispatcher: KeybindingDispatcher;
	protected upKeyBindingDispatcher: KeybindingDispatcher;

	private options:IControllerOptions;

	constructor(options:IControllerOptions = { clickBehavior: ClickBehavior.ON_MOUSE_UP }) {
		this.options = options;

		this.downKeyBindingDispatcher = new KeybindingDispatcher();
		this.downKeyBindingDispatcher.set(CommonKeybindings.SPACE, (t, e) => this.onSpace(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.UP_ARROW, (t, e) => this.onUp(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.PAGE_UP, (t, e) => this.onPageUp(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.DOWN_ARROW, (t, e) => this.onDown(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.PAGE_DOWN, (t, e) => this.onPageDown(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.LEFT_ARROW, (t, e) => this.onLeft(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.RIGHT_ARROW, (t, e) => this.onRight(t, e));
		this.downKeyBindingDispatcher.set(CommonKeybindings.ESCAPE, (t, e) => this.onEscape(t, e));

		this.upKeyBindingDispatcher = new KeybindingDispatcher();
		this.upKeyBindingDispatcher.set(CommonKeybindings.ENTER, this.onEnter.bind(this));
		this.upKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_ENTER, this.onEnter.bind(this));
	}

	public onMouseDown(tree:_.ITree, element: any, event:mouse.IMouseEvent, origin: string = 'mouse'):boolean {
		if (this.options.clickBehavior === ClickBehavior.ON_MOUSE_DOWN && event.leftButton) {
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

	public onClick(tree:_.ITree, element: any, event:mouse.IMouseEvent):boolean {
		var isMac = platform.isMacintosh;

		// A Ctrl click on the Mac is a context menu event
		if (isMac && event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			return false;
		}

		if (event.middleButton) {
			return false; // Give contents of the item a chance to handle this (e.g. open link in new tab)
		}

		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false; // Ignore event if target is a form input field (avoids browser specific issues)
		}

		if (this.options.clickBehavior === ClickBehavior.ON_MOUSE_DOWN && event.leftButton) {
			return false; // Already handled by onMouseDown
		}

		return this.onLeftClick(tree, element, event);
	}

	protected onLeftClick(tree:_.ITree, element: any, eventish:ICancelableEvent, origin: string = 'mouse'):boolean {
		var payload = { origin: origin, originalEvent: eventish };

		if (tree.getInput() === element) {
			tree.clearFocus(payload);
			tree.clearSelection(payload);
		} else {
			var isMouseDown = eventish && (<mouse.IMouseEvent>eventish).browserEvent && (<mouse.IMouseEvent>eventish).browserEvent.type === 'mousedown';
			if (!isMouseDown) {
				eventish.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
			}
			eventish.stopPropagation();

			tree.DOMFocus();
			tree.setSelection([element], payload);
			tree.setFocus(element, payload);

			if (tree.isExpanded(element)) {
				tree.collapse(element).done(null, errors.onUnexpectedError);
			} else {
				tree.expand(element).done(null, errors.onUnexpectedError);
			}
		}

		return true;
	}

	public onContextMenu(tree:_.ITree, element: any, event:_.ContextMenuEvent):boolean {
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

	public onTap(tree:_.ITree, element: any, event:touch.GestureEvent):boolean {
		var target = <HTMLElement> event.initialTarget;

		if (target && target.tagName && target.tagName.toLowerCase() === 'input') {
			return false; // Ignore event if target is a form input field (avoids browser specific issues)
		}

		return this.onLeftClick(tree, element, event, 'touch');
	}

	public onKeyDown(tree:_.ITree, event:IKeyboardEvent):boolean {
		return this.onKey(this.downKeyBindingDispatcher, tree, event);
	}

	public onKeyUp(tree:_.ITree, event:IKeyboardEvent):boolean {
		return this.onKey(this.upKeyBindingDispatcher, tree, event);
	}

	private onKey(bindings:KeybindingDispatcher, tree:_.ITree, event:IKeyboardEvent):boolean {
		var handler = bindings.dispatch(event.asKeybinding());
		if (handler) {
			if (handler(tree, event)) {
				event.preventDefault();
				event.stopPropagation();
				return true;
			}
		}
		return false;
	}

	protected onUp(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusPrevious(1, payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onPageUp(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusPreviousPage(payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onDown(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusNext(1, payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onPageDown(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			tree.focusNextPage(payload);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onLeft(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			var focus = tree.getFocus();
			tree.collapse(focus).done((didCollapse) => {
				if (focus && !didCollapse) {
					tree.focusParent(payload);
				}
			});
		}
		return true;
	}

	protected onRight(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			tree.clearHighlight(payload);
		} else {
			var focus = tree.getFocus();
			tree.expand(focus).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	protected onEnter(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

		if (tree.getHighlight()) {
			return false;
		}
		var focus = tree.getFocus();
		if (focus) {
			tree.setSelection([focus], payload);
		}
		return true;
	}

	protected onSpace(tree:_.ITree, event:IKeyboardEvent):boolean {
		if (tree.getHighlight()) {
			return false;
		}
		var focus = tree.getFocus();
		if (focus) {
			tree.toggleExpansion(focus);
		}
		return true;
	}

	protected onEscape(tree:_.ITree, event:IKeyboardEvent):boolean {
		var payload = { origin: 'keyboard', originalEvent: event };

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

	public getDragURI(tree :_.ITree, element: any):string {
		return null;
	}

	public onDragStart(tree: _.ITree, data: _.IDragAndDropData, originalEvent: mouse.DragMouseEvent):void {
		return;
	}

	public onDragOver(tree: _.ITree, data: _.IDragAndDropData, targetElement: any, originalEvent: mouse.DragMouseEvent):_.IDragOverReaction {
		return null;
	}

	public drop(tree: _.ITree, data: _.IDragAndDropData, targetElement: any, originalEvent: mouse.DragMouseEvent):void {
		return;
	}
}

export class DefaultFilter implements _.IFilter {

	public isVisible(tree: _.ITree, element: any):boolean {
		return true;
	}
}

export class DefaultSorter implements _.ISorter {

	public compare(tree: _.ITree, element: any, otherElement: any):number {
		return 0;
	}
}

export class DefaultAccessibilityProvider implements _.IAccessibilityProvider {

	getAriaLabel(tree: _.ITree, element: any): string {
		return null;
	}
}
