/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsListModelService, SessionSortMode } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionCapabilities, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionsChatAccessibilityHelp } from '../../../chat/browser/sessionsChatAccessibilityHelp.js';
import { SessionsFlatList, SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import '../../browser/views/sessionsViewActions.js';

const ITestAgentSessionsService = createDecorator<object>('agentSessions');

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];

	override async executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ commandId, args });
		return undefined;
	}
}

class TestSessionsManagementService extends mock<ISessionsManagementService>() {
	override readonly onDidChangeSessions = Event.None;
	sessions: ISession[];
	readonly readSessions: ISession[] = [];
	readonly renamed: { readonly session: ISession; readonly title: string }[] = [];
	renameError: Error | undefined;

	constructor(sessions: ISession[]) {
		super();
		this.sessions = sessions;
	}

	override getSessions(): ISession[] {
		return this.sessions;
	}

	override async markRead(session: ISession): Promise<void> {
		this.readSessions.push(session);
	}

	override async renameSession(session: ISession, title: string): Promise<void> {
		this.renamed.push({ session, title });
		if (this.renameError) {
			throw this.renameError;
		}
	}
}

class TestQuickInputService extends mock<IQuickInputService>() {
	result: string | undefined;
	options: IInputOptions | undefined;
	calls = 0;

	override async input(options?: IInputOptions): Promise<string | undefined> {
		this.calls++;
		this.options = options;
		return this.result;
	}
}

function createSession(title: string, resourceId: string = title): { readonly session: ISession; readonly capabilities: ISettableObservable<ISessionCapabilities, void> } {
	const now = new Date();
	const resource = URI.parse(`test-session://${resourceId}`);
	const capabilities = observableValue<ISessionCapabilities>(`capabilities-${resourceId}`, { supportsMultipleChats: false, supportsRename: true });
	const session: ISession = {
		sessionId: resourceId,
		resource,
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: now,
		workspace: constObservable({
			uri: URI.parse(`test-workspace://${resourceId}`),
			label: 'Workspace',
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		isQuickChat: constObservable(false),
		title: constObservable(title),
		updatedAt: constObservable(now),
		status: constObservable(SessionStatus.Completed),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable<readonly IChat[]>([]),
		mainChat: constObservable(new class extends mock<IChat>() { }),
		capabilities,
	};
	return { session, capabilities };
}

interface IListHarness {
	readonly store: DisposableStore;
	readonly instantiationService: TestInstantiationService;
	readonly managementService: TestSessionsManagementService;
	readonly commandService: TestCommandService;
	createContainer(): HTMLElement;
}

function createListHarness(disposables: Pick<DisposableStore, 'add'>, sessions: ISession[]): IListHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const managementService = new TestSessionsManagementService(sessions);
	const commandService = new TestCommandService();

	instantiationService.stub(ISessionsManagementService, managementService);
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
		override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
	});
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
		override migrateLegacyReadState(): void { }
		override getSortKey(session: ISession, mode: SessionSortMode): number {
			return mode === 'created' ? session.createdAt.getTime() : session.updatedAt.get().getTime();
		}
		override getStatusIcon() { return Codicon.circleSmallFilled; }
	});
	instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
		override readonly onDidChange = Event.None;
		override getGroups() { return []; }
		override getGroupOfSession() { return undefined; }
		override getSessionIdsInGroup() { return []; }
	});
	instantiationService.stub(ISessionSectionOrderService, new class extends mock<ISessionSectionOrderService>() {
		override readonly onDidChange = Event.None;
		override resolveOrder(ids: readonly string[]) { return [...ids]; }
		override isPromoted() { return false; }
		override retain(): void { }
	});
	instantiationService.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
		override readonly onDidChange = Event.None;
		override readonly selectedProviderId = undefined;
	});
	instantiationService.stub(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() {
		override readonly onDidRefetchAssignments = Event.None;
		override async getTreatment<T extends string | number | boolean>(): Promise<T | undefined> { return undefined; }
	});
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders() { return []; }
	});
	instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
		override readonly pendingResponseVersion = constObservable(0);
		override hasPendingResponse() { return false; }
	});
	instantiationService.stub(ITestAgentSessionsService, {
		model: {
			observeSession: () => constObservable(undefined),
		},
	});
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly chatModels = constObservable([]);
	});

	const createContainer = () => {
		const container = mainWindow.document.createElement('div');
		container.style.width = '400px';
		container.style.height = '300px';
		mainWindow.document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });
		return container;
	};

	return { store, instantiationService, managementService, commandService, createContainer };
}

