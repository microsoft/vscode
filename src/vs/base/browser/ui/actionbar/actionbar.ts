/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./actionbar';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import { Promise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { IAction, IActionRunner, Action, IActionChangeEvent, ActionRunner } from 'vs/base/common/actions';
import DOM = require('vs/base/browser/dom');
import { EventType as CommonEventType } from 'vs/base/common/events';
import types = require('vs/base/common/types');
import { IEventEmitter, EventEmitter } from 'vs/base/common/eventEmitter';
import { Gesture, EventType } from 'vs/base/browser/touch';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

export interface IActionItem extends IEventEmitter {
	actionRunner: IActionRunner;
	setActionContext(context: any): void;
	render(element: HTMLElement): void;
	isEnabled(): boolean;
	focus(fromRight?: boolean): void;
	blur(): void;
	dispose(): void;
}

export interface IBaseActionItemOptions {
	draggable?: boolean;
}

export class BaseActionItem extends EventEmitter implements IActionItem {

	public builder: Builder;
	public _callOnDispose: lifecycle.IDisposable[];
	public _context: any;
	public _action: IAction;

	private gesture: Gesture;
	private _actionRunner: IActionRunner;

	constructor(context: any, action: IAction, protected options?: IBaseActionItemOptions) {
		super();

		this._callOnDispose = [];
		this._context = context || this;
		this._action = action;

		if (action instanceof Action) {
			this._callOnDispose.push(action.onDidChange(event => {
				if (!this.builder) {
					// we have not been rendered yet, so there
					// is no point in updating the UI
					return;
				}
				this._handleActionChangeEvent(event);
			}));
		}
	}

	protected _handleActionChangeEvent(event: IActionChangeEvent): void {
		if (event.enabled !== void 0) {
			this._updateEnabled();
		}
		if (event.checked !== void 0) {
			this._updateChecked();
		}
		if (event.class !== void 0) {
			this._updateClass();
		}
		if (event.label !== void 0) {
			this._updateLabel();
			this._updateTooltip();
		}
		if (event.tooltip !== void 0) {
			this._updateTooltip();
		}
	}

	public get callOnDispose() {
		return this._callOnDispose;
	}

	public set actionRunner(actionRunner: IActionRunner) {
		this._actionRunner = actionRunner;
	}

	public get actionRunner(): IActionRunner {
		return this._actionRunner;
	}

	public getAction(): IAction {
		return this._action;
	}

	public isEnabled(): boolean {
		return this._action.enabled;
	}

	public setActionContext(newContext: any): void {
		this._context = newContext;
	}

	public render(container: HTMLElement): void {
		this.builder = $(container);
		this.gesture = new Gesture(container);

		const enableDragging = this.options && this.options.draggable;
		if (enableDragging) {
			container.draggable = true;
		}

		this.builder.on(EventType.Tap, e => this.onClick(e));

		this.builder.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (!enableDragging) {
				DOM.EventHelper.stop(e); // do not run when dragging is on because that would disable it
			}

			if (this._action.enabled && e.button === 0) {
				this.builder.addClass('active');
			}
		});

		this.builder.on(DOM.EventType.CLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e, true);
			setTimeout(() => this.onClick(e), 50);
		});

		this.builder.on([DOM.EventType.MOUSE_UP, DOM.EventType.MOUSE_OUT], (e: MouseEvent) => {
			DOM.EventHelper.stop(e);
			this.builder.removeClass('active');
		});
	}

	public onClick(event: Event): void {
		DOM.EventHelper.stop(event, true);

		let context: any;
		if (types.isUndefinedOrNull(this._context)) {
			context = event;
		} else {
			context = this._context;
			context.event = event;
		}

		this._actionRunner.run(this._action, context);
	}

	public focus(): void {
		if (this.builder) {
			this.builder.domFocus();
		}
	}

	public blur(): void {
		if (this.builder) {
			this.builder.domBlur();
		}
	}

	protected _updateEnabled(): void {
		// implement in subclass
	}

	protected _updateLabel(): void {
		// implement in subclass
	}

	protected _updateTooltip(): void {
		// implement in subclass
	}

	protected _updateClass(): void {
		// implement in subclass
	}

	protected _updateChecked(): void {
		// implement in subclass
	}

	public dispose(): void {
		super.dispose();

		if (this.builder) {
			this.builder.destroy();
			this.builder = null;
		}

		if (this.gesture) {
			this.gesture.dispose();
			this.gesture = null;
		}

		this._callOnDispose = lifecycle.dispose(this._callOnDispose);
	}
}

