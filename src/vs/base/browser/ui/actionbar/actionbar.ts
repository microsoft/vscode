/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./actionbar';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import {Promise} from 'vs/base/common/winjs.base';
import {Builder, $} from 'vs/base/browser/builder';
import platform = require('vs/base/common/platform');
import {IAction, IActionRunner, Action, ActionRunner} from 'vs/base/common/actions';
import DOM = require('vs/base/browser/dom');
import {EventType as CommonEventType} from 'vs/base/common/events';
import types = require('vs/base/common/types');
import {IEventEmitter, EventEmitter, IEmitterEvent} from 'vs/base/common/eventEmitter';
import {Gesture, EventType} from 'vs/base/browser/touch';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {CommonKeybindings} from 'vs/base/common/keyCodes';

export interface IActionItem extends IEventEmitter {
	actionRunner: IActionRunner;
	setActionContext(context: any): void;
	render(element: HTMLElement): void;
	isEnabled(): boolean;
	focus(): void;
	blur(): void;
	dispose(): void;
}

export class BaseActionItem extends EventEmitter implements IActionItem {

	public builder: Builder;
	public _callOnDispose: Function[];
	public _context: any;
	public _action: IAction;

	private gesture: Gesture;
	private _actionRunner: IActionRunner;

	constructor(context: any, action: IAction) {
		super();

		this._callOnDispose = [];
		this._context = context || this;
		this._action = action;

		if (action instanceof Action) {
			let l = (<Action>action).addBulkListener((events: IEmitterEvent[]) => {

				if (!this.builder) {
					// we have not been rendered yet, so there
					// is no point in updating the UI
					return;
				}

				events.forEach((event: IEmitterEvent) => {

					switch (event.getType()) {
						case Action.ENABLED:
							this._updateEnabled();
							break;
						case Action.LABEL:
							this._updateLabel();
							this._updateTooltip();
							break;
						case Action.TOOLTIP:
							this._updateTooltip();
							break;
						case Action.CLASS:
							this._updateClass();
							break;
						case Action.CHECKED:
							this._updateChecked();
							break;
						default:
							this._updateUnknown(event);
							break;
					}
				});
			});
			this._callOnDispose.push(l);
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

		this.builder.on(DOM.EventType.CLICK, (event: Event) => { this.onClick(event); });
		this.builder.on(EventType.Tap, e => { this.onClick(e); });

		if (platform.isMacintosh) {
			this.builder.on(DOM.EventType.CONTEXT_MENU, (event: Event) => { this.onClick(event); }); // https://github.com/Microsoft/vscode/issues/1011
		}

		this.builder.on('mousedown', (e: MouseEvent) => {
			if (e.button === 0 && this._action.enabled) {
				this.builder.addClass('active');
			}
		});

		this.builder.on(['mouseup', 'mouseout'], (e: MouseEvent) => {
			if (e.button === 0 && this._action.enabled) {
				this.builder.removeClass('active');
			}
		});
	}

	public onClick(event: Event): void {
		DOM.EventHelper.stop(event, true);
		this._actionRunner.run(this._action, this._context || event);
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

	public _updateEnabled(): void {
		// implement in subclass
	}

	public _updateLabel(): void {
		// implement in subclass
	}

	public _updateTooltip(): void {
		// implement in subclass
	}

	public _updateClass(): void {
		// implement in subclass
	}

	public _updateChecked(): void {
		// implement in subclass
	}

	public _updateUnknown(event: IEmitterEvent): void {
		// can implement in subclass
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

		lifecycle.cAll(this._callOnDispose);
	}
}

export class Separator extends Action {

	public static ID = 'actions.monaco.separator';

	constructor(label?: string, order?) {
		super(Separator.ID, label, label ? 'separator text' : 'separator');
		this.checked = false;
		this.enabled = false;
		this.order = order;
	}
}

export interface IActionItemOptions {
	icon?: boolean;
	label?: boolean;
	keybinding?: string;
}

export class ActionItem extends BaseActionItem {

	$e: Builder;
	private cssClass: string;
	private options: IActionItemOptions;

	constructor(context: any, action: IAction, options: IActionItemOptions = {}) {
		super(context, action);

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
				title = nls.localize('titleLabel', "{0} ({1})", title, this.options.keybinding);
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
}

export class ProgressItem extends BaseActionItem {

	public render(parent: HTMLElement): void {

		let container = document.createElement('div');
		$(container).addClass('progress-item');

		let label = document.createElement('div');
		$(label).addClass('label');
		label.textContent = this.getAction().label;
		label.title = this.getAction().label;
		super.render(label);

		let progress = document.createElement('div');
		progress.textContent = '\u2026';
		$(progress).addClass('tag', 'progress');

		let done = document.createElement('div');
		done.textContent = '\u2713';
		$(done).addClass('tag', 'done');

		let error = document.createElement('div');
		error.textContent = '!';
		$(error).addClass('tag', 'error');

		this.callOnDispose.push(this.addListener(CommonEventType.BEFORE_RUN, () => {
			$(progress).addClass('active');
			$(done).removeClass('active');
			$(error).removeClass('active');
		}));

		this.callOnDispose.push(this.addListener(CommonEventType.RUN, (result) => {
			$(progress).removeClass('active');
			if (result.error) {
				$(done).removeClass('active');
				$(error).addClass('active');
			} else {
				$(error).removeClass('active');
				$(done).addClass('active');
			}
		}));

		container.appendChild(label);
		container.appendChild(progress);
		container.appendChild(done);
		container.appendChild(error);
		parent.appendChild(container);
	}

	public dispose(): void {
		lifecycle.cAll(this.callOnDispose);
		super.dispose();
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

	constructor(container: HTMLElement, options?: IActionBarOptions);
	constructor(container: Builder, options?: IActionBarOptions);
	constructor(container: any, options: IActionBarOptions = defaultOptions) {
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

		let isVertical = this.options.orientation === ActionsOrientation.VERTICAL;
		if (isVertical) {
			this.domNode.className += ' vertical';
		}

		$(this.domNode).on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			let eventHandled = true;

			if (event.equals(isVertical ? CommonKeybindings.UP_ARROW : CommonKeybindings.LEFT_ARROW)) {
				this.focusPrevious();
			} else if (event.equals(isVertical ? CommonKeybindings.DOWN_ARROW : CommonKeybindings.RIGHT_ARROW)) {
				this.focusNext();
			} else if (event.equals(CommonKeybindings.ESCAPE)) {
				this.cancel();
			} else if (event.equals(CommonKeybindings.ENTER) || event.equals(CommonKeybindings.SPACE)) {
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
			if (event.equals(CommonKeybindings.ENTER) || event.equals(CommonKeybindings.SPACE)) {
				this.doTrigger(event);
				event.preventDefault();
				event.stopPropagation();
			}

			// Recompute focused item
			else if (event.equals(CommonKeybindings.TAB) || event.equals(CommonKeybindings.SHIFT_TAB)) {
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

		container = (container instanceof Builder) ? container.getHTMLElement() : container;
		container.appendChild(this.domNode);
	}

	public setAriaLabel(label: string): void {
		if (label) {
			this.actionsList.setAttribute('aria-label', label);
		} else{
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

	public push(actions: IAction, options?: IActionOptions): void;
	public push(actions: IAction[], options?: IActionOptions): void;
	public push(actions: any, options: IActionOptions = {}): void {
		if (!Array.isArray(actions)) {
			actions = [actions];
		}

		let index = types.isNumber(options.index) ? options.index : null;

		actions.forEach((action: IAction) => {
			let actionItemElement = document.createElement('li');
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
			this.addEmitter(item);
			item.render(actionItemElement);

			if (index === null || index < 0 || index >= this.actionsList.children.length) {
				this.actionsList.appendChild(actionItemElement);
			} else {
				this.actionsList.insertBefore(actionItemElement, this.actionsList.children[index++]);
			}

			this.items.push(item);
		});
	}

	public clear(): void {
		let item: IActionItem;
		while (item = this.items.pop()) {
			item.dispose();
		}
		$(this.actionsList).empty();
	}

	public length(): number {
		return this.items.length;
	}

	public isEmpty(): boolean {
		return this.items.length === 0;
	}

	public onContentsChange(): void {
		this.emit(CommonEventType.CONTENTS_CHANGED);
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

		this.updateFocus();
	}

	private updateFocus(): void {
		if (typeof this.focusedItem === 'undefined') {
			this.domNode.focus();
			return;
		}

		for (let i = 0; i < this.items.length; i++) {
			let item = this.items[i];

			let actionItem = <any>item;

			if (i === this.focusedItem) {
				if (types.isFunction(actionItem.focus)) {
					actionItem.focus();
				}
			} else {
				if (types.isFunction(actionItem.blur)) {
					actionItem.blur();
				}
			}
		}
	}

	private doTrigger(event): void {
		if (typeof this.focusedItem === 'undefined') {
			return; //nothing to focus
		}

		// trigger action
		let actionItem = (<BaseActionItem>this.items[this.focusedItem]);
		this.run(actionItem._action, actionItem._context || event).done();
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
			this.clear();
		}
		this.items = null;

		if (this.focusTracker) {
			this.focusTracker.dispose();
			this.focusTracker = null;
		}

		this.toDispose = lifecycle.disposeAll(this.toDispose);

		this.getContainer().destroy();

		super.dispose();
	}
}

export class SelectActionItem extends BaseActionItem {
	private select: HTMLSelectElement;
	private options: string[];
	private selected: number;
	protected toDispose: lifecycle.IDisposable[];

	constructor(ctx: any, action: IAction, options: string[], selected: number) {
		super(ctx, action);

		this.select = document.createElement('select');
		this.select.className = 'action-bar-select';

		this.options = options;
		this.selected = selected;

		this.toDispose = [];

		this.registerListeners();
	}

	public setOptions(options: string[], selected: number): void {
		this.options = options;
		this.selected = selected;

		this.doSetOptions();
	}

	private registerListeners(): void {
		this.toDispose.push(DOM.addStandardDisposableListener(this.select, 'change', (e) => {
			this.actionRunner.run(this._action, e.target.value).done();
		}));
	}

	public focus(): void {
		if (this.select) {
			this.select.focus();
		}
	}

	public blur(): void {
		if (this.select) {
			this.select.blur();
		}
	}

	public render(container: HTMLElement): void {
		DOM.addClass(container, 'select-container');
		container.appendChild(this.select);
		this.doSetOptions();
	}

	private doSetOptions(): void {
		this.select.options.length = 0;

		this.options.forEach((option) => {
			this.select.add(this.createOption(option));
		});

		if (this.selected >= 0) {
			this.select.selectedIndex = this.selected;
		}
	}

	private createOption(value: string): HTMLOptionElement {
		let option = document.createElement('option');
		option.value = value;
		option.text = value;

		return option;
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		super.dispose();
	}
}