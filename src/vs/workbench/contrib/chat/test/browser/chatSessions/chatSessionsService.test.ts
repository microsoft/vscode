/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, IContextKey, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { applyCodexAgentHostPreference, ChatSessionsService } from '../../../browser/chatSessions/chatSessions.contribution.js';
import { ChatSessionOptionsMap, ChatSessionStatus, IChatSessionHistoryItem, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionsExtensionPoint, ReadonlyChatSessionOptionsMap, SessionType } from '../../../common/chatSessionsService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId, GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, protectedResourcesRequireGitHubCopilotSignIn } from '../../../../../../platform/agentHost/common/agentService.js';
import { ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';

suite('Codex Agent Host preference', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function isCodexExtensionHostAvailable(options: {
		agentHostEnabled: boolean;
		codexAgentEnabled: boolean;
		isSessionsWindow: boolean;
		preferAgentHost: boolean;
	}): boolean {
		const configurationService = new TestConfigurationService({
			[AgentHostCodexAgentEnabledSettingId]: options.codexAgentEnabled,
			[CodexPreferAgentHostEditorSettingId]: options.preferAgentHost,
		});
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		AGENT_HOST_ENABLED_CONTEXT_KEY.bindTo(contextKeyService).set(options.agentHostEnabled);
		IsSessionsWindowContext.bindTo(contextKeyService).set(options.isSessionsWindow);

		const contribution = applyCodexAgentHostPreference({
			type: SessionType.Codex,
			name: 'codex',
			displayName: 'Codex',
			description: '',
		});
		const when = ContextKeyExpr.deserialize(contribution.when);
		return !!when && contextKeyService.contextMatchesRules(when);
	}

	test('never surfaces extension-host Codex in the Agents window and replaces it when preferred in the editor', () => {
		assert.deepStrictEqual({
			agentsWindowPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: true, preferAgentHost: true }),
			agentsWindowNotPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: true, preferAgentHost: false }),
			agentsWindowAgentHostDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: false, codexAgentEnabled: false, isSessionsWindow: true, preferAgentHost: false }),
			editorWindowPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: true }),
			editorWindowNotPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: false }),
			agentHostDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: false, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: true }),
			codexAgentDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: false, isSessionsWindow: false, preferAgentHost: true }),
		}, {
			agentsWindowPreferred: false,
			agentsWindowNotPreferred: false,
			agentsWindowAgentHostDisabled: false,
			editorWindowPreferred: false,
			editorWindowNotPreferred: true,
			agentHostDisabled: true,
			codexAgentDisabled: true,
		});
	});
});

suite.skip('ChatSessionsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let chatSessionsService: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		chatSessionsService = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	suite('extractFileNameFromLink', () => {

		function callExtractFileNameFromLink(filePath: string): string {
			// Access the private method using bracket notation with proper typing
			type ServiceWithPrivateMethod = Record<'extractFileNameFromLink', (filePath: string) => string>;
			return (chatSessionsService as unknown as ServiceWithPrivateMethod)['extractFileNameFromLink'](filePath);
		}

		test('should extract filename from markdown link with link text', () => {
			const input = 'Read [README](file:///path/to/README.md) for more info';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Read README for more info');
		});

		test('should extract filename from markdown link without link text', () => {
			const input = 'Read [](file:///index.js) for instructions';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Read index.js for instructions');
		});

		test('should extract filename from markdown link with empty link text', () => {
			const input = 'Check [  ](file:///config.json) settings';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Check config.json settings');
		});

		test('should handle multiple file links in same string', () => {
			const input = 'See [main](file:///main.js) and [utils](file:///utils/helper.ts)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'See main and utils');
		});

		test('should handle file path without extension', () => {
			const input = 'Open [](file:///src/components/Button)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Open Button');
		});

		test('should handle deep file paths', () => {
			const input = 'Edit [](file:///very/deep/nested/path/to/file.tsx)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Edit file.tsx');
		});

		test('should handle file path that is just a filename', () => {
			const input = 'View [script](file:///script.py)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'View script');
		});

		test('should handle link text with special characters', () => {
			const input = 'See [App.js (main)](file:///App.js)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'See App.js (main)');
		});

		test('should return original string if no file links present', () => {
			const input = 'This is just regular text with no links';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'This is just regular text with no links');
		});

		test('should handle mixed content with file links and regular text', () => {
			const input = 'Check [config](file:///config.yml) and visit https://example.com';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Check config and visit https://example.com');
		});

		test('should handle file path with query parameters or fragments', () => {
			const input = 'Open [](file:///index.html?param=value#section)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Open index.html?param=value#section');
		});

		test('should handle Windows-style paths', () => {
			const input = 'Edit [](file:///C:/Users/user/Documents/file.txt)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Edit file.txt');
		});

		test('should preserve whitespace around replacements', () => {
			const input = '   Check [](file:///test.js)   ';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, '   Check test.js   ');
		});
	});
});

