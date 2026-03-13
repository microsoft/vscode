/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { DisablementReason, IUpdateService, State, UpdateType } from '../../../../platform/update/common/update.js';

const testUpdate = { version: 'test-commit-id', productVersion: '1.109.0', timestamp: Date.now() };

function setUpdateState(updateService: IUpdateService, state: State): void {
	(updateService as { state: State }).state = state;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.disabled',
			title: localize2('update.testDisabled', "Test Update: Disabled"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit1
			},
		});
	}
	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const updateService = accessor.get(IUpdateService);
		const picks = [
			{ label: 'Manually Disabled', reason: DisablementReason.ManuallyDisabled },
			{ label: 'Disabled by Policy', reason: DisablementReason.Policy },
			{ label: 'Running as Admin', reason: DisablementReason.RunningAsAdmin },
			{ label: 'Disabled by Environment', reason: DisablementReason.DisabledByEnvironment },
			{ label: 'Missing Configuration', reason: DisablementReason.MissingConfiguration },
			{ label: 'Invalid Configuration', reason: DisablementReason.InvalidConfiguration },
			{ label: 'Not Built', reason: DisablementReason.NotBuilt },
		];
		const picked = await quickInputService.pick(picks, { placeHolder: 'Select disablement reason' });
		if (picked) {
			setUpdateState(updateService, State.Disabled(picked.reason));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.idle',
			title: localize2('testIdle', "Test Update: Idle"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit2
			}
		});
	}
	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const updateService = accessor.get(IUpdateService);
		const picks = [
			{ label: 'No Error', error: undefined, notAvailable: undefined },
			{ label: 'Not Available', error: undefined, notAvailable: true as boolean | undefined },
			{ label: 'The request timed out', error: 'The request timed out', notAvailable: undefined },
			{ label: 'The network connection was lost', error: 'The network connection was lost', notAvailable: undefined },
			{ label: 'Some Other Error', error: 'Some other error', notAvailable: undefined },
		];
		const picked = await quickInputService.pick(picks, { placeHolder: 'Select idle state error' });
		if (picked) {
			setUpdateState(updateService, State.Idle(UpdateType.Archive, picked.error, picked.notAvailable));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.checking',
			title: localize2('update.testChecking', "Test Update: Checking"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit3
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const updateService = accessor.get(IUpdateService);
		setUpdateState(updateService, State.CheckingForUpdates(true));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.available',
			title: localize2('update.testAvailable', "Test Update: Available"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit4
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const updateService = accessor.get(IUpdateService);
		setUpdateState(updateService, State.AvailableForDownload(testUpdate));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.downloading',
			title: localize2('update.testDownloading', "Test Update: Downloading"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit5
			}
		});
	}
	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const updateService = accessor.get(IUpdateService);
		const totalBytes = 100 * 1024 * 1024;
		const picks = [
			{ label: 'No Progress', downloaded: undefined as number | undefined, total: undefined as number | undefined, start: undefined as number | undefined },
			{ label: '25%', downloaded: 0.25 * totalBytes, total: totalBytes, start: Date.now() - 30000 },
			{ label: '75%', downloaded: 0.75 * totalBytes, total: totalBytes, start: Date.now() - 30000 },
			{ label: '100%', downloaded: totalBytes, total: totalBytes, start: Date.now() - 30000 },
		];
		const picked = await quickInputService.pick(picks, { placeHolder: 'Select download progress' });
		if (picked) {
			setUpdateState(updateService, State.Downloading(testUpdate, true, false, picked.downloaded, picked.total, picked.start));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.downloaded',
			title: localize2('update.testDownloaded', "Test Update: Downloaded"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit6
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const updateService = accessor.get(IUpdateService);
		setUpdateState(updateService, State.Downloaded(testUpdate, true, false));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.updating',
			title: localize2('update.testUpdating', "Test Update: Updating"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit7
			}
		});
	}
	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const updateService = accessor.get(IUpdateService);
		const picks = [
			{ label: 'No Progress', current: undefined as number | undefined, max: undefined as number | undefined },
			{ label: '25%', current: 25, max: 100 },
			{ label: '75%', current: 75, max: 100 },
			{ label: '100%', current: 100, max: 100 },
		];
		const picked = await quickInputService.pick(picks, { placeHolder: 'Select install progress' });
		if (picked) {
			setUpdateState(updateService, State.Updating(testUpdate, picked.current, picked.max));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.ready',
			title: localize2('update.testReady', "Test Update: Ready"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit8
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const updateService = accessor.get(IUpdateService);
		setUpdateState(updateService, State.Ready(testUpdate, true, false));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.overwriting',
			title: localize2('update.testOverwriting', "Test Update: Overwriting"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit9
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const updateService = accessor.get(IUpdateService);
		setUpdateState(updateService, State.Overwriting(testUpdate, true));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.installed',
			title: localize2('testInstalled', "Test Update: Installed"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit0
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const updateService = accessor.get(IUpdateService);
		setUpdateState(updateService, State.Idle(UpdateType.Archive, 'installed'));
	}
});
