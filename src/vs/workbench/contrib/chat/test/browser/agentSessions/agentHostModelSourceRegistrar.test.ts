/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { AuthenticateParams, AuthenticateResult } from '../../../../../../platform/agentHost/common/agent.js';
import { AgentHostByokDirectEndpointsSettingId, AgentHostByokModelsEnabledSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, type IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, getByokModelSourceId, MAX_BYOK_ENDPOINTS_MODELS, readByokEndpointsDefinition } from '../../../../../../platform/agentHost/common/byokModelSource.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { RootModelSourceRegisterRequestedAction } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSource, type ModelSourceState, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, type ActionEnvelope, type ClientModelSourceAction, type RootAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { rootReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationHandle, IPromptChoice, NotificationMessage, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentHostModelSourceRegistrar, AgentHostModelSourceStatusService, getByokModelSources, isReachableFromRemoteAgentHost } from '../../../browser/agentSessions/agentHost/agentHostModelSourceRegistrar.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata, type ILanguageModelsGroup } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService, type ILanguageModelsProviderGroup } from '../../../common/languageModelsConfiguration.js';

const PUBLIC_URL = 'https://models.example.test/v1/chat/completions';
const PRIVATE_URL = 'http://10.0.0.5:8000/v1/chat/completions';
const SOURCE_ID = getByokModelSourceId('copilotcli', { vendor: 'customendpoint', group: 'Example' });

class FakeRootSubscription implements IAgentSubscription<RootState> {
	private readonly _onDidChange = new Emitter<RootState>();
	readonly onDidChange = this._onDidChange.event;
	private readonly _onDidApplySnapshot = new Emitter<RootState>();
	readonly onDidApplySnapshot = this._onDidApplySnapshot.event;
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

	/** Applies a snapshot, as after a reconnect. */
	snapshot(): void {
		this._onDidApplySnapshot.fire(this.value);
	}

	/** Reports a source's status, as the host does: it publishes the whole source again. */
	report(state: ModelSourceState, options: { readonly id?: string; readonly resource?: string; readonly accountId?: string } = {}): void {
		const current = this.value.modelSources?.find(modelSource => modelSource.id === (options.id ?? SOURCE_ID));
		assert.ok(current);
		const { accountId: _accountId, ...rest } = current;
		this.apply({ type: ActionType.RootModelSourceSet, modelSource: { ...rest, state, credentialResource: { resource: options.resource ?? 'https://models.example.test/v1' }, ...(options.accountId ? { accountId: options.accountId } : {}) } });
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._onDidApplySnapshot.dispose();
	}
}

/**
 * An agent host connection that records delivered keys and handles model source requests as a host does: it
 * publishes a requested source with `root/modelSourceSet`, keeping its status and key when the registration is
 * unchanged. A host may confirm a request before it publishes the source.
 */
class FakeConnection extends mock<IAgentConnection>() {
	readonly actions: ClientModelSourceAction[] = [];
	readonly keys: { readonly token: string; readonly accountId: string | undefined }[] = [];
	override readonly clientId = 'window-1';
	private readonly _pending: RootModelSourceRegisterRequestedAction[] = [];

	constructor(override readonly rootState: FakeRootSubscription, override readonly clientConnectionKind: AgentHostClientConnectionKind, private readonly _publishAfterConfirming = false) {
		super();
	}

	override dispatch(_channel: string, action: ClientModelSourceAction): void {
		this.actions.push(action);
		if (action.type === ActionType.RootModelSourceRemoved) {
			this.rootState.apply(action);
		} else if (this._publishAfterConfirming) {
			this._pending.push(action);
		} else {
			this._publish(action);
		}
	}

	override async dispatchConfirmed<T>(channel: string, _subscription: IAgentSubscription<T>, action: ClientModelSourceAction): Promise<ActionEnvelope> {
		this.dispatch(channel, action);
		return { channel, action, serverSeq: this.actions.length, origin: { clientId: this.clientId, clientSeq: this.actions.length } };
	}

	/** Publishes the sources a host that confirms first hasn't published yet. */
	publishPending(): void {
		for (const request of this._pending.splice(0)) {
			this._publish(request);
		}
	}

