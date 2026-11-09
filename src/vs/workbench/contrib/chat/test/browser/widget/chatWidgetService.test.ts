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
import { IChatWidget, IQuickChatService } from '../../../browser/chat.js';
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
});
