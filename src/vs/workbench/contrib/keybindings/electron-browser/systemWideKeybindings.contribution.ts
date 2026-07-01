/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/arrays.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService, INativeSystemWideKeybinding } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

/**
 * Persisted flag recording that the user has been shown the one-time heads-up explaining that their
 * `systemWide` keybindings are captured globally. Set once the notice has been acknowledged.
 */
const ACKNOWLEDGED_STORAGE_KEY = 'systemWideKeybindings.acknowledged';

export interface ISystemWideKeybindingCandidate {
	readonly accelerator: string;
	readonly commandId: string;
	readonly args: unknown;
	readonly userSettingsLabel: string;
	readonly hasWhen: boolean;
}

export interface ISystemWideKeybindingSelection {
	readonly candidates: ISystemWideKeybindingCandidate[];
	/** User settings labels (or command ids) that cannot be expressed as an Electron accelerator (chords, single modifiers). */
	readonly unsupported: string[];
	/** Accelerators dropped because an earlier binding already claimed them. */
	readonly duplicates: string[];
}

/**
 * Pure selection of the system-wide keybindings from the full set of resolved keybindings. Only
 * user keybindings opted into `systemWide` with a single key combination (expressible as an
 * Electron accelerator) are eligible; the first binding wins on accelerator conflicts.
 */
export function selectSystemWideKeybindings(items: readonly ResolvedKeybindingItem[]): ISystemWideKeybindingSelection {
	const seen = new Set<string>();
	const candidates: ISystemWideKeybindingCandidate[] = [];
	const unsupported: string[] = [];
	const duplicates: string[] = [];

	for (const item of items) {
		// Only user keybindings can ever be system-wide; skip defaults/extension bindings and removals.
		if (!item.systemWide || item.isDefault || !item.command) {
			continue;
		}

		const resolved = item.resolvedKeybinding;
		if (!resolved) {
			continue; // unbound entry (e.g. a `-` removal)
		}

		const accelerator = resolved.getElectronAccelerator();
		if (!accelerator) {
			// Chords and single-modifier bindings cannot be expressed as an Electron accelerator.
			unsupported.push(resolved.getUserSettingsLabel() ?? item.command);
			continue;
		}

		if (seen.has(accelerator)) {
			duplicates.push(resolved.getUserSettingsLabel() ?? accelerator);
			continue;
		}
		seen.add(accelerator);

		candidates.push({
			accelerator,
			commandId: item.command,
			args: item.commandArgs ?? undefined,
			userSettingsLabel: resolved.getUserSettingsLabel() ?? accelerator,
			hasWhen: !!item.when,
		});
	}

	return { candidates, unsupported, duplicates };
}

/**
 * Watches the resolved keybindings for entries opted into `systemWide` and mirrors them to the
 * main process (which owns Electron's `globalShortcut`). The mechanism is always active; a one-time
 * notice the first time such a keybinding is registered makes the user aware the combo is captured
 * globally.
 */
export class SystemWideKeybindingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.systemWideKeybindings';

	private readonly syncScheduler: RunOnceScheduler;

	/** Accelerators that failed to register on the last sync, to avoid re-notifying unchanged failures. */
	private lastReportedFailures: string[] = [];

	/** User settings labels whose ignored `when` clause we already warned about. */
	private readonly warnedWhenLabels = new Set<string>();

	/** Guards against showing the one-time notice more than once concurrently. */
	private noticeInFlight = false;

	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.syncScheduler = this._register(new RunOnceScheduler(() => this.sync(), 200));

		// Re-sync when keybindings change (also fires on keyboard-layout changes, which affect
		// the accelerator strings).
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.scheduleSync()));

		this.scheduleSync();
	}

	private scheduleSync(): void {
		this.syncScheduler.schedule();
	}

	private async sync(): Promise<void> {
		const candidates = this.collectCandidates();

		// Nothing to register (no valid system-wide bindings): clear any previous registrations.
		if (candidates.length === 0) {
			await this.pushToMainProcess([]);
			return;
		}

		// Show a one-time heads-up before the very first registration so the user is aware the combo
		// is captured globally (fires while unfocused). Informational only - the feature stays on.
		if (!this.storageService.getBoolean(ACKNOWLEDGED_STORAGE_KEY, StorageScope.APPLICATION, false)) {
			if (this.noticeInFlight) {
				return;
			}
			this.noticeInFlight = true;
			try {
				await this.notifyFirstRun(candidates);
			} finally {
				this.noticeInFlight = false;
			}
			this.storageService.store(ACKNOWLEDGED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		this.warnAboutIgnoredWhenClauses(candidates);
		await this.pushToMainProcess(candidates);
	}

	private collectCandidates(): ISystemWideKeybindingCandidate[] {
		const { candidates, unsupported, duplicates } = selectSystemWideKeybindings(this.keybindingService.getKeybindings());

		for (const label of unsupported) {
			this.logService.warn(`[SystemWideKeybindings] '${label}' cannot be registered as a system-wide shortcut (only single key combinations are supported).`);
		}
		for (const label of duplicates) {
			this.logService.warn(`[SystemWideKeybindings] duplicate system-wide accelerator for '${label}', keeping the first binding.`);
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

	private async pushToMainProcess(candidates: readonly ISystemWideKeybindingCandidate[]): Promise<void> {
		const payload: INativeSystemWideKeybinding[] = candidates.map(candidate => ({
			accelerator: candidate.accelerator,
			commandId: candidate.commandId,
			args: candidate.args,
			userSettingsLabel: candidate.userSettingsLabel,
		}));

		let failed: string[];
		try {
			const result = await this.nativeHostService.syncSystemWideKeybindings(payload);
			failed = result.failed;
		} catch (error) {
			this.logService.error('[SystemWideKeybindings] failed to sync system-wide keybindings with the main process', error);
			return;
		}

		this.reportFailures(failed);
	}

	private reportFailures(failed: string[]): void {
		const sorted = [...failed].sort();
		if (equals(sorted, this.lastReportedFailures)) {
			return; // same failures as last time; don't re-notify
		}
		this.lastReportedFailures = sorted;

		if (sorted.length === 0) {
			return;
		}

		this.notificationService.notify({
			severity: Severity.Warning,
			message: nls.localize('systemWideKeybindings.registrationFailed', "Some system-wide keybindings could not be registered ({0}); the key combination may already be taken by the operating system or another application.", sorted.join(', ')),
		});
	}

	private async notifyFirstRun(candidates: readonly ISystemWideKeybindingCandidate[]): Promise<void> {
		const labels = candidates.map(candidate => candidate.userSettingsLabel).join(', ');
		await this.dialogService.prompt({
			type: Severity.Info,
			message: nls.localize('systemWideKeybindings.notice.message', "{0} is registering system-wide keybindings", this.productName()),
			detail: nls.localize('systemWideKeybindings.notice.detail', "The keybindings you marked with \"systemWide\" ({0}) are captured by the operating system and trigger their command even when {1} is not focused, taking the key combination away from other applications.", labels, this.productName()),
			buttons: [{
				label: nls.localize({ key: 'systemWideKeybindings.notice.acknowledge', comment: ['&& denotes a mnemonic'] }, "&&I Understand"),
				run: () => { },
			}],
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
