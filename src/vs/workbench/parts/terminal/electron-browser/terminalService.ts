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
import {Builder} from 'vs/base/browser/builder';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
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
	public _serviceBrand: any;

	private activeTerminalIndex: number = 0;
	private terminalProcesses: ITerminalProcess[] = [];

	private configHelper: TerminalConfigHelper;
	private _onActiveInstanceChanged: Emitter<string>;
	private _onInstancesChanged: Emitter<string>;
	private _onInstanceTitleChanged: Emitter<string>;

	constructor(
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IPanelService private panelService: IPanelService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		this._onActiveInstanceChanged = new Emitter<string>();
		this._onInstancesChanged = new Emitter<string>();
		this._onInstanceTitleChanged = new Emitter<string>();
	}

	public get onActiveInstanceChanged(): Event<string> {
		return this._onActiveInstanceChanged.event;
	}

	public get onInstancesChanged(): Event<string> {
		return this._onInstancesChanged.event;
	}

	public get onInstanceTitleChanged(): Event<string> {
		return this._onInstanceTitleChanged.event;
	}

	public setActiveTerminal(index: number): TPromise<any> {
		return this.focus().then(() => {
			return this.showAndGetTerminalPanel().then((terminalPanel) => {
				this.activeTerminalIndex = index;
				terminalPanel.setActiveTerminal(this.activeTerminalIndex);
				terminalPanel.focus();
				this._onActiveInstanceChanged.fire();
			});
		});
	}

	public focus(): TPromise<any> {
		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}

	public focusNext(): TPromise<any> {
		return this.focus().then(() => {
			return this.showAndGetTerminalPanel().then((terminalPanel) => {
				if (this.terminalProcesses.length <= 1) {
					return;
				}
				this.activeTerminalIndex++;
				if (this.activeTerminalIndex >= this.terminalProcesses.length) {
					this.activeTerminalIndex = 0;
				}
				terminalPanel.setActiveTerminal(this.activeTerminalIndex);
				terminalPanel.focus();
				this._onActiveInstanceChanged.fire();
			});
		});
	}

	public focusPrevious(): TPromise<any> {
		return this.focus().then(() => {
			return this.showAndGetTerminalPanel().then((terminalPanel) => {
				if (this.terminalProcesses.length <= 1) {
					return;
				}
				this.activeTerminalIndex--;
				if (this.activeTerminalIndex < 0) {
					this.activeTerminalIndex = this.terminalProcesses.length - 1;
				}
				terminalPanel.setActiveTerminal(this.activeTerminalIndex);
				terminalPanel.focus();
				this._onActiveInstanceChanged.fire();
			});
		});
	}

	public runSelectedText(): TPromise<any> {
		return this.showAndGetTerminalPanel().then((terminalPanel) => {
			let editor = this.codeEditorService.getFocusedCodeEditor();
			let selection = editor.getModel().getValueInRange(editor.getSelection());
			// Add a new line if one doesn't already exist so the text is executed
			let text = selection + (selection[selection.length - 1] === '\n' ? '' : '\n');
			this.terminalProcesses[this.activeTerminalIndex].process.send({
				event: 'input',
				data: text
			});
		});
	}

	public toggle(): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return TPromise.as(null);
		}

		return this.show();
	}

	public show(): TPromise<any> {
		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}

	public hide(): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);
		}
		return TPromise.as(null);
	}

	public createNew(): TPromise<any> {
		let self = this;
		let processCount = this.terminalProcesses.length;

		return this.showAndGetTerminalPanel().then((terminalPanel) => {
			// terminalPanel will be null if createNew is called from the command before the
			// TerminalPanel has been initialized. In this case, skip creating the terminal here
			// data rely on TerminalPanel's constructor creating the new instance.
			if (!terminalPanel) {
				return TPromise.as(void 0);
			}

			// Only create a new process if none have been created since toggling the terminal panel
			if (processCount !== this.terminalProcesses.length) {
				return;
			}

			self.initConfigHelper(terminalPanel.getContainer());
			terminalPanel.createNewTerminalInstance(self.createTerminalProcess());
			self._onInstancesChanged.fire();
			return TPromise.as(void 0);
		});
	}

	public close(): TPromise<any> {
		return this.showAndGetTerminalPanel().then((terminalPanel) => {
			return terminalPanel.closeActiveTerminal();
		});
	}

	private showAndGetTerminalPanel(): TPromise<TerminalPanel> {
		return new TPromise<TerminalPanel>((complete) => {
			let panel = this.panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				this.show().then(() => {
					panel = this.panelService.getActivePanel();
					complete(<TerminalPanel>panel);
				});
			} else {
				complete(<TerminalPanel>panel);
			}
		});
	}

	public getActiveTerminalIndex(): number {
		return this.activeTerminalIndex;
	}

	public getTerminalInstanceTitles(): string[] {
		return this.terminalProcesses.map((process, index) => `${index + 1}: ${process.title}`);
	}

	public initConfigHelper(panelElement: Builder): void {
		if (!this.configHelper) {
			this.configHelper = new TerminalConfigHelper(platform.platform, this.configurationService, panelElement);
		}
	}

	public killTerminalProcess(terminalProcess: ITerminalProcess): void {
		if (terminalProcess.process.connected) {
			terminalProcess.process.disconnect();
			terminalProcess.process.kill();
		}

		let index = this.terminalProcesses.indexOf(terminalProcess);
		if (index >= 0) {
			let wasActiveTerminal = (index === this.getActiveTerminalIndex());
			// Push active index back if the closed process was before the active process
			if (this.getActiveTerminalIndex() >= index) {
				this.activeTerminalIndex = Math.max(0, this.activeTerminalIndex - 1);
			}
			this.terminalProcesses.splice(index, 1);
			this._onInstancesChanged.fire();
			if (wasActiveTerminal) {
				this._onActiveInstanceChanged.fire();
			}
		}
	}

	private createTerminalProcess(): ITerminalProcess {
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
		this.activeTerminalIndex = this.terminalProcesses.length - 1;
		this._onActiveInstanceChanged.fire();
		terminalProcess.process.on('message', (message) => {
			if (message.type === 'title') {
				terminalProcess.title = message.content;
				this._onInstanceTitleChanged.fire();
			}
		});
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