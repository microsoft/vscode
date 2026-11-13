/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { SESSIONS_LIST_INDENT_ITEMS_SETTING, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { ExternalSessionApplicationBadgeMode, SESSIONS_CHAT_TABS_SETTING, SESSIONS_DRAFTS_ENABLED_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SessionsChatTabsMode } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';

import '../../browser/sessions.contribution.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
// Capture the registered schema before configuration tests reset the shared registry.
const collapsedSectionStatusProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING];
const showChatTabsProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_CHAT_TABS_SETTING];
const markAsDoneConfettiProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_MARK_AS_DONE_CONFETTI_SETTING];
const groupExternalSessionsProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING];
const externalApplicationBadgeProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING];
const externalApplicationBadgeShowFromProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING];
const showArchivedByDefaultProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING];
const indentItemsProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_INDENT_ITEMS_SETTING];
const sessionsSettingKeys = Object.keys(configurationRegistry.getConfigurationProperties()).filter(key => key.startsWith('sessions.'));
const pendingSessionProperties = [SESSIONS_DRAFTS_ENABLED_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING].map(key => configurationRegistry.getConfigurationProperties()[key]);

suite('Sessions Contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('drafts and Send Later have independent default-off application experiment settings', () => {
		assert.deepStrictEqual(pendingSessionProperties.map(property => ({
			type: property.type, default: property.default, scope: property.scope,
			tags: property.tags, experiment: property.experiment,
		})), [0, 1].map(() => ({
			type: 'boolean', default: false, scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'], experiment: { mode: 'auto' },
		})));
	});

	test('disables the External section by default with automatic experiments', () => {
		assert.deepStrictEqual({
			type: groupExternalSessionsProperty.type,
			default: groupExternalSessionsProperty.default,
			experiment: groupExternalSessionsProperty.experiment,
		}, {
			type: 'boolean',
			default: false,
			experiment: { mode: 'auto' },
		});
	});

	test('shows external application badges next to the title by default with automatic experiments', () => {
		assert.deepStrictEqual({
			type: externalApplicationBadgeProperty.type,
			enum: externalApplicationBadgeProperty.enum,
			default: externalApplicationBadgeProperty.default,
			experiment: externalApplicationBadgeProperty.experiment,
		}, {
			type: 'string',
			enum: [
				ExternalSessionApplicationBadgeMode.Off,
				ExternalSessionApplicationBadgeMode.Title,
				ExternalSessionApplicationBadgeMode.Details,
			],
			default: ExternalSessionApplicationBadgeMode.Title,
			experiment: { mode: 'auto' },
		});
	});

	test('hides the external application badge prefix by default with an advanced automatic experiment', () => {
		assert.deepStrictEqual({
			type: externalApplicationBadgeShowFromProperty.type,
			default: externalApplicationBadgeShowFromProperty.default,
			tags: externalApplicationBadgeShowFromProperty.tags,
			experiment: externalApplicationBadgeShowFromProperty.experiment,
		}, {
			type: 'boolean',
			default: false,
			tags: ['experimental', 'advanced', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('does not nest any sessions setting under another setting, which the configuration model would ignore', () => {
		const nested = sessionsSettingKeys.filter(key => sessionsSettingKeys.some(parent => key.startsWith(`${parent}.`)));
		assert.deepStrictEqual(nested, []);
	});

	test('disables collapsed section status indicators by default with automatic experiments', () => {
		assert.deepStrictEqual({
			type: collapsedSectionStatusProperty.type,
			default: collapsedSectionStatusProperty.default,
			experiment: collapsedSectionStatusProperty.experiment,
		}, {
			type: 'boolean',
			default: false,
			experiment: { mode: 'auto' },
		});
	});

	test('shows archived sessions by default with automatic experiments', () => {
		assert.deepStrictEqual({
			type: showArchivedByDefaultProperty.type,
			default: showArchivedByDefaultProperty.default,
			scope: showArchivedByDefaultProperty.scope,
			tags: showArchivedByDefaultProperty.tags,
			experiment: showArchivedByDefaultProperty.experiment,
		}, {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('does not indent sessions list items by default with an advanced automatic experiment', () => {
		assert.deepStrictEqual({
			type: indentItemsProperty.type,
			default: indentItemsProperty.default,
			tags: indentItemsProperty.tags,
			experiment: indentItemsProperty.experiment,
		}, {
			type: 'boolean',
			default: false,
			tags: ['experimental', 'advanced', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('shows the active chat as the session view by default with automatic experiments', () => {
		assert.deepStrictEqual({
			type: showChatTabsProperty.type,
			enum: showChatTabsProperty.enum,
			default: showChatTabsProperty.default,
			scope: showChatTabsProperty.scope,
			experiment: showChatTabsProperty.experiment,
		}, {
			type: 'string',
			enum: [SessionsChatTabsMode.Multiple, SessionsChatTabsMode.Single],
			default: SessionsChatTabsMode.Single,
			scope: ConfigurationScope.WINDOW,
			experiment: { mode: 'auto' },
		});
	});

	test('enables mark as done confetti by default with automatic experiments', () => {
		assert.deepStrictEqual({
			type: markAsDoneConfettiProperty.type,
			default: markAsDoneConfettiProperty.default,
			experiment: markAsDoneConfettiProperty.experiment,
		}, {
			type: 'boolean',
			default: true,
			experiment: { mode: 'auto' },
		});
	});

	test('opens the Sessions view with the keybindings of Toggle Chat in editor windows, including the user\'s, outranking Open Chat', () => {
		const getKeybindings = (os: OperatingSystem) => KeybindingsRegistry.getDefaultKeybindingsForOS(os)
			.filter(item => item.command === 'agentic.workbench.view.sessionsContainer')
			.map(item => ({ keybinding: item.keybinding?.getHashCode(), weight: item.weight1, when: item.when?.serialize() }));
		const expected = (keybinding: number, os: OperatingSystem) => [{
			keybinding: decodeKeybinding(keybinding, os)!.getHashCode(),
			weight: KeybindingWeight.SessionsContrib,
			when: 'viewContainer.agentic.workbench.view.sessionsContainer.enabled',
		}];

		assert.deepStrictEqual({
			windows: getKeybindings(OperatingSystem.Windows),
			mac: getKeybindings(OperatingSystem.Macintosh),
			linux: getKeybindings(OperatingSystem.Linux),
			aliases: KeybindingsRegistry.getKeybindingAliases()
				.filter(alias => alias.command === 'agentic.workbench.view.sessionsContainer')
				.map(alias => ({ source: alias.source, when: alias.when.serialize() })),
		}, {
			windows: expected(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI, OperatingSystem.Windows),
			mac: expected(KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI, OperatingSystem.Macintosh),
			linux: expected(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI, OperatingSystem.Linux),
			aliases: [{ source: 'workbench.panel.chat', when: 'viewContainer.agentic.workbench.view.sessionsContainer.enabled' }],
		});
	});
});