suite('ChatSessionsService - getChatSessionItems availability', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const GATED_TYPE = 'gated-type';
	const UNGATED_TYPE = 'ungated-type';
	const gatedKey = new RawContextKey<boolean>('test.gatedTypeEnabled', false);

	let service: ChatSessionsService;
	let contextKeyService: ContextKeyService;
	let gatedEnabled: IContextKey<boolean>;

	/**
	 * A minimal item controller that immediately exposes a single session item.
	 * This stands in for an extension-host-registered controller, which is
	 * registered independently of the contribution's `when` clause.
	 */
	class FakeItemController implements IChatSessionItemController {
		private readonly _onDidChange = store.add(new Emitter<IChatSessionItemsDelta>());
		readonly onDidChangeChatSessionItems: Event<IChatSessionItemsDelta> = this._onDidChange.event;

		constructor(private readonly _type: string) { }

		get items(): readonly IChatSessionItem[] {
			return [{
				resource: URI.from({ scheme: this._type, path: `/session-1` }),
				label: `${this._type} session`,
				timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined },
			}];
		}

		async refresh(): Promise<void> { }
	}

	function registerType(type: string, when: string | undefined): void {
		const contribution: IChatSessionsExtensionPoint = { type, name: type, displayName: type, description: '', when };
		store.add(service.registerChatSessionContribution(contribution));
		store.add(service.registerChatSessionItemController(type, new FakeItemController(type)));
	}

	async function resolvedTypes(): Promise<string[]> {
		const types: string[] = [];
		for await (const { chatSessionType, items } of service.getChatSessionItems(undefined, CancellationToken.None)) {
			if (items.length > 0) {
				types.push(chatSessionType);
			}
		}
		return types.sort();
	}

	setup(() => {
		const configurationService = new TestConfigurationService();
		contextKeyService = store.add(new ContextKeyService(configurationService));
		gatedEnabled = gatedKey.bindTo(contextKeyService);

		const instantiationService = store.add(workbenchInstantiationService({
			contextKeyService: () => contextKeyService,
			configurationService: () => configurationService,
		}, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));

		registerType(GATED_TYPE, `${gatedKey.key}`);
		registerType(UNGATED_TYPE, undefined);
	});

	test('excludes a type whose contribution `when` is false', async () => {
		gatedEnabled.set(false);
		assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
	});

	test('includes a type whose contribution `when` is true', async () => {
		gatedEnabled.set(true);
		assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);
	});

	test('reflects a runtime `when` flip without re-registration', async () => {
		gatedEnabled.set(true);
		assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);

		gatedEnabled.set(false);
		assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
	});
});

suite('ChatSessionsService - in-progress lifecycle', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('removes in-progress state when its controller is disposed', async () => {
		const changed = store.add(new Emitter<IChatSessionItemsDelta>());
		const sessionType = 'test-provider';
		const controller: IChatSessionItemController = {
			onDidChangeChatSessionItems: changed.event,
			items: [{
				resource: URI.from({ scheme: sessionType, path: '/session-1' }),
				label: 'In-progress session',
				status: ChatSessionStatus.InProgress,
				timing: { created: 0, lastRequestStarted: 0, lastRequestEnded: undefined },
			}],
			async refresh(): Promise<void> { },
		};
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const service = store.add(instantiationService.createInstance(ChatSessionsService));
		const registration = service.registerChatSessionItemController(sessionType, controller);

		const progressAdded = Event.toPromise(service.onDidChangeInProgress);
		changed.fire({ addedOrUpdated: controller.items });
		await progressAdded;

		const progressRemoved = Event.toPromise(service.onDidChangeInProgress);
		registration.dispose();
		await progressRemoved;

		assert.deepStrictEqual(service.getInProgress(), []);
	});

	test('does not dispose a replacement controller or publish stale progress', async () => {
		const firstRefresh = new DeferredPromise<void>();
		const sessionType = 'test-provider';
		const firstController: IChatSessionItemController = {
			onDidChangeChatSessionItems: Event.None,
			items: [{
				resource: URI.from({ scheme: sessionType, path: '/session-1' }),
				label: 'In-progress session',
				status: ChatSessionStatus.InProgress,
				timing: { created: 0, lastRequestStarted: 0, lastRequestEnded: undefined },
			}],
			refresh: () => firstRefresh.p,
		};
		const replacementController: IChatSessionItemController = {
			onDidChangeChatSessionItems: Event.None,
			items: [],
			async refresh(): Promise<void> { },
		};
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const service = store.add(instantiationService.createInstance(ChatSessionsService));
		const firstRegistration = service.registerChatSessionItemController(sessionType, firstController);

		type ServiceWithUpdateInProgressStatus = {
			updateInProgressStatus(chatSessionType: string): Promise<void>;
		};
		const staleUpdate = (service as unknown as ServiceWithUpdateInProgressStatus).updateInProgressStatus(sessionType);
		store.add(service.registerChatSessionItemController(sessionType, replacementController));
		firstRegistration.dispose();
		await firstRefresh.complete();
		await staleUpdate;

		assert.deepStrictEqual({
			registeredProviders: service.getRegisteredChatSessionItemProviders(),
			inProgress: service.getInProgress(),
		}, {
			registeredProviders: [sessionType],
			inProgress: [],
		});
	});
});

