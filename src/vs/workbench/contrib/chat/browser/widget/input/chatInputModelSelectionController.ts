/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { IIntendedModelHolder } from '../../../common/model/chatModel.js';
import { IIntendedModelSelection, InitialModelSelectionResult, isInConversationModelChoice, ModelSelectionApplyReason, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier } from '../../../common/modelSelection.js';
import { findBestMatchingModel, findDefaultModel, hasModelsTargetingSession, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange } from './chatInputModelUtils.js';
import { IChatModelSelectionDiagnostics, NullChatModelSelectionDiagnostics } from './chatModelSelectionDiagnostics.js';

/** Supplies Workbench chat's filtered model catalog and conversation effects. */
export interface IChatInputModelSelectionRuntime {
	readonly location: ChatAgentLocation;
	readonly getCurrentModeKind: () => ChatModeKind;
	readonly getCurrentSessionType: () => string | undefined;
	readonly isEmpty: () => boolean;
	readonly getModels: (sessionType: string | undefined) => ILanguageModelChatMetadataAndIdentifier[];
	readonly getAllModels: () => ILanguageModelChatMetadataAndIdentifier[];
	readonly requiresCustomModels: (sessionType: string) => boolean;
	readonly getConfiguredModelValue: () => string | undefined;
	readonly subscribeToModelChanges: (listener: () => void) => IDisposable;
	readonly getBoundConversationKey: () => string | undefined;
	/** Whoever speaks for the bound conversation's intended model — the conversation, else the composer. */
	readonly getIntentHolder: () => IIntendedModelHolder;
	readonly restoreModelConfiguration: (modelId: string, configuration: Record<string, unknown> | undefined) => void;
	readonly applyModel: (model: ILanguageModelChatMetadataAndIdentifier) => void;
}

interface IResolvedDraftModelSelection {
	readonly model: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly changed: boolean;
}

/** A model selection that cannot be applied yet because the catalog has not published it. */
interface ModelSelectionIntent {
	readonly resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly conversationKey: string | undefined;
	readonly complete: (applied: boolean) => void;
}

/** Reconciles the shared selection model with Workbench-specific input and catalog state. */
export class ChatInputModelSelectionController extends Disposable {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>(this, undefined);
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> = this._currentModel;
	private _selectionReason: ModelSelectionApplyReason | undefined;
	private _intent: ModelSelectionIntent | undefined;
	private _restorePerTypeModel = false;

	constructor(
		private readonly _runtime: IChatInputModelSelectionRuntime,
		private readonly _diagnostics: IChatModelSelectionDiagnostics = NullChatModelSelectionDiagnostics,
	) {
		super();
		this._register(this._runtime.subscribeToModelChanges(() => this.reconcileModelListChange(this._pool())));
		this._register(toDisposable(() => this._clearIntent()));
	}

	get restorePerTypeModel(): boolean {
		return this._restorePerTypeModel;
	}

	get selectionReason(): ModelSelectionApplyReason | undefined {
		return this._selectionReason;
	}

	beginSessionSwitch(isEmpty: boolean, ownsPool: boolean, hadIncomingModel: boolean): void {
		this._selectionReason = undefined;
		this._restorePerTypeModel = isEmpty && ownsPool && !hadIncomingModel;
		this._clearIntent();
	}

	endSessionSwitch(): void {
		this._restorePerTypeModel = false;
	}

	hasPendingIntent(): boolean {
		return !!this._intent;
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
		return !!this._intent;
	}

