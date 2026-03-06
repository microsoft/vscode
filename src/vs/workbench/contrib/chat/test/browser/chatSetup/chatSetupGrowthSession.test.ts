/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatSessionStatus } from '../../../common/chatSessionsService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { IAgentSession, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { GrowthSessionController, GrowthSessionOpenerParticipant } from '../../../browser/chatSetup/chatSetupGrowthSession.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { MockChatService } from '../../common/mockChatService.js';

class TestMockChatWidgetService extends MockChatWidgetService {

	private readonly _onDidAddWidget = new Emitter<IChatWidget>();
	override readonly onDidAddWidget = this._onDidAddWidget.event;

	fireDidAddWidget(): void {
		this._onDidAddWidget.fire(undefined!);
	}

	dispose(): void {
		this._onDidAddWidget.dispose();
	}
}

class TestChatService extends MockChatService {

	private readonly _onDidSubmitRequest = new Emitter<{ readonly chatSessionResource: URI }>();
	override readonly onDidSubmitRequest = this._onDidSubmitRequest.event;

	constructor(private readonly hasExistingSessions: boolean) {
		super();
	}

	override hasSessions(): boolean {
		return this.hasExistingSessions;
	}

	fireDidSubmitRequest(): void {
		this._onDidSubmitRequest.fire({ chatSessionResource: URI.parse('local://test') });
	}
}

class TestAgentSessionsService implements IAgentSessionsService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = new Emitter<void>();
	private readonly service = this;
	readonly model: IAgentSessionsModel = {
		onWillResolve: Event.None,
		onDidResolve: Event.None,
		onDidChangeSessions: this._onDidChangeSessions.event,
		onDidChangeSessionArchivedState: Event.None,
		get resolved() { return true; },
		get sessions() { return service.sessions; },
		getSession: (resource: URI) => service.sessions.find(session => session.resource.toString() === resource.toString()),
		resolve: async () => { },
	};

	sessions: IAgentSession[] = [];

	fireDidChangeSessions(): void {
		this._onDidChangeSessions.fire();
	}
}

suite('GrowthSessionController', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let mockWidgetService: TestMockChatWidgetService;
	let mockChatService: TestChatService;
	let mockAgentSessionsService: TestAgentSessionsService;

	setup(() => {
		instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		mockWidgetService = new TestMockChatWidgetService();
		disposables.add({ dispose: () => mockWidgetService.dispose() });
		mockChatService = new TestChatService(false);
		mockAgentSessionsService = new TestAgentSessionsService();
		const mockLifecycleService = disposables.add(new TestLifecycleService());
		instantiationService.stub(IChatWidgetService, mockWidgetService);
		instantiationService.stub(IChatService, mockChatService);
		instantiationService.stub(IAgentSessionsService, mockAgentSessionsService);
		instantiationService.stub(ILifecycleService, mockLifecycleService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return a single NeedsInput session item', () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));

		const items = controller.items;
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].status, ChatSessionStatus.NeedsInput);
		assert.strictEqual(items[0].label, 'Try Copilot');
		assert.ok(items[0].resource.scheme === AgentSessionProviders.Growth);
	});

	test('should return empty items after dismiss', async () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
		assert.strictEqual(controller.items.length, 1);

		// Allow the lifecycle.when() promise to resolve and register the listener
		await new Promise<void>(r => setTimeout(r, 0));

		// Fire widget add — should dismiss
		mockWidgetService.fireDidAddWidget();
		assert.strictEqual(controller.items.length, 0);
	});

	test('should start dismissed when sessions already exist', () => {
		const chatServiceWithSessions = new TestChatService(true);
		instantiationService.stub(IChatService, chatServiceWithSessions);

		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
		assert.strictEqual(controller.items.length, 0);
	});

	test('should dismiss on chat request', () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
		assert.strictEqual(controller.items.length, 1);

		mockChatService.fireDidSubmitRequest();
		assert.strictEqual(controller.items.length, 0);
	});

	test('should dismiss when archived', () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
		assert.strictEqual(controller.items.length, 1);

		const session: IAgentSession = {
			providerType: AgentSessionProviders.Growth,
			providerLabel: 'Growth',
			resource: URI.parse('growth://welcome'),
			status: ChatSessionStatus.NeedsInput,
			label: 'Try Copilot',
			icon: Codicon.lightbulb,
			timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
			isArchived: () => false,
			setArchived: () => { session.isArchived = () => true; },
			isRead: () => true,
			setRead: () => { },
		};
		mockAgentSessionsService.sessions = [session];
		mockAgentSessionsService.fireDidChangeSessions();
		session.setArchived(true);
		mockAgentSessionsService.fireDidChangeSessions();

		assert.strictEqual(controller.items.length, 0);
	});

	test('should fire onDidChangeChatSessionItems on dismiss', async () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));

		let fired = false;
		disposables.add(controller.onDidChangeChatSessionItems(() => {
			fired = true;
		}));

		await new Promise<void>(r => setTimeout(r, 0));

		mockWidgetService.fireDidAddWidget();
		assert.strictEqual(fired, true);
	});

	test('should not fire onDidChangeChatSessionItems twice', async () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));

		let fireCount = 0;
		disposables.add(controller.onDidChangeChatSessionItems(() => {
			fireCount++;
		}));

		await new Promise<void>(r => setTimeout(r, 0));

		mockWidgetService.fireDidAddWidget();
		mockWidgetService.fireDidAddWidget();
		assert.strictEqual(fireCount, 1);
	});

	test('refresh is a no-op', async () => {
		const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
		await controller.refresh();
		assert.strictEqual(controller.items.length, 1);
	});
});

suite('GrowthSessionOpenerParticipant', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return false for non-Growth sessions', async () => {
		const participant = new GrowthSessionOpenerParticipant();
		const session: IAgentSession = {
			providerType: AgentSessionProviders.Local,
			providerLabel: 'Local',
			resource: URI.parse('local://session-1'),
			status: ChatSessionStatus.Completed,
			label: 'Test Session',
			icon: Codicon.vm,
			timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
			isArchived: () => false,
			setArchived: () => { },
			isRead: () => true,
			setRead: () => { },
		};

		// The participant checks providerType before touching the accessor,
		// so a stub accessor is sufficient for this test path.
		const stubAccessor = { get: () => undefined } as unknown as ServicesAccessor;
		const result = await participant.handleOpenSession(stubAccessor, session);
		assert.strictEqual(result, false);
	});
});