export class Separator extends Action {

	public static ID = 'vs.actions.separator';

	constructor(label?: string, order?: number) {
		super(Separator.ID, label, label ? 'separator text' : 'separator');
		this.checked = false;
		this.radio = false;
		this.enabled = false;
		this.order = order;
	}
}

export interface IActionItemOptions extends IBaseActionItemOptions {
	icon?: boolean;
	label?: boolean;
	keybinding?: string;
}

export class ActionItem extends BaseActionItem {

	protected $e: Builder;
	protected options: IActionItemOptions;
	private cssClass: string;

	constructor(context: any, action: IAction, options: IActionItemOptions = {}) {
		super(context, action, options);

		this.options = options;
		this.options.icon = options.icon !== undefined ? options.icon : false;
		this.options.label = options.label !== undefined ? options.label : true;
		this.cssClass = '';
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.$e = $('a.action-label').appendTo(this.builder);
		this.$e.attr({ role: 'button' });

		if (this.options.label && this.options.keybinding) {
			$('span.keybinding').text(this.options.keybinding).appendTo(this.builder);
		}

		this._updateClass();
		this._updateLabel();
		this._updateTooltip();
		this._updateEnabled();
		this._updateChecked();
	}

	public focus(): void {
		super.focus();
		this.$e.domFocus();
	}

	public _updateLabel(): void {
		if (this.options.label) {
			this.$e.text(this.getAction().label);
		}
	}

	public _updateTooltip(): void {
		let title: string = null;

		if (this.getAction().tooltip) {
			title = this.getAction().tooltip;

		} else if (!this.options.label && this.getAction().label && this.options.icon) {
			title = this.getAction().label;

			if (this.options.keybinding) {
				title = nls.localize({ key: 'titleLabel', comment: ['action title', 'action keybinding'] }, "{0} ({1})", title, this.options.keybinding);
			}
		}

		if (title) {
			this.$e.attr({ title: title });
		}
	}

	public _updateClass(): void {
		if (this.cssClass) {
			this.$e.removeClass(this.cssClass);
		}
		if (this.options.icon) {
			this.cssClass = this.getAction().class;
			this.$e.addClass('icon');
			if (this.cssClass) {
				this.$e.addClass(this.cssClass);
			}
			this._updateEnabled();
		} else {
			this.$e.removeClass('icon');
		}
	}

	public _updateEnabled(): void {
		if (this.getAction().enabled) {
			this.builder.removeClass('disabled');
			this.$e.removeClass('disabled');
			this.$e.attr({ tabindex: 0 });
		} else {
			this.builder.addClass('disabled');
			this.$e.addClass('disabled');
			DOM.removeTabIndexAndUpdateFocus(this.$e.getHTMLElement());
		}
	}

	public _updateChecked(): void {
		if (this.getAction().checked) {
			this.$e.addClass('checked');
		} else {
			this.$e.removeClass('checked');
		}
	}

	public _updateRadio(): void {
		if (this.getAction().radio) {
			this.$e.addClass('radio');
		} else {
			this.$e.removeClass('radio');
		}
	}
}

export enum ActionsOrientation {
	HORIZONTAL = 1,
	VERTICAL = 2
}

export interface IActionItemProvider {
	(action: IAction): IActionItem;
}

export interface IActionBarOptions {
	orientation?: ActionsOrientation;
	context?: any;
	actionItemProvider?: IActionItemProvider;
	actionRunner?: IActionRunner;
	ariaLabel?: string;
	animated?: boolean;
}

let defaultOptions: IActionBarOptions = {
	orientation: ActionsOrientation.HORIZONTAL,
	context: null
};

export interface IActionOptions extends IActionItemOptions {
	index?: number;
}

export class ActionBar extends EventEmitter implements IActionRunner {

	public options: IActionBarOptions;

	private _actionRunner: IActionRunner;
	private _context: any;

	// Items
	public items: IActionItem[];

	private focusedItem: number;
	private focusTracker: DOM.IFocusTracker;

	// Elements
	public domNode: HTMLElement;
	private actionsList: HTMLElement;

	private toDispose: lifecycle.IDisposable[];

	constructor(container: HTMLElement | Builder, options: IActionBarOptions = defaultOptions) {
		super();
		this.options = options;
		this._context = options.context;
		this.toDispose = [];
		this._actionRunner = this.options.actionRunner;

		if (!this._actionRunner) {
			this._actionRunner = new ActionRunner();
			this.toDispose.push(this._actionRunner);
		}

		this.toDispose.push(this.addEmitter2(this._actionRunner));

		this.items = [];
		this.focusedItem = undefined;

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-action-bar';

		if (options.animated !== false) {
			DOM.addClass(this.domNode, 'animated');
		}

		let isVertical = this.options.orientation === ActionsOrientation.VERTICAL;
		if (isVertical) {
			this.domNode.className += ' vertical';
		}

		$(this.domNode).on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			let eventHandled = true;

			if (event.equals(isVertical ? KeyCode.UpArrow : KeyCode.LeftArrow)) {
				this.focusPrevious();
			} else if (event.equals(isVertical ? KeyCode.DownArrow : KeyCode.RightArrow)) {
				this.focusNext();
			} else if (event.equals(KeyCode.Escape)) {
				this.cancel();
			} else if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				// Nothing, just staying out of the else branch
			} else {
				eventHandled = false;
			}

			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		});

		// Prevent native context menu on actions
		$(this.domNode).on(DOM.EventType.CONTEXT_MENU, (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
		});

		$(this.domNode).on(DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);

			// Run action on Enter/Space
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this.doTrigger(event);
				event.preventDefault();
				event.stopPropagation();
			}

			// Recompute focused item
			else if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab)) {
				this.updateFocusedItem();
			}
		});

		this.focusTracker = DOM.trackFocus(this.domNode);
		this.focusTracker.addBlurListener(() => {
			if (document.activeElement === this.domNode || !DOM.isAncestor(document.activeElement, this.domNode)) {
				this.emit(DOM.EventType.BLUR, {});
				this.focusedItem = undefined;
			}
		});

		this.focusTracker.addFocusListener(() => this.updateFocusedItem());

		this.actionsList = document.createElement('ul');
		this.actionsList.className = 'actions-container';
		this.actionsList.setAttribute('role', 'toolbar');
		if (this.options.ariaLabel) {
			this.actionsList.setAttribute('aria-label', this.options.ariaLabel);
		}

		this.domNode.appendChild(this.actionsList);

		((container instanceof Builder) ? container.getHTMLElement() : container).appendChild(this.domNode);
	}

	public setAriaLabel(label: string): void {
		if (label) {
			this.actionsList.setAttribute('aria-label', label);
		} else {
			this.actionsList.removeAttribute('aria-label');
		}
	}

	private updateFocusedItem(): void {
		for (let i = 0; i < this.actionsList.children.length; i++) {
			let elem = this.actionsList.children[i];
			if (DOM.isAncestor(document.activeElement, elem)) {
				this.focusedItem = i;
				break;
			}
		}
	}

	public get context(): any {
		return this._context;
	}

	public set context(context: any) {
		this._context = context;
		this.items.forEach(i => i.setActionContext(context));
	}

	public get actionRunner(): IActionRunner {
		return this._actionRunner;
	}

	public set actionRunner(actionRunner: IActionRunner) {
		if (actionRunner) {
			this._actionRunner = actionRunner;
			this.items.forEach(item => item.actionRunner = actionRunner);
		}
	}

	public getContainer(): Builder {
		return $(this.domNode);
	}

	public push(arg: IAction | IAction[], options: IActionOptions = {}): void {

		const actions: IAction[] = !Array.isArray(arg) ? [arg] : arg;

		let index = types.isNumber(options.index) ? options.index : null;

		actions.forEach((action: IAction) => {
			const actionItemElement = document.createElement('li');
			actionItemElement.className = 'action-item';
			actionItemElement.setAttribute('role', 'presentation');

			let item: IActionItem = null;

			if (this.options.actionItemProvider) {
				item = this.options.actionItemProvider(action);
			}

			if (!item) {
				item = new ActionItem(this.context, action, options);
			}

			item.actionRunner = this._actionRunner;
			item.setActionContext(this.context);
			this.addEmitter2(item);
			item.render(actionItemElement);

			if (index === null || index < 0 || index >= this.actionsList.children.length) {
				this.actionsList.appendChild(actionItemElement);
			} else {
				this.actionsList.insertBefore(actionItemElement, this.actionsList.children[index++]);
			}

			this.items.push(item);
		});
	}

	public pull(index: number): void {
		if (index >= 0 && index < this.items.length) {
			this.items.splice(index, 1);
			this.actionsList.removeChild(this.actionsList.childNodes[index]);
		}
	}

	public clear(): void {
		this.items = lifecycle.dispose(this.items);
		$(this.actionsList).empty();
	}

	public length(): number {
		return this.items.length;
	}

	public isEmpty(): boolean {
		return this.items.length === 0;
	}

	public focus(selectFirst?: boolean): void {
		if (selectFirst && typeof this.focusedItem === 'undefined') {
			this.focusedItem = 0;
		}

		this.updateFocus();
	}

	private focusNext(): void {
		if (typeof this.focusedItem === 'undefined') {
			this.focusedItem = this.items.length - 1;
		}

		let startIndex = this.focusedItem;
		let item: IActionItem;

		do {
			this.focusedItem = (this.focusedItem + 1) % this.items.length;
			item = this.items[this.focusedItem];
		} while (this.focusedItem !== startIndex && !item.isEnabled());

		if (this.focusedItem === startIndex && !item.isEnabled()) {
			this.focusedItem = undefined;
		}

		this.updateFocus();
	}

	private focusPrevious(): void {
		if (typeof this.focusedItem === 'undefined') {
			this.focusedItem = 0;
		}

		let startIndex = this.focusedItem;
		let item: IActionItem;

		do {
			this.focusedItem = this.focusedItem - 1;

			if (this.focusedItem < 0) {
				this.focusedItem = this.items.length - 1;
			}

			item = this.items[this.focusedItem];
		} while (this.focusedItem !== startIndex && !item.isEnabled());

		if (this.focusedItem === startIndex && !item.isEnabled()) {
			this.focusedItem = undefined;
		}

		this.updateFocus(true);
	}

	private updateFocus(fromRight?: boolean): void {
		if (typeof this.focusedItem === 'undefined') {
			this.domNode.focus();
			return;
		}

		for (let i = 0; i < this.items.length; i++) {
			let item = this.items[i];

			let actionItem = <any>item;

			if (i === this.focusedItem) {
				if (types.isFunction(actionItem.focus)) {
					actionItem.focus(fromRight);
				}
			} else {
				if (types.isFunction(actionItem.blur)) {
					actionItem.blur();
				}
			}
		}
	}

	private doTrigger(event: StandardKeyboardEvent): void {
		if (typeof this.focusedItem === 'undefined') {
			return; //nothing to focus
		}

		// trigger action
		let actionItem = this.items[this.focusedItem];
		if (actionItem instanceof BaseActionItem) {
			const context = (actionItem._context === null || actionItem._context === undefined) ? event : actionItem._context;
			this.run(actionItem._action, context).done();
		}
	}

	private cancel(): void {
		if (document.activeElement instanceof HTMLElement) {
			(<HTMLElement>document.activeElement).blur(); // remove focus from focussed action
		}

		this.emit(CommonEventType.CANCEL);
	}

	public run(action: IAction, context?: any): Promise {
		return this._actionRunner.run(action, context);
	}

	public dispose(): void {
		if (this.items !== null) {
			lifecycle.dispose(this.items);
		}
		this.items = null;

		if (this.focusTracker) {
			this.focusTracker.dispose();
			this.focusTracker = null;
		}

		this.toDispose = lifecycle.dispose(this.toDispose);

		this.getContainer().destroy();

		super.dispose();
	}
}

export class SelectActionItem extends BaseActionItem {
	protected selectBox: SelectBox;
	protected toDispose: lifecycle.IDisposable[];

	constructor(ctx: any, action: IAction, options: string[], selected: number) {
		super(ctx, action);
		this.selectBox = new SelectBox(options, selected);

		this.toDispose = [];
		this.toDispose.push(this.selectBox);
		this.registerListeners();
	}

	public setOptions(options: string[], selected?: number): void {
		this.selectBox.setOptions(options, selected);
	}

	public select(index: number): void {
		this.selectBox.select(index);
	}

	private registerListeners(): void {
		this.toDispose.push(this.selectBox.onDidSelect(selected => {
			this.actionRunner.run(this._action, this.getActionContext(selected)).done();
		}));
	}

	protected getActionContext(option: string) {
		return option;
	}

	public focus(): void {
		if (this.selectBox) {
			this.selectBox.focus();
		}
	}

	public blur(): void {
		if (this.selectBox) {
			this.selectBox.blur();
		}
	}

	public render(container: HTMLElement): void {
		this.selectBox.render(container);
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);

		super.dispose();
	}
}