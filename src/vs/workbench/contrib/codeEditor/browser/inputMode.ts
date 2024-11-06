/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';

export class InputModeStatusContribution implements IWorkbenchContribution {

	public static ID: string = 'status.inputMode';

	// private showInStatusBar!: boolean;
	private readonly disposableStore: DisposableStore = new DisposableStore();
	private entryAccessor: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusBarService: IStatusbarService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this.disposableStore.add(this._configurationService.onDidChangeConfiguration(e => {
			// if (e.affectsConfiguration('showInputModeInStatusBar')) {
			// 	this._updateStatusBarEntry();
			// 	if (this.entryAccessor && !this.showInStatusBar) {
			// 		this.entryAccessor.dispose();
			// 		this.entryAccessor = undefined;
			// 	}
			// }
			if (e.affectsConfiguration('inputMode')) {
				this.entryAccessor?.update(this.entry);
			}
		}));
		this._updateStatusBarEntry();
	}

	private get entry(): IStatusbarEntry {
		// const inputMode = this._configurationService.getValue<boolean>('');
		return {
			text: 'Insert',
			name: 'Insert',
			ariaLabel: 'Insert',
		};
	}

	private _addStatusBarEntry = () => {
		this.entryAccessor = this.statusBarService.addEntry(this.entry, 'status.inputMode', StatusbarAlignment.RIGHT, 5);
	};

	private _updateStatusBarEntry = () => {
		// this.showInStatusBar = this._configurationService.getValue<boolean>('showInputModeInStatusBar');
		if (!this.entryAccessor) { // this.showInStatusBar
			this._addStatusBarEntry();
		}
	};

	public dispose(): void {
		this.disposableStore.dispose();
	}
}

registerWorkbenchContribution2(InputModeStatusContribution.ID, InputModeStatusContribution, WorkbenchPhase.Eventually);
