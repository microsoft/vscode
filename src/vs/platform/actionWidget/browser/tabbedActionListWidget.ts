/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { IListAccessibilityProvider } from '../../../base/browser/ui/list/listWidget.js';
import { Radio } from '../../../base/browser/ui/radio/radio.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ActionList, IActionListDelegate, IActionListItem, IActionListOptions } from './actionList.js';
import './tabbedActionListWidget.css';

/**
 * Result of {@link ITabbedActionListShowOptions.createActionList}. The list
 * options are recomputed on every tab switch so callers can vary filter
 * visibility, width, etc. by tab.
 */
export interface ITabbedActionListBuildResult<T> {
	readonly items: readonly IActionListItem<T>[];
	readonly listOptions?: IActionListOptions;
}

/**
 * Options for {@link TabbedActionListWidget.show}. The widget renders a
 * tab bar above an `ActionList` inside a single popup. Consumers describe
 * how to compute items for each tab; the widget handles tab switching and
 * lifecycle internally.
 */
export interface ITabbedActionListShowOptions<T> {
	/** Logical user / source identifier passed through to {@link ActionList}. */
	readonly user: string;
	/** Element the popup is anchored to. */
	readonly anchor: HTMLElement;
	/** Tab labels rendered in order. Localize at the call site. */
	readonly tabs: readonly string[];
	/** Initially active tab. Must be present in {@link tabs}. */
	readonly initialTab: string;
	/** Computes the list items and per-tab options shown when the given tab is active. */
	createActionList(activeTab: string): ITabbedActionListBuildResult<T>;
	/** Item delegate (selection, hide, focus). */
	readonly delegate: IActionListDelegate<T>;
	/** Optional accessibility provider passed to the underlying list. */
	readonly accessibilityProvider?: Partial<IListAccessibilityProvider<IActionListItem<T>>>;
	/** Optional fixed popup width. */
	readonly width?: number;
	/** Optional class name to add to the tab bar element (in addition to `.tabbed-action-list-tabbar`). Must be a single class. */
	readonly tabBarClassName?: string;
}

/**
 * A widget that shows a tabbed action list in a context view popup
 */
export class TabbedActionListWidget extends Disposable {

	private readonly _onDidChangeTab = this._register(new Emitter<string>());
	readonly onDidChangeTab = this._onDidChangeTab.event;

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _activePopup = this._register(new MutableDisposable());
	private _swappingTab = false;

