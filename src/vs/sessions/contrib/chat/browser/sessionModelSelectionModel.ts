/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { getStoredSelectedModel, storeSelectedModel } from '../../../../workbench/contrib/chat/common/chatSelectedModel.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IPendingModelSelection, ModelSelectionApplyReason, ModelSelectionReason, transitionModelSelection } from '../../../../workbench/contrib/chat/common/modelSelection.js';
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
	storeSelectedModel(storageService, ChatAgentLocation.Chat, modelTarget, {
		identifier: model.identifier,
		isDefault: !!model.metadata.isDefaultForLocation[ChatAgentLocation.Chat],
	});
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
	private _provider: ISessionsProvider | undefined;
	private _previousSessionKey: string | undefined;
	private _lastPushedChatKey: string | undefined;
	private _currentReason: ModelSelectionApplyReason | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			session?.modelId.read(reader);
			session?.status.read(reader);
			session?.activeChat.read(reader);
			this._refresh(session);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.DefaultModel)) {
				this._refresh();
			}
		}));
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._refresh()));
	}

	selectModel(modelIdentifier: string): boolean {
		const session = this._session.get();
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		if (!session || !provider) {
			return false;
		}

		const snapshot = provider.getModelsSnapshot(session.sessionId);
		const models = snapshot.models;
		const model = models.find(model => model.identifier === modelIdentifier);
		if (!model) {
			return false;
		}

		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		const previousState = this._state.get();
		const previousSessionKey = this._previousSessionKey;
		const previousLastPushedChatKey = this._lastPushedChatKey;
		const previousReason = this._currentReason;
		this._state.set({
			models,
			options,
			hasSelectableModel: hasSelectableModel(models, options),
			currentModel: model,
			pendingSelection: undefined,
		}, undefined);
		this._previousSessionKey = this._sessionKey(session);
		this._lastPushedChatKey = session.activeChat.get().resource.toString();
		this._currentReason = ModelSelectionReason.UserSelection;
		try {
			persistSessionModelSelection(session, provider, this._storageService, model, snapshot.modelTarget);
		} catch (error) {
			this._previousSessionKey = previousSessionKey;
			this._lastPushedChatKey = previousLastPushedChatKey;
			this._currentReason = previousReason;
			this._state.set({
				models,
				options,
				hasSelectableModel: hasSelectableModel(models, options),
				currentModel: previousState.currentModel,
				pendingSelection: previousState.pendingSelection,
			}, undefined);
			throw error;
		}
		return true;
	}

	private _refresh(session = this._session.get()): void {
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		this._setProvider(provider);
		const sessionKey = session ? this._sessionKey(session) : undefined;
		const currentReason = sessionKey === this._previousSessionKey ? this._currentReason : undefined;
		const sessionModelId = session?.modelId.get();
		const initialSnapshot = session && provider ? provider.getModelsSnapshot(session.sessionId, sessionModelId) : { models: [], desiredModelResolution: { kind: 'notRequested' } as const, modelTarget: undefined };
		const rememberedModelId = session ? this._getRememberedModelId(session, initialSnapshot.modelTarget) : undefined;
		// A provisional fallback keeps chasing the remembered model instead of its temporary provider model id.
		const desiredModelIdentifier = session?.status.get() === SessionStatus.Untitled
			? (currentReason === ModelSelectionReason.FirstAvailable ? rememberedModelId : (sessionModelId ?? rememberedModelId))
			: sessionModelId;
		const snapshot = session && provider && desiredModelIdentifier !== sessionModelId
			? provider.getModelsSnapshot(session.sessionId, desiredModelIdentifier)
			: initialSnapshot;
		const models = snapshot.models;
		const options = normalizeModelPickerOptions(session && provider ? provider.getModelPickerOptions(session.sessionId) : undefined);
		const result = transitionModelSelection({
			session: session ? {
				kind: session.status.get() === SessionStatus.Untitled ? 'untitled' : 'existing',
				key: sessionKey!,
				chatKey: session.activeChat.get().resource.toString(),
				modelId: sessionModelId,
			} : { kind: 'none' },
			models: {
				available: models,
				configuredModel: this._configurationService.getValue<string>(ChatConfiguration.DefaultModel),
				waitForConfiguredModel: false,
				rememberedModelId,
				desiredModelResolution: snapshot.desiredModelResolution,
				fallbackModel: models.find(model => model.metadata.isDefaultForLocation[ChatAgentLocation.Chat]) ?? models[0],
			},
			previous: {
				sessionKey: this._previousSessionKey,
				lastPushedChatKey: this._lastPushedChatKey,
				currentModel: this._state.get().currentModel,
				currentReason,
			},
		});

		this._previousSessionKey = result.sessionKey;
		this._lastPushedChatKey = result.lastPushedChatKey;
		this._currentReason = result.currentReason;
		this._state.set({
			models,
			options,
			hasSelectableModel: !!session && !!provider && hasSelectableModel(models, options),
			currentModel: result.currentModel,
			pendingSelection: result.pendingSelection,
		}, undefined);

		if (result.effect.kind === 'apply' && session && provider) {
			provider.setModel(session.sessionId, result.effect.model.identifier);
		}
	}

	private _getRememberedModelId(session: IActiveSession, modelTarget: string | undefined): string | undefined {
		const storedSelection = getStoredSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget);
		if (storedSelection) {
			return storedSelection.identifier;
		}

		const legacyIdentifier = this._storageService.get(legacyModelPickerStorageKey(session.providerId, session.sessionType), StorageScope.PROFILE);
		if (legacyIdentifier) {
			storeSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget, { identifier: legacyIdentifier, isDefault: false });
		}
		return legacyIdentifier;
	}

	private _setProvider(provider: ISessionsProvider | undefined): void {
		if (this._provider === provider) {
			return;
		}
		this._provider = provider;
		this._providerListener.value = provider?.onDidChangeModels(() => this._refresh());
	}

	private _sessionKey(session: IActiveSession): string {
		return `${session.providerId}/${session.sessionType}`;
	}

}
