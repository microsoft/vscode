/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ForkConversationAction, IForkConversationOptions } from '../../../browser/actions/chatForkActions.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatEditorOptions } from '../../../browser/widgetHosts/editor/chatEditor.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionItem, IChatSessionRequestHistoryItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, SessionTypeSelectionReason } from '../../../common/constants.js';
import { IChatModel, IChatRequestModel, ISerializableChatData } from '../../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';

class TestForkConversationAction extends ForkConversationAction {
	openForkedSession(instantiationService: TestInstantiationService, parentSessionResource: URI, forkedSessionResource: URI, options?: IForkConversationOptions): Promise<void> {
		return this._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource, options);
	}
}

suite('ForkConversationAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const parentSessionResource = URI.parse('vscode-chat-session://parent');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		let openCall: { resource: URI; usesViewTarget: boolean; options: IChatEditorOptions | undefined } | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target, options) => {
				openCall = { resource, usesViewTarget: target === ChatViewPaneTarget, options };
				return undefined;
			},
		}));

		await new TestForkConversationAction().openForkedSession(instantiationService, parentSessionResource, forkedSessionResource, { toSide: true });

		assert.deepStrictEqual(openCall, {
			resource: forkedSessionResource,
			usesViewTarget: true,
			options: { sessionTypeSelectionReason: 'currentSession' },
		});
	});

	for (const toSide of [false, true]) {
		test(`preserves the local checkpoint and source when opening a fork${toSide ? ' to the side' : ''}`, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const source = URI.parse('test-chat:/source');
			const fork = URI.parse('test-chat:/fork');
			const requests = ['first', 'second', 'third'].map((message, index) => ({
				requestId: `request-${index + 1}`,
				message,
				variableData: { variables: [] },
				response: [],
			}));
			const serializedData: ISerializableChatData = {
				version: 3,
				sessionId: 'source',
				creationDate: 0,
				customTitle: undefined,
				initialLocation: ChatAgentLocation.Chat,
				responderUsername: 'test',
				requests,
			};
			const model = upcastPartial<IChatModel>({
				sessionResource: source,
				title: 'Source',
				toJSON: () => serializedData,
				getRequests: () => requests.map(request => upcastPartial<IChatRequestModel>({ id: request.requestId })),
			});
			const checkpoint = upcastPartial<IChatRequestViewModel>({
				id: 'request-2',
				sessionResource: source,
				message: { text: 'second', parts: [] },
			});
			let loaded: Parameters<IChatService['loadSessionFromData']>[0] | undefined;
			let disposed = false;
			let opened: { parent: URI; resource: URI; options: IForkConversationOptions | undefined } | undefined;
			instantiationService.stub(IChatService, upcastPartial<IChatService>({
				getSession: resource => resource.toString() === source.toString() ? model : undefined,
				loadSessionFromData: data => {
					loaded = data;
					return upcastPartial<IChatModelReference>({
						object: upcastPartial<IChatModel>({ sessionResource: fork }),
						dispose: () => disposed = true,
					});
				},
			}));
			instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getContentProviderSchemes: () => [] }));
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
				getWidgetBySessionResource: () => undefined,
				lastFocusedWidget: upcastPartial<IChatWidget>({
					viewModel: upcastPartial<IChatViewModel>({ sessionResource: URI.parse('test-chat:/unrelated') }),
				}),
			}));
			const action = new class extends ForkConversationAction {
				protected override async _openForkedSession(_instantiationService: IInstantiationService, parent: URI, resource: URI, options?: IForkConversationOptions): Promise<void> {
					opened = { parent, resource, options };
				}
			};

			await instantiationService.invokeFunction(accessor => action.run(accessor, toSide ? { element: checkpoint, toSide } : checkpoint));

			assert.deepStrictEqual({
				opened,
				messages: loaded?.requests.map(request => request.message),
				sourceMessages: serializedData.requests.map(request => request.message),
				disposed,
			}, {
				opened: { parent: source, resource: fork, options: toSide ? { toSide: true } : undefined },
				messages: ['first'],
				sourceMessages: ['first', 'second', 'third'],
				disposed: true,
			});
		});
	}

	test('forwards contributed checkpoint placement through the hooks and deduplicates pending forks', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('contributed:/source');
		const fork = URI.parse('contributed:/fork');
		const checkpoint = upcastPartial<IChatRequestViewModel>({
			id: 'request-2',
			sessionResource: source,
			message: { text: 'second', parts: [] },
		});
		const request: IChatSessionRequestHistoryItem = { type: 'request', id: checkpoint.id, prompt: 'second', participant: '' };
		const gate = new DeferredPromise<IChatSessionItem>();
		const started = new DeferredPromise<void>();
		const calls: { resource: URI; request: IChatSessionRequestHistoryItem | undefined }[] = [];
		const hooks: { source: URI; request: IChatSessionRequestHistoryItem | undefined; options: IForkConversationOptions | undefined }[] = [];
		const opens: { source: URI; resource: URI; options: IForkConversationOptions | undefined }[] = [];
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			getOrCreateChatSession: async () => upcastPartial<IChatSession>({ history: [request] }),
			forkChatSession: async (resource, request) => {
				calls.push({ resource, request });
				started.complete();
				return gate.p;
			},
		}));
		const action = new class extends ForkConversationAction {
			protected override async _tryForkAsChat(_instantiationService: IInstantiationService, source: URI, request: IChatSessionRequestHistoryItem | undefined, options?: IForkConversationOptions): Promise<boolean> {
				hooks.push({ source, request, options });
				return false;
			}
			protected override async _openForkedSession(_instantiationService: IInstantiationService, source: URI, resource: URI, options?: IForkConversationOptions): Promise<void> {
				opens.push({ source, resource, options });
			}
		};
		const first = instantiationService.invokeFunction(accessor => action.run(accessor, { element: checkpoint, toSide: true }));
		await started.p;
		const second = instantiationService.invokeFunction(accessor => action.run(accessor, checkpoint));
		await timeout(0);
		gate.complete({ resource: fork, label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } });
		await Promise.all([first, second]);

		assert.deepStrictEqual({ calls, hooks, opens }, {
			calls: [{ resource: source, request }],
			hooks: [{ source, request, options: { toSide: true } }, { source, request, options: undefined }],
			opens: [{ source, resource: fork, options: { toSide: true } }],
		});
	});

	test('loads a local fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const sourceSessionResource = URI.parse('vscode-chat-session://source');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		const serializedData: ISerializableChatData = {
			version: 3,
			sessionId: 'source',
			creationDate: 0,
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			responderUsername: 'test',
			requests: [{
				requestId: 'request',
				message: 'hello',
				variableData: { variables: [] },
				response: [],
			}],
		};
		const sourceModel = upcastPartial<IChatModel>({
			sessionResource: sourceSessionResource,
			title: 'Source',
			toJSON: () => serializedData,
		});
		let loadCall: { debugOwner: string | undefined; selectionReason: SessionTypeSelectionReason | undefined } | undefined;
		let modelDisposed = false;
		const modelRef = upcastPartial<IChatModelReference>({
			object: upcastPartial<IChatModel>({ sessionResource: forkedSessionResource, sessionTypeSelectionReason: 'currentSession' }),
			dispose: () => modelDisposed = true,
		});
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: resource => resource.toString() === sourceSessionResource.toString() ? sourceModel : undefined,
			loadSessionFromData: (_data, debugOwner, selectionReason) => {
				loadCall = { debugOwner, selectionReason };
				return modelRef;
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [],
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async () => undefined,
		}));

		await instantiationService.invokeFunction(accessor => new ForkConversationAction().run(accessor, sourceSessionResource));
		await timeout(0);

		assert.deepStrictEqual({ loadCall, modelDisposed }, {
			loadCall: {
				debugOwner: 'ChatForkActions#forkCleanSession',
				selectionReason: 'currentSession',
			},
			modelDisposed: true,
		});
	});
});
