/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSideChatSendResultKind } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SideChatOrchestrationService } from '../../browser/sideChatOrchestration.js';
import { ITransientSideChatService } from '../../browser/transientSideChatService.js';

suite('SideChatOrchestration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source') });
	const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
	const session = upcastPartial<ISession>({ sessionId: 'session', resource: URI.parse('test:///session') });

	function setup(presentedTransiently: boolean, sendError?: Error, options: { openSucceeds?: boolean; failurePresented?: boolean } = {}) {
		const calls: string[] = [];
		let sendOptions: ISendRequestOptions | undefined;
		const activeChat = observableValue<IChat>('test.activeChat', sourceChat);
		const activeSession = upcastPartial<IActiveSession>({ ...session, activeChat });
		const managementService = upcastPartial<ISessionsManagementService>({
			sendRequest: async (_session, chat, options) => {
				calls.push(`send:${chat.resource.toString()}`);
				sendOptions = options;
				if (sendError) {
					throw sendError;
				}
			},
		});
		const sessionsService = upcastPartial<ISessionsService>({
			activeSession: observableValue<IActiveSession | undefined>('test.activeSession', activeSession),
			openChat: async (_session, resource) => {
				calls.push(`open:${resource.toString()}`);
				if (options.openSucceeds !== false) {
					activeChat.set(sideChat, undefined);
				}
			},
		});
		const sessionsPartService = upcastPartial<ISessionsPartService>({
			getSessionView: () => upcastPartial<NonNullable<ReturnType<ISessionsPartService['getSessionView']>>>({
				splitChatToSide: resource => calls.push(`split:${resource.toString()}`),
			}),
		});
		const transientService = upcastPartial<ITransientSideChatService>({
			show: async (_session, source, side, question) => {
				calls.push(`show:${source.resource.toString()}:${side.resource.toString()}:${question}`);
				return presentedTransiently;
			},
			markFailed: sideChat => {
				calls.push(`failed:${sideChat.toString()}`);
				return options.failurePresented !== false;
			},
		});
		return {
			orchestrationService: new SideChatOrchestrationService(managementService, sessionsService, sessionsPartService, transientService),
			calls,
			sendOptions: () => sendOptions,
		};
	}

	test('keeps a transient side chat out of visible navigation while awaiting its send', async () => {
		const { orchestrationService, calls, sendOptions } = setup(true);

		const prepared = await orchestrationService.prepare(session, sourceChat, sideChat, 'question');
		await prepared.send({ query: 'question' });

		assert.deepStrictEqual({
			calls,
			preserveActiveChat: sendOptions()?.preserveActiveChat,
		}, {
			calls: [
				`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:question`,
				`send:${sideChat.resource.toString()}`,
			],
			preserveActiveChat: true,
		});

	});

	test('marks a transient card failed when its awaited send rejects', async () => {
		const { orchestrationService, calls } = setup(true, new Error('send failed'));

		const prepared = await orchestrationService.prepare(session, sourceChat, sideChat, 'question');
		const result = await prepared.send({ query: 'question' });

		assert.deepStrictEqual({
			result: result.kind,
			calls,
		}, {
			result: ChatSideChatSendResultKind.FailedAndPresented,
			calls: [
				`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:question`,
				`send:${sideChat.resource.toString()}`,
				`failed:${sideChat.resource.toString()}`,
			],
		});
	});

	test('rejects a transient send failure after its card was dismissed', async () => {
		const { orchestrationService } = setup(true, new Error('send failed'), { failurePresented: false });
		const prepared = await orchestrationService.prepare(session, sourceChat, sideChat, 'question');

		await assert.rejects(prepared.send({ query: 'question' }), /send failed/);
	});

	test('falls back to the normal full chat when no source view can host it', async () => {
		const { orchestrationService, calls, sendOptions } = setup(false);

		const prepared = await orchestrationService.prepare(session, sourceChat, sideChat, 'question');
		await prepared.send({ query: 'question' });

		assert.deepStrictEqual({
			calls,
			preserveActiveChat: sendOptions()?.preserveActiveChat,
		}, {
			calls: [
				`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:question`,
				`open:${sideChat.resource.toString()}`,
				`split:${sideChat.resource.toString()}`,
				`send:${sideChat.resource.toString()}`,
			],
			preserveActiveChat: false,
		});
	});

	test('does not send when the full-chat fallback fails to become active', async () => {
		const { orchestrationService, calls } = setup(false, undefined, { openSucceeds: false });

		await assert.rejects(orchestrationService.prepare(session, sourceChat, sideChat, 'question'), /did not open/);
		assert.deepStrictEqual(calls, [
			`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:question`,
			`open:${sideChat.resource.toString()}`,
		]);
	});
});
