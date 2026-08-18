/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { derived, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSelectedModelStorageKey, storeSelectedModel } from '../../../../../workbench/contrib/chat/common/chatSelectedModel.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { isInConversationModelChoice, resolveModelIdentifier } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { conformanceInputs, IModelSelectionConformanceScenario, ModelSelectionConformanceModel, modelSelectionConformanceScenarios } from '../../../../../workbench/contrib/chat/test/browser/widget/input/modelSelectionConformance.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider, ISessionModelPickerOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { ChatModelSource, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { restoreReasonForSource, SessionModelSelection } from '../../browser/sessionModelSelection.js';

function model(identifier: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: identifier,
			name: identifier,
			vendor: 'test',
			version: '1.0',
			family: identifier,
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isDefaultForLocation: {},
		},
	};
}

const first = model('test/first');
const second = model('test/second');
const modelTarget = 'type';
const selectedModelStorageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, modelTarget);

function legacyModelPickerStorageKey(providerId: string, sessionType: string): string {
	return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}
const auto = {
	...model('copilot/auto'),
	metadata: {
		...model('copilot/auto').metadata,
		id: 'auto',
		isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
	},
};

interface ITestChat extends IChat {
	readonly status: ISettableObservable<SessionStatus>;
	readonly modelId: ISettableObservable<string | undefined>;
	readonly modelSource: ISettableObservable<ChatModelSource | undefined>;
}

/** A chat whose model says where it came from, as a real provider reports. */
function createChat(resource: string, selectedModelId?: string, source = ChatModelSource.Chosen, status = SessionStatus.Untitled): ITestChat {
	return {
		resource: URI.parse(resource),
		status: observableValue<SessionStatus>(`${resource}.status`, status),
		modelId: observableValue<string | undefined>(`${resource}.model`, selectedModelId),
		modelSource: observableValue<ChatModelSource | undefined>(`${resource}.modelSource`, selectedModelId ? source : undefined),
	} as ITestChat;
}

interface ITestSession {
	readonly session: IActiveSession;
	/** Reads and writes the active chat's model, as a provider write would. */
	readonly modelId: { get(): string | undefined; set(value: string | undefined, tx: undefined, source?: ChatModelSource): void };
	readonly activeChat: ISettableObservable<IChat>;
}

/**
 * A session whose model is scoped to its active chat, matching `ActiveSession`: peer chats each
 * keep their own model, and the session merely reports the active one's.
 */
function createSession(providerId: string, status: SessionStatus, selectedModelId?: string, sessionId = `${providerId}:session`, sessionType = 'type'): ITestSession {
	const activeChat = observableValue<IChat>(`${providerId}.activeChat`, createChat(`chat:/${providerId}/one`, selectedModelId, ChatModelSource.Chosen, status));
	const modelId = {
		get: () => activeChat.get().modelId.get(),
		// Atomic, as the real providers are: an observer must never see a model paired with where
		// the previous model came from.
		set: (value: string | undefined, _tx: undefined, source = ChatModelSource.Chosen) => {
			const chat = activeChat.get() as ITestChat;
			transaction(tx => {
				chat.modelSource.set(value ? source : undefined, tx);
				chat.modelId.set(value, tx);
			});
		},
	};
	return {
		modelId,
		activeChat,
		session: {
			providerId,
			sessionType,
			sessionId,
			resource: URI.parse(`session:/${providerId}`),
			modelId: derived(reader => activeChat.read(reader).modelId.read(reader)),
			status: observableValue(`${providerId}.status`, status),
			activeChat,
		} as unknown as IActiveSession,
	};
}

interface ITestProvider extends ISessionsProvider {
	models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly modelChanges: Emitter<void>;
	readonly writes: string[];
	readonly desiredModelIds: (string | undefined)[];
	getModelsCalls: number;
	modelsResolved: boolean;
	modelTarget: string;
	/** Mirrors a provider that republishes a model under its own identifier. */
	resolveDesired?: (desiredModelId: string) => ILanguageModelChatMetadataAndIdentifier | undefined;
	dispose(): void;
}

function createProvider(id: string, onSetModel?: (modelIdentifier: string, source: ChatModelSource) => void): ITestProvider {
	const modelChanges = new Emitter<void>();
	const provider = {
		id,
		models: [first, second],
		modelChanges,
		writes: [],
		desiredModelIds: [],
		getModelsCalls: 0,
		modelsResolved: true,
		modelTarget,
		dispose: () => modelChanges.dispose(),
		onDidChangeModels: modelChanges.event,
		getModelsSnapshot(_sessionId: string, desiredModelId?: string) {
			provider.getModelsCalls++;
			provider.desiredModelIds.push(desiredModelId);
			const resolved = desiredModelId ? provider.resolveDesired?.(desiredModelId) : undefined;
			return {
				models: provider.models,
				desiredModelResolution: resolved
					? { kind: 'available' as const, model: resolved }
					: resolveModelIdentifier(provider.models, desiredModelId, provider.modelsResolved),
				modelTarget: provider.modelTarget,
			};
		},
		getModelPickerOptions(): ISessionModelPickerOptions {
			return {
				useGroupedModelPicker: true,
				showFeatured: true,
				showUnavailableFeatured: false,
				showManageModelsAction: false,
			};
		},
		setModel(_sessionId: string, _chatResource: URI, modelIdentifier: string, source: ChatModelSource) {
			provider.writes.push(modelIdentifier);
			onSetModel?.(modelIdentifier, source);
		},
	} as unknown as ITestProvider;
	return provider;
}

