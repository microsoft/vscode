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
import { restoreReasonForSource, sourceForReason } from './sessionModelProvenance.js';

/**
 * How many conversations keep their model selection. Bounded because a long-lived window can bind
 * an input to arbitrarily many chats; what a conversation nobody has looked at in a hundred
 * switches was running on is worth less than the memory it holds.
 */
const CONVERSATION_CACHE_SIZE = 50;

type ModelSelectionRefreshTrigger = 'sessionState' | 'configuration' | 'providers' | 'models';

interface IRememberedModelSelection {
	readonly identifier: string;
	readonly source: 'stored' | 'legacy';
}

function legacyModelPickerStorageKey(providerId: string, sessionType: string): string {
	return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}

/**
 * What this input knows about one conversation's model selection.
 *
 * Held per conversation rather than per input so that none of it can be read as another chat's
 * answer. The alternative — one set of fields cleared whenever the input rebinds — is correct only
 * as long as every rebind path remembers to clear them.
 */
class ConversationModelSelection {
	/** The model this conversation is meant to run on, whatever the pool can offer right now. */
	readonly intent = new IntendedModelSlot();
	/**
	 * Whether this conversation has been driven to a model its pool actually offers. An empty or
	 * half-published pool selects nothing, and treating that as seeded would leave the previous
	 * conversation's model on display and never write one for this conversation.
	 */
	seeded = false;
}

export const ISessionModelSelection = createDecorator<ISessionModelSelection>('sessionModelSelection');

export interface ISessionModelSelection {
	readonly _serviceBrand: undefined;
	readonly state: IObservable<ISessionModelSelectionState>;
	selectModel(modelIdentifier: string): boolean;
}