	get isVisible(): boolean {
		return !!this._activePopup.value;
	}

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	/**
	 * Shows the popup anchored to {@link ITabbedActionListShowOptions.anchor}.
	 * If a popup is already visible, it is replaced in place.
	 */
	show<T>(options: ITabbedActionListShowOptions<T>): void {
		const isSwap = this.isVisible;
		if (isSwap) {
			this._swappingTab = true;
			this._activePopup.value = undefined;
		}

		let activeTab = options.initialTab;
		const popupDisposables = new DisposableStore();

		const hide = () => {
			if (this._activePopup.value === popupDisposables) {
				this._activePopup.value = undefined;
			}
		};

		// Reserve the disposable slot up-front so any synchronous hide
		// triggered during render (e.g. an immediate selection) finds the
		// expected disposable to clear.
		this._activePopup.value = popupDisposables;
		popupDisposables.add(toDisposable(() => {
			this._contextViewService.hideContextView();
		}));

		let listRef: ActionList<T> | undefined;

		this._contextViewService.showContextView({
			getAnchor: () => options.anchor,
			render: (container: HTMLElement) => {
				const renderDisposables = new DisposableStore();

				const widget = dom.append(container, dom.$('.action-widget'));

				const tabBar = dom.append(widget, dom.$('.tabbed-action-list-tabbar'));
				if (options.tabBarClassName) {
					tabBar.classList.add(options.tabBarClassName);
				}
				const radio = renderDisposables.add(new Radio({
					items: options.tabs.map(t => ({ text: t, tooltip: t, isActive: t === activeTab })),
				}));
				tabBar.appendChild(radio.domNode);

				const activateTab = (next: string) => {
					if (next === activeTab) {
						return;
					}
					activeTab = next;
					this._onDidChangeTab.fire(next);
					this.show({ ...options, initialTab: next });
				};

				renderDisposables.add(radio.onDidSelect(index => {
					const next = options.tabs[index];
					if (next) {
						activateTab(next);
					}
				}));

				const { items, listOptions } = options.createActionList(activeTab);
				const list = renderDisposables.add(this._instantiationService.createInstance(
					ActionList<T>,
					options.user,
					false,
					items,
					options.delegate,
					options.accessibilityProvider,
					listOptions,
					options.anchor,
				));
				listRef = list;

				if (list.filterContainer) {
					widget.appendChild(list.filterContainer);
				}
				widget.appendChild(list.domNode);

				const width = list.layout(0);
				widget.style.width = `${options.width ?? width}px`;
				list.focus();

				// Keyboard nav. Bound to the popup widget so we don't
				// observe unrelated document-wide keypresses.
				renderDisposables.add(dom.addStandardDisposableListener(widget, 'keydown', e => {
					const target = e.target as HTMLElement | null;
					const onTabBar = !!target?.closest('.tabbed-action-list-tabbar');
					const onEditable = !!target?.closest('input, textarea, [contenteditable="true"]');

					if (e.keyCode === KeyCode.Escape) {
						dom.EventHelper.stop(e, true);
						hide();
						return;
					}
					if (e.keyCode === KeyCode.Enter && !onTabBar) {
						dom.EventHelper.stop(e, true);
						list.acceptSelected();
						return;
					}
					if (e.keyCode === KeyCode.UpArrow && !onTabBar) {
						dom.EventHelper.stop(e, true);
						list.focusPrevious();
						return;
					}
					if (e.keyCode === KeyCode.DownArrow && !onTabBar) {
						dom.EventHelper.stop(e, true);
						list.focusNext();
						return;
					}
					if (e.keyCode !== KeyCode.LeftArrow && e.keyCode !== KeyCode.RightArrow) {
						return;
					}
					if (onEditable && !onTabBar) {
						return;
					}
					const currentIndex = options.tabs.indexOf(activeTab);
					if (currentIndex < 0) {
						return;
					}
					const delta = e.keyCode === KeyCode.RightArrow ? 1 : -1;
					const nextIndex = (currentIndex + delta + options.tabs.length) % options.tabs.length;
					e.preventDefault();
					e.stopPropagation();
					activateTab(options.tabs[nextIndex]);
				}));

				// Dismiss when focus leaves the popup. Suppressed during a
				// tab swap so the teardown of the previous popup doesn't
				// take the new one down with it.
				const focusTracker = renderDisposables.add(dom.trackFocus(container));
				renderDisposables.add(focusTracker.onDidBlur(() => {
					if (this._swappingTab) {
						return;
					}
					const activeElement = dom.getActiveElement();
					if (activeElement && (activeElement.closest('.action-widget-hover') || activeElement.closest('.action-list-submenu-panel'))) {
						return;
					}
					hide();
				}));

				return renderDisposables;
			},
			onHide: () => {
				listRef = undefined;
				// Skip consumer callbacks during a tab swap — we are about
				// to re-show with the same anchor, so the consumer should
				// not e.g. refocus the trigger button between hide and show.
				if (this._swappingTab) {
					return;
				}
				// External dismissal (Escape, click outside) — clear our
				// own tracker so `isVisible` reflects reality. Done before
				// firing consumer callbacks in case they re-show.
				if (this._activePopup.value === popupDisposables) {
					this._activePopup.value = undefined;
				}
				options.delegate.onHide?.();
				this._onDidHide.fire();
			},
			get anchorPosition() { return listRef?.anchorPosition; },
		}, undefined, false);

		if (isSwap) {
			this._swappingTab = false;
		}
	}

	hide(): void {
		this._activePopup.value = undefined;
	}

	override dispose(): void {
		this._activePopup.value = undefined;
		super.dispose();
	}
}
