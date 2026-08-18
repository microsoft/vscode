/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ChatInputModelSelectionController, IChatInputModelSelectionRuntime } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputModelSelectionController.js';
import { ChatModelSelectionDiagnostics } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelSelectionDiagnostics.js';
import { getSelectedModelStorageKey, getStoredSelectedModel, storeSelectedModel } from '../../../../workbench/contrib/chat/common/chatSelectedModel.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IntendedModelSlot } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IPendingModelSelection, isInConversationModelChoice, ModelSelectionReason, RestoredModelReason } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatModelSource, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { createModelSelectionState, EMPTY_MODEL_SELECTION_STATE, INormalizedSessionModelPickerOptions, ISessionModelSelectionState, normalizeModelPickerOptions } from './sessionModelPickerState.js';

/** Bounded: a long-lived window binds arbitrarily many chats, and old ones are not worth the memory. */
const CONVERSATION_CACHE_SIZE = 50;

/**
 * Whether the chat owns this model. An absent source counts as owned, so a model the provider
 * merely failed to account for is not overwritten by `chat.defaultModel`.
 */
function isChatOwnModel(source: ChatModelSource | undefined): boolean {
	return source !== ChatModelSource.CarriedOver;
}

/** How the controller records a model the chat already has. */
export function restoreReasonForSource(source: ChatModelSource | undefined): RestoredModelReason {
	return isChatOwnModel(source)
		? ModelSelectionReason.RestoredChoice
		: ModelSelectionReason.SessionRestore;
}

/** How to report a decision the controller made. The same line, read the other way. */
function sourceForReason(reason: ModelSelectionReason | undefined): ChatModelSource {
	return isInConversationModelChoice(reason) ? ChatModelSource.Chosen : ChatModelSource.CarriedOver;
}

type ModelSelectionRefreshTrigger = 'sessionState' | 'configuration' | 'providers' | 'models';

function legacyModelPickerStorageKey(providerId: string, sessionType: string): string {
	return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}

/** Per conversation, not per input, so none of it can be read as another chat's answer. */
class ConversationModelSelection {
	/** The model this conversation is meant to run on, whatever the pool can offer right now. */
	readonly intent = new IntendedModelSlot();
	/** True once driven to a model the pool actually offers; a half-published pool does not count. */
	seeded = false;
}

export const ISessionModelSelection = createDecorator<ISessionModelSelection>('sessionModelSelection');

export interface ISessionModelSelection {
	readonly _serviceBrand: undefined;
	readonly state: IObservable<ISessionModelSelectionState>;
	selectModel(modelIdentifier: string): boolean;
}

/**
 * Model selection for the Agents Window, on top of the shared
 * {@link ChatInputModelSelectionController}. Turns the active session and its provider into the
 * runtime the controller expects, and its decisions back into a provider write and picker state.
 * Precedence lives in the controller, so the two windows cannot drift on it.
 *
 * Mostly translation. What is left here is when a conversation counts as seeded, and when to wait
 * for an unpublished model rather than write a stand-in through to a backend.
 */
export class SessionModelSelection extends Disposable implements ISessionModelSelection {

	declare readonly _serviceBrand: undefined;

	private readonly _state = observableValue<ISessionModelSelectionState>(this, EMPTY_MODEL_SELECTION_STATE);
	readonly state: IObservable<ISessionModelSelectionState> = this._state;

	private readonly _providerListener = this._register(new MutableDisposable());
	private readonly _diagnostics: ChatModelSelectionDiagnostics;
	private readonly _controller: ChatInputModelSelectionController;
	/**
	 * What this input knows about each conversation it has bound. The controller only ever reaches
	 * the bound conversation's record, so one chat's model selection cannot be applied to another.
	 */
	private readonly _conversations = new LRUCache<string, ConversationModelSelection>(CONVERSATION_CACHE_SIZE);
	private readonly _unboundConversation = new ConversationModelSelection();

