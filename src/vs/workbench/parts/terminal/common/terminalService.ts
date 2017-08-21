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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalConfigHelper, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, TERMINAL_PANEL_ID } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';

export abstract class TerminalService implements ITerminalService {
	public _serviceBrand: any;

	protected _isShuttingDown: boolean;
	protected _terminalFocusContextKey: IContextKey<boolean>;
	protected _findWidgetVisible: IContextKey<boolean>;
	protected _terminalContainer: HTMLElement;
	protected _onInstancesChanged: Emitter<string>;
	protected _onInstanceDisposed: Emitter<ITerminalInstance>;
	protected _onInstanceProcessIdReady: Emitter<ITerminalInstance>;
	protected _onInstanceData: Emitter<{ instance: ITerminalInstance, data: string }>;
	protected _onInstanceTitleChanged: Emitter<string>;
	protected _terminalInstances: ITerminalInstance[];

	private _activeTerminalInstanceIndex: number;
	private _onActiveInstanceChanged: Emitter<string>;

	public get activeTerminalInstanceIndex(): number { return this._activeTerminalInstanceIndex; }
	public get onActiveInstanceChanged(): Event<string> { return this._onActiveInstanceChanged.event; }
	public get onInstanceDisposed(): Event<ITerminalInstance> { return this._onInstanceDisposed.event; }
	public get onInstanceProcessIdReady(): Event<ITerminalInstance> { return this._onInstanceProcessIdReady.event; }
	public get onInstanceData(): Event<{ instance: ITerminalInstance, data: string }> { return this._onInstanceData.event; }
	public get onInstanceTitleChanged(): Event<string> { return this._onInstanceTitleChanged.event; }
	public get onInstancesChanged(): Event<string> { return this._onInstancesChanged.event; }
	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }

	public abstract get configHelper(): ITerminalConfigHelper;

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IPanelService protected _panelService: IPanelService,
		@IPartService private _partService: IPartService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		this._terminalInstances = [];
		this._activeTerminalInstanceIndex = 0;
		this._isShuttingDown = false;

		this._onActiveInstanceChanged = new Emitter<string>();
		this._onInstanceDisposed = new Emitter<ITerminalInstance>();
		this._onInstanceProcessIdReady = new Emitter<ITerminalInstance>();
		this._onInstanceData = new Emitter<{ instance: ITerminalInstance, data: string }>();
		this._onInstanceTitleChanged = new Emitter<string>();
		this._onInstancesChanged = new Emitter<string>();

		this._configurationService.onDidUpdateConfiguration(() => this.updateConfig());
		lifecycleService.onWillShutdown(event => event.veto(this._onWillShutdown()));
		this._terminalFocusContextKey = KEYBINDING_CONTEXT_TERMINAL_FOCUS.bindTo(this._contextKeyService);
		this._findWidgetVisible = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);
		this.onInstanceDisposed((terminalInstance) => { this._removeInstance(terminalInstance); });
	}

	protected abstract _showTerminalCloseConfirmation(): boolean;
	public abstract createInstance(shell?: IShellLaunchConfig, wasNewTerminalAction?: boolean): ITerminalInstance;
	public abstract getActiveOrCreateInstance(wasNewTerminalAction?: boolean): ITerminalInstance;
	public abstract selectDefaultWindowsShell(): TPromise<string>;
	public abstract setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;

	private _onWillShutdown(): boolean {
		if (this.terminalInstances.length === 0) {
			// No terminal instances, don't veto
			return false;
		}

		if (this.configHelper.config.confirmOnExit) {
			// veto if configured to show confirmation and the user choosed not to exit
			if (this._showTerminalCloseConfirmation()) {
				return true;
			}
		}

		// Dispose all terminal instances and don't veto
		this._isShuttingDown = true;
		this.terminalInstances.forEach(instance => {
			instance.dispose();
		});
		return false;
	}

	public getInstanceLabels(): string[] {
		return this._terminalInstances.map((instance, index) => `${index + 1}: ${instance.title}`);
	}

	private _removeInstance(terminalInstance: ITerminalInstance): void {
		let index = this.terminalInstances.indexOf(terminalInstance);
		let wasActiveInstance = terminalInstance === this.getActiveInstance();
		if (index !== -1) {
			this.terminalInstances.splice(index, 1);
		}
		if (wasActiveInstance && this.terminalInstances.length > 0) {
			let newIndex = index < this.terminalInstances.length ? index : this.terminalInstances.length - 1;
			this.setActiveInstanceByIndex(newIndex);
			if (terminalInstance.hadFocusOnExit) {
				this.getActiveInstance().focus(true);
			}
		}
		// Hide the panel if there are no more instances, provided that VS Code is not shutting
		// down. When shutting down the panel is locked in place so that it is restored upon next
		// launch.
		if (this.terminalInstances.length === 0 && !this._isShuttingDown) {
			this.hidePanel();
		}
		this._onInstancesChanged.fire();
		if (wasActiveInstance) {
			this._onActiveInstanceChanged.fire();
		}
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

	public setActiveInstanceByIndex(terminalIndex: number): void {
		if (terminalIndex >= this._terminalInstances.length) {
			return;
		}
		const didInstanceChange = this._activeTerminalInstanceIndex !== terminalIndex;
		this._activeTerminalInstanceIndex = terminalIndex;
		this._terminalInstances.forEach((terminalInstance, i) => {
			terminalInstance.setVisible(i === terminalIndex);
		});
		// Only fire the event if there was a change
		if (didInstanceChange) {
			this._onActiveInstanceChanged.fire();
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

	public showPanel(focus?: boolean): TPromise<void> {
		return new TPromise<void>((complete) => {
			let panel = this._panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				return this._panelService.openPanel(TERMINAL_PANEL_ID, focus).then(() => {
					if (focus) {
						this.getActiveInstance().focus(true);
					}
					complete(void 0);
				});
			} else {
				if (focus) {
					this.getActiveInstance().focus(true);
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

	public updateConfig(): void {
		this.terminalInstances.forEach(instance => instance.updateConfig());
	}

	public setWorkspaceShellAllowed(isAllowed: boolean): void {
		this.configHelper.setWorkspaceShellAllowed(isAllowed);
	}
}
