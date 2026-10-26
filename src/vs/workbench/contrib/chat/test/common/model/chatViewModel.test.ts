/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { MockChatService } from '../chatService/mockChatService.js';
import { ChatAgentService, IChatAgentNameService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestQueueKind, IChatSendRequestOptions, IChatService } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { MockChatEditingSession } from '../mockChatEditingSession.js';
import { ChatModel, ChatRequestModel, ChatResponseModelChangeReason, IChatRequestDisablement, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ChatResponseViewModel, ChatViewModel, getStickyScrollTargetItem, IChatViewModel, isPendingDividerVM, isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';

interface ITestChatViewModelItem {
	readonly id: string;
	readonly kind?: string;
	readonly pendingKind?: ChatRequestQueueKind;
}

suite('ChatViewModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sticky scroll target ignores trailing pending items', () => {
		const response: ITestChatViewModelItem = { id: 'response' };
		const pendingOnly: ITestChatViewModelItem = { id: 'pending-only', pendingKind: ChatRequestQueueKind.Queued };
		const emptyItems: ITestChatViewModelItem[] = [];

		assert.deepStrictEqual([
			getStickyScrollTargetItem([
				{ id: 'request' },
				response,
				{ id: 'pending-divider-steering', kind: 'pendingDivider' },
				{ id: 'pending-steering', pendingKind: ChatRequestQueueKind.Steering },
				{ id: 'pending-divider-queued', kind: 'pendingDivider' },
				{ id: 'pending-queued', pendingKind: ChatRequestQueueKind.Queued },
			])?.id,
			getStickyScrollTargetItem([pendingOnly])?.id,
			getStickyScrollTargetItem(emptyItems)?.id,
		], [
			'response',
			'pending-only',
			undefined,
		]);
	});

	test('response identity does not scan the transcript for the last item', () => {
		const onDidChange = store.add(new Emitter<ChatResponseModelChangeReason>());
		let getItemsCalls = 0;
		const session = upcastPartial<IChatViewModel>({
			getItems: () => {
				getItemsCalls++;
				return [];
			}
		});
		const model = upcastPartial<IChatResponseModel>({ id: 'response', isComplete: true, onDidChange: onDidChange.event });
		const response = store.add(new ChatResponseViewModel(
			model,
			session,
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IChatAgentNameService>({})
		));

		const before = response.dataId;
		onDidChange.fire({ reason: 'other' });

		assert.deepStrictEqual({ before, after: response.dataId, getItemsCalls }, { before: 'response_0', after: 'response_1', getItemsCalls: 0 });
	});

	suite('items', () => {
		let instantiationService: TestInstantiationService;

		setup(() => {
			instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, store.add(new TestStorageService()));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IExtensionService, new TestExtensionService());
			instantiationService.stub(IContextKeyService, new MockContextKeyService());
			instantiationService.stub(IChatAgentService, store.add(instantiationService.createInstance(ChatAgentService)));
			instantiationService.stub(IConfigurationService, new TestConfigurationService());
			instantiationService.stub(IChatService, new MockChatService());
			instantiationService.stub(IChatAgentNameService, upcastPartial<IChatAgentNameService>({}));
		});

		function add(model: ChatModel, id: string, hidden = false) {
			return model.addRequest({ text: id, parts: [] }, { variables: [] }, 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, id, undefined, undefined, undefined, undefined, undefined, hidden);
		}

		test('handoff rows remain visible outside the send queue and cannot be edited', () => {
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const request = new ChatRequestModel({ session: model, message: { text: 'steering', parts: [] }, variableData: { variables: [] }, restoredId: 'steer' });
			const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const rows = () => viewModel.getItems().filter(isRequestVM).map(item => ({ id: item.id, handoff: item.isPendingRequestHandoff }));
			model.addPendingRequest(request, ChatRequestQueueKind.Steering, {});
			model.setPendingRequestHandoffs([request]);
			const whilePending = rows();
			const pendingDataId = viewModel.getItems().find(isRequestVM)?.dataId;
			model.removePendingRequest(request.id);
			const duringHandoff = rows();
			const handoffDataId = viewModel.getItems().find(isRequestVM)?.dataId;
			viewModel.setEditing(viewModel.getItems().filter(isRequestVM)[0]);
			const editing = viewModel.editing?.id;
			const persisted = model.toJSON();
			model.setPendingRequestHandoffs([]);
			assert.deepStrictEqual({
				whilePending, duringHandoff, editing, rerenders: pendingDataId !== handoffDataId, afterHandoff: rows(), queue: model.getPendingRequests(),
				persistedRequests: persisted.requests.length, persistedPending: persisted.pendingRequests?.length ?? 0,
			}, {
				whilePending: [{ id: 'steer', handoff: false }], duringHandoff: [{ id: 'steer', handoff: true }],
				editing: undefined, rerenders: true, afterHandoff: [], queue: [], persistedRequests: 0, persistedPending: 0,
			});
		});

		test('handoff rows respect transcript visibility and model disposal', () => {
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const requests = [false, true].map(hidden => new ChatRequestModel({
				session: model, message: { text: 'hidden', parts: [] }, variableData: { variables: [] },
				isHiddenFromTranscript: !hidden, isRequestHiddenFromTranscript: hidden,
			}));
			model.setPendingRequestHandoffs(requests);
			const visible = viewModel.getItems().filter(isRequestVM).length;
			model.dispose();
			assert.deepStrictEqual({ visible, remaining: model.pendingRequestHandoffs.get() }, { visible: 0, remaining: [] });
		});

		for (const retained of [false, true]) {
			test(`disposing the model does not emit a view refresh (handoff=${retained})`, () => {
				const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
				const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));
				if (retained) {
					const request = new ChatRequestModel({ session: model, message: { text: 'steering', parts: [] }, variableData: { variables: [] } });
					model.setPendingRequestHandoffs([request]);
				}
				let changes = 0;
				store.add(viewModel.onDidChange(() => changes++));
				model.dispose();
				assert.deepStrictEqual({ changes, retained: model.pendingRequestHandoffs.get() }, { changes: 0, retained: [] });
			});
		}

		test('getItems and isLast do not rebuild the list per call and follow model changes', () => {
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			let pendingScans = 0;
			const getPendingRequests = model.getPendingRequests.bind(model);
			model.getPendingRequests = () => {
				pendingScans++;
				return getPendingRequests();
			};
			add(model, 'a');
			add(model, 'hidden', true);
			const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const ids = () => viewModel.getItems().map(item => item.id);

			const initial = ids();
			for (let i = 0; i < 100; i++) {
				viewModel.getItems();
			}
			const scansWhileIdle = pendingScans;

			const added = add(model, 'b');
			const afterAdd = ids();
			const lastItem = viewModel.getItems().at(-1);
			const lastIsResponse = !!lastItem && isResponseVM(lastItem) && lastItem.isLast;
			model.removeRequest('a');
			const afterRemove = ids();
			model.removeRequest(added.id);
			const afterRemoveLast = ids();

			assert.deepStrictEqual({ initial: initial.length, scansWhileIdle, afterAdd: afterAdd.length, lastIsResponse, afterRemove: afterRemove.length, afterRemoveLast }, {
				initial: 2,
				scansWhileIdle: 1,
				afterAdd: 4,
				lastIsResponse: true,
				afterRemove: 2,
				afterRemoveLast: [],
			});
		});

		test('getItems cache is invalidated by disablement and pending request changes', () => {
			const requestDisablement = observableValue<IChatRequestDisablement[]>('requestDisablement', []);
			instantiationService.stub(IChatEditingService, upcastPartial<IChatEditingService>({
				createEditingSession: () => new class extends MockChatEditingSession {
					override readonly requestDisablement = requestDisablement;
				}([]),
			}));
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			model.startEditingSession();
			add(model, 'a');
			add(model, 'b');
			const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const count = () => viewModel.getItems().length;
			const before = count();

			requestDisablement.set([{ requestId: 'a' }], undefined);
			const disabled = count();
			requestDisablement.set([], undefined);
			const reenabled = count();

			const queuedRequest = add(model, 'q');
			const pending = model.addPendingRequest(queuedRequest, ChatRequestQueueKind.Queued, {} as IChatSendRequestOptions);
			const dividerKinds = () => viewModel.getItems().filter(isPendingDividerVM).map(item => item.dividerKind);
			const queued = dividerKinds();
			model.setPendingRequests([{ requestId: pending.request.id, kind: ChatRequestQueueKind.Steering }]);
			const steering = dividerKinds();
			model.removePendingRequest(pending.request.id);
			const none = dividerKinds();

			assert.deepStrictEqual({ before, disabled, reenabled, queued, steering, none }, {
				before: 4,
				disabled: 2,
				reenabled: 4,
				queued: [ChatRequestQueueKind.Queued],
				steering: [ChatRequestQueueKind.Steering],
				none: [],
			});
		});

		test('getItems cache is invalidated by streaming response changes', () => {
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const request = add(model, 'a');
			const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const before = viewModel.getItems();
			const idle = viewModel.getItems();

			request.response!.updateContent({ kind: 'markdownContent', content: new MarkdownString('streamed') });
			const streaming = viewModel.getItems();

			assert.deepStrictEqual({ stableWhenIdle: idle === before, rebuiltOnResponseChange: streaming !== before, sameItems: streaming.map(item => item.id) }, {
				stableWhenIdle: true,
				rebuiltOnResponseChange: true,
				sameItems: before.map(item => item.id),
			});
		});

		test('looking up the last response does not reorder the cached items', () => {
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			add(model, 'a');
			add(model, 'b');
			const viewModel = store.add(instantiationService.createInstance(ChatViewModel, model, undefined));

			const lastResponse = viewModel.getItems().findLast(isResponseVM);

			assert.deepStrictEqual({ lastResponse: lastResponse?.model.requestId, isLast: lastResponse?.isLast, first: viewModel.getItems()[0].id }, { lastResponse: 'b', isLast: true, first: 'a' });
		});
	});
});
