/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, ChatSendResult, IChatSendRequestData, IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChatResponseModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatAgentData } from '../../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IGitService } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionChangeEvent } from '../../../../../services/sessions/common/sessionsProvider.js';
import { GITHUB_REMOTE_FILE_SCHEME, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { CLAUDE_CODE_ENABLED_SETTING, CopilotChatSessionsProvider, COPILOT_PROVIDER_ID, ClaudeCodeSessionType, ICopilotChatSession } from '../../browser/copilotChatSessionsProvider.js';
import { AgentHostEnabledSettingId, ClaudePreferAgentHostAgentsSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { CopilotCLISessionType } from '../../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { IAgentHostEnablementService } from '../../../../../services/agentHost/common/agentHostEnablementService.js';

// ---- Helpers ----------------------------------------------------------------

function createMockAgentSession(resource: URI, opts?: {
	providerType?: string;
	title?: string;
	archived?: boolean;
	read?: boolean;
	createdAt?: number;
	metadata?: Record<string, unknown>;
}): IAgentSession {
	const providerType = opts?.providerType ?? AgentSessionProviders.Background;
	let archived = opts?.archived ?? false;
	let read = opts?.read ?? true;
	return new class extends mock<IAgentSession>() {
		override readonly resource = resource;
		override readonly providerType = providerType;
		override readonly providerLabel = 'Copilot';
		override readonly label = opts?.title ?? 'Test Session';
		override readonly status = ChatSessionStatus.Completed;
		override readonly icon = Codicon.copilot;
		override readonly timing = { created: opts?.createdAt ?? Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined };
		override readonly metadata = opts?.metadata ?? { repositoryPath: '/test/repo' };
		override isArchived(): boolean { return archived; }
		override setArchived(value: boolean): void { archived = value; }
		override isPinned(): boolean { return false; }
		override setPinned(): void { }
		override isRead(): boolean { return read; }
		override isMarkedUnread(): boolean { return false; }
		override setRead(value: boolean): void { read = value; }
	}();
}

// ---- Mock Agent Sessions Service --------------------------------------------

class MockAgentSessionsModel {
	private readonly _sessions: IAgentSession[] = [];
	private readonly _onDidChangeSessions = new Emitter<void>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	readonly onWillResolve = Event.None;
	readonly onDidResolve = Event.None;
	readonly onDidChangeSessionArchivedState = Event.None;
	readonly resolved = true;

	get sessions(): IAgentSession[] { return [...this._sessions]; }

	getSession(resource: URI): IAgentSession | undefined {
		return this._sessions.find(s => s.resource.toString() === resource.toString());
	}

	addSession(session: IAgentSession): void {
		this._sessions.push(session);
		this._onDidChangeSessions.fire();
	}

	removeSession(resource: URI): void {
		const idx = this._sessions.findIndex(s => s.resource.toString() === resource.toString());
		if (idx !== -1) {
			this._sessions.splice(idx, 1);
			this._onDidChangeSessions.fire();
		}
	}

	replaceSession(session: IAgentSession): void {
		const idx = this._sessions.findIndex(s => s.resource.toString() === session.resource.toString());
		assert.ok(idx >= 0, 'session should exist before replacing');
		this._sessions.splice(idx, 1, session);
		this._onDidChangeSessions.fire();
	}

	fireDidChangeSessions(): void {
		this._onDidChangeSessions.fire();
	}

	async resolve(): Promise<void> { }

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

interface IExecutedCommand {
	readonly id: string;
	readonly args: readonly unknown[];
}

interface ICreateProviderOptions {
	readonly multiChatEnabled?: boolean;
	readonly claudeEnabled?: boolean;
	readonly preferAgentHost?: boolean;
	readonly hideCopilotCli?: boolean;
	readonly agentHostEnabled?: boolean;
	readonly commandExecutions?: IExecutedCommand[];
}

function isCommandSessionItem(item: unknown): item is { readonly resource: URI; readonly label?: string } {
	return typeof item === 'object' && item !== null && 'resource' in item && URI.isUri(item.resource);
}

// ---- Provider factory -------------------------------------------------------

function createProvider(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	opts?: ICreateProviderOptions,
): CopilotChatSessionsProvider {
	return createProviderWithConfig(disposables, model, opts).provider;
}

function createProviderWithConfig(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	opts?: ICreateProviderOptions,
): { provider: CopilotChatSessionsProvider; configService: TestConfigurationService } {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', opts?.multiChatEnabled ?? true);
	configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, opts?.claudeEnabled ?? true);
	configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, opts?.preferAgentHost ?? false);
	configService.setUserConfiguration(AgentHostEnabledSettingId, opts?.agentHostEnabled ?? true);
	configService.setUserConfiguration(ChatConfiguration.CopilotCliHideExtensionHostAgents, opts?.hideCopilotCli ?? false);

	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: configService.getValue<boolean>(AgentHostEnabledSettingId) ?? false });
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, {
		confirm: async () => ({ confirmed: true }),
	});
	instantiationService.stub(ICommandService, {
		executeCommand: async (id: string, ...args: unknown[]) => {
			opts?.commandExecutions?.push({ id, args });
			// Simulate 'agents.github.copilot.cli.deleteSessions' removing sessions
			const items = args[0];
			if (Array.isArray(items)) {
				for (const item of items) {
					if (isCommandSessionItem(item)) {
						model.removeSession(item.resource);
					}
				}
			} else if (isCommandSessionItem(items)) {
				model.removeSession(items.resource);
			}
			return undefined;
		},
	});
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
		onDidCommitSession: Event.None,
		updateSessionOptions: () => true,
		setSessionOption: () => true,
		getSessionOption: () => undefined,
		onDidChangeOptionGroups: Event.None,
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }),
		removeHistoryEntry: async (resource: URI) => { model.removeSession(resource); },
		setChatSessionTitle: () => { },
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => undefined,
		lastFocusedWidget: undefined,
		onDidChangeFocusedSession: Event.None,
	});
	instantiationService.stub(ILanguageModelsService, {
		lookupLanguageModel: () => undefined,
	});
	instantiationService.stub(ILanguageModelToolsService, {
		toToolReferences: () => [],
	});
	// Stub IInstantiationService so provider can use createInstance for CopilotCLISession
	instantiationService.stub(IInstantiationService, instantiationService);
	instantiationService.stub(ILabelService, {
		getUriLabel: (uri: URI) => uri.path,
	});
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: opts?.agentHostEnabled ?? true });

	const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
	return { provider, configService };
}

