/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionsService, IOpenNewSessionOptions } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ICreateNewSessionOptions } from '../../../../services/sessions/common/sessionsManagement.js';
import { openNewSessionFromActive } from '../../browser/newSessionAction.js';

interface IRecordedCalls {
	readonly quickChat: (ICreateNewSessionOptions | undefined)[];
	readonly newSession: (IOpenNewSessionOptions | undefined)[];
}

function createSessionsService(activeSession: IActiveSession | undefined): { service: ISessionsService; calls: IRecordedCalls } {
	const calls: IRecordedCalls = { quickChat: [], newSession: [] };
	const service = {
		activeSession: constObservable(activeSession),
		openQuickChat: (options?: ICreateNewSessionOptions) => { calls.quickChat.push(options); return undefined; },
		openNewSession: (options?: IOpenNewSessionOptions) => { calls.newSession.push(options); return undefined; },
	} as unknown as ISessionsService;
	return { service, calls };
}

function makeSession(opts: { isQuickChat?: boolean; isCreated: boolean; providerId: string; sessionType: string; workspaceUri?: URI }): IActiveSession {
	return {
		providerId: opts.providerId,
		sessionType: opts.sessionType,
		isCreated: constObservable(opts.isCreated),
		isQuickChat: opts.isQuickChat === undefined ? undefined : constObservable(opts.isQuickChat),
		workspace: constObservable(opts.workspaceUri ? { uri: opts.workspaceUri } : undefined),
	} as unknown as IActiveSession;
}

suite('New action (openNewSessionFromActive)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a quick-chat DRAFT (Untitled) opens a new session, never a quick chat', () => {
		const { service, calls } = createSessionsService(makeSession({
			isQuickChat: true, isCreated: false, providerId: 'agent-host-copilotcli', sessionType: 'copilotcli',
		}));

		openNewSessionFromActive(service);

		assert.deepStrictEqual(calls, {
			quickChat: [],
			newSession: [{ folderUri: undefined, providerId: 'agent-host-copilotcli', sessionTypeId: 'copilotcli' }],
		});
	});

	test('a committed quick chat opens a new session, never a quick chat', () => {
		const { service, calls } = createSessionsService(makeSession({
			isQuickChat: true, isCreated: true, providerId: 'agent-host-copilotcli', sessionType: 'copilotcli',
		}));

		openNewSessionFromActive(service);

		assert.deepStrictEqual(calls, {
			quickChat: [],
			newSession: [{ folderUri: undefined, providerId: 'agent-host-copilotcli', sessionTypeId: 'copilotcli' }],
		});
	});

	test('a workspace session opens a new session inheriting its folder/provider/type', () => {
		const folder = URI.file('/repo');
		const { service, calls } = createSessionsService(makeSession({
			isQuickChat: false, isCreated: true, providerId: 'copilot', sessionType: 'copilot-cli', workspaceUri: folder,
		}));

		openNewSessionFromActive(service);

		assert.deepStrictEqual(calls, {
			quickChat: [],
			newSession: [{ folderUri: folder, providerId: 'copilot', sessionTypeId: 'copilot-cli' }],
		});
	});

	test('a quick chat never carries a (scratch) workspace folder into the new session', () => {
		const scratch = URI.file('/home/user/.copilot/chats/cool-swartz-67089e');
		const { service, calls } = createSessionsService(makeSession({
			isQuickChat: true, isCreated: true, providerId: 'agent-host-copilotcli', sessionType: 'copilotcli', workspaceUri: scratch,
		}));

		openNewSessionFromActive(service);

		assert.deepStrictEqual(calls, {
			quickChat: [],
			newSession: [{ folderUri: undefined, providerId: 'agent-host-copilotcli', sessionTypeId: 'copilotcli' }],
		});
	});
});
