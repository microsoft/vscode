/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSelectedModelIsDefaultStorageKey, getSelectedModelStorageKey, storeSelectedModel } from '../../../../../workbench/contrib/chat/common/chatSelectedModel.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { resolveModelIdentifier } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider, ISessionModelPickerOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionModelSelectionModel } from '../../browser/sessionModelSelectionModel.js';

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
const selectedModelIsDefaultStorageKey = getSelectedModelIsDefaultStorageKey(ChatAgentLocation.Chat, modelTarget);

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

interface ITestSession {
	readonly session: IActiveSession;
	readonly modelId: ReturnType<typeof observableValue<string | undefined>>;
	readonly activeChat: ReturnType<typeof observableValue<IChat>>;
}

function createSession(providerId: string, status: SessionStatus, selectedModelId?: string): ITestSession {
	const modelId = observableValue<string | undefined>(`${providerId}.model`, selectedModelId);
	const activeChat = observableValue<IChat>(`${providerId}.activeChat`, { resource: URI.parse(`chat:/${providerId}/one`) } as IChat);
	return {
		modelId,
		activeChat,
		session: {
			providerId,
			sessionType: 'type',
			sessionId: `${providerId}:session`,
			resource: URI.parse(`session:/${providerId}`),
			modelId,
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
	dispose(): void;
}

function createProvider(id: string, onSetModel?: (modelIdentifier: string) => void): ITestProvider {
	const modelChanges = new Emitter<void>();
	const provider = {
		id,
		models: [first, second],
		modelChanges,
		writes: [],
		desiredModelIds: [],
		getModelsCalls: 0,
		modelsResolved: true,
		dispose: () => modelChanges.dispose(),
		onDidChangeModels: modelChanges.event,
		getModelsSnapshot(_sessionId: string, desiredModelId?: string) {
			provider.getModelsCalls++;
			provider.desiredModelIds.push(desiredModelId);
			return { models: provider.models, desiredModelResolution: resolveModelIdentifier(provider.models, desiredModelId, provider.modelsResolved), modelTarget };
		},
		getModelPickerOptions(): ISessionModelPickerOptions {
			return {
				useGroupedModelPicker: true,
				showFeatured: true,
				showUnavailableFeatured: false,
				showManageModelsAction: false,
			};
		},
		setModel(_sessionId: string, modelIdentifier: string) {
			provider.writes.push(modelIdentifier);
			onSetModel?.(modelIdentifier);
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

suite('SessionModelSelectionModel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('migrates a legacy Sessions preference and seeds a draft exactly once', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(legacyModelPickerStorageKey('provider', 'type'), second.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
		));

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			models: selection.state.get().models.map(model => model.identifier),
			showAutoModel: selection.state.get().options.showAutoModel,
			hasSelectableModel: selection.state.get().hasSelectableModel,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			storedAsDefault: storage.getBoolean(selectedModelIsDefaultStorageKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
			writes: provider.writes,
		}, {
			current: second.identifier,
			models: [first.identifier, second.identifier],
			showAutoModel: true,
			hasSelectableModel: true,
			stored: second.identifier,
			storedAsDefault: false,
			profileUserKeys: [selectedModelStorageKey, selectedModelIsDefaultStorageKey].sort(),
			writes: [second.identifier],
		});
	});

	test('restores an existing session without writing to its provider', () => {
		const testSession = createSession('provider', SessionStatus.Completed, second.identifier);
		const provider = disposables.add(createProvider('provider'));
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
		));

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: second.identifier,
			writes: [],
		});
	});

	test('replaces the current provider listener on session switch', () => {
		const firstSession = createSession('firstProvider', SessionStatus.Completed, first.identifier);
		const secondSession = createSession('secondProvider', SessionStatus.Completed, second.identifier);
		const firstProvider = disposables.add(createProvider('firstProvider'));
		const secondProvider = disposables.add(createProvider('secondProvider'));
		const session = observableValue<IActiveSession | undefined>('session', firstSession.session);
		const selection = disposables.add(new SessionModelSelectionModel(
			session,
			createProvidersService([firstProvider, secondProvider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
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
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
		));

		const selected = selection.selectModel(second.identifier);
		provider.models = [first];
		const rejected = selection.selectModel(second.identifier);

		assert.deepStrictEqual({
			selected,
			rejected,
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
			storedAsDefault: storage.getBoolean(selectedModelIsDefaultStorageKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
			writes: provider.writes,
		}, {
			selected: true,
			rejected: false,
			current: second.identifier,
			stored: second.identifier,
			storedAsDefault: false,
			profileUserKeys: [selectedModelStorageKey, selectedModelIsDefaultStorageKey].sort(),
			writes: [second.identifier],
		});
	});

	test('does not remember a selection rejected by the provider', () => {
		const testSession = createSession('provider', SessionStatus.Completed, first.identifier);
		const storage = disposables.add(new InMemoryStorageService());
		const provider = disposables.add(createProvider('provider', () => { throw new Error('rejected'); }));
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
		));

		assert.throws(() => selection.selectModel(second.identifier), /rejected/);
		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
		}, {
			current: first.identifier,
			stored: undefined,
		});
	});

	test('clears a rejected draft selection when the provider has no previous model', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const storage = disposables.add(new InMemoryStorageService());
		const provider = disposables.add(createProvider('provider', () => { throw new Error('rejected'); }));
		provider.models = [];
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
		));

		testSession.modelId.set(second.identifier, undefined);

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: second.identifier,
			writes: [first.identifier],
		});
	});

	test('requires a registered provider before enabling send', () => {
		const testSession = createSession('missing', SessionStatus.Untitled);
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, { identifier: second.identifier, isDefault: false });
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, { identifier: second.identifier, isDefault: false });
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
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
				pending: { source: 'desired', reference: second.identifier },
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService('missing-family'),
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		provider.models = [first];
		provider.modelsResolved = false;
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, { identifier: second.identifier, isDefault: false });
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			storage,
			createConfigurationService(),
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
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(second.metadata.id),
		));

		selection.selectModel(first.identifier);
		provider.modelChanges.fire();

		assert.deepStrictEqual({
			current: selection.state.get().currentModel?.identifier,
			writes: provider.writes,
		}, {
			current: first.identifier,
			writes: [second.identifier, first.identifier],
		});
	});

	test('re-pushes the current model when an untitled chat is reused', () => {
		const testSession = createSession('provider', SessionStatus.Untitled);
		const provider = disposables.add(createProvider('provider', identifier => testSession.modelId.set(identifier, undefined)));
		const selection = disposables.add(new SessionModelSelectionModel(
			observableValue<IActiveSession | undefined>('session', testSession.session),
			createProvidersService([provider]),
			disposables.add(new InMemoryStorageService()),
			createConfigurationService(),
		));

		testSession.activeChat.set({ resource: URI.parse('chat:/provider/two') } as IChat, undefined);

		assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
			current: first.identifier,
			writes: [first.identifier, first.identifier],
		});
	});
});
