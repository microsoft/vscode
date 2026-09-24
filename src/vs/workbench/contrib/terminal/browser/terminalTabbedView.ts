/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LayoutPriority, Orientation, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalEditingService, ITerminalGroupService, ITerminalInstance, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from './terminal.js';
import { TerminalTabsDragAndDrop, TerminalTabsListSizes, TerminalTabList } from './terminalTabsList.js';
import * as dom from '../../../../base/browser/dom.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { IMenu, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { openContextMenu } from './terminalContextMenu.js';
import { TerminalStorageKeys } from '../common/terminalStorageKeys.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { TerminalTabsChatEntry } from './terminalTabsChatEntry.js';
import { containsDragType } from '../../../../platform/dnd/browser/dnd.js';
import { TerminalContribContextKeyStrings } from '../terminalContribExports.js';
import { ITerminalConfiguration } from '../common/terminal.js';
import { getSelectedTerminalTabInstances, ITerminalTabsWidget } from './terminalTabsWidget.js';
import { TerminalTabsBar } from './terminalTabsBar.js';
import { NativeDragAndDropData } from '../../../../base/browser/ui/list/listView.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';

const $ = dom.$;

const enum CssClass {
	ViewIsVertical = 'terminal-side-view',
}

const enum WidthConstants {
	StatusIcon = 30,
	SplitAnnotation = 30
}

export class TerminalTabbedView extends Disposable {

	private _splitView: SplitView;
	private readonly _layoutDisposables = this._register(new DisposableStore());
	private readonly _tabsDisposables = this._register(new DisposableStore());
	private readonly _tabActionsDisposables = this._register(new DisposableStore());
	private _location: ITerminalConfiguration['tabs']['location'];

	private _terminalContainer: HTMLElement;
	private _tabListElement: HTMLElement;
	private _tabContainer: HTMLElement;

	private _tabList: ITerminalTabsWidget;
	private readonly _tabDragAndDrop: TerminalTabsDragAndDrop;
	private _tabListContainer: HTMLElement;
	private _tabListDomElement: HTMLElement;
	private readonly _sashDisposables = this._register(new DisposableStore());

	private _plusButton: HTMLElement | undefined;
	private _chatEntry: TerminalTabsChatEntry | undefined;

	private _tabTreeIndex: number;
	private _terminalContainerIndex: number;

	private _height: number | undefined;
	private _width: number | undefined;

	private _cancelContextMenu: boolean = false;
	private _instanceMenu: IMenu;
	private _tabsListMenu: IMenu;
	private _tabsListEmptyMenu: IMenu;

	private _terminalIsTabsNarrowContextKey: IContextKey<boolean>;
	private _terminalTabsFocusContextKey: IContextKey<boolean>;
	private _terminalTabsMouseContextKey: IContextKey<boolean>;

	private _panelOrientation: Orientation | undefined;
	private _emptyAreaDropTargetCount = 0;

