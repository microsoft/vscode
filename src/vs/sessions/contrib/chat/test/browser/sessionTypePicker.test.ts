/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import {
	CopilotCLISessionType,
	CopilotCloudSessionType,
	GITHUB_REMOTE_FILE_SCHEME,
	IGitHubInfo,
	ISessionType,
	ISessionWorkspace,
	SessionStatus,
} from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionTypePicker } from '../../browser/sessionTypePicker.js';

// ---- Mock session -----------------------------------------------------------

function createMockSession(opts: {
	sessionResource: URI;
	providerId: string;
	sessionType: string;
	workspace: IObservable<ISessionWorkspace | undefined>;
}): IActiveSession {
	const unused: IObservable<any> = observableValue('unused', undefined);
	const session: IActiveSession = {
		sessionId: `${opts.providerId}:test`,
		resource: opts.sessionResource,
		providerId: opts.providerId,
		sessionType: opts.sessionType,
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: opts.workspace,
		title: observableValue('title', 'test'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue<SessionStatus>('status', SessionStatus.Untitled),
		changes: observableValue('changes', []),
		modelId: observableValue<string | undefined>('modelId', undefined),
		mode: observableValue<{ id: string; kind: string } | undefined>('mode', undefined),
		loading: observableValue('loading', false),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		description: unused,
		lastTurnEnd: observableValue<Date | undefined>('lastTurnEnd', undefined),
		gitHubInfo: observableValue<IGitHubInfo | undefined>('gitHubInfo', undefined),
		chats: observableValue('chats', []),
		mainChat: {} as any,
		activeChat: {} as any,
	};
	return session;
}

// ---- Mock providers service -------------------------------------------------

class MockSessionsProvidersService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent> = Event.None;
	private readonly _providers = new Map<string, ISessionsProvider>();

	add(provider: ISessionsProvider): void {
		this._providers.set(provider.id, provider);
	}

	getProviders(): ISessionsProvider[] {
		return Array.from(this._providers.values());
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.get(providerId) as T | undefined;
	}
}

// ---- Mock sessions management service --------------------------------------

class MockSessionsManagementService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeSessionTypes: Event<void> = Event.None;
	readonly onDidChangeSessions: Event<any> = Event.None;
	readonly activeProviderId: IObservable<string | undefined> = observableValue('activeProviderId', undefined);
	readonly activeSession: ISettableObservable<IActiveSession | undefined> = observableValue<IActiveSession | undefined>('activeSession', undefined);
}

// ---- Mock copilot chat sessions provider (mirrors real behavior) -----------

function createCopilotChatProviderMock(): ISessionsProvider {
	const getSessionTypesCalls: URI[] = [];
	const provider: ISessionsProvider = {
		id: 'copilot-chat',
		label: 'Copilot Chat',
		icon: Codicon.copilot,
		sessionTypes: [CopilotCLISessionType, CopilotCloudSessionType],
		onDidChangeSessionTypes: Event.None,
		browseActions: [],
		resolveWorkspace: (uri: URI): ISessionWorkspace => ({
			label: uri.path,
			icon: Codicon.folder,
			repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		}),
		onDidChangeSessions: Event.None,
		getSessions: () => [],
		createNewSession: () => { throw new Error('Not implemented'); },
		getSessionTypes: (workspaceUri: URI): ISessionType[] => {
			getSessionTypesCalls.push(workspaceUri);
			// Mirrors the real provider (copilotChatSessionsProvider.ts#1119)
			if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
				return [CopilotCloudSessionType];
			}
			return [CopilotCLISessionType];
		},
		renameChat: async () => { },
		setModel: () => { },
		archiveSession: async () => { },
		unarchiveSession: async () => { },
		deleteSession: async () => { },
		deleteChat: async () => { },
		sendAndCreateChat: async () => { throw new Error('Not implemented'); },
		addChat: () => { throw new Error('Not implemented'); },
		sendRequest: async () => { throw new Error('Not implemented'); },
		capabilities: { multipleChatsPerSession: false },
		onDidChangeCapabilities: Event.None,
	};
	(provider as any)._getSessionTypesCalls = getSessionTypesCalls;
	return provider;
}

// ---- Tests ------------------------------------------------------------------

