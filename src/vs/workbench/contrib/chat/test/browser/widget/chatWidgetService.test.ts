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
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IQuickChatService } from '../../../browser/chat.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { ChatVariablesService } from '../../../browser/attachments/chatVariables.js';
import { ChatWidgetService } from '../../../browser/widget/chatWidgetService.js';
import { IDynamicVariable } from '../../../common/attachments/chatVariables.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { ToolAndToolSetEnablementMap } from '../../../common/tools/languageModelToolsService.js';

suite('ChatWidgetService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only input-request routing prefers the full session over Inbox, preserving the submitting input context', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
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

	test('what replaces the Chat view shows what the Chat view would, which then never opens', async () => {
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
		const service = store.add(instantiationService.createInstance(ChatWidgetService));
		const resource = URI.parse('test:/session');

		await service.revealChatView(false);
		const withoutDelegate = calls.splice(0);
		const registration = service.setChatViewHostDelegate({
			reveal: async preserveFocus => { calls.push(`reveal preserveFocus=${preserveFocus}`); return undefined; },
			openSession: async (sessionResource, preserveFocus) => { calls.push(`openSession ${sessionResource.toString()} preserveFocus=${preserveFocus}`); return undefined; },
			toggle: async () => { },
			newSession: async () => undefined,
		});
		await service.revealWidget();
		await service.revealChatView(true);
		await service.openSession(resource);
		await service.openSession(resource, ChatViewPaneTarget, { preserveFocus: true });
		const withDelegate = calls.splice(0);
		registration.dispose();

		assert.deepStrictEqual({ withoutDelegate, withDelegate, afterDispose: service.chatViewHostDelegate }, {
			withoutDelegate: [`openView ${ChatViewId} focus=true`],
			withDelegate: [
				'reveal preserveFocus=undefined',
				'reveal preserveFocus=true',
				'openSession test:/session preserveFocus=undefined',
				'openSession test:/session preserveFocus=true',
			],
			afterDispose: undefined,
		});
	});
});
