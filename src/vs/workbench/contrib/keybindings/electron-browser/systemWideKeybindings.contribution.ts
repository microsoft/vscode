/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/arrays.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService, INativeSystemWideKeybinding } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

/**
 * Setting that gates system-wide (OS global) keybindings. Experimental and disabled by default;
 * nothing is registered with the operating system until the user opts in.
 */
export const ENABLE_SYSTEM_WIDE_KEYBINDINGS_SETTING = 'keyboard.enableSystemWideKeybindings';

const CONFIRMATION_STORAGE_KEY = 'systemWideKeybindings.confirmed';

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
 * main process (which owns Electron's `globalShortcut`). The mechanism is gated behind an
 * experimental, off-by-default setting and a one-time confirmation prompt.
 */
export class SystemWideKeybindingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.systemWideKeybindings';

	private readonly syncScheduler: RunOnceScheduler;

	/** Accelerators that failed to register on the last sync, to avoid re-notifying unchanged failures. */
	private lastReportedFailures: string[] = [];

	/** User settings labels whose ignored `when` clause we already warned about. */
	private readonly warnedWhenLabels = new Set<string>();

	/** Guards against showing multiple confirmation dialogs concurrently. */
	private confirmationInFlight = false;

	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.syncScheduler = this._register(new RunOnceScheduler(() => this.sync(), 200));

		// Re-sync when keybindings change (also fires on keyboard-layout changes, which affect
		// the accelerator strings) or when the enablement setting is toggled.
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.scheduleSync()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ENABLE_SYSTEM_WIDE_KEYBINDINGS_SETTING)) {
				this.scheduleSync();
			}
		}));

		this.scheduleSync();
	}

	private scheduleSync(): void {
		this.syncScheduler.schedule();
	}

	private async sync(): Promise<void> {
		const enabled = this.configurationService.getValue(ENABLE_SYSTEM_WIDE_KEYBINDINGS_SETTING) === true;
		const candidates = enabled ? this.collectCandidates() : [];

		// Nothing to register (feature off or no valid bindings): clear any previous registrations.
		if (candidates.length === 0) {
			await this.pushToMainProcess([]);
			return;
		}

		// One-time confirmation before the first registration, even though the setting is opt-in,
		// to make the system-wide nature (fires while unfocused, captures the combo globally) explicit.
		if (!this.storageService.getBoolean(CONFIRMATION_STORAGE_KEY, StorageScope.APPLICATION, false)) {
			if (this.confirmationInFlight) {
				return;
			}
			this.confirmationInFlight = true;
			let confirmed: boolean;
			try {
				confirmed = await this.confirmFirstRun(candidates);
			} finally {
				this.confirmationInFlight = false;
			}

			if (!confirmed) {
				// Decline: turn the feature back off (which re-triggers a sync that clears everything).
				await this.configurationService.updateValue(ENABLE_SYSTEM_WIDE_KEYBINDINGS_SETTING, false);
				return;
			}

			this.storageService.store(CONFIRMATION_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
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

	private async confirmFirstRun(candidates: readonly ISystemWideKeybindingCandidate[]): Promise<boolean> {
		const labels = candidates.map(candidate => candidate.userSettingsLabel).join(', ');
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Warning,
			message: nls.localize('systemWideKeybindings.confirm.message', "Allow {0} to register system-wide keybindings?", this.productName()),
			detail: nls.localize('systemWideKeybindings.confirm.detail', "System-wide keybindings ({0}) are captured by the operating system and trigger their command even when {1} is not focused, taking the key combination away from other applications.", labels, this.productName()),
			primaryButton: nls.localize({ key: 'systemWideKeybindings.confirm.enable', comment: ['&& denotes a mnemonic'] }, "&&Enable"),
			cancelButton: nls.localize('systemWideKeybindings.confirm.disable', "Disable"),
		});
		return confirmed;
	}

	private productName(): string {
		return this.productService.nameLong;
	}
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const systemWideKeybindingsConfiguration: IConfigurationNode = {
	id: 'keyboard',
	order: 15,
	type: 'object',
	title: nls.localize('keyboardConfigurationTitle', "Keyboard"),
	properties: {
		[ENABLE_SYSTEM_WIDE_KEYBINDINGS_SETTING]: {
			scope: ConfigurationScope.APPLICATION,
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: nls.localize('enableSystemWideKeybindings', "Controls whether keybindings marked with `\"systemWide\": true` in your keybindings are registered as system-wide (operating system global) shortcuts that fire even when the application is not focused. This is an experimental, desktop-only feature; you will be asked to confirm the first time a system-wide keybinding is registered."),
		}
	}
};
configurationRegistry.registerConfiguration(systemWideKeybindingsConfiguration);

registerWorkbenchContribution2(
	SystemWideKeybindingsContribution.ID,
	SystemWideKeybindingsContribution,
	WorkbenchPhase.AfterRestored,
);
