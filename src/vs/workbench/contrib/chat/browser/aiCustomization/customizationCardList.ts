/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';

const $ = DOM.$;

export interface ICustomizationCardListItem {
	readonly row: HTMLElement;
	readonly primaryAction: HTMLElement;
	readonly label: string;
	readonly actions?: readonly HTMLElement[];
	readonly contextMenuAction?: HTMLElement;
}

interface ICardListItem extends ICustomizationCardListItem {
	readonly actions: readonly HTMLElement[];
	actionsTabbable: boolean;
}

export function createCustomizationCardPrimaryAction(parent: HTMLElement, ariaLabel: string, ...classNames: string[]): HTMLButtonElement {
	const button = DOM.append(parent, $('button.customization-card-primary-action')) as HTMLButtonElement;
	button.type = 'button';
	button.setAttribute('aria-label', ariaLabel);
	button.classList.add(...classNames);
	return button;
}

export class CustomizationCardListController extends Disposable {

	private readonly items: ICardListItem[] = [];
	private readonly typeAheadReset = this._register(new MutableDisposable());
	private typeAhead = '';

	constructor(
		container: HTMLElement,
		ariaLabel: string,
	) {
		super();
		container.setAttribute('role', 'list');
		container.setAttribute('aria-label', ariaLabel);
	}

	addItem(item: ICustomizationCardListItem): void {
		const entry: ICardListItem = {
			...item,
			actions: item.actions ?? [],
			actionsTabbable: false,
		};
		this.items.push(entry);
		entry.row.setAttribute('role', 'listitem');
		entry.row.setAttribute('aria-posinset', String(this.items.length));
		entry.primaryAction.tabIndex = this.items.length === 1 ? 0 : -1;
		this.setActionsTabbable(entry, false);

		this._register(DOM.addDisposableListener(entry.primaryAction, 'focus', () => this.setActiveItem(entry)));
		this._register(DOM.addDisposableListener(entry.primaryAction, 'keydown', event => this.onPrimaryActionKeyDown(entry, event)));
		for (const action of entry.actions) {
			const mutationDisposables = this._register(new DisposableStore());
			this._register(DOM.sharedMutationObserver.observe(action, mutationDisposables, {
				attributes: true,
				attributeFilter: ['aria-disabled', 'disabled', 'style', 'tabindex'],
			})(() => this.updateActionTabIndex(entry, action)));
			this._register(DOM.addDisposableListener(action, 'focus', () => {
				this.setActiveItem(entry);
				this.setActionsTabbable(entry, true);
			}));
			this._register(DOM.addDisposableListener(action, 'keydown', event => {
				const focusableActions = this.getFocusableActions(entry);
				if (event.key === 'Tab' && event.shiftKey && action === focusableActions[0]) {
					event.preventDefault();
					this.setActionsTabbable(entry, false);
					entry.primaryAction.focus();
				} else if (event.key === 'Tab' && !event.shiftKey && action === focusableActions.at(-1)) {
					this.setActionsTabbable(entry, false);
				}
			}));
			this._register(DOM.addDisposableListener(action, 'blur', () => {
				DOM.getWindow(entry.row).queueMicrotask(() => {
					if (!entry.row.contains(entry.row.ownerDocument.activeElement)) {
						this.setActionsTabbable(entry, false);
					}
				});
			}));
		}

	}

	finalize(): void {
		const setSize = String(this.items.length);
		for (const item of this.items) {
			item.row.setAttribute('aria-setsize', setSize);
		}
	}

	private onPrimaryActionKeyDown(entry: ICardListItem, event: KeyboardEvent): void {
		if (event.target !== entry.primaryAction) {
			return;
		}
		const index = this.items.indexOf(entry);
		switch (event.key) {
			case 'ArrowDown':
				this.focusItem(Math.min(index + 1, this.items.length - 1));
				break;
			case 'ArrowUp':
				this.focusItem(Math.max(index - 1, 0));
				break;
			case 'Home':
				this.focusItem(0);
				break;
			case 'End':
				this.focusItem(this.items.length - 1);
				break;
			case 'Tab': {
				const firstAction = this.getFocusableActions(entry)[0];
				if (!event.shiftKey && firstAction) {
					event.preventDefault();
					this.setActionsTabbable(entry, true);
					firstAction.focus();
				}
				return;
			}
			case 'ContextMenu':
				if (entry.contextMenuAction) {
					event.preventDefault();
					entry.contextMenuAction.click();
				}
				return;
			case 'F10':
				if (event.shiftKey && entry.contextMenuAction) {
					event.preventDefault();
					entry.contextMenuAction.click();
				}
				return;
			default:
				if (event.key !== ' ' && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
					this.runTypeAhead(entry, event.key);
					event.preventDefault();
				}
				return;
		}
		event.preventDefault();
	}

	private runTypeAhead(current: ICardListItem, key: string): void {
		this.typeAhead += key.toLocaleLowerCase();
		this.typeAheadReset.value = disposableTimeout(() => this.typeAhead = '', 800);
		const start = this.items.indexOf(current) + 1;
		const ordered = [...this.items.slice(start), ...this.items.slice(0, start)];
		const match = ordered.find(item => item.label.toLocaleLowerCase().startsWith(this.typeAhead));
		if (match) {
			this.setActiveItem(match);
			match.primaryAction.focus();
		}
	}

	private focusItem(index: number): void {
		const item = this.items[index];
		if (item) {
			this.setActiveItem(item);
			item.primaryAction.focus();
		}
	}

	private setActiveItem(active: ICardListItem): void {
		for (const item of this.items) {
			item.primaryAction.tabIndex = item === active ? 0 : -1;
			if (item !== active) {
				this.setActionsTabbable(item, false);
			}
		}
	}

	private setActionsTabbable(item: ICardListItem, tabbable: boolean): void {
		item.actionsTabbable = tabbable;
		for (const action of item.actions) {
			this.updateActionTabIndex(item, action);
		}
	}

	private updateActionTabIndex(item: ICardListItem, action: HTMLElement): void {
		const tabIndex = item.actionsTabbable && this.isFocusableAction(action) ? 0 : -1;
		if (action.tabIndex !== tabIndex) {
			action.tabIndex = tabIndex;
		}
	}

	private getFocusableActions(item: ICardListItem): readonly HTMLElement[] {
		return item.actions.filter(action => this.isFocusableAction(action));
	}

	private isFocusableAction(action: HTMLElement): boolean {
		return action.style.display !== 'none' && action.getAttribute('aria-disabled') !== 'true' && !action.matches(':disabled');
	}

}
