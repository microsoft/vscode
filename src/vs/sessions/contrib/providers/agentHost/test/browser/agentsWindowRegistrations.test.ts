/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AGENTS_WINDOW_REGISTRATIONS } from './agentsWindowRegistrations.snapshot.js';
// The contributions whose registrations it snapshots
import '../../../../sessions/browser/sessions.contribution.js';
import '../../../../sessions/browser/views/sessionsViewActions.js';
import '../../../../chat/browser/sharedChatInputComposer.contribution.js';
import '../../../../chat/browser/modelPicker.js';
import '../../browser/localAgentHost.contribution.js';
import '../../browser/agentHostAgentPicker.contribution.js';
import '../../browser/agentHostSessionConfigPicker.contribution.js';
import '../../../copilotChatSessions/browser/copilotChatSessions.contribution.js';
import '../../../copilotChatSessions/browser/copilotChatSessionsActions.js';

/**
 * What the registries hold, one line each, in the order they were registered: commands, the items of every menu,
 * primary keybindings (with their weights, which order them), configuration keys, singletons and accessible views.
 */
function registrations(): string[] {
	const result: string[] = [];
	for (const id of CommandsRegistry.getCommands().keys()) {
		result.push(`command ${id}`);
	}
	// Every menu, also those that are not static members of MenuId, by id: the order the menus were created in does not matter
	const menus = [...(MenuId as unknown as { readonly _instances: ReadonlyMap<string, MenuId> })._instances.values()].sort((a, b) => a.id.localeCompare(b.id));
	for (const menu of menus) {
		for (const item of MenuRegistry.getMenuItems(menu)) {
			const target = isIMenuItem(item) ? `command ${item.command.id}${item.alt ? ` alt ${item.alt.id}` : ''}` : `submenu ${item.submenu.id}`;
			result.push(`menu ${menu.id} ${target} group ${item.group ?? ''} order ${item.order ?? ''} when ${item.when?.serialize() ?? ''}`);
		}
	}
	// Chords and secondary keybindings are resolved for the current OS, so only primary keybindings are listed, without their chords
	for (const keybinding of KeybindingsRegistry.getDefaultKeybindings()) {
		if (keybinding.weight2 === 0) {
			result.push(`keybinding ${keybinding.command} weight ${keybinding.weight1} when ${keybinding.when?.serialize() ?? ''}`);
		}
	}
	for (const key of Object.keys(Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties())) {
		result.push(`configuration ${key}`);
	}
	for (const [id] of getSingletonServiceDescriptors()) {
		result.push(`singleton ${id}`);
	}
	for (const implementation of AccessibleViewRegistry.getImplementations()) {
		result.push(`accessibleView ${implementation.name} ${implementation.type} priority ${implementation.priority} when ${implementation.when?.serialize() ?? ''}`);
	}
	return result;
}

/**
 * What identifies a registration, regardless of how it is registered: a command, configuration key, singleton or
 * accessible view by its line up to its details, a menu item by its menu and target, a keybinding by its command.
 */
function keyOf(registration: string): string {
	const details = /^(menu .*?) group |^(keybinding .*?) weight |^(accessibleView \S+) /.exec(registration);
	return details?.[1] ?? details?.[2] ?? details?.[3] ?? registration;
}

suite('Agents window registrations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('the Agents window registers the same commands, menu items, keybindings, settings, services and accessible views, each once', () => {
		// Each line holds what orders it: a menu item's group, order and when, a keybinding's weight and when. In which
		// order other suites loaded these contributions, and so registered them, depends on the tests that run.
		// Everything registered under a key of the snapshot must be exactly its lines: no duplicates and no extra entries.
		const keys = new Set(AGENTS_WINDOW_REGISTRATIONS.map(keyOf));
		const registered = registrations().filter(registration => keys.has(keyOf(registration))).sort();

		assert.deepStrictEqual(registered, [...AGENTS_WINDOW_REGISTRATIONS].sort());
	});
});
