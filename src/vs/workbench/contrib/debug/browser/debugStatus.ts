/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { IDebugService, State, IDebugConfiguration } from '../common/debug.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStatusbarEntry, IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class DebugStatusContribution implements IWorkbenchContribution {

	private showInStatusBar!: 'never' | 'always' | 'onFirstSessionStart';
	private toDispose: IDisposable[] = [];
	private entryAccessor: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusBarService: IStatusbarService,
		@IDebugService private readonly debugService: IDebugService,
		@IConfigurationService configurationService: IConfigurationService
	) {

		const addStatusBarEntry = () => {
			this.entryAccessor = this.statusBarService.addEntry(this.entry, 'status.debug', StatusbarAlignment.LEFT, 30 /* Low Priority */);
		};

		const setShowInStatusBar = () => {
			this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
			if (this.showInStatusBar === 'always' && !this.entryAccessor) {
				addStatusBarEntry();
			}
		};
		setShowInStatusBar();

		this.toDispose.push(this.debugService.onDidChangeState(state => {
			if (state !== State.Inactive && this.showInStatusBar === 'onFirstSessionStart' && !this.entryAccessor) {
				addStatusBarEntry();
			}
		}));
		this.toDispose.push(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.showInStatusBar')) {
				setShowInStatusBar();
				if (this.entryAccessor && this.showInStatusBar === 'never') {
					this.entryAccessor.dispose();
					this.entryAccessor = undefined;
				}
			}
		}));
		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(e => {
			this.entryAccessor?.update(this.entry);
		}));
	}

	private get entry(): IStatusbarEntry {
		let text = '';
		const manager = this.debugService.getConfigurationManager();
		const name = manager.selectedConfiguration.name || '';
		const nameAndLaunchPresent = name && manager.selectedConfiguration.launch;
		if (nameAndLaunchPresent) {
			text = (manager.getLaunches().length > 1 ? `${name} (${manager.selectedConfiguration.launch!.name})` : name);
		}

		return {
			name: nls.localize('status.debug', "Debug"),
			text: '$(debug-alt-small) ' + text,
			ariaLabel: nls.localize('debugTarget', "Debug: {0}", text),
			tooltip: nls.localize('selectAndStartDebug', "Select and Start Debug Configuration"),
			command: 'workbench.action.debug.selectandstart'
		};
	}

	dispose(): void {
		this.entryAccessor?.dispose();
		dispose(this.toDispose);
	}
}
