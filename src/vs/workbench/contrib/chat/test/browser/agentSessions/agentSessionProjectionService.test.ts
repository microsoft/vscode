/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentSessionProjectionService, IAgentSessionProjectionService } from '../../../browser/agentSessions/agentSessionProjectionService.js';
import { IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { TestEditorService } from '../../../../../test/browser/workbenchTestServices.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IAgentStatusService } from '../../../browser/agentSessions/agentStatusService.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('AgentSessionProjectionService', () => {
	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let projectionService: IAgentSessionProjectionService;
	let mockChatSessionsService: MockChatSessionsService;
	let mockContextKeyService: MockContextKeyService;
	let mockConfigurationService: TestConfigurationService;
	let mockChatWidgetService: MockChatWidgetService;

	class MockChatWidgetService {
		async openSession(_resource: URI, _target: any, _options: any): Promise<any> {
			return undefined;
		}
	}

	class MockEditorGroupsService {
		saveWorkingSet(_id: string): any {
			return { id: _id };
		}
		applyWorkingSet(_workingSet: any, _options?: any): Promise<void> {
			return Promise.resolve();
		}
		deleteWorkingSet(_workingSet: any): void { }
		getWorkingSets(): any[] {
			return [];
		}
	}

	class MockWorkbenchLayoutService {
		mainContainer = {
			classList: {
				add(_className: string): void { },
				remove(_className: string): void { }
			}
		};
	}

	class MockCommandService {
		async executeCommand(_commandId: string, ..._args: any[]): Promise<any> {
			return undefined;
		}
	}

	class MockChatEditingService {
		getEditingSession(_resource: URI): any {
			return undefined;
		}
	}

	class MockAgentStatusService {
		enterSessionMode(_sessionId: string, _sessionLabel: string): void { }
		exitSessionMode(): void { }
	}

	function createMockSession(status: ChatSessionStatus): IAgentSession {
		return {
			providerType: AgentSessionProviders.Local,
			providerLabel: 'Local',
			resource: URI.parse('test://session-1'),
			status,
			tooltip: undefined,
			label: 'Test Session',
			description: undefined,
			badge: undefined,
			icon: ThemeIcon.fromId('test'),
			timing: {
				startedTime: Date.now(),
				inProgressTime: undefined,
				finishedOrFailedTime: undefined
			},
			changes: undefined,
			isArchived: () => false,
			setArchived: (_archived: boolean) => { },
			isRead: () => false,
			setRead: (_read: boolean) => { }
		};
	}

	setup(() => {
		mockChatSessionsService = new MockChatSessionsService();
		mockContextKeyService = new MockContextKeyService();
		mockConfigurationService = new TestConfigurationService();
		mockConfigurationService.setUserConfiguration(ChatConfiguration.AgentSessionProjectionEnabled, true);
		mockChatWidgetService = new MockChatWidgetService();

		instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		instantiationService.stub(IChatSessionsService, mockChatSessionsService);
		instantiationService.stub(IContextKeyService, mockContextKeyService);
		instantiationService.stub(IConfigurationService, mockConfigurationService);
		instantiationService.stub(IEditorGroupsService, new MockEditorGroupsService());
		instantiationService.stub(IEditorService, new TestEditorService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatWidgetService, mockChatWidgetService);
		instantiationService.stub(IWorkbenchLayoutService, new MockWorkbenchLayoutService());
		instantiationService.stub(ICommandService, new MockCommandService());
		instantiationService.stub(IChatEditingService, new MockChatEditingService());
		instantiationService.stub(IAgentStatusService, new MockAgentStatusService());

		projectionService = instantiationService.createInstance(AgentSessionProjectionService);
		disposables.add(projectionService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should not enter projection mode when session is in progress', async () => {
		const session = createMockSession(ChatSessionStatus.InProgress);
		let openSessionCalled = false;

		mockChatWidgetService.openSession = async (_resource: URI, _target: any, _options: any) => {
			openSessionCalled = true;
			return undefined;
		};

		await projectionService.enterProjection(session);

		// Should not be in projection mode
		assert.strictEqual(projectionService.isActive, false);
		// But should have opened the session in the chat widget
		assert.strictEqual(openSessionCalled, true);
	});

	test('should not enter projection mode when session needs input', async () => {
		const session = createMockSession(ChatSessionStatus.NeedsInput);
		let openSessionCalled = false;

		mockChatWidgetService.openSession = async (_resource: URI, _target: any, _options: any) => {
			openSessionCalled = true;
			return undefined;
		};

		await projectionService.enterProjection(session);

		// Should not be in projection mode
		assert.strictEqual(projectionService.isActive, false);
		// But should have opened the session in the chat widget
		assert.strictEqual(openSessionCalled, true);
	});

	test('should attempt to enter projection mode when session is completed', async () => {
		const session = createMockSession(ChatSessionStatus.Completed);
		let openSessionCalled = false;

		mockChatWidgetService.openSession = async (_resource: URI, _target: any, _options: any) => {
			openSessionCalled = true;
			return undefined;
		};

		await projectionService.enterProjection(session);

		// Should have opened the session (though may not enter projection mode if there are no changes)
		assert.strictEqual(openSessionCalled, true);
	});
});
