/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ThreadAvatarIds } from '../../../../services/threads/browser/threadsService.js';
import { buildThreadAutomationPrompt, sendThreadInitialRequest } from '../../browser/threadSetupService.js';

suite('ThreadSetupService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes associated Automation prompts into the persistent Thread', () => {
		const prompt = buildThreadAutomationPrompt({
			id: 'thread',
			name: 'Design partner',
			sessionId: 'session',
			sessionResource: URI.parse('agent-host-session://host/session'),
			providerId: 'local-agent-host',
			sessionTypeId: 'copilot',
			scope: { kind: 'global' },
			avatar: ThreadAvatarIds.Artist,
			connectorIds: [],
			automationIds: [],
			archived: false,
			createdAt: 1,
			updatedAt: 1,
		}, 'Review new design feedback.');

		assert.deepStrictEqual(prompt.split('\n'), [
			'This Automation belongs to the persistent Thread "Design partner".',
			'Use send_message exactly once with session "agent-host-session://host/session", delivery "queue", and the following complete message:',
			'',
			'Review new design feedback.',
			'',
			'Do not perform the requested work in this Automation run. The persistent Thread must receive and perform it.',
		]);
	});

	test('graduates a Thread draft through the new-session send path', async () => {
		const draft = upcastPartial<ISession>({ sessionId: 'remote-draft', resource: URI.parse('remote-agent:/draft') });
		const sends: Array<{ readonly session: ISession; readonly options: ISendRequestOptions }> = [];
		const managementService = new class extends mock<ISessionsManagementService>() {
			override async sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> {
				sends.push({ session, options });
			}
			override async sendRequest(): Promise<void> {
				throw new Error('Existing-session send path must not be used for a Thread draft.');
			}
		}();

		await sendThreadInitialRequest(managementService, draft, 'Remote helper', 'Inspect the latest work.');

		assert.deepStrictEqual(sends, [{
			session: draft,
			options: {
				query: 'Inspect the latest work.',
				title: 'Remote helper',
			},
		}]);
	});
});
