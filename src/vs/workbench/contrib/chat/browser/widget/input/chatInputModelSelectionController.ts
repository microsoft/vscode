/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { InitialModelSelectionResult, isInConversationModelChoice, ModelSelectionApplyReason, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier } from '../../../common/modelSelection.js';
import { findBestMatchingModel, findDefaultModel, hasModelsTargetingSession, isModelValidForSession, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange } from './chatInputModelUtils.js';
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
	readonly getVisibleConversationKey: () => string | undefined;
	readonly restoreModelConfiguration: (modelId: string, configuration: Record<string, unknown> | undefined) => void;
	readonly applyModel: (model: ILanguageModelChatMetadataAndIdentifier) => void;
}

/** A model the user is meant to be on, and the authority and context that put them there. */
interface IRememberedModelSelection {
	readonly modelId: string;
	/** Present when the model itself was seen; absent when only an id was restored from storage. */
	readonly model?: ILanguageModelChatMetadataAndIdentifier;
	readonly reason: ModelSelectionApplyReason;
	readonly configuration?: Record<string, unknown>;
	/** The conversation this came from, for selections restored from conversation state. */
	readonly conversationKey?: string;
}

interface IResolvedDraftModelSelection {
	readonly model: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly changed: boolean;
}

type ModelSelectionIntent =
	| { readonly kind: 'programmatic'; readonly resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined; readonly conversationKey: string | undefined; readonly complete: (applied: boolean) => void }
	| { readonly kind: 'history'; readonly modelId: string; readonly conversationKey: string };

/** Reconciles the shared selection model with Workbench-specific input and catalog state. */
export class ChatInputModelSelectionController extends Disposable {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>(this, undefined);
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> = this._currentModel;
	private _selectionReason: ModelSelectionApplyReason | undefined;
	private _intent: ModelSelectionIntent | undefined;
	private _restorePerTypeModel = false;
	/**
	 * The model the user is meant to be on, independent of what the catalog can currently offer,
	 * together with the authority that put them there and any per-model configuration that belongs
	 * with it. Seeded from persisted storage by {@link initialize} and updated by every deliberate
	 * choice (explicit pick, programmatic selection, session restore). Falling back to a default
	 * because the catalog cannot offer the model *yet* is a display state, not a decision, so it
	 * deliberately leaves this untouched — see {@link _restoreRememberedModel}, which reclaims the
	 * model the moment it appears. That reclaim is what makes catalog timing irrelevant: there is
	 * no deadline by which a model must be published to be honoured. The reason is retained so a
	 * restore reinstates the original authority rather than downgrading an explicit pick to a mere
	 * remembered one.
	 */
	private _rememberedSelection: IRememberedModelSelection | undefined;
	/**
	 * The last model applied purely as a stand-in for a {@link _rememberedSelection} the catalog
	 * could not offer yet. Retained only to recognise it coming back around the conversation-state
	 * round-trip — see {@link _isEchoOfStandIn}.
	 */
	private _standInModelId: string | undefined;

	constructor(
		private readonly _runtime: IChatInputModelSelectionRuntime,
		private readonly _diagnostics: IChatModelSelectionDiagnostics = NullChatModelSelectionDiagnostics,
	) {
		super();
		this._register(this._runtime.subscribeToModelChanges(() => this.reconcileModelListChange(this._runtime.getModels(this._runtime.getCurrentSessionType()))));
		this._register(toDisposable(() => this._clearIntent()));
	}

	get restorePerTypeModel(): boolean {
		return this._restorePerTypeModel;
	}

	get selectionReason(): ModelSelectionApplyReason | undefined {
		return this._selectionReason;
	}

	get userExplicitlySelectedModel(): boolean {
		return this._selectionReason === ModelSelectionReason.UserSelection;
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
		const modelId = this._rememberedSelection?.modelId;
		return !!modelId && !this._runtime.getModels(this._runtime.getCurrentSessionType()).some(model => model.identifier === modelId);
	}

	hasPendingProgrammaticSelection(): boolean {
		return this._intent?.kind === 'programmatic';
	}

	clearIntent(): void {
		this._clearIntent();
	}

	clearHistoryIntent(): void {
		if (this._intent?.kind === 'history') {
			this._clearIntent();
		}
	}

