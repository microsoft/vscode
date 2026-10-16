/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { LOCAL_THREAD_HOST_ID, ThreadAvatarIds } from '../../../../services/threads/browser/threadsService.js';
import { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { readAgentThreadDelegationMeta } from '../../../../../platform/agentHost/common/meta/agentThreadDelegationMeta.js';
import { createThreadDelegationRequestMetadata } from '../../../../services/threads/browser/threadDelegation.js';
import { activateThreadDraft, buildThreadAutomationPrompt, getThreadAutomationPromptUpdate, parseThreadAutomationPrompt, ThreadSetupKeyReleaseBarrier } from '../../browser/threadSetupService.js';

suite('ThreadSetupService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for the accepting key to be released before advancing', async () => {
		const targetWindow = DOM.getActiveWindow();
		const barrier = disposables.add(new ThreadSetupKeyReleaseBarrier(targetWindow));
		targetWindow.dispatchEvent(new KeyboardEvent(DOM.EventType.KEY_DOWN, { key: 'Enter', code: 'Enter' }));
		let resolved = false;
		const wait = barrier.wait().then(() => resolved = true);
		await Promise.resolve();
		assert.strictEqual(resolved, false);

		targetWindow.dispatchEvent(new KeyboardEvent(DOM.EventType.KEY_UP, { key: 'Enter', code: 'Enter' }));
		await wait;

		assert.strictEqual(resolved, true);
	});

	test('routes associated Automation prompts into the persistent Thread', () => {
		const prompt = buildThreadAutomationPrompt({
			schemaVersion: 2,
			id: 'thread',
			name: 'Design partner',
			sessionId: 'session',
			sessionResource: URI.parse('remote-host-copilotcli:/session'),
			routingResource: URI.parse('ahp-session:/session'),
			materialized: true,
			providerId: 'local-agent-host',
			sessionTypeId: 'copilot',
			scope: { kind: 'global', hostId: LOCAL_THREAD_HOST_ID },
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
			avatar: ThreadAvatarIds.Artist,
			connectorIds: [],
			automationIds: [],
			createdAt: 1,
			updatedAt: 1,
		}, 'Review new design feedback.');

		assert.deepStrictEqual(prompt.split('\n'), [
			'This Automation belongs to the persistent Thread "Design partner".',
			'Use send_message exactly once with session "ahp-session:/session", delivery "queue", and the following complete message:',
			'',
			'Review new design feedback.',
			'',
			'Do not perform the requested work in this Automation run. The persistent Thread must receive and perform it.',
		]);
		assert.deepStrictEqual({
			message: parseThreadAutomationPrompt(prompt),
			userPrompt: parseThreadAutomationPrompt('Run my own automation prompt.'),
		}, {
			message: 'Review new design feedback.',
			userPrompt: undefined,
		});
		const automation = upcastPartial<IAutomationDescriptor>({ prompt });
		const updatedPrompt = getThreadAutomationPromptUpdate({
			schemaVersion: 2,
			id: 'thread',
			name: 'Design partner',
			sessionId: 'session',
			sessionResource: URI.parse('remote-host-copilotcli:/session'),
			routingResource: URI.parse('ahp-session:/new-session'),
			materialized: true,
			providerId: 'remote-host',
			sessionTypeId: 'copilotcli',
			scope: { kind: 'global', hostId: 'devbox-1' },
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
			avatar: ThreadAvatarIds.Artist,
			connectorIds: [],
			automationIds: ['automation'],
			createdAt: 1,
			updatedAt: 2,
		}, automation);
		assert.ok(updatedPrompt?.includes('session "ahp-session:/new-session"'));
	});

	test('routes cross-Thread mentions with host-native session identities', () => {
		const current = upcastPartial<Parameters<typeof createThreadDelegationRequestMetadata>[0]>({
			id: 'current',
			name: 'Chief',
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
		});
		const target = upcastPartial<Parameters<typeof createThreadDelegationRequestMetadata>[0]>({
			id: 'target',
			name: 'VS Code work hub',
			sessionResource: URI.parse('remote-tunnel__devbox-copilotcli:/40da8bd4-7fa9-44bd-aac9-0b19336e6d2e'),
			routingResource: URI.parse('ahp-session:/40da8bd4-7fa9-44bd-aac9-0b19336e6d2e'),
		});

		const metadata = readAgentThreadDelegationMeta({ _meta: createThreadDelegationRequestMetadata(current, [current, target]) });

		assert.strictEqual(metadata?.threads[0].sessionResource, 'ahp-session:/40da8bd4-7fa9-44bd-aac9-0b19336e6d2e');
	});

	test('activates a provisional Thread through the new-session composer', async () => {
		const draft = upcastPartial<ISession>({ sessionId: 'remote-draft', resource: URI.parse('remote-agent:/draft') });
		const calls: string[] = [];
		const sessionsService = new class extends mock<ISessionsService>() {
			override openNewSessionDraft() { calls.push('openNewSessionDraft'); }
			override async openSession(): Promise<void> {
				calls.push('openSession');
			}
		}();

		await activateThreadDraft(sessionsService, draft);

		assert.deepStrictEqual(calls, ['openNewSessionDraft']);
	});
});
