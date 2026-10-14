/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostSavedChat } from '../../../../../../platform/agentHost/common/agentHostSavedChat.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { PolicyUnavailableAgentHostContentProvider } from '../../../browser/agentSessions/agentHost/agentHostPolicyUnavailableSession.js';

suite('Policy unavailable Agent Host history', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('agent-host-claude:/saved');
	const backend = URI.parse('ahp-session:/saved');
	const peer = URI.parse(buildChatUri(backend.toString(), 'peer'));
	const saved: IAgentHostSavedChat = {
		session: backend,
		chat: URI.parse(buildDefaultChatUri(backend)),
		provider: 'claude',
		identity: 'saved-read',
		availability: { kind: 'available' },
		title: 'Saved conversation',
		turns: [{ id: 'turn', message: { text: 'Saved question', origin: { kind: MessageKind.User } }, responseParts: [{ kind: ResponsePartKind.Markdown, id: 'reply', content: 'Saved answer' }], state: TurnState.Complete, usage: undefined }],
		draft: { text: 'Unsent question', origin: { kind: MessageKind.User } },
		workspace: { kind: 'none' },
	};

	function setup(read: (session: URI, chat?: URI) => Promise<IAgentHostSavedChat> = async () => saved) {
		const services = store.add(new TestInstantiationService());
		services.stub(IAgentHostService, {
			listSessions: async () => [{ session: backend, provider: 'claude', startTime: 0, modifiedTime: 0, chats: [{ chat: peer, kind: 'peer' }] }],
			readSavedChat: read,
			resourceUris: identityAgentHostResourceUriMapper,
			getSubscription: () => assert.fail('Saved history must not subscribe to the source'),
			dispatch: () => assert.fail('Saved history must not dispatch to the source'),
		});
		services.stub(IAgentHostConnectionsService, { registerSessionResource: () => resource });
		return services.createInstance(PolicyUnavailableAgentHostContentProvider);
	}

	test('loads saved transcript and draft without an executable source', async () => {
		const session = store.add(await setup().provideChatSessionContent(resource, CancellationToken.None));
		assert.deepStrictEqual({
			title: session.title,
			history: session.history.map(item => item.type === 'request' ? item.prompt : item.parts.filter(part => part.kind === 'markdownContent').map(part => part.content.value)),
			draft: session.transferredState?.inputState?.inputText,
			readOnly: session.isReadOnly?.get(),
			requestHandler: session.requestHandler,
			prepareForClientTools: session.prepareForClientTools,
			forkSession: session.forkSession,
		}, {
			title: 'Saved conversation',
			history: ['Saved question', ['Saved answer']],
			draft: 'Unsent question',
			readOnly: true,
			requestHandler: undefined,
			prepareForClientTools: undefined,
			forkSession: undefined,
		});
	});

	test('waits for history before resolving the content provider', async () => {
		const history = new DeferredPromise<IAgentHostSavedChat>();
		let resolved = false;
		const loading = setup(() => history.p).provideChatSessionContent(resource, CancellationToken.None).then(session => {
			resolved = true;
			return store.add(session);
		});
		await Promise.resolve();
		assert.strictEqual(resolved, false);
		history.complete(saved);
		await loading;
	});

	test('reads the catalog peer identity rather than the default chat', async () => {
		const calls: string[][] = [];
		const session = await setup(async (session, chat) => {
			calls.push([session.toString(), chat?.toString() ?? 'default']);
			return { ...saved, chat: peer };
		}).provideChatSessionContent(resource.with({ fragment: 'peer' }), CancellationToken.None);
		store.add(session);
		assert.deepStrictEqual(calls, [[backend.toString(), peer.toString()]]);
	});

	test('does not replace missing peer history with the default transcript', async () => {
		await assert.rejects(setup(() => assert.fail('Unknown peer must not read another chat')).provideChatSessionContent(resource.with({ fragment: 'missing' }), CancellationToken.None));
	});

	test('propagates unavailable saved history instead of resolving an empty session', async () => {
		await assert.rejects(setup(async () => { throw new Error('Saved data is missing'); }).provideChatSessionContent(resource, CancellationToken.None), /Saved data is missing/);
	});

	test('does not publish a completed read after cancellation', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const provider = setup(async () => {
			cancellation.cancel();
			return saved;
		});
		await assert.rejects(provider.provideChatSessionContent(resource, cancellation.token), CancellationError);
	});
});