	applyExplicitSelection(
		model: ILanguageModelChatMetadataAndIdentifier,
		apply: () => void,
		rollbackOnError: boolean,
	): void {
		this._clearIntent();
		const previousModel = this._currentModel.get();
		const previousReason = this._selectionReason;
		const previousRememberedSelection = this._rememberedSelection;
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

	applyAutomaticSelection(model: ILanguageModelChatMetadataAndIdentifier, apply: () => void): void {
		this._currentModel.set(model, undefined);
		apply();
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
				kind: 'programmatic',
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

	initialize(rememberedModelId: string | undefined, onInitialSelection: (selection: InitialModelSelectionResult) => void): void {
		this._clearIntent();
		// Storage records only explicit picks, but it is not an in-conversation choice: a new
		// conversation still lets `chat.defaultModel` take precedence over it.
		this._remember(rememberedModelId ? { modelId: rememberedModelId, reason: ModelSelectionReason.Remembered } : undefined);
		const resolveSelection = (): InitialModelSelectionResult => {
			const configuredModelValue = this._runtime.getConfiguredModelValue();
			const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
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
		onInitialSelection(selection);
		this._reportInitialization(this._runtime.getConfiguredModelValue(), rememberedModelId, selection);
		if (selection.kind === 'apply') {
			this._selectionReason = selection.reason;
			this._applyModel(selection.model);
			this.ensureCurrentModelSupported();
		} else if (selection.kind === 'pending') {
			// The remembered model isn't in the catalog yet. Show the default meanwhile;
			// `_restoreRememberedModel` claims the real one as soon as it is published.
			const fallbackModel = findDefaultModel(this._runtime.getModels(this._runtime.getCurrentSessionType()), this._runtime.location);
			if (fallbackModel) {
				this._selectionReason = ModelSelectionReason.FirstAvailable;
				this._applyModel(fallbackModel);
			}
		}
	}

	ensureCurrentModelSupported(): void {
		const currentModel = this._currentModel.get();
		const sessionType = this._runtime.getCurrentSessionType();
		const models = this._runtime.getModels(sessionType);
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
		const models = this._runtime.getModels(sessionType);
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
		// `chat.defaultModel` is the default for every new (empty) conversation. Only a genuine
		// in-conversation choice blocks it: an explicit user pick or a mode-forced programmatic
		// selection. `SessionRestore` on an empty session is just spillover from the previous
		// session and must yield.
		if (!this._runtime.isEmpty()
			|| isInConversationModelChoice(this._selectionReason)
			|| this._intent) {
			return false;
		}
		const configuredValue = this._runtime.getConfiguredModelValue();
		if (!configuredValue) {
			return false;
		}
		const configuredModel = resolveConfiguredModel(configuredValue, this._runtime.getModels(this._runtime.getCurrentSessionType()));
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
		// A history restore that is still waiting for its model owns the selection; falling through
		// would swap in a stand-in from a pool that may still be filling.
		if (this._intent?.kind === 'history') {
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
	 * Reclaims the remembered model whenever the catalog can offer it — no matter how long that
	 * takes. A model can be missing for reasons that have nothing to do with intent: an agent host
	 * publishes its catalog in waves, and restarting one drops the whole catalog and republishes it
	 * moments later. The default shown meanwhile is a stand-in, not a decision. Every deliberate
	 * choice updates {@link _rememberedSelection}, so a current model that differs from it is
	 * always a stand-in of some kind and may be superseded. `chat.defaultModel` outranks a merely
	 * remembered model, but never an in-conversation choice, which is why the displaced authority
	 * is restored along with the model.
	 */
	private _restoreRememberedModel(): boolean {
		const remembered = this._rememberedSelection;
		if (!remembered || this._currentModel.get()?.identifier === remembered.modelId) {
			return false;
		}
		if (this._selectionReason === ModelSelectionReason.ConfiguredDefault && !isInConversationModelChoice(remembered.reason)) {
			return false;
		}
		// Pool membership is the validity test: the pool is already filtered by session and mode,
		// so a model that is absent here is genuinely not selectable right now.
		const pool = this._runtime.getModels(this._runtime.getCurrentSessionType());
		const exact = pool.find(model => model.identifier === remembered.modelId);
		// A conversation's model is tied to a pool that can be republished under different
		// identifiers (an agent host re-exposing the same model, a handoff between pools), so when
		// the exact model is gone an equivalent one still serves the conversation better than the
		// generic default. The remembered selection deliberately keeps pointing at the original, so
		// the exact model still wins if it returns.
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
				awaitingModel: this._rememberedSelection?.modelId,
			}, 'info');
			return;
		}
		this.clearHistoryIntent();
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

		// The conversation's own model cannot be shown right now — most often because the pool it
		// belongs to has not finished publishing. That is a statement about the catalog, not about
		// what the user should be on, so remember it regardless and show the best stand-in
		// meanwhile; `_restoreRememberedModel` claims the real model whenever it appears, however
		// late. Only a deliberate choice made afterwards displaces it.
		this._rememberOnBoundConversation(desiredModel, modelConfiguration, conversationKey);
		this._clearIntent();
		const pool = this._runtime.getModels(sessionType);
		const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
		if (match) {
			this._applyModel(match);
			this._selectionReason = ModelSelectionReason.SessionRestore;
		} else {
			this.selectDefault(sessionType);
		}
	}

	/**
	 * Whether a conversation-state sync is merely this controller's own stand-in coming back.
	 *
	 * Applying a model writes it into the conversation's input state, which the local sync then
	 * hands straight back. While the real model is still missing from the catalog, that echo would
	 * otherwise be mistaken for the session's model and overwrite the very selection being waited
	 * for — the loop that makes a transient stand-in stick permanently.
	 *
	 * Two things keep this from swallowing a real change. Only the exact model this controller put
	 * on screen as a stand-in qualifies, and only a *local* write does: a state pushed in by
	 * another client carries {@link ChatInputStateOrigin.Remote}, so a peer that genuinely selects
	 * the stand-in still supersedes the model being awaited. A local change cannot be mistaken for
	 * an echo either, since every deliberate local choice updates {@link _rememberedSelection}
	 * before the state is written.
	 */
	private _isEchoOfStandIn(desiredModelId: string, conversationKey: string): boolean {
		const remembered = this._rememberedSelection;
		return !!remembered
			&& remembered.conversationKey === conversationKey
			&& desiredModelId === this._standInModelId
			&& this.isAwaitingRememberedModel();
	}

	/**
	 * Replaces the remembered selection. Any stand-in shown for the previous one stops being an
	 * echo candidate at that moment, so the two are always updated together.
	 */
	private _remember(selection: IRememberedModelSelection | undefined): void {
		this._rememberedSelection = selection;
		this._standInModelId = undefined;
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
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration, conversationKey });
	}

