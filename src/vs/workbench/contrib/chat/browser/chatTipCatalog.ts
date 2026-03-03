/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ITipExclusionConfig } from './chatTipEligibilityTracker.js';

export const enum ChatTipTier {
	Foundational = 'foundational',
	Qol = 'qol',
}

/**
 * Gets the display label for a command, looking it up from MenuRegistry.
 * Falls back to extracting a readable name from the command ID.
 */
export function getCommandLabel(commandId: string): string {
	const command = MenuRegistry.getCommand(commandId);
	if (command?.title) {
		// Handle both string and ILocalizedString formats
		return typeof command.title === 'string' ? command.title : command.title.value;
	}
	// Fallback: extract readable name from command ID
	// e.g., 'workbench.action.chat.openEditSession' -> 'openEditSession'
	const parts = commandId.split('.');
	return parts[parts.length - 1];
}

/**
 * Formats a keybinding for display in a tip message.
 * Returns empty string if no keybinding is bound.
 */
export function formatKeybinding(keybindingService: IKeybindingService, commandId: string): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	return kb ? ` (${kb.getLabel()})` : '';
}

/**
 * Extracts command IDs from command: links in a markdown string.
 * Used to automatically populate enabledCommands for trusted markdown.
 */
export function extractCommandIds(markdown: string): string[] {
	const commandPattern = /\[.*?\]\(command:([^?\s)]+)/g;
	const commands = new Set<string>();
	let match;
	while ((match = commandPattern.exec(markdown)) !== null) {
		commands.add(match[1]);
	}
	return [...commands];
}

/**
 * Interface for tip definitions registered in the tip registry.
 */
export interface ITipDefinition extends ITipExclusionConfig {
	readonly id: string;
	readonly tier: ChatTipTier;
	/**
	 * Optional priority for ordering tips within the same tier.
	 * Lower values are shown first.
	 */
	readonly priority?: number;
	/**
	 * The tip message to display. Should NOT include the "Tip:" prefix.
	 */
	readonly message: MarkdownString;
	/**
	 * When clause expression that determines if this tip is eligible to be shown.
	 */
	readonly when?: ContextKeyExpression;
	/**
	 * Chat model IDs for which this tip is eligible (lowercase).
	 */
	readonly onlyWhenModelIds?: readonly string[];
	/**
	 * Setting keys that, if changed from default, make this tip ineligible.
	 */
	readonly excludeWhenSettingsChanged?: readonly string[];
	/**
	 * Command IDs that dismiss this tip when clicked from the tip markdown.
	 */
	readonly dismissWhenCommandsClicked?: readonly string[];
}