	private _activeSession: IActiveSession | undefined;
	private _activeProvider: ISessionsProvider | undefined;
	private _listenedProvider: ISessionsProvider | undefined;
	private _models: readonly ILanguageModelChatMetadataAndIdentifier[] = [];
	private _modelTarget: string | undefined;
	private _boundSessionKey: string | undefined;
	private _boundConversationKey: string | undefined;
	/** Read from the chat, not the session: session status aggregates across peer chats. */
	private _chatIsEmpty = false;
	/** The conversation's own model is unknown but presumed to exist: show a selection, never write it. */
	private _displayOnly = false;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super();
		this._diagnostics = new ChatModelSelectionDiagnostics(logService, this._storageService, () => {
			const session = this._session.get();
			return {
				surface: 'sessions',
				location: ChatAgentLocation.Chat,
				modelTarget: this._modelTarget,
				sessionKey: session?.sessionId,
				conversationKey: session?.activeChat.get().resource.toString(),
				metadata: {
					providerId: session?.providerId,
					sessionType: session?.sessionType,
					sessionId: session?.sessionId,
				},
			};
		});
		this._controller = this._register(new ChatInputModelSelectionController(this._createRuntime(), this._diagnostics));
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			session?.modelId.read(reader);
			session?.status.read(reader);
			const chat = session?.activeChat.read(reader);
			chat?.status.read(reader);
			// Where the model came from is what decides whether it outranks `chat.defaultModel`.
			chat?.modelSource.read(reader);
			this._refresh('sessionState', session);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.DefaultModel)) {
				this._refresh('configuration');
			}
		}));
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._refresh('providers')));
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => {
			this._diagnostics.logStorageChange(event, this._state.get().currentModel?.identifier);
		}));
	}

	selectModel(modelIdentifier: string): boolean {
		const session = this._session.get();
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		if (!session || !provider) {
			this._diagnostics.report('selection-rejected', {
				requestedModel: modelIdentifier,
				reason: !session ? 'noSession' : 'noProvider',
			}, 'info');
			return false;
		}

		// Fresh snapshot: the pool the picker rendered from may already be stale.
		const snapshot = provider.getModelsSnapshot(session.sessionId);
		this._modelTarget = snapshot.modelTarget;
		this._models = snapshot.models;
		const model = snapshot.models.find(model => model.identifier === modelIdentifier);
		if (!model) {
			this._diagnostics.report('selection-rejected', {
				requestedModel: modelIdentifier,
				reason: 'modelUnavailable',
				availableModels: snapshot.models.map(model => model.identifier).join(','),
			}, 'info');
			return false;
		}

		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		const providerModelBefore = session.modelId.get();
		const storageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, snapshot.modelTarget);
		const conversation = this._conversation();
		try {
			this._controller.applySelection(model, () => {
				provider.setModel(session.sessionId, session.activeChat.get().resource, model.identifier, ChatModelSource.Chosen);
				storeSelectedModel(this._storageService, ChatAgentLocation.Chat, snapshot.modelTarget, model.identifier);
			}, true, true);
		} catch (error) {
			this._diagnostics.report('provider-selection-failed', {
				requestedModel: modelIdentifier,
				providerModelBefore,
				providerModelAfter: session.modelId.get(),
				storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE),
				error: String(error),
			}, 'error');
			throw error;
		}
		conversation.seeded = true;
		this._publish(options, undefined);
		this._diagnostics.report('provider-selection-applied', {
			requestedModel: modelIdentifier,
			providerModelBefore,
			providerModelAfter: session.modelId.get(),
			storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE),
		}, 'info');
		return true;
	}

	private _createRuntime(): IChatInputModelSelectionRuntime {
		return {
			// The pool's target, not the session type: it is what the provider scopes models by.
			getCurrentSessionType: () => this._modelTarget,
			isEmpty: () => this._chatIsEmpty,
			getModels: () => [...this._models],
			getAllModels: () => [...this._models],
			getConfiguredModelValue: () => this._configurationService.getValue<string>(ChatConfiguration.DefaultModel),
			// A session runs whatever its provider published: no mode, nowhere else to show it.
			isModelSupportedHere: () => true,
			getDeclaredDefaultModel: models => models.find(model => model.metadata.isDefaultForLocation[ChatAgentLocation.Chat]),
			getBoundConversationKey: () => this._boundConversationKey,
			getIntentHolder: () => this._conversation().intent,
			applyModel: model => this._pushModelToProvider(model),
			// The optional members are absent on purpose: the snapshot is already the session's pool,
			// `_refresh` owns refreshing, and sessions have no per-model configuration.
		};
	}

	/** Unreachable while another chat is bound, so one chat's selection cannot reach another. */
	private _conversation(): ConversationModelSelection {
		const conversationKey = this._boundConversationKey;
		if (!conversationKey) {
			return this._unboundConversation;
		}
		let conversation = this._conversations.get(conversationKey);
		if (!conversation) {
			conversation = new ConversationModelSelection();
			this._conversations.set(conversationKey, conversation);
		}
		return conversation;
	}

	private _refresh(trigger: ModelSelectionRefreshTrigger, session = this._session.get()): void {
		const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		this._setProvider(provider);
		this._activeSession = session;
		this._activeProvider = provider;

		if (!session || !provider) {
			this._boundSessionKey = undefined;
			this._boundConversationKey = undefined;
			this._chatIsEmpty = false;
			this._displayOnly = false;
			// Nothing to clear: each conversation's state lives in its own record.
			this._models = [];
			this._modelTarget = undefined;
			this._state.set(EMPTY_MODEL_SELECTION_STATE, undefined);
			return;
		}

		const conversationKey = session.activeChat.get().resource.toString();
		// Scoped to the active chat: peer chats in one session each keep their own model.
		const chat = session.activeChat.get();
		const chatModelId = session.modelId.get();
		// A model the provider cannot account for is read as the chat's own.
		const chatModelSource = chatModelId ? (chat.modelSource.get() ?? ChatModelSource.Chosen) : undefined;
		// Undefined only when the chat has no model, which is the one case with no authority at all.
		const chatModelReason = chatModelSource === undefined ? undefined : restoreReasonForSource(chatModelSource);
		const baseSnapshot = provider.getModelsSnapshot(session.sessionId, chatModelId);
		const remembered = this._getRememberedModel(session, baseSnapshot.modelTarget);

		const rebound = session.sessionId !== this._boundSessionKey || conversationKey !== this._boundConversationKey;
		// A chat's own model always outranks the remembered preference, which only seeds a chat
		// that has yet to run on anything. Reading it per chat is what keeps one chat's choice out
		// of another's: the incoming chat brings its own model with it.
		const desiredModelId = chatModelId ?? remembered;
		const snapshot = desiredModelId === chatModelId ? baseSnapshot : provider.getModelsSnapshot(session.sessionId, desiredModelId);

		this._models = snapshot.models;
		this._modelTarget = snapshot.modelTarget;
		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		// The provider resolves the desired model: a host republishes it under its own identifier,
		// so matching the raw one would miss it.
		const resolvedDesiredModel = snapshot.desiredModelResolution.kind === 'available'
			? snapshot.desiredModelResolution.model
			: undefined;

		// Bind first, so whatever the controller intends is recorded against this conversation.
		this._boundSessionKey = session.sessionId;
		this._boundConversationKey = conversationKey;
		this._chatIsEmpty = chat.status.get() === SessionStatus.Untitled;
		// A conversation that has run has a model of its own, even if the provider has not said what
		// it is. Show a stand-in, never write one: the write would change what it runs on.
		this._displayOnly = !chatModelId && !this._chatIsEmpty;
		if (rebound) {
			// Unconditional: what spoke for the previous conversation must not outlive it.
			this._controller.beginConversationSwitch();
		}

		// Only a conversation that could be written to has anything to wait for. A display-only one
		// writes nothing either way (see `_pushModelToProvider`), so waiting would blank its picker
		// and block its composer to prevent a write that was never going to happen.
		if (snapshot.desiredModelResolution.kind === 'pending'
			&& !this._displayOnly
			&& !this._controller.configuredDefaultToSeed(chatModelReason)) {
			// Wait rather than push a stand-in through to the backend; re-seed once the pool settles.
			this._conversation().seeded = false;
			this._diagnostics.report('await-desired-model', {
				trigger,
				desiredModel: snapshot.desiredModelResolution.identifier,
				availableModels: snapshot.models.map(model => model.identifier).join(','),
			}, 'info');
			this._publish(options, { reference: snapshot.desiredModelResolution.identifier });
			return;
		}

		try {
			this._drive(rebound, chatModelId, chatModelSource, remembered, resolvedDesiredModel, conversationKey);
		} catch (error) {
			// The provider refused the write. Retry on the next refresh, and show what it actually has.
			this._conversation().seeded = false;
			this._publish(options, undefined, this._models.find(model => model.identifier === session.modelId.get()));
			return;
		}
		this._publish(options, undefined);
	}

	/**
	 * Hands the session's state to the controller through the same entry points Workbench chat
	 * uses: seed a newly bound conversation, follow the conversation's own model when it changes
	 * underneath us, and reconcile against the pool that was just published.
	 */
	private _drive(
		rebound: boolean,
		chatModelId: string | undefined,
		chatModelSource: ChatModelSource | undefined,
		rememberedModelId: string | undefined,
		resolvedDesiredModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		conversationKey: string,
	): void {
		// The provider's answer for whatever was asked about: the chat's model, else the preference.
		const chatModel = chatModelId
			? (resolvedDesiredModel ?? this._models.find(model => model.identifier === chatModelId))
			: undefined;
		const rememberedId = chatModelId ? rememberedModelId : (resolvedDesiredModel?.identifier ?? rememberedModelId);
		const conversation = this._conversation();
		if (rebound || !conversation.seeded) {
			// Set first: a provider echo can synchronously re-enter here, and must see seeding started.
			conversation.seeded = true;
			if (chatModel) {
				// A model the chat already runs on outranks `chat.defaultModel`.
				this._claimChatModel(chatModel, chatModelSource, conversationKey);
			} else {
				this._controller.initialize(rememberedId);
			}
			// Only counts once the pool actually offers what was selected.
			conversation.seeded = this._isShowingSelectableModel();
		} else if (chatModel && this._conversationSelectionChanged(chatModel, chatModelSource)) {
			// It moved without this input asking, so adopt it. A peer promoting our automatic pick to
			// their own choice counts, even on the same model.
			this._claimChatModel(chatModel, chatModelSource, conversationKey);
		}
		this._controller.reconcileModelListChange(this._models);
		conversation.seeded ||= this._isShowingSelectableModel();
	}

	/** Whether the controller is on a model this session's pool actually offers. */
	private _isShowingSelectableModel(): boolean {
		const current = this._controller.currentModel.get();
		return !!current && this._models.some(model => model.identifier === current.identifier);
	}

	/**
	 * Whether the chat's model, or whether it counts as the chat's own, differs from what we hold.
	 * Our own echo matches on both, since the source came from the reason we still hold.
	 */
	private _conversationSelectionChanged(
		chatModel: ILanguageModelChatMetadataAndIdentifier,
		source: ChatModelSource | undefined,
	): boolean {
		return chatModel.identifier !== this._controller.currentModel.get()?.identifier
			|| isChatOwnModel(source) !== isInConversationModelChoice(this._controller.selectionReason);
	}

	/** Adopts the model the chat is on, telling the controller whether it counts as a choice. */
	private _claimChatModel(
		chatModel: ILanguageModelChatMetadataAndIdentifier,
		source: ChatModelSource | undefined,
		conversationKey: string,
	): void {
		this._controller.syncFromConversationState(
			chatModel,
			undefined,
			this._modelTarget,
			conversationKey,
			false,
			restoreReasonForSource(source),
		);
	}

	private _pushModelToProvider(model: ILanguageModelChatMetadataAndIdentifier): void {
		const session = this._activeSession;
		const provider = this._activeProvider;
		if (!session || !provider) {
			return;
		}
		if (this._displayOnly) {
			this._diagnostics.report('provider-write-withheld', {
				model: model.identifier,
				reason: this._controller.selectionReason,
			}, 'info');
			return;
		}
		const providerModelBefore = session.modelId.get();
		if (providerModelBefore === model.identifier) {
			// Already what it runs on. Re-pushing round-trips a no-op, and claiming it would mask a
			// choice made elsewhere.
			return;
		}
		// The controller records the reason before handing over, so this is the reason for this write.
		const source = sourceForReason(this._controller.selectionReason);
		try {
			provider.setModel(session.sessionId, session.activeChat.get().resource, model.identifier, source);
		} catch (error) {
			this._diagnostics.report('provider-automatic-selection-failed', {
				model: model.identifier,
				reason: this._controller.selectionReason,
				providerModelBefore,
				providerModelAfter: session.modelId.get(),
				error: String(error),
			}, 'error');
			throw error;
		}
		this._diagnostics.report('provider-automatic-selection-applied', {
			model: model.identifier,
			reason: this._controller.selectionReason,
			providerModelBefore,
			providerModelAfter: session.modelId.get(),
		}, 'info');
	}

	private _publish(
		options: INormalizedSessionModelPickerOptions,
		pendingSelection: IPendingModelSelection | undefined,
		currentModel = this._controller.currentModel.get(),
	): void {
		this._state.set(createModelSelectionState(this._models, options, currentModel, pendingSelection), undefined);
	}

	/** The remembered preference, migrating the legacy key forward the first time it is seen. */
	private _getRememberedModel(session: IActiveSession, modelTarget: string | undefined): string | undefined {
		const storedSelection = getStoredSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget);
		if (storedSelection) {
			return storedSelection;
		}

		const legacyStorageKey = legacyModelPickerStorageKey(session.providerId, session.sessionType);
		const legacyIdentifier = this._storageService.get(legacyStorageKey, StorageScope.PROFILE);
		if (legacyIdentifier) {
			storeSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget, legacyIdentifier);
			this._diagnostics.report('legacy-selection-migrated', {
				legacyStorageKey,
				model: legacyIdentifier,
			}, 'info');
			return legacyIdentifier;
		}
		return undefined;
	}

	private _setProvider(provider: ISessionsProvider | undefined): void {
		if (this._listenedProvider === provider) {
			return;
		}
		this._listenedProvider = provider;
		this._providerListener.value = provider?.onDidChangeModels(() => this._refresh('models'));
	}
}
