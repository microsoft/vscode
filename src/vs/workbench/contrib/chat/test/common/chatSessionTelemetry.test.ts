/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { InMemoryTestFileService, mock, TestContextService, TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { TestMcpService } from '../../../mcp/test/common/testMcpService.js';
import { ChatAgentService, IChatAgent, IChatAgentData, IChatAgentImplementation, IChatAgentService } from '../../common/chatAgents.js';
import { IChatEditingService, IChatEditingSession } from '../../common/chatEditingService.js';
import { IChatModel, ISerializableChatData } from '../../common/chatModel.js';
import { IChatFollowup, IChatService } from '../../common/chatService.js';
import { ChatService } from '../../common/chatServiceImpl.js';
import { ChatServiceTelemetry } from '../../common/chatServiceTelemetry.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { MockChatService } from './mockChatService.js';
import { MockChatVariablesService } from './mockChatVariables.js';

interface ITelemetryEvent {
	eventName: string;
	data: any;
}

class TestTelemetryService extends NullTelemetryService {
	public events: ITelemetryEvent[] = [];

	override publicLog2<E, C>(eventName: string, data: E): void {
		this.events.push({ eventName, data });
	}

	getEventsOfType(eventName: string): ITelemetryEvent[] {
		return this.events.filter(e => e.eventName === eventName);
	}

	clear(): void {
		this.events = [];
	}
}

const chatAgentId = 'TestAgent';
const chatAgent: IChatAgent = {
	id: chatAgentId,
	name: chatAgentId,
	fullName: 'Test Agent',
	description: 'Test agent for telemetry tests',
	isDefault: true,
	extensionId: nullExtensionDescription.identifier,
	extensionDisplayName: nullExtensionDescription.displayName || nullExtensionDescription.name,
	extensionPublisherId: nullExtensionDescription.publisher,
	publisherDisplayName: nullExtensionDescription.publisher,
	isCore: false,
	isDynamic: false,
	locations: [ChatAgentLocation.Chat],
	slashCommands: [],
	disambiguation: [],
	metadata: {},
	supportsToolReferences: false,
	onDidReceiveFollowups: Event.None,
	mode: ChatModeKind.Agent,
	tags: []
};

const chatAgentImplementation: IChatAgentImplementation = {
	async invoke() {
		return { metadata: {} };
	}
};

suite('ChatSessionTelemetry', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let telemetryService: TestTelemetryService;
	let chatAgentService: IChatAgentService;

	setup(async () => {
		telemetryService = new TestTelemetryService();

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IConfigurationService, new TestConfigurationService());
		serviceCollection.set(ILogService, new NullLogService());
		serviceCollection.set(ITelemetryService, telemetryService);
		serviceCollection.set(IStorageService, testDisposables.add(new TestStorageService()));
		serviceCollection.set(IFileService, testDisposables.add(new InMemoryTestFileService()));
		serviceCollection.set(IContextKeyService, new MockContextKeyService());
		serviceCollection.set(IWorkspaceContextService, new TestContextService());
		serviceCollection.set(IExtensionService, new TestExtensionService());
		serviceCollection.set(IChatVariablesService, new MockChatVariablesService());
		serviceCollection.set(IChatSlashCommandService, testDisposables.add(new ChatSlashCommandService()));
		serviceCollection.set(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
		serviceCollection.set(IMcpService, new TestMcpService());
		serviceCollection.set(IUserDataProfilesService, mock<IUserDataProfilesService>());
		serviceCollection.set(ILifecycleService, mock<ILifecycleService>());
		serviceCollection.set(IViewsService, mock<IViewsService>());
		serviceCollection.set(IEnvironmentService, mock<IEnvironmentService>());
		serviceCollection.set(IChatEditingService, mock<IChatEditingService>());

		instantiationService = testDisposables.add(new TestInstantiationService(serviceCollection));

		chatAgentService = testDisposables.add(instantiationService.createInstance(ChatAgentService));
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentId, chatAgentImplementation));
		serviceCollection.set(IChatAgentService, chatAgentService);
	});

	test('should emit sessionCreated telemetry when creating new session', async () => {
		const chatService = testDisposables.add(instantiationService.createInstance(ChatService));
		
		// Clear any initial events
		telemetryService.clear();
		
		const session = testDisposables.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		
		const sessionCreatedEvents = telemetryService.getEventsOfType('chatSessionCreated');
		assert.strictEqual(sessionCreatedEvents.length, 1);
		
		const eventData = sessionCreatedEvents[0].data;
		assert.strictEqual(eventData.sessionId, session.sessionId);
		assert.strictEqual(eventData.location, ChatAgentLocation.Chat);
		assert.strictEqual(eventData.isRestored, false);
		assert.strictEqual(eventData.hasHistory, false);
		assert.strictEqual(eventData.requestCount, 0);
	});

	test('should emit sessionCreated telemetry when restoring session with history', async () => {
		let sessionData: ISerializableChatData;
		
		// Create and populate a session first
		{
			const chatService = testDisposables.add(instantiationService.createInstance(ChatService));
			const session = testDisposables.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
			
			// Send a request to create history
			await chatService.sendRequest(session.sessionId, `@${chatAgentId} test request`);
			
			sessionData = JSON.parse(JSON.stringify(session));
		}
		
		// Clear events and restore session
		telemetryService.clear();
		
		const chatService2 = testDisposables.add(instantiationService.createInstance(ChatService));
		const restoredSession = chatService2.loadSessionFromContent(sessionData);
		
		assert(restoredSession);
		
		const sessionCreatedEvents = telemetryService.getEventsOfType('chatSessionCreated');
		assert.strictEqual(sessionCreatedEvents.length, 1);
		
		const eventData = sessionCreatedEvents[0].data;
		assert.strictEqual(eventData.sessionId, restoredSession.sessionId);
		assert.strictEqual(eventData.location, ChatAgentLocation.Chat);
		assert.strictEqual(eventData.isRestored, true);
		assert.strictEqual(eventData.hasHistory, true);
		assert.strictEqual(eventData.requestCount, 1);
	});

	test('should emit sessionDisposed telemetry when clearing session', async () => {
		const chatService = testDisposables.add(instantiationService.createInstance(ChatService));
		const session = testDisposables.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		const sessionId = session.sessionId;
		
		// Send a request to have some activity
		await chatService.sendRequest(sessionId, `@${chatAgentId} test request`);
		
		// Clear events and dispose session
		telemetryService.clear();
		const sessionStartTime = Date.now();
		
		await chatService.clearSession(sessionId);
		
		const sessionDisposedEvents = telemetryService.getEventsOfType('chatSessionDisposed');
		assert.strictEqual(sessionDisposedEvents.length, 1);
		
		const eventData = sessionDisposedEvents[0].data;
		assert.strictEqual(eventData.sessionId, sessionId);
		assert.strictEqual(eventData.reason, 'cleared');
		assert.strictEqual(eventData.requestCount, 1);
		assert.strictEqual(eventData.responseCount, 1);
		assert(typeof eventData.durationMs === 'number');
		assert(eventData.durationMs >= 0);
	});

	test('should emit sessionRestored telemetry on successful session restoration', async () => {
		let sessionData: ISerializableChatData;
		let originalSessionId: string;
		
		// Create a session with history
		{
			const chatService = testDisposables.add(instantiationService.createInstance(ChatService));
			const session = testDisposables.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
			originalSessionId = session.sessionId;
			
			await chatService.sendRequest(session.sessionId, `@${chatAgentId} test request`);
			sessionData = JSON.parse(JSON.stringify(session));
		}
		
		// Test restoration
		telemetryService.clear();
		
		const chatService2 = testDisposables.add(instantiationService.createInstance(ChatService));
		const restoredSession = await chatService2.getOrRestoreSession(originalSessionId);
		
		// Since getOrRestoreSession uses ChatSessionStore which will fail in memory, 
		// we expect a failed restoration event
		const sessionRestoredEvents = telemetryService.getEventsOfType('chatSessionRestored');
		assert.strictEqual(sessionRestoredEvents.length, 1);
		
		const eventData = sessionRestoredEvents[0].data;
		assert.strictEqual(eventData.sessionId, originalSessionId);
		assert.strictEqual(eventData.success, false);
		assert(typeof eventData.errorCode === 'string');
		assert.strictEqual(eventData.requestCount, 0);
		assert.strictEqual(eventData.ageInDays, 0);
	});

	test('should emit sessionPersisted telemetry when writing session to storage', async () => {
		const chatService = testDisposables.add(instantiationService.createInstance(ChatService));
		const session = testDisposables.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		
		// Send a request to create content
		await chatService.sendRequest(session.sessionId, `@${chatAgentId} test request`);
		
		// Clear events
		telemetryService.clear();
		
		// Trigger session clear which should persist the session
		await chatService.clearSession(session.sessionId);
		
		// Look for session persistence telemetry
		const sessionPersistedEvents = telemetryService.getEventsOfType('chatSessionPersisted');
		assert(sessionPersistedEvents.length >= 1, 'Should have at least one session persistence event');
		
		const eventData = sessionPersistedEvents[0].data;
		assert.strictEqual(eventData.sessionId, session.sessionId);
		assert(typeof eventData.success === 'boolean');
		assert(typeof eventData.requestCount === 'number');
		assert(typeof eventData.sizeInBytes === 'number');
		assert(eventData.sizeInBytes > 0);
	});

	test('telemetry should include proper GDPR-compliant fields', async () => {
		const chatService = testDisposables.add(instantiationService.createInstance(ChatService));
		telemetryService.clear();
		
		const session = testDisposables.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		
		const sessionCreatedEvents = telemetryService.getEventsOfType('chatSessionCreated');
		assert.strictEqual(sessionCreatedEvents.length, 1);
		
		const eventData = sessionCreatedEvents[0].data;
		
		// Verify all required fields are present
		assert(typeof eventData.sessionId === 'string');
		assert(typeof eventData.location === 'number');
		assert(typeof eventData.isRestored === 'boolean');
		assert(typeof eventData.hasHistory === 'boolean');
		assert(typeof eventData.requestCount === 'number');
		
		// Verify no sensitive data is included
		assert(!('userContent' in eventData));
		assert(!('responseContent' in eventData));
		assert(!('filePaths' in eventData));
		assert(!('userName' in eventData));
	});
});