/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING } from '../../browser/views/sessionsList.js';
import { SESSIONS_CHAT_TABS_DEFAULT, SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../../common/sessionConfig.js';

import '../../browser/sessions.contribution.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
// Capture the registered schema before configuration tests reset the shared registry.
const collapsedSectionStatusProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING];
const showChatTabsProperty = configurationRegistry.getConfigurationProperties()[SESSIONS_CHAT_TABS_SETTING];

suite('Sessions Contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('shows chats as tabs by default', () => {
		assert.deepStrictEqual({
			type: showChatTabsProperty.type,
			enum: showChatTabsProperty.enum,
			default: showChatTabsProperty.default,
			scope: showChatTabsProperty.scope,
		}, {
			type: 'string',
			enum: [SessionsChatTabsMode.Multiple, SessionsChatTabsMode.Single],
			default: SESSIONS_CHAT_TABS_DEFAULT,
			scope: ConfigurationScope.WINDOW,
		});
	});
});
