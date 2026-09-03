/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Chat model selection.
 *
 * A model on a conversation is either the conversation's own — the user picked it, a caller
 * selected it, or it was restored as its own — or carried over from somewhere else: the previous
 * conversation's model, or an automatic pick. `chat.defaultModel` seeds a carried-over model and
 * yields to the conversation's own. {@link isInConversationModelChoice} is that line; every "may
 * the default win here?" goes through it. Which case it is cannot be read off a model identifier,
 * so each surface states it.
 *
 * Models publish late and can be republished under new identifiers, so a conversation's model is
 * remembered per conversation and reclaimed when it appears. The two surfaces differ only in what
 * they do while waiting: Workbench chat shows a stand-in, since being wrong costs a repaint, while
 * the Agents Window waits, since it writes through to a backend.
 */
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { IIntendedModelHolder } from '../../../common/model/chatModel.js';
import { IIntendedModelSelection, InitialModelSelectionResult, isInConversationModelChoice, isRestoredModelReason, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier, RestoredModelReason } from '../../../common/modelSelection.js';
import { findBestMatchingModel, IsModelSupportedHere, resolveModelFromSyncState, shouldResetModelToDefault, shouldResetOnModelListChange } from './chatInputModelUtils.js';
import { isByokModel } from '../../../common/chatSelectedModel.js';
import { IChatModelSelectionDiagnostics, NullChatModelSelectionDiagnostics } from './chatModelSelectionDiagnostics.js';

/** What a surface supplies: its catalog, its idea of usable, and what to do with a decision. */
export interface IChatInputModelSelectionRuntime {
	// -- where models come from
	readonly getCurrentSessionType: () => string | undefined;
	readonly getModels: (sessionType: string | undefined) => ILanguageModelChatMetadataAndIdentifier[];
	readonly getAllModels: () => ILanguageModelChatMetadataAndIdentifier[];
	readonly getConfiguredModelValue: () => string | undefined;
	readonly isEmpty: () => boolean;

	// -- which of them this surface can use
	/** Whether this surface can run the model at all. Asked, so surfaces are not second-guessed. */
	readonly isModelSupportedHere: IsModelSupportedHere;
	/** The model the surface declares as its default, when the pool declares one. */
	readonly getDeclaredDefaultModel: (models: readonly ILanguageModelChatMetadataAndIdentifier[]) => ILanguageModelChatMetadataAndIdentifier | undefined;

	// -- the bound conversation
	readonly getBoundConversationKey: () => string | undefined;
	/** Whoever speaks for the bound conversation's intended model — the conversation, else the composer. */
	readonly getIntentHolder: () => IIntendedModelHolder;
	readonly applyModel: (model: ILanguageModelChatMetadataAndIdentifier) => void;

	// -- only for surfaces that have them
	/** Whether this session type's models are still loading, so defaulting would pick over them. */
	readonly isAwaitingSessionModels?: (sessionType: string) => boolean;
	/** Omitted by a surface that drives reconciliation itself rather than being notified. */
	readonly subscribeToModelChanges?: (listener: () => void) => IDisposable;
	/** Omitted by a surface with no per-model configuration to restore. */
	readonly restoreModelConfiguration?: (modelId: string, configuration: Record<string, unknown> | undefined) => void;
}

/** One caller's request waiting for its model to publish. Not the conversation's intended model. */
interface IPendingProgrammaticSelection {
	readonly resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly conversationKey: string | undefined;
	readonly complete: (applied: boolean) => void;
}

/** The one implementation of "pick and remember the chat model", shared by both surfaces. */
export class ChatInputModelSelectionController extends Disposable {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>(this, undefined);
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> = this._currentModel;
	private _selectionReason: ModelSelectionReason | undefined;
	private _pendingProgrammaticSelection: IPendingProgrammaticSelection | undefined;

	constructor(
		private readonly _runtime: IChatInputModelSelectionRuntime,
		private readonly _diagnostics: IChatModelSelectionDiagnostics = NullChatModelSelectionDiagnostics,
	) {
		super();
		const subscribe = this._runtime.subscribeToModelChanges;
		if (subscribe) {
			this._register(subscribe(() => this.reconcileModelListChange(this._pool())));
		}
		this._register(toDisposable(() => this._clearPendingProgrammaticSelection()));
	}

