/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IChatWidgetViewContext, IQuickChatService } from '../../../browser/chat.js';
import { IChatViewHost, IChatViewHostService } from '../../../browser/chatViewHost.js';
import { ChatViewHostService } from '../../../browser/widgetHosts/viewPane/chatViewHostService.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { ChatVariablesService } from '../../../browser/attachments/chatVariables.js';
import { ChatWidgetService } from '../../../browser/widget/chatWidgetService.js';
import { IDynamicVariable } from '../../../common/attachments/chatVariables.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { ToolAndToolSetEnablementMap } from '../../../common/tools/languageModelToolsService.js';

suite('ChatWidgetService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** The host of the Chat view's chats as in the workbench: the Chat view, through the stubbed views service. */
	function stubChatViewHostService(instantiationService: TestInstantiationService): void {
		instantiationService.stub(IViewDescriptorService, {});
		instantiationService.stub(IWorkbenchLayoutService, {});
		instantiationService.stub(IProgressService, {});
		instantiationService.stub(IChatViewHostService, instantiationService.createInstance(ChatViewHostService));
	}

	test('only input-request routing prefers the full session over Inbox, preserving the submitting input context', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
		stubChatViewHostService(instantiationService);
		const service = store.add(instantiationService.createInstance(ChatWidgetService));
		const variablesService = new ChatVariablesService(service);
		const resource = URI.parse('test:/session');
		const references: IDynamicVariable[] = [{
			id: 'inbox-file', isFile: true, data: URI.file('/workspace/file.ts'),
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 },
		}];
		const inboxTools = ToolAndToolSetEnablementMap.fromEntries([]);
		const createWidget = (supportsInputRequests: boolean) => upcastPartial<IChatWidget>({
			supportsInputRequests,
			supportsFileReferences: true,
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: resource }),
			getContrib: stub().returns(upcastPartial<ChatDynamicVariableModel>({ variables: supportsInputRequests ? [] : references })),
			input: upcastPartial<IChatWidget['input']>({
				attachmentModel: upcastPartial<IChatWidget['input']['attachmentModel']>({ attachments: [] }),
				selectedToolsModel: upcastPartial<IChatWidget['input']['selectedToolsModel']>({
					entriesMap: constObservable(supportsInputRequests ? ToolAndToolSetEnablementMap.fromEntries([]) : inboxTools),
				}),
			}),
			onDidFocus: Event.None,
			onDidShow: Event.None,
			onDidHide: Event.None,
			onDidChangeViewModel: Event.None,
		});
		const inbox = createWidget(false);
		const fullSession = createWidget(true);
		const firstRegular = store.add(service.register(fullSession));
		const secondRegular = store.add(service.register(createWidget(true)));
		const ordinaryRouting = {
			default: service.getWidgetBySessionResource(resource) === fullSession,
			inputRequests: service.getWidgetBySessionResource(resource, { preferInputRequests: true }) === fullSession,
		};
		firstRegular.dispose();
		secondRegular.dispose();
		store.add(service.register(inbox));
		const inboxOnly = service.getWidgetBySessionResource(resource);
		const registration = store.add(service.register(fullSession));
		const withFullSession = service.getWidgetBySessionResource(resource, { preferInputRequests: true });
		const submittingWidget = service.getWidgetBySessionResource(resource);
		const dynamicVariables = variablesService.getDynamicVariables(resource);
		const selectedTools = variablesService.getSelectedToolAndToolSets(resource);
		registration.dispose();
		assert.deepStrictEqual({
			ordinaryRouting,
			inboxOnly: inboxOnly === inbox,
			withFullSession: withFullSession === fullSession,
			submittingWidget: submittingWidget === inbox,
			dynamicVariables,
			selectedTools: selectedTools === inboxTools,
			afterClosingSession: service.getWidgetBySessionResource(resource, { preferInputRequests: true }) === inbox,
			unrelatedSession: service.getWidgetBySessionResource(URI.parse('test:/other')),
		}, { ordinaryRouting: { default: true, inputRequests: true }, inboxOnly: true, withFullSession: true, submittingWidget: true, dynamicVariables: references, selectedTools: true, afterClosingSession: true, unrelatedSession: undefined });
	});

	test('shows what the Chat view would in the host of the Chat view\'s chats', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ groups: [] }));
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async (id: string, focus?: boolean) => { calls.push(`openView ${id} focus=${focus}`); return null; }) as IViewsService['openView'],
			getViewWithId: () => null,
		}));
		instantiationService.stub(IQuickChatService, upcastPartial<IQuickChatService>({ sessionResource: undefined }));
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ acquireExistingSession: () => undefined }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			reveal: async preserveFocus => { calls.push(`reveal preserveFocus=${preserveFocus}`); return undefined; },
			revealIfShowing: async () => undefined,
			openSession: async (sessionResource, options) => { calls.push(`openSession ${sessionResource.toString()} preserveFocus=${options?.preserveFocus} reason=${options?.sessionTypeSelectionReason}`); return undefined; },
		}));
		const service = store.add(instantiationService.createInstance(ChatWidgetService));
		const resource = URI.parse('test:/session');

		await service.revealWidget();
		await service.revealChatView(true);
		await service.openSession(resource);
		await service.openSession(resource, ChatViewPaneTarget, { preserveFocus: true, sessionTypeSelectionReason: 'explicitOverride' });

		assert.deepStrictEqual(calls, [
			'reveal preserveFocus=undefined',
			'reveal preserveFocus=true',
			'openSession test:/session preserveFocus=undefined reason=undefined',
			'openSession test:/session preserveFocus=true reason=explicitOverride',
		]);
	});

	test('revealWidget reuses a visible chat widget hosted outside of the chat view, such as the Agents window session chat', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const openedViews: string[] = [];
		instantiationService.stub(IEditorGroupsService, { groups: [] });
		instantiationService.stub(IViewsService, {
			getViewWithId: () => null,
			openView: async (id: string) => { openedViews.push(id); return null; },
		});
		instantiationService.stub(IQuickChatService, { sessionResource: undefined });
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
		stubChatViewHostService(instantiationService);
		const service = store.add(instantiationService.createInstance(ChatWidgetService));
		const createWidget = (visible: boolean, viewContext: IChatWidgetViewContext) => {
			const focusInput = stub();
			const widget = upcastPartial<IChatWidget>({
				visible,
				viewContext,
				location: ChatAgentLocation.Chat,
				viewModel: upcastPartial<IChatViewModel>({ sessionResource: URI.parse('test:/session') }),
				focusInput,
				onDidFocus: Event.None,
				onDidShow: Event.None,
				onDidHide: Event.None,
				onDidChangeViewModel: Event.None,
			});
			return { widget, focusInput };
		};
		const revealLastFocused = async (visible: boolean, viewContext: IChatWidgetViewContext, preserveFocus?: boolean) => {
			const { widget, focusInput } = createWidget(visible, viewContext);
			const registration = service.register(widget);
			try {
				const revealed = await service.revealWidget(preserveFocus);
				return { revealed: revealed === widget, focusInput: focusInput.callCount };
			} finally {
				registration.dispose();
			}
		};

		const result = {
			visible: await revealLastFocused(true, {}),
			visiblePreserveFocus: await revealLastFocused(true, {}, true),
			hidden: await revealLastFocused(false, {}),
			quickChat: await revealLastFocused(true, { isQuickChat: true }),
			inlineChat: await revealLastFocused(true, { isInlineChat: true }),
			openedViews,
		};
		assert.deepStrictEqual(result, {
			visible: { revealed: true, focusInput: 1 },
			visiblePreserveFocus: { revealed: true, focusInput: 0 },
			hidden: { revealed: false, focusInput: 0 },
			quickChat: { revealed: false, focusInput: 0 },
			inlineChat: { revealed: false, focusInput: 0 },
			openedViews: [ChatViewId, ChatViewId, ChatViewId],
		});
	});
	suite('Chat view widgets with a replacement host', () => {

		const session = URI.parse('test:/session');

		function setUp() {
			const instantiationService = store.add(new TestInstantiationService());
			const calls: string[] = [];
			const createWidget = (sessionResource: URI | undefined) => upcastPartial<IChatWidget>({
				visible: true,
				viewContext: { viewId: ChatViewId },
				location: ChatAgentLocation.Chat,
				viewModel: sessionResource ? upcastPartial<IChatViewModel>({ sessionResource }) : undefined,
				onDidFocus: Event.None,
				onDidShow: Event.None,
				onDidHide: Event.None,
				onDidChangeViewModel: Event.None,
			});
			const oldWidget = createWidget(session);
			const emptyOldWidget = createWidget(undefined);
			const hostWidget = upcastPartial<IChatWidget>({});
			const view = { widget: oldWidget, focus: () => calls.push('view.focus'), loadSession: async () => { calls.push('view.loadSession'); } };
			instantiationService.stub(IEditorGroupsService, { groups: [] });
			instantiationService.stub(IViewsService, {
				getViewWithId: (() => view) as unknown as IViewsService['getViewWithId'],
				openView: (async (id: string) => { calls.push(`openView ${id}`); return view; }) as unknown as IViewsService['openView'],
			});
			instantiationService.stub(IQuickChatService, { sessionResource: undefined });
			instantiationService.stub(ILayoutService, {});
			instantiationService.stub(IEditorService, {});
			instantiationService.stub(IChatService, { acquireExistingSession: () => undefined });
			instantiationService.stub(ILogService, new NullLogService());
			stubChatViewHostService(instantiationService);
			const hostService = instantiationService.get(IChatViewHostService);
			const service = store.add(instantiationService.createInstance(ChatWidgetService));
			return { calls, service, hostService, oldWidget, emptyOldWidget, hostWidget };
		}

		test('a Chat view that still holds the session is not shown or returned instead of what the replacement host shows', async () => {
			const { calls, service, hostService, oldWidget, hostWidget } = setUp();
			store.add(hostService.registerHost(upcastPartial<IChatViewHost>({
				reveal: async () => { calls.push('host.reveal'); return hostWidget; },
				openSession: async () => { calls.push('host.openSession'); return hostWidget; },
			})));
			const registration = service.register(oldWidget);
			store.add(registration);

			const result = {
				openSession: (await service.openSession(session)) === hostWidget,
				revealOpenSession: (await service.openSession(session, undefined, { revealIfOpened: true })) === hostWidget,
				revealWidget: (await service.revealWidget()) === hostWidget,
				calls,
			};

			assert.deepStrictEqual(result, {
				openSession: true,
				revealOpenSession: true,
				revealWidget: true,
				calls: ['host.openSession', 'host.openSession', 'host.reveal'],
			});
		});

		test('a Chat view widget without a session is revealed by the replacement host, which may show none', async () => {
			const { calls, service, hostService, emptyOldWidget } = setUp();
			store.add(hostService.registerHost(upcastPartial<IChatViewHost>({
				reveal: async () => { calls.push('host.reveal'); return undefined; },
			})));

			const revealed = await service.reveal(emptyOldWidget);

			assert.deepStrictEqual({ revealed, calls }, { revealed: false, calls: ['host.reveal'] });
		});

		test('without a replacement host, a Chat view that holds the session is shown as it is, without loading the session again', async () => {
			const { calls, service, oldWidget } = setUp();

			const widget = await service.openSession(session);

			assert.deepStrictEqual({ shown: widget === oldWidget, calls }, { shown: true, calls: [`openView ${ChatViewId}`, 'view.focus'] });
		});
	});
});