suite('ChatSessionsService - requiresCopilotSignInForSessionType', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	function register(type: string, extra: Partial<IChatSessionsExtensionPoint>): void {
		store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: '', ...extra }));
	}

	test('evaluates a functional requiresCopilotSignIn, and reads a static flag otherwise', () => {
		// Declarative (extension) types supply a static boolean, read directly.
		register('static-required', { requiresCopilotSignIn: true });
		register('static-not-required', { requiresCopilotSignIn: false });

		// Programmatic types (e.g. agent host) own a function deriving the
		// requirement from their agent's advertised protected resources — an agent
		// that marks the Copilot resource `required: false` (Claude native, Codex on
		// OpenAI) is usable without signing in; an unresolved agent falls back to
		// "required".
		const resourcesByProvider: Record<string, readonly ProtectedResourceMetadata[] | undefined> = {
			proxy: [GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE],
			native: [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }, GITHUB_REPO_PROTECTED_RESOURCE],
			'codex-openai': [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }],
			unresolved: undefined,
		};
		const derive = (provider: string) => () => {
			const resources = resourcesByProvider[provider];
			return resources !== undefined ? protectedResourcesRequireGitHubCopilotSignIn(resources) : true;
		};
		register('ah-proxy', { agentHostProviderId: 'proxy', requiresCopilotSignIn: derive('proxy') });
		register('ah-native', { agentHostProviderId: 'native', requiresCopilotSignIn: derive('native') });
		register('ah-codex-openai', { agentHostProviderId: 'codex-openai', requiresCopilotSignIn: derive('codex-openai') });
		register('ah-unresolved', { agentHostProviderId: 'unresolved', requiresCopilotSignIn: derive('unresolved') });

		assert.deepStrictEqual({
			staticRequired: service.requiresCopilotSignInForSessionType('static-required'),
			staticNotRequired: service.requiresCopilotSignInForSessionType('static-not-required'),
			ahProxy: service.requiresCopilotSignInForSessionType('ah-proxy'),
			ahNative: service.requiresCopilotSignInForSessionType('ah-native'),
			ahCodexOpenai: service.requiresCopilotSignInForSessionType('ah-codex-openai'),
			ahUnresolved: service.requiresCopilotSignInForSessionType('ah-unresolved'),
			unknownType: service.requiresCopilotSignInForSessionType('never-registered'),
		}, {
			staticRequired: true,
			staticNotRequired: false,
			ahProxy: true,
			ahNative: false,
			ahCodexOpenai: false,
			ahUnresolved: true,
			unknownType: false,
		});
	});

	test('a contribution change event re-fires onDidChangeAvailability until it is unregistered', () => {
		const changed = store.add(new Emitter<void>());
		let availabilityFires = 0;
		store.add(service.onDidChangeAvailability(() => availabilityFires++));

		// Registering the contribution fires availability once (a type appeared);
		// its onDidChangeRequiresCopilotSignIn is wired generically.
		const registration = store.add(service.registerChatSessionContribution({
			type: 'dyn', name: 'dyn', displayName: 'dyn', description: '',
			requiresCopilotSignIn: () => true,
			onDidChangeRequiresCopilotSignIn: changed.event,
		}));
		const afterRegister = availabilityFires;

		changed.fire();
		const afterChange = availabilityFires;

		// Unregistering disposes the subscription (and fires once for the removal),
		// so a later change no longer drives availability.
		registration.dispose();
		const afterDispose = availabilityFires;
		changed.fire();
		const afterChangePostDispose = availabilityFires;

		assert.deepStrictEqual(
			{ afterRegister, afterChange, afterDispose, afterChangePostDispose },
			{ afterRegister: 1, afterChange: 2, afterDispose: 3, afterChangePostDispose: 3 },
		);
	});
});

