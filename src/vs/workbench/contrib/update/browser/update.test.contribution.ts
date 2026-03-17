/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { DisablementReason, IUpdateService, State, UpdateType } from '../../../../platform/update/common/update.js';

const testUpdate = { version: 'test-commit-id', productVersion: '1.109.0', timestamp: Date.now() };
const totalBytes = 100 * 1024 * 1024;

interface TestUpdatePick extends IQuickPickItem {
	apply(updateService: IUpdateService): void;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test',
			title: localize2('update.test', "Test Update"),
			category: Categories.Developer,
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const updateService = accessor.get(IUpdateService);
		const storageService = accessor.get(IStorageService);
		const commandService = accessor.get(ICommandService);

		const picks: (TestUpdatePick | { type: 'separator'; label: string })[] = [
			// Disabled
			{ type: 'separator', label: 'Disabled' },
			{ label: 'Disabled: Manual', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.ManuallyDisabled)) },
			{ label: 'Disabled: Policy', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.Policy)) },
			{ label: 'Disabled: Running as Admin', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.RunningAsAdmin)) },
			{ label: 'Disabled: Environment', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.DisabledByEnvironment)) },
			{ label: 'Disabled: Missing Configuration', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.MissingConfiguration)) },
			{ label: 'Disabled: Invalid Configuration', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.InvalidConfiguration)) },
			{ label: 'Disabled: Not Built', apply: s => s.setStateForTesting(State.Disabled(DisablementReason.NotBuilt)) },

			// Idle
			{ type: 'separator', label: 'Idle' },
			{ label: 'Idle: No Error', apply: s => s.setStateForTesting(State.Idle(UpdateType.Archive)) },
			{ label: 'Idle: Not Available', apply: s => s.setStateForTesting(State.Idle(UpdateType.Archive, undefined, true)) },
			{ label: 'Idle: Request Timed Out', apply: s => s.setStateForTesting(State.Idle(UpdateType.Archive, 'The request timed out')) },
			{ label: 'Idle: Network Connection Lost', apply: s => s.setStateForTesting(State.Idle(UpdateType.Archive, 'The network connection was lost')) },
			{ label: 'Idle: Other Error', apply: s => s.setStateForTesting(State.Idle(UpdateType.Archive, 'Some other error')) },
			//{ label: 'Idle: Major/Minor Version Change', apply: s => s.setStateForTesting(State.Idle(UpdateType.Archive, undefined, false)) },

			// Checking
			{ type: 'separator', label: 'Checking' },
			{ label: 'Checking for Updates', apply: s => s.setStateForTesting(State.CheckingForUpdates(true)) },

			// Available
			{ type: 'separator', label: 'Available' },
			{ label: 'Available for Download', apply: s => s.setStateForTesting(State.AvailableForDownload(testUpdate)) },

			// Downloading
			{ type: 'separator', label: 'Downloading' },
			{ label: 'Downloading: No Progress', apply: s => s.setStateForTesting(State.Downloading(testUpdate, true, false)) },
			{ label: 'Downloading: 25%', apply: s => s.setStateForTesting(State.Downloading(testUpdate, true, false, 0.25 * totalBytes, totalBytes, Date.now() - 30000)) },
			{ label: 'Downloading: 75%', apply: s => s.setStateForTesting(State.Downloading(testUpdate, true, false, 0.75 * totalBytes, totalBytes, Date.now() - 30000)) },
			{ label: 'Downloading: 100%', apply: s => s.setStateForTesting(State.Downloading(testUpdate, true, false, totalBytes, totalBytes, Date.now() - 30000)) },

			// Downloaded
			{ type: 'separator', label: 'Downloaded' },
			{ label: 'Downloaded', apply: s => s.setStateForTesting(State.Downloaded(testUpdate, true, false)) },

			// Updating
			{ type: 'separator', label: 'Updating' },
			{ label: 'Updating: No Progress', apply: s => s.setStateForTesting(State.Updating(testUpdate)) },
			{ label: 'Updating: 25%', apply: s => s.setStateForTesting(State.Updating(testUpdate, 25, 100)) },
			{ label: 'Updating: 75%', apply: s => s.setStateForTesting(State.Updating(testUpdate, 75, 100)) },
			{ label: 'Updating: 100%', apply: s => s.setStateForTesting(State.Updating(testUpdate, 100, 100)) },

			// Ready
			{ type: 'separator', label: 'Ready' },
			{ label: 'Ready to Restart', apply: s => s.setStateForTesting(State.Ready(testUpdate, true, false)) },

			// Overwriting
			{ type: 'separator', label: 'Overwriting' },
			{ label: 'Overwriting', apply: s => s.setStateForTesting(State.Overwriting(testUpdate, true)) },

			// Installed
			{ type: 'separator', label: 'Installed' },
			{
				label: 'Installed', apply: s => {
					const data = { version: '1.0.0', commit: 'abcd123', timestamp: Date.now() - 60_000 };
					storageService.store('updateTitleBarEntry/lastKnownVersion', JSON.stringify(data), StorageScope.APPLICATION, StorageTarget.MACHINE);
					s.setStateForTesting(State.Idle(UpdateType.Archive, 'Test content'));
					commandService.executeCommand('workbench.action.reloadWindow');
				}
			},
		];

		const picked = await quickInputService.pick<TestUpdatePick>(picks, { placeHolder: 'Select update state' });
		if (picked) {
			picked.apply(updateService);
		}
	}
});
