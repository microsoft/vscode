/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { IIntendedModelHolder } from '../../../common/model/chatModel.js';
import { IIntendedModelSelection, InitialModelSelectionResult, isInConversationModelChoice, isRestoredModelReason, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier, RestoredModelReason } from '../../../common/modelSelection.js';
import { findBestMatchingModel, hasModelsTargetingSession, IsModelSupportedHere, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange } from './chatInputModelUtils.js';
import { IChatModelSelectionDiagnostics, NullChatModelSelectionDiagnostics } from './chatModelSelectionDiagnostics.js';

/**
 * Supplies the surface's model catalog and conversation effects. The seam between the shared
 * selection policy and where models come from, so both Workbench chat and the Agents Window drive
 * the same controller.
 */
export interface IChatInputModelSelectionRuntime {
	// -- where models come from
	readonly getCurrentSessionType: () => string | undefined;
	readonly getModels: (sessionType: string | undefined) => ILanguageModelChatMetadataAndIdentifier[];
	readonly getAllModels: () => ILanguageModelChatMetadataAndIdentifier[];
	readonly getConfiguredModelValue: () => string | undefined;
	readonly isEmpty: () => boolean;
	readonly requiresCustomModels: (sessionType: string) => boolean;

	// -- which of them this surface can use
	/**
	 * Whether the surface can run `model` at all. Asked rather than derived so a surface states
	 * what "usable here" means for it, instead of feeding the controller the inputs to work it out.
	 */
	readonly isModelSupportedHere: IsModelSupportedHere;
	/** The model the surface declares as its default, when the pool declares one. */
	readonly getDeclaredDefaultModel: (models: readonly ILanguageModelChatMetadataAndIdentifier[]) => ILanguageModelChatMetadataAndIdentifier | undefined;

	// -- the bound conversation
	readonly getBoundConversationKey: () => string | undefined;
	/** Whoever speaks for the bound conversation's intended model — the conversation, else the composer. */
	readonly getIntentHolder: () => IIntendedModelHolder;
	readonly applyModel: (model: ILanguageModelChatMetadataAndIdentifier) => void;

	// -- only for surfaces that have them
	/** Omitted by a surface that drives reconciliation itself rather than being notified. */
	readonly subscribeToModelChanges?: (listener: () => void) => IDisposable;
	/** Omitted by a surface with no per-model configuration to restore. */
	readonly restoreModelConfiguration?: (modelId: string, configuration: Record<string, unknown> | undefined) => void;
}

interface IResolvedDraftModelSelection {
	readonly model: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly changed: boolean;
}

/**
 * A programmatic selection waiting for the catalog to publish its model.
 *
 * Distinct from the conversation's intended model ({@link IIntendedModelSelection}): this is one
 * caller's request in flight, discarded once it resolves or the conversation changes.
 */
interface IPendingProgrammaticSelection {
	readonly resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly conversationKey: string | undefined;
	readonly complete: (applied: boolean) => void;
}

/**
 * The single implementation of "pick and remember the chat model". Owns the precedence between a
 * configured default, a remembered preference, and a conversation's own model; each surface
 * supplies its catalog and effects through {@link IChatInputModelSelectionRuntime}.
 */
export class ChatInputModelSelectionController extends Disposable {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>(this, undefined);
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> = this._currentModel;
	private _selectionReason: ModelSelectionReason | undefined;
	private _pendingProgrammaticSelection: IPendingProgrammaticSelection | undefined;
	private _restorePerTypeModel = false;

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

	get restorePerTypeModel(): boolean {
		return this._restorePerTypeModel;
	}

	get selectionReason(): ModelSelectionReason | undefined {
		return this._selectionReason;
	}

	/**
	 * Drops the selection state that spoke for the outgoing conversation — the reason behind its
	 * model, and any model it was still waiting to be given — so neither outlives it and gets read
	 * as the incoming conversation's own.
	 *
	 * Unpaired, and safe to call on its own. A surface that also owns its model pool wants
	 * {@link beginSessionSwitch} instead.
	 */
	beginConversationSwitch(): void {
		this._selectionReason = undefined;
		this._clearPendingProgrammaticSelection();
	}

	/**
	 * As {@link beginConversationSwitch}, and additionally latches whether the destination should
	 * restore the model remembered for its session type. Paired with {@link endSessionSwitch},
	 * which releases that latch once the switch has been carried out.
	 */
	beginSessionSwitch(isEmpty: boolean, ownsPool: boolean, hadIncomingModel: boolean): void {
		this.beginConversationSwitch();
		this._restorePerTypeModel = isEmpty && ownsPool && !hadIncomingModel;
	}

