/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ForkConversationActionId } from '../../../../../../workbench/contrib/chat/browser/actions/chatForkActions.js';
import { IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSession, IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatModel, IChatRequestModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatRequestViewModel } from '../../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { IOpenSessionOptions, ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import '../../browser/agentHostForkActions.js';

const forkCommand = CommandsRegistry.getCommand(ForkConversationActionId)!;

suite('Agent Host fork actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(multipleChats: boolean, peer = false) {
		const instantiationService = store.add(new TestInstantiationService());
		const sourceResource = URI.parse('agent-host-copilotcli:/source');
		const sourceChat = upcastPartial<IChat>({ resource: peer ? sourceResource.with({ fragment: 'peer' }) : sourceResource });
		const forkChat = upcastPartial<IChat>({ resource: multipleChats ? sourceResource.with({ fragment: 'fork' }) : URI.parse('agent-host-copilotcli:/fork') });
		const source = upcastPartial<ISession>({
			sessionId: 'source',
			resource: sourceResource,
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			capabilities: constObservable({ supportsMultipleChats: multipleChats }),
		});
		const forkSession = upcastPartial<ISession>({ sessionId: 'fork', resource: forkChat.resource });
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const started = new DeferredPromise<void>();
		let forkAvailable = true;
		let forkGate: Promise<void> | undefined;
		const forkCalls: { kind: string; source: URI; requestId: string | undefined }[] = [];
		const opens: { kind: string; resource: URI; options?: IOpenSessionOptions & { referenceChatResource?: URI; referenceSessionId?: string } }[] = [];

		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({
				getRequests: () => ['request-1', 'request-2'].map(id => upcastPartial<IChatRequestModel>({ id })),
			}),
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSession: resource => isEqual(resource, source.resource) ? source : forkAvailable && isEqual(resource, forkChat.resource) ? forkSession : undefined,
			getSessionForChatResource: resource => isEqual(resource, sourceChat.resource) ? { session: source, chat: sourceChat } : undefined,
			onDidChangeSessions: onDidChangeSessions.event,
			forkChatInSession: async (_session, source, turnId) => {
				forkCalls.push({ kind: 'chat', source, requestId: turnId });
				started.complete();
				await forkGate;
				return forkChat;
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [sourceChat.resource.scheme],
			getOrCreateChatSession: async () => upcastPartial<IChatSession>({
				history: [{ type: 'request', id: 'request-2', prompt: 'second', participant: '' }],
			}),
			forkChatSession: async (source, request) => {
				forkCalls.push({ kind: 'session', source, requestId: request?.id });
				started.complete();
				await forkGate;
				return { resource: forkChat.resource, label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } };
			},
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			activeSession,
			openChat: async (_session, resource, options) => { opens.push({ kind: 'chat', resource, options }); },
			openChatToSide: async (_session, resource, options) => { opens.push({ kind: 'chatToSide', resource, options }); },
			openSession: async (resource, options) => { opens.push({ kind: 'session', resource, options }); },
			openSessionToSide: async (session, options) => { opens.push({ kind: 'sessionToSide', resource: session.resource, options }); },
		}));

		const checkpoint = upcastPartial<IChatRequestViewModel>({
			id: 'request-2',
			sessionResource: sourceChat.resource,
			message: { text: 'second', parts: [] },
		});
		return {
			source, sourceChat, forkChat, forkCalls, opens, started, activeSession, onDidChangeSessions,
			setForkGate: (gate: Promise<void>) => forkGate = gate,
			setForkAvailable: (available: boolean) => {
				forkAvailable = available;
				if (available) {
					onDidChangeSessions.fire({ added: [forkSession], removed: [], changed: [] });
				}
			},
			run: async (toSide: boolean, slashCommand = false) => {
				await instantiationService.invokeFunction(forkCommand.handler, slashCommand ? sourceChat.resource : toSide ? { element: checkpoint, toSide } : checkpoint);
			},
		};
	}

	for (const multipleChats of [false, true]) {
		for (const peer of [false, true]) {
			for (const toSide of [false, true]) {
				test(`forks a ${peer ? 'peer' : 'main'} chat into a ${multipleChats ? 'chat' : 'session'}${toSide ? ' to the side' : ' normally'}`, async () => {
					const harness = createHarness(multipleChats, peer);
					await harness.run(toSide);

					assert.deepStrictEqual({ forks: harness.forkCalls, opens: harness.opens }, {
						forks: [{ kind: multipleChats ? 'chat' : 'session', source: harness.sourceChat.resource, requestId: multipleChats ? 'request-1' : 'request-2' }],
						opens: [{
							kind: multipleChats ? toSide ? 'chatToSide' : 'chat' : toSide ? 'sessionToSide' : 'session',
							resource: harness.forkChat.resource,
							options: multipleChats
								? toSide ? { referenceChatResource: harness.sourceChat.resource } : undefined
								: toSide ? { source: 'fork', referenceSessionId: harness.source.sessionId } : { source: 'fork' },
						}],
					});
				});
			}
		}

		test(`retains the ${multipleChats ? 'chat' : 'session'} source while a delayed fork is running`, async () => {
			const harness = createHarness(multipleChats, true);
			const gate = new DeferredPromise<void>();
			harness.setForkGate(gate.p);
			const running = harness.run(true);
			await harness.started.p;
			const beforeCompletion = [...harness.opens];
			harness.activeSession.set(upcastPartial<IActiveSession>({ sessionId: 'unrelated', resource: URI.parse('test:/unrelated') }), undefined);
			gate.complete();
			await running;

			assert.deepStrictEqual({ beforeCompletion, opens: harness.opens }, {
				beforeCompletion: [],
				opens: [{
					kind: multipleChats ? 'chatToSide' : 'sessionToSide',
					resource: harness.forkChat.resource,
					options: multipleChats ? { referenceChatResource: harness.sourceChat.resource } : { source: 'fork', referenceSessionId: harness.source.sessionId },
				}],
			});
		});

		test(`does not navigate when ${multipleChats ? 'chat' : 'session'} forking fails`, async () => {
			const harness = createHarness(multipleChats);
			const gate = new DeferredPromise<void>();
			harness.setForkGate(gate.p);
			const running = harness.run(true);
			const rejected = assert.rejects(running, /Fork failed/);
			await harness.started.p;
			await gate.error(new Error('Fork failed'));
			await rejected;

			assert.deepStrictEqual(harness.opens, []);
		});

		test(`keeps /fork navigation unchanged for a ${multipleChats ? 'chat' : 'session'}`, async () => {
			const harness = createHarness(multipleChats, true);
			await harness.run(false, true);
			await timeout(0);

			assert.deepStrictEqual({ forks: harness.forkCalls, opens: harness.opens }, {
				forks: [{ kind: multipleChats ? 'chat' : 'session', source: harness.sourceChat.resource, requestId: multipleChats ? 'request-2' : undefined }],
				opens: [{ kind: multipleChats ? 'chat' : 'session', resource: harness.forkChat.resource, options: multipleChats ? undefined : { source: 'fork' } }],
			});
		});
	}

	test('waits for a separately forked session to appear before opening beside the source', async () => {
		const harness = createHarness(false);
		harness.setForkAvailable(false);
		const running = harness.run(true);
		await timeout(0);
		const waiting = { opens: [...harness.opens], hasListener: harness.onDidChangeSessions.hasListeners() };
		harness.setForkAvailable(true);
		await running;

		assert.deepStrictEqual({ waiting, opens: harness.opens, hasListener: harness.onDidChangeSessions.hasListeners() }, {
			waiting: { opens: [], hasListener: true },
			opens: [{ kind: 'sessionToSide', resource: harness.forkChat.resource, options: { source: 'fork', referenceSessionId: harness.source.sessionId } }],
			hasListener: false,
		});
	});
});