suite('ChatSessionsService - archive capability', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestItemController implements IChatSessionItemController {
		readonly onDidChangeChatSessionItems = Event.None;

		constructor(
			readonly setChatSessionItemArchived?: (resource: URI, archived: boolean) => void,
		) { }

		readonly items: readonly IChatSessionItem[] = [];

		async refresh(): Promise<void> { }
	}

	let service: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	test('delegates to the registered controller', () => {
		const sessionType = 'supported-type';
		const updates: { resource: string; archived: boolean }[] = [];
		const controller = new TestItemController((resource, archived) => updates.push({ resource: resource.toString(), archived }));
		store.add(service.registerChatSessionContribution({
			type: sessionType,
			name: sessionType,
			displayName: sessionType,
			description: '',
		}));
		store.add(service.registerChatSessionItemController(sessionType, controller));

		const resource = URI.from({ scheme: sessionType, path: '/session-1' });
		service.setChatSessionItemArchived(resource, true);

		assert.deepStrictEqual({
			canSetArchived: service.canSetChatSessionItemArchived(resource),
			updates,
		}, {
			canSetArchived: true,
			updates: [{ resource: resource.toString(), archived: true }],
		});
	});

	test('reports and rejects an unsupported controller', () => {
		const sessionType = 'unsupported-type';
		store.add(service.registerChatSessionContribution({
			type: sessionType,
			name: sessionType,
			displayName: sessionType,
			description: '',
		}));
		store.add(service.registerChatSessionItemController(sessionType, new TestItemController()));

		const resource = URI.from({ scheme: sessionType, path: '/session-1' });
		assert.strictEqual(service.canSetChatSessionItemArchived(resource), false);
		assert.throws(() => service.setChatSessionItemArchived(resource, true), /does not support archiving/);
	});
});

suite('ChatSessionsService - read capability', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestItemController implements IChatSessionItemController {
		readonly onDidChangeChatSessionItems = Event.None;

		constructor(
			readonly setChatSessionItemRead?: (resource: URI, isRead: boolean) => void,
		) { }

		readonly items: readonly IChatSessionItem[] = [];

		async refresh(): Promise<void> { }
	}

	let service: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	test('delegates to the registered controller', () => {
		const sessionType = 'read-supported-type';
		const updates: { resource: string; isRead: boolean }[] = [];
		const controller = new TestItemController((resource, isRead) => updates.push({ resource: resource.toString(), isRead }));
		store.add(service.registerChatSessionContribution({
			type: sessionType,
			name: sessionType,
			displayName: sessionType,
			description: '',
		}));
		store.add(service.registerChatSessionItemController(sessionType, controller));

		const resource = URI.from({ scheme: sessionType, path: '/session-1' });
		service.setChatSessionItemRead(resource, true);
		service.setChatSessionItemRead(resource, false);

		assert.deepStrictEqual({
			canSetRead: service.canSetChatSessionItemRead(resource),
			updates,
		}, {
			canSetRead: true,
			updates: [
				{ resource: resource.toString(), isRead: true },
				{ resource: resource.toString(), isRead: false },
			],
		});
	});

	test('reports and rejects an unsupported controller', () => {
		const sessionType = 'read-unsupported-type';
		store.add(service.registerChatSessionContribution({
			type: sessionType,
			name: sessionType,
			displayName: sessionType,
			description: '',
		}));
		store.add(service.registerChatSessionItemController(sessionType, new TestItemController()));

		const resource = URI.from({ scheme: sessionType, path: '/session-1' });
		assert.strictEqual(service.canSetChatSessionItemRead(resource), false);
		assert.throws(() => service.setChatSessionItemRead(resource, true), /does not own read state/);
	});
});