function createProvidersService(providers: readonly ITestProvider[]): ISessionsProvidersService {
	const byId = new Map(providers.map(provider => [provider.id, provider]));
	return {
		onDidChangeProviders: Event.None,
		getProvider: id => byId.get(id),
	} as ISessionsProvidersService;
}

function createConfigurationService(defaultModel?: string): IConfigurationService {
	return {
		getValue: key => key === ChatConfiguration.DefaultModel ? defaultModel : undefined,
		onDidChangeConfiguration: Event.None as Event<IConfigurationChangeEvent>,
	} as IConfigurationService;
}

function runConformanceScenario(
	scenario: IModelSelectionConformanceScenario,
	register: <T extends { dispose(): void }>(disposable: T) => T,
): IModelSelectionConformanceScenario['expected'] {
	const { isEmpty, models: catalog, chatModel: chatModelName, chatModelSource, rememberedModel, configuredModel, catalogResolved } = conformanceInputs(scenario);
	const models = new Map<ModelSelectionConformanceModel, ILanguageModelChatMetadataAndIdentifier>([
		['first', first],
		['second', second],
		['missing', model('test/missing')],
	]);
	const status = isEmpty ? SessionStatus.Untitled : SessionStatus.Completed;
	const testSession = createSession('provider', status);
	const chatModel = chatModelName ? models.get(chatModelName) : undefined;
	const source = chatModelSource === 'carriedOver' ? ChatModelSource.CarriedOver : ChatModelSource.Chosen;
	testSession.activeChat.set(createChat(
		'chat:/provider/conformance',
		chatModel?.identifier,
		source,
		status,
	), undefined);
	const provider = register(createProvider('provider', (identifier, modelSource) => testSession.modelId.set(identifier, undefined, modelSource)));
	provider.models = catalog.map(identifier => models.get(identifier)!);
	provider.modelsResolved = catalogResolved;
	const storage = register(new InMemoryStorageService());
	if (rememberedModel) {
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, models.get(rememberedModel)!.identifier);
	}
	const selection = register(new SessionModelSelection(
		observableValue<IActiveSession | undefined>('conformanceSession', testSession.session),
		createProvidersService([provider]),
		storage,
		createConfigurationService(configuredModel ? models.get(configuredModel)!.metadata.id : undefined),
		register(new NullLogService()),
	));
	const currentModel = [...models].find(([, candidate]) => candidate.identifier === selection.state.get().currentModel?.identifier)?.[0];
	const conversationModel = [...models].find(([, candidate]) => candidate.identifier === testSession.modelId.get())?.[0];

	return {
		currentModel: currentModel === 'missing' ? undefined : currentModel,
		conversationModel: conversationModel === 'missing' ? undefined : conversationModel,
	};
}

class TestLogService extends NullLogService {
	readonly messages: string[] = [];

	override debug(message: string, ...args: unknown[]): void {
		this.messages.push(`[debug] ${[message, ...args].join(' ')}`);
	}

	override info(message: string, ...args: unknown[]): void {
		this.messages.push(`[info] ${[message, ...args].join(' ')}`);
	}

	override error(message: string | Error, ...args: unknown[]): void {
		this.messages.push(`[error] ${[message, ...args].join(' ')}`);
	}
}