	ensureCurrentModelInSessionPool(): void {
		const currentModel = this._currentModel.get();
		if (currentModel && !isModelValidForSession(currentModel, this._runtime.getAllModels(), this._runtime.getCurrentSessionType())) {
			this.selectDefault();
		}
	}

	revalidateForSessionType(initialize: () => void): void {
		const previousModel = this._currentModel.get();
		this._selectionReason = undefined;
		initialize();
		const restoredModel = this._currentModel.get();
		const sessionType = this._runtime.getCurrentSessionType();
		const models = this._runtime.getModels(sessionType);
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

	preselectFromHistory(modelId: string, conversationKey: string): void {
		this.clearIntent();
		const tryMatch = (): ILanguageModelChatMetadataAndIdentifier | undefined => {
			const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
			if (models.length === 0 || (models.length === 1 && models[0].metadata.id.toLocaleLowerCase() === 'auto')) {
				return undefined;
			}
			return models.find(model => model.identifier === modelId)
				?? models.find(model => model.metadata.id === modelId);
		};
		const match = tryMatch();
		if (match) {
			this._selectionReason = ModelSelectionReason.SessionRestore;
			this._remember({ modelId: match.identifier, model: match, reason: ModelSelectionReason.SessionRestore });
			this._applyModel(match);
			return;
		}
		this._intent = { kind: 'history', modelId, conversationKey };
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
			model = resolveConfiguredModel(configuredValue, this._runtime.getModels(this._runtime.getCurrentSessionType()));
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
		this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration, conversationKey });
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

		if (intent.kind === 'programmatic') {
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

		if (this._runtime.getVisibleConversationKey() !== intent.conversationKey) {
			this._clearIntent();
			return true;
		}
		const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
		const model = models.find(model => model.identifier === intent.modelId)
			?? models.find(model => model.metadata.id === intent.modelId);
		if (model && !(models.length === 1 && model.metadata.id.toLocaleLowerCase() === 'auto')) {
			this._intent = undefined;
			this._selectionReason = ModelSelectionReason.SessionRestore;
			this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore });
			this._applyModel(model);
			return true;
		}
		return false;
	}

	private _clearIntent(): void {
		const intent = this._intent;
		this._intent = undefined;
		if (intent?.kind === 'programmatic') {
			intent.complete(false);
			if (this._selectionReason === ModelSelectionReason.ProgrammaticSelection) {
				this._selectionReason = undefined;
			}
		}
	}

	private _applyModel(model: ILanguageModelChatMetadataAndIdentifier): void {
		const remembered = this._rememberedSelection;
		if (remembered && model.identifier !== remembered.modelId) {
			this._standInModelId = model.identifier;
		}
		this._currentModel.set(model, undefined);
		this._runtime.applyModel(model);
	}

	private _reportInitialization(configuredModel: string | undefined, rememberedModel: string | undefined, selection: InitialModelSelectionResult): void {
		this._diagnostics.report('initialize', {
			configuredModel,
			rememberedModel,
			availableModels: this._runtime.getModels(this._runtime.getCurrentSessionType()).map(model => model.identifier).join(','),
			selection: selection.kind,
			resultModel: selection.kind === 'apply' ? selection.model.identifier : undefined,
			resultReason: selection.kind === 'apply' ? selection.reason : undefined,
			pendingReference: selection.kind === 'pending' ? selection.selection.reference : undefined,
		}, selection.kind === 'none' ? 'debug' : 'info');
	}
}
