/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import platform = require('vs/base/common/platform');
import { Builder } from 'vs/base/browser/builder';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITerminalInstance, ITerminalService, KEYBINDING_CONTEXT_TERMINAL_FOCUS, TERMINAL_PANEL_ID } from 'vs/workbench/parts/terminal/electron-browser/terminal';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TPromise } from 'vs/base/common/winjs.base';
import { TerminalConfigHelper, IShell } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';

export class TerminalService implements ITerminalService {
	public _serviceBrand: any;

	private _activeTerminalInstanceIndex: number = 0;
	private _configHelper: TerminalConfigHelper;
	private _onActiveInstanceChanged: Emitter<string>;
	private _onInstancesChanged: Emitter<string>;
	private _onInstanceTitleChanged: Emitter<string>;
	private _terminalInstances: ITerminalInstance[] = [];
	public get activeTerminalInstanceIndex(): number { return this._activeTerminalInstanceIndex; }
	public get configHelper(): TerminalConfigHelper { return this._configHelper; }
	public get onActiveInstanceChanged(): Event<string> { return this._onActiveInstanceChanged.event; }
	public get onInstancesChanged(): Event<string> { return this._onInstancesChanged.event; }
	public get onInstanceTitleChanged(): Event<string> { return this._onInstanceTitleChanged.event; }
	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }

	private terminalContainer: HTMLElement;
	private terminalFocusContextKey: IContextKey<boolean>;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPanelService private panelService: IPanelService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService
	) {
		this._onActiveInstanceChanged = new Emitter<string>();
		this._onInstancesChanged = new Emitter<string>();
		this._onInstanceTitleChanged = new Emitter<string>();
		this.terminalFocusContextKey = KEYBINDING_CONTEXT_TERMINAL_FOCUS.bindTo(this.contextKeyService);
		this._configHelper = <TerminalConfigHelper>this.instantiationService.createInstance(TerminalConfigHelper, platform.platform);
	}

	public createInstance(name?: string, shellPath?: string, shellArgs?: string[]): ITerminalInstance {
		let shell: IShell = {
			executable: shellPath,
			args: shellArgs
		};
		let terminalInstance = <TerminalInstance>this.instantiationService.createInstance(TerminalInstance,
			this.terminalFocusContextKey,
			this.onTerminalInstanceDispose.bind(this),
			this._configHelper,
			this.terminalContainer,
			this.workspaceContextService.getWorkspace(),
			name,
			shell);
		terminalInstance.addDisposable(terminalInstance.onTitleChanged(this._onInstanceTitleChanged.fire, this._onInstanceTitleChanged));
		this.terminalInstances.push(terminalInstance);
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically
			this.setActiveInstanceByIndex(0);
		}
		this._onInstancesChanged.fire();
		return terminalInstance;
	}

	public getInstanceLabels(): string[] {
		return this._terminalInstances.map((instance, index) => `${index + 1}: ${instance.title}`);
	}

	private onTerminalInstanceDispose(terminalInstance: TerminalInstance): void {
		let index = this.terminalInstances.indexOf(terminalInstance);
		let wasActiveInstance = terminalInstance === this.getActiveInstance();
		if (index !== -1) {
			this.terminalInstances.splice(index, 1);
		}
		if (wasActiveInstance && this.terminalInstances.length > 0) {
			let newIndex = index < this.terminalInstances.length ? index : this.terminalInstances.length - 1;
			this.setActiveInstanceByIndex(newIndex);
		}
		if (this.terminalInstances.length === 0) {
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
		return this.terminalInstances[this.getIndexFromId(terminalId)];
	}

	public setActiveInstance(terminalInstance: ITerminalInstance): void {
		this.setActiveInstanceByIndex(this.getIndexFromId(terminalInstance.id));
	}

	public setActiveInstanceByIndex(terminalIndex: number): void {
		this._activeTerminalInstanceIndex = terminalIndex;
		this._terminalInstances.forEach((terminalInstance, i) => {
			terminalInstance.setVisible(i === terminalIndex);
		});
		this._onActiveInstanceChanged.fire();
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

	public setContainers(panelContainer: Builder, terminalContainer: HTMLElement): void {
		this._configHelper.panelContainer = panelContainer;
		this.terminalContainer = terminalContainer;
		this._terminalInstances.forEach(terminalInstance => {
			terminalInstance.attachToElement(this.terminalContainer);
		});
	}

	public showPanel(focus?: boolean): TPromise<void> {
		return new TPromise<void>((complete) => {
			let panel = this.panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				return this.panelService.openPanel(TERMINAL_PANEL_ID, focus).then(() => {
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
		});
	}

	public hidePanel(): void {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);
		}
	}

	public togglePanel(): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);
			return TPromise.as(null);
		}
		this.showPanel(true);
	}

	private getIndexFromId(terminalId: number): number {
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
}
