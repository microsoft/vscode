/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { IListAccessibilityProvider } from '../../../base/browser/ui/list/listWidget.js';
import { Radio } from '../../../base/browser/ui/radio/radio.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
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
 * Describes one tab in a {@link TabbedActionListWidget}. The {@link id}
 * is the stable identity used everywhere the widget reasons about a
 * tab (initial selection, change events, `createActionList` callback);
 * {@link label}, {@link tooltip}, and {@link icon} are presentation only.
 */
export interface ITabDescriptor {
	/** Stable identifier used for tab identity and selection callbacks. */
	readonly id: string;
	/** Visible label. Defaults to {@link id}. Localize at the call site. */
	readonly label?: string;
	/** Hover tooltip. Defaults to {@link label} ?? {@link id}. */
	readonly tooltip?: string;
	/** Optional leading icon rendered before the label. */
	readonly icon?: ThemeIcon;
}

/**
 * An icon button rendered at the trailing edge of the tab bar. Unlike a tab,
 * running it does not change the active tab.
 */
export interface ITabBarAction {
	/** Stable identifier, used as the button's `data-id` for tests. */
	readonly id: string;
	readonly icon: ThemeIcon;
	readonly tooltip: string;
	/** When true, the button is pushed to the far end of the tab bar. */
	readonly alignEnd?: boolean;
	/** When true, the button renders in its pressed state. */
	readonly checked?: boolean;
	run(): void;
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
	/** Tabs rendered in order. */
	readonly tabs: readonly ITabDescriptor[];
	/** Initially active tab id. Must match an entry in {@link tabs}. */
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
	/**
	 * Computes the class names on the popup's `.action-widget` element. Re-evaluated
	 * whenever the popup re-renders or its list is refreshed, so state that changes
	 * while the popup stays open is not replayed stale on a tab switch.
	 */
	readonly widgetClassNames?: (activeTab: string) => readonly string[];
	/** Optional icon buttons rendered after the tabs. */
	readonly tabBarActions?: readonly ITabBarAction[];
	/**
	 * When tabs show their label beside their icon. `active` labels only the active tab,
	 * and a tab with no icon always shows its label. Defaults to `always`.
	 */
	readonly tabLabels?: 'always' | 'active' | 'never';
	/**
	 * When true, the list's filter row is rendered inside the tab bar in place of the
	 * tabs, rather than as its own row below them.
	 */
	readonly filterInTabBar?: boolean;
	/** Renders content pinned below the list, e.g. a persistent option row. */
	renderFooter?(container: HTMLElement, activeTab: string): IDisposable;
	/**
	 * Renders the body when the active tab has no items, e.g. a sign-in prompt.
	 * When it returns `undefined` the empty list is shown instead.
	 */
	renderEmpty?(container: HTMLElement, activeTab: string): IDisposable | undefined;
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
	private _refreshActiveList: (() => void) | undefined;

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
				let widgetClassNames: readonly string[] = [];
				const applyWidgetClassNames = () => {
					const next = options.widgetClassNames?.(activeTab) ?? [];
					const removed = widgetClassNames.filter(name => !next.includes(name));
					const added = next.filter(name => !widgetClassNames.includes(name));
					if (removed.length) {
						widget.classList.remove(...removed);
					}
					if (added.length) {
						widget.classList.add(...added);
					}
					widgetClassNames = next;
				};
				applyWidgetClassNames();

				// Invisible layers that swallow the mouse events which follow the one that
				// opened the popup. Without them a trigger that opens on mouse down is
				// dismissed by its own mouse up.
				const block = dom.append(container, dom.$('.context-view-block'));
				renderDisposables.add(dom.addDisposableGenericMouseDownListener(block, e => e.stopPropagation()));
				const pointerBlock = dom.append(container, dom.$('.context-view-pointerBlock'));
				renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
				renderDisposables.add(dom.addDisposableGenericMouseDownListener(pointerBlock, () => pointerBlock.remove()));

				const tabBar = dom.append(widget, dom.$('.tabbed-action-list-tabbar'));
				if (options.tabBarClassName) {
					tabBar.classList.add(options.tabBarClassName);
				}
				// A consumer showing a filter hides the strip and takes its place, so the
				// trailing actions never move.
				const tabStrip = dom.append(tabBar, dom.$('.tabbed-action-list-tabstrip'));
				const filterSlot = dom.append(tabBar, dom.$('.tabbed-action-list-filter-slot'));

				const activateTab = (next: string) => {
					if (next === activeTab) {
						return;
					}
					activeTab = next;
					this._onDidChangeTab.fire(next);
					this.show({ ...options, initialTab: next });
				};

				const radio = renderDisposables.add(new Radio({
					items: options.tabs.map(tab => {
						const label = tab.label ?? tab.id;
						const iconPrefix = tab.icon ? `$(${tab.icon.id})` : '';
						const labelMode = options.tabLabels ?? 'always';
						const showsLabel = !iconPrefix || labelMode === 'always' || (labelMode === 'active' && tab.id === activeTab);
						const text = showsLabel ? (iconPrefix ? `${iconPrefix} ${label}` : label) : iconPrefix;
						return { text, tooltip: tab.tooltip ?? label, ariaLabel: label, isActive: tab.id === activeTab };
					}),
				}));
				tabStrip.appendChild(radio.domNode);
				renderDisposables.add(radio.onDidSelect(index => {
					const next = options.tabs[index];
					if (next) {
						activateTab(next.id);
					}
				}));

