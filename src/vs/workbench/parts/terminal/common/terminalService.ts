/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as errors from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalConfigHelper, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, TERMINAL_PANEL_ID, ITerminalTab } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';

export abstract class TerminalService implements ITerminalService {
	public _serviceBrand: any;

	protected _isShuttingDown: boolean;
	protected _terminalFocusContextKey: IContextKey<boolean>;
	protected _findWidgetVisible: IContextKey<boolean>;
	protected _terminalContainer: HTMLElement;
	protected _onInstancesChanged: Emitter<string>;
	protected _onTabDisposed: Emitter<ITerminalTab>;
	protected _onInstanceDisposed: Emitter<ITerminalInstance>;
	protected _onInstanceProcessIdReady: Emitter<ITerminalInstance>;
	protected _onInstanceTitleChanged: Emitter<string>;
	protected _terminalTabs: ITerminalTab[];
	protected abstract _terminalInstances: ITerminalInstance[];

	private _activeTabIndex: number;
	// TODO: Remove _activeTerminalInstanceIndex
	private _activeTerminalInstanceIndex: number;
	private _onActiveTabChanged: Emitter<void>;

	public get activeTerminalInstanceIndex(): number { return this._activeTerminalInstanceIndex; }
	public get onActiveTabChanged(): Event<void> { return this._onActiveTabChanged.event; }
	public get onTabDisposed(): Event<ITerminalTab> { return this._onTabDisposed.event; }
	public get onInstanceDisposed(): Event<ITerminalInstance> { return this._onInstanceDisposed.event; }
	public get onInstanceProcessIdReady(): Event<ITerminalInstance> { return this._onInstanceProcessIdReady.event; }
	public get onInstanceTitleChanged(): Event<string> { return this._onInstanceTitleChanged.event; }
	public get onInstancesChanged(): Event<string> { return this._onInstancesChanged.event; }
	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }
	public get terminalTabs(): ITerminalTab[] { return this._terminalTabs; }

	public abstract get configHelper(): ITerminalConfigHelper;

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IPanelService protected _panelService: IPanelService,
		@IPartService private _partService: IPartService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		this._activeTabIndex = 0;
		this._activeTerminalInstanceIndex = 0;
		this._isShuttingDown = false;

		this._onActiveTabChanged = new Emitter<void>();
		this._onTabDisposed = new Emitter<ITerminalTab>();
		this._onInstanceDisposed = new Emitter<ITerminalInstance>();
		this._onInstanceProcessIdReady = new Emitter<ITerminalInstance>();
		this._onInstanceTitleChanged = new Emitter<string>();
		this._onInstancesChanged = new Emitter<string>();

		lifecycleService.onWillShutdown(event => event.veto(this._onWillShutdown()));
		lifecycleService.onShutdown(() => this._onShutdown());
		this._terminalFocusContextKey = KEYBINDING_CONTEXT_TERMINAL_FOCUS.bindTo(this._contextKeyService);
		this._findWidgetVisible = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);
		this.onTabDisposed(tab => this._removeTab(tab));
	}

	protected abstract _showTerminalCloseConfirmation(): TPromise<boolean>;
	public abstract createInstance(shell?: IShellLaunchConfig, wasNewTerminalAction?: boolean): ITerminalInstance;
	public abstract getActiveOrCreateInstance(wasNewTerminalAction?: boolean): ITerminalInstance;
	public abstract selectDefaultWindowsShell(): TPromise<string>;
	public abstract setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;

	private _onWillShutdown(): boolean | TPromise<boolean> {
		if (this.terminalInstances.length === 0) {
			// No terminal instances, don't veto
			return false;
		}

		if (this.configHelper.config.confirmOnExit) {
			// veto if configured to show confirmation and the user choosed not to exit
			return this._showTerminalCloseConfirmation().then(veto => {
				if (!veto) {
					this._isShuttingDown = true;
				}
				return veto;
			});
		}

		this._isShuttingDown = true;

		return false;
	}

	private _onShutdown(): void {
		this.terminalInstances.forEach(instance => instance.dispose());
	}

	public getTabLabels(): string[] {
		return this._terminalTabs.map((tab, index) => `${index + 1}: ${tab.title}`);
	}

	private _removeTab(tab: ITerminalTab): void {
		// Get the index of the tab and remove it from the list
		const index = this._terminalTabs.indexOf(tab);
		const wasActiveTab = tab === this._getActiveTab();
		if (index !== -1) {
			this._terminalTabs.splice(index, 1);
		}

		// Adjust focus if the tab was active
		if (wasActiveTab && this._terminalTabs.length > 0) {
			let newIndex = index < this._terminalTabs.length ? index : this._terminalTabs.length - 1;
			this.setActiveInstanceByIndex(newIndex);
			// TODO: Needs to be made to work with multiple instances in a tab
			if (tab.terminalInstances[0].hadFocusOnExit) {
				this.getActiveInstance().focus(true);
			}
		}
		// Hide the panel if there are no more instances, provided that VS Code is not shutting
		// down. When shutting down the panel is locked in place so that it is restored upon next
		// launch.
		if (this._terminalTabs.length === 0 && !this._isShuttingDown) {
			this.hidePanel();
		}
		// TODO: This should be onTabsChanged?
		this._onInstancesChanged.fire();
		if (wasActiveTab) {
			this._onActiveTabChanged.fire();
		}
	}

	private _getActiveTab(): ITerminalTab {
		// TODO: TerminalService needs to track the active tab
		// TODO: The tab should track its active instance
		if (this.activeTerminalInstanceIndex < 0 || this.activeTerminalInstanceIndex >= this._terminalTabs.length) {
			return null;
		}
		return this._terminalTabs[this.activeTerminalInstanceIndex];
	}

	public getActiveInstance(): ITerminalInstance {
		if (this.activeTerminalInstanceIndex < 0 || this.activeTerminalInstanceIndex >= this.terminalInstances.length) {
			return null;
		}
		return this.terminalInstances[this.activeTerminalInstanceIndex];
	}

	public getInstanceFromId(terminalId: number): ITerminalInstance {
		return this.terminalInstances[this._getIndexFromId(terminalId)];
	}

	public getInstanceFromIndex(terminalIndex: number): ITerminalInstance {
		return this.terminalInstances[terminalIndex];
	}

	public setActiveInstance(terminalInstance: ITerminalInstance): void {
		this.setActiveInstanceByIndex(this._getIndexFromId(terminalInstance.id));
	}

	public setActiveTabByIndex(tabIndex: number): void {
		if (tabIndex >= this._terminalTabs.length) {
			return;
		}

		const didTabChange = this._activeTabIndex !== tabIndex;
		this._activeTabIndex = tabIndex;

		this._terminalTabs.forEach((t, i) => t.setVisible(i === this._activeTabIndex));
		if (didTabChange) {
			this._onActiveTabChanged.fire();
		}
	}

	// TODO: Remove setActiveInstanceByIndex?
	public setActiveInstanceByIndex(terminalIndex: number): void {
		if (terminalIndex >= this._terminalInstances.length) {
			return;
		}
		const didInstanceChange = this._activeTerminalInstanceIndex !== terminalIndex;
		this._activeTerminalInstanceIndex = terminalIndex;

		// TODO: Optimize
		const activeInstance = this.terminalInstances[this.activeTerminalInstanceIndex];
		this._terminalTabs.forEach(t => {
			t.setVisible(t.terminalInstances.indexOf(activeInstance) !== -1);
		});

		// this._terminalInstances.forEach((terminalInstance, i) => {
		// 	terminalInstance.setVisible(i === terminalIndex);
		// });
		// Only fire the event if there was a change
		if (didInstanceChange) {
			// TODO: If this method is being kept this should only fire when the tab is actually changed
			this._onActiveTabChanged.fire();
		}
	}

	public setActiveInstanceToNext(): void {
		if (this.terminalInstances.length <= 1) {
			return;
		}
		let newIndex = this._activeTerminalInstanceIndex + 1;
		if (newIndex >= this.terminalInstances.length) {
			newIndex = 0;
		}
		this.setActiveInstanceByIndex(newIndex);
	}

	public setActiveInstanceToPrevious(): void {
		if (this.terminalInstances.length <= 1) {
			return;
		}
		let newIndex = this._activeTerminalInstanceIndex - 1;
		if (newIndex < 0) {
			newIndex = this.terminalInstances.length - 1;
		}
		this.setActiveInstanceByIndex(newIndex);
	}

	public splitInstanceVertically(instanceToSplit: ITerminalInstance): void {
		const tab = this._getTabForInstance(instanceToSplit);
		if (!tab) {
			return;
		}
		const instance = tab.split(this._terminalFocusContextKey, this.configHelper, {});
		// TOOD: The below should be shared with ITerminalService.createInstance
		tab.addDisposable(tab.onDisposed(this._onTabDisposed.fire, this._onTabDisposed));
		instance.addDisposable(instance.onDisposed(this._onInstanceDisposed.fire, this._onInstanceDisposed));
		instance.addDisposable(instance.onTitleChanged(this._onInstanceTitleChanged.fire, this._onInstanceTitleChanged));
		instance.addDisposable(instance.onProcessIdReady(this._onInstanceProcessIdReady.fire, this._onInstanceProcessIdReady));
		this._onInstancesChanged.fire();

		// TODO: This shouldn't be needed
		tab.setVisible(true);
	}

	private _getTabForInstance(instance: ITerminalInstance): ITerminalTab {
		let instanceIndex = this._activeTabIndex;
		let currentTabIndex = 0;
		while (instanceIndex >= 0 && currentTabIndex < this._terminalTabs.length) {
			const tab = this._terminalTabs[currentTabIndex];
			const count = tab.terminalInstances.length;
			if (instanceIndex < count) {
				return tab;
			}
			if (instanceIndex > count) {
				instanceIndex -= count;
			}
		}
		return null;
	}

	public showPanel(focus?: boolean): TPromise<void> {
		return new TPromise<void>((complete) => {
			let panel = this._panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				return this._panelService.openPanel(TERMINAL_PANEL_ID, focus).then(() => {
					if (focus) {
						// Do the focus call asynchronously as going through the
						// command palette will force editor focus
						setTimeout(() => this.getActiveInstance().focus(true), 0);
					}
					complete(void 0);
				});
			} else {
				if (focus) {
					// Do the focus call asynchronously as going through the
					// command palette will force editor focus
					setTimeout(() => this.getActiveInstance().focus(true), 0);
				}
				complete(void 0);
			}
			return undefined;
		});
	}

	public hidePanel(): void {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this._partService.setPanelHidden(true).done(undefined, errors.onUnexpectedError);
		}
	}

	public abstract focusFindWidget(): TPromise<void>;
	public abstract hideFindWidget(): void;
	public abstract showNextFindTermFindWidget(): void;
	public abstract showPreviousFindTermFindWidget(): void;

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.terminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.id === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	public setWorkspaceShellAllowed(isAllowed: boolean): void {
		this.configHelper.setWorkspaceShellAllowed(isAllowed);
	}
}
