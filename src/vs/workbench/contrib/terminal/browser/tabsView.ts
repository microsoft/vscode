/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalTabsWidget } from 'vs/workbench/contrib/terminal/browser/terminalTabsWidget';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IView } from 'vs/workbench/common/views';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import * as dom from 'vs/base/browser/dom';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IAction } from 'vs/base/common/actions';
import { IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { DataTransfers } from 'vs/base/browser/dnd';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { URI } from 'vs/base/common/uri';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminal/browser/terminalFindWidget';

const FIND_FOCUS_CLASS = 'find-focused';

export class TabsView extends Disposable {
	private _menu: IMenu;
	_width: number;
	_height: number;
	private _cancelContextMenu: boolean = false;
	private _tabsElement: HTMLElement;
	private _splitView!: SplitView;
	private readonly _splitViewDisposables = this._register(new DisposableStore());
	private _children: SplitTabsPane[] = [];
	private _terminalContainer: HTMLElement;
	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		private _parentDomElement: HTMLElement,
		_findWidget: TerminalFindWidget,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IMenuService _menuService: IMenuService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._menu = this._register(_menuService.createMenu(MenuId.TerminalContext, _contextKeyService));
		this._tabsElement = document.createElement('div');
		this._tabsElement.classList.add('tabs-widget');
		this._instantiationService.createInstance(TerminalTabsWidget, this._tabsElement);

		this._width = _parentDomElement.offsetWidth;
		this._height = _parentDomElement.offsetHeight;

		this._terminalContainer = document.createElement('div');
		this._terminalContainer.classList.add('terminal-outer-container');
		this._terminalContainer.style.display = 'block';
		this._terminalService.setContainers(this._terminalContainer, this._parentDomElement);
		this._attachEventListeners(this._parentDomElement, this._terminalContainer);
		this._createSplitView();
		_findWidget.focusTracker.onDidFocus(() => this._terminalContainer!.classList.add(FIND_FOCUS_CLASS));
		// this._terminalService.onInstancesChanged(() => {
		// 	this._splitView.dispose();
		// 	this._createSplitView();
		// });
	}

	public get splitView(): SplitView {
		return this._splitView;
	}

	private _createSplitView(): void {
		if (this._splitView) {
			return;
		}
		this._splitView = new SplitView(this._parentDomElement, { orientation: Orientation.HORIZONTAL });
		this._splitViewDisposables.clear();
		this._splitViewDisposables.add(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
		const showTabs = this._terminalService.configHelper.config.showTabs;
		const tabsWidgetWidth = showTabs ? 200 : 0;
		if (showTabs) {
			this._splitView.addView(new SplitTabsPane(this._tabsElement, tabsWidgetWidth, this._terminalService), tabsWidgetWidth, 0);
		}
		const tabContainer = new SplitTabsPane(this._terminalContainer, this._width - tabsWidgetWidth, this._terminalService);
		this._splitView.addView(tabContainer, this._width - tabsWidgetWidth, 1);
		this._terminalService.terminalTabs.forEach(tab => tab.attachToElement(tabContainer.element));
	}

	public layout(width: number, height: number): void {
		this._width = width;
		this._height = height;
		this._children.forEach(c => c.orthogonalLayout(width));
		this._splitView.layout(width);
	}

	private _attachEventListeners(parentDomElement: HTMLElement, terminalContainer: HTMLElement): void {
		this._register(dom.addDisposableListener(parentDomElement, 'mousedown', async (event: MouseEvent) => {
			if (this._terminalService.terminalInstances.length === 0) {
				return;
			}

			if (event.which === 2 && isLinux) {
				// Drop selection and focus terminal on Linux to enable middle button paste when click
				// occurs on the selection itself.
				const terminal = this._terminalService.getActiveInstance();
				if (terminal) {
					terminal.focus();
				}
			} else if (event.which === 3) {
				const rightClickBehavior = this._terminalService.configHelper.config.rightClickBehavior;
				if (rightClickBehavior === 'copyPaste' || rightClickBehavior === 'paste') {
					const terminal = this._terminalService.getActiveInstance();
					if (!terminal) {
						return;
					}

					// copyPaste: Shift+right click should open context menu
					if (rightClickBehavior === 'copyPaste' && event.shiftKey) {
						this._openContextMenu(event);
						return;
					}

					if (rightClickBehavior === 'copyPaste' && terminal.hasSelection()) {
						await terminal.copySelection();
						terminal.clearSelection();
					} else {
						if (BrowserFeatures.clipboard.readText) {
							terminal.paste();
						} else {
							this._notificationService.info(`This browser doesn't support the clipboard.readText API needed to trigger a paste, try ${isMacintosh ? '⌘' : 'Ctrl'}+V instead.`);
						}
					}
					// Clear selection after all click event bubbling is finished on Mac to prevent
					// right-click selecting a word which is seemed cannot be disabled. There is a
					// flicker when pasting but this appears to give the best experience if the
					// setting is enabled.
					if (isMacintosh) {
						setTimeout(() => {
							terminal.clearSelection();
						}, 0);
					}
					this._cancelContextMenu = true;
				}
			}
		}));
		this._register(dom.addDisposableListener(parentDomElement, 'contextmenu', (event: MouseEvent) => {
			if (!this._cancelContextMenu) {
				this._openContextMenu(event);
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			this._cancelContextMenu = false;
		}));
		this._register(dom.addDisposableListener(document, 'keydown', (event: KeyboardEvent) => {
			terminalContainer.classList.toggle('alt-active', !!event.altKey);
		}));
		this._register(dom.addDisposableListener(document, 'keyup', (event: KeyboardEvent) => {
			terminalContainer.classList.toggle('alt-active', !!event.altKey);
		}));
		this._register(dom.addDisposableListener(parentDomElement, 'keyup', (event: KeyboardEvent) => {
			if (event.keyCode === 27) {
				// Keep terminal open on escape
				event.stopPropagation();
			}
		}));
		this._register(dom.addDisposableListener(parentDomElement, dom.EventType.DROP, async (e: DragEvent) => {
			if (e.target === this._parentDomElement || dom.isAncestor(e.target as HTMLElement, parentDomElement)) {
				if (!e.dataTransfer) {
					return;
				}

				// Check if files were dragged from the tree explorer
				let path: string | undefined;
				const resources = e.dataTransfer.getData(DataTransfers.RESOURCES);
				if (resources) {
					path = URI.parse(JSON.parse(resources)[0]).fsPath;
				} else if (e.dataTransfer.files.length > 0 && e.dataTransfer.files[0].path /* Electron only */) {
					// Check if the file was dragged from the filesystem
					path = URI.file(e.dataTransfer.files[0].path).fsPath;
				}

				if (!path) {
					return;
				}

				const terminal = this._terminalService.getActiveInstance();
				if (terminal) {
					const preparedPath = await this._terminalService.preparePathForTerminalAsync(path, terminal.shellLaunchConfig.executable, terminal.title, terminal.shellType);
					terminal.sendText(preparedPath, false);
					terminal.focus();
				}
			}
		}));
	}
	private _openContextMenu(event: MouseEvent): void {
		const standardEvent = new StandardMouseEvent(event);
		const anchor: { x: number, y: number } = { x: standardEvent.posx, y: standardEvent.posy };

		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this._menu, undefined, actions);

		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			getActionsContext: () => this._parentDomElement,
			onHide: () => actionsDisposable.dispose()
		});
	}
}
class SplitTabsPane implements IView {
	public minimumSize: number = 120;
	public maximumSize: number = Number.MAX_VALUE;

	public orientation: Orientation | undefined;

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	readonly element: HTMLElement;

	constructor(
		readonly item: HTMLElement,
		public height: number,
		@ITerminalService _terminalService: ITerminalService
	) {
		this.element = document.createElement('div');
		this.element.className = 'terminal-tabs-split-pane';
		this.element.appendChild(item);
	}
	id: string = 'split-tabs-view';
	focus(): void {
		throw new Error('Method not implemented.');
	}
	isVisible(): boolean {
		throw new Error('Method not implemented.');
	}
	isBodyVisible(): boolean {
		throw new Error('Method not implemented.');
	}
	setExpanded(expanded: boolean): boolean {
		throw new Error('Method not implemented.');
	}
	getProgressIndicator(): IProgressIndicator | undefined {
		throw new Error('Method not implemented.');
	}

	public layout(size: number): void {
		// Only layout when both sizes are known
		if (!size || !this.height) {
			return;
		}

		// if (this._item.classList.contains('tabs-widget')) {

		// } else {
		// 	// this._terminalService.terminalTabs.forEach(t => t.layout(size, this.height));
		// }
	}

	public orthogonalLayout(size: number): void {
		this.height = size;
	}
}
