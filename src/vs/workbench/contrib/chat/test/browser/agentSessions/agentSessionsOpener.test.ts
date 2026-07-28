/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ACTIVE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { openSessionByResource, ISessionOpenerParticipant, sessionOpenerRegistry } from '../../../browser/agentSessions/agentSessionsOpener.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';

suite('AgentSessionsOpener', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('lets a participant handle a resource before legacy session lookup', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		const resource = URI.parse('test-session://provider/session');
		let handledResource: URI | undefined;
		const participant: ISessionOpenerParticipant = {
			handleOpenSession: async () => false,
			handleOpenSessionResource: async (_accessor, candidate) => {
				handledResource = candidate;
				return true;
			},
		};
		const registration = sessionOpenerRegistry.registerParticipant(participant);

		try {
			await instantiationService.invokeFunction(openSessionByResource, resource);
		} finally {
			registration.dispose();
		}

		assert.strictEqual(handledResource, resource);
	});

	test('falls back to the legacy session opener when no participant handles the resource', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		const resource = URI.parse('test-session://provider/session');
		const session = upcastPartial<IAgentSession>({ resource });
		let resolvedResource: URI | undefined;
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: candidate => {
				resolvedResource = candidate;
				return session;
			},
		}));
		let handledSession: IAgentSession | undefined;
		const participant: ISessionOpenerParticipant = {
			handleOpenSession: async (_accessor, candidate) => {
				handledSession = candidate;
				return true;
			},
		};
		const registration = sessionOpenerRegistry.registerParticipant(participant);

		try {
			await instantiationService.invokeFunction(openSessionByResource, resource);
		} finally {
			registration.dispose();
		}

		assert.deepStrictEqual({ resolvedResource, handledSession }, { resolvedResource: resource, handledSession: session });
	});

	test('opens a resolvable unlisted peer resource in a chat editor', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		const resource = URI.parse('agent-host-copilotcli:/session#subagent/tool-call');
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: () => undefined,
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			activateChatSessionItemProvider: async () => { },
			canResolveChatSession: async () => true,
		}));
		let opened: { resource: URI; target: unknown; revealIfOpened: boolean | undefined } | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (candidate, target, options) => {
				opened = { resource: candidate, target, revealIfOpened: options?.revealIfOpened };
				return undefined;
			},
		}));

		await instantiationService.invokeFunction(openSessionByResource, resource, { forceEditor: true });

		assert.deepStrictEqual(opened, { resource, target: ACTIVE_GROUP, revealIfOpened: true });
	});
});
