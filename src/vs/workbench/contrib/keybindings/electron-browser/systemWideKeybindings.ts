/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';

export interface ISystemWideKeybindingCandidate {
	readonly accelerator: string;
	readonly commandId: string;
	readonly args: unknown;
	readonly userSettingsLabel: string;
	readonly hasWhen: boolean;
	/** Whether it is a default keybinding, rather than one that the user made system-wide. */
	readonly isDefault: boolean;
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
 * Selects the system-wide keybindings with Electron-compatible accelerators: the user's, then, given the context of a
 * window, the default ones whose `when` clause holds there (see `IKeybindingRule.systemWide`). The first binding wins
 * on accelerator conflicts. A default keybinding also gives way to the user's keybindings of other commands at its key,
 * which it would take over otherwise, and is left out silently, like one that is not a single key combination.
 */
export function selectSystemWideKeybindings(items: readonly ResolvedKeybindingItem[], context?: Pick<IContextKeyService, 'contextMatchesRules'>): ISystemWideKeybindingSelection {
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
			isDefault: false,
		});
	}

	if (!context) {
		return { candidates, unsupported, duplicates };
	}
	const userCommands = new Map<string, string[]>();
	for (const item of items) {
		const accelerator = !item.isDefault && item.command ? item.resolvedKeybinding?.getElectronAccelerator() : undefined;
		if (accelerator && item.command) {
			userCommands.set(accelerator, [...userCommands.get(accelerator) ?? [], item.command]);
		}
	}
	for (const item of items) {
		const command = item.command;
		if (!item.isDefault || !item.systemWide || !command || !context.contextMatchesRules(item.when)) {
			continue;
		}
		const accelerator = item.resolvedKeybinding?.getElectronAccelerator();
		if (!accelerator || seen.has(accelerator) || userCommands.get(accelerator)?.some(userCommand => userCommand !== command)) {
			continue;
		}
		seen.add(accelerator);
		candidates.push({
			accelerator,
			commandId: command,
			args: item.commandArgs ?? undefined,
			userSettingsLabel: item.resolvedKeybinding?.getUserSettingsLabel() ?? accelerator,
			hasWhen: false,
			isDefault: true,
		});
	}

	return { candidates, unsupported, duplicates };
}
