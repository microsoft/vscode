/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IUpdateService, State, UpdateType } from '../../../../platform/update/common/update.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { localize2 } from '../../../../nls.js';
import { timeout } from '../../../../base/common/async.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';

const testUpdate = { version: 'test-commit-id', productVersion: '99.0.0' };

/**
 * Active test flow cleanup. Only one flow can be active at a time.
 */
let activeFlowDisposable: IDisposable | undefined;

function stopActiveFlow(): void {
	activeFlowDisposable?.dispose();
	activeFlowDisposable = undefined;
}

/**
 * Starts a test update flow. Intercepts the real update commands so that
 * clicking Download / Install / Restart in the UI advances to the next
 * test state instead of talking to the real update service.
 *
 * @param mode 'actionable' skips Downloading/Updating (Idle→Checking→Ready).
 *             'detailed' shows all states; Downloading and Updating auto-advance.
 */
function startTestFlow(updateService: IUpdateService, commandService: ICommandService, mode: 'actionable' | 'detailed'): void {
	stopActiveFlow();

	const disposables = new DisposableStore();
	activeFlowDisposable = disposables;

	// Helper to advance through an auto-progressing state (downloading or updating)
	async function autoProgress(states: State[], delayMs: number): Promise<void> {
		for (const s of states) {
			updateService.testSetState(s);
			await timeout(delayMs);
		}
	}

	if (mode === 'actionable') {
		// Flow: Idle → Checking (auto 1.5s) → Ready
		// User clicks "Restart to Update" to finish.

		updateService.testSetState(State.Idle(UpdateType.Archive));

		// Intercept "Check for Updates" (the Idle state button)
		disposables.add(CommandsRegistry.registerCommand('update.check', async () => {
			updateService.testSetState(State.CheckingForUpdates(true));
			await timeout(1500);
			updateService.testSetState(State.Ready(testUpdate, true, false));
		}));

		// Intercept "Restart to Update"
		disposables.add(CommandsRegistry.registerCommand('update.restart', () => {
			updateService.testSetState(State.Idle(UpdateType.Archive));
			stopActiveFlow();
		}));

	} else {
		// Flow: Idle → Checking (auto 1.5s) → AvailableForDownload
		//   User clicks Download → Downloading (auto-progress) → Downloaded
		//   User clicks Install  → Updating (auto-progress) → Ready
		//   User clicks Restart  → done

		updateService.testSetState(State.Idle(UpdateType.Archive));

		// Intercept "Check for Updates"
		disposables.add(CommandsRegistry.registerCommand('update.check', async () => {
			updateService.testSetState(State.CheckingForUpdates(true));
			await timeout(1500);
			updateService.testSetState(State.AvailableForDownload(testUpdate));
		}));

		// Intercept "Download" — auto-progress through downloading
		disposables.add(CommandsRegistry.registerCommand('update.downloadNow', async () => {
			const totalBytes = 85_000_000;
			const steps = 10;
			const startTime = Date.now();
			await autoProgress(
				Array.from({ length: steps }, (_, i) =>
					State.Downloading(testUpdate, true, false, Math.round(totalBytes * (i + 1) / steps), totalBytes, startTime)
				),
				300,
			);
			updateService.testSetState(State.Downloaded(testUpdate, true, false));
		}));

		// Intercept "Install" — auto-progress through updating
		disposables.add(CommandsRegistry.registerCommand('update.install', async () => {
			const steps = 5;
			await autoProgress(
				Array.from({ length: steps }, (_, i) =>
					State.Updating(testUpdate, i + 1, steps)
				),
				400,
			);
			updateService.testSetState(State.Ready(testUpdate, true, false));
		}));

		// Intercept "Restart to Update"
		disposables.add(CommandsRegistry.registerCommand('update.restart', () => {
			updateService.testSetState(State.Idle(UpdateType.Archive));
			stopActiveFlow();
		}));
	}

	// Kick off: trigger the check automatically so the user sees the flow start
	commandService.executeCommand('update.check');
}

// --- Command Palette entries ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.flowActionable',
			title: localize2('testFlowActionable', "Test Update Flow (Actionable)"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		startTestFlow(
			accessor.get(IUpdateService),
			accessor.get(ICommandService),
			'actionable',
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.flowDetailed',
			title: localize2('testFlowDetailed', "Test Update Flow (Detailed)"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		startTestFlow(
			accessor.get(IUpdateService),
			accessor.get(ICommandService),
			'detailed',
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'update.test.stop',
			title: localize2('testFlowStop', "Stop Test Update Flow"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IUpdateService).testSetState(State.Idle(UpdateType.Archive));
		stopActiveFlow();
	}
});