suite('SessionTypePicker - getSessionTypes URI (#310180)', () => {

	const disposables = new DisposableStore();
	let providersService: MockSessionsProvidersService;
	let managementService: MockSessionsManagementService;

	setup(() => {
		providersService = new MockSessionsProvidersService();
		managementService = new MockSessionsManagementService();
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createPicker(): SessionTypePicker {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
		instantiationService.stub(ISessionsProvidersService, providersService as unknown as ISessionsProvidersService);
		instantiationService.stub(ISessionsManagementService, managementService as unknown as ISessionsManagementService);
		return disposables.add(instantiationService.createInstance(SessionTypePicker));
	}

	test('passes workspace repository URI (not session resource URI) to getSessionTypes for a GitHub repo workspace', () => {
		// Session resource URI uses a non-GitHub scheme (the agent session provider scheme).
		const sessionResource = URI.from({ scheme: 'agentsessions-cloud', path: `/untitled-abc` });
		// Workspace repository URI uses GITHUB_REMOTE_FILE_SCHEME.
		const repositoryUri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github.com', path: '/owner/repo' });
		const workspace: ISessionWorkspace = {
			label: 'owner/repo',
			icon: Codicon.repo,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		};

		const provider = createCopilotChatProviderMock();
		providersService.add(provider);

		const session = createMockSession({
			sessionResource,
			providerId: provider.id,
			sessionType: CopilotCloudSessionType.id,
			workspace: observableValue<ISessionWorkspace | undefined>('workspace', workspace),
		});
		managementService.activeSession.set(session, undefined);

		createPicker();

		const calls = (provider as any)._getSessionTypesCalls as URI[];
		assert.ok(calls.length > 0, 'getSessionTypes should be called at least once');
		const lastCall = calls[calls.length - 1];
		assert.strictEqual(
			lastCall.scheme,
			GITHUB_REMOTE_FILE_SCHEME,
			`Expected scheme '${GITHUB_REMOTE_FILE_SCHEME}' (workspace repo URI), got '${lastCall.scheme}' (looks like the session resource URI was passed instead)`,
		);
		assert.strictEqual(lastCall.toString(), repositoryUri.toString());
	});

	test('re-evaluates supported session types when the workspace observable resolves', () => {
		// Start with workspace undefined (session still resolving), then populate it.
		const sessionResource = URI.from({ scheme: 'agentsessions-cloud', path: `/untitled-xyz` });
		const repositoryUri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github.com', path: '/owner/repo' });
		const workspaceObs = observableValue<ISessionWorkspace | undefined>('workspace', undefined);

		const provider = createCopilotChatProviderMock();
		providersService.add(provider);

		const session = createMockSession({
			sessionResource,
			providerId: provider.id,
			sessionType: CopilotCloudSessionType.id,
			workspace: workspaceObs,
		});
		managementService.activeSession.set(session, undefined);

		createPicker();

		const calls = (provider as any)._getSessionTypesCalls as URI[];
		const callCountBefore = calls.length;
		assert.ok(callCountBefore >= 1, 'getSessionTypes should be called when the session becomes active');

		// Now resolve the workspace — the autorun should re-run and call getSessionTypes
		// again with the real repository URI.
		workspaceObs.set({
			label: 'owner/repo',
			icon: Codicon.repo,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		}, undefined);

		assert.ok(calls.length > callCountBefore, 'Expected getSessionTypes to be called again after the workspace resolves');
		const lastCall = calls[calls.length - 1];
		assert.strictEqual(lastCall.scheme, GITHUB_REMOTE_FILE_SCHEME, 'Expected the resolved workspace repository URI scheme');
	});

	test('passes a non-GitHub repository URI for local workspaces', () => {
		const sessionResource = URI.from({ scheme: 'agentsessions-background', path: `/untitled-local` });
		const repositoryUri = URI.file('/local/project');
		const workspace: ISessionWorkspace = {
			label: 'project',
			icon: Codicon.folder,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		};

		const provider = createCopilotChatProviderMock();
		providersService.add(provider);

		const session = createMockSession({
			sessionResource,
			providerId: provider.id,
			sessionType: CopilotCLISessionType.id,
			workspace: observableValue<ISessionWorkspace | undefined>('workspace', workspace),
		});
		managementService.activeSession.set(session, undefined);

		createPicker();

		const calls = (provider as any)._getSessionTypesCalls as URI[];
		const lastCall = calls[calls.length - 1];
		assert.strictEqual(lastCall.scheme, 'file', 'Expected the workspace file scheme to be passed');
		assert.strictEqual(lastCall.toString(), repositoryUri.toString());
	});
});
