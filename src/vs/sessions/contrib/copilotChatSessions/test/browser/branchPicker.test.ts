/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IActiveSession, ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvider } from '../../../sessions/browser/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../sessions/browser/sessionsProvidersService.js';
import { COPILOT_PROVIDER_ID, ICopilotChatSession } from '../../browser/copilotChatSessionsProvider.js';
import { BranchPicker } from '../../browser/branchPicker.js';
import { IsolationMode } from '../../browser/isolationPicker.js';

function createActiveSession(providerId: string, sessionId: string): IActiveSession {
	const chat = {
		resource: URI.parse(`test:///chat/${sessionId}`),
		createdAt: new Date(),
		title: constObservable('Chat'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
	};

	return {
		sessionId,
		resource: URI.parse(`test:///session/${sessionId}`),
		providerId,
		sessionType: 'copilot-cli',
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Session'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		gitHubInfo: constObservable(undefined),
		chats: constObservable([chat]),
		mainChat: chat,
		activeChat: constObservable(chat),
	};
}

class TestCopilotSession extends mock<ICopilotChatSession>() {
	override readonly loading = observableValue<boolean>('loading', false);
	override readonly branches = observableValue<readonly string[]>('branches', ['main', 'feature/test']);
	override readonly branch = observableValue<string | undefined>('branch', 'main');
	override readonly isolationMode = observableValue<IsolationMode | undefined>('isolationMode', 'worktree');

	override setBranch(branch: string | undefined): void {
		this.branch.set(branch, undefined);
	}
}

class TestCopilotProvider extends mock<ISessionsProvider>() {
	constructor(private readonly sessionId: string, private readonly session: ICopilotChatSession) {
		super();
	}

	override readonly id = COPILOT_PROVIDER_ID;
	override readonly label = 'Copilot';
	override readonly icon = Codicon.copilot;
	override readonly sessionTypes = [];
	override readonly browseActions = [];
	override readonly onDidChangeSessions = Event.None;
	override readonly capabilities = { multipleChatsPerSession: false };

	getSession(sessionId: string): ICopilotChatSession | undefined {
		return sessionId === this.sessionId ? this.session : undefined;
	}
}

class TestSessionsProvidersService extends mock<ISessionsProvidersService>() {
	constructor(private readonly provider: TestCopilotProvider) {
		super();
	}

	override readonly onDidChangeProviders = Event.None;
	override readonly onDidChangeSessions = Event.None;
	override readonly onDidReplaceSession = Event.None;

	override getProviders(): ISessionsProvider[] {
		return [this.provider];
	}

	override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return providerId === this.provider.id ? this.provider as unknown as T : undefined;
	}
}

suite('BranchPicker', () => {

	const disposables = new DisposableStore();
	let activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>>;
	let providerSession: TestCopilotSession;
	let showCalls: number;
	let instantiationService: TestInstantiationService;

	setup(() => {
		const sessionId = `${COPILOT_PROVIDER_ID}:session`;
		showCalls = 0;
		activeSession = observableValue<IActiveSession | undefined>('activeSession', createActiveSession(COPILOT_PROVIDER_ID, sessionId));
		providerSession = new TestCopilotSession();

		const provider = new TestCopilotProvider(sessionId, providerSession);
		const sessionsProvidersService = new TestSessionsProvidersService(provider);

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			hide: () => { },
			show: () => { showCalls++; },
		});
		instantiationService.stub(ISessionsManagementService, {
			activeSession,
		});
		instantiationService.stub(ISessionsProvidersService, sessionsProvidersService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('disables the picker instead of hiding it in folder mode', () => {
		providerSession.isolationMode.set('workspace', undefined);

		const picker = disposables.add(instantiationService.createInstance(BranchPicker));
		const container = document.createElement('div');
		picker.render(container);

		const slot = container.querySelector<HTMLElement>('.sessions-chat-picker-slot');
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(slot);
		assert.ok(trigger);
		assert.strictEqual(slot.style.display, '');
		assert.strictEqual(slot.classList.contains('disabled'), true);
		assert.strictEqual(trigger.getAttribute('aria-hidden'), 'false');
		assert.strictEqual(trigger.getAttribute('aria-disabled'), 'true');
		assert.strictEqual(trigger.tabIndex, -1);

		picker.showPicker();
		assert.strictEqual(showCalls, 0);
	});

	test('re-enables the picker when switching back to worktree mode', () => {
		providerSession.isolationMode.set('workspace', undefined);

		const picker = disposables.add(instantiationService.createInstance(BranchPicker));
		const container = document.createElement('div');
		picker.render(container);

		const slot = container.querySelector<HTMLElement>('.sessions-chat-picker-slot');
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(slot);
		assert.ok(trigger);

		providerSession.isolationMode.set('worktree', undefined);

		assert.strictEqual(slot.style.display, '');
		assert.strictEqual(slot.classList.contains('disabled'), false);
		assert.strictEqual(trigger.getAttribute('aria-disabled'), 'false');
		assert.strictEqual(trigger.tabIndex, 0);

		picker.showPicker();
		assert.strictEqual(showCalls, 1);
	});
});
