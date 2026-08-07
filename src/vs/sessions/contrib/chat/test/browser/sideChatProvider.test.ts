/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSideChatProvider, IChatSideChatService } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { SessionsSideChatProviderContribution } from '../../browser/sideChatProvider.contribution.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('SessionsSideChatProviderContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source') });
	const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });

	function setup(options: {
		status?: SessionStatus;
		isArchived?: boolean;
		supportsSideChat?: boolean;
		hasTurn?: boolean;
		isSessionsWindow?: boolean;
	} = {}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());

		const session = upcastPartial<ISession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			status: constObservable(options.status ?? SessionStatus.Completed),
			isArchived: constObservable(options.isArchived ?? false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: options.supportsSideChat ?? true }),
		});

		let registered: IChatSideChatProvider | undefined;
		instantiationService.stub(IChatSideChatService, upcastPartial<IChatSideChatService>({
			registerProvider: provider => {
				registered = provider;
				return toDisposable(() => { registered = undefined; });
			},
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({
				getRequests: () => (options.hasTurn ?? true) ? [upcastPartial<IChatRequestModel>({ id: 'turn-1' })] : [],
			}),
		}));

		const callOrder: string[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => resource.toString() === sourceChat.resource.toString() ? { session, chat: sourceChat } : undefined,
			createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
				callOrder.push(`create:${turnId}:${selection?.text ?? ''}`);
				return sideChat;
			},
			sendRequest: async (_session, chat, requestOptions) => {
				callOrder.push(`send:${chat.resource.toString()}:${requestOptions.query}`);
			},
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			openChat: async (_session, chatUri) => {
				callOrder.push(`open:${chatUri.toString()}`);
			},
		}));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({
			isSessionsWindow: options.isSessionsWindow ?? true,
		}));

		store.add(instantiationService.createInstance(SessionsSideChatProviderContribution));
		return { provider: () => registered, callOrder };
	}

	test('registers a provider that branches, opens, then sends on the side chat', async () => {
		const { provider, callOrder } = setup();

		await provider()!.askInSideChat(sourceChat.resource, 'what about this?', { text: 'selected text' });

		assert.deepStrictEqual(callOrder, [
			'create:turn-1:selected text',
			`open:${sideChat.resource.toString()}`,
			`send:${sideChat.resource.toString()}:what about this?`,
		]);
	});

	test('reports capability only for conversations that can actually branch', () => {
		const capability = (options: Parameters<typeof setup>[0]) => {
			const { provider } = setup(options);
			return provider()!.canAskInSideChat(sourceChat.resource);
		};

		assert.deepStrictEqual({
			supported: capability({}),
			unknownChat: (() => setup({}).provider()!.canAskInSideChat(URI.parse('test:///chat/other')))(),
			untitled: capability({ status: SessionStatus.Untitled }),
			archived: capability({ isArchived: true }),
			noSideChatSupport: capability({ supportsSideChat: false }),
			noTurnYet: capability({ hasTurn: false }),
		}, {
			supported: true,
			unknownChat: false,
			untitled: false,
			archived: false,
			noSideChatSupport: false,
			noTurnYet: false,
		});
	});

	test('does not register outside the Agents window', () => {
		const { provider } = setup({ isSessionsWindow: false });

		assert.strictEqual(provider(), undefined);
	});
});