	private _publish({ modelSourceId, provider, displayName, registration }: RootModelSourceRegisterRequestedAction): void {
		const existing = this.rootState.value.modelSources?.find(modelSource => modelSource.id === modelSourceId);
		const unchanged = existing?.provider === provider && existing.registration?.format === registration.format && JSON.stringify(existing.registration.definition) === JSON.stringify(registration.definition);
		this.rootState.apply({
			type: ActionType.RootModelSourceSet,
			modelSource: unchanged ? { ...existing, displayName, registration } : { id: modelSourceId, provider, displayName, registration, state: { kind: ModelSourceStatus.Starting } },
		});
	}

	override async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		this.keys.push({ token: params.token, accountId: params.accountId });
		return { authenticated: true };
	}

	/** The retention of each registration this window requested. */
	get retentions(): (ModelSourceRetentionPolicy | undefined)[] {
		return this.actions.flatMap(action => action.type === ActionType.RootModelSourceRegisterRequested ? [action.retention] : []);
	}

	/** The definitions this window registered. */
	get definitions(): (Record<string, unknown> | undefined)[] {
		return this.actions.flatMap(action => action.type === ActionType.RootModelSourceRegisterRequested ? [action.registration.definition] : []);
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

	function createRegistrar(options: { readonly kind?: AgentHostClientConnectionKind; readonly formats?: readonly string[]; readonly models?: readonly { readonly id: string; readonly url: string }[]; readonly existing?: readonly ModelSource[]; readonly publishAfterConfirming?: boolean } = {}) {
		const disposables = store.add(new DisposableStore());
		const root = disposables.add(new FakeRootSubscription({
			agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { modelSourceRegistration: { formats: (options.formats ?? [BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT]).map(format => ({ format })) } } }],
			activeSessions: 0,
			modelSources: [...options.existing ?? []],
		}));
		const connection = new FakeConnection(root, options.kind ?? AgentHostClientConnectionKind.Local, options.publishAfterConfirming);
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
			disposables.add(new InMemoryStorageService()),
			new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly remoteAuthority = undefined;
			},
			statusService,
			new NullLogService(),
		));
		const modelSources = () => root.value.modelSources ?? [];
		return {
			registrar, connection, root, models, notificationService, statusService, modelSources,
			changeGroups(change: () => void) {
				change();
				onDidChangeGroups.fire(models.groups);
			},
			async setEnabled(enabled: boolean, setting = AgentHostByokDirectEndpointsSettingId) {
				await configurationService.setUserConfiguration(setting, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire({ source: ConfigurationTarget.USER, affectedKeys: new Set([setting]), change: { keys: [setting], overrides: [] }, affectsConfiguration: section => section === setting });
			},
		};
	}

	/**
	 * The source as another window or device registered it, with another definition that keeps this window's
	 * credential resource but adds an endpoint elsewhere.
	 */
	function otherCopy(modelSource: ModelSource): ModelSource {
		assert.ok(modelSource.registration);
		const definition = readByokEndpointsDefinition(modelSource.registration.definition);
		return {
			...modelSource,
			registration: { ...modelSource.registration, definition: { ...definition, models: [...definition.models, { id: 'gpt-z', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://elsewhere.example.test/v1' } }] } },
			state: { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required },
			credentialResource: { resource: 'https://models.example.test/v1' },
		};
	}

	test('registers each provider group with the local host, delivers its key, and removes it when turned off', async () => {
		const { connection, root, modelSources, changeGroups, setEnabled, statusService, models } = createRegistrar();
		await timeout(0);
		const registered = modelSources()[0];

		root.report({ kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required });
		await timeout(0);
		const first = connection.keys[0]?.accountId;
		root.report({ kind: ModelSourceStatus.Ready }, { accountId: first });
		const served = [...statusService.locallyServedModels];
		// The endpoint refused the key: it is not sent again until the user replaces it.
		root.report({ kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Rejected }, { accountId: first });
		await timeout(0);
		const keysBeforeReplacement = connection.keys.length;
		changeGroups(() => {
			models.groups[0] = { ...models.groups[0], apiKey: '${input:chat.lm.secret.second}' };
			models.keys.set('customendpoint/Example', 'key-2');
		});
		await timeout(0);

		await setEnabled(false);

		assert.deepStrictEqual({
			registered,
			retentions: connection.retentions,
			served,
			keysBeforeReplacement,
			keys: connection.keys.map(key => ({ ...key, accountId: key.accountId === first ? 'first' : key.accountId ? 'replaced' : undefined })),
			actions: connection.actions.map(action => action.type),
			remaining: modelSources(),
			servedAfterRemoval: [...statusService.locallyServedModels],
		}, {
			registered: {
				id: SOURCE_ID, provider: 'copilotcli', displayName: 'Example', state: { kind: ModelSourceStatus.Starting },
				registration: {
					format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT,
					definition: {
						models: [{ id: 'gpt-x', name: 'GPT-X', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1' }, toolCalling: true, maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120, aliases: ['customendpoint/Example/gpt-x'] }],
						requiresCredential: true,
					},
				},
			},
			// The local host is shared by this user's windows, so the source outlives the window that registered it.
			retentions: [ModelSourceRetentionPolicy.Host],
			// While the host serves it, the bridge doesn't list it.
			served: ['customendpoint/Example/gpt-x'],
			keysBeforeReplacement: 1,
			keys: [{ token: 'key-1', accountId: 'first' }, { token: 'key-2', accountId: 'replaced' }],
			actions: [ActionType.RootModelSourceRegisterRequested, ActionType.RootModelSourceRemoved],
			remaining: [],
			servedAfterRemoval: [],
		});
	});

	test('registers an unchanged source again to contribute it, and leaves another client\'s definition and key alone', async () => {
		const probe = createRegistrar();
		await timeout(0);
		const ours = probe.modelSources()[0];
		const differing = otherCopy(ours);
		const unchanged = createRegistrar({ existing: [{ ...ours, state: { kind: ModelSourceStatus.Ready }, credentialResource: { resource: 'https://models.example.test/v1' }, accountId: 'another-device-key' }] });
		const different = createRegistrar({ existing: [differing] });
		const unsupported = createRegistrar({ formats: ['example.test/other@1'] });
		await timeout(0);

		assert.deepStrictEqual({
			unchanged: { actions: unchanged.connection.actions.map(action => action.type), state: unchanged.modelSources()[0].state, keys: unchanged.connection.keys.length },
			different: { actions: different.connection.actions.length, registration: different.modelSources()[0].registration, keys: different.connection.keys.length },
			unsupported: unsupported.connection.actions.length,
		}, {
			// Registering it again keeps its status and the key another device delivered, which differs but wasn't replaced here.
			unchanged: { actions: [ActionType.RootModelSourceRegisterRequested], state: { kind: ModelSourceStatus.Ready }, keys: 0 },
			// Updating it unprompted would make the two clients replace each other's source indefinitely, and the key would reach its endpoint.
			different: { actions: 0, registration: differing.registration, keys: 0 },
			unsupported: 0,
		});
	});

	test('registers a changed group again when another window already registered the same change', async () => {
		const changed = [{ id: 'gpt-x', url: PUBLIC_URL }, { id: 'gpt-y', url: PUBLIC_URL }];
		const probe = createRegistrar({ models: changed });
		await timeout(0);
		const updated = probe.modelSources()[0];
		const { connection, root, models, changeGroups } = createRegistrar();
		await timeout(0);

		// Another window registers the change first, which makes it the source's only contributor.
		root.apply({ type: ActionType.RootModelSourceSet, modelSource: updated });
		changeGroups(() => {
			models.groups[0] = { ...models.groups[0], models: changed.map(model => ({ ...model, toolCalling: true })) };
			models.metadata.set('customendpoint/Example/gpt-y', metadataOf('customendpoint', 'gpt-y'));
		});
		await timeout(0);

		assert.deepStrictEqual(connection.actions.map(action => action.type === ActionType.RootModelSourceRegisterRequested && JSON.stringify(action.registration) === JSON.stringify(updated.registration)), [false, true]);
	});

	test('never sends a key for a host definition that would send it elsewhere, even with the same credential resource', async () => {
		const { connection, root, modelSources } = createRegistrar();
		await timeout(0);
		root.apply({ type: ActionType.RootModelSourceSet, modelSource: otherCopy(modelSources()[0]) });
		await timeout(0);

		assert.deepStrictEqual({ actions: connection.actions.length, keys: connection.keys.length }, { actions: 1, keys: 0 });
	});

	test('waits for a host that confirms a registration before it publishes the source', async () => {
		const { connection, root, modelSources } = createRegistrar({ publishAfterConfirming: true });
		await timeout(0);
		const beforePublication = { actions: connection.actions.length, sources: modelSources().length };
		connection.publishPending();
		root.report({ kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required });
		await timeout(0);

		assert.deepStrictEqual({ beforePublication, actions: connection.actions.map(action => action.type), keys: connection.keys.map(key => key.token) }, {
			beforePublication: { actions: 1, sources: 0 },
			// The confirmed request isn't mistaken for a source another client removed, or sent again.
			actions: [ActionType.RootModelSourceRegisterRequested],
			keys: ['key-1'],
		});
	});

	test('adds back a source another client removed only after reconnecting, and removes one the user deleted', async () => {
		const { connection, root, modelSources, changeGroups, models } = createRegistrar();
		await timeout(0);
		root.apply({ type: ActionType.RootModelSourceRemoved, modelSourceId: SOURCE_ID });
		await timeout(0);
		const afterRemovalElsewhere = modelSources().length;
		root.snapshot();
		await timeout(0);
		const afterReconnect = modelSources().length;
		changeGroups(() => models.groups.splice(0, 1));
		await timeout(0);

		assert.deepStrictEqual({ afterRemovalElsewhere, afterReconnect, actions: connection.actions.map(action => action.type), remaining: modelSources().length }, {
			afterRemovalElsewhere: 0,
			afterReconnect: 1,
			actions: [ActionType.RootModelSourceRegisterRequested, ActionType.RootModelSourceRegisterRequested, ActionType.RootModelSourceRemoved],
			remaining: 0,
		});
	});

	test('a window turned off by its own settings leaves the source to others, and a group whose models failed to list keeps it', async () => {
		const { connection, models, modelSources, changeGroups, setEnabled } = createRegistrar();
		await timeout(0);
		changeGroups(() => models.failedGroups!.add('customendpoint/Example'));
		await timeout(0);
		await setEnabled(false, AgentHostByokModelsEnabledSettingId);

		assert.deepStrictEqual({ actions: connection.actions.map(action => action.type), remaining: modelSources().length }, {
			actions: [ActionType.RootModelSourceRegisterRequested],
			remaining: 1,
		});
	});

	test('asks again for a key it could not read once the host\'s state changes', async () => {
		const { connection, root, models } = createRegistrar();
		await timeout(0);
		models.keys.delete('customendpoint/Example');
		root.report({ kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required });
		await timeout(0);
		const keysWhileUnreadable = connection.keys.length;
		models.keys.set('customendpoint/Example', 'key-1');
		// A reconnect, for example.
		root.snapshot();
		await timeout(0);

		assert.deepStrictEqual({ keysWhileUnreadable, keys: connection.keys.map(key => key.token) }, {
			keysWhileUnreadable: 0,
			keys: ['key-1'],
		});
	});

	test('asks before using a remote host, and registers only the endpoints it can reach', async () => {
		const remote = createRegistrar({ kind: AgentHostClientConnectionKind.SSH, models: [{ id: 'public', url: PUBLIC_URL }, { id: 'private', url: PRIVATE_URL }] });
		const relayed = createRegistrar({ kind: AgentHostClientConnectionKind.WebPubSub });
		await timeout(0);
		const beforeConsent = remote.modelSources().length;
		const servingBeforeConsent = remote.statusService.isServing('host');
		remote.notificationService.prompts[0].choices[0].run();
		await timeout(0);
		const servingWhileStarting = remote.statusService.isServing('host');
		remote.root.report({ kind: ModelSourceStatus.Error, error: { errorType: 'invalidDefinition', message: 'Declined' } });

		assert.deepStrictEqual({
			beforeConsent,
			prompts: remote.notificationService.prompts.length,
			definitions: remote.connection.definitions,
			retention: remote.connection.retentions,
			// The editor warns that BYOK models are missing unless the host serves them, or is setting them up.
			serving: [servingBeforeConsent, servingWhileStarting, remote.statusService.isServing('host')],
			relayed: { prompts: relayed.notificationService.prompts.length, actions: relayed.connection.actions.length, serving: relayed.statusService.isServing('host') },
		}, {
			beforeConsent: 0,
			prompts: 1,
			definitions: [{
				models: [{ id: 'public', name: 'PUBLIC', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1' }, toolCalling: true, maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120, aliases: ['customendpoint/Example/public'] }],
				requiresCredential: true,
			}],
			// A remote host's sources leave with this window.
			retention: [ModelSourceRetentionPolicy.ContributingClient],
			serving: [false, true, false],
			// A relay could read the keys.
			relayed: { prompts: 0, actions: 0, serving: false },
		});
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
				{ name: 'OpenAI', vendor: 'openai', apiKey: '${input:chat.lm.secret.openai}' },
				{ name: 'Claude', vendor: 'anthropic', apiKey: '${input:chat.lm.secret.anthropic}' },
			],
			metadata: new Map([
				['xai/Grok/grok-4', metadataOf('xai', 'grok-4', { capabilities: { toolCalling: true, vision: false } })],
				['xai/Legacy/grok-4', metadataOf('xai', 'grok-4')],
				['openrouter/Router/openai/gpt-5', metadataOf('openrouter', 'openai/gpt-5')],
				['openrouter/Router/anthropic/claude', metadataOf('openrouter', 'anthropic/claude')],
				['ollama/Local/llama', metadataOf('ollama', 'llama')],
				['azure/Foundry/gpt-4o', metadataOf('azure', 'gpt-4o')],
				['azure/Keyed/gpt-4o', metadataOf('azure', 'gpt-4o')],
				['gemini/Gemini/models/gemini-3', metadataOf('gemini', 'models/gemini-3')],
				// Only a reasoning model offers an effort level; the others are called with Chat Completions.
				['openai/OpenAI/gpt-5', metadataOf('openai', 'gpt-5', { configurationSchema: { properties: { reasoningEffort: { type: 'string', enum: ['low', 'high'] } } } })],
				['openai/OpenAI/gpt-4.1', metadataOf('openai', 'gpt-4.1')],
				['anthropic/Claude/claude-sonnet-4-5', metadataOf('anthropic', 'claude-sonnet-4-5')],
			]),
			resolvedVendors: new Set(['xai', 'openrouter', 'ollama', 'azure', 'gemini', 'openai', 'anthropic']),
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
				{
					group: 'openai/OpenAI', requiresCredential: true, models: [
						{ id: 'gpt-4.1', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.openai.com/v1' } },
						{ id: 'gpt-5', endpoint: { type: 'openai', wireApi: 'responses', baseUrl: 'https://api.openai.com/v1' } },
					]
				},
				{ group: 'anthropic/Claude', requiresCredential: true, models: [{ id: 'claude-sonnet-4-5', endpoint: { type: 'anthropic', baseUrl: 'https://api.anthropic.com' } }] },
				{ group: 'gemini/Gemini', requiresCredential: true, models: [{ id: 'gemini-3', endpoint: { type: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' } }] },
				{ group: 'xai/Grok', requiresCredential: true, models: [{ id: 'grok-4', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.x.ai/v1' } }] },
				{ group: 'openrouter/Router', requiresCredential: true, models: [{ id: 'openai/gpt-5', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://openrouter.ai/api/v1' } }] },
				{ group: 'ollama/Local', requiresCredential: false, models: [{ id: 'llama', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'http://localhost:11434/v1' } }] },
			],
			whileXaiReloads: ['azure/Keyed', 'openai/OpenAI', 'anthropic/Claude', 'gemini/Gemini', 'xai/Grok', 'openrouter/Router', 'ollama/Local'],
		});
	});

	test('registers at most the models a definition holds, leaving the rest on the bridge', () => {
		const ids = Array.from({ length: MAX_BYOK_ENDPOINTS_MODELS + 1 }, (_, index) => `vendor/model-${String(index).padStart(4, '0')}`);
		const models: IFakeLanguageModels = {
			groups: [{ name: 'Router', vendor: 'openrouter', apiKey: '${input:chat.lm.secret.router}' }],
			metadata: new Map(ids.map(id => [`openrouter/Router/${id}`, metadataOf('openrouter', id)])),
			resolvedVendors: new Set(['openrouter']),
			keys: new Map(),
		};
		const { languageModelsService, languageModelsConfigurationService } = createLanguageModelServices(models);
		const [source] = getByokModelSources(languageModelsService, languageModelsConfigurationService, new NullLogService());

		assert.deepStrictEqual({ count: source.definition.models.length, last: source.definition.models.at(-1)?.id }, { count: MAX_BYOK_ENDPOINTS_MODELS, last: ids.at(-2) });
	});

	test('a remote agent host gets only public https endpoints', () => {
		const urls = ['https://api.example.test/v1', 'http://api.example.test/v1', 'https://localhost:8000', 'https://127.0.0.1', 'https://10.1.2.3', 'https://172.20.0.1', 'https://192.168.1.2', 'https://169.254.169.254', 'https://[::1]', 'https://[fd00::1]', 'https://intranet', 'https://gpu.local', 'https://8.8.8.8'];
		assert.deepStrictEqual(urls.filter(isReachableFromRemoteAgentHost), ['https://api.example.test/v1', 'https://8.8.8.8']);
	});
});