suite('ChatSessionsService - untitled↔real session aliases', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: ChatSessionsService;

	const untitled = URI.from({ scheme: 'remoteProvider', path: '/untitled-abc' });
	const real = URI.from({ scheme: 'remoteProvider', path: '/real-abc' });

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	test('setMaterializedSessionResource publishes the forward untitled→real mapping', () => {
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined, 'no mapping before publish');
		// The inverse alias alone must not publish the forward mapping (it is only
		// published once the real session has loaded).
		service.registerSessionResourceAlias(untitled, real);
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined, 'registerSessionResourceAlias alone does not publish the forward mapping');
		service.setMaterializedSessionResource(untitled, real);
		assert.strictEqual(service.getMaterializedSessionResource(untitled)?.toString(), real.toString());
	});

	test('clearMaterializedSessionResource clears the forward mapping when called with the untitled key', () => {
		service.registerSessionResourceAlias(untitled, real);
		service.setMaterializedSessionResource(untitled, real);
		service.clearMaterializedSessionResource(untitled);
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined);
	});

	test('clearMaterializedSessionResource clears the forward mapping when called with the real value', () => {
		service.registerSessionResourceAlias(untitled, real);
		service.setMaterializedSessionResource(untitled, real);
		service.clearMaterializedSessionResource(real);
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined);
	});

	test('options selected before first send survive disposal of the untitled session', async () => {
		const type = untitled.scheme;
		store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: '' }));
		store.add(service.registerChatSessionContentProvider(type, {
			provideChatSessionContent: (resource: URI) => Promise.resolve({
				sessionResource: resource,
				history: [],
				onWillDispose: Event.None,
				dispose: () => { },
			}),
		}));

		// Create the untitled session entry and record a user option selection on it.
		await service.getOrCreateChatSession(untitled, CancellationToken.None);
		service.setSessionOption(untitled, 'model', 'sonnet');

		// Materialize: register the inverse alias, load the real session, publish
		// the forward mapping.
		service.registerSessionResourceAlias(untitled, real);
		await service.getOrCreateChatSession(real, CancellationToken.None);
		service.setMaterializedSessionResource(untitled, real);

		// The real session resolves the option through the inverse alias.
		assert.strictEqual(service.getSessionOption(real, 'model'), 'sonnet');

		// Disposing the untitled model clears only the forward mapping; the inverse
		// alias is intentionally kept, so the real session keeps resolving the
		// option to the untitled entry.
		service.clearMaterializedSessionResource(untitled);
		assert.strictEqual(service.getSessionOption(real, 'model'), 'sonnet');
	});
});