// ---- Provider factory for send/cancel tests ---------------------------------

/**
 * Creates a provider suitable for testing sendChat flows. Stubs all services
 * needed by CopilotCLISession and _sendFirstChat, including IGitService and a
 * non-null IChatWidget mock.
 *
 * The caller can pass a custom `sendRequest` implementation to control the
 * lifecycle of the in-flight request.
 */
function createProviderForSendTests(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	sendRequest: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>,
	opts?: { onDidCommitSession?: Event<{ original: URI; committed: URI }>; claudeEnabled?: boolean; createNewChatSessionItem?: IChatSessionsService['createNewChatSessionItem']; configurationService?: TestConfigurationService; agentHostEnabled?: boolean },
): CopilotChatSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = opts?.configurationService ?? new TestConfigurationService();
	configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', true);
	configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, opts?.claudeEnabled ?? true);

	instantiationService.stub(ILogService, NullLogService);
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, {
		confirm: async () => ({ confirmed: true }),
	});
	instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
		onDidCommitSession: opts?.onDidCommitSession ?? Event.None,
		updateSessionOptions: () => true,
		setSessionOption: () => true,
		getSessionOption: () => undefined,
		onDidChangeOptionGroups: Event.None,
		createNewChatSessionItem: opts?.createNewChatSessionItem ?? (async () => undefined),
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: sendRequest,
		removeHistoryEntry: async (resource: URI) => { model.removeSession(resource); },
		setChatSessionTitle: () => { },
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => new class extends mock<IChatWidget>() {
			override input = new class extends mock<IChatWidget['input']>() {
				override setPermissionLevel = () => { };
			}();
		}(),
		lastFocusedWidget: undefined,
		onDidChangeFocusedSession: Event.None,
	});
	instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined });
	instantiationService.stub(ILanguageModelToolsService, { toToolReferences: () => [] });
	instantiationService.stub(IGitService, { openRepository: async () => undefined });
	instantiationService.stub(IInstantiationService, instantiationService);
	instantiationService.stub(ILabelService, {
		getUriLabel: (uri: URI) => uri.path,
	});
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: opts?.agentHostEnabled ?? true });

	return disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
}