	constructor(
		parentElement: HTMLElement,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ITerminalEditingService private readonly _terminalEditingService: ITerminalEditingService,
		@IListService private readonly _listService: IListService,
	) {
		super();
		this._location = this._terminalConfigurationService.config.tabs.location;

		this._tabContainer = $('.tabs-container');
		const tabListContainer = $('.tabs-list-container');
		this._tabListContainer = tabListContainer;
		this._tabListElement = $('.tabs-list');
		tabListContainer.appendChild(this._tabListElement);
		this._tabContainer.appendChild(tabListContainer);

		this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalInstanceContext, contextKeyService));
		this._tabsListMenu = this._register(menuService.createMenu(MenuId.TerminalTabContext, contextKeyService));
		this._tabsListEmptyMenu = this._register(menuService.createMenu(MenuId.TerminalTabEmptyAreaContext, contextKeyService));

		this._tabList = this._createTabsWidget();
		this._tabListDomElement = this._tabList.getHTMLElement();
		this._tabDragAndDrop = this._register(this._instantiationService.createInstance(TerminalTabsDragAndDrop, instances => {
			const indexes = instances.map(instance => this._terminalGroupService.instances.indexOf(instance)).filter(index => index >= 0);
			this._tabList.setSelection(indexes);
			this._tabList.setFocus(indexes.slice(0, 1));
		}));
		this._chatEntry = this._register(this._instantiationService.createInstance(TerminalTabsChatEntry, tabListContainer, this._tabContainer));

		const terminalOuterContainer = $('.terminal-outer-container');
		this._terminalContainer = $('.terminal-groups-container');
		terminalOuterContainer.appendChild(this._terminalContainer);

		this._terminalService.setContainers(parentElement, this._terminalContainer);

		this._terminalIsTabsNarrowContextKey = TerminalContextKeys.tabsNarrow.bindTo(contextKeyService);
		this._terminalTabsFocusContextKey = TerminalContextKeys.tabsFocus.bindTo(contextKeyService);
		this._terminalTabsMouseContextKey = TerminalContextKeys.tabsMouse.bindTo(contextKeyService);

		this._tabTreeIndex = this._location === 'left' || this._location === 'top' ? 0 : 1;
		this._terminalContainerIndex = 1 - this._tabTreeIndex;

		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.TabsLocation) && this._location !== this._terminalConfigurationService.config.tabs.location) {
				const selection = this._tabList.getSelectedElements();
				const focused = this._tabList.getFocusedElements();
				const activeElement = dom.getActiveElement();
				const hadTabsFocus = this._tabContainer.contains(activeElement);
				const horizontal = this._isHorizontal;
				const editing = this._terminalEditingService.getEditingTerminal();
				if (editing) {
					this._terminalEditingService.getEditableData(editing)?.onFinish('', false);
				}
				this._location = this._terminalConfigurationService.config.tabs.location;
				this._tabTreeIndex = this._location === 'left' || this._location === 'top' ? 0 : 1;
				this._terminalContainerIndex = 1 - this._tabTreeIndex;
				if (horizontal !== this._isHorizontal) {
					this._tabsDisposables.clear();
					dom.clearNode(this._tabListElement);
					this._tabList = this._createTabsWidget();
					this._tabListDomElement = this._tabList.getHTMLElement();
					this._tabList.setSelection(selection.map(instance => this._terminalGroupService.instances.indexOf(instance)).filter(index => index >= 0));
					this._tabList.setFocus(focused.map(instance => this._terminalGroupService.instances.indexOf(instance)).filter(index => index >= 0));
				}
				this._removeSashListener();
				this._splitView.el.remove();
				this._layoutDisposables.clear();
				this._splitView = this._createSplitView(parentElement);
				this._setupSplitView(terminalOuterContainer);
				this.layout(this._width ?? 0, this._height ?? 0);
				if (hadTabsFocus && this._shouldShowTabs()) {
					this.focusTabs();
				} else if (dom.isHTMLElement(activeElement) && this._terminalContainer.contains(activeElement)) {
					activeElement.focus();
				}
			}
			if (e.affectsConfiguration(TerminalSettingId.TabsEnabled) ||
				e.affectsConfiguration(TerminalSettingId.TabsHideCondition) ||
				e.affectsConfiguration(TerminalSettingId.TabsLocation)) {
				this._refreshShowTabs();
			}
		}));
		this._register(Event.any(this._terminalGroupService.onDidChangeInstances, this._terminalGroupService.onDidChangeGroups)(() => {
			this._refreshShowTabs();
			this._updateChatTerminalsEntry();
		}));

		this._register(Event.any(this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession, this._terminalService.onDidChangeInstances, this._terminalService.onDidDisposeInstance)(() => {
			this._refreshShowTabs();
			this._updateChatTerminalsEntry();
		}));

		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([TerminalContribContextKeyStrings.ChatHasHiddenTerminals]))) {
				this._refreshShowTabs();
				this._updateChatTerminalsEntry();
			}
		}));
		this._attachEventListeners(parentElement, this._terminalContainer);

		this._register(this._terminalGroupService.onDidChangePanelOrientation((orientation) => {
			this._panelOrientation = orientation;
			if (this._panelOrientation === Orientation.VERTICAL) {
				this._terminalContainer.classList.add(CssClass.ViewIsVertical);
			} else {
				this._terminalContainer.classList.remove(CssClass.ViewIsVertical);
			}
		}));

		this._splitView = this._createSplitView(parentElement);
		this._setupSplitView(terminalOuterContainer);
		this._updateChatTerminalsEntry();
	}

	private get _isHorizontal(): boolean {
		return this._location === 'top' || this._location === 'bottom';
	}

	private _createTabsWidget(): ITerminalTabsWidget {
		return this._tabsDisposables.add(this._isHorizontal
			? this._instantiationService.createInstance(TerminalTabsBar, this._tabListElement, undefined)
			: this._instantiationService.createInstance(TerminalTabList, this._tabListElement));
	}

	private _createSplitView(parent: HTMLElement): SplitView {
		this._tabContainer.classList.toggle('horizontal-tabs', this._isHorizontal);
		this._tabContainer.classList.toggle('tabs-bottom', this._location === 'bottom');
		return this._layoutDisposables.add(new SplitView(parent, { orientation: this._isHorizontal ? Orientation.VERTICAL : Orientation.HORIZONTAL, proportionalLayout: false }));
	}

	private _shouldShowTabs(): boolean {
		const enabled = this._terminalConfigurationService.config.tabs.enabled;
		const hide = this._terminalConfigurationService.config.tabs.hideCondition;
		const hiddenChatTerminals = this._terminalChatService.getToolSessionTerminalInstances(true);
		if (!enabled) {
			return false;
		}
		if (hiddenChatTerminals.length > 0) {
			return true;
		}

		switch (hide) {
			case 'never':
				return true;
			case 'singleTerminal':
				if (this._terminalGroupService.instances.length > 1) {
					return true;
				}
				break;
			case 'singleGroup':
				if (this._terminalGroupService.groups.length > 1) {
					return true;
				}
				break;
		}
		return false;
	}

	private _refreshShowTabs() {
		const hadTabsFocus = this._tabContainer.contains(dom.getActiveElement());
		if (this._shouldShowTabs()) {
			if (this._splitView.length === 1) {
				this._addTabTree();
				this._addSashListener();
				this._splitView.resizeView(this._tabTreeIndex, this._isHorizontal ? TerminalTabsBar.HEIGHT : this._getLastListWidth());
				this.rerenderTabs();
			}
		} else {
			if (this._splitView.length === 2 && !this._terminalTabsMouseContextKey.get()) {
				this._splitView.removeView(this._tabTreeIndex);
				this._plusButton?.remove();
				this._removeSashListener();
			}
		}
		if (this._width !== undefined && this._height !== undefined) {
			this.layout(this._width, this._height);
		}
		if (hadTabsFocus && !this._tabContainer.contains(dom.getActiveElement())) {
			if (this._shouldShowTabs()) {
				this.focusTabs();
			} else {
				this.focus();
			}
		}
	}

	private _updateChatTerminalsEntry(): void {
		this._chatEntry?.update();
		if (this._width !== undefined && this._height !== undefined) {
			this.layout(this._width, this._height);
		}
	}

	private _getLastListWidth(): number {
		const widthKey = this._panelOrientation === Orientation.VERTICAL ? TerminalStorageKeys.TabsListWidthVertical : TerminalStorageKeys.TabsListWidthHorizontal;
		const storedValue = this._storageService.get(widthKey, StorageScope.PROFILE);

		if (!storedValue || !parseInt(storedValue)) {
			// we want to use the min width by default for the vertical orientation bc
			// there is such a limited width for the terminal panel to begin w there.
			return this._panelOrientation === Orientation.VERTICAL ? TerminalTabsListSizes.NarrowViewWidth : TerminalTabsListSizes.DefaultWidth;
		}
		return parseInt(storedValue);
	}

	private _handleOnDidSashReset(): void {
		// Calculate ideal size of list to display all text based on its contents
		let idealWidth = TerminalTabsListSizes.WideViewMinimumWidth;
		const offscreenCanvas = document.createElement('canvas');
		offscreenCanvas.width = 1;
		offscreenCanvas.height = 1;
		const ctx = offscreenCanvas.getContext('2d');
		if (ctx) {
			const style = dom.getWindow(this._tabListElement).getComputedStyle(this._tabListElement);
			ctx.font = `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
			const maxInstanceWidth = this._terminalGroupService.instances.reduce((p, c) => {
				return Math.max(p, ctx.measureText(c.title + (c.description || '')).width + this._getAdditionalWidth(c));
			}, 0);
			idealWidth = Math.ceil(Math.max(maxInstanceWidth, TerminalTabsListSizes.WideViewMinimumWidth));
		}
		// If the size is already ideal, toggle to collapsed
		const currentWidth = Math.ceil(this._splitView.getViewSize(this._tabTreeIndex));
		if (currentWidth === idealWidth) {
			idealWidth = TerminalTabsListSizes.NarrowViewWidth;
		}
		this._splitView.resizeView(this._tabTreeIndex, idealWidth);
		this._updateListWidth(idealWidth);
	}

	private _getAdditionalWidth(instance: ITerminalInstance): number {
		// Size to include padding, icon, status icon (if any), split annotation (if any), + a little more
		const additionalWidth = 40;
		const statusIconWidth = instance.statusList.statuses.length > 0 ? WidthConstants.StatusIcon : 0;
		const splitAnnotationWidth = (this._terminalGroupService.getGroupForInstance(instance)?.terminalInstances.length || 0) > 1 ? WidthConstants.SplitAnnotation : 0;
		return additionalWidth + splitAnnotationWidth + statusIconWidth;
	}

	private _handleOnDidSashChange(): void {
		const listWidth = this._splitView.getViewSize(this._tabTreeIndex);
		if (!this._width || listWidth <= 0) {
			return;
		}
		this._updateListWidth(listWidth);
	}

	private _updateListWidth(width: number): void {
		if (width < TerminalTabsListSizes.MidpointViewWidth && width >= TerminalTabsListSizes.NarrowViewWidth) {
			width = TerminalTabsListSizes.NarrowViewWidth;
			this._splitView.resizeView(this._tabTreeIndex, width);
		} else if (width >= TerminalTabsListSizes.MidpointViewWidth && width < TerminalTabsListSizes.WideViewMinimumWidth) {
			width = TerminalTabsListSizes.WideViewMinimumWidth;
			this._splitView.resizeView(this._tabTreeIndex, width);
		}
		this.rerenderTabs();
		const widthKey = this._panelOrientation === Orientation.VERTICAL ? TerminalStorageKeys.TabsListWidthVertical : TerminalStorageKeys.TabsListWidthHorizontal;
		this._storageService.store(widthKey, width, StorageScope.PROFILE, StorageTarget.USER);
	}

	private _setupSplitView(terminalOuterContainer: HTMLElement): void {
		if (!this._isHorizontal) {
			this._layoutDisposables.add(this._splitView.onDidSashReset(() => this._handleOnDidSashReset()));
			this._layoutDisposables.add(this._splitView.onDidSashChange(() => this._handleOnDidSashChange()));
		}

		if (this._shouldShowTabs()) {
			this._addTabTree();
		}
		this._splitView.addView({
			element: terminalOuterContainer,
			layout: size => this._terminalGroupService.groups.forEach(group => group.layout(this._isHorizontal ? this._width ?? 0 : size, this._isHorizontal ? size : this._height ?? 0)),
			minimumSize: this._isHorizontal ? 0 : 120,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None,
			priority: LayoutPriority.High
		}, Sizing.Distribute, this._terminalContainerIndex);

		if (this._shouldShowTabs()) {
			this._addSashListener();
		}
	}

	private _addTabTree() {
		this._splitView.addView({
			element: this._tabContainer,
			layout: size => this._layoutTabs(this._isHorizontal ? this._width ?? 0 : size, this._isHorizontal ? size : this._height ?? 0),
			minimumSize: this._isHorizontal ? TerminalTabsBar.HEIGHT : TerminalTabsListSizes.NarrowViewWidth,
			maximumSize: this._isHorizontal ? TerminalTabsBar.HEIGHT : TerminalTabsListSizes.MaximumWidth,
			onDidChange: () => Disposable.None,
			priority: LayoutPriority.Low
		}, Sizing.Distribute, this._tabTreeIndex);
		this.rerenderTabs();
	}

	rerenderTabs() {
		this._updateHasText();
		this._tabList.refresh();
	}

	private _addSashListener() {
		if (this._isHorizontal) {
			return;
		}
		this._sashDisposables.clear();
		const interval = this._sashDisposables.add(new MutableDisposable());
		this._sashDisposables.add(this._splitView.sashes[0].onDidStart(() => {
			interval.value = dom.disposableWindowInterval(dom.getWindow(this._splitView.el), () => this.rerenderTabs(), 100);
		}));
		this._sashDisposables.add(this._splitView.sashes[0].onDidEnd(() => interval.clear()));
	}

	private _removeSashListener() {
		this._sashDisposables.clear();
	}

	private _updateHasText() {
		const hasText = this._isHorizontal || this._tabListElement.clientWidth > TerminalTabsListSizes.MidpointViewWidth;
		this._tabContainer.classList.toggle('has-text', hasText);
		this._terminalIsTabsNarrowContextKey.set(!hasText);
		this._chatEntry?.update();
	}

	layout(width: number, height: number): void {
		this._height = Math.max(0, height);
		this._width = Math.max(0, width);
		this._splitView.layout(this._isHorizontal ? this._height : this._width);
		if (this._splitView.length === 2) {
			this._splitView.resizeView(this._tabTreeIndex, this._isHorizontal ? TerminalTabsBar.HEIGHT : this._getLastListWidth());
		}
		this._updateHasText();
		if (this._splitView.length === 2) {
			const size = this._splitView.getViewSize(this._tabTreeIndex);
			this._layoutTabs(this._isHorizontal ? this._width : size, this._isHorizontal ? size : this._height);
		}
	}

	private _layoutTabs(width: number, height: number): void {
		const chat = this._chatEntry?.element;
		const chatVisible = chat && chat.style.display !== 'none';
		this._tabList.layout(
			Math.max(0, height - (!this._isHorizontal && chatVisible ? chat.clientHeight : 0)),
			Math.max(0, width - (this._isHorizontal && chatVisible ? chat.clientWidth : 0))
		);
	}

	private _attachEventListeners(parentDomElement: HTMLElement, terminalContainer: HTMLElement): void {
		this._register(dom.addDisposableListener(this._tabContainer, 'mouseleave', async (event: MouseEvent) => {
			this._terminalTabsMouseContextKey.set(false);
			this._refreshShowTabs();
			event.stopPropagation();
		}));
		this._register(dom.addDisposableListener(this._tabContainer, 'mouseenter', async (event: MouseEvent) => {
			this._terminalTabsMouseContextKey.set(true);
			event.stopPropagation();
		}));
		this._register(dom.addDisposableListener(this._tabContainer, 'dragenter', (event: DragEvent) => {
			if (!this._shouldHandleEmptyAreaDrop(event)) {
				this._resetEmptyAreaDropState();
				return;
			}
			this._emptyAreaDropTargetCount++;
			this._setEmptyAreaDropState(true);
		}));
		this._register(dom.addDisposableListener(this._tabContainer, 'dragover', (event: DragEvent) => {
			if (!this._shouldHandleEmptyAreaDrop(event)) {
				this._resetEmptyAreaDropState();
				return;
			}
			event.preventDefault();
			this._setEmptyAreaDropState(true);
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
		}));
		this._register(dom.addDisposableListener(this._tabContainer, 'dragleave', (event: DragEvent) => {
			if (!this._shouldHandleEmptyAreaDrop(event)) {
				if (!this._tabContainer.contains(event.relatedTarget as Node | null)) {
					this._resetEmptyAreaDropState();
				}
				return;
			}
			if (this._tabContainer.contains(event.relatedTarget as Node | null)) {
				return;
			}
			this._emptyAreaDropTargetCount = Math.max(0, this._emptyAreaDropTargetCount - 1);
			if (this._emptyAreaDropTargetCount === 0) {
				this._resetEmptyAreaDropState();
			}
		}));
		this._register(dom.addDisposableListener(this._tabContainer, 'drop', (event: DragEvent) => {
			if (!this._shouldHandleEmptyAreaDrop(event)) {
				return;
			}
			void this._handleContainerDrop(event).catch(onUnexpectedError);
		}));
		this._register(dom.addDisposableListener(terminalContainer, 'mousedown', async (event: MouseEvent) => {
			const terminal = this._terminalGroupService.activeInstance;
			if (this._terminalGroupService.instances.length > 0 && terminal) {
				const result = await terminal.handleMouseEvent(event, this._instanceMenu);
				if (typeof result === 'object' && result.cancelContextMenu) {
					this._cancelContextMenu = true;
				}
			}
		}));
		this._register(dom.addDisposableListener(terminalContainer, 'contextmenu', (event: MouseEvent) => {
			const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
			if (rightClickBehavior === 'nothing' && !event.shiftKey) {
				this._cancelContextMenu = true;
			}
			terminalContainer.focus();
			if (!this._cancelContextMenu) {
				openContextMenu(dom.getWindow(terminalContainer), event, this._terminalGroupService.activeInstance, this._instanceMenu, this._contextMenuService);
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			this._cancelContextMenu = false;
		}));
		this._register(dom.addDisposableListener(this._tabContainer, 'contextmenu', (event: MouseEvent) => {
			const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
			if (rightClickBehavior === 'nothing' && !event.shiftKey) {
				this._cancelContextMenu = true;
			}
			if (!this._cancelContextMenu) {
				const emptyList = this._tabList.getFocus().length === 0;
				if (!emptyList) {
					this._terminalGroupService.lastAccessedMenu = 'tab-list';
				}

				// Put the focused item first as it's used as the first positional argument
				const selectedInstances = getSelectedTerminalTabInstances(this._tabList);
				const focusedInstance = this._tabList.getFocusedElements()?.[0];
				if (focusedInstance) {
					const index = selectedInstances.indexOf(focusedInstance);
					if (index !== -1) {
						selectedInstances.splice(index, 1);
					}
					selectedInstances.unshift(focusedInstance);
				}

				openContextMenu(dom.getWindow(this._tabContainer), event, selectedInstances, emptyList ? this._tabsListEmptyMenu : this._tabsListMenu, this._contextMenuService, emptyList ? this._getTabActions() : undefined);
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			this._cancelContextMenu = false;
		}));
		this._register(dom.addDisposableListener(terminalContainer.ownerDocument, 'keydown', (event: KeyboardEvent) => {
			terminalContainer.classList.toggle('alt-active', !!event.altKey);
		}));
		this._register(dom.addDisposableListener(terminalContainer.ownerDocument, 'keyup', (event: KeyboardEvent) => {
			terminalContainer.classList.toggle('alt-active', !!event.altKey);
		}));
		this._register(dom.addDisposableListener(parentDomElement, 'keyup', (event: KeyboardEvent) => {
			if (event.keyCode === 27) {
				// Keep terminal open on escape
				event.stopPropagation();
			}
		}));
		this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_IN, () => {
			this._terminalTabsFocusContextKey.set(true);
			this._terminalGroupService.lastAccessedMenu = 'tab-list';
		}));
		this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_OUT, () => {
			this._terminalTabsFocusContextKey.set(false);
		}));
	}

	private _shouldHandleEmptyAreaDrop(event: DragEvent): boolean {
		const targetNode = event.target as Node | null;
		if (targetNode && (this._tabListDomElement.contains(targetNode) || this._tabListElement.contains(targetNode))) {
			return false;
		}
		return !!event.dataTransfer && containsDragType(event, TerminalDataTransfers.Terminals);
	}

	private _setEmptyAreaDropState(active: boolean): void {
		this._tabListContainer.classList.toggle('drop-target', active);
		this._tabContainer.classList.toggle('drop-target', active);
		this._chatEntry?.element.classList.toggle('drop-target', active);
	}

	private _resetEmptyAreaDropState(): void {
		this._emptyAreaDropTargetCount = 0;
		this._setEmptyAreaDropState(false);
	}

	private async _handleContainerDrop(event: DragEvent): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		this._resetEmptyAreaDropState();
		await this._tabDragAndDrop.drop(new NativeDragAndDropData(), undefined, undefined, undefined, event);
	}

	private _getTabActions(): IAction[] {
		this._tabActionsDisposables.clear();
		const locations: { location: ITerminalConfiguration['tabs']['location']; label: string }[] = [
			{ location: 'left', label: localize('moveTabsLeft', "Move Tabs Left") },
			{ location: 'right', label: localize('moveTabsRight', "Move Tabs Right") },
			{ location: 'top', label: localize('moveTabsTop', "Move Tabs to Top") },
			{ location: 'bottom', label: localize('moveTabsBottom', "Move Tabs to Bottom") }
		];
		return [
			new Separator(),
			...locations.filter(({ location }) => location !== this._location).map(({ location, label }) => this._tabActionsDisposables.add(new Action(`moveTabs.${location}`, label, undefined, true, async () => {
				await this._configurationService.updateValue(TerminalSettingId.TabsLocation, location);
				this.focusTabs();
			}))),
			this._tabActionsDisposables.add(new Action('hideTabs', localize('hideTabs', "Hide Tabs"), undefined, undefined, async () => {
				await this._configurationService.updateValue(TerminalSettingId.TabsEnabled, false);
				this.focus();
			}))
		];
	}

	setEditable(isEditing: boolean): void {
		if (!isEditing) {
			this._tabList.domFocus();
		}
		this._tabList.refresh(false);
	}

	getSelectedTabInstances(): ITerminalInstance[] | undefined {
		if (!this._shouldShowTabs() || (this._tabList instanceof TerminalTabList && this._listService.lastFocusedList !== this._tabList)) {
			return undefined;
		}
		return getSelectedTerminalTabInstances(this._tabList);
	}

	focusTabs(): void {
		if (!this._shouldShowTabs()) {
			return;
		}
		this._terminalTabsFocusContextKey.set(true);
		const selected = this._tabList.getSelection();
		if (selected.length && !this._tabList.getFocus().length) {
			this._tabList.setFocus(selected.slice(0, 1));
		}
		this._tabList.domFocus();
	}

	focus() {
		if (this._terminalService.connectionState === TerminalConnectionState.Connected) {
			this._focus();
			return;
		}

		// If the terminal is waiting to reconnect to remote terminals, then there is no TerminalInstance yet that can
		// be focused. So wait for connection to finish, then focus.
		const previousActiveElement = this._tabListElement.ownerDocument.activeElement;
		if (previousActiveElement) {
			const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
				// Only focus the terminal if the activeElement has not changed since focus() was called
				if (dom.isActiveElement(previousActiveElement)) {
					this._focus();
				}
				this._store.delete(listener);
			}));
		}
	}

	focusHover() {
		if (this._shouldShowTabs()) {
			this._tabList.focusHover();
			return;
		}
		const instance = this._terminalGroupService.activeInstance;
		if (!instance) {
			return;
		}
		this._hoverService.showInstantHover({
			...getInstanceHoverInfo(instance, this._storageService),
			target: this._terminalContainer,
			trapFocus: true
		}, true);
	}

	private _focus() {
		this._terminalGroupService.activeInstance?.focusWhenReady();
	}
}