	endSessionSwitch(): void {
		this._restorePerTypeModel = false;
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

	/**
	 * Shows `model` and runs `apply`. A user action claims authority over the conversation and is
	 * rolled back if `apply` throws; anything else is a mechanical follow-on that leaves the
	 * conversation's intent — and the authority already in force — untouched.
	 */
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
		this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.ProgrammaticSelection });
		this._applyModel(model);
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
			this._selectionReason = selection.reason;
			this._applyModel(selection.model);
			this.ensureCurrentModelSupported();
		} else if (selection.kind === 'pending') {
			// The remembered model isn't in the catalog yet. Show the default meanwhile;
			// `_restoreRememberedModel` claims the real one as soon as it is published.
			const fallbackModel = this._defaultModel(this._pool());
			if (fallbackModel) {
				this._selectionReason = ModelSelectionReason.FirstAvailable;
				this._applyModel(fallbackModel);
			}
		}
	}

	/**
	 * Forgets what the conversation was meant to run on and takes the default instead.
	 *
	 * Clearing the intended model is the point: it is the preference the reset overrides, and a
	 * reset that leaves it in place is undone by the next catalog change, when reconciliation
	 * restores it.
	 */
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
		const allModels = this._runtime.getAllModels();
		if (sessionType && this._runtime.requiresCustomModels(sessionType) && !hasModelsTargetingSession(allModels, sessionType)) {
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
		if (!this.hasPendingProgrammaticSelection()) {
			this._selectionReason = configuredModel ? ModelSelectionReason.ConfiguredDefault : ModelSelectionReason.FirstAvailable;
		}
		this._applyModel(defaultModel);
	}

	/**
	 * The model `chat.defaultModel` would seed the bound conversation with right now, or
	 * `undefined` if it would not seed at all.
	 *
	 * A configured default seeds every new (empty) conversation. Only a genuine in-conversation
	 * choice blocks it; a `SessionRestore` on an empty conversation is spillover from the previous
	 * one and must yield. A choice the conversation is still waiting to have applied blocks it too:
	 * while its pool is cold there is nothing on screen to recognize it by, and seeding over it
	 * would mean the user's own model loses to the default purely for arriving late.
	 *
	 * @param conversationModelReason Answers for a conversation whose model this controller has not
	 * been given yet. A surface that must decide whether to *wait* for an unpublished model cannot
	 * have adopted it first, so it states how that model stands rather than letting the controller
	 * infer it from state that does not describe that conversation yet. Omit it to have the
	 * controller answer from what it has itself applied.
	 */
	configuredDefaultToSeed(conversationModelReason?: RestoredModelReason): ILanguageModelChatMetadataAndIdentifier | undefined {
		const claimedByConversation = conversationModelReason !== undefined
			? isInConversationModelChoice(conversationModelReason)
			: isInConversationModelChoice(this._selectionReason)
			|| isInConversationModelChoice(this._intendedModel?.reason)
			|| !!this._pendingProgrammaticSelection;
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
		this._selectionReason = ModelSelectionReason.ConfiguredDefault;
		this._applyModel(configuredModel);
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
			this._applyModel(declaredDefault);
			return;
		}
		if (!shouldResetOnModelListChange(currentModel?.identifier, [...models])) {
			return;
		}
		const match = findBestMatchingModel(currentModel, models);
		if (match) {
			this._applyModel(match);
		} else {
			this.selectDefault();
		}
	}

	/**
	 * Reclaims the conversation's intended model whenever the catalog can offer it, however late
	 * that is. A model can go missing for reasons unrelated to intent — an agent host publishes its
	 * catalog in waves, and restarting one drops and republishes all of it — so whatever is shown
	 * meanwhile is only a stand-in and may be superseded.
	 *
	 * The intent is read from the bound conversation, so another conversation's choice is not
	 * reachable here and cannot be applied to this one.
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
		this._selectionReason = remembered.reason;
		if (exact && remembered.configuration) {
			this._runtime.restoreModelConfiguration?.(remembered.modelId, remembered.configuration);
		}
		this._applyModel(model);
		return true;
	}

	/**
	 * Adopts the model the bound conversation carries.
	 *
	 * `restoredAs` says whether that model was chosen for this conversation or is merely standing on
	 * it. A surface that cannot tell says nothing and the model is treated as spillover, which
	 * leaves an empty conversation open to `chat.defaultModel`.
	 */
	syncFromConversationState(
		desiredModel: ILanguageModelChatMetadataAndIdentifier,
		modelConfiguration: Record<string, unknown> | undefined,
		sessionType: string | undefined,
		conversationKey: string,
		isRemoteEdit = false,
		restoredAs: RestoredModelReason = ModelSelectionReason.SessionRestore,
	): void {
		if (!isRemoteEdit && this._isEchoOfStandIn(desiredModel.identifier, conversationKey)) {
			this._diagnostics.report('conversation-restore-echo-ignored', {
				desiredModel: desiredModel.identifier,
				awaitingModel: this._intendedModel?.modelId,
			}, 'info');
			return;
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
			this._applySessionRestore(desiredModel, syncResult.action === 'apply', modelConfiguration, conversationKey, restoredAs);
			return;
		}

		// The conversation's model is not available yet, usually because its pool is still
		// publishing. That says nothing about what the user should be on, so remember it anyway and
		// show the best stand-in until `_restoreRememberedModel` can claim the real one.
		this._rememberOnBoundConversation(desiredModel, modelConfiguration, conversationKey, restoredAs);
		this._clearPendingProgrammaticSelection();
		const pool = this._pool(sessionType);
		const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
		if (match) {
			// Reason first: applying writes the model out through the runtime, and a surface that
			// persists it reads the reason while that call runs. Setting it afterwards would write
			// the conversation's own model under whatever reason the previous one left behind.
			this._selectionReason = restoredAs;
			this._applyModel(match);
		} else {
			this.selectDefault(sessionType);
		}
	}

	/**
	 * Whether a conversation-state sync is just this controller's own stand-in coming back.
	 *
	 * Applying a model writes it into the conversation's input state, which the local sync hands
	 * straight back. While the real model is still missing, that echo would be mistaken for the
	 * conversation's own model and overwrite the selection being awaited — the loop that makes a
	 * transient stand-in stick for good.
	 *
	 * Only the model currently standing in counts, and only for a local write: a peer genuinely
	 * selecting it arrives as {@link ChatInputStateOrigin.Remote} and still wins.
	 */
	private _isEchoOfStandIn(desiredModelId: string, conversationKey: string): boolean {
		return this._runtime.getBoundConversationKey() === conversationKey
			&& desiredModelId === this._standInModelId
			&& this.isAwaitingRememberedModel();
	}

	/**
	 * The model on screen only because the intended one cannot be offered yet — that is, whatever is
	 * displayed while it differs from the intent. Derived rather than tracked so it cannot fall out
	 * of step with either.
	 */
	private get _standInModelId(): string | undefined {
		const intended = this._intendedModel;
		const displayed = this._currentModel.get()?.identifier;
		return intended && displayed !== intended.modelId ? displayed : undefined;
	}

	/** Replaces the bound conversation's intended model. */
	private _remember(selection: IIntendedModelSelection | undefined): void {
		this._runtime.getIntentHolder().setIntendedModel(selection);
	}

	/** The intended model of the conversation this input is currently bound to. */
	private get _intendedModel(): IIntendedModelSelection | undefined {
		return this._runtime.getIntentHolder().intendedModel;
	}

	/** The model to fall back to: the surface's declared default, else the first on offer. */
	private _defaultModel(models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._runtime.getDeclaredDefaultModel(models) ?? models[0];
	}

	/** The models selectable for the bound session right now. */
	private _pool(sessionType = this._runtime.getCurrentSessionType()): ILanguageModelChatMetadataAndIdentifier[] {
		return this._runtime.getModels(sessionType);
	}

	/**
	 * Records the conversation's model as the one to reclaim, unless this sync belongs to a
	 * conversation the input has already moved off — a late sync for an outgoing session must not
	 * dictate the active one's model.
	 *
	 * The authority is recorded with it: a model that is only missing because its pool is still
	 * publishing is no less the conversation's choice, and forgetting that would let
	 * `chat.defaultModel` claim the conversation the moment the model finally arrives.
	 */
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

	/**
	 * Re-seeds from storage when the current model is absent from the destination session's pool,
	 * restoring the user's previous selection for that pool. Uses the filtered pool so a model that
	 * is catalogued but not valid for the destination is caught before targeted models load.
	 */
	reinitializeIfOutsidePool(initialize: () => void): void {
		const currentModel = this._currentModel.get();
		if (!currentModel || this._pool().some(model => model.identifier === currentModel.identifier)) {
			return;
		}
		initialize();
		this.ensureCurrentModelSupported();
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
			this._applyModel(match);
		} else if (models.length === 0) {
			this._currentModel.set(undefined, undefined);
		} else {
			this.selectDefault(sessionType);
		}
	}

	resolveDraftModel(
		draftModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		sessionTypeForValidation: string | undefined,
		validatePool: boolean,
	): IResolvedDraftModelSelection {
		let model = draftModel;
		if (validatePool && shouldDropAgnosticDraftModel(model, this._runtime.getAllModels(), sessionTypeForValidation)) {
			model = undefined;
		}
		const configuredValue = this._runtime.getConfiguredModelValue();
		if (configuredValue) {
			model = resolveConfiguredModel(configuredValue, this._pool());
		}
		return { model, changed: model?.identifier !== draftModel?.identifier };
	}

	private _applySessionRestore(
		model: ILanguageModelChatMetadataAndIdentifier,
		applyModel: boolean,
		configuration: Record<string, unknown> | undefined,
		conversationKey: string,
		restoredAs: RestoredModelReason,
	): void {
		this._clearPendingProgrammaticSelection();
		this._selectionReason = restoredAs;
		this._remember({ modelId: model.identifier, model, reason: restoredAs, configuration });
		if (configuration) {
			this._runtime.restoreModelConfiguration?.(model.identifier, configuration);
		}
		if (applyModel) {
			this._applyModel(model);
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

	private _applyModel(model: ILanguageModelChatMetadataAndIdentifier): void {
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
