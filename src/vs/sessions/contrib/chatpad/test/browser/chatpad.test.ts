/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHATPAD_ENABLED_SETTING, ChatpadAvailableContext, ChatpadEnabledContext } from '../../browser/chatpad.js';

suite('Chatpad availability', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function evaluate(options: { setting: boolean; ai: boolean }) {
		const configurationService = new TestConfigurationService({ [CHATPAD_ENABLED_SETTING]: options.setting });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(options.ai);
		AGENT_HOST_ENABLED_CONTEXT_KEY.bindTo(contextKeyService).set(true);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		return {
			usable: contextKeyService.contextMatchesRules(ChatpadEnabledContext),
			available: contextKeyService.contextMatchesRules(ChatpadAvailableContext),
		};
	}

	test('entry points need the setting and AI features; an open Chatpad needs only AI features', () => {
		assert.deepStrictEqual({
			settingOff: evaluate({ setting: false, ai: true }),
			aiOff: evaluate({ setting: true, ai: false }),
			bothOn: evaluate({ setting: true, ai: true }),
		}, {
			settingOff: { usable: true, available: false },
			aiOff: { usable: false, available: false },
			bothOn: { usable: true, available: true },
		});
	});
});
