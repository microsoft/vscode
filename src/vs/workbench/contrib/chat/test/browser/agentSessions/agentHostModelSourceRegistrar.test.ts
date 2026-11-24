/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { AuthenticateParams, AuthenticateResult } from '../../../../../../platform/agentHost/common/agent.js';
import { AgentHostByokDirectEndpointsSettingId, AgentHostByokModelsEnabledSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, type IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, getByokModelSourceNamespace, parseByokModelSourceId } from '../../../../../../platform/agentHost/common/byokModelSource.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSourceRegistration, type ModelSourceState, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, type ActionEnvelope, type ClientModelSourceAction, type RootAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { rootReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationHandle, IPromptChoice, NotificationMessage, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { AgentHostModelSourceRegistrar, AgentHostModelSourceStatusService, getByokModelSources, isReachableFromRemoteAgentHost } from '../../../browser/agentSessions/agentHost/agentHostModelSourceRegistrar.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata, type ILanguageModelsGroup } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService, type ILanguageModelsProviderGroup } from '../../../common/languageModelsConfiguration.js';
import type { IUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';

const PUBLIC_URL = 'https://models.example.test/v1/chat/completions';
const PRIVATE_URL = 'http://10.0.0.5:8000/v1/chat/completions';

class FakeRootSubscription implements IAgentSubscription<RootState> {
	private readonly _onDidChange = new Emitter<RootState>();
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(public value: RootState) { }

	get verifiedValue(): RootState {
		return this.value;
	}

	apply(action: RootAction): void {
		this.value = rootReducer(this.value, action);
		this._onDidChange.fire(this.value);
	}

	/** Reports a registration's status, as the host does. */
	report(id: string, state: ModelSourceState, credentialNonce: string, options: { readonly resource?: string; readonly origins?: string[]; readonly credentialId?: string } = {}): void {
		this.apply({ type: ActionType.RootModelSourceStateChanged, id, state, credentialNonce, credentialResource: { resource: options.resource ?? 'https://models.example.test/v1' }, credentialOrigins: options.origins ?? ['https://models.example.test'], ...(options.credentialId ? { credentialId: options.credentialId } : {}) });
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

/** An agent host connection that applies registrations to its root state and records delivered keys. */
class FakeConnection extends mock<IAgentConnection>() {
	readonly actions: ClientModelSourceAction[] = [];
	readonly keys: { readonly token: string; readonly nonce: string | undefined; readonly credentialId: string | undefined }[] = [];
	override readonly clientId = 'window-1';

	constructor(override readonly rootState: FakeRootSubscription, override readonly clientConnectionKind: AgentHostClientConnectionKind) {
		super();
	}

	override dispatch(_channel: string, action: ClientModelSourceAction): void {
		this.actions.push(action);
		this.rootState.apply(action);
	}

	override async dispatchConfirmed<T>(channel: string, _subscription: IAgentSubscription<T>, action: ClientModelSourceAction): Promise<ActionEnvelope> {
		this.dispatch(channel, action);
		return { channel, action, serverSeq: this.actions.length, origin: { clientId: this.clientId, clientSeq: this.actions.length } };
	}

	override async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		const target = params.target?.kind === 'modelSource' ? params.target : undefined;
		this.keys.push({ token: params.token, nonce: target?.credentialNonce, credentialId: target?.credentialId });
		return { authenticated: true };
	}
}

class PromptRecorder extends TestNotificationService {
	readonly prompts: { readonly message: NotificationMessage; readonly choices: IPromptChoice[] }[] = [];

	override prompt(severity: Severity, message: NotificationMessage, choices: IPromptChoice[]): INotificationHandle {
		this.prompts.push({ message, choices });
		return super.prompt(severity, message, choices);
	}
}

function metadataOf(vendor: string, id: string, extra?: Partial<ILanguageModelChatMetadata>): ILanguageModelChatMetadata {
	return { extension: new ExtensionIdentifier('test.copilot'), name: id.toUpperCase(), id, vendor, version: '1', family: id, maxInputTokens: 100, maxOutputTokens: 20, isDefaultForLocation: {}, isBYOK: true, ...extra };
}

interface IFakeLanguageModels {
	readonly groups: ILanguageModelsProviderGroup[];
	readonly metadata: Map<string, ILanguageModelChatMetadata>;
	readonly resolvedVendors: Set<string>;
	readonly keys: Map<string, string>;
	/** Groups whose models failed to list, as `vendor/group`. */
	readonly failedGroups?: Set<string>;
}

function createLanguageModelServices(models: IFakeLanguageModels, onDidChangeGroups: Event<readonly ILanguageModelsProviderGroup[]> = Event.None) {
	const languageModelsService = new class extends mock<ILanguageModelsService>() {
		override readonly onDidChangeLanguageModels = Event.None;
		override hasResolvedVendor(vendor: string): boolean {
			return models.resolvedVendors.has(vendor);
		}
		override getLanguageModelGroups(vendor: string): ILanguageModelsGroup[] {
			return models.groups.filter(group => group.vendor === vendor).map(group => models.failedGroups?.has(`${vendor}/${group.name}`)
				? { group, modelIdentifiers: [], status: { message: 'offline', severity: Severity.Error } }
				: { group, modelIdentifiers: [...models.metadata.keys()].filter(identifier => identifier.startsWith(`${vendor}/${group.name}/`)) });
		}
		override lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
			return models.metadata.get(identifier);
		}
		override async resolveLanguageModelsProviderGroupApiKey(vendor: string, group: string): Promise<string | undefined> {
			return models.keys.get(`${vendor}/${group}`);
		}
	};
	const languageModelsConfigurationService = new class extends mock<ILanguageModelsConfigurationService>() {
		override readonly onDidChangeLanguageModelGroups = onDidChangeGroups;
		override readonly whenReady = Promise.resolve();
		override getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[] {
			return models.groups;
		}
	};
	return { languageModelsService, languageModelsConfigurationService };
}

suite('AgentHostModelSourceRegistrar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRegistrar(options: { readonly kind?: AgentHostClientConnectionKind; readonly formats?: readonly string[]; readonly models?: readonly { readonly id: string; readonly url: string }[]; readonly existing?: readonly ModelSourceRegistration[] } = {}) {
		const disposables = store.add(new DisposableStore());
		const root = disposables.add(new FakeRootSubscription({
			agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { modelSourceRegistration: { formats: [...options.formats ?? [BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT]] } } }],
			activeSessions: 0,
			modelSourceRegistrations: [...options.existing ?? []],
		}));
		const connection = new FakeConnection(root, options.kind ?? AgentHostClientConnectionKind.Local);
		const onDidChangeGroups = disposables.add(new Emitter<readonly ILanguageModelsProviderGroup[]>());
		const configuredModels = options.models ?? [{ id: 'gpt-x', url: PUBLIC_URL }];
		const models: IFakeLanguageModels = {
			groups: [{ name: 'Example', vendor: 'customendpoint', apiKey: '${input:chat.lm.secret.first}', models: configuredModels.map(model => ({ ...model, toolCalling: true })) }],
			metadata: new Map(configuredModels.map(model => [`customendpoint/Example/${model.id}`, metadataOf('customendpoint', model.id)])),
			resolvedVendors: new Set(['customendpoint']),
			keys: new Map([['customendpoint/Example', 'key-1']]),
			failedGroups: new Set(),
		};
		const { languageModelsService, languageModelsConfigurationService } = createLanguageModelServices(models, onDidChangeGroups.event);
		const configurationService = new TestConfigurationService({ [AgentHostByokDirectEndpointsSettingId]: true });
		const notificationService = new PromptRecorder();
		const storageService = disposables.add(new InMemoryStorageService());
		// Windows of one installation share an installation ID.
		storageService.store('chat.agentHost.byokModelSources.installationId', 'installation', StorageScope.APPLICATION, StorageTarget.MACHINE);
		const statusService = disposables.add(new AgentHostModelSourceStatusService());

		const registrar = disposables.add(new AgentHostModelSourceRegistrar(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeConnections = Event.None;
				override readonly connections: readonly IAgentHostConnectionInfo[] = [{ authority: 'host', address: options.kind && options.kind !== AgentHostClientConnectionKind.Local ? 'devbox.example.test:8080' : undefined, name: 'Dev Box', isAmbient: true, connection }];
			},
			languageModelsService,
			languageModelsConfigurationService,
			new class extends mock<IChatEntitlementService>() {
				override readonly clientByokEnabled = true;
				override readonly sentiment = { hidden: false };
				override readonly onDidChangeSentiment = Event.None;
			},
			configurationService,
			new MockContextKeyService(),
			notificationService,
			storageService,
			new class extends mock<IUserDataProfileService>() {
				override readonly currentProfile = new class extends mock<IUserDataProfile>() {
					override readonly id = 'profile';
				};
			},
			new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly remoteAuthority = undefined;
			},
			statusService,
			new NullLogService(),
		));
		const registrations = () => root.value.modelSourceRegistrations ?? [];
		return {
			registrar, connection, root, models, configurationService, notificationService, statusService, registrations,
			replaceKey(reference: string, value: string) {
				models.groups[0] = { ...models.groups[0], apiKey: reference };
				models.keys.set('customendpoint/Example', value);
				onDidChangeGroups.fire(models.groups);
			},
			refreshGroups() {
				onDidChangeGroups.fire(models.groups);
			},
			async setEnabled(enabled: boolean, setting = AgentHostByokDirectEndpointsSettingId) {
				await configurationService.setUserConfiguration(setting, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire({ source: ConfigurationTarget.USER, affectedKeys: new Set([setting]), change: { keys: [setting], overrides: [] }, affectsConfiguration: section => section === setting });
			},
		};
	}

	test('registers each provider group with the local host, delivers its key, and withdraws it when turned off', async () => {
		const { connection, root, registrations, replaceKey, setEnabled, statusService } = createRegistrar();
		await timeout(0);
		const registration = registrations()[0];

		root.report(registration.id, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required }, 'nonce-1');
		await timeout(0);
		const firstCredentialId = connection.keys[0]?.credentialId;
		root.report(registration.id, { kind: ModelSourceStatus.Ready }, 'nonce-2', { credentialId: firstCredentialId });
		const served = [...statusService.locallyServedModels];
		// A key the endpoint rejected is not sent again until the user replaces it.
		root.report(registration.id, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Rejected }, 'nonce-3', { credentialId: firstCredentialId });
		await timeout(0);
		const keysBeforeReplacement = connection.keys.length;
		replaceKey('${input:chat.lm.secret.second}', 'key-2');
		await timeout(0);

		await setEnabled(false);

		assert.deepStrictEqual({
			registration: { ...registration, id: parseByokModelSourceId(registration.id) },
			served,
			keysBeforeReplacement,
			keys: connection.keys.map(key => ({ ...key, credentialId: key.credentialId === firstCredentialId ? 'first' : key.credentialId ? 'replaced' : undefined })),
			actions: connection.actions.map(action => action.type),
			remaining: registrations(),
			servedAfterRemoval: [...statusService.locallyServedModels],
		}, {
			registration: {
				id: { vendor: 'customendpoint', group: 'Example' },
				provider: 'copilotcli',
				displayName: 'Example',
				format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT,
				definition: {
					models: [{ id: 'gpt-x', name: 'GPT-X', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1' }, toolCalling: true, maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120, aliases: ['customendpoint/Example/gpt-x'] }],
					requiresCredential: true,
				},
				contributingClientIds: ['window-1'],
				// The local host is shared by the user's windows, so the source outlives this one.
				retention: ModelSourceRetentionPolicy.Host,
			},
			// While the host serves it, the bridge doesn't list it.
			served: ['customendpoint/Example/gpt-x'],
			keysBeforeReplacement: 1,
			// The host publishes the ID of the key it holds, so a replaced key is sent without registering again.
			keys: [{ token: 'key-1', nonce: 'nonce-1', credentialId: 'first' }, { token: 'key-2', nonce: 'nonce-3', credentialId: 'replaced' }],
			actions: [ActionType.RootModelSourceRegistrationSet, ActionType.RootModelSourceRegistrationRemoved],
			remaining: [],
			servedAfterRemoval: [],
		});
	});

	test('registers nothing with a host whose agents don\'t read the format, and never sends the key for another copy of the group', async () => {
		const unsupported = createRegistrar({ formats: ['example.test/other@1'] });
		const supported = createRegistrar();
		await timeout(0);
		// Another window replaced the registration with a different endpoint.
		const current = supported.registrations()[0];
		const { contributingClientIds: _, ...copy } = current;
		supported.root.apply({ type: ActionType.RootModelSourceRegistrationSet, clientId: 'other-window', registration: { ...copy, definition: { ...current.definition, models: [{ id: 'gpt-x', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://elsewhere.example.test/v1' } }] } } });
		supported.root.report(current.id, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required }, 'nonce-1', { resource: 'https://elsewhere.example.test/v1', origins: ['https://elsewhere.example.test'] });
		await timeout(0);

		assert.deepStrictEqual({
			unsupportedActions: unsupported.connection.actions.length,
			supportedActions: supported.connection.actions.length,
			keys: supported.connection.keys,
		}, {
			unsupportedActions: 0,
			supportedActions: 1,
			keys: [],
		});
	});

	test('asks before using a remote host, and registers only the endpoints it can reach', async () => {
		const remote = createRegistrar({ kind: AgentHostClientConnectionKind.SSH, models: [{ id: 'public', url: PUBLIC_URL }, { id: 'private', url: PRIVATE_URL }] });
		const relayed = createRegistrar({ kind: AgentHostClientConnectionKind.WebPubSub });
		await timeout(0);
		const beforeConsent = remote.registrations().length;
		remote.notificationService.prompts[0].choices[0].run();
		await timeout(0);

		assert.deepStrictEqual({
			beforeConsent,
			prompts: remote.notificationService.prompts.length,
			models: remote.registrations().map(registration => ({ models: registration.definition.models, retention: registration.retention })),
			relayed: { prompts: relayed.notificationService.prompts.length, actions: relayed.connection.actions.length },
		}, {
			beforeConsent: 0,
			prompts: 1,
			models: [{
				models: [{ id: 'public', name: 'PUBLIC', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1' }, toolCalling: true, maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120, aliases: ['customendpoint/Example/public'] }],
				// A remote host's registrations leave with this window.
				retention: ModelSourceRetentionPolicy.ContributingClient,
			}],
			// A relay could read the keys.
			relayed: { prompts: 0, actions: 0 },
		});
	});

	test('a window turned off by its own settings withdraws only its contribution, and keeps a group whose models failed to list', async () => {
		const { connection, root, models, registrations, refreshGroups, setEnabled } = createRegistrar();
		await timeout(0);
		const registration = registrations()[0];
		const { contributingClientIds: _, ...copy } = registration;
		// Another window of the profile contributes the same group.
		root.apply({ type: ActionType.RootModelSourceRegistrationSet, clientId: 'window-2', registration: copy });
		models.failedGroups!.add('customendpoint/Example');
		refreshGroups();
		const afterFailedListing = registrations()[0].contributingClientIds;

		await setEnabled(false, AgentHostByokModelsEnabledSettingId);

		assert.deepStrictEqual({
			afterFailedListing,
			actions: connection.actions.map(action => action.type),
			remaining: registrations().map(candidate => candidate.contributingClientIds),
		}, {
			afterFailedListing: ['window-1', 'window-2'],
			actions: [ActionType.RootModelSourceRegistrationSet, ActionType.RootModelSourceContributorRemoved],
			remaining: [['window-2']],
		});
	});

	test('asks again for a key it could not read', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { connection, root, models, registrations } = createRegistrar();
		await timeout(0);
		models.keys.delete('customendpoint/Example');
		root.report(registrations()[0].id, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required }, 'nonce-1');
		await timeout(0);
		const keysWhileUnreadable = connection.keys.length;
		models.keys.set('customendpoint/Example', 'key-1');
		await timeout(5_000);

		assert.deepStrictEqual({ keysWhileUnreadable, keys: connection.keys.map(key => ({ token: key.token, nonce: key.nonce })) }, {
			keysWhileUnreadable: 0,
			keys: [{ token: 'key-1', nonce: 'nonce-1' }],
		});
	}));

	test('removes registrations it left behind, but not another profile\'s', async () => {
		const stale = (id: string): ModelSourceRegistration => ({ id, provider: 'copilotcli', displayName: 'Gone', format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, definition: { models: [], requiresCredential: false }, retention: ModelSourceRetentionPolicy.Host });
		const namespace = getByokModelSourceNamespace('installation', 'profile');
		const { registrations } = createRegistrar({ existing: [stale(`${namespace}copilotcli/customendpoint/Gone`), stale('vscode.byok/other-profile/copilotcli/customendpoint/Gone')] });
		await timeout(0);

		assert.deepStrictEqual(registrations().map(registration => registration.id.replace(namespace, '<own>/')), [
			'vscode.byok/other-profile/copilotcli/customendpoint/Gone',
			'<own>/copilotcli/customendpoint/Example',
		]);
	});
});

suite('getByokModelSources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps each vendor\'s provider groups by the rules of its provider, and keeps a reloading vendor\'s sources', () => {
		const models: IFakeLanguageModels = {
			groups: [
				{ name: 'Grok', vendor: 'xai', apiKey: '${input:chat.lm.secret.xai}' },
				// The key is still in the extension's own storage, so the runtime couldn't authenticate.
				{ name: 'Legacy', vendor: 'xai' },
				{ name: 'Router', vendor: 'openrouter', apiKey: '${input:chat.lm.secret.router}' },
				{ name: 'Local', vendor: 'ollama' },
				{ name: 'Foundry', vendor: 'azure', models: [{ id: 'gpt-4o', url: 'https://r.openai.azure.com' }] },
				{ name: 'Keyed', vendor: 'azure', apiKey: '${input:chat.lm.secret.azure}', models: [{ id: 'gpt-4o', url: 'https://r.openai.azure.com' }] },
				{ name: 'Gemini', vendor: 'gemini', apiKey: '${input:chat.lm.secret.gemini}' },
			],
			metadata: new Map([
				['xai/Grok/grok-4', metadataOf('xai', 'grok-4', { capabilities: { toolCalling: true, vision: false } })],
				['xai/Legacy/grok-4', metadataOf('xai', 'grok-4')],
				['openrouter/Router/openai/gpt-5', metadataOf('openrouter', 'openai/gpt-5')],
				['openrouter/Router/anthropic/claude', metadataOf('openrouter', 'anthropic/claude')],
				['ollama/Local/llama', metadataOf('ollama', 'llama')],
				['azure/Foundry/gpt-4o', metadataOf('azure', 'gpt-4o')],
				['azure/Keyed/gpt-4o', metadataOf('azure', 'gpt-4o')],
				['gemini/Gemini/gemini-3', metadataOf('gemini', 'gemini-3')],
			]),
			resolvedVendors: new Set(['xai', 'openrouter', 'ollama', 'azure', 'gemini']),
			keys: new Map(),
		};
		const { languageModelsService, languageModelsConfigurationService } = createLanguageModelServices(models);
		const sources = getByokModelSources(languageModelsService, languageModelsConfigurationService, new NullLogService());
		const summary = (list: typeof sources) => list.map(source => ({ group: `${source.vendor}/${source.group}`, requiresCredential: source.definition.requiresCredential, models: source.definition.models.map(model => ({ id: model.id, endpoint: model.endpoint })) }));

		models.resolvedVendors.delete('xai');
		const reloading = getByokModelSources(languageModelsService, languageModelsConfigurationService, new NullLogService(), sources);

		assert.deepStrictEqual({ sources: summary(sources), whileXaiReloads: reloading.map(source => `${source.vendor}/${source.group}`) }, {
			sources: [
				{ group: 'azure/Keyed', requiresCredential: true, models: [{ id: 'gpt-4o', endpoint: { type: 'azure', wireApi: 'completions', baseUrl: 'https://r.openai.azure.com/openai/deployments/gpt-4o', azureApiVersion: '2025-01-01-preview' } }] },
				{ group: 'xai/Grok', requiresCredential: true, models: [{ id: 'grok-4', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.x.ai/v1' } }] },
				{ group: 'openrouter/Router', requiresCredential: true, models: [{ id: 'openai/gpt-5', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://openrouter.ai/api/v1' } }] },
				{ group: 'ollama/Local', requiresCredential: false, models: [{ id: 'llama', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'http://localhost:11434/v1' } }] },
			],
			whileXaiReloads: ['azure/Keyed', 'xai/Grok', 'openrouter/Router', 'ollama/Local'],
		});
	});

	test('a remote agent host gets only public https endpoints', () => {
		const urls = ['https://api.example.test/v1', 'http://api.example.test/v1', 'https://localhost:8000', 'https://127.0.0.1', 'https://10.1.2.3', 'https://172.20.0.1', 'https://192.168.1.2', 'https://169.254.169.254', 'https://[::1]', 'https://[fd00::1]', 'https://intranet', 'https://gpu.local', 'https://8.8.8.8'];
		assert.deepStrictEqual(urls.filter(isReachableFromRemoteAgentHost), ['https://api.example.test/v1', 'https://8.8.8.8']);
	});
});