suite('ChatSessionsService - lightweight history reads', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	function registerHistoryProvider(type: string, history: readonly IChatSessionHistoryItem[], counters: { provided: number; disposed: number }): void {
		store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: '' }));
		store.add(service.registerChatSessionContentProvider(type, {
			provideChatSessionContent: async resource => {
				counters.provided++;
				return {
					sessionResource: resource,
					history,
					onWillDispose: Event.None,
					dispose: () => counters.disposed++,
				};
			},
		}));
	}

	test('loads and disposes uncached sessions without retaining them', async () => {
		const type = 'history-preview';
		const resource = URI.from({ scheme: type, path: '/session-1' });
		const history: readonly IChatSessionHistoryItem[] = [{ type: 'request', prompt: 'Summarize the changes', participant: 'test' }];
		const counters = { provided: 0, disposed: 0 };
		registerHistoryProvider(type, history, counters);

		const first = await service.getChatSessionHistory(resource, CancellationToken.None);
		const second = await service.getChatSessionHistory(resource, CancellationToken.None);

		assert.deepStrictEqual({ first, second, counters }, {
			first: history,
			second: history,
			counters: { provided: 2, disposed: 2 },
		});
	});

	test('reads an already retained session without resolving it again', async () => {
		const type = 'history-cached';
		const resource = URI.from({ scheme: type, path: '/session-1' });
		const history: readonly IChatSessionHistoryItem[] = [{ type: 'request', prompt: 'Continue the review', participant: 'test' }];
		const counters = { provided: 0, disposed: 0 };
		registerHistoryProvider(type, history, counters);

		await service.getOrCreateChatSession(resource, CancellationToken.None);
		const result = await service.getChatSessionHistory(resource, CancellationToken.None);

		assert.deepStrictEqual({ result, counters }, {
			result: history,
			counters: { provided: 1, disposed: 0 },
		});
	});

	test('reads an aliased retained session without resolving it again', async () => {
		const type = 'history-cached-alias';
		const resource = URI.from({ scheme: type, path: '/session-1' });
		const alias = URI.from({ scheme: type, path: '/session-1-materialized' });
		const history: readonly IChatSessionHistoryItem[] = [{ type: 'request', prompt: 'Continue the aliased session', participant: 'test' }];
		const counters = { provided: 0, disposed: 0 };
		registerHistoryProvider(type, history, counters);

		await service.getOrCreateChatSession(resource, CancellationToken.None);
		service.registerSessionResourceAlias(resource, alias);
		const result = await service.getChatSessionHistory(alias, CancellationToken.None);

		assert.deepStrictEqual({ result, counters }, {
			result: history,
			counters: { provided: 1, disposed: 0 },
		});
	});

	test('resolves alternative session types through their primary provider', async () => {
		const type = 'history-primary';
		const alternativeType = 'history-alternative';
		const resource = URI.from({ scheme: alternativeType, path: '/session-1' });
		const history: readonly IChatSessionHistoryItem[] = [{ type: 'request', prompt: 'Read through the primary provider', participant: 'test' }];
		const counters = { provided: 0, disposed: 0 };
		store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: '', alternativeIds: [alternativeType] }));
		store.add(service.registerChatSessionContentProvider(type, {
			provideChatSessionContent: async sessionResource => {
				counters.provided++;
				return {
					sessionResource,
					history,
					onWillDispose: Event.None,
					dispose: () => counters.disposed++,
				};
			},
		}));

		const result = await service.getChatSessionHistory(resource, CancellationToken.None);

		assert.deepStrictEqual({ result, counters }, {
			result: history,
			counters: { provided: 1, disposed: 1 },
		});
	});

	test('returns empty history for an unretained untitled session', async () => {
		const resource = URI.from({ scheme: 'history-untitled', path: '/untitled-session-1' });

		assert.deepStrictEqual(await service.getChatSessionHistory(resource, CancellationToken.None), []);
	});

	test('throws when a retained-session provider cannot be resolved', async () => {
		const type = 'history-unresolvable';
		const resource = URI.from({ scheme: type, path: '/session-1' });
		store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: '' }));

		await assert.rejects(service.getChatSessionHistory(resource, CancellationToken.None), new Error(`Cannot find provider '${type}'`));
	});
});

suite('ChatSessionOptionsMap', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('toStrValueArray', () => {

		test('should return undefined for undefined input', () => {
			assert.strictEqual(ChatSessionOptionsMap.toStrValueArray(undefined), undefined);
		});

		test('should convert a Map to an array of {optionId, value}', () => {
			const map = new Map([['models', 'gpt-4'], ['repo', 'my-repo']]);
			assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
				{ optionId: 'models', value: 'gpt-4' },
				{ optionId: 'repo', value: 'my-repo' },
			]);
		});

		test('should extract .id from IChatSessionProviderOptionItem values', () => {
			const map: ReadonlyChatSessionOptionsMap = new Map([
				['agent', { id: 'copilot', name: 'Copilot' }],
			]);
			assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
				{ optionId: 'agent', value: 'copilot' },
			]);
		});

		test('should handle a plain object as if it were a record (defensive fallback)', () => {
			// Simulates a Map that lost its prototype during serialization
			const plainObject = { models: 'gpt-4', repo: 'my-repo' } as unknown as ReadonlyChatSessionOptionsMap;
			assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(plainObject), [
				{ optionId: 'models', value: 'gpt-4' },
				{ optionId: 'repo', value: 'my-repo' },
			]);
		});
	});

	suite('toRecord', () => {

		test('should convert a Map to a record', () => {
			const map = new Map([['models', 'gpt-4']]);
			const record = ChatSessionOptionsMap.toRecord(map);
			assert.strictEqual(record['models'], 'gpt-4');
		});

		test('should handle a plain object as if it were a record (defensive fallback)', () => {
			const plainObject = { models: 'gpt-4' } as unknown as ReadonlyChatSessionOptionsMap;
			const record = ChatSessionOptionsMap.toRecord(plainObject);
			assert.strictEqual(record['models'], 'gpt-4');
		});
	});

	suite('fromRecord', () => {

		test('should convert a record to a Map', () => {
			const map = ChatSessionOptionsMap.fromRecord({ models: 'gpt-4', repo: 'my-repo' });
			assert.strictEqual(map.get('models'), 'gpt-4');
			assert.strictEqual(map.get('repo'), 'my-repo');
			assert.strictEqual(map.size, 2);
		});
	});
});