suite('SessionModelSelection', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('model selection conformance', () => {
		for (const scenario of modelSelectionConformanceScenarios) {
			test(scenario.name, () => {
				assert.deepStrictEqual(runConformanceScenario(scenario, disposable => disposables.add(disposable)), scenario.expected);
			});
		}
	});

	test('new Codex sessions use the most recently selected provider model', () => {
		const codexModelTarget = 'agent-host-codex';
		const copilotModel = {
			...model('codex:@provider=vscode-proxy:gpt-test'),
			metadata: { ...model('codex:@provider=vscode-proxy:gpt-test').metadata, modelGroup: { id: 'copilot' } },
		};
		const chatGPTModel = {
			...model('codex:@provider=openai:gpt-test'),
			metadata: { ...model('codex:@provider=openai:gpt-test').metadata, modelGroup: { id: 'openai', sourceId: 'chatgptSubscription' } },
		};
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, codexModelTarget, chatGPTModel.identifier);

		const draft = createSession('provider', SessionStatus.Untitled, undefined, 'draft', codexModelTarget);
		const provider = disposables.add(createProvider('provider', (identifier, source) => draft.modelId.set(identifier, undefined, source)));
		provider.models = [copilotModel, chatGPTModel];
		provider.modelTarget = codexModelTarget;
		const draftSelection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('draftSession', draft.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({ current: draftSelection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: chatGPTModel.identifier,
			writes: [chatGPTModel.identifier],
		});

		assert.strictEqual(draftSelection.selectModel(copilotModel.identifier), true);
		const nextDraft = createSession('provider', SessionStatus.Untitled, undefined, 'nextDraft', codexModelTarget);
		const nextProvider = disposables.add(createProvider('provider', (identifier, source) => nextDraft.modelId.set(identifier, undefined, source)));
		nextProvider.models = [chatGPTModel, copilotModel];
		nextProvider.modelTarget = codexModelTarget;
		const nextSelection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('nextDraftSession', nextDraft.session),
			createProvidersService([nextProvider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({ current: nextSelection.state.get().currentModel?.identifier, writes: nextProvider.writes }, {
			current: copilotModel.identifier,
			writes: [copilotModel.identifier],
		});
	});

	test('migrates a legacy Sessions preference and seeds a draft exactly once', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(legacyModelPickerStorageKey('provider', 'type'), second.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			models: selection.state.get().models.map(model => model.identifier),
			showAutoModel: selection.state.get().options.showAutoModel,
			hasSelectableModel: selection.state.get().hasSelectableModel,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
			writes: provider.writes,
		}, {
			current: second.identifier,
			models: [first.identifier, second.identifier],
			showAutoModel: true,
			hasSelectableModel: true,
			stored: second.identifier,
			profileUserKeys: [selectedModelStorageKey],
			writes: [second.identifier],
		});
	});

	test('restores an existing session without writing to its provider', () => {
		const testSession = createSession('provider', SessionStatus.Completed, second.identifier);
		const provider = disposables.add(createProvider('provider'));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: second.identifier,
			writes: [],
		});
	});

	test('restores an untitled draft model without applying fresh-conversation defaults', () => {
		const testSession = createSession('provider', SessionStatus.Untitled, first.identifier);
		const provider = disposables.add(createProvider('provider'));
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			writes: provider.writes,
		}, {
			current: first.identifier,
			stored: second.identifier,
			writes: [],
		});
	});

	test('replaces the current provider listener on session switch', () => {
		const firstSession = createSession('firstProvider', SessionStatus.Completed, first.identifier);
		const secondSession = createSession('secondProvider', SessionStatus.Completed, second.identifier);
		const firstProvider = disposables.add(createProvider('firstProvider'));
		const secondProvider = disposables.add(createProvider('secondProvider'));
		const session = observableValue<IActiveSession | undefined>('session', firstSession.session);
		const selection = disposables.add(new SessionModelSelection(
			session,
			createProvidersService([firstProvider, secondProvider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		session.set(secondSession.session, undefined);
		const callsAfterSwitch = secondProvider.getModelsCalls;
		firstProvider.modelChanges.fire();
		const callsAfterStaleEvent = secondProvider.getModelsCalls;
		secondProvider.modelChanges.fire();

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			callsAfterSwitch,
			callsAfterStaleEvent,
			callsAfterCurrentEvent: secondProvider.getModelsCalls,
		}, {
			current: second.identifier,
			callsAfterSwitch: 1,
			callsAfterStaleEvent: 1,
			callsAfterCurrentEvent: 2,
		});
	});

	test('validates manual selection against a fresh models snapshot', () => {
		const testSession = createSession('provider', SessionStatus.Completed, first.identifier);
		const provider = disposables.add(createProvider('provider'));
		const storage = disposables.add(new InMemoryStorageService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		const selected = selection.selectModel(second.identifier);
		provider.models = [first];
		const rejected = selection.selectModel(second.identifier);

		assert.deepStrictEqual({
			selected,
			rejected,
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
			writes: provider.writes,
		}, {
			selected: true,
			rejected: false,
			current: second.identifier,
			stored: second.identifier,
			profileUserKeys: [selectedModelStorageKey],
			writes: [second.identifier],
		});
	});

	test('does not remember a selection rejected by the provider', () => {
		const testSession = createSession('provider', SessionStatus.Completed, first.identifier);
		const storage = disposables.add(new InMemoryStorageService());
		const provider = disposables.add(createProvider('provider', () => { throw new Error('rejected'); }));
		const logService = disposables.add(new TestLogService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			logService,
		));

		assert.throws(() => selection.selectModel(second.identifier), /rejected/);
		const failureMessage = logService.messages.find(message => message.includes('event=provider-selection-failed'));
		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			loggedFailure: failureMessage?.includes('error="Error: rejected"'),
			loggedProviderModelBefore: failureMessage?.includes(`providerModelBefore=${JSON.stringify(first.identifier)}`),
			loggedProviderModelAfter: failureMessage?.includes(`providerModelAfter=${JSON.stringify(first.identifier)}`),
		}, {
			current: first.identifier,
			stored: undefined,
			loggedFailure: true,
			loggedProviderModelBefore: true,
			loggedProviderModelAfter: true,
		});
	});

	test('clears a rejected draft selection when the provider has no previous model', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const storage = disposables.add(new InMemoryStorageService());
		const provider = disposables.add(createProvider('provider', () => { throw new Error('rejected'); }));
		provider.models = [];
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));
		provider.models = [second];

		assert.throws(() => selection.selectModel(second.identifier), /rejected/);
		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
		}, {
			current: undefined,
			stored: undefined,
		});
	});

	test('adopts an external draft selection without duplicating the provider write', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		testSession.modelId.set(second.identifier, undefined);

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: second.identifier,
			writes: [first.identifier],
		});
	});

	test('publishes empty state when the session has no provider', () => {
		const testSession = createSession('missing', SessionStatus.Untitled);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({
			current: selection.state.get().currentModel,
			models: selection.state.get().models,
			hasSelectableModel: selection.state.get().hasSelectableModel,
		}, {
			current: undefined,
			models: [],
			hasSelectableModel: false,
		});
	});

	test('waits for arbitrary synthetic models to resolve before repairing a removed model', () => {
		const removedModelId = 'removed-cloud-model';
		const testSession = createSession('provider', SessionStatus.Completed, removedModelId);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));
		const beforeResolve = { current: selection.state.get().currentModel?.identifier, writes: [...provider.writes] };
		provider.modelsResolved = true;
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			beforeResolve,
			afterResolve: { current: selection.state.get().currentModel?.identifier, writes: provider.writes },
		}, {
			beforeResolve: { current: undefined, writes: [] },
			afterResolve: { current: second.identifier, writes: [second.identifier] },
		});
	});

	test('preserves a remembered model while another model resolves first', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));
		const beforeResolve = {
			current: selection.state.get().currentModel?.identifier,
			pending: selection.state.get().pendingSelection,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			writes: [...provider.writes],
			desiredModelIds: [...provider.desiredModelIds],
		};

		provider.models = [first, second];
		provider.modelsResolved = true;
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			beforeResolve,
			afterResolve: {
				current: selection.state.get().currentModel?.identifier,
				pending: selection.state.get().pendingSelection,
				stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
				writes: provider.writes,
			},
		}, {
			beforeResolve: {
				current: undefined,
				pending: { reference: second.identifier },
				stored: second.identifier,
				writes: [],
				desiredModelIds: [undefined, second.identifier],
			},
			afterResolve: {
				current: second.identifier,
				pending: undefined,
				stored: second.identifier,
				writes: [second.identifier],
			},
		});
		assert.deepStrictEqual(provider.desiredModelIds, [undefined, second.identifier, undefined, second.identifier, second.identifier]);
	});

	test('replaces but does not remember a provisional first model when the default arrives later', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		provider.models = [first, auto];
		provider.modelsResolved = true;
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			writes: provider.writes,
		}, {
			current: auto.identifier,
			stored: undefined,
			writes: [first.identifier, auto.identifier],
		});
	});

	test('falls back instead of waiting for an inapplicable configured model', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService('missing-family'),
			disposables.add(new NullLogService()),
		));

		const beforeArrival = {
			current: selection.state.get().currentModel?.identifier,
			pending: selection.state.get().pendingSelection,
		};
		const configured = {
			...second,
			metadata: { ...second.metadata, id: 'missing-family' },
		};
		provider.models = [first, configured];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			beforeArrival,
			afterArrival: {
				current: selection.state.get().currentModel?.identifier,
				pending: selection.state.get().pendingSelection,
			},
		}, {
			beforeArrival: { current: first.identifier, pending: undefined },
			afterArrival: { current: configured.identifier, pending: undefined },
		});
	});

	test('explicit selection cancels a pending remembered-model restore', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		const selected = selection.selectModel(first.identifier);
		provider.models = [first, second];
		provider.modelsResolved = true;
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			selected,
			current: selection.state.get().currentModel?.identifier,
			pending: selection.state.get().pendingSelection,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			writes: provider.writes,
		}, {
			selected: true,
			current: first.identifier,
			pending: undefined,
			stored: first.identifier,
			writes: [first.identifier],
		});
	});

	test('explicit selection survives configured-default refreshes', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const storage = disposables.add(new InMemoryStorageService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		const storedAfterConfiguredDefault = storage.get(selectedModelStorageKey, StorageScope.PROFILE);
		selection.selectModel(first.identifier);
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			storedAfterConfiguredDefault,
			storedAfterExplicitSelection: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			writes: provider.writes,
		}, {
			current: first.identifier,
			storedAfterConfiguredDefault: undefined,
			storedAfterExplicitSelection: first.identifier,
			writes: [second.identifier, first.identifier],
		});
	});

	test('reapplies the configured default when an untitled chat is reused', () => {
		const testSession = createSession('provider', SessionStatus.Untitled, first.identifier);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		testSession.activeChat.set(createChat('chat:/provider/two'), undefined);

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: second.identifier,
			writes: [second.identifier],
		});
	});

	test('restores a different untitled session from the same provider', () => {
		const firstSession = createSession('provider', SessionStatus.Untitled, second.identifier, 'provider:first');
		const secondSession = createSession('provider', SessionStatus.Untitled, first.identifier, 'provider:second');
		const provider = disposables.add(createProvider('provider'));
		const session = observableValue<IActiveSession | undefined>('session', firstSession.session);
		const selection = disposables.add(new SessionModelSelection(
			session,
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		session.set(secondSession.session, undefined);

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: first.identifier,
			writes: [],
		});
	});

	test('keeps each peer chat on its own model when switching between them', () => {
		// The August 2025 regression: a model picked in one chat was applied to a different chat.
		// A chat's model is read from the chat itself, so switching to one that already has a
		// model adopts it rather than re-seeding from the other chat's preference.
		const chatOne = createChat('chat:/provider/one', first.identifier);
		const chatTwo = createChat('chat:/provider/two', second.identifier);
		const testSession = createSession('provider', SessionStatus.Completed);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, first.identifier);
		testSession.activeChat.set(chatOne, undefined);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		const onChatOne = selection.state.get().currentModel?.identifier;
		testSession.activeChat.set(chatTwo, undefined);
		const onChatTwo = selection.state.get().currentModel?.identifier;
		testSession.activeChat.set(chatOne, undefined);

		assert.deepStrictEqual({
			onChatOne,
			onChatTwo,
			backOnChatOne: selection.state.get().currentModel?.identifier,
			chatTwoModel: chatTwo.modelId.get(),
			writes: provider.writes,
		}, {
			onChatOne: first.identifier,
			// Not `first`: chat two's own model outranks the remembered preference.
			onChatTwo: second.identifier,
			backOnChatOne: first.identifier,
			chatTwoModel: second.identifier,
			writes: [],
		});
	});

	test('does not apply one conversation\'s awaited model to another', () => {
		// The intended model is held per conversation, so a chat still waiting for its pick to be
		// published cannot force it onto the next chat.
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first];
		const storage = disposables.add(new InMemoryStorageService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		selection.selectModel(first.identifier);
		// A second chat in the same session starts fresh, and the pool then publishes the model
		// the first chat is pinned to.
		testSession.activeChat.set(createChat('chat:/provider/two'), undefined);
		provider.models = [second, first];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			writes: provider.writes,
		}, {
			// The remembered preference seeds the new chat; the first chat's own choice does not
			// reach across to force it. The third write attaches the model to the new chat, which
			// starts out with none of its own.
			current: first.identifier,
			writes: [first.identifier, first.identifier, first.identifier],
		});
	});

	test('a configured default overtakes a remembered model that has not published', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			// `chat.defaultModel` outranks the remembered preference, so a fresh chat should not
			// sit disabled waiting for a preference it was never going to use.
			createConfigurationService(first.metadata.id),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			pending: selection.state.get().pendingSelection,
			writes: provider.writes,
		}, {
			current: first.identifier,
			pending: undefined,
			writes: [first.identifier],
		});
	});

	test('a manual pick is not re-seeded away when the provider write lands late', () => {
		// A provider that does not reflect `setModel` synchronously (the agent host round-trips it)
		// must not let the next refresh treat the chat as unseeded and re-apply a default over the
		// pick the user just made.
		const third = model('test/third');
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider'));
		provider.models = [first, third];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(third.metadata.id),
			disposables.add(new NullLogService()),
		));

		assert.strictEqual(selection.selectModel(first.identifier), true);
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
		}, {
			// Not the configured default `third`: the user's pick owns the conversation.
			current: first.identifier,
			stored: first.identifier,
		});
	});

	test('reclaims a model that returns after a switch away from its stand-in', () => {
		// A chat pinned to X is given a stand-in when X leaves the pool. Re-binding to that chat
		// must not mistake this input's own stand-in for the chat's answer, or X would be
		// forgotten and never reclaimed when it comes back.
		const testSession = createSession('provider', SessionStatus.Untitled);
		const other = createSession('other', SessionStatus.Untitled, first.identifier, 'other:session');
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const otherProvider = disposables.add(createProvider('other'));
		const session = observableValue<IActiveSession | undefined>('session', testSession.session);
		const selection = disposables.add(new SessionModelSelection(
			session,
			createProvidersService([provider, otherProvider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		selection.selectModel(second.identifier);
		// `second` leaves the pool, so the chat is put on a stand-in.
		provider.models = [first];
		provider.modelChanges.fire();
		const onStandIn = selection.state.get().currentModel?.identifier;

		session.set(other.session, undefined);
		session.set(testSession.session, undefined);
		const afterReturn = selection.state.get().currentModel?.identifier;

		provider.models = [first, second];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			onStandIn,
			afterReturn,
			reclaimed: selection.state.get().currentModel?.identifier,
		}, {
			onStandIn: first.identifier,
			afterReturn: first.identifier,
			reclaimed: second.identifier,
		});
	});

	test('repairs a draft whose model went missing with the configured default', () => {
		// Matches Workbench chat: a model restored onto a conversation that has not sent a request
		// is carried over, so once it proves unavailable `chat.defaultModel` seeds the draft. Only a
		// choice made inside the conversation outranks the configured default.
		const testSession = createSession('provider', SessionStatus.Untitled, 'test/removed');
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first, second];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, first.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		const whilePending = selection.state.get().currentModel?.identifier;
		provider.modelsResolved = true;
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			whilePending,
			afterResolve: selection.state.get().currentModel?.identifier,
		}, {
			// Nothing is shown while the draft's own model might still arrive.
			whilePending: undefined,
			afterResolve: second.identifier,
		});
	});

	test('re-picking the model already shown still settles the chat against the configured default', () => {
		// Nothing about the chat's model changes, so the explicit pick is the only evidence that
		// the conversation has chosen. Without it a later refresh would seed it all over again.
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const configuration = createConfigurationService(first.metadata.id);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			configuration,
			disposables.add(new NullLogService()),
		));

		const seeded = selection.state.get().currentModel?.identifier;
		// The user picks what is already shown, making it their own choice rather than a default.
		assert.strictEqual(selection.selectModel(first.identifier), true);
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			seeded,
			afterRefresh: selection.state.get().currentModel?.identifier,
			settled: !selection.state.get().pendingSelection,
		}, {
			seeded: first.identifier,
			afterRefresh: first.identifier,
			settled: true,
		});
	});

	test('follows the provider when it resolves a model to a different identifier', () => {
		// Agent hosts republish a model under their own session scheme, so the pool can offer the
		// wanted model under another identifier. Matching the raw identifier would miss it.
		const canonical = model('scheme:test/second');
		const testSession = createSession('provider', SessionStatus.Completed, second.identifier);
		const provider = disposables.add(createProvider('provider'));
		provider.models = [first, canonical];
		provider.resolveDesired = desiredModelId => desiredModelId === second.identifier ? canonical : undefined;
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier }, {
			// Not `first`, which is what an exact-identifier fallback would land on.
			current: canonical.identifier,
		});
	});

	test('a pick made in a conversation that has already run still reaches the provider', () => {
		// Withholding automatic writes must not withhold the user's own. A session whose model the
		// provider has not reported yet is still one the user can change.
		const opus = model('test/opus');
		const gpt = model('test/gpt');
		const testSession = createSession('provider', SessionStatus.Completed, undefined);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [gpt, opus];
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, opus.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(undefined),
			disposables.add(new NullLogService()),
		));

		const accepted = selection.selectModel(gpt.identifier);

		assert.deepStrictEqual({
			accepted,
			writes: provider.writes,
			sessionModel: testSession.modelId.get(),
			source: (testSession.activeChat.get() as ITestChat).modelSource.get(),
		}, {
			accepted: true,
			writes: [gpt.identifier],
			sessionModel: gpt.identifier,
			source: ChatModelSource.Chosen,
		});
	});

	test('a just-picked model is not replaced by the configured default while it is unpublished', () => {
		// The user's pick owns the conversation even before the provider echoes it back.
		const picked = model('test/picked');
		const configured = model('test/configured');
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider'));
		provider.models = [picked, configured];
		const storage = disposables.add(new InMemoryStorageService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(configured.metadata.id),
			disposables.add(new NullLogService()),
		));

		assert.strictEqual(selection.selectModel(picked.identifier), true);
		// The catalog drops the pick before the provider echoes it back, and cannot yet say the
		// model is gone for good.
		provider.models = [configured];
		provider.modelsResolved = false;
		provider.modelChanges.fire();

		assert.strictEqual(selection.state.get().currentModel?.identifier, undefined, 'should still be waiting for the pick, not showing the configured default');
	});

	test('a conversation that has already run is not given the remembered model', () => {
		// A finished session is reopened while the provider has not yet said what it was running on.
		// The profile-wide preference may be shown meanwhile, but writing it would travel to the
		// backend and change the conversation — the session would come back on the wrong model.
		const opus = model('test/opus');
		const gpt = model('test/gpt');
		const testSession = createSession('provider', SessionStatus.Completed, undefined);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [gpt, opus];
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, opus.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(undefined),
			disposables.add(new NullLogService()),
		));

		const beforeHydration = {
			shown: selection.state.get().currentModel?.identifier,
			writes: [...provider.writes],
			sessionModel: testSession.modelId.get(),
		};
		// The provider hydrates the model the session was actually running on.
		testSession.modelId.set(gpt.identifier, undefined, ChatModelSource.Chosen);

		assert.deepStrictEqual({
			beforeHydration,
			afterHydration: {
				shown: selection.state.get().currentModel?.identifier,
				writes: provider.writes,
				sessionModel: testSession.modelId.get(),
			},
		}, {
			beforeHydration: {
				// Shown so the picker is not blank, but the conversation is left as it was.
				shown: opus.identifier,
				writes: [],
				sessionModel: undefined,
			},
			afterHydration: {
				shown: gpt.identifier,
				writes: [],
				sessionModel: gpt.identifier,
			},
		});
	});

	test('a reopened conversation still shows a model while its pool is half-published', () => {
		// As above, but the remembered model has not been published yet and the pool cannot say
		// whether it ever will be — an agent host that is still connecting. Waiting for it would
		// guard a write that `_displayOnly` already withholds, at the cost of a blank picker and a
		// composer that refuses to send.
		const opus = model('test/opus');
		const gpt = model('test/gpt');
		const testSession = createSession('provider', SessionStatus.Completed, undefined);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [gpt];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, opus.identifier);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(undefined),
			disposables.add(new NullLogService()),
		));

		assert.deepStrictEqual({
			shown: selection.state.get().currentModel?.identifier,
			pending: selection.state.get().pendingSelection?.reference,
			writes: provider.writes,
			sessionModel: testSession.modelId.get(),
		}, {
			// A stand-in from the pool, and nothing pending, so the composer can still send.
			shown: gpt.identifier,
			pending: undefined,
			writes: [],
			sessionModel: undefined,
		});
	});

	test('a canonicalized user choice is still written as the conversation\'s own', () => {
		// Re-applying the conversation's own model under the identifier its pool publishes it as is
		// bookkeeping, not a fresh pick. Writing it back as automatic would demote the user's
		// choice to something `chat.defaultModel` may overwrite on the next rebind.
		//
		// It comes back as `Restored` rather than `User`: where a model came from is derived from
		// the reason selection is acting on, which records that the model is the conversation's own
		// but not which of the ways it became so. Both are choices, which is what the rule turns on.
		const canonical = model('scheme:test/second');
		const testSession = createSession('provider', SessionStatus.Untitled, second.identifier);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first, canonical];
		provider.resolveDesired = desiredModelId => desiredModelId === second.identifier ? canonical : undefined;
		testSession.activeChat.set(createChat('chat:/provider/one', second.identifier, ChatModelSource.Chosen, SessionStatus.Untitled), undefined);
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			// A configured default is only kept out by a model the conversation chose.
			createConfigurationService(first.metadata.id),
			disposables.add(new NullLogService()),
		));

		const writtenSource = (testSession.activeChat.get() as ITestChat).modelSource.get();
		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			source: writtenSource,
			// The property the rule actually turns on, asserted rather than inferred from the label.
			countsAsConversationChoice: isInConversationModelChoice(restoreReasonForSource(writtenSource)),
		}, {
			current: canonical.identifier,
			source: ChatModelSource.Chosen,
			countsAsConversationChoice: true,
		});
	});

	test('adopts a model another surface selects after this input has seeded one', () => {
		// A peer's explicit pick arriving after seeding must take over, and must not be reduced to
		// a restore that `chat.defaultModel` can overwrite.
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(first.metadata.id),
			disposables.add(new NullLogService()),
		));

		const afterSeeding = selection.state.get().currentModel?.identifier;
		// Another surface picks a different model for this same chat.
		testSession.modelId.set(second.identifier, undefined, ChatModelSource.Chosen);
		const afterPeerSelection = selection.state.get().currentModel?.identifier;
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			afterSeeding,
			afterPeerSelection,
			afterRefresh: selection.state.get().currentModel?.identifier,
		}, {
			afterSeeding: first.identifier,
			afterPeerSelection: second.identifier,
			// The configured default does not reclaim a model the conversation chose.
			afterRefresh: second.identifier,
		});
	});

	test('a peer promoting this input\'s automatic pick to their own choice blocks the default', () => {
		// Only where the model came from changes: the identifier is the model this input already
		// applied. The promotion still has to register, or the model stays an automatic pick that
		// the location default replaces as soon as it publishes.
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first];
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		// Seeded with the only model available, then claimed by a peer as their own pick.
		const seeded = selection.state.get().currentModel?.identifier;
		const chat = testSession.activeChat.get() as ITestChat;
		transaction(tx => chat.modelSource.set(ChatModelSource.Chosen, tx));
		// The location default publishes afterwards; it may upgrade a provisional pick, never a choice.
		provider.models = [first, auto];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			seeded,
			current: selection.state.get().currentModel?.identifier,
			source: chat.modelSource.get(),
		}, {
			seeded: first.identifier,
			current: first.identifier,
			source: ChatModelSource.Chosen,
		});
	});

	test('seeds a new peer chat that inherited the previous chat\'s model', () => {
		// Providers start a peer chat on the model the previous chat used. That is carried over, not
		// a choice, so `chat.defaultModel` still gets to seed the new chat.
		const testSession = createSession('provider', SessionStatus.Untitled, first.identifier);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		const onFirstChat = selection.state.get().currentModel?.identifier;
		// The provider starts the peer chat on the previous chat's model and says so.
		testSession.activeChat.set(createChat('chat:/provider/two', first.identifier, ChatModelSource.CarriedOver), undefined);

		assert.deepStrictEqual({
			onFirstChat,
			onInheritedChat: selection.state.get().currentModel?.identifier,
		}, {
			onFirstChat: first.identifier,
			onInheritedChat: second.identifier,
		});
	});

	test('a peer visit does not cost a chat the model it is still waiting for', () => {
		// Chat one runs on its own model, which its pool then stops offering, so it falls back to a
		// stand-in that is written back as carried over. Visiting a peer and returning must not let
		// that stand-in be adopted as chat one's own: it is still waiting for its real model, and
		// forgetting that loses the model when it republishes and opens the chat to
		// `chat.defaultModel`. Without a peer in between the stand-in was correctly ignored, so the
		// two paths have to agree.
		const missing = model('test/missing');
		const testSession = createSession('provider', SessionStatus.Completed, missing.identifier);
		const chatOne = testSession.activeChat.get();
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		provider.models = [first, second, missing];
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		const onOwnModel = selection.state.get().currentModel?.identifier;
		// The chat's model stops being offered, so it falls back to a stand-in.
		provider.models = [first, second];
		provider.modelChanges.fire();
		const standIn = selection.state.get().currentModel?.identifier;
		// A peer chat on a different model, then back to chat one.
		testSession.activeChat.set(createChat('chat:/provider/two', second.identifier, ChatModelSource.Chosen, SessionStatus.Completed), undefined);
		const onPeer = selection.state.get().currentModel?.identifier;
		testSession.activeChat.set(chatOne, undefined);
		// The model chat one was waiting for comes back.
		provider.models = [first, second, missing];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			onOwnModel,
			standIn,
			onPeer,
			reclaimed: selection.state.get().currentModel?.identifier,
		}, {
			onOwnModel: missing.identifier,
			standIn: first.identifier,
			onPeer: second.identifier,
			reclaimed: missing.identifier,
		});
	});

	test('writes a model for a session bound while its pool was still empty', () => {
		// The incoming session selects nothing until its pool publishes. Until then nothing has
		// been seeded, so the previously bound session's model must not be adopted by silence.
		const firstSession = createSession('provider', SessionStatus.Completed, second.identifier, 'provider:first');
		const secondSession = createSession('provider', SessionStatus.Untitled, undefined, 'provider:second');
		const provider = disposables.add(createProvider('provider', (identifier, source) => secondSession.modelId.set(identifier, undefined, source)));
		const session = observableValue<IActiveSession | undefined>('session', firstSession.session);
		const selection = disposables.add(new SessionModelSelection(
			session,
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		provider.models = [];
		session.set(secondSession.session, undefined);
		const whileEmpty = selection.state.get().currentModel?.identifier;
		// The pool publishes, offering the very model the previous session was on.
		provider.models = [second];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			whileEmpty,
			current: selection.state.get().currentModel?.identifier,
			// The picker and the session must agree on the model a request would use.
			sessionModel: secondSession.modelId.get(),
		}, {
			whileEmpty: undefined,
			current: second.identifier,
			sessionModel: second.identifier,
		});
	});

	test('seeds a new peer chat even when its session has already finished', () => {
		// A session's status is aggregated across its chats, so a finished session can still gain a
		// brand-new chat. Emptiness is read from the chat, or that chat would never be seeded.
		const testSession = createSession('provider', SessionStatus.Completed, first.identifier);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(second.metadata.id),
			disposables.add(new NullLogService()),
		));

		const onFinishedChat = selection.state.get().currentModel?.identifier;
		// The provider starts the peer chat on the previous chat's model and says so.
		testSession.activeChat.set(createChat('chat:/provider/two', first.identifier, ChatModelSource.CarriedOver, SessionStatus.Untitled), undefined);

		assert.deepStrictEqual({
			onFinishedChat,
			onNewPeerChat: selection.state.get().currentModel?.identifier,
		}, {
			onFinishedChat: first.identifier,
			onNewPeerChat: second.identifier,
		});
	});

	test('stops showing a model once its pool empties out', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			disposables.add(new NullLogService()),
		));

		const beforeEmpty = selection.state.get().currentModel?.identifier;
		provider.models = [];
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			beforeEmpty,
			afterEmpty: selection.state.get().currentModel?.identifier,
			models: selection.state.get().models,
			hasSelectableModel: selection.state.get().hasSelectableModel,
		}, {
			beforeEmpty: first.identifier,
			afterEmpty: undefined,
			models: [],
			// Auto remains offered, so the composer can still send.
			hasSelectableModel: true,
		});
	});

	test('keeps the user\'s pick when storage is changed externally', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', (identifier, source) => testSession.modelId.set(identifier, undefined, source)));
		const storage = disposables.add(new InMemoryStorageService());
		const logService = disposables.add(new TestLogService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
			logService,
		));

		selection.selectModel(second.identifier);
		storage.storeAll([{
			key: selectedModelStorageKey,
			value: first.identifier,
			scope: StorageScope.PROFILE,
			target: StorageTarget.USER,
		}], true);

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			writes: provider.writes,
		}, {
			current: second.identifier,
			writes: [first.identifier, second.identifier],
		});
	});

	test('shows the pick even when the provider does not reflect the write', () => {
		const testSession = createSession('provider', SessionStatus.Completed, first.identifier);
		const provider = disposables.add(createProvider('provider'));
		const logService = disposables.add(new TestLogService());
		const selection = disposables.add(new SessionModelSelection(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
			logService,
		));

		selection.selectModel(second.identifier);

		assert.deepStrictEqual({
			selected: selection.state.get().currentModel?.identifier,
			providerModel: testSession.modelId.get(),
		}, {
			selected: second.identifier,
			providerModel: first.identifier,
		});
	});
});