function dispatchDoubleClick(target: HTMLElement, options: MouseEventInit = {}): MouseEvent {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1, ...options }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 2, ...options }));
	const doubleClick = new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, detail: 2, ...options });
	target.dispatchEvent(doubleClick);
	return doubleClick;
}

suite('Sessions rename', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('list interaction', () => {
		test('title double-click opens once and requests rename once', () => {
			const { session } = createSession('First');
			const harness = createListHarness(disposables, [session]);
			const openCalls: URI[] = [];
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: resource => openCalls.push(resource),
			}));
			list.layout(300, 400);
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);

			let bubbled = 0;
			container.addEventListener('dblclick', () => bubbled++);
			const doubleClick = dispatchDoubleClick(title);

			assert.deepStrictEqual({
				openCalls: openCalls.map(resource => resource.toString()),
				renameCalls: harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID),
				defaultPrevented: doubleClick.defaultPrevented,
				bubbled,
			}, {
				openCalls: [session.resource.toString()],
				renameCalls: [{ commandId: RENAME_SESSION_COMMAND_ID, args: [session] }],
				defaultPrevented: true,
				bubbled: 0,
			});
		});

		test('rename is title-only, unmodified, capability-gated, and rebound safely', () => {
			const first = createSession('First', 'shared');
			const harness = createListHarness(disposables, [first.session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			for (const selector of ['.session-icon', '.session-title', '.session-details-row', '.session-title-toolbar']) {
				const target = container.querySelector<HTMLElement>(`.session-item ${selector}`);
				assert.ok(target);
				dispatchDoubleClick(target);
			}
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);
			dispatchDoubleClick(title, { altKey: true });
			assert.strictEqual(harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);

			first.capabilities.set({ supportsMultipleChats: false, supportsRename: false }, undefined);
			const unsupported = dispatchDoubleClick(title);
			assert.strictEqual(unsupported.defaultPrevented, false);
			assert.strictEqual(harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);

			const replacement = createSession('Replacement', 'shared');
			harness.managementService.sessions = [replacement.session];
			list.refresh();
			list.layout(300, 400);
			const replacementTitle = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(replacementTitle);
			assert.strictEqual(replacementTitle.textContent, 'Replacement');
			dispatchDoubleClick(replacementTitle);

			assert.deepStrictEqual(
				harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID),
				[{ commandId: RENAME_SESSION_COMMAND_ID, args: [replacement.session] }],
			);
		});

		test('flat session lists do not request rename', () => {
			const { session } = createSession('Flat');
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				onSessionOpen: () => { },
			}));
			list.setSessions([session]);
			list.layout(100, 400);
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);

			dispatchDoubleClick(title);

			assert.strictEqual(harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
		});
	});

	suite('action', () => {
		function createActionHarness(title = 'Existing', supportsRename = true) {
			const instantiationService = disposables.add(new TestInstantiationService());
			const quickInputService = new TestQuickInputService();
			const managementService = new TestSessionsManagementService([]);
			const sessionData = createSession(title);
			sessionData.capabilities.set({ supportsMultipleChats: false, supportsRename }, undefined);
			instantiationService.stub(IQuickInputService, quickInputService);
			instantiationService.stub(ISessionsManagementService, managementService);
			const handler = CommandsRegistry.getCommand(RENAME_SESSION_COMMAND_ID)?.handler;
			assert.ok(handler);
			return { handler, instantiationService, quickInputService, managementService, session: sessionData.session };
		}

		test('direct invocation is capability-gated', async () => {
			const harness = createActionHarness('Existing', false);

			await harness.handler(harness.instantiationService, harness.session);

			assert.deepStrictEqual({ inputCalls: harness.quickInputService.calls, renamed: harness.managementService.renamed }, { inputCalls: 0, renamed: [] });
		});

		test('validates input and ignores cancellation, whitespace, and unchanged titles', async () => {
			const cancelled = createActionHarness();
			cancelled.quickInputService.result = undefined;
			await cancelled.handler(cancelled.instantiationService, cancelled.session);

			const whitespace = createActionHarness();
			whitespace.quickInputService.result = '   ';
			await whitespace.handler(whitespace.instantiationService, whitespace.session);
			const validationMessage = await whitespace.quickInputService.options?.validateInput?.('   ');

			const unchanged = createActionHarness();
			unchanged.quickInputService.result = ' Existing ';
			await unchanged.handler(unchanged.instantiationService, unchanged.session);

			assert.deepStrictEqual({
				cancelled: cancelled.managementService.renamed,
				whitespace: whitespace.managementService.renamed,
				validationMessage,
				unchanged: unchanged.managementService.renamed,
			}, {
				cancelled: [],
				whitespace: [],
				validationMessage: 'Title cannot be empty',
				unchanged: [],
			});
		});

		test('trims changed titles and propagates provider errors', async () => {
			const success = createActionHarness();
			success.quickInputService.result = ' New title ';
			await success.handler(success.instantiationService, success.session);

			const failure = createActionHarness();
			failure.quickInputService.result = 'Fails';
			failure.managementService.renameError = new Error('rename failed');

			await assert.rejects(async () => {
				await failure.handler(failure.instantiationService, failure.session);
			}, failure.managementService.renameError);
			assert.deepStrictEqual({
				success: success.managementService.renamed,
				failure: failure.managementService.renamed,
			}, {
				success: [{ session: success.session, title: 'New title' }],
				failure: [{ session: failure.session, title: 'Fails' }],
			});
		});
	});

	suite('accessibility help', () => {
		function createHelpProvider(origin: HTMLElement, removeOrigin = false) {
			const instantiationService = disposables.add(new TestInstantiationService());
			let fallbackFocusCount = 0;
			const fallbackView = new class extends mock<SessionView>() {
				override focus(): void { fallbackFocusCount++; }
			};
			const activeSession = new class extends mock<IActiveSession>() {
				override readonly sessionId = 'active';
			};
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override getSessionView() { return fallbackView; }
			});
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
			});

			mainWindow.document.body.appendChild(origin);
			disposables.add({ dispose: () => origin.remove() });
			origin.focus();
			const provider = disposables.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			if (removeOrigin) {
				origin.remove();
			}
			return { provider, fallbackFocusCount: () => fallbackFocusCount };
		}

		test('documents pointer and keyboard rename paths and restores originating focus', () => {
			const origin = mainWindow.document.createElement('button');
			const { provider, fallbackFocusCount } = createHelpProvider(origin);

			const content = provider.provideContent();
			provider.onClose();

			assert.deepStrictEqual({
				hasDoubleClick: content.includes('double-click its title'),
				hasContextMenu: content.includes('open its context menu'),
				activeElement: mainWindow.document.activeElement,
				fallbackFocusCount: fallbackFocusCount(),
			}, {
				hasDoubleClick: true,
				hasContextMenu: true,
				activeElement: origin,
				fallbackFocusCount: 0,
			});
		});

		test('falls back to the active session when the originating element is gone', () => {
			const origin = mainWindow.document.createElement('button');
			const { provider, fallbackFocusCount } = createHelpProvider(origin, true);

			provider.onClose();

			assert.strictEqual(fallbackFocusCount(), 1);
		});
	});
});
