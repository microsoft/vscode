/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hash } from '../../../../../base/common/hash.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatMode, CustomChatMode } from '../../common/chatModes.js';
import { reportChatModeChange } from '../../common/chatModeTelemetry.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('ChatModeTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports custom agent selections with their picker metadata', () => {
		const telemetryService = new TestTelemetryService();
		const targetMode = new CustomChatMode({
			id: 'reviewer',
			uri: URI.file('/workspace/.claude/agents/reviewer.md'),
			name: 'Reviewer',
			agentInstructions: { content: '', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true,
			tools: ['read', 'search'],
		});

		reportChatModeChange(telemetryService, ChatMode.Agent, targetMode, 4);

		assert.deepStrictEqual(telemetryService.events, [{
			name: 'chat.modeChange',
			data: {
				fromMode: 'agent',
				mode: String(hash('Reviewer')),
				requestCount: 4,
				storage: 'local',
				extensionId: undefined,
				toolsCount: 2,
				handoffsCount: 0,
				isClaudeAgent: true,
			},
		}]);
	});

	test('does not report selecting the current mode', () => {
		const telemetryService = new TestTelemetryService();

		reportChatModeChange(telemetryService, ChatMode.Agent, ChatMode.Agent, 0);

		assert.deepStrictEqual(telemetryService.events, []);
	});
});
