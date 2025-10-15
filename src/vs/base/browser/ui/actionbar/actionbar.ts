/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } from './actionViewItems.js';
import { createInstantHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { ActionRunner, IAction, IActionRunner, IRunEvent, Separator } from '../../../common/actions.js';
import { Emitter } from '../../../common/event.js';
import { KeyCode, KeyMod } from '../../../common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, dispose, IDisposable } from '../../../common/lifecycle.js';
import * as types from '../../../common/types.js';
import './actionbar.css';

export interface IActionViewItem extends IDisposable {
	action: IAction;
	actionRunner: IActionRunner;
	setActionContext(context: unknown): void;
	render(element: HTMLElement): void;
	isEnabled(): boolean;
	focus(fromRight?: boolean): void; // TODO@isidorn what is this?
	blur(): void;
	showHover?(): void;
}

export interface IActionViewItemProvider {
	(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined;
}

export const enum ActionsOrientation {
	HORIZONTAL,
	VERTICAL,
}

export interface ActionTrigger {
	keys?: KeyCode[];
	keyDown: boolean;
}

export interface IActionBarOptions {
	readonly orientation?: ActionsOrientation;
	readonly context?: unknown;
	readonly actionViewItemProvider?: IActionViewItemProvider;
	readonly actionRunner?: IActionRunner;
	readonly ariaLabel?: string;
	readonly ariaRole?: string;
	readonly triggerKeys?: ActionTrigger;
	readonly allowContextMenu?: boolean;
	readonly preventLoopNavigation?: boolean;
	readonly focusOnlyEnabledItems?: boolean;
	readonly hoverDelegate?: IHoverDelegate;
	/**
	 * If true, toggled primary items are highlighted with a background color.
	 * Some action bars exclusively use icon states, we don't want to enable this for them.
	 * Thus, this is opt-in.
	 */
	readonly highlightToggledItems?: boolean;
}

export interface IActionOptions extends IActionViewItemOptions {
	index?: number;
}

export class ActionBar extends Disposable implements IActionRunner {

	private readonly options: IActionBarOptions;
	private readonly _hoverDelegate: IHoverDelegate;

	private _actionRunner: IActionRunner;
	private readonly _actionRunnerDisposables = this._register(new DisposableStore());
	private _context: unknown;
	private readonly _orientation: ActionsOrientation;
	private readonly _triggerKeys: {
		keys: KeyCode[];
		keyDown: boolean;
	};

	// View Items
	viewItems: IActionViewItem[];
	private readonly viewItemDisposables = this._register(new DisposableMap<IActionViewItem>());
	private previouslyFocusedItem?: number;
	protected focusedItem?: number;
	private focusTracker: DOM.IFocusTracker;

	// Trigger Key Tracking
	private triggerKeyDown: boolean = false;

	private focusable: boolean = true;

	// Elements
	domNode: HTMLElement;
	protected readonly actionsList: HTMLElement;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	get onDidBlur() { return this._onDidBlur.event; }

	private readonly _onDidCancel = this._register(new Emitter<void>({ onWillAddFirstListener: () => this.cancelHasListener = true }));
	get onDidCancel() { return this._onDidCancel.event; }
	private cancelHasListener = false;

	private readonly _onDidRun = this._register(new Emitter<IRunEvent>());
	get onDidRun() { return this._onDidRun.event; }

	private readonly _onWillRun = this._register(new Emitter<IRunEvent>());
	get onWillRun() { return this._onWillRun.event; }

	constructor(container: HTMLElement, options: IActionBarOptions = {}) {
		super();

		this.options = options;
		this._context = options.context ?? null;
		this._orientation = this.options.orientation ?? ActionsOrientation.HORIZONTAL;
		this._triggerKeys = {
			keyDown: this.options.triggerKeys?.keyDown ?? false,
			keys: this.options.triggerKeys?.keys ?? [KeyCode.Enter, KeyCode.Space]
		};

		this._hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());

		if (this.options.actionRunner) {
			this._actionRunner = this.options.actionRunner;
		} else {
			this._actionRunner = new ActionRunner();
			this._actionRunnerDisposables.add(this._actionRunner);
		}

		this._actionRunnerDisposables.add(this._actionRunner.onDidRun(e => this._onDidRun.fire(e)));
		this._actionRunnerDisposables.add(this._actionRunner.onWillRun(e => this._onWillRun.fire(e)));

		this.viewItems = [];
		this.focusedItem = undefined;

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-action-bar';

		let previousKeys: KeyCode[];
		let nextKeys: KeyCode[];

		switch (this._orientation) {
			case ActionsOrientation.HORIZONTAL:
				previousKeys = [KeyCode.LeftArrow];
				nextKeys = [KeyCode.RightArrow];
				break;
			case ActionsOrientation.VERTICAL:
				previousKeys = [KeyCode.UpArrow];
				nextKeys = [KeyCode.DownArrow];
				this.domNode.className += ' vertical';
				break;
		}

		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = true;
			const focusedItem = typeof this.focusedItem === 'number' ? this.viewItems[this.focusedItem] : undefined;

			if (previousKeys && (event.equals(previousKeys[0]) || event.equals(previousKeys[1]))) {
				eventHandled = this.focusPrevious();
			} else if (nextKeys && (event.equals(nextKeys[0]) || event.equals(nextKeys[1]))) {
				eventHandled = this.focusNext();
			} else if (event.equals(KeyCode.Escape) && this.cancelHasListener) {
				this._onDidCancel.fire();
			} else if (event.equals(KeyCode.Home)) {
				eventHandled = this.focusFirst();
			} else if (event.equals(KeyCode.End)) {
				eventHandled = this.focusLast();
			} else if (event.equals(KeyCode.Tab) && focusedItem instanceof BaseActionViewItem && focusedItem.trapsArrowNavigation) {
				// Tab, so forcibly focus next #219199
				eventHandled = this.focusNext(undefined, true);
			} else if (this.isTriggerKeyEvent(event)) {
				// Staying out of the else branch even if not triggered
				if (this._triggerKeys.keyDown) {
					this.doTrigger(event);
				} else {
					this.triggerKeyDown = true;
				}
			} else {
				eventHandled = false;
			}

			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_UP, e => {
			const event = new StandardKeyboardEvent(e);

			// Run action on Enter/Space
			if (this.isTriggerKeyEvent(event)) {
				if (!this._triggerKeys.keyDown && this.triggerKeyDown) {
					this.triggerKeyDown = false;
					this.doTrigger(event);
				}

				event.preventDefault();
				event.stopPropagation();
			}

			// Recompute focused item
			else if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab) || event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow) || event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) {
				this.updateFocusedItem();
			}
		}));

		this.focusTracker = this._register(DOM.trackFocus(this.domNode));
		this._register(this.focusTracker.onDidBlur(() => {
			if (DOM.getActiveElement() === this.domNode || !DOM.isAncestor(DOM.getActiveElement(), this.domNode)) {
				this._onDidBlur.fire();
				this.previouslyFocusedItem = this.focusedItem;
				this.focusedItem = undefined;
				this.triggerKeyDown = false;
			}
		}));

		this._register(this.focusTracker.onDidFocus(() => this.updateFocusedItem()));

		this.actionsList = document.createElement('ul');
		this.actionsList.className = 'actions-container';
		if (this.options.highlightToggledItems) {
			this.actionsList.classList.add('highlight-toggled');
		}
		this.actionsList.setAttribute('role', this.options.ariaRole || 'toolbar');

		if (this.options.ariaLabel) {
			this.actionsList.setAttribute('aria-label', this.options.ariaLabel);
		}

		this.domNode.appendChild(this.actionsList);

		container.appendChild(this.domNode);
	}

	private refreshRole(): void {
		if (this.length() >= 1) {
			this.actionsList.setAttribute('role', this.options.ariaRole || 'toolbar');
		} else {
			this.actionsList.setAttribute('role', 'presentation');
		}
	}

	setAriaLabel(label: string): void {
		if (label) {
			this.actionsList.setAttribute('aria-label', label);
		} else {
			this.actionsList.removeAttribute('aria-label');
		}
	}

	// Some action bars should not be focusable at times
	// When an action bar is not focusable make sure to make all the elements inside it not focusable
	// When an action bar is focusable again, make sure the first item can be focused
	setFocusable(focusable: boolean): void {
		this.focusable = focusable;
		if (this.focusable) {
			const firstEnabled = this.viewItems.find(vi => vi instanceof BaseActionViewItem && vi.isEnabled());
			if (firstEnabled instanceof BaseActionViewItem) {
				firstEnabled.setFocusable(true);
			}
		} else {
			this.viewItems.forEach(vi => {
				if (vi instanceof BaseActionViewItem) {
					vi.setFocusable(false);
				}
			});
		}
	}

	private isTriggerKeyEvent(event: StandardKeyboardEvent): boolean {
		let ret = false;
		this._triggerKeys.keys.forEach(keyCode => {
			ret = ret || event.equals(keyCode);
		});

		return ret;
	}

	private updateFocusedItem(): void {
		for (let i = 0; i < this.actionsList.children.length; i++) {
			const elem = this.actionsList.children[i];
			if (DOM.isAncestor(DOM.getActiveElement(), elem)) {
				this.focusedItem = i;
				this.viewItems[this.focusedItem]?.showHover?.();
				break;
			}
		}
	}

	get context(): unknown {
		return this._context;
	}

	set context(context: unknown) {
		this._context = context;
		this.viewItems.forEach(i => i.setActionContext(context));
	}

	get actionRunner(): IActionRunner {
		return this._actionRunner;
	}

	set actionRunner(actionRunner: IActionRunner) {
		this._actionRunner = actionRunner;

		// when setting a new `IActionRunner` make sure to dispose old listeners and
		// start to forward events from the new listener
		this._actionRunnerDisposables.clear();
		this._actionRunnerDisposables.add(this._actionRunner.onDidRun(e => this._onDidRun.fire(e)));
		this._actionRunnerDisposables.add(this._actionRunner.onWillRun(e => this._onWillRun.fire(e)));
		this.viewItems.forEach(item => item.actionRunner = actionRunner);
	}

	getContainer(): HTMLElement {
		return this.domNode;
	}

	hasAction(action: IAction): boolean {
		return this.viewItems.findIndex(candidate => candidate.action.id === action.id) !== -1;
	}

	getAction(indexOrElement: number | HTMLElement): IAction | undefined {

		// by index
		if (typeof indexOrElement === 'number') {
			return this.viewItems[indexOrElement]?.action;
		}

		// by element
		if (DOM.isHTMLElement(indexOrElement)) {
			while (indexOrElement.parentElement !== this.actionsList) {
				if (!indexOrElement.parentElement) {
					return undefined;
				}
				indexOrElement = indexOrElement.parentElement;
			}
			for (let i = 0; i < this.actionsList.childNodes.length; i++) {
				if (this.actionsList.childNodes[i] === indexOrElement) {
					return this.viewItems[i].action;
				}
			}
		}

		return undefined;
	}

	push(arg: IAction | ReadonlyArray<IAction>, options: IActionOptions = {}): void {
		const actions: ReadonlyArray<IAction> = Array.isArray(arg) ? arg : [arg];

		let index = types.isNumber(options.index) ? options.index : null;

		actions.forEach((action: IAction) => {
			const actionViewItemElement = document.createElement('li');
			actionViewItemElement.className = 'action-item';
			actionViewItemElement.setAttribute('role', 'presentation');

			let item: IActionViewItem | undefined;

			const viewItemOptions: IActionViewItemOptions = { hoverDelegate: this._hoverDelegate, ...options, isTabList: this.options.ariaRole === 'tablist' };
			if (this.options.actionViewItemProvider) {
				item = this.options.actionViewItemProvider(action, viewItemOptions);
			}

			if (!item) {
				item = new ActionViewItem(this.context, action, viewItemOptions);
			}

			// Prevent native context menu on actions
			if (!this.options.allowContextMenu) {
				this.viewItemDisposables.set(item, DOM.addDisposableListener(actionViewItemElement, DOM.EventType.CONTEXT_MENU, (e: DOM.EventLike) => {
					DOM.EventHelper.stop(e, true);
				}));
			}

			item.actionRunner = this._actionRunner;
			item.setActionContext(this.context);
			item.render(actionViewItemElement);

			if (index === null || index < 0 || index >= this.actionsList.children.length) {
				this.actionsList.appendChild(actionViewItemElement);
				this.viewItems.push(item);
			} else {
				this.actionsList.insertBefore(actionViewItemElement, this.actionsList.children[index]);
				this.viewItems.splice(index, 0, item);
				index++;
			}
		});

		// We need to allow for the first enabled item to be focused on using tab navigation #106441
		if (this.focusable) {
			let didFocus = false;
			for (const item of this.viewItems) {
				if (!(item instanceof BaseActionViewItem)) {
					continue;
				}

				let focus: boolean;
				if (didFocus) {
					focus = false; // already focused an item
				} else if (item.action.id === Separator.ID) {
					focus = false; // never focus a separator
				} else if (!item.isEnabled() && this.options.focusOnlyEnabledItems) {
					focus = false; // never focus a disabled item
				} else {
					focus = true;
				}

				if (focus) {
					item.setFocusable(true);
					didFocus = true;
				} else {
					item.setFocusable(false);
				}
			}
		}

		if (typeof this.focusedItem === 'number') {
			// After a clear actions might be re-added to simply toggle some actions. We should preserve focus #97128
			this.focus(this.focusedItem);
		}
		this.refreshRole();
	}

	getWidth(index: number): number {
		if (index >= 0 && index < this.actionsList.children.length) {
			const item = this.actionsList.children.item(index);
			if (item) {
				return item.clientWidth;
			}
		}

		return 0;
	}

	getHeight(index: number): number {
		if (index >= 0 && index < this.actionsList.children.length) {
			const item = this.actionsList.children.item(index);
			if (item) {
				return item.clientHeight;
			}
		}

		return 0;
	}

	pull(index: number): void {
		if (index >= 0 && index < this.viewItems.length) {
			this.actionsList.childNodes[index].remove();
			this.viewItemDisposables.deleteAndDispose(this.viewItems[index]);
			dispose(this.viewItems.splice(index, 1));
			this.refreshRole();
		}
	}

	clear(): void {
		if (this.isEmpty()) {
			return;
		}

		this.viewItems = dispose(this.viewItems);
		this.viewItemDisposables.clearAndDisposeAll();
		DOM.clearNode(this.actionsList);
		this.refreshRole();
	}

	length(): number {
		return this.viewItems.length;
	}

	isEmpty(): boolean {
		return this.viewItems.length === 0;
	}

	focus(index?: number): void;
	focus(selectFirst?: boolean): void;
	focus(arg?: number | boolean): void {
		let selectFirst: boolean = false;
		let index: number | undefined = undefined;
		if (arg === undefined) {
			selectFirst = true;
		} else if (typeof arg === 'number') {
			index = arg;
		} else if (typeof arg === 'boolean') {
			selectFirst = arg;
		}

		if (selectFirst && typeof this.focusedItem === 'undefined') {
			const firstEnabled = this.viewItems.findIndex(item => item.isEnabled());
			// Focus the first enabled item
			this.focusedItem = firstEnabled === -1 ? undefined : firstEnabled;
			this.updateFocus(undefined, undefined, true);
		} else {
			if (index !== undefined) {
				this.focusedItem = index;
			}

			this.updateFocus(undefined, undefined, true);
		}
	}

	private focusFirst(): boolean {
		this.focusedItem = this.length() - 1;
		return this.focusNext(true);
	}

	private focusLast(): boolean {
		this.focusedItem = 0;
		return this.focusPrevious(true);
	}

	protected focusNext(forceLoop?: boolean, forceFocus?: boolean): boolean {
		if (typeof this.focusedItem === 'undefined') {
			this.focusedItem = this.viewItems.length - 1;
		} else if (this.viewItems.length <= 1) {
			return false;
		}

		const startIndex = this.focusedItem;
		let item: IActionViewItem;
		do {

			if (!forceLoop && this.options.preventLoopNavigation && this.focusedItem + 1 >= this.viewItems.length) {
				this.focusedItem = startIndex;
				return false;
			}

			this.focusedItem = (this.focusedItem + 1) % this.viewItems.length;
			item = this.viewItems[this.focusedItem];
		} while (this.focusedItem !== startIndex && ((this.options.focusOnlyEnabledItems && !item.isEnabled()) || item.action.id === Separator.ID));

		this.updateFocus(undefined, undefined, forceFocus);
		return true;
	}

	protected focusPrevious(forceLoop?: boolean): boolean {
		if (typeof this.focusedItem === 'undefined') {
			this.focusedItem = 0;
		} else if (this.viewItems.length <= 1) {
			return false;
		}

		const startIndex = this.focusedItem;
		let item: IActionViewItem;

		do {
			this.focusedItem = this.focusedItem - 1;
			if (this.focusedItem < 0) {
				if (!forceLoop && this.options.preventLoopNavigation) {
					this.focusedItem = startIndex;
					return false;
				}

				this.focusedItem = this.viewItems.length - 1;
			}
			item = this.viewItems[this.focusedItem];
		} while (this.focusedItem !== startIndex && ((this.options.focusOnlyEnabledItems && !item.isEnabled()) || item.action.id === Separator.ID));


		this.updateFocus(true);
		return true;
	}

	protected updateFocus(fromRight?: boolean, preventScroll?: boolean, forceFocus: boolean = false): void {
		if (typeof this.focusedItem === 'undefined') {
			this.actionsList.focus({ preventScroll });
		}

		if (this.previouslyFocusedItem !== undefined && this.previouslyFocusedItem !== this.focusedItem) {
			this.viewItems[this.previouslyFocusedItem]?.blur();
		}
		const actionViewItem = this.focusedItem !== undefined ? this.viewItems[this.focusedItem] : undefined;
		if (actionViewItem) {
			let focusItem = true;

			if (!types.isFunction(actionViewItem.focus)) {
				focusItem = false;
			}

			if (this.options.focusOnlyEnabledItems && types.isFunction(actionViewItem.isEnabled) && !actionViewItem.isEnabled()) {
				focusItem = false;
			}

			if (actionViewItem.action.id === Separator.ID) {
				focusItem = false;
			}
			if (!focusItem) {
				this.actionsList.focus({ preventScroll });
				this.previouslyFocusedItem = undefined;
			} else if (forceFocus || this.previouslyFocusedItem !== this.focusedItem) {
				actionViewItem.focus(fromRight);
				this.previouslyFocusedItem = this.focusedItem;
			}
			if (focusItem) {
				actionViewItem.showHover?.();
			}
		}
	}

	private doTrigger(event: StandardKeyboardEvent): void {
		if (typeof this.focusedItem === 'undefined') {
			return; //nothing to focus
		}

		// trigger action
		const actionViewItem = this.viewItems[this.focusedItem];
		if (actionViewItem instanceof BaseActionViewItem) {
			const context = (actionViewItem._context === null || actionViewItem._context === undefined) ? event : actionViewItem._context;
			this.run(actionViewItem._action, context);
		}
	}

	async run(action: IAction, context?: unknown): Promise<void> {
		await this._actionRunner.run(action, context);
	}

	override dispose(): void {
		this._context = undefined;
		this.viewItems = dispose(this.viewItems);
		this.getContainer().remove();
		super.dispose();
	}
}

export function prepareActions(actions: IAction[]): IAction[] {
	if (!actions.length) {
		return actions;
	}

	// Clean up leading separators
	let firstIndexOfAction = -1;
	for (let i = 0; i < actions.length; i++) {
		if (actions[i].id === Separator.ID) {
			continue;
		}

		firstIndexOfAction = i;
		break;
	}

	if (firstIndexOfAction === -1) {
		return [];
	}

	actions = actions.slice(firstIndexOfAction);

	// Clean up trailing separators
	for (let h = actions.length - 1; h >= 0; h--) {
		const isSeparator = actions[h].id === Separator.ID;
		if (isSeparator) {
			actions.splice(h, 1);
		} else {
			break;
		}
	}

	// Clean up separator duplicates
	let foundAction = false;
	for (let k = actions.length - 1; k >= 0; k--) {
		const isSeparator = actions[k].id === Separator.ID;
		if (isSeparator && !foundAction) {
			actions.splice(k, 1);
		} else if (!isSeparator) {
			foundAction = true;
		} else if (isSeparator) {
			foundAction = false;
		}
	}

	return actions;
}
