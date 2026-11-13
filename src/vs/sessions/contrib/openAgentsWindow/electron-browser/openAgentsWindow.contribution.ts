/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AGENTS_LAUNCHER_COMMAND_ID, ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISystemWideKeybindingCandidate, selectSystemWideKeybindings } from '../../../../workbench/contrib/keybindings/electron-browser/systemWideKeybindings.js';
import { SystemWideKeybindingsSynchronizer } from '../../../../workbench/contrib/keybindings/electron-browser/systemWideKeybindingsSynchronizer.js';

/**
 * Whether the Agents window registers the system-wide keybindings of the command, so that they work while it is the only
 * window open. Other windows register every system-wide keybinding.
 */
function isOwnedCommand(commandId: string): boolean {
	return commandId === OPEN_AGENTS_WINDOW_COMMAND_ID || commandId === AGENTS_LAUNCHER_COMMAND_ID || commandId === ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID;
}

export class OpenAgentsWindowSystemWideKeybindingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openAgentsWindowSystemWideKeybinding';

	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._register(new SystemWideKeybindingsSynchronizer({
			getCandidates: () => this.collectCandidates(),
			onRegistrationFailuresChanged: failed => this.reportFailures(failed),
			logLabel: 'OpenAgentsWindowSystemWideKeybinding',
			syncImmediately: true,
		}, this.keybindingService, this.nativeHostService, this.logService, this.contextKeyService));
	}

	private collectCandidates(): ISystemWideKeybindingCandidate[] {
		const { candidates, unsupported, duplicates } = selectSystemWideKeybindings(this.keybindingService.getKeybindings(), this.contextKeyService);
		for (const rejection of unsupported) {
			if (isOwnedCommand(rejection.commandId)) {
				this.logService.warn(`[OpenAgentsWindowSystemWideKeybinding] '${rejection.userSettingsLabel}' cannot be registered as a system-wide shortcut (only single key combinations are supported).`);
			}
		}
		for (const rejection of duplicates) {
			if (isOwnedCommand(rejection.commandId)) {
				this.logService.warn(`[OpenAgentsWindowSystemWideKeybinding] duplicate system-wide accelerator for '${rejection.userSettingsLabel}', keeping the first binding.`);
			}
		}
		return candidates.filter(candidate => isOwnedCommand(candidate.commandId));
	}

	private reportFailures(failed: readonly string[]): void {
		if (failed.length === 0) {
			return;
		}

		this.notificationService.notify({
			severity: Severity.Warning,
			message: nls.localize('openAgentsWindowSystemWideKeybinding.registrationFailed', "Some system-wide keybindings could not be registered ({0}); the key combination may already be taken by the operating system or another application.", failed.join(', ')),
		});
	}
}

registerWorkbenchContribution2(
	OpenAgentsWindowSystemWideKeybindingContribution.ID,
	OpenAgentsWindowSystemWideKeybindingContribution,
	WorkbenchPhase.AfterRestored,
);