/**
 * Model selection for the Agents Window, expressed on top of the shared
 * {@link ChatInputModelSelectionController}. It turns the active session and its provider into the
 * runtime the controller expects, and turns what the controller decides back into a provider write
 * and picker state. Precedence between a configured default, a remembered preference, and a
 * conversation's own model lives in the controller, so the two windows cannot drift on it.
 *
 * Mostly, but not purely, translation: this class still owns when a conversation counts as seeded
 * ({@link ConversationModelSelection.seeded}) and when to wait for a model the pool has not
 * published rather than write a stand-in through to a provider ({@link _canProceedWhilePending}).
 * It no longer answers *whether* a configured default may overtake that wait — that is the
 * controller's {@link ChatInputModelSelectionController.configuredDefaultToSeed}, which this only
 * supplies the conversation's authority to. Presentation lives in `sessionModelPickerState`, and
 * the provider-to-controller vocabulary in `sessionModelProvenance`.
 *
 * What it knows is held per conversation rather than per input: everything that describes a chat's
 * model lives in that chat's {@link ConversationModelSelection}, so none of it can be read as
 * another chat's answer. The instance fields are a snapshot of the provider and the bound chat,
 * re-read on every {@link _refresh} rather than carried.
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
	/**
	 * Whether the bound conversation has yet to send a request. Read from the active chat rather
	 * than the session: a session's status is aggregated across its chats, so a brand-new peer chat
	 * in a finished session is still a fresh conversation for `chat.defaultModel` to seed.
	 */
	private _chatIsEmpty = false;

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
			// Provenance decides whether a model outranks `chat.defaultModel`, so a change to it
			// alone must re-drive selection.
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

		// Validate against a fresh snapshot: the pool the picker was rendered from may already be
		// stale by the time the user commits to a model.
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
				provider.setModel(session.sessionId, session.activeChat.get().resource, model.identifier, ChatModelSource.User);
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
			// The pool's target, not the session type: it is what the provider scopes its models
			// (and this window's remembered preference) by.
			getCurrentSessionType: () => this._modelTarget,
			isEmpty: () => this._chatIsEmpty,
			getModels: () => [...this._models],
			getAllModels: () => [...this._models],
			getConfiguredModelValue: () => this._configurationService.getValue<string>(ChatConfiguration.DefaultModel),
			// A session runs whatever its provider published for it. There is no mode to satisfy
			// and nowhere else it could be shown, so the pool is already the answer.
			isModelSupportedHere: () => true,
			getDeclaredDefaultModel: models => models.find(model => model.metadata.isDefaultForLocation[ChatAgentLocation.Chat]),
			getBoundConversationKey: () => this._boundConversationKey,
			getIntentHolder: () => this._conversation().intent,
			applyModel: model => this._pushModelToProvider(model),
			// `isAwaitingSessionModels`, `subscribeToModelChanges` and `restoreModelConfiguration`
			// are deliberately absent: the provider's snapshot is already the session's own pool,
			// the pool is re-read before the controller is driven so refreshing is owned by
			// `_refresh`, and sessions have no per-model configuration.
		};
	}

	/**
	 * What this input knows about the bound conversation. Nothing here is reachable while another
	 * chat is bound, so one chat's selection cannot be applied to another by construction.
	 */
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
			// Nothing to clear: what each conversation was running on, and the authority behind it,
			// belong to that conversation's record and are unreachable until it is bound again.
			this._models = [];
			this._modelTarget = undefined;
			this._state.set(EMPTY_MODEL_SELECTION_STATE, undefined);
			return;
		}

		const conversationKey = session.activeChat.get().resource.toString();
		// Scoped to the active chat: peer chats in one session each keep their own model.
		const chat = session.activeChat.get();
		const chatModelId = session.modelId.get();
		// A stated `undefined` alongside a model means the provider cannot account for it, which is
		// read as the chat's own. A chat with no model at all has self-evidently not chosen one.
		const chatModelSource = chatModelId ? (chat.modelSource.get() ?? ChatModelSource.Restored) : undefined;
		// Undefined only when the chat has no model, which is the one case with no authority at all.
		const chatModelReason = chatModelSource === undefined ? undefined : restoreReasonForSource(chatModelSource);
		const baseSnapshot = provider.getModelsSnapshot(session.sessionId, chatModelId);
		const remembered = this._getRememberedModel(session, baseSnapshot.modelTarget);

		const rebound = session.sessionId !== this._boundSessionKey || conversationKey !== this._boundConversationKey;
		// A chat's own model always outranks the remembered preference, which only seeds a chat
		// that has yet to run on anything. Reading it per chat is what keeps one chat's choice out
		// of another's: the incoming chat brings its own model with it.
		const desiredModelId = chatModelId ?? remembered?.identifier;
		const snapshot = desiredModelId === chatModelId ? baseSnapshot : provider.getModelsSnapshot(session.sessionId, desiredModelId);

		this._models = snapshot.models;
		this._modelTarget = snapshot.modelTarget;
		const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
		// The provider — not the identifier — decides what the desired model resolves to. An agent
		// host republishes the same model under its own session scheme, so the pool may offer it
		// under a different identifier than the one asked for. Matching on the raw identifier would
		// miss it and fall back to something unrelated.
		const resolvedDesiredModel = snapshot.desiredModelResolution.kind === 'available'
			? snapshot.desiredModelResolution.model
			: undefined;

		// Bind before the controller runs so whatever it intends is recorded against this
		// conversation and cannot be applied to another.
		this._boundSessionKey = session.sessionId;
		this._boundConversationKey = conversationKey;
		this._chatIsEmpty = chat.status.get() === SessionStatus.Untitled;
		if (rebound) {
			// Unconditionally, including when the pool is still publishing below: the reason and
			// pending intent behind the previous conversation's model must not outlive it. The pool
			// belongs to the provider, not to this input, so there is no per-type restore to latch
			// and nothing to release afterwards.
			this._controller.beginConversationSwitch();
		}

		if (snapshot.desiredModelResolution.kind === 'pending' && !this._canProceedWhilePending(chatModelReason)) {
			// The pool has not published the wanted model yet. Choosing anything now would push a
			// stand-in through to the provider — and on to the backend — so wait it out instead,
			// and re-seed once the pool has settled.
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
			this._drive(rebound, chatModelId, chatModelSource, remembered?.identifier, resolvedDesiredModel, conversationKey);
		} catch (error) {
			// The provider refused the automatic selection (already reported by
			// `_pushModelToProvider`). Leave the seed unfinished so the next refresh retries, and
			// publish the model the session actually has rather than the one it refused.
			this._conversation().seeded = false;
			this._publish(options, undefined, this._models.find(model => model.identifier === session.modelId.get()));
			return;
		}
		this._publish(options, undefined);
	}

	/**
	 * Whether selection may proceed while the wanted model is still unpublished.
	 *
	 * Only `chat.defaultModel` may overtake the wait, and whether it may is the controller's
	 * question, not this adapter's — asking it here in a second vocabulary is how the two would
	 * drift. All this supplies is how the chat's model stands, because that model is precisely what
	 * cannot be adopted yet: no model at all means the chat has nothing of its own, so there is
	 * nothing for the configured default to override.
	 */
	private _canProceedWhilePending(chatModelReason: RestoredModelReason | undefined): boolean {
		return !!this._controller.configuredDefaultToSeed(chatModelReason ?? ModelSelectionReason.SessionRestore);
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
		// `resolvedDesiredModel` is the provider's answer for whichever identifier was asked about:
		// the chat's own model when it has one, otherwise the remembered preference.
		const chatModel = chatModelId
			? (resolvedDesiredModel ?? this._models.find(model => model.identifier === chatModelId))
			: undefined;
		const rememberedId = chatModelId ? rememberedModelId : (resolvedDesiredModel?.identifier ?? rememberedModelId);
		const conversation = this._conversation();
		if (rebound || !conversation.seeded) {
			// Set before seeding, not after: applying a model writes it to the provider, which can
			// echo it back synchronously and re-enter this refresh. That nested pass must see the
			// seed as already under way, or it would seed a second time and overwrite the
			// authority the first one established.
			conversation.seeded = true;
			if (chatModel) {
				// A model the chat already runs on is a choice made inside it, so it outranks
				// `chat.defaultModel` — which seeds conversations that have yet to choose.
				this._claimChatModel(chatModel, chatModelSource, conversationKey);
			} else {
				this._controller.initialize(rememberedId);
			}
			// A seed only counts once something the pool can actually offer is selected. An empty
			// or half-published pool selects nothing, and treating that as seeded would leave the
			// previous conversation's model on display and never write one for this conversation.
			conversation.seeded = this._isShowingSelectableModel();
		} else if (chatModel && this._conversationSelectionChanged(chatModel, chatModelSource)) {
			// The conversation's model or the authority behind it moved without this input asking
			// — restored by the provider, or chosen on another surface — so adopt it as it now is.
			// A same-model change of authority counts: a peer promoting this input's automatic pick
			// to their own choice must stop `chat.defaultModel` from overwriting it.
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
	 * Whether the bound conversation's model, or whether that model speaks for the conversation,
	 * differs from what selection currently holds.
	 *
	 * An echo of this input's own write matches on both counts: the source was derived from the
	 * very reason the controller still holds, and both sides of that mapping fall on the same side
	 * of the choice/spillover line. A peer promoting this input's automatic pick to their own
	 * choice does not match, which is the case this has to catch.
	 */
	private _conversationSelectionChanged(
		chatModel: ILanguageModelChatMetadataAndIdentifier,
		source: ChatModelSource | undefined,
	): boolean {
		return chatModel.identifier !== this._controller.currentModel.get()?.identifier
			|| isInConversationModelChoice(restoreReasonForSource(source)) !== isInConversationModelChoice(this._controller.selectionReason);
	}

	/**
	 * Adopts the model the bound chat is on, telling the controller who chose it.
	 *
	 * A model this input put there — an automatic pick, a stand-in written while the intended model
	 * was missing, or the previous chat's model a provider seeded a new peer chat with — is not the
	 * conversation answering for itself, and leaves a fresh conversation open to
	 * `chat.defaultModel`. Both cases take the same path so the controller, not this adapter,
	 * decides what that difference means.
	 */
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
		const providerModelBefore = session.modelId.get();
		if (providerModelBefore === model.identifier) {
			// Already what the session runs on; re-pushing would round-trip a no-op to the backend.
			// Deliberately not recorded as this input's own: the model was already there, and
			// claiming it would mask a choice the conversation made elsewhere.
			return;
		}
		// The controller records the reason before handing the model over, so this reads the reason
		// for the write actually being made.
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

	private _getRememberedModel(session: IActiveSession, modelTarget: string | undefined): IRememberedModelSelection | undefined {
		const storedSelection = getStoredSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget);
		if (storedSelection) {
			return { identifier: storedSelection, source: 'stored' };
		}

		const legacyStorageKey = legacyModelPickerStorageKey(session.providerId, session.sessionType);
		const legacyIdentifier = this._storageService.get(legacyStorageKey, StorageScope.PROFILE);
		if (legacyIdentifier) {
			storeSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget, legacyIdentifier);
			this._diagnostics.report('legacy-selection-migrated', {
				legacyStorageKey,
				model: legacyIdentifier,
			}, 'info');
			return { identifier: legacyIdentifier, source: 'legacy' };
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
