/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { openSessionByResource } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsOpener.js';
import { SessionsOpenerParticipantContribution } from '../../browser/sessionsOpenerParticipant.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('SessionsOpenerParticipant', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a sessions-layer resource without a legacy agent session', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ ambientConnection: undefined }));
		const resource = URI.parse('agent-host-copilotcli://provider/session');
		const session = upcastPartial<ISession>({ resource });
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSession: () => session,
		}));
		let opened: { resource: URI; preserveFocus: boolean | undefined } | undefined;
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			openSession: async (candidate, options) => {
				opened = { resource: candidate, preserveFocus: options?.preserveFocus };
			},
		}));
		const contribution = new SessionsOpenerParticipantContribution();

		try {
			await instantiationService.invokeFunction(openSessionByResource, resource, { editorOptions: { preserveFocus: true } });
		} finally {
			contribution.dispose();
		}

		assert.deepStrictEqual(opened, { resource, preserveFocus: true });
	});

	for (const chatId of ['default', 'peer']) {
		test(`opens the exact ${chatId} chat using the owning host rather than a same-ID remote session`, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(ILogService, new NullLogService());
			const resource = URI.parse(`agent-host-copilotcli:/session#${chatId}`);
			const actualResource = URI.parse('agent-host-copilotcli:/session');
			const remoteResource = URI.parse('remote-other-copilotcli:/session');
			const backendSession = URI.parse('copilotcli:/session');
			const session = upcastPartial<ISession>({
				resource: actualResource,
				mainChat: constObservable(upcastPartial<IChat>({ resource: actualResource })),
			});
			instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				resolveSessionResourceIdentity: candidate => ({
					connectionAuthority: candidate.scheme === remoteResource.scheme ? 'other' : 'local',
					backendSession,
				}),
			}));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				getSession: () => undefined,
				getSessions: () => [upcastPartial<ISession>({ resource: remoteResource }), session],
			}));
			let opened: { session: URI; chat: URI; preserveFocus: boolean | undefined } | undefined;
			instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
				openChat: async (target, chat, options) => {
					opened = { session: target.resource, chat, preserveFocus: options?.preserveFocus };
				},
			}));
			disposables.add(new SessionsOpenerParticipantContribution());
			await instantiationService.invokeFunction(openSessionByResource, resource, { editorOptions: { preserveFocus: true } });
			assert.deepStrictEqual(opened, {
				session: actualResource,
				chat: actualResource.with({ fragment: chatId === 'default' ? '' : chatId }),
				preserveFocus: true,
			});
		});
	}
});
