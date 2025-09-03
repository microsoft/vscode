/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { ChatEditorInput } from '../../browser/chatEditorInput.js';
import { OpenChatSessionInNewWindowAction, OpenChatSessionInSidebarAction, OpenChatSessionInNewEditorGroupAction } from '../../browser/actions/chatSessionActions.js';
import { MockChatWidgetService } from './mockChatWidget.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';

suite('Chat Session Actions', () => {
	let instantiationService: TestInstantiationService;
	let mockEditorService: any;
	let mockWidgetService: MockChatWidgetService;
	let mockViewsService: any;
	let mockEditorGroupsService: any;

	setup(() => {
		instantiationService = new TestInstantiationService();
		
		// Mock editor service
		mockEditorService = {
			openEditor: sinon.stub().resolves(),
			closeEditor: sinon.stub().resolves(),
		};
		
		// Mock widget service
		mockWidgetService = new MockChatWidgetService();
		const mockWidget = {
			clear: sinon.stub(),
			waitForReady: sinon.stub().resolves(),
			viewModel: {
				sessionId: 'test-session-id'
			}
		};
		mockWidgetService.getWidgetBySessionId = sinon.stub().returns(mockWidget);
		
		// Mock views service  
		mockViewsService = {
			openView: sinon.stub().resolves({
				loadSession: sinon.stub().resolves(),
				focusInput: sinon.stub()
			})
		};
		
		// Mock editor groups service
		mockEditorGroupsService = {
			groups: [],
			addGroup: sinon.stub().returns({ id: 1 }),
			activeGroup: { id: 0 }
		};
		
		instantiationService.stub(IEditorService, mockEditorService);
		instantiationService.stub(IChatWidgetService, mockWidgetService);
		instantiationService.stub(IViewsService, mockViewsService);
		instantiationService.stub(IEditorGroupsService, mockEditorGroupsService);
		instantiationService.stub(ILogService, new NullLogService());
	});

	test('OpenChatSessionInNewWindowAction should clear existing widget before opening in new window', async () => {
		const action = new OpenChatSessionInNewWindowAction();
		const context = {
			sessionId: 'test-session-id',
			sessionType: 'widget' as const,
			currentTitle: 'Test Chat'
		};

		await action.run(instantiationService, context);

		// Verify that the widget was cleared before opening new editor
		const widget = mockWidgetService.getWidgetBySessionId('test-session-id');
		assert.ok(widget);
		assert.ok(widget.clear.calledOnce, 'Widget should be cleared to implement move behavior');
		assert.ok(widget.waitForReady.calledOnce, 'Should wait for widget to be ready after clearing');
		assert.ok(mockEditorService.openEditor.calledOnce, 'Should open editor in new window');
	});

	test('OpenChatSessionInSidebarAction should clear existing instances before loading in sidebar', async () => {
		const action = new OpenChatSessionInSidebarAction();
		const context = {
			sessionId: 'test-session-id',
			sessionType: 'editor' as const,
			currentTitle: 'Test Chat'
		};

		await action.run(instantiationService, context);

		// Verify that existing instances were cleared and session was loaded in sidebar
		const widget = mockWidgetService.getWidgetBySessionId('test-session-id');
		assert.ok(widget);
		assert.ok(widget.clear.calledOnce, 'Widget should be cleared to implement move behavior');
		assert.ok(mockViewsService.openView.calledOnce, 'Should open chat view in sidebar');
	});

	test('OpenChatSessionInNewEditorGroupAction should clear existing instances before opening in new group', async () => {
		const action = new OpenChatSessionInNewEditorGroupAction();
		const context = {
			sessionId: 'test-session-id',
			sessionType: 'widget' as const,
			currentTitle: 'Test Chat'
		};

		await action.run(instantiationService, context);

		// Verify that existing instances were cleared and new editor group was created
		const widget = mockWidgetService.getWidgetBySessionId('test-session-id');
		assert.ok(widget);
		assert.ok(widget.clear.calledOnce, 'Widget should be cleared to implement move behavior');
		assert.ok(mockEditorGroupsService.addGroup.calledOnce, 'Should create new editor group');
		assert.ok(mockEditorService.openEditor.calledOnce, 'Should open editor in new group');
	});
});