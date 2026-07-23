/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { getSelectedModelStorageKey, getStoredSelectedModel, storeSelectedModel } from '../../../../workbench/contrib/chat/common/chatSelectedModel.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IModelSelectionMemory, IModelSelectionSessionContext, IPendingModelSelection, ModelSelectionReason, transitionModelSelection } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ChatModelSelectionDiagnostics } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelSelectionDiagnostics.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionModelPickerOptions, ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export interface INormalizedSessionModelPickerOptions extends ISessionModelPickerOptions {
	readonly showAutoModel: boolean;
}

const DEFAULT_MODEL_PICKER_OPTIONS: INormalizedSessionModelPickerOptions = {
	useGroupedModelPicker: true,
	showFeatured: true,
	showUnavailableFeatured: false,
	showManageModelsAction: false,
	showAutoModel: true,
};

type ModelSelectionRefreshTrigger = 'sessionState' | 'configuration' | 'providers' | 'models';

interface IRememberedModelSelection {
	readonly identifier: string;
	readonly source: 'stored' | 'legacy';
}

export function normalizeModelPickerOptions(options: ISessionModelPickerOptions | undefined): INormalizedSessionModelPickerOptions {
	return {
		...DEFAULT_MODEL_PICKER_OPTIONS,
		...options,
		showAutoModel: options?.showAutoModel ?? true,
	};
}

function legacyModelPickerStorageKey(providerId: string, sessionType: string): string {
	return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}

function persistSessionModelSelection(
	session: Pick<IActiveSession, 'providerId' | 'sessionType' | 'sessionId'>,
	provider: Pick<ISessionsProvider, 'setModel'>,
	storageService: IStorageService,
	model: ILanguageModelChatMetadataAndIdentifier,
	modelTarget: string | undefined,
): void {
	provider.setModel(session.sessionId, model.identifier);
	storeSelectedModel(storageService, ChatAgentLocation.Chat, modelTarget, model.identifier);
}

export function hasSelectableModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	options: INormalizedSessionModelPickerOptions,
): boolean {
	return models.length > 0 || options.showAutoModel;
}

export const ISessionModelSelectionModel = createDecorator<ISessionModelSelectionModel>('sessionModelSelectionModel');

export interface ISessionModelSelectionState {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly pendingSelection: IPendingModelSelection | undefined;
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly options: INormalizedSessionModelPickerOptions;
	readonly hasSelectableModel: boolean;
}

export interface ISessionModelSelectionModel {
	readonly _serviceBrand: undefined;
	readonly state: IObservable<ISessionModelSelectionState>;
	selectModel(modelIdentifier: string): boolean;
}

export class SessionModelSelectionModel extends Disposable implements ISessionModelSelectionModel {

	declare readonly _serviceBrand: undefined;

