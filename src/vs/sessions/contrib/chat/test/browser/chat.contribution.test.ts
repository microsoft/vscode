/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING } from '../../../sessionInputBanners/browser/sessionWorktreeCleanupService.js';

import '../../browser/chat.contribution.js';

const cleanupSuggestionProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING];

suite('Chat Contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps worktree cleanup suggestions disabled by default and outside experiments', () => {
		assert.deepStrictEqual({
			default: cleanupSuggestionProperty.default,
			experiment: cleanupSuggestionProperty.experiment,
		}, {
			default: false,
			experiment: undefined,
		});
	});
});