	clearIntent(): void {
		this._clearIntent();
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
		this._clearIntent();
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
		this._clearIntent();
		this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.ProgrammaticSelection });
		this._applyModel(model);
	}

	requestProgrammaticSelection(
		resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined,
		conversationKey: string | undefined,
	): Promise<boolean> {
		this._clearIntent();
		this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
		return new Promise<boolean>(resolve => {
			let complete = resolve;
			this._intent = {
				resolveModel,
				conversationKey,
				complete: applied => {
					complete(applied);
					complete = () => { };
				},
			};
			this._reconcileIntent();
		});
	}

	initialize(rememberedModelId: string | undefined): void {
		this._clearIntent();
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
				fallbackModel: findDefaultModel(models, this._runtime.location),
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
			const fallbackModel = findDefaultModel(this._pool(), this._runtime.location);
			if (fallbackModel) {
				this._selectionReason = ModelSelectionReason.FirstAvailable;
				this._applyModel(fallbackModel);
			}
		}
	}

	ensureCurrentModelSupported(): void {
		const currentModel = this._currentModel.get();
		const sessionType = this._runtime.getCurrentSessionType();
		const models = this._pool(sessionType);
		const context = {
			location: this._runtime.location,
			currentModeKind: this._runtime.getCurrentModeKind(),
			sessionType,
		};
		const willReset = shouldResetModelToDefault(currentModel, models, context, this._runtime.getAllModels());
		this._diagnostics.report('compatibility-check', {
			currentModel: currentModel?.identifier,
			mode: context.currentModeKind,
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
		const defaultModel = configuredModel ?? findDefaultModel(models, this._runtime.location);
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

	applyConfiguredDefault(): boolean {
		// `chat.defaultModel` seeds every new (empty) conversation. Only a genuine in-conversation
		// choice blocks it; a `SessionRestore` on an empty session is spillover from the previous
		// conversation and must yield.
		if (!this._runtime.isEmpty()
			|| isInConversationModelChoice(this._selectionReason)
			|| this._intent) {
			return false;
		}
		const configuredValue = this._runtime.getConfiguredModelValue();
		if (!configuredValue) {
			return false;
		}
		const configuredModel = resolveConfiguredModel(configuredValue, this._pool());
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
		if (this.applyConfiguredDefault() || this._reconcileIntent() || this._restoreRememberedModel()) {
			return;
		}
		const currentModel = this._currentModel.get();
		const locationDefault = models.find(model => model.metadata.isDefaultForLocation[this._runtime.location]);
		if (this._runtime.isEmpty()
			&& this._selectionReason === ModelSelectionReason.FirstAvailable
			&& locationDefault
			&& currentModel?.identifier !== locationDefault.identifier) {
			this._applyModel(locationDefault);
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
		const model = exact ?? (remembered.reason === ModelSelectionReason.SessionRestore ? findBestMatchingModel(remembered.model, pool) : undefined);
		if (!model || (!exact && this._currentModel.get()?.identifier === model.identifier)) {
			return false;
		}
		this._diagnostics.report('restore-remembered-model', { model: model.identifier, remembered: remembered.modelId, reason: remembered.reason }, 'info');
		this._selectionReason = remembered.reason;
		if (exact && remembered.configuration) {
			this._runtime.restoreModelConfiguration(remembered.modelId, remembered.configuration);
		}
		this._applyModel(model);
		return true;
	}

	syncFromConversationState(
		desiredModel: ILanguageModelChatMetadataAndIdentifier,
		modelConfiguration: Record<string, unknown> | undefined,
		sessionType: string | undefined,
		conversationKey: string,
		isRemoteEdit = false,
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
		const syncResult = resolveModelFromSyncState(desiredModel, currentModel, allModels, sessionType, {
			location: this._runtime.location,
			currentModeKind: this._runtime.getCurrentModeKind(),
			sessionType,
		});
		this._diagnostics.report('conversation-restore', {
			desiredModel: desiredModel.identifier,
			currentModel: currentModel?.identifier,
			sessionType,
			action: syncResult.action,
		}, syncResult.action === 'keep' ? 'debug' : 'info');
		if (syncResult.action === 'apply' || syncResult.action === 'keep') {
			this._applySessionRestore(desiredModel, syncResult.action === 'apply', modelConfiguration, conversationKey);
			return;
		}

		// The conversation's model is not available yet, usually because its pool is still
		// publishing. That says nothing about what the user should be on, so remember it anyway and
		// show the best stand-in until `_restoreRememberedModel` can claim the real one.
		this._rememberOnBoundConversation(desiredModel, modelConfiguration, conversationKey);
		this._clearIntent();
		const pool = this._pool(sessionType);
		const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
		if (match) {
			this._applyModel(match);
			this._selectionReason = ModelSelectionReason.SessionRestore;
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

	/** The models selectable for the bound session right now. */
	private _pool(sessionType = this._runtime.getCurrentSessionType()): ILanguageModelChatMetadataAndIdentifier[] {
		return this._runtime.getModels(sessionType);
	}

	/**
	 * Records the conversation's model as the one to reclaim, unless this sync belongs to a
	 * conversation the input has already moved off — a late sync for an outgoing session must not
	 * dictate the active one's model.
	 */
	private _rememberOnBoundConversation(
		model: ILanguageModelChatMetadataAndIdentifier,
		configuration: Record<string, unknown> | undefined,
		conversationKey: string,
	): void {
		if (this._runtime.getBoundConversationKey() !== conversationKey) {
			return;
		}
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration });
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
	): void {
		this._clearIntent();
		this._selectionReason = ModelSelectionReason.SessionRestore;
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration });
		if (configuration) {
			this._runtime.restoreModelConfiguration(model.identifier, configuration);
		}
		if (applyModel) {
			this._applyModel(model);
		}
	}

	private _reconcileIntent(): boolean {
		const intent = this._intent;
		if (!intent) {
			return false;
		}
		// The conversation moved on while the model was still unpublished, so nobody is waiting.
		if (this._runtime.getBoundConversationKey() !== intent.conversationKey) {
			this._clearIntent();
			return true;
		}
		const model = intent.resolveModel();
		if (!model) {
			return false;
		}
		this._intent = undefined;
		intent.complete(true);
		this.applyProgrammaticSelection(model);
		return true;
	}

	private _clearIntent(): void {
		const intent = this._intent;
		this._intent = undefined;
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
