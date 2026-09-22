/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AgentMergeSettingId } from '../../../../../platform/agentHost/common/agentMerge.js';
import { InboxNotificationActionKind } from '../../common/inboxNotificationsService.js';
import { AGENT_MERGE_ALWAYS_PROMPT_INTERVAL, InboxAgentMergeAlwaysOptInService } from '../../browser/inboxAgentMergeAlwaysOptInService.js';

suite('InboxAgentMergeAlwaysOptInService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const createFixture = (initialConfiguration: Record<string, unknown> = {}) => {
		const storageService = disposables.add(new InMemoryStorageService());
		const configuration = new Map<string, unknown>(Object.entries(initialConfiguration));
		const updates: Array<{ key: string; value: unknown }> = [];
		const configurationService = upcastPartial<IConfigurationService>({
			getValue: <T>(key: string): T | undefined => configuration.get(key) as T | undefined,
			updateValue: async (key: string, value: unknown): Promise<void> => {
				updates.push({ key, value });
				configuration.set(key, value);
			},
		});

		return {
			service: new InboxAgentMergeAlwaysOptInService(storageService, configurationService),
			updates,
		};
	};

	test('prompts every 10 uses when not suppressed', () => {
		const fixture = createFixture();
		const promptedAt: number[] = [];

		for (let i = 0; i < (AGENT_MERGE_ALWAYS_PROMPT_INTERVAL * 2) + 3; i++) {
			const decision = fixture.service.recordUsage(InboxNotificationActionKind.AgentMergeFixCI);
			if (decision.shouldPrompt) {
				promptedAt.push(decision.usageCount);
			}
		}

		assert.deepStrictEqual(promptedAt, [10, 20]);
	});

	test('stops prompting after suppressing an action', () => {
		const fixture = createFixture();
		for (let i = 0; i < AGENT_MERGE_ALWAYS_PROMPT_INTERVAL; i++) {
			fixture.service.recordUsage(InboxNotificationActionKind.AgentMergeAddressReviews);
		}
		fixture.service.suppressPrompt(InboxNotificationActionKind.AgentMergeAddressReviews);

		const promptedAfterSuppress = [];
		for (let i = 0; i < AGENT_MERGE_ALWAYS_PROMPT_INTERVAL * 2; i++) {
			const decision = fixture.service.recordUsage(InboxNotificationActionKind.AgentMergeAddressReviews);
			if (decision.shouldPrompt) {
				promptedAfterSuppress.push(decision.usageCount);
			}
		}

		assert.deepStrictEqual(promptedAfterSuppress, []);
	});

	test('does not prompt when action is already globally enabled', () => {
		const fixture = createFixture({
			[AgentMergeSettingId.MergePullRequest]: 'always',
		});

		const promptedAt: number[] = [];
		for (let i = 0; i < AGENT_MERGE_ALWAYS_PROMPT_INTERVAL * 2; i++) {
			const decision = fixture.service.recordUsage(InboxNotificationActionKind.AgentMergeMergePullRequest);
			if (decision.shouldPrompt) {
				promptedAt.push(decision.usageCount);
			}
		}

		assert.deepStrictEqual(promptedAt, []);
	});

	test('writes expected defaults for always opt-in actions', async () => {
		const fixture = createFixture();

		await fixture.service.enableAlways(InboxNotificationActionKind.AgentMergeFixCI);
		await fixture.service.enableAlways(InboxNotificationActionKind.AgentMergeAddressReviews);
		await fixture.service.enableAlways(InboxNotificationActionKind.AgentMergeMergePullRequest);

		assert.deepStrictEqual(fixture.updates, [
			{ key: AgentMergeSettingId.FixCI, value: true },
			{ key: AgentMergeSettingId.AddressReviews, value: true },
			{ key: AgentMergeSettingId.MergePullRequest, value: 'always' },
		]);
	});
});
