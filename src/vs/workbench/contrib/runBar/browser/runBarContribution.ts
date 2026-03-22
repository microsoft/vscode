/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/runBar.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IDebugService, ILaunch, State } from '../../debug/common/debug.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { mainWindow } from '../../../../base/browser/window.js';

export class RunBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.runBar';

	private readonly _domNode: HTMLElement;
	private readonly _profileSelect: HTMLSelectElement;
	private readonly _runBtn: HTMLButtonElement;
	private readonly _debugBtn: HTMLButtonElement;
	private readonly _stopBtn: HTMLButtonElement;

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();

		this._domNode = dom.$('.run-bar');
		this._domNode.setAttribute('aria-label', localize('runBar.ariaLabel', 'Run and Debug Bar'));

		// Profile select dropdown
		this._profileSelect = dom.append(this._domNode, dom.$('select.run-bar-profile')) as HTMLSelectElement;
		this._profileSelect.title = localize('runBar.selectProfile', 'Select Launch Profile');

		// Divider
		dom.append(this._domNode, dom.$('.run-bar-divider'));

		// Run button (no debug)
		this._runBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-run-btn')) as HTMLButtonElement;
		this._runBtn.title = localize('runBar.run', 'Run Without Debugging');
		dom.append(this._runBtn, dom.$('span.codicon.codicon-play'));
		dom.append(this._runBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.runLabel', 'Run');

		// Debug button
		this._debugBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-debug-btn')) as HTMLButtonElement;
		this._debugBtn.title = localize('runBar.debug', 'Start Debugging');
		dom.append(this._debugBtn, dom.$('span.codicon.codicon-debug-alt'));
		dom.append(this._debugBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.debugLabel', 'Debug');

		// Stop button (hidden when not running)
		this._stopBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-stop-btn')) as HTMLButtonElement;
		this._stopBtn.title = localize('runBar.stop', 'Stop');
		dom.append(this._stopBtn, dom.$('span.codicon.codicon-debug-stop'));
		dom.append(this._stopBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.stopLabel', 'Stop');

		// Insert into the title bar's right region
		const titlebarEl = this.layoutService.getContainer(mainWindow, Parts.TITLEBAR_PART);
		const titlebarRight = titlebarEl?.querySelector('.titlebar-right');
		if (titlebarRight) {
			titlebarRight.insertBefore(this._domNode, titlebarRight.firstChild);
		} else {
			// Fallback if title bar not available
			this.layoutService.activeContainer.appendChild(this._domNode);
		}

		// Wire up events
		this._register(dom.addDisposableListener(this._runBtn, dom.EventType.CLICK, () => this.startRun(true)));
		this._register(dom.addDisposableListener(this._debugBtn, dom.EventType.CLICK, () => this.startRun(false)));
		this._register(dom.addDisposableListener(this._stopBtn, dom.EventType.CLICK, () => this.stopAll()));
		this._register(dom.addDisposableListener(this._profileSelect, dom.EventType.CHANGE, () => this.onProfileSelected()));

		const configMgr = this.debugService.getConfigurationManager();
		this._register(configMgr.onDidSelectConfiguration(() => this.update()));
		this._register(configMgr.onDidChangeConfigurationProviders(() => this.update()));
		this._register(this.debugService.onDidChangeState(() => this.updateButtonStates()));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.update()));

		this.update();
	}

	private getSelectedConfig(): { launch: ILaunch; name: string } | undefined {
		const configMgr = this.debugService.getConfigurationManager();
		const allConfigs = configMgr.getAllConfigurations();
		const idx = this._profileSelect.selectedIndex;
		return allConfigs[idx];
	}

	private async startRun(noDebug: boolean): Promise<void> {
		const selected = this.getSelectedConfig();
		if (!selected) {
			return;
		}
		await this.debugService.startDebugging(selected.launch, selected.name, { noDebug });
	}

	private async stopAll(): Promise<void> {
		await this.debugService.stopSession(undefined);
	}

	private onProfileSelected(): void {
		const configMgr = this.debugService.getConfigurationManager();
		const allConfigs = configMgr.getAllConfigurations();
		const selected = allConfigs[this._profileSelect.selectedIndex];
		if (selected) {
			configMgr.selectConfiguration(selected.launch, selected.name);
		}
	}

	private update(): void {
		const configMgr = this.debugService.getConfigurationManager();
		const allConfigs = configMgr.getAllConfigurations();

		const hasConfigs = allConfigs.length > 0;
		this._domNode.classList.toggle('hidden', !hasConfigs);

		if (!hasConfigs) {
			return;
		}

		// Rebuild profile dropdown
		dom.clearNode(this._profileSelect);
		const selectedName = configMgr.selectedConfiguration.name;
		let selectedIndex = 0;

		allConfigs.forEach((cfg, idx) => {
			const option = dom.append(this._profileSelect, dom.$('option')) as HTMLOptionElement;
			option.textContent = cfg.name;
			option.value = cfg.name;
			if (cfg.name === selectedName) {
				selectedIndex = idx;
			}
		});

		this._profileSelect.selectedIndex = selectedIndex;

		this.updateButtonStates();
	}

	private updateButtonStates(): void {
		const state = this.debugService.state;
		const isRunning = state !== State.Inactive;
		const isInitializing = state === State.Initializing;

		this._runBtn.disabled = isRunning;
		this._debugBtn.disabled = isRunning;
		this._stopBtn.classList.toggle('hidden', !isRunning);
		this._stopBtn.disabled = isInitializing;

		// Show spinner on run/debug btn while initializing
		this._domNode.classList.toggle('run-bar-initializing', isInitializing);
	}

	override dispose(): void {
		this._domNode.remove();
		super.dispose();
	}
}

registerWorkbenchContribution2(RunBarContribution.ID, RunBarContribution, WorkbenchPhase.AfterRestored);
