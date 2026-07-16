/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { hasSelectableModel, INormalizedSessionModelPickerOptions, modelPickerStorageKey, normalizeModelPickerOptions, persistSessionModelSelection, transitionModelSelection } from './modelPickerSelection.js';

export const ISessionModelSelectionModel = createDecorator<ISessionModelSelectionModel>('sessionModelSelectionModel');

export interface ISessionModelSelectionState {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
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
		models: [],
		options: normalizeModelPickerOptions(undefined),
		hasSelectableModel: false,
	});
	readonly state: IObservable<ISessionModelSelectionState> = this._state;

	private readonly _providerListener = this._register(new MutableDisposable());
	private _provider: ISessionsProvider | undefined;
	private _previousSessionKey: string | undefined;
	private _lastPushedChatKey: string | undefined;

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

		const models = provider.getModelsSnapshot(session.sessionId).models;
		const model = models.find(model => model.identifier === modelIdentifier);
		if (!model) {
			return false;
		}

		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		this._state.set({
			models,
			options,
			hasSelectableModel: hasSelectableModel(models, options),
			currentModel: model,
		}, undefined);
		this._previousSessionKey = this._sessionKey(session);
		this._lastPushedChatKey = session.activeChat.get().resource.toString();
		this._applyModel(session, provider, model);
		return true;
	}

	private _refresh(session = this._session.get()): void {
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		this._setProvider(provider);
		const sessionKey = session ? this._sessionKey(session) : undefined;
		const sessionModelId = session?.modelId.get();
		const snapshot = session && provider ? provider.getModelsSnapshot(session.sessionId, sessionModelId) : { models: [], isResolved: false };
		const models = snapshot.models;
		const options = normalizeModelPickerOptions(session && provider ? provider.getModelPickerOptions(session.sessionId) : undefined);
		const rememberedModelId = session
			? this._storageService.get(modelPickerStorageKey(session.providerId, session.sessionType), StorageScope.PROFILE)
			: undefined;
		const result = transitionModelSelection({
			session: session ? {
				kind: session.status.get() === SessionStatus.Untitled ? 'untitled' : 'existing',
				key: sessionKey!,
				chatKey: session.activeChat.get().resource.toString(),
				modelId: sessionModelId,
				modelsResolved: !!sessionModelId && snapshot.isResolved,
			} : { kind: 'none' },
			models: {
				available: models,
				configuredModel: this._configurationService.getValue<string>(ChatConfiguration.DefaultModel),
				rememberedModelId,
			},
			previous: {
				sessionKey: this._previousSessionKey,
				lastPushedChatKey: this._lastPushedChatKey,
				currentModel: this._state.get().currentModel,
			},
		});

		this._previousSessionKey = result.sessionKey;
		this._lastPushedChatKey = result.lastPushedChatKey;
		this._state.set({
			models,
			options,
			hasSelectableModel: !!session && !!provider && hasSelectableModel(models, options),
			currentModel: result.currentModel,
		}, undefined);

		if (result.effect.kind === 'apply' && session && provider) {
			this._applyModel(session, provider, result.effect.model);
		}
	}

	private _setProvider(provider: ISessionsProvider | undefined): void {
		if (this._provider === provider) {
			return;
		}
		this._provider = provider;
		this._providerListener.value = provider?.onDidChangeModels(() => this._refresh());
	}

	private _applyModel(session: IActiveSession, provider: ISessionsProvider, model: ILanguageModelChatMetadataAndIdentifier): void {
		persistSessionModelSelection(session, provider, this._storageService, model);
	}

	private _sessionKey(session: IActiveSession): string {
		return `${session.providerId}/${session.sessionType}`;
	}

}