	private readonly _state = observableValue<ISessionModelSelectionState>(this, {
		currentModel: undefined,
		pendingSelection: undefined,
		models: [],
		options: normalizeModelPickerOptions(undefined),
		hasSelectableModel: false,
	});
	readonly state: IObservable<ISessionModelSelectionState> = this._state;
	private readonly _providerListener = this._register(new MutableDisposable());
	private readonly _sharedDiagnostics: ChatModelSelectionDiagnostics;
	private _memory: IModelSelectionMemory = {
		sessionKey: undefined,
		lastPushedChatKey: undefined,
		currentModel: undefined,
		currentReason: undefined,
	};
	private _provider: ISessionsProvider | undefined;
	private _modelTarget: string | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super();
		this._sharedDiagnostics = new ChatModelSelectionDiagnostics(logService, this._storageService, () => {
			const session = this._session.get();
			return {
				surface: 'sessions',
				location: ChatAgentLocation.Chat,
				modelTarget: this._modelTarget,
				sessionKey: session ? this._sessionKey(session) : undefined,
				conversationKey: session?.activeChat.get().resource.toString(),
				metadata: {
					providerId: session?.providerId,
					sessionType: session?.sessionType,
					sessionId: session?.sessionId,
				},
			};
		});
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			session?.modelId.read(reader);
			session?.status.read(reader);
			session?.activeChat.read(reader);
			this._refresh('sessionState', session);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.DefaultModel)) {
				this._refresh('configuration');
			}
		}));
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._refresh('providers')));
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => this._sharedDiagnostics.logStorageChange(event, this._state.get().currentModel?.identifier)));
	}

	selectModel(modelIdentifier: string): boolean {
		const session = this._session.get();
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		if (!session || !provider) {
			this._sharedDiagnostics.report('selection-rejected', {
				requestedModel: modelIdentifier,
				reason: !session ? 'noSession' : 'noProvider',
			}, 'info');
			return false;
		}

		const snapshot = provider.getModelsSnapshot(session.sessionId);
		this._modelTarget = snapshot.modelTarget;
		const models = snapshot.models;
		const model = models.find(model => model.identifier === modelIdentifier);
		if (!model) {
			this._sharedDiagnostics.report('selection-rejected', {
				requestedModel: modelIdentifier,
				reason: 'modelUnavailable',
				availableModels: models.map(model => model.identifier).join(','),
			}, 'info');
			return false;
		}

		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		const previousState = this._state.get();
		const previousMemory = this._memory;
		const providerModelBefore = session.modelId.get();
		const storageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, snapshot.modelTarget);
		this._state.set({
			models,
			options,
			hasSelectableModel: hasSelectableModel(models, options),
			currentModel: model,
			pendingSelection: undefined,
		}, undefined);
		this._memory = {
			sessionKey: this._sessionKey(session),
			lastPushedChatKey: session.activeChat.get().resource.toString(),
			currentModel: model,
			currentReason: ModelSelectionReason.UserSelection,
		};
		this._sharedDiagnostics.report('explicit-selection', { model: model.identifier }, 'info');
		try {
			persistSessionModelSelection(session, provider, this._storageService, model, snapshot.modelTarget);
			this._sharedDiagnostics.report('explicit-selection-applied', { model: model.identifier }, 'info');
		} catch (error) {
			this._memory = previousMemory;
			this._sharedDiagnostics.report('explicit-selection-failed', { model: model.identifier, error: String(error) }, 'error');
			this._sharedDiagnostics.report('provider-selection-failed', {
				requestedModel: modelIdentifier,
				providerModelBefore,
				providerModelAfter: session.modelId.get(),
				storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE),
				error: String(error),
			}, 'error');
			this._state.set({
				models,
				options,
				hasSelectableModel: hasSelectableModel(models, options),
				currentModel: previousState.currentModel,
				pendingSelection: previousState.pendingSelection,
			}, undefined);
			throw error;
		}
		this._sharedDiagnostics.report('provider-selection-applied', {
			requestedModel: modelIdentifier,
			providerModelBefore,
			providerModelAfter: session.modelId.get(),
			storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE),
		}, 'info');
		return true;
	}

	private _refresh(trigger: ModelSelectionRefreshTrigger, session = this._session.get()): void {
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		this._setProvider(provider);
		const sessionKey = session ? this._sessionKey(session) : undefined;
		const sessionModelId = session?.modelId.get();
		const previousState = this._state.get();
		const previousMemory = this._memory;
		const sessionContext: IModelSelectionSessionContext = session ? {
			kind: session.status.get() === SessionStatus.Untitled ? 'untitled' : 'existing',
			key: sessionKey!,
			chatKey: session.activeChat.get().resource.toString(),
			modelId: sessionModelId,
		} : { kind: 'none' };
		const currentReason = sessionKey === this._memory.sessionKey ? this._memory.currentReason : undefined;
		const initialSnapshot = session && provider
			? provider.getModelsSnapshot(session.sessionId, sessionModelId)
			: { models: [], desiredModelResolution: { kind: 'notRequested' } as const, modelTarget: undefined };
		const rememberedSelection = session ? this._getRememberedModel(session, initialSnapshot.modelTarget) : undefined;
		const rememberedModelId = rememberedSelection?.identifier;
		const desiredModelIdentifier = sessionContext.kind === 'untitled'
			? (currentReason === ModelSelectionReason.FirstAvailable ? rememberedModelId : (sessionModelId ?? rememberedModelId))
			: sessionModelId;
		const snapshot = desiredModelIdentifier !== sessionModelId && session && provider
			? provider.getModelsSnapshot(session.sessionId, desiredModelIdentifier)
			: initialSnapshot;
		const fallbackModel = snapshot.models.find(model => model.metadata.isDefaultForLocation[ChatAgentLocation.Chat]) ?? snapshot.models[0];
		const result = transitionModelSelection({
			session: sessionContext,
			models: {
				available: snapshot.models,
				configuredModel: this._configurationService.getValue<string>(ChatConfiguration.DefaultModel),
				rememberedModelId,
				desiredModelResolution: snapshot.desiredModelResolution,
				fallbackModel,
			},
			previous: { ...this._memory, currentReason },
		});
		this._memory = {
			sessionKey: result.sessionKey,
			lastPushedChatKey: result.lastPushedChatKey,
			currentModel: result.currentModel,
			currentReason: result.currentReason,
		};
		this._modelTarget = snapshot.modelTarget;
		const models = snapshot.models;
		const options = normalizeModelPickerOptions(session && provider ? provider.getModelPickerOptions(session.sessionId) : undefined);

		this._state.set({
			models,
			options,
			hasSelectableModel: !!session && !!provider && hasSelectableModel(models, options),
			currentModel: result.currentModel,
			pendingSelection: result.pendingSelection,
		}, undefined);
		this._sharedDiagnostics.report('transition', {
			trigger,
			sessionKind: sessionContext.kind,
			modelTarget: snapshot.modelTarget,
			configuredModel: this._configurationService.getValue<string>(ChatConfiguration.DefaultModel),
			rememberedModel: rememberedModelId,
			rememberedSource: rememberedSelection?.source,
			desiredModel: desiredModelIdentifier,
			desiredResolution: snapshot.desiredModelResolution.kind,
			fallbackModel: fallbackModel?.identifier,
			availableModels: snapshot.models.map(model => model.identifier).join(','),
			previousModel: previousMemory.currentModel?.identifier,
			previousReason: currentReason,
			resultModel: result.currentModel?.identifier,
			resultReason: result.currentReason,
			pendingReference: result.pendingSelection?.reference,
			effect: result.effect.kind,
			effectModel: result.effect.kind === 'apply' ? result.effect.model.identifier : undefined,
			effectReason: result.effect.kind === 'none' ? undefined : result.effect.reason,
		}, result.effect.kind === 'none' && previousMemory.currentModel?.identifier === result.currentModel?.identifier ? 'debug' : 'info');

		if (result.effect.kind === 'apply' && session && provider) {
			const effect = result.effect;
			const providerModelBefore = session.modelId.get();
			try {
				provider.setModel(session.sessionId, effect.model.identifier);
			} catch (error) {
				this._memory = previousMemory;
				this._state.set(previousState, undefined);
				this._sharedDiagnostics.report('provider-automatic-selection-failed', {
					model: effect.model.identifier,
					reason: effect.reason,
					providerModelBefore,
					providerModelAfter: session.modelId.get(),
					error: String(error),
				}, 'error');
				throw error;
			}
			this._sharedDiagnostics.report('provider-automatic-selection-applied', {
				model: effect.model.identifier,
				reason: effect.reason,
				providerModelBefore,
				providerModelAfter: session.modelId.get(),
			}, 'info');
		}
	}

	private _getRememberedModel(session: IActiveSession, modelTarget: string | undefined): IRememberedModelSelection | undefined {
		const storedSelection = getStoredSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget);
		if (storedSelection) {
			return { identifier: storedSelection, source: 'stored' };
		}

		const legacyStorageKey = legacyModelPickerStorageKey(session.providerId, session.sessionType);
		const legacyIdentifier = this._storageService.get(legacyStorageKey, StorageScope.PROFILE);
		if (legacyIdentifier) {
			storeSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget, legacyIdentifier);
			this._sharedDiagnostics.report('legacy-selection-migrated', {
				legacyStorageKey,
				model: legacyIdentifier,
			}, 'info');
			return { identifier: legacyIdentifier, source: 'legacy' };
		}
		return undefined;
	}

	private _setProvider(provider: ISessionsProvider | undefined): void {
		if (this._provider === provider) {
			return;
		}
		this._provider = provider;
		this._providerListener.value = provider?.onDidChangeModels(() => this._refresh('models'));
	}

	private _sessionKey(session: IActiveSession): string {
		return session.sessionId;
	}

}
