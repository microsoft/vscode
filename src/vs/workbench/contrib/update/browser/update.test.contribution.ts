/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { DisablementReason, IUpdateService, State, StateType, UpdateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';

const testUpdate = { version: 'test-commit-id', productVersion: '1.109.0', timestamp: Date.now() };

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const TEST_UPDATE_PICKER_COMMAND = 'update.test.showPicker';

interface UpdateTestQuickPickItem extends IQuickPickItem {
	apply(updateService: IUpdateService, quickInputService: IQuickInputService): void | Promise<void>;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TEST_UPDATE_PICKER_COMMAND,
			title: localize2('update.testPicker', "Test Update: Set State"),
			category: Categories.Developer,
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const updateService = accessor.get(IUpdateService);
		const totalBytes = 100 * 1024 * 1024;

		const picks: (UpdateTestQuickPickItem | IQuickPickSeparator)[] = [
			// --- Flows ---
			{ type: 'separator', label: 'Flows (Automated)' },
			{
				label: '$(play) Full Update Flow (Check \u2192 Download \u2192 Install \u2192 Restart)',
				apply: async svc => {
					svc.testSetState(State.CheckingForUpdates(true));
					await delay(1500);
					svc.testSetState(State.AvailableForDownload(testUpdate));
					await delay(2000);
					svc.testSetState(State.Downloading(testUpdate, true, false, 0, totalBytes, Date.now()));
					for (let i = 1; i <= 4; i++) {
						await delay(800);
						svc.testSetState(State.Downloading(testUpdate, true, false, (i / 4) * totalBytes, totalBytes, Date.now() - 3000));
					}
					svc.testSetState(State.Downloaded(testUpdate, true, false));
					await delay(2000);
					svc.testSetState(State.Updating(testUpdate, 0, 100));
					for (let i = 1; i <= 4; i++) {
						await delay(600);
						svc.testSetState(State.Updating(testUpdate, i * 25, 100));
					}
					svc.testSetState(State.Ready(testUpdate, true, false));
				}
			},
			{
				label: '$(play) Background Update Flow (Check \u2192 Ready)',
				apply: async svc => {
					svc.testSetState(State.CheckingForUpdates(true));
					await delay(1500);
					svc.testSetState(State.Downloading(testUpdate, true, false, 0, totalBytes, Date.now()));
					for (let i = 1; i <= 4; i++) {
						await delay(500);
						svc.testSetState(State.Downloading(testUpdate, true, false, (i / 4) * totalBytes, totalBytes, Date.now() - 2000));
					}
					await delay(500);
					svc.testSetState(State.Ready(testUpdate, true, false));
				}
			},
			{
				label: '$(play) Error Flow (Check \u2192 Error)',
				apply: async svc => {
					svc.testSetState(State.CheckingForUpdates(true));
					await delay(2000);
					svc.testSetState(State.Idle(UpdateType.Archive, 'The network connection was lost'));
				}
			},

			// --- Entry Points ---
			{ type: 'separator', label: 'Entry Points (Step Indicator)' },
			{
				label: '$(target) Enter at Step 1: Download',
				apply: svc => svc.testSetState(State.AvailableForDownload(testUpdate)),
			},
			{
				label: '$(target) Enter at Step 2: Install',
				apply: svc => svc.testSetState(State.Downloaded(testUpdate, true, false)),
			},
			{
				label: '$(target) Enter at Step 3: Apply (Restart)',
				apply: svc => svc.testSetState(State.Ready(testUpdate, true, false)),
			},

			// --- Disabled ---
			{ type: 'separator', label: 'Disabled' },
			{ label: '$(circle-slash) Disabled: Not Built', apply: svc => svc.testSetState(State.Disabled(DisablementReason.NotBuilt)) },
			{ label: '$(circle-slash) Disabled: Manually', apply: svc => svc.testSetState(State.Disabled(DisablementReason.ManuallyDisabled)) },
			{ label: '$(circle-slash) Disabled: Policy', apply: svc => svc.testSetState(State.Disabled(DisablementReason.Policy)) },
			{ label: '$(circle-slash) Disabled: Running as Admin', apply: svc => svc.testSetState(State.Disabled(DisablementReason.RunningAsAdmin)) },
			{ label: '$(circle-slash) Disabled: Environment', apply: svc => svc.testSetState(State.Disabled(DisablementReason.DisabledByEnvironment)) },
			{ label: '$(circle-slash) Disabled: Missing Config', apply: svc => svc.testSetState(State.Disabled(DisablementReason.MissingConfiguration)) },
			{ label: '$(circle-slash) Disabled: Invalid Config', apply: svc => svc.testSetState(State.Disabled(DisablementReason.InvalidConfiguration)) },

			// --- Idle ---
			{ type: 'separator', label: 'Idle' },
			{ label: '$(check) Idle: Up to Date', apply: svc => svc.testSetState(State.Idle(UpdateType.Archive)) },
			{ label: '$(info) Idle: Not Available', apply: svc => svc.testSetState(State.Idle(UpdateType.Archive, undefined, true)) },
			{ label: '$(error) Idle: Timeout Error', apply: svc => svc.testSetState(State.Idle(UpdateType.Archive, 'The request timed out')) },
			{ label: '$(error) Idle: Network Error', apply: svc => svc.testSetState(State.Idle(UpdateType.Archive, 'The network connection was lost')) },
			{ label: '$(error) Idle: Other Error', apply: svc => svc.testSetState(State.Idle(UpdateType.Archive, 'Some other error')) },

			// --- Active states ---
			{ type: 'separator', label: 'Active States' },
			{ label: '$(sync~spin) Checking for Updates', apply: svc => svc.testSetState(State.CheckingForUpdates(true)) },
			{ label: '$(cloud-download) Available for Download', apply: svc => svc.testSetState(State.AvailableForDownload(testUpdate)) },
			{ label: '$(loading~spin) Downloading: No Progress', apply: svc => svc.testSetState(State.Downloading(testUpdate, true, false)) },
			{ label: '$(loading~spin) Downloading: 25%', apply: svc => svc.testSetState(State.Downloading(testUpdate, true, false, 0.25 * totalBytes, totalBytes, Date.now() - 30000)) },
			{ label: '$(loading~spin) Downloading: 75%', apply: svc => svc.testSetState(State.Downloading(testUpdate, true, false, 0.75 * totalBytes, totalBytes, Date.now() - 30000)) },
			{ label: '$(loading~spin) Downloading: 100%', apply: svc => svc.testSetState(State.Downloading(testUpdate, true, false, totalBytes, totalBytes, Date.now() - 30000)) },
			{ label: '$(desktop-download) Downloaded (Install)', apply: svc => svc.testSetState(State.Downloaded(testUpdate, true, false)) },
			{ label: '$(loading~spin) Updating: No Progress', apply: svc => svc.testSetState(State.Updating(testUpdate)) },
			{ label: '$(loading~spin) Updating: 25%', apply: svc => svc.testSetState(State.Updating(testUpdate, 25, 100)) },
			{ label: '$(loading~spin) Updating: 75%', apply: svc => svc.testSetState(State.Updating(testUpdate, 75, 100)) },
			{ label: '$(loading~spin) Updating: 100%', apply: svc => svc.testSetState(State.Updating(testUpdate, 100, 100)) },
			{ label: '$(check) Ready to Restart', apply: svc => svc.testSetState(State.Ready(testUpdate, true, false)) },
			{ label: '$(loading~spin) Overwriting', apply: svc => svc.testSetState(State.Overwriting(testUpdate, true)) },
		];

		const picked = await quickInputService.pick(picks, {
			placeHolder: localize('update.testPickerPlaceholder', "Select an update state to simulate (current: {0})", updateService.state.type),
		});
		if (picked && typeof (picked as typeof picks[number]).apply === 'function') {
			(picked as typeof picks[number]).apply(updateService, quickInputService);
		}
	}
});

class UpdateTestStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.updateTestStatusBar';

	private readonly entry: IStatusbarEntryAccessor;

	constructor(
		@IStatusbarService statusbarService: IStatusbarService,
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		this.entry = this._register(statusbarService.addEntry(
			this.getEntry(updateService.state),
			UpdateTestStatusBarContribution.ID,
			StatusbarAlignment.LEFT,
			-1000 // far left, out of the way
		));

		this._register(updateService.onStateChange(state => {
			this.entry.update(this.getEntry(state));
		}));
	}

	private getEntry(state: import('../../../../platform/update/common/update.js').State) {
		return {
			name: localize('update.testStatusBar', "Test Update State"),
			text: `$(beaker) ${state.type}`,
			ariaLabel: localize('update.testStatusBarAria', "Test Update State: {0}", state.type),
			command: TEST_UPDATE_PICKER_COMMAND,
			kind: state.type === StateType.Ready ? 'warning' as const : undefined,
		};
	}
}

registerWorkbenchContribution2(UpdateTestStatusBarContribution.ID, UpdateTestStatusBarContribution, WorkbenchPhase.BlockRestore);
