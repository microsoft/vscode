/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
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
import { ChatWidgetService } from '../../../browser/widget/chatWidgetService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatWidgetService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('full-session controls are not routed to the Inbox input-only widget', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
		const service = store.add(instantiationService.createInstance(ChatWidgetService));
		const resource = URI.parse('test:/session');
		const createWidget = (supportsInputRequests: boolean) => upcastPartial<IChatWidget>({
			supportsInputRequests,
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: resource }),
			onDidFocus: Event.None,
			onDidShow: Event.None,
			onDidHide: Event.None,
			onDidChangeViewModel: Event.None,
		});
		const inbox = createWidget(false);
		const fullSession = createWidget(true);
		store.add(service.register(inbox));
		const inboxOnly = service.getWidgetBySessionResource(resource);
		const registration = store.add(service.register(fullSession));
		const withFullSession = service.getWidgetBySessionResource(resource);
		registration.dispose();
		assert.deepStrictEqual({
			inboxOnly: inboxOnly === inbox,
			withFullSession: withFullSession === fullSession,
			afterClosingSession: service.getWidgetBySessionResource(resource) === inbox,
			unrelatedSession: service.getWidgetBySessionResource(URI.parse('test:/other')),
		}, { inboxOnly: true, withFullSession: true, afterClosingSession: true, unrelatedSession: undefined });
	});
});
