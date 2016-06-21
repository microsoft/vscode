/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import cp = require('child_process');
import os = require('os');
import path = require('path');
import platform = require('vs/base/common/platform');
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IStringDictionary} from 'vs/base/common/collections';
import {ITerminalProcess, ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {TPromise} from 'vs/base/common/winjs.base';
import {TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {TerminalPanel} from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';

export class TerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	private terminalProcesses: ITerminalProcess[] = [];
	private configHelper: TerminalConfigHelper;
	private _onActiveInstanceChanged: Emitter<string>;
	private _onInstancesChanged: Emitter<string>;
	private _onInstanceTitleChanged: Emitter<string>;

	constructor(
		@IPanelService private panelService: IPanelService,
		@IPartService private partService: IPartService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		this._onActiveInstanceChanged = new Emitter<string>();
		this._onInstancesChanged = new Emitter<string>();
		this._onInstanceTitleChanged = new Emitter<string>();
	}

	// TODO: Hook up
	public get onActiveInstanceChanged(): Event<string> {
		return this._onActiveInstanceChanged.event;
	}

	public get onInstancesChanged(): Event<string> {
		return this._onInstancesChanged.event;
	}

	// TODO: Hook up
	public get onInstanceTitleChanged(): Event<string> {
		return this._onInstanceTitleChanged.event;
	}

	public focus(): TPromise<any> {
		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}

	public focusNext(): TPromise<any> {
		return this.focus().then(() => {
			return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
				terminalPanel.focusNext();
			});
		});
	}

	public focusPrevious(): TPromise<any> {
		return this.focus().then(() => {
			return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
				terminalPanel.focusPrevious();
			});
		});
	}

	public toggle(): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return TPromise.as(null);
		}

		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}

	public createNew(): TPromise<any> {
		return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
			terminalPanel.createNewTerminalInstance();
		});
	}

	public close(): TPromise<any> {
		return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
			terminalPanel.closeActiveTerminal();
		});
	}

	private toggleAndGetTerminalPanel(): TPromise<TerminalPanel> {
		return new TPromise<TerminalPanel>((complete) => {
			let panel = this.panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				this.toggle().then(() => {
					panel = this.panelService.getActivePanel();
					complete(<TerminalPanel>panel);
				});
			}
			complete(<TerminalPanel>panel);
		});
	}

	public getActiveTerminalIndex(): number {
		// TODO: Pull active terminal logic into TerminalService
		return 0;
	}

	public getTerminalInstanceTitles(): string[] {
		return this.terminalProcesses.map((process) => process.title);
	}

	public initConfigHelper(panelElement: HTMLElement): void {
		if (!this.configHelper) {
			this.configHelper = new TerminalConfigHelper(platform.platform, this.configurationService, panelElement);
		}
	}

	public killTerminalProcess(terminalProcess: ITerminalProcess): void {
		terminalProcess.process.kill();
		this.terminalProcesses.slice(this.terminalProcesses.indexOf(terminalProcess), 1);
		this._onInstancesChanged.fire();
	}

	public createTerminalProcess(): ITerminalProcess {
		let env = this.cloneEnv();
		let shell = this.configHelper.getShell();
		env['PTYPID'] = process.pid.toString();
		env['PTYSHELL'] = shell.executable;
		shell.args.forEach((arg, i) => {
			env[`PTYSHELLARG${i}`] = arg;
		});
		env['PTYCWD'] = this.contextService.getWorkspace() ? this.contextService.getWorkspace().resource.fsPath : os.homedir();
		let terminalProcess = {
			title: '',
			process: cp.fork('./terminalProcess', [], {
				env: env,
				cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
			})
		};
		this.terminalProcesses.push(terminalProcess);
		this._onInstancesChanged.fire();
		return terminalProcess;
	}

	private cloneEnv(): IStringDictionary<string> {
		let newEnv: IStringDictionary<string> = Object.create(null);
		Object.keys(process.env).forEach((key) => {
			newEnv[key] = process.env[key];
		});
		return newEnv;
	}
}