/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/arrays.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService, INativeSystemWideKeybinding } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

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
 * main process (which owns Electron's `globalShortcut`). The mechanism is always active for any
 * user keybinding marked `systemWide`.
 */
export class SystemWideKeybindingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.systemWideKeybindings';

	private readonly syncScheduler: RunOnceScheduler;

	/** Accelerators that failed to register on the last sync, to avoid re-notifying unchanged failures. */
	private lastReportedFailures: string[] = [];

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

		try {
			const result = await this.nativeHostService.syncSystemWideKeybindings(payload);
			this.reportFailures(result.failed);
		} catch (error) {
			this.logService.error('[SystemWideKeybindings] failed to sync system-wide keybindings with the main process', error);
		}
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

	private productName(): string {
		return this.productService.nameLong;
	}
}

registerWorkbenchContribution2(
	SystemWideKeybindingsContribution.ID,
	SystemWideKeybindingsContribution,
	WorkbenchPhase.AfterRestored,
);
