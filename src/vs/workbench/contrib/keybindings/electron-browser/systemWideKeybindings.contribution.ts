/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ISystemWideKeybindingCandidate, selectSystemWideKeybindings } from './systemWideKeybindings.js';
import { SystemWideKeybindingsSynchronizer } from './systemWideKeybindingsSynchronizer.js';

/**
 * Watches the resolved keybindings for entries opted into `systemWide` and mirrors them to the
 * main process (which owns Electron's `globalShortcut`). The mechanism is always active for any
 * user keybinding marked `systemWide`.
 */
export class SystemWideKeybindingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.systemWideKeybindings';

	/** User settings labels whose ignored `when` clause we already warned about. */
	private readonly warnedWhenLabels = new Set<string>();

	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(new SystemWideKeybindingsSynchronizer({
			getCandidates: () => {
				const candidates = this.collectCandidates();
				this.warnAboutIgnoredWhenClauses(candidates);
				return candidates;
			},
			onRegistrationFailuresChanged: failed => this.reportFailures(failed),
			logLabel: 'SystemWideKeybindings',
		}, this.keybindingService, this.nativeHostService, this.logService));
	}

	private collectCandidates(): ISystemWideKeybindingCandidate[] {
		const { candidates, unsupported, duplicates } = selectSystemWideKeybindings(this.keybindingService.getKeybindings());

		for (const rejection of unsupported) {
			this.logService.warn(`[SystemWideKeybindings] '${rejection.userSettingsLabel}' cannot be registered as a system-wide shortcut (only single key combinations are supported).`);
		}
		for (const rejection of duplicates) {
			this.logService.warn(`[SystemWideKeybindings] duplicate system-wide accelerator for '${rejection.userSettingsLabel}', keeping the first binding.`);
		}

		return candidates;
	}

	private warnAboutIgnoredWhenClauses(candidates: readonly ISystemWideKeybindingCandidate[]): void {
		const newlyWarned: string[] = [];
		for (const candidate of candidates) {
			if (candidate.hasWhen && !this.warnedWhenLabels.has(candidate.userSettingsLabel)) {
				this.warnedWhenLabels.add(candidate.userSettingsLabel);
				newlyWarned.push(candidate.userSettingsLabel);
			}
		}

		if (newlyWarned.length > 0) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: nls.localize('systemWideKeybindings.whenIgnored', "The \"when\" clause is ignored for system-wide keybindings ({0}); they are always active while {1} is running.", newlyWarned.join(', '), this.productName()),
			});
		}
	}

	private reportFailures(failed: readonly string[]): void {
		if (failed.length === 0) {
			return;
		}

		this.notificationService.notify({
			severity: Severity.Warning,
			message: nls.localize('systemWideKeybindings.registrationFailed', "Some system-wide keybindings could not be registered ({0}); the key combination may already be taken by the operating system or another application.", failed.join(', ')),
		});
	}

	private productName(): string {
		return this.productService.nameLong;
	}
}

registerWorkbenchContribution2(
	SystemWideKeybindingsContribution.ID,
	SystemWideKeybindingsContribution,
	WorkbenchPhase.AfterRestored,
);