	get selectionReason(): ModelSelectionReason | undefined {
		return this._selectionReason;
	}

	/** Drops what spoke for the outgoing conversation, so it is not read as the incoming one's. */
	beginConversationSwitch(): void {
		this._selectionReason = undefined;
		this._clearPendingProgrammaticSelection();
	}

	/**
	 * True while the remembered model is not selectable, i.e. whatever is currently selected is a
	 * stand-in that {@link _restoreRememberedModel} will replace once the catalog offers the real
	 * one. Callers use this to avoid acting on a selection that is about to change.
	 */
	isAwaitingRememberedModel(): boolean {
		const modelId = this._intendedModel?.modelId;
		return !!modelId && !this._pool().some(model => model.identifier === modelId);
	}

	hasPendingProgrammaticSelection(): boolean {
		return !!this._pendingProgrammaticSelection;
	}

	/** A user action claims the conversation and rolls back if `apply` throws; anything else does not. */
	applySelection(
		model: ILanguageModelChatMetadataAndIdentifier,
		apply: () => void,
		isUserAction: boolean,
		rollbackOnError = false,
	): void {
		if (!isUserAction) {
			this._display(model);
			apply();
			return;
		}
		this._clearPendingProgrammaticSelection();
		const previousModel = this._currentModel.get();
		const previousReason = this._selectionReason;
		const previousRememberedSelection = this._intendedModel;
		this._currentModel.set(model, undefined);
		this._selectionReason = ModelSelectionReason.UserSelection;
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.UserSelection });
		this._diagnostics.report('explicit-selection', { model: model.identifier }, 'info');
		try {
			apply();
			this._diagnostics.report('explicit-selection-applied', { model: model.identifier }, 'info');
		} catch (error) {
			if (rollbackOnError) {
				this._currentModel.set(previousModel, undefined);
				this._selectionReason = previousReason;
				this._remember(previousRememberedSelection);
			}
			this._diagnostics.report('explicit-selection-failed', { model: model.identifier, error: String(error) }, 'error');
			throw error;
		}
	}

	applyProgrammaticSelection(model: ILanguageModelChatMetadataAndIdentifier): void {
		this._clearPendingProgrammaticSelection();
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.ProgrammaticSelection });
		this._applyModel(model, ModelSelectionReason.ProgrammaticSelection);
	}

	requestProgrammaticSelection(
		resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined,
		conversationKey: string | undefined,
	): Promise<boolean> {
		this._clearPendingProgrammaticSelection();
		this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
		return new Promise<boolean>(resolve => {
			let complete = resolve;
			this._pendingProgrammaticSelection = {
				resolveModel,
				conversationKey,
				complete: applied => {
					complete(applied);
					complete = () => { };
				},
			};
			this._reconcilePendingProgrammaticSelection();
		});
	}

	initialize(rememberedModelId: string | undefined): void {
		this._clearPendingProgrammaticSelection();
		// The profile preference belongs to no conversation, so it seeds one that has not chosen a
		// model but never displaces one that has — the conversation's own model outranks it, and
		// re-initializing on a pool rebind must not erase what it is waiting for.
		if (!this._intendedModel) {
			// Storage records only explicit picks, but it is not an in-conversation choice: a new
			// conversation still lets `chat.defaultModel` take precedence over it.
			this._remember(rememberedModelId ? { modelId: rememberedModelId, reason: ModelSelectionReason.Remembered } : undefined);
		}
		const resolveSelection = (): InitialModelSelectionResult => {
			const configuredModelValue = this._runtime.getConfiguredModelValue();
			const models = this._pool();
			// `chat.defaultModel` seeds new conversations only; a conversation with history keeps
			// the model it was started with.
			const configuredModel = this._runtime.isEmpty() ? resolveConfiguredModel(configuredModelValue, models) : undefined;
			const resolution = resolveModelIdentifier(models, rememberedModelId, false);
			return resolveInitialModelSelection({
				configuredModel,
				desiredModelResolution: resolution,
				desiredReason: ModelSelectionReason.Remembered,
				fallbackModel: this._defaultModel(models),
				fallbackReason: ModelSelectionReason.FirstAvailable,
			});
		};

		const selection = resolveSelection();
		this._reportInitialization(this._runtime.getConfiguredModelValue(), rememberedModelId, selection);
		if (selection.kind === 'apply') {
			this._applyModel(selection.model, selection.reason);
			this.ensureCurrentModelSupported();
		} else if (selection.kind === 'pending') {
			// The remembered model isn't in the catalog yet. Show the default meanwhile;
			// `_restoreRememberedModel` claims the real one as soon as it is published.
			const fallbackModel = this._defaultModel(this._pool());
			if (fallbackModel) {
				this._applyModel(fallbackModel, ModelSelectionReason.FirstAvailable);
			}
		}
	}

	/** Takes the default and forgets the preference it overrides, which would otherwise come back. */
	resetToDefault(sessionType = this._runtime.getCurrentSessionType()): void {
		this._clearPendingProgrammaticSelection();
		this._remember(undefined);
		this.selectDefault(sessionType);
	}

	ensureCurrentModelSupported(): void {
		const currentModel = this._currentModel.get();
		const sessionType = this._runtime.getCurrentSessionType();
		const models = this._pool(sessionType);
		const willReset = shouldResetModelToDefault(currentModel, models, this._runtime.isModelSupportedHere, this._runtime.getAllModels(), sessionType);
		this._diagnostics.report('compatibility-check', {
			currentModel: currentModel?.identifier,
			sessionType,
			willReset,
		}, willReset ? 'info' : 'debug');
		if (willReset) {
			this.selectDefault(sessionType);
		}
	}

	selectDefault(sessionType = this._runtime.getCurrentSessionType()): void {
		if (sessionType && this._runtime.isAwaitingSessionModels?.(sessionType)) {
			return;
		}
		const models = this._pool(sessionType);
		const configuredModel = resolveConfiguredModel(this._runtime.getConfiguredModelValue(), models);
		const defaultModel = configuredModel ?? this._defaultModel(models);
		this._diagnostics.report('select-default', {
			configuredModel: configuredModel?.identifier,
			defaultModel: defaultModel?.identifier,
			currentModel: this._currentModel.get()?.identifier,
		}, defaultModel ? 'info' : 'debug');
		if (!defaultModel) {
			return;
		}
		// A pending request keeps its reason: this default is only standing in until its model lands.
		const reason = this.hasPendingProgrammaticSelection()
			? this._selectionReason
			: (configuredModel ? ModelSelectionReason.ConfiguredDefault : ModelSelectionReason.FirstAvailable);
		this._applyModel(defaultModel, reason);
	}

	/**
	 * What `chat.defaultModel` would seed this conversation with, or nothing if it would not.
	 *
	 * @param conversationModelReason How the conversation's own model stands, for a caller deciding
	 * whether to wait for one this controller has not been given yet. Omit to use what it applied.
	 */
	configuredDefaultToSeed(conversationModelReason?: RestoredModelReason): ILanguageModelChatMetadataAndIdentifier | undefined {
		const claimedByConversation = conversationModelReason !== undefined
			? isInConversationModelChoice(conversationModelReason)
			: (isInConversationModelChoice(this._selectionReason)
				|| isInConversationModelChoice(this._intendedModel?.reason)
				|| !!this._pendingProgrammaticSelection);
		if (!this._runtime.isEmpty() || claimedByConversation) {
			return undefined;
		}
		return resolveConfiguredModel(this._runtime.getConfiguredModelValue(), this._pool());
	}

	applyConfiguredDefault(): boolean {
		const configuredModel = this.configuredDefaultToSeed();
		if (!configuredModel) {
			return false;
		}
		if (configuredModel.identifier === this._currentModel.get()?.identifier) {
			if (this._selectionReason !== ModelSelectionReason.ConfiguredDefault) {
				this._selectionReason = ModelSelectionReason.ConfiguredDefault;
				return true;
			}
			return false;
		}
		this._applyModel(configuredModel, ModelSelectionReason.ConfiguredDefault);
		this.ensureCurrentModelSupported();
		return true;
	}

	reconcileModelListChange(models: readonly ILanguageModelChatMetadataAndIdentifier[]): void {
		if (this.applyConfiguredDefault() || this._reconcilePendingProgrammaticSelection() || this._restoreRememberedModel()) {
			return;
		}
		const currentModel = this._currentModel.get();
		const declaredDefault = this._runtime.getDeclaredDefaultModel(models);
		if (this._runtime.isEmpty()
			&& this._selectionReason === ModelSelectionReason.FirstAvailable
			&& declaredDefault
			&& currentModel?.identifier !== declaredDefault.identifier) {
			// Still the first thing on offer, only now the pool has said which that is.
			this._applyModel(declaredDefault, ModelSelectionReason.FirstAvailable);
			return;
		}
		if (!shouldResetOnModelListChange(currentModel?.identifier, [...models])) {
			return;
		}
		const match = findBestMatchingModel(currentModel, models);
		if (match) {
			// The same selection republished under another identifier, so whoever chose it still has.
			this._applyModel(match, this._selectionReason);
		} else {
			this.selectDefault();
		}
	}

	/**
	 * Reclaims the conversation's intended model whenever the catalog offers it, however late.
	 * Catalogs publish in waves, so anything shown meanwhile is a stand-in. Read from the bound
	 * conversation, so another conversation's choice is unreachable here.
	 */
	private _restoreRememberedModel(): boolean {
		const remembered = this._intendedModel;
		if (!remembered || this._currentModel.get()?.identifier === remembered.modelId) {
			return false;
		}
		if (this._selectionReason === ModelSelectionReason.ConfiguredDefault && !isInConversationModelChoice(remembered.reason)) {
			return false;
		}
		// Pool membership is the validity test: the pool is already filtered by session and mode,
		// so a model that is absent here is genuinely not selectable right now.
		const pool = this._pool();
		const exact = pool.find(model => model.identifier === remembered.modelId);
		// A pool can republish the same model under a new identifier, so an equivalent serves the
		// conversation better than the generic default. The remembered selection keeps pointing at
		// the original, so the exact model still wins if it comes back.
		const model = exact ?? (isRestoredModelReason(remembered.reason) ? findBestMatchingModel(remembered.model, pool) : undefined);
		if (!model || (!exact && this._currentModel.get()?.identifier === model.identifier)) {
			return false;
		}
		this._diagnostics.report('restore-remembered-model', { model: model.identifier, remembered: remembered.modelId, reason: remembered.reason }, 'info');
		if (exact && remembered.configuration) {
			this._runtime.restoreModelConfiguration?.(remembered.modelId, remembered.configuration);
		}
		this._applyModel(model, remembered.reason);
		return true;
	}

	/** Adopts the model the conversation carries. `restoredAs` says whether it is a choice. */
	syncFromConversationState(
		desiredModel: ILanguageModelChatMetadataAndIdentifier,
		modelConfiguration: Record<string, unknown> | undefined,
		sessionType: string | undefined,
		conversationKey: string,
		isRemoteEdit = false,
		restoredAs: RestoredModelReason = ModelSelectionReason.SessionRestore,
	): void {
		// Ignore a late sync for a conversation this input has left. Not yet bound is not "left".
		const boundConversationKey = this._runtime.getBoundConversationKey();
		if (boundConversationKey !== undefined && boundConversationKey !== conversationKey) {
			this._diagnostics.report('conversation-restore-stale-ignored', {
				desiredModel: desiredModel.identifier,
				conversation: conversationKey,
				boundConversation: boundConversationKey,
			}, 'info');
			return;
		}
		// A carried-over model is not an answer for the conversation, so it must not replace one the
		// conversation is still waiting for — that would forget the awaited model, never reclaim
		// it, and leave the conversation open to `chat.defaultModel`.
		const keepsAwaitedModel = this._keepsAwaitedModel(desiredModel, restoredAs, isRemoteEdit);
		if (keepsAwaitedModel) {
			this._diagnostics.report('conversation-restore-keeps-awaited-model', {
				desiredModel: desiredModel.identifier,
				awaitingModel: this._intendedModel?.modelId,
			}, 'info');
		}
		if (keepsAwaitedModel) {
			this._diagnostics.report('conversation-restore-keeps-awaited-model', {
				desiredModel: desiredModel.identifier,
				awaitingModel: this._intendedModel?.modelId,
			}, 'info');
		}
		const allModels = this._runtime.getAllModels();
		const currentModel = this._currentModel.get();
		const syncResult = resolveModelFromSyncState(desiredModel, currentModel, allModels, sessionType, this._runtime.isModelSupportedHere);
		this._diagnostics.report('conversation-restore', {
			desiredModel: desiredModel.identifier,
			currentModel: currentModel?.identifier,
			sessionType,
			action: syncResult.action,
		}, syncResult.action === 'keep' ? 'debug' : 'info');
		if (syncResult.action === 'apply' || syncResult.action === 'keep') {
			this._applySessionRestore(desiredModel, syncResult.action === 'apply', modelConfiguration, restoredAs, keepsAwaitedModel);
			return;
		}

		// Not published yet. Remember it and show the nearest thing until it arrives.
		if (!keepsAwaitedModel) {
			this._rememberOnBoundConversation(desiredModel, modelConfiguration, conversationKey, restoredAs);
		}
		this._clearPendingProgrammaticSelection();
		const pool = this._pool(sessionType);
		const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
		if (match) {
			this._applyModel(match, restoredAs);
		} else {
			this.selectDefault(sessionType);
		}
	}

	/**
	 * Whether an arriving carried-over model must leave alone the model the conversation is waiting
	 * for. True while the conversation awaits a model the pool cannot offer, the arrival is not
	 * that model, and one of:
	 *
	 * - the awaited model is one the conversation answered for, so a model merely carried onto it
	 *   cannot speak for it — this is what a surface that records where a model came from can say;
	 * - the arrival is the stand-in currently on screen, i.e. this controller put it there and the
	 *   conversation is only echoing it back — what a surface whose draft state cannot say where a
	 *   model came from has to fall back on.
	 *
	 * Anything else is a real statement about the conversation and supersedes the wait. A remote
	 * edit is a peer answering for the conversation, so it always does.
	 */
	private _keepsAwaitedModel(
		desiredModel: ILanguageModelChatMetadataAndIdentifier,
		restoredAs: RestoredModelReason,
		isRemoteEdit: boolean,
	): boolean {
		const awaited = this._intendedModel;
		if (isRemoteEdit
			|| restoredAs !== ModelSelectionReason.SessionRestore
			|| !awaited
			|| awaited.modelId === desiredModel.identifier
			|| !this.isAwaitingRememberedModel()) {
			return false;
		}
		return isInConversationModelChoice(awaited.reason)
			|| desiredModel.identifier === this._currentModel.get()?.identifier;
	}

	/** Replaces the bound conversation's intended model. */
	private _remember(selection: IIntendedModelSelection | undefined): void {
		this._runtime.getIntentHolder().setIntendedModel(selection);
	}

	/** The intended model of the conversation this input is currently bound to. */
	private get _intendedModel(): IIntendedModelSelection | undefined {
		return this._runtime.getIntentHolder().intendedModel;
	}

	/**
	 * The model to fall back to: the declared default, else the first non-BYOK model, else the first
	 * on offer — but never a billable stand-in for a model the conversation is still awaiting.
	 */
	private _defaultModel(models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._runtime.getDeclaredDefaultModel(models)
			?? models.find(model => !isByokModel(model.metadata))
			?? (this.isAwaitingRememberedModel() ? undefined : models[0]);
	}

	/** The models selectable for the bound session right now. */
	private _pool(sessionType = this._runtime.getCurrentSessionType()): ILanguageModelChatMetadataAndIdentifier[] {
		return this._runtime.getModels(sessionType);
	}

	/** Records the model to reclaim, with how it stands — forgetting that lets the default claim it. */
	private _rememberOnBoundConversation(
		model: ILanguageModelChatMetadataAndIdentifier,
		configuration: Record<string, unknown> | undefined,
		conversationKey: string,
		restoredAs: RestoredModelReason,
	): void {
		if (this._runtime.getBoundConversationKey() !== conversationKey) {
			return;
		}
		this._remember({ modelId: model.identifier, model, reason: restoredAs, configuration });
	}

	revalidateForSessionType(initialize: () => void): void {
		const previousModel = this._currentModel.get();
		this._selectionReason = undefined;
		initialize();
		const restoredModel = this._currentModel.get();
		const sessionType = this._runtime.getCurrentSessionType();
		const models = this._pool(sessionType);
		if (restoredModel && models.some(model => model.identifier === restoredModel.identifier)) {
			return;
		}
		const match = findBestMatchingModel(previousModel, models);
		if (match) {
			// Carried across a session-type change, so it is a restore rather than a fresh pick.
			this._applyModel(match, ModelSelectionReason.SessionRestore);
		} else if (models.length === 0) {
			this._currentModel.set(undefined, undefined);
		} else {
			this.selectDefault(sessionType);
		}
	}

	private _applySessionRestore(
		model: ILanguageModelChatMetadataAndIdentifier,
		applyModel: boolean,
		configuration: Record<string, unknown> | undefined,
		restoredAs: RestoredModelReason,
		keepsAwaitedModel = false,
	): void {
		this._clearPendingProgrammaticSelection();
		this._selectionReason = restoredAs;
		if (!keepsAwaitedModel) {
			this._remember({ modelId: model.identifier, model, reason: restoredAs, configuration });
		}
		if (configuration) {
			this._runtime.restoreModelConfiguration?.(model.identifier, configuration);
		}
		if (applyModel) {
			this._applyModel(model, restoredAs);
		}
	}

	private _reconcilePendingProgrammaticSelection(): boolean {
		const intent = this._pendingProgrammaticSelection;
		if (!intent) {
			return false;
		}
		// The conversation moved on while the model was still unpublished, so nobody is waiting.
		if (this._runtime.getBoundConversationKey() !== intent.conversationKey) {
			this._clearPendingProgrammaticSelection();
			return true;
		}
		const model = intent.resolveModel();
		if (!model) {
			return false;
		}
		this._pendingProgrammaticSelection = undefined;
		intent.complete(true);
		this.applyProgrammaticSelection(model);
		return true;
	}

	private _clearPendingProgrammaticSelection(): void {
		const intent = this._pendingProgrammaticSelection;
		this._pendingProgrammaticSelection = undefined;
		if (intent) {
			intent.complete(false);
			if (this._selectionReason === ModelSelectionReason.ProgrammaticSelection) {
				this._selectionReason = undefined;
			}
		}
	}

	/** Shows `model` without touching the authority already in force. */
	private _display(model: ILanguageModelChatMetadataAndIdentifier): void {
		this._currentModel.set(model, undefined);
	}

	/**
	 * Shows the model and hands it to the surface. The reason is recorded first because a surface
	 * that persists reads it during `applyModel`. Pass {@link selectionReason} to carry it over.
	 */
	private _applyModel(model: ILanguageModelChatMetadataAndIdentifier, reason: ModelSelectionReason | undefined): void {
		this._selectionReason = reason;
		this._display(model);
		this._runtime.applyModel(model);
	}

	private _reportInitialization(configuredModel: string | undefined, rememberedModel: string | undefined, selection: InitialModelSelectionResult): void {
		this._diagnostics.report('initialize', {
			configuredModel,
			rememberedModel,
			availableModels: this._pool().map(model => model.identifier).join(','),
			selection: selection.kind,
			resultModel: selection.kind === 'apply' ? selection.model.identifier : undefined,
			resultReason: selection.kind === 'apply' ? selection.reason : undefined,
			pendingReference: selection.kind === 'pending' ? selection.selection.reference : undefined,
		}, selection.kind === 'none' ? 'debug' : 'info');
	}
}
