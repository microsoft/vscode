/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';

export interface ISystemWideKeybindingCandidate {
	readonly accelerator: string;
	readonly commandId: string;
	readonly args: unknown;
	readonly userSettingsLabel: string;
	readonly hasWhen: boolean;
}

export interface ISystemWideKeybindingSelection {
	readonly candidates: ISystemWideKeybindingCandidate[];
	readonly unsupported: ISystemWideKeybindingRejection[];
	/** Accelerators dropped because an earlier binding already claimed them. */
	readonly duplicates: ISystemWideKeybindingRejection[];
}

export interface ISystemWideKeybindingRejection {
	readonly commandId: string;
	readonly userSettingsLabel: string;
}

/**
 * Selects user system-wide keybindings with Electron-compatible accelerators.
 * The first binding wins on accelerator conflicts.
 */
export function selectSystemWideKeybindings(items: readonly ResolvedKeybindingItem[]): ISystemWideKeybindingSelection {
	const seen = new Set<string>();
	const candidates: ISystemWideKeybindingCandidate[] = [];
	const unsupported: ISystemWideKeybindingRejection[] = [];
	const duplicates: ISystemWideKeybindingRejection[] = [];

	for (const item of items) {
		if (!item.systemWide || item.isDefault || !item.command) {
			continue;
		}

		const resolved = item.resolvedKeybinding;
		if (!resolved) {
			continue;
		}

		const accelerator = resolved.getElectronAccelerator();
		if (!accelerator) {
			unsupported.push({
				commandId: item.command,
				userSettingsLabel: resolved.getUserSettingsLabel() ?? item.command,
			});
			continue;
		}

		if (seen.has(accelerator)) {
			duplicates.push({
				commandId: item.command,
				userSettingsLabel: resolved.getUserSettingsLabel() ?? accelerator,
			});
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