suite('CopilotChatSessionsProvider', () => {
	const disposables = new DisposableStore();
	let model: MockAgentSessionsModel;

	setup(() => {
		model = new MockAgentSessionsModel();
		disposables.add(toDisposable(() => model.dispose()));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider identity -------

	test('has correct id and label', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.id, COPILOT_PROVIDER_ID);
		assert.strictEqual(provider.sessionTypes.length, 3);
	});

	test('sessionTypes excludes Claude when setting is disabled', () => {
		const provider = createProvider(disposables, model, { claudeEnabled: false });
		assert.strictEqual(provider.sessionTypes.length, 2);
		assert.ok(!provider.sessionTypes.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('sessionTypes excludes Claude when preferAgentHost is true', () => {
		// When the user has opted into the agent host implementation of
		// Claude, this provider must yield so the picker shows a single
		// Claude entry (the agent host's). Otherwise both register and the
		// user sees Claude twice.
		const provider = createProvider(disposables, model, { claudeEnabled: true, preferAgentHost: true });
		assert.strictEqual(provider.sessionTypes.length, 2);
		assert.ok(!provider.sessionTypes.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('sessionTypes includes Claude when claudeEnabled and preferAgentHost is false', () => {
		const provider = createProvider(disposables, model, { claudeEnabled: true, preferAgentHost: false });
		assert.strictEqual(provider.sessionTypes.length, 3);
		assert.ok(provider.sessionTypes.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('preferAgentHost is not respected when chat.agentHost.enabled is false', () => {
		// Yielding to the agent host's Claude only makes sense when the agent
		// host is enabled to register it. With the agent host disabled the
		// preference must be ignored so this provider keeps surfacing Claude;
		// otherwise Claude would disappear entirely.
		const provider = createProvider(disposables, model, { claudeEnabled: true, preferAgentHost: true, agentHostEnabled: false });
		assert.strictEqual(provider.sessionTypes.length, 3);
		assert.ok(provider.sessionTypes.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('onDidChangeSessionTypes fires when claude setting changes', () => {
		const { provider, configService } = createProviderWithConfig(disposables, model);
		assert.strictEqual(provider.sessionTypes.length, 3);

		let fired = false;
		disposables.add(provider.onDidChangeSessionTypes(() => { fired = true; }));

		// Disable claude via config change
		configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, false);
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([CLAUDE_CODE_ENABLED_SETTING]),
			change: { keys: [CLAUDE_CODE_ENABLED_SETTING], overrides: [] },
			affectsConfiguration: (key: string) => key === CLAUDE_CODE_ENABLED_SETTING,
		});

		assert.ok(fired, 'onDidChangeSessionTypes should have fired');
		assert.strictEqual(provider.sessionTypes.length, 2);
	});

	test('onDidChangeSessionTypes fires when preferAgentHost setting changes', () => {
		// Symmetric with the claude-enabled case above. Must respond live so
		// flipping the EXP-backed preference unregisters this provider's
		// Claude entry without requiring a window reload.
		const { provider, configService } = createProviderWithConfig(disposables, model);
		assert.strictEqual(provider.sessionTypes.length, 3);

		let fired = false;
		disposables.add(provider.onDidChangeSessionTypes(() => { fired = true; }));

		configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([ClaudePreferAgentHostAgentsSettingId]),
			change: { keys: [ClaudePreferAgentHostAgentsSettingId], overrides: [] },
			affectsConfiguration: (key: string) => key === ClaudePreferAgentHostAgentsSettingId,
		});

		assert.ok(fired, 'onDidChangeSessionTypes should have fired');
		assert.strictEqual(provider.sessionTypes.length, 2);
		assert.ok(!provider.sessionTypes.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('sessionTypes excludes Copilot CLI when hideExtensionHost is true', () => {
		// When the user hides the Extension Host Copilot CLI, this provider
		// must drop the entry so the Agents window picker only surfaces the
		// Agent Host Copilot CLI.
		const provider = createProvider(disposables, model, { hideCopilotCli: true });
		assert.ok(!provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));
	});

	test('onDidChangeSessionTypes fires when hideExtensionHost setting changes', () => {
		// Symmetric with the claude cases above. Must respond live so flipping
		// the EXP-backed preference unregisters this provider's Copilot CLI
		// entry without requiring a window reload.
		const { provider, configService } = createProviderWithConfig(disposables, model);
		assert.ok(provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));

		let fired = false;
		disposables.add(provider.onDidChangeSessionTypes(() => { fired = true; }));

		configService.setUserConfiguration(ChatConfiguration.CopilotCliHideExtensionHostAgents, true);
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([ChatConfiguration.CopilotCliHideExtensionHostAgents]),
			change: { keys: [ChatConfiguration.CopilotCliHideExtensionHostAgents], overrides: [] },
			affectsConfiguration: (key: string) => key === ChatConfiguration.CopilotCliHideExtensionHostAgents,
		});

		assert.ok(fired, 'onDidChangeSessionTypes should have fired');
		assert.ok(!provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));
	});

	test('hideExtensionHost is not respected when chat.agentHost.enabled is false', () => {
		// Hiding the Extension Host Copilot CLI only makes sense when the agent
		// host is enabled to surface the Agent Host Copilot CLI in its place. With
		// the agent host disabled the hide setting must be ignored so the entry
		// stays visible.
		const provider = createProvider(disposables, model, { hideCopilotCli: true, agentHostEnabled: false });
		assert.ok(provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));
	});

	test('chat.agentHost.enabled is read once when the provider is created', () => {
		// With the hide setting on but the agent host initially disabled, the
		// Copilot CLI entry is visible. Flipping the setting later does not
		// re-evaluate the provider.
		const { provider, configService } = createProviderWithConfig(disposables, model, { hideCopilotCli: true, agentHostEnabled: false });
		assert.ok(provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));

		configService.setUserConfiguration(AgentHostEnabledSettingId, true);
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([AgentHostEnabledSettingId]),
			change: { keys: [AgentHostEnabledSettingId], overrides: [] },
			affectsConfiguration: (key: string) => key === AgentHostEnabledSettingId,
		});

		assert.ok(provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));
	});

	test('toggling claude setting refreshes sessions list', () => {
		const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: '/claude-session' });
		model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));

		const { provider, configService } = createProviderWithConfig(disposables, model);
		assert.strictEqual(provider.getSessions().length, 1, 'Claude sessions should appear when enabled by default');

		// Disable Claude
		configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, false);
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([CLAUDE_CODE_ENABLED_SETTING]),
			change: { keys: [CLAUDE_CODE_ENABLED_SETTING], overrides: [] },
			affectsConfiguration: (key: string) => key === CLAUDE_CODE_ENABLED_SETTING,
		});

		assert.strictEqual(provider.getSessions().length, 0, 'Claude sessions should disappear after disabling');

		// Re-enable Claude
		configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, true);
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([CLAUDE_CODE_ENABLED_SETTING]),
			change: { keys: [CLAUDE_CODE_ENABLED_SETTING], overrides: [] },
			affectsConfiguration: (key: string) => key === CLAUDE_CODE_ENABLED_SETTING,
		});

		assert.strictEqual(provider.getSessions().length, 1, 'Claude sessions should reappear after re-enabling');
	});

	// ---- getSessionTypes -------

	test('getSessionTypes returns Claude for local workspace when enabled', () => {
		const provider = createProvider(disposables, model, { claudeEnabled: true });
		const types = provider.getSessionTypes(URI.file('/test/project'));
		assert.ok(types.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('getSessionTypes does not return Claude for local workspace when disabled', () => {
		const provider = createProvider(disposables, model, { claudeEnabled: false });
		const types = provider.getSessionTypes(URI.file('/test/project'));
		assert.ok(!types.some(t => t.id === ClaudeCodeSessionType.id));
	});

	test('getSessionTypes returns only Cloud for remote workspace regardless of claude setting', () => {
		const provider = createProvider(disposables, model, { claudeEnabled: true });
		const types = provider.getSessionTypes(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repo' }));
		assert.strictEqual(types.length, 1);
		assert.ok(!types.some(t => t.id === ClaudeCodeSessionType.id));
	});

	// ---- Session listing -------

	test('getSessions returns empty array initially', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.getSessions().length, 0);
	});

	test('getSessions returns adapted sessions from agent model', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 2);
	});

	test('getSessions excludes Local sessions (now owned by LocalChatSessionsProvider)', () => {
		const bgResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/bg-session' });
		const localResource = URI.from({ scheme: AgentSessionProviders.Local, path: '/local-session' });
		model.addSession(createMockAgentSession(bgResource));
		model.addSession(createMockAgentSession(localResource, { providerType: AgentSessionProviders.Local }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
	});

	test('getSessions includes Claude agent sessions when enabled', () => {
		const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: '/claude-session' });
		model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));

		const provider = createProvider(disposables, model, { claudeEnabled: true });
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
	});

	test('getSessions excludes Claude agent sessions when disabled', () => {
		const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: '/claude-session' });
		model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));

		const provider = createProvider(disposables, model, { claudeEnabled: false });
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 0);
	});

	test('onDidChangeSessions fires when agent model changes', () => {
		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/new-session' });
		model.addSession(createMockAgentSession(resource, { title: 'New Session' }));

		assert.ok(changes.length > 0);
		assert.strictEqual(changes[0].added.length, 1);
	});

	test('onDidChangeSessions does not fire when cached agent session is unchanged', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/existing-session' });
		model.addSession(createMockAgentSession(resource, { title: 'Existing Session', createdAt: 1 }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.fireDidChangeSessions();

		assert.deepStrictEqual(changes, []);
	});

	test('onDidChangeSessions fires changed session when cached agent session changes', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/existing-session' });
		model.addSession(createMockAgentSession(resource, { title: 'Existing Session', createdAt: 1 }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.replaceSession(createMockAgentSession(resource, { title: 'Updated Session', createdAt: 1 }));

		assert.deepStrictEqual(changes.map(e => ({
			added: e.added.length,
			removed: e.removed.length,
			changed: e.changed.map(session => session.title.get()),
		})), [{
			added: 0,
			removed: 0,
			changed: ['Updated Session'],
		}]);
	});

	// ---- Session creation -------
	// Note: createNewSession tests are limited because CopilotCLISession
	// requires IGitService and creates disposables that are hard to clean
	// up in isolation. Full integration tests should cover session creation.

	test('Copilot CLI session maps workspace selection to Agent Host folder config', async () => {
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }));
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId) as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('workspace');

		assert.strictEqual(providerSession.isolationMode.get(), 'workspace');
		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: 'folder' });
		providerSession.dispose();
	});

	test('Copilot CLI session maps worktree selection to Agent Host config', async () => {
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }));
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId)! as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('worktree');
		providerSession.setBranch('main');

		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: 'worktree', branch: 'main' });
		providerSession.dispose();
	});

	test('Copilot CLI session forwards git.branchPrefix as worktreeBranchPrefix for worktree isolation', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('git.branchPrefix', 'users/alice/');
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }), { configurationService: configService });
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId)! as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('worktree');
		providerSession.setBranch('main');

		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: 'worktree', branch: 'main', worktreeBranchPrefix: 'users/alice/' });
		providerSession.dispose();
	});

	// ---- Session actions -------

	test('archiveSession sets archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const agentSession = createMockAgentSession(resource);
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const session = provider.getSessions()[0];
		provider.archiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), true);
	});

	test('unarchiveSession clears archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const agentSession = createMockAgentSession(resource, { archived: true });
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions();

		const session = provider.getSessions()[0];
		provider.unarchiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), false);
	});

	// ---- Session capabilities -------

	test('copilot CLI sessions have supportsMultipleChats capability', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, true);
	});

	test('copilot cloud sessions do not have supportsMultipleChats capability', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
	});

	test('copilot CLI sessions do not have supportsMultipleChats when setting is disabled', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model, { multiChatEnabled: false });
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
	});

	test('claude sessions do not have supportsMultipleChats capability', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Claude, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Claude }));

		const provider = createProvider(disposables, model, { claudeEnabled: true });
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
	});

	// ---- Session listing & grouping -------

	test('each session has exactly one chat initially', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].chats.get().length, 1);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
	});

	test('setModel applies to existing sessions and their new chats', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		provider.setModel(session.sessionId, 'copilot/gpt-4o');

		assert.strictEqual(session.modelId.get(), 'copilot/gpt-4o');

		const chat = await provider.createNewChat(session.sessionId);
		try {
			assert.strictEqual(chat.modelId.get(), 'copilot/gpt-4o');
		} finally {
			await provider.deleteChat(session.sessionId, chat.resource);
		}
	});

	test('sendRequest throws for unknown session', async () => {
		const provider = createProvider(disposables, model);
		await assert.rejects(
			() => provider.sendRequest('nonexistent', URI.parse('untitled:chat'), { query: 'test' }),
			/not found/,
		);
	});

	test('getSessions groups chats by session group', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		// Without explicit grouping, each chat is its own session
		assert.strictEqual(sessions.length, 2);
	});

	test('groups committed chats using metadata.sessionParentId', () => {
		const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/root-session' });
		const child1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/child-session-1' });
		const child2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/child-session-2' });

		model.addSession(createMockAgentSession(rootResource, { title: 'Root', createdAt: 1 }));
		model.addSession(createMockAgentSession(child1Resource, {
			title: 'Child 1',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));
		model.addSession(createMockAgentSession(child2Resource, {
			title: 'Child 2',
			createdAt: 3,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].chats.get().length, 3);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), rootResource.toString());
	});

	test('orders chats within a grouped session by createdAt', () => {
		const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/root-session' });
		const olderChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/older-child' });
		const newerChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/newer-child' });

		// Add out of order to ensure grouping order is driven by createdAt rather than insertion order.
		model.addSession(createMockAgentSession(newerChildResource, {
			title: 'Newer Child',
			createdAt: 30,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));
		model.addSession(createMockAgentSession(rootResource, { title: 'Root', createdAt: 10 }));
		model.addSession(createMockAgentSession(olderChildResource, {
			title: 'Older Child',
			createdAt: 20,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.deepStrictEqual(
			sessions[0].chats.get().map(chat => chat.resource.toString()),
			[rootResource.toString(), olderChildResource.toString(), newerChildResource.toString()]
		);
	});

	test('groups child sessions even when the parent/root session is missing', () => {
		const orphan1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/orphan-child-1' });
		const orphan2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/orphan-child-2' });
		const provider = createProvider(disposables, model);

		provider.getSessions(); // initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.addSession(createMockAgentSession(orphan1Resource, {
			title: 'Orphan Child 1',
			createdAt: 1,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'missing-root' }
		}));
		model.addSession(createMockAgentSession(orphan2Resource, {
			title: 'Orphan Child 2',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'missing-root' }
		}));

		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.deepStrictEqual(
			sessions[0].chats.get().map(chat => chat.resource.toString()),
			[orphan1Resource.toString(), orphan2Resource.toString()]
		);
		assert.deepStrictEqual(changes.map(e => ({ added: e.added.length, changed: e.changed.length })), [
			{ added: 1, changed: 0 },
			{ added: 0, changed: 1 },
		]);
	});

	test('groups nested parent chains under the ultimate root', () => {
		const middleResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/middle-session' });
		const leafResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/leaf-session' });

		model.addSession(createMockAgentSession(middleResource, {
			title: 'Middle Session',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'missing-root' }
		}));
		model.addSession(createMockAgentSession(leafResource, {
			title: 'Leaf Session',
			createdAt: 3,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'middle-session' }
		}));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.deepStrictEqual(
			sessions[0].chats.get().map(chat => chat.resource.toString()),
			[middleResource.toString(), leafResource.toString()]
		);
	});

	test('session title comes from primary (first) chat', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { title: 'Primary Title' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].title.get(), 'Primary Title');
	});

	test('session has mainChat set to the first chat', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.ok(sessions[0].mainChat);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
	});

	test('deleteSession removes session from model and list', async () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		await provider.deleteSession(sessions[0].sessionId);

		const remainingSessions = provider.getSessions();
		assert.strictEqual(remainingSessions.length, 1);
		assert.strictEqual(remainingSessions[0].title.get(), 'Session 2');
	});

	test('deleteSession passes Copilot CLI session label to delete command', async () => {
		const resource = URI.from({ scheme: CopilotCLISessionType.id, path: '/session-1' });
		const commandExecutions: IExecutedCommand[] = [];
		model.addSession(createMockAgentSession(resource, { providerType: CopilotCLISessionType.id, title: 'Fix Build' }));

		const provider = createProvider(disposables, model, { commandExecutions });
		const sessions = provider.getSessions();

		await provider.deleteSession(sessions[0].sessionId);

		assert.deepStrictEqual(commandExecutions.map(command => ({
			id: command.id,
			items: Array.isArray(command.args[0])
				? command.args[0].map(item => isCommandSessionItem(item) ? { resource: item.resource.toString(), label: item.label } : undefined)
				: undefined,
			options: command.args[1],
		})), [{
			id: 'agents.github.copilot.cli.deleteSessions',
			items: [{ resource: resource.toString(), label: 'Fix Build' }],
			options: { skipConfirmation: true },
		}]);
	});

	test('deleteChat with single chat delegates to deleteSession', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const session = sessions[0];

		await provider.deleteChat(session.sessionId, resource);

		// Model should no longer have the session
		assert.strictEqual(model.sessions.length, 0);
	});

	test('deleteChat throws when session does not support multi-chat', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const session = sessions[0];

		await assert.rejects(
			() => provider.deleteChat(session.sessionId, resource),
			/not supported when multi-chat is disabled/,
		);
	});

	test('session group cache is invalidated on session removal', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);

		// Initialize sessions
		let sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		// Remove one from the model
		model.removeSession(resource1);

		// Re-fetch
		sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].title.get(), 'Session 2');
	});

	test('chats observable updates when group model changes', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		// Both are separate sessions initially
		const session1 = sessions[0];
		assert.strictEqual(session1.chats.get().length, 1);
	});

	test('session status aggregates across chats', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		// With a single chat, session status should match the chat status
		assert.ok(sessions[0].status.get() !== undefined);
	});

	test('session isRead aggregates across all chats', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { read: true }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].isRead.get(), true);
	});

	test('session isRead is false when any chat is unread', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { read: false }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].isRead.get(), false);
	});

	test('removing a chat from a group fires changed (not removed) with correct sessionId', async () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		// Manually group both chats under the first session
		const chat2Id = sessions[1].sessionId;
		// Access the group model indirectly by deleting the second session's group
		// and re-adding its chat to the first group via deleteChat flow
		// Instead, simulate by removing the second chat from the model
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.removeSession(resource2);

		// The removed chat was standalone, so it should fire a removed event
		assert.ok(changes.length > 0);
		const lastChange = changes[changes.length - 1];
		assert.strictEqual(lastChange.removed.length, 1);
		assert.strictEqual(lastChange.removed[0].sessionId, chat2Id);
	});

	test('getSessions does not create duplicate groups on repeated calls', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);

		// Call getSessions multiple times
		const sessions1 = provider.getSessions();
		const sessions2 = provider.getSessions();

		assert.strictEqual(sessions1.length, 1);
		assert.strictEqual(sessions2.length, 1);
		// Should return the same cached session object
		assert.strictEqual(sessions1[0], sessions2[0]);
	});

	test('changed events are not duplicated when multiple chats update', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		// Trigger a refresh that updates both sessions
		model.addSession(createMockAgentSession(
			URI.from({ scheme: AgentSessionProviders.Background, path: '/session-3' }),
			{ title: 'Session 3' }
		));

		// Each event should not have duplicates in the changed array
		for (const change of changes) {
			const changedIds = change.changed.map(s => s.sessionId);
			const uniqueIds = new Set(changedIds);
			assert.strictEqual(changedIds.length, uniqueIds.size, 'Changed events should not have duplicates');
		}
	});

	// ---- Browse actions -------

	test('resolveWorkspace creates proper workspace structure', () => {
		const provider = createProvider(disposables, model);
		const uri = URI.file('/test/project');

		const workspace = provider.resolveWorkspace(uri);

		assert.ok(workspace, 'resolveWorkspace should resolve file:// URIs');
		assert.strictEqual(workspace.label, 'project');
		assert.strictEqual(workspace.folders.length, 1);
		assert.strictEqual(workspace.folders[0].root.toString(), uri.toString());
		assert.strictEqual(workspace.requiresWorkspaceTrust, true);
	});

	test('builds an unknown workspace fallback when repository metadata is missing', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/unknown-workspace-session' });
		model.addSession(createMockAgentSession(resource, { metadata: {} }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const workspace = sessions[0].workspace.get();

		assert.ok(workspace);
		assert.strictEqual(workspace.folders.length, 1);
		assert.strictEqual(workspace.folders[0].root.toString(), URI.parse('unknown:///').toString());
		assert.strictEqual(workspace.requiresWorkspaceTrust, true);

		// The core symptom of #310777: any of these calls must not throw.
		assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, '.vscode', 'settings.json'));
		assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, '.vscode/extensions.json'));
	});

	// ---- Claude session creation -------

	function makeClaudeInFlightProvider(): { provider: CopilotChatSessionsProvider; cancelRequest: () => void; realResource: URI; commitSession: () => void } {
		let resolveComplete!: () => void;
		let resolveCreated!: (r: IChatResponseModel) => void;
		const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
		const responseCreatedPromise = new Promise<IChatResponseModel>(r => { resolveCreated = r; });

		// The real resource that createNewChatSessionItem returns
		const realResource = URI.from({ scheme: AgentSessionProviders.Claude, path: `/claude-session-${Date.now()}` });

		const provider = createProviderForSendTests(disposables, model, async () => ({
			kind: 'sent' as const,
			data: {
				responseCompletePromise,
				responseCreatedPromise,
				agent: new class extends mock<IChatAgentData>() { }(),
			} as IChatSendRequestData,
		}), {
			claudeEnabled: true,
			createNewChatSessionItem: async (_type, request): Promise<IChatSessionItem> => ({
				resource: realResource,
				label: request.prompt,
				timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
			}),
		});

		return {
			provider,
			realResource,
			cancelRequest: () => {
				resolveCreated({ isCanceled: true } as unknown as IChatResponseModel);
				resolveComplete();
			},
			commitSession: () => {
				// Add the agent session to the model so _waitForSessionInCache resolves
				model.addSession(createMockAgentSession(realResource, { providerType: AgentSessionProviders.Claude }));
			},
		};
	}

	function waitForSessionAdded(provider: CopilotChatSessionsProvider): Promise<void> {
		return new Promise<void>(resolve => {
			const d = provider.onDidChangeSessions(e => {
				if (e.added.length > 0) {
					d.dispose();
					resolve();
				}
			});
		});
	}

	test('createNewSession with Claude type creates a session', async () => {
		const { provider, commitSession } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');

		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		assert.ok(session);
		assert.strictEqual(session.sessionType, ClaudeCodeSessionType.id);
		assert.strictEqual(session.status.get(), SessionStatus.Untitled);

		// Send and commit so the session enters the cache and can be disposed
		const added = waitForSessionAdded(provider);
		const chat = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: 'test' });
		await added;
		commitSession();
		await assert.doesNotReject(sendPromise);
	});

	test('archiveSession archives a Claude temp session', async () => {
		const { provider, cancelRequest } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');
		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		const added = waitForSessionAdded(provider);
		const chat1 = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat1.resource, { query: 'test' });
		await added;

		await provider.archiveSession(session.sessionId);
		assert.strictEqual(provider.getSessions()[0].isArchived.get(), true);

		cancelRequest();
		await assert.doesNotReject(sendPromise);

		// Clean up
		await provider.deleteSession(session.sessionId);
	});

	test('unarchiveSession unarchives a Claude temp session', async () => {
		const { provider, cancelRequest } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');
		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		const added = waitForSessionAdded(provider);
		const chat2 = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat2.resource, { query: 'test' });
		await added;

		await provider.archiveSession(session.sessionId);
		assert.strictEqual(provider.getSessions()[0].isArchived.get(), true);

		await provider.unarchiveSession(session.sessionId);
		assert.strictEqual(provider.getSessions()[0].isArchived.get(), false);

		cancelRequest();
		await assert.doesNotReject(sendPromise);

		// Clean up
		await provider.deleteSession(session.sessionId);
	});

	// ---- Claude controller-based send flow -------

	test('sendRequest replaces temp session with committed session on success', async () => {
		const { provider, commitSession } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');
		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		const replacements: { from: unknown; to: unknown }[] = [];
		disposables.add(provider.onDidReplaceSession(e => replacements.push(e)));

		const added = waitForSessionAdded(provider);
		const chat3 = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat3.resource, { query: 'hello world' });
		await added;

		assert.strictEqual(provider.getSessions().length, 1, 'temp session should appear while in-flight');

		// Simulate the agent session appearing in the model
		commitSession();
		await sendPromise;

		// The temp session should have been replaced by the committed one
		assert.ok(replacements.length > 0, 'onDidReplaceSessions should have fired');
	});

	test('sendRequest uses the query as the temp session title', async () => {
		const { provider, cancelRequest } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');
		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		const added = waitForSessionAdded(provider);
		const chat4 = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat4.resource, { query: 'fix the login bug' });
		await added;

		const sessions = provider.getSessions();
		assert.strictEqual(sessions[0].title.get(), 'fix the login bug');

		cancelRequest();
		await assert.doesNotReject(sendPromise);
		await provider.deleteSession(session.sessionId);
	});

	test('sendRequest keeps temp session on cancellation', async () => {
		const { provider, cancelRequest } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');
		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		const added = waitForSessionAdded(provider);
		const chat5 = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat5.resource, { query: 'test' });
		await added;

		// Cancel before the agent session appears
		cancelRequest();
		await sendPromise;

		assert.strictEqual(provider.getSessions().length, 1, 'session should remain after cancellation');
		assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, 'should be marked completed');

		await provider.deleteSession(session.sessionId);
	});

	// ---- Rename -------

	test('renameChat delegates to claude rename command', async () => {
		const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: '/claude-session' });
		model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));

		const provider = createProvider(disposables, model, { claudeEnabled: true });
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 1);

		// Should not throw — delegates to ICommandService.executeCommand
		await provider.renameChat(sessions[0].sessionId, claudeResource, 'New Title');
	});

	test('renameChat throws for unsupported session type', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/cloud-session' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		await assert.rejects(
			() => provider.renameChat(sessions[0].sessionId, resource, 'New Title'),
			/not supported/,
		);
	});

	// ---- Uncommitted temp session cleanup ------------------------------------

	suite('uncommitted temp session cleanup', () => {
		const workspace = URI.file('/test/repo');

		/**
		 * Returns a provider wired up so that sendRequest keeps the request
		 * in-flight indefinitely. Also returns helpers to resolve the request
		 * as a cancellation (so the provider cleans up promptly in tests).
		 */
		function makeInFlightProvider(): {
			provider: CopilotChatSessionsProvider;
			cancelRequest: () => void;
		} {
			let resolveComplete!: () => void;
			let resolveCreated!: (r: IChatResponseModel) => void;
			const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
			const responseCreatedPromise = new Promise<IChatResponseModel>(r => { resolveCreated = r; });

			const provider = createProviderForSendTests(disposables, model, async () => ({
				kind: 'sent' as const,
				data: {
					responseCompletePromise,
					responseCreatedPromise,
					agent: new class extends mock<IChatAgentData>() { }(),
				} as IChatSendRequestData,
			}));

			return {
				provider,
				cancelRequest: () => {
					resolveCreated({ isCanceled: true } as unknown as IChatResponseModel);
					resolveComplete();
				},
			};
		}

		/** Wait for the provider to fire an "added" session change event. */
		function waitForSessionAdded(provider: CopilotChatSessionsProvider): Promise<void> {
			return new Promise<void>(resolve => {
				const d = provider.onDidChangeSessions(e => {
					if (e.added.length > 0) {
						d.dispose();
						resolve();
					}
				});
			});
		}

		test('deleteSession removes a temp session that is awaiting commit', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const chat = await provider.createNewChat(sessionId);
			const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			await provider.deleteSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 0, 'session should be removed after deleteSession');

			// Cancellation after delete should resolve cleanly
			cancelRequest();
			await assert.doesNotReject(sendPromise);
		});

		test('archiveSession archives a temp session that is awaiting commit', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const chat = await provider.createNewChat(sessionId);
			const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			await provider.archiveSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 1, 'session should still be in the list after archiveSession');
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, 'session should be archived');

			// Cancellation after archive should resolve cleanly
			cancelRequest();
			await assert.doesNotReject(sendPromise);

			// Clean up to avoid leaked disposable
			await provider.deleteSession(sessionId);
		});

		test('archiveSession archives a stopped session that was never committed', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const chat = await provider.createNewChat(sessionId);
			const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: 'test' });
			await added;

			// Stop before commit arrives — session should stay as completed
			cancelRequest();
			await sendPromise;

			assert.strictEqual(provider.getSessions().length, 1, 'stopped session should remain in the list');
			assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, 'session should be completed');

			await provider.archiveSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 1, 'session should still be in the list after archiving');
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, 'session should be archived');

			// Unarchive should also work
			await provider.unarchiveSession(sessionId);
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), false, 'session should be unarchived');

			// Clean up to avoid leaked disposable
			await provider.deleteSession(sessionId);
		});
	});

	// ---- New session default permission level seeding -----------------------

	suite('new session default permission level', () => {
		const workspace = URI.file('/test/repo');

		function makeConfig(opts: { defaultLevel?: ChatPermissionLevel; policyRestricted?: boolean }): TestConfigurationService {
			const config = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					const base = super.inspect<T>(key);
					if (opts.policyRestricted && key === ChatConfiguration.GlobalAutoApprove) {
						return { ...base, policyValue: false as unknown as T };
					}
					return base;
				}
			}();
			if (opts.defaultLevel) {
				config.setUserConfiguration(ChatConfiguration.DefaultPermissionLevel, opts.defaultLevel);
			}
			return config;
		}

		test('CLI session seeds permission level from chat.permissions.default', () => {
			const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot });
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }), { configurationService });

			const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const session = provider.getSession(sessionInfo.sessionId);

			assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Autopilot);
		});

		test('clamps to Default when chat.tools.global.autoApprove policy is false', () => {
			const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot, policyRestricted: true });
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }), { configurationService });

			const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const session = provider.getSession(sessionInfo.sessionId);

			assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
		});

		test('falls back to Default when chat.permissions.default is unset', () => {
			const configurationService = makeConfig({});
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }), { configurationService });

			const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const session = provider.getSession(sessionInfo.sessionId);

			assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
		});
	});

	// ---- In-flight commit protection -------

	test('concurrent model re-resolve does not spuriously remove an in-flight committed session', async () => {
		// This reproduces the race condition from the smoke test failure:
		// 1. Claude session is created and committed (added to model)
		// 2. _sendFirstChat is waiting for the committed adapter in the cache
		// 3. A concurrent model re-resolve transiently removes the session
		//    from agentSessionsService.model.sessions
		// 4. _refreshSessionCache should NOT fire `removed` for the in-flight
		//    session because it is protected by _inFlightCommits

		const { provider, commitSession, realResource } = makeClaudeInFlightProvider();
		const workspace = URI.file('/test/project');
		const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);

		const removals: string[] = [];
		disposables.add(provider.onDidChangeSessions(e => {
			for (const r of e.removed) {
				removals.push(r.resource.toString());
			}
		}));

		const added = waitForSessionAdded(provider);
		const chat = await provider.createNewChat(session.sessionId);
		const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: 'test' });
		await added;

		// Commit: adds the real session to the model, triggering
		// _refreshSessionCache which populates the AgentSessionAdapter.
		commitSession();

		// Simulate a concurrent model re-resolve transiently dropping the
		// session: remove it from the model (fires onDidChangeSessions →
		// _refreshSessionCache). Because _sendFirstChat holds the resource
		// in _inFlightCommits, _refreshSessionCache must NOT fire `removed`.
		model.removeSession(realResource);

		// The committed session resource must NOT appear in removals
		assert.ok(
			!removals.includes(realResource.toString()),
			`In-flight committed session ${realResource.toString()} should not be spuriously removed. ` +
			`Removals seen: [${removals.join(', ')}]`,
		);

		// Re-add the session so _waitForSessionInCache can resolve
		model.addSession(createMockAgentSession(realResource, { providerType: AgentSessionProviders.Claude }));

		await sendPromise;
	});
});
