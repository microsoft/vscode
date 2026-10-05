/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { IReference, MutableDisposable, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { mockObject, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { registerMoveActions } from '../../../browser/actions/chatMoveActions.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidgetService, IChatWidgetViewContext, IQuickChatService } from '../../../browser/chat.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatWidgetService } from '../../../browser/widget/chatWidgetService.js';
import { ChatEditorInput } from '../../../browser/widgetHosts/editor/chatEditorInput.js';
import { ChatViewPane } from '../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';
import { MockChatModel } from '../../common/model/mockChatModel.js';

suite('Chat move actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	registerMoveActions();

	function createServices(options: { failure?: 'clear' | 'open'; viewContext?: IChatWidgetViewContext; editorClose?: 'success' | 'cancel' | 'error' } = {}) {
		const resource = LocalChatSessionUri.forSession('moving-session');
		const model = store.add(new MockChatModel(resource));
		let disposalCount = 0;
		const references = new class extends ReferenceCollection<IChatModel> {
			protected createReferencedObject(): IChatModel { return model; }
			protected destroyReferencedObject(): void { disposalCount++; }
		}();
		const sourceRef = store.add(references.acquire(resource.toString()));
		const destinationRef = store.add(new MutableDisposable<IReference<IChatModel>>());
		const error = new Error('Unable to move chat');
		const state = { disposalCountWhenOpening: -1, cleared: false, opened: false };
		const widget = upcastPartial<ChatWidget>({
			location: ChatAgentLocation.Chat,
			viewContext: options.viewContext ?? {},
			viewModel: upcastPartial<ChatViewModel>({ sessionResource: resource, model }),
			getInputState: () => undefined,
			async clear() {
				sourceRef.dispose();
				state.cleared = true;
				if (options.failure === 'clear') {
					throw error;
				}
			},
			onDidFocus: Event.None,
			onDidShow: Event.None,
			onDidHide: Event.None,
			onDidChangeViewModel: Event.None,
		});
		const open = async () => {
			state.disposalCountWhenOpening = disposalCount;
			if (options.failure === 'open') {
				throw error;
			}
			destinationRef.value = references.acquire(resource.toString());
			state.opened = true;
		};
		const view = upcastPartial<ChatViewPane>({
			widget,
			async loadSession() {
				await open();
				return model;
			},
			focusInput() { },
		});
		const viewsService = upcastPartial<IViewsService>({
			openView: mockObject<IViewsService>()().openView.resolves(view),
		});
		const instantiationService = store.add(new TestInstantiationService());
		const chatService = upcastPartial<IChatService>({
			acquireExistingSession: () => references.acquire(resource.toString()),
		});
		let sourceEditor: ChatEditorInput | undefined;
		let sourceGroup: IEditorGroup | undefined;
		if (options.editorClose) {
			sourceEditor = store.add(new ChatEditorInput(
				resource, {}, chatService,
				upcastPartial<IDialogService>({}),
				upcastPartial<IConfigurationService>({}),
				upcastPartial<IChatSessionsService>({}),
				instantiationService,
				upcastPartial<IStorageService>({}),
				new NullLogService(),
				upcastPartial<IWorkspaceContextService>({}),
				upcastPartial<IAgentHostEnablementService>({}),
				upcastPartial<IAgentHostConnectionsService>({}),
				NullTelemetryService,
				upcastPartial<IProgressService>({}),
			));
			sourceEditor.updateModel(model);
			sourceRef.dispose();
			sourceGroup = upcastPartial<IEditorGroup>({
				id: 1,
				editors: [sourceEditor],
				async closeEditor() {
					if (options.editorClose === 'error') {
						throw error;
					}
					if (options.editorClose === 'cancel') {
						return false;
					}
					sourceEditor!.dispose();
					return true;
				},
			});
		}
		const widgetService: IChatWidgetService = store.add(new ChatWidgetService(
			upcastPartial<IEditorGroupsService>({ groups: sourceGroup ? [sourceGroup] : [] }),
			viewsService,
			upcastPartial<IQuickChatService>({}),
			upcastPartial<ILayoutService>({}),
			upcastPartial<IEditorService>({
				openEditor: async () => { await open(); return undefined; },
				closeEditor: async () => { await sourceGroup?.closeEditor(); },
			}),
			chatService,
			new NullLogService(),
		));
		store.add(widgetService.register(widget));
		instantiationService.set(IChatWidgetService, widgetService);
		return { instantiationService, widgetService, widget, resource, sourceRef, sourceEditor, destinationRef, state, error, disposalCount: () => disposalCount };
	}

	for (const commandId of ['workbench.action.chat.openInEditor', 'workbench.action.chat.openInNewWindow']) {
		test(`${commandId} retains the model until the destination opens`, async () => {
			const services = createServices();
			const command = CommandsRegistry.getCommand(commandId);
			assert.ok(command);
			await services.instantiationService.invokeFunction(command.handler);
			assert.deepStrictEqual(services.state, {
				disposalCountWhenOpening: 0,
				cleared: true,
				opened: true,
			});

			services.destinationRef.clear();
			assert.strictEqual(services.disposalCount(), 1);
		});
	}

	test('moving to the sidebar retains the model until the destination opens', async () => {
		const services = createServices();
		await services.widgetService.openSession(services.resource, ChatViewPaneTarget);
		assert.deepStrictEqual(services.state, {
			disposalCountWhenOpening: 0,
			cleared: true,
			opened: true,
		});

		services.destinationRef.clear();
		assert.strictEqual(services.disposalCount(), 1);
	});

	for (const target of [ACTIVE_GROUP, AUX_WINDOW_GROUP, ChatViewPaneTarget] as const) {
		for (const failure of ['clear', 'open'] as const) {
			test(`releases the handoff reference when ${failure} fails for ${String(target)}`, async () => {
				const services = createServices({ failure });
				await assert.rejects(services.widgetService.openSession(services.resource, target), services.error);
				assert.strictEqual(services.disposalCount(), 1);
			});
		}
	}

	test('moving to the current sidebar does not clear the source', async () => {
		const services = createServices({ viewContext: { viewId: ChatViewId } });
		await services.widgetService.openSession(services.resource, ChatViewPaneTarget);
		assert.strictEqual(services.state.cleared, false);
		services.sourceRef.dispose();
		services.destinationRef.clear();
		assert.strictEqual(services.disposalCount(), 1);
	});

	for (const target of [ACTIVE_GROUP, AUX_WINDOW_GROUP, ChatViewPaneTarget] as const) {
		for (const editorClose of ['success', 'cancel', 'error'] as const) {
			test(`respects editor close ${editorClose} when moving to ${String(target)}`, async () => {
				const services = createServices({ editorClose });
				if (editorClose === 'error') {
					await assert.rejects(services.widgetService.openSession(services.resource, target), services.error);
				} else {
					await services.widgetService.openSession(services.resource, target);
				}

				assert.deepStrictEqual({
					opened: services.state.opened,
					sourceDisposed: services.sourceEditor?.isDisposed(),
					disposals: services.disposalCount(),
				}, {
					opened: editorClose === 'success',
					sourceDisposed: editorClose === 'success',
					disposals: 0,
				});

				services.sourceEditor?.dispose();
				services.destinationRef.clear();
				assert.strictEqual(services.disposalCount(), 1);
			});
		}
	}
});
