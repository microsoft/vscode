/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID, IAgentHostDelegationRequest } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import type { SessionView } from '../../../../browser/parts/sessionView.js';
import { IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import '../../browser/agentHostDelegation.js';

suite('Sessions - Agent Host delegation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function session(id: string): IActiveSession {
		const folder = URI.file(`/${id}`);
		return upcastPartial<IActiveSession>({
			sessionId: id,
			resource: URI.parse(`test:///${id}`),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: id, description: undefined }] })),
		});
	}

	async function delegate(focused: { kind: SessionHostKind; session: IActiveSession }, gridSessions: readonly IActiveSession[], gridActive: IActiveSession): Promise<{ folder: string | undefined; anchor: string | undefined }> {
		const result: { folder: string | undefined; anchor: string | undefined } = { folder: undefined, anchor: undefined };
		const created = upcastPartial<ISession>({ sessionId: 'delegated' });
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({}));
		instantiationService.stub(IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({
			getFocusedHost: () => upcastPartial<ISessionHost>({ kind: focused.kind, session: constObservable(focused.session), chat: constObservable(undefined) }),
		}));
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly visibleSessions = constObservable(gridSessions);
			override insertAt(_session: ISession | undefined, targetSessionId: string | undefined) { result.anchor = targetSessionId; }
		});
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override getActiveSessionView() { return upcastPartial<SessionView>({ getSession: () => gridActive }); }
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override createNewSession(folderUri: URI) { result.folder = folderUri.path; return created; }
			override async sendNewChatRequest() { }
		});
		const request = upcastPartial<IAgentHostDelegationRequest>({ type: 'agent-host-copilotcli', prompt: 'Continue' });
		await CommandsRegistry.getCommand(CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID)!.handler(instantiationService, request);
		instantiationService.dispose();
		return result;
	}

	test('delegates from the focused host\'s session, beside it when the grid shows it, else beside the grid\'s active pane', async () => {
		const a = session('a');
		const b = session('b');
		assert.deepStrictEqual({
			fromGrid: await delegate({ kind: SessionHostKind.MainWindow, session: b }, [a, b], a),
			fromChatWindow: await delegate({ kind: SessionHostKind.ChatWindow, session: b }, [a], a),
		}, {
			fromGrid: { folder: '/b', anchor: 'b' },
			fromChatWindow: { folder: '/b', anchor: 'a' },
		});
	});
});
