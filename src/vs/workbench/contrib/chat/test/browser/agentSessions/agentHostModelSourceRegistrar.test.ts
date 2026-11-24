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
import { AgentHostByokCustomEndpointDirectSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, type IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT } from '../../../../../../platform/agentHost/common/byokCustomEndpoint.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ModelSourceStatus, type ModelSourceState, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, AuthRequiredReason, type ActionEnvelope, type ClientModelSourceAction, type RootAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { rootReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { AgentHostModelSourceRegistrar, getCustomEndpointModelSourceId } from '../../../browser/agentSessions/agentHost/agentHostModelSourceRegistrar.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata, type ILanguageModelsGroup } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService, type ILanguageModelsProviderGroup } from '../../../common/languageModelsConfiguration.js';

const MODEL_URL = 'https://models.example.test/v1/chat/completions';
const SOURCE_ID = getCustomEndpointModelSourceId('copilotcli', 'Example');

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
	report(state: ModelSourceState, credentialNonce: string): void {
		this.apply({ type: ActionType.RootModelSourceStateChanged, id: SOURCE_ID, state, credentialNonce, credentialResource: { resource: MODEL_URL } });
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

/** An agent host connection that applies registrations to its root state and records delivered keys. */
class FakeConnection extends mock<IAgentConnection>() {
	readonly actions: ClientModelSourceAction[] = [];
	readonly keys: { readonly token: string; readonly nonce: string | undefined }[] = [];
	override readonly clientId = 'window-1';
	override readonly clientConnectionKind = AgentHostClientConnectionKind.Local;

	constructor(override readonly rootState: FakeRootSubscription) {
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
		this.keys.push({ token: params.token, nonce: params.target?.kind === 'modelSource' ? params.target.credentialNonce : undefined });
		return { authenticated: true };
	}
}

suite('AgentHostModelSourceRegistrar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRegistrar(options: { readonly formats: readonly string[] }) {
		const disposables = store.add(new DisposableStore());
		const root = disposables.add(new FakeRootSubscription({ agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], capabilities: { modelSourceRegistration: { formats: [...options.formats] } } }], activeSessions: 0 }));
		const connection = new FakeConnection(root);
		const onDidChangeGroups = disposables.add(new Emitter<readonly ILanguageModelsProviderGroup[]>());
		let group: ILanguageModelsProviderGroup = { name: 'Example', vendor: 'customendpoint', apiKey: '${input:chat.lm.secret.first}', models: [{ id: 'gpt-x', name: 'GPT X', url: MODEL_URL, toolCalling: true }] };
		let key = 'key-1';
		const metadata: ILanguageModelChatMetadata = { extension: new ExtensionIdentifier('test.copilot'), name: 'GPT X', id: 'gpt-x', vendor: 'customendpoint', version: '1', family: 'gpt-x', maxInputTokens: 100, maxOutputTokens: 20, isDefaultForLocation: {}, isBYOK: true };
		const configurationService = new TestConfigurationService({ [AgentHostByokCustomEndpointDirectSettingId]: true });

		const registrar = disposables.add(new AgentHostModelSourceRegistrar(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeConnections = Event.None;
				override readonly connections: readonly IAgentHostConnectionInfo[] = [{ authority: 'local', address: undefined, name: 'Local', isAmbient: true, connection }];
			},
			new class extends mock<ILanguageModelsService>() {
				override readonly onDidChangeLanguageModels = Event.None;
				override getLanguageModelGroups(): ILanguageModelsGroup[] {
					return [{ group, modelIdentifiers: ['customendpoint/Example/gpt-x'] }];
				}
				override lookupLanguageModel(): ILanguageModelChatMetadata {
					return metadata;
				}
				override async resolveLanguageModelsProviderGroupApiKey(): Promise<string | undefined> {
					return key;
				}
			},
			new class extends mock<ILanguageModelsConfigurationService>() {
				override readonly onDidChangeLanguageModelGroups = onDidChangeGroups.event;
				override getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[] {
					return [group];
				}
			},
			new class extends mock<IChatEntitlementService>() {
				override readonly clientByokEnabled = true;
			},
			configurationService,
			new MockContextKeyService(),
			new NullLogService(),
		));
		return {
			registrar, connection, root, configurationService,
			replaceKey(reference: string, value: string) {
				group = { ...group, apiKey: reference };
				key = value;
				onDidChangeGroups.fire([group]);
			},
		};
	}

	test('registers each Custom Endpoint group, answers the host\'s key requests, and withdraws it when turned off', async () => {
		const { connection, root, configurationService, replaceKey } = createRegistrar({ formats: [CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT] });
		const registration = root.value.modelSourceRegistrations?.[0];

		root.report({ kind: ModelSourceStatus.AuthRequired, reason: AuthRequiredReason.Required }, 'nonce-1');
		await timeout(0);
		root.report({ kind: ModelSourceStatus.Ready }, 'nonce-2');
		// A key the endpoint rejected is not sent again until it is replaced.
		root.report({ kind: ModelSourceStatus.AuthRequired, reason: AuthRequiredReason.Expired }, 'nonce-3');
		await timeout(0);
		const keysBeforeReplacement = connection.keys.length;
		replaceKey('${input:chat.lm.secret.second}', 'key-2');
		await timeout(0);

		await configurationService.setUserConfiguration(AgentHostByokCustomEndpointDirectSettingId, false);
		configurationService.onDidChangeConfigurationEmitter.fire({ source: ConfigurationTarget.USER, affectedKeys: new Set([AgentHostByokCustomEndpointDirectSettingId]), change: { keys: [AgentHostByokCustomEndpointDirectSettingId], overrides: [] }, affectsConfiguration: section => section === AgentHostByokCustomEndpointDirectSettingId });

		assert.deepStrictEqual({
			registration,
			keysBeforeReplacement,
			keys: connection.keys,
			actions: connection.actions.map(action => action.type),
			remaining: root.value.modelSourceRegistrations,
		}, {
			registration: {
				id: SOURCE_ID,
				provider: 'copilotcli',
				displayName: 'Example',
				format: CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT,
				definition: { models: [{ id: 'gpt-x', name: 'GPT X', url: MODEL_URL, toolCalling: true, maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120 }], requiresApiKey: true },
				clientId: 'window-1',
				// The local host is shared by the user's windows, so the source outlives this one.
				retention: 'host',
			},
			keysBeforeReplacement: 1,
			keys: [{ token: 'key-1', nonce: 'nonce-1' }, { token: 'key-2', nonce: 'nonce-3' }],
			actions: [ActionType.RootModelSourceRegistrationSet, ActionType.RootModelSourceRegistrationRemoved],
			remaining: [],
		});
	});

	test('registers nothing with a host whose agents don\'t read the format, and never sends the key for another copy of the group', async () => {
		const unsupported = createRegistrar({ formats: ['example.test/other@1'] });
		const supported = createRegistrar({ formats: [CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT] });
		// Another client replaced the registration with a different endpoint.
		const current = supported.root.value.modelSourceRegistrations![0];
		supported.root.apply({ type: ActionType.RootModelSourceRegistrationSet, registration: { ...current, clientId: 'other-window', definition: { models: [{ id: 'gpt-x', url: 'https://elsewhere.example.test/v1/chat/completions' }], requiresApiKey: true } } });
		supported.root.apply({ type: ActionType.RootModelSourceStateChanged, id: SOURCE_ID, state: { kind: ModelSourceStatus.AuthRequired, reason: AuthRequiredReason.Required }, credentialNonce: 'nonce-1', credentialResource: { resource: 'https://elsewhere.example.test/v1/chat/completions' } });
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
});
