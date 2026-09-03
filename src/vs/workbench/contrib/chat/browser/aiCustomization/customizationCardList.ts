/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';

const $ = DOM.$;
let collapsibleSectionIdPool = 0;

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

export function setupCollapsibleSection(
	headingRow: HTMLElement,
	content: HTMLElement,
	label: string,
	disposables: DisposableStore,
	initiallyCollapsed: boolean,
	onDidChange: (collapsed: boolean) => void,
): HTMLButtonElement {
	const toggle = $('.customization-section-toggle') as HTMLButtonElement;
	toggle.type = 'button';
	headingRow.prepend(toggle);
	content.id ||= `customization-section-content-${++collapsibleSectionIdPool}`;
	toggle.setAttribute('aria-controls', content.id);

	let collapsed = initiallyCollapsed;
	const expandedDisplay = content.style.display;
	const update = () => {
		toggle.className = 'customization-section-toggle';
		toggle.classList.add(...ThemeIcon.asClassName(collapsed ? Codicon.chevronRight : Codicon.chevronDown).split(' '));
		toggle.setAttribute('aria-expanded', String(!collapsed));
		toggle.setAttribute('aria-label', collapsed
			? localize('expandCustomizationSection', "Expand {0}", label)
			: localize('collapseCustomizationSection', "Collapse {0}", label));
		content.hidden = collapsed;
		content.style.display = collapsed ? 'none' : expandedDisplay;
	};
	update();

	disposables.add(DOM.addDisposableListener(toggle, DOM.EventType.CLICK, event => {
		DOM.EventHelper.stop(event, true);
		collapsed = !collapsed;
		update();
		onDidChange(collapsed);
	}));
	return toggle;
}

export interface IVirtualizedSectionLayout {
	readonly container: HTMLElement;
	readonly contentHeight: number;
	readonly minimumHeight: number;
}

export function renderVirtualizedSectionLoadingPlaceholder(container: HTMLElement, label: string, height: number): HTMLElement {
	const placeholder = DOM.append(container, $('.virtualized-section-loading'));
	placeholder.style.height = `${height}px`;
	placeholder.textContent = label;
	return placeholder;
}

export interface IVirtualizedSectionList {
	scrollTop: number;
	layout(height: number, width?: number): void;
}

export function layoutVirtualizedSectionList(list: IVirtualizedSectionList, container: HTMLElement, height: number, width?: number): void {
	if (height === 0) {
		container.style.height = '0px';
		return;
	}

	const scrollTop = list.scrollTop;
	container.style.height = `${height}px`;
	list.layout(height, width);
	list.scrollTop = scrollTop;
}

export function setVirtualizedRowActionsTabbable(container: HTMLElement, tabbable: boolean): void {
	const visit = (element: Element): void => {
		if (DOM.isHTMLElement(element)) {
			const role = element.getAttribute('role');
			const isAction = DOM.isHTMLButtonElement(element)
				|| DOM.isHTMLAnchorElement(element) && element.hasAttribute('href')
				|| role === 'button'
				|| role === 'switch'
				|| role === 'checkbox'
				|| role === 'menuitem';
			if (isAction) {
				const disabled = DOM.isHTMLButtonElement(element) && element.disabled || element.getAttribute('aria-disabled') === 'true';
				element.tabIndex = tabbable && !disabled ? 0 : -1;
			}
		}
		for (const child of element.children) {
			visit(child);
		}
	};
	visit(container);
}

export function layoutVirtualizedSections(root: HTMLElement, sections: readonly IVirtualizedSectionLayout[]): readonly number[] {
	const visibleSections = sections.filter(section => !section.container.hidden);
	const availableRootHeight = root.clientHeight;
	if (availableRootHeight <= 0) {
		root.classList.remove('virtualized-section-layout-overflow');
		root.style.overflow = '';
		return sections.map(section => section.container.hidden ? 0 : section.contentHeight);
	}

	const targetWindow = DOM.getWindow(root);
	const rootStyle = targetWindow.getComputedStyle(root);
	let fixedHeight = (parseFloat(rootStyle.paddingTop) || 0) + (parseFloat(rootStyle.paddingBottom) || 0);
	const children = Array.from(root.children) as HTMLElement[];
	const rowGap = parseFloat(rootStyle.rowGap) || 0;
	fixedHeight += Math.max(0, children.length - 1) * rowGap;

	for (const child of children) {
		const childStyle = targetWindow.getComputedStyle(child);
		let childHeight = child.offsetHeight + (parseFloat(childStyle.marginTop) || 0) + (parseFloat(childStyle.marginBottom) || 0);
		for (const section of visibleSections) {
			if (child === section.container || child.contains(section.container)) {
				childHeight -= section.container.clientHeight || section.container.offsetHeight;
			}
		}
		fixedHeight += childHeight;
	}

	const availableListHeightBeforeMinimums = availableRootHeight - fixedHeight;
	const availableListHeight = Math.max(0, availableListHeightBeforeMinimums);
	const allocations = new Map<IVirtualizedSectionLayout, number>();
	const minimumAllocations = new Map(visibleSections.map(section => [
		section,
		Math.min(section.contentHeight, section.minimumHeight),
	]));
	const minimumListHeight = visibleSections.reduce((height, section) => height + minimumAllocations.get(section)!, 0);
	const requiresPageScroll = minimumListHeight - availableListHeightBeforeMinimums > 1;
	root.classList.toggle('virtualized-section-layout-overflow', requiresPageScroll);
	root.style.overflow = requiresPageScroll ? 'visible' : '';
	if (availableListHeight <= minimumListHeight) {
		return sections.map(section => section.container.hidden ? 0 : minimumAllocations.get(section) ?? 0);
	}

	for (const section of visibleSections) {
		allocations.set(section, minimumAllocations.get(section)!);
	}
	let remainingHeight = availableListHeight - minimumListHeight;
	let remainingSections = visibleSections.filter(section => section.contentHeight > minimumAllocations.get(section)!);
	while (remainingSections.length > 0) {
		const equalShare = remainingHeight / remainingSections.length;
		const completed = remainingSections.filter(section => section.contentHeight - allocations.get(section)! <= equalShare);
		if (completed.length === 0) {
			for (const section of remainingSections) {
				allocations.set(section, allocations.get(section)! + equalShare);
			}
			break;
		}
		for (const section of completed) {
			remainingHeight -= section.contentHeight - allocations.get(section)!;
			allocations.set(section, section.contentHeight);
		}
		remainingSections = remainingSections.filter(section => !completed.includes(section));
	}

	return sections.map(section => section.container.hidden ? 0 : Math.max(0, Math.floor(allocations.get(section) ?? 0)));
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