				for (const tabAction of options.tabBarActions ?? []) {
					const container = tabAction.alignEnd ? tabBar : tabStrip;
					const button = dom.append(container, dom.$('button.tabbed-action-list-tabbar-action'));
					button.classList.toggle('align-end', !!tabAction.alignEnd);
					button.classList.toggle('checked', !!tabAction.checked);
					button.dataset.id = tabAction.id;
					button.title = tabAction.tooltip;
					button.ariaLabel = tabAction.tooltip;
					button.setAttribute('aria-pressed', String(!!tabAction.checked));
					dom.append(button, dom.$(`span${ThemeIcon.asCSSSelector(tabAction.icon)}`));
					renderDisposables.add(dom.addDisposableListener(button, dom.EventType.CLICK, e => {
						dom.EventHelper.stop(e, true);
						tabAction.run();
					}));
				}

				const { items, listOptions } = options.createActionList(activeTab);
				const emptyBody = items.length === 0 ? this._renderEmptyBody(widget, options, activeTab, renderDisposables) : undefined;
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
				// Rebuilding has to ask the consumer again, since what the popup shows can
				// depend on state that changed while it stayed open.
				this._refreshActiveList = () => {
					applyWidgetClassNames();
					list.updateItems(options.createActionList(activeTab).items);
				};
				renderDisposables.add(toDisposable(() => {
					this._refreshActiveList = undefined;
				}));

				if (!emptyBody) {
					if (list.headerContainer) {
						widget.appendChild(list.headerContainer);
					}
					if (list.filterContainer) {
						// The filter takes the tabs' place inside the bar, so the trailing
						// actions stay put and no extra row appears.
						(options.filterInTabBar ? filterSlot : widget).appendChild(list.filterContainer);
					}
					widget.appendChild(list.domNode);
					if (list.footerContainer) {
						widget.appendChild(list.footerContainer);
					}
				}

				if (options.renderFooter) {
					const footer = dom.append(widget, dom.$('.tabbed-action-list-footer'));
					renderDisposables.add(options.renderFooter(footer, activeTab));
				}

				const width = list.layout(0);
				widget.style.width = `${options.width ?? width}px`;
				list.focus();

				// Keyboard nav. Bound to the popup widget so we don't
				// observe unrelated document-wide keypresses.
				renderDisposables.add(dom.addStandardDisposableListener(widget, 'keydown', e => {
					const target = e.target as HTMLElement | null;
					const onTabBar = !!target?.closest('.tabbed-action-list-tabbar');
					const onFooter = !!target?.closest('.tabbed-action-list-footer');
					const onEditable = !!target?.closest('input, textarea, [contenteditable="true"]');
					const listNavigation = !onTabBar && !onFooter;

					if (e.keyCode === KeyCode.Escape) {
						dom.EventHelper.stop(e, true);
						hide();
						return;
					}
					if (e.keyCode === KeyCode.Enter && listNavigation) {
						dom.EventHelper.stop(e, true);
						list.acceptSelected();
						return;
					}
					if (e.keyCode === KeyCode.UpArrow && listNavigation) {
						dom.EventHelper.stop(e, true);
						list.focusPrevious();
						return;
					}
					if (e.keyCode === KeyCode.DownArrow && listNavigation) {
						dom.EventHelper.stop(e, true);
						list.focusNext();
						return;
					}
					if (e.keyCode !== KeyCode.LeftArrow && e.keyCode !== KeyCode.RightArrow) {
						return;
					}
					if (onFooter || (onEditable && !onTabBar)) {
						return;
					}
					const currentIndex = options.tabs.findIndex(t => t.id === activeTab);
					if (currentIndex < 0) {
						return;
					}
					const delta = e.keyCode === KeyCode.RightArrow ? 1 : -1;
					const nextIndex = (currentIndex + delta + options.tabs.length) % options.tabs.length;
					e.preventDefault();
					e.stopPropagation();
					activateTab(options.tabs[nextIndex].id);
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

	/**
	 * Rebuilds the active tab's items and the popup's class names in place, keeping its
	 * position and whatever currently has focus. Use when an action inside the popup
	 * changes what it shows but should not dismiss it.
	 */
	refreshActiveList(): void {
		this._refreshActiveList?.();
	}

	/** Renders the caller's empty body, or nothing when it declines to handle the empty tab. */
	private _renderEmptyBody<T>(widget: HTMLElement, options: ITabbedActionListShowOptions<T>, activeTab: string, disposables: DisposableStore): HTMLElement | undefined {
		if (!options.renderEmpty) {
			return undefined;
		}
		const body = dom.append(widget, dom.$('.tabbed-action-list-empty'));
		const rendered = options.renderEmpty(body, activeTab);
		if (!rendered) {
			body.remove();
			return undefined;
		}
		disposables.add(rendered);
		return body;
	}

	override dispose(): void {
		this._activePopup.value = undefined;
		super.dispose();
	}
}
