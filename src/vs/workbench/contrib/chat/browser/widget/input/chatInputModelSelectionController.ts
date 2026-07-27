/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { InitialModelSelectionResult, isInConversationModelChoice, ModelIdentifierResolution, ModelSelectionApplyReason, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier } from '../../../common/modelSelection.js';
import { findBestMatchingModel, findDefaultModel, hasModelsTargetingSession, isModelSupportedForInlineChat, isModelSupportedForMode, isModelValidForSession, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange, shouldWaitForSessionModel } from './chatInputModelUtils.js';
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
	readonly resolveModelIdentifier: (identifier: string) => ModelIdentifierResolution;
	readonly subscribeToModelChanges: (listener: () => void) => IDisposable;
	readonly getBoundConversationKey: () => string | undefined;
	readonly getVisibleConversationKey: () => string | undefined;
	readonly restoreModelConfiguration: (modelId: string, configuration: Record<string, unknown> | undefined) => void;
	readonly applyModel: (model: ILanguageModelChatMetadataAndIdentifier) => void;
}

interface IResolvedDraftModelSelection {
	readonly model: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly changed: boolean;
}

type ModelSelectionIntent =
	| { readonly kind: 'programmatic'; readonly resolveModel: () => ILanguageModelChatMetadataAndIdentifier | undefined; readonly conversationKey: string | undefined; readonly complete: (applied: boolean) => void }
	| { readonly kind: 'session'; readonly model: ILanguageModelChatMetadataAndIdentifier; readonly configuration: Record<string, unknown> | undefined; readonly sessionType: string | undefined; readonly conversationKey: string }
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
	 * together with the authority that put them there. Seeded from persisted storage by
	 * {@link initialize} and updated by every deliberate choice (explicit pick, programmatic
	 * selection, session restore). Falling back to a default because the catalog dropped the model
	 * is a display state, not a decision, so it deliberately leaves this untouched — see
	 * {@link _restoreRememberedModel}. The reason is retained so a restore reinstates the original
	 * authority rather than downgrading an explicit pick to a mere remembered one.
	 */
	private _rememberedSelection: { readonly modelId: string; readonly reason: ModelSelectionApplyReason } | undefined;

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
		return !!modelId && !this._selectablePool(this._runtime.getCurrentSessionType()).some(model => model.identifier === modelId);
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
		this._rememberedSelection = { modelId: model.identifier, reason: ModelSelectionReason.UserSelection };
		this._diagnostics.report('explicit-selection', { model: model.identifier }, 'info');
		try {
			apply();
			this._diagnostics.report('explicit-selection-applied', { model: model.identifier }, 'info');
		} catch (error) {
			if (rollbackOnError) {
				this._currentModel.set(previousModel, undefined);
				this._selectionReason = previousReason;
				this._rememberedSelection = previousRememberedSelection;
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
		this._rememberedSelection = { modelId: model.identifier, reason: ModelSelectionReason.ProgrammaticSelection };
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
		this._rememberedSelection = rememberedModelId ? { modelId: rememberedModelId, reason: ModelSelectionReason.Remembered } : undefined;
		// One catalog snapshot for the whole decision, so the fallback we fall back *to* is the
		// same one the precedence rules were evaluated against.
		const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
		const fallbackModel = findDefaultModel(models, this._runtime.location);
		// `chat.defaultModel` seeds new conversations only; a conversation with history keeps
		// the model it was started with.
		const configuredModel = this._runtime.isEmpty() ? resolveConfiguredModel(this._runtime.getConfiguredModelValue(), models) : undefined;
		const selection = resolveInitialModelSelection({
			configuredModel,
			desiredModelResolution: resolveModelIdentifier(models, rememberedModelId, false),
			desiredReason: ModelSelectionReason.Remembered,
			fallbackModel,
			fallbackReason: ModelSelectionReason.FirstAvailable,
		});

		onInitialSelection(selection);
		this._reportInitialization(this._runtime.getConfiguredModelValue(), rememberedModelId, selection);
		if (selection.kind === 'apply') {
			this._selectionReason = selection.reason;
			this._applyModel(selection.model);
			this.ensureCurrentModelSupported();
		} else if (selection.kind === 'pending' && fallbackModel) {
			// The remembered model isn't in the catalog yet. Show the default meanwhile;
			// `_restoreRememberedModel` claims the real one as soon as it is published.
			this._selectionReason = ModelSelectionReason.FirstAvailable;
			this._applyModel(fallbackModel);
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
			this._replaceInvalidSelection(currentModel, sessionType);
		}
	}

	/**
	 * The pool to choose a replacement from. {@link filterModelsForSession} only applies mode and
	 * inline-chat filtering to the general pool, so a targeted session pool can still offer models
	 * the current mode cannot use — including the one being replaced. Prefer the usable subset, but
	 * fall back to the raw pool rather than selecting nothing when a provider advertises no usable
	 * model at all.
	 */
	private _selectablePool(sessionType: string | undefined): ILanguageModelChatMetadataAndIdentifier[] {
		const models = this._runtime.getModels(sessionType);
		const selectable = models.filter(model =>
			isModelSupportedForMode(model, this._runtime.getCurrentModeKind())
			&& isModelSupportedForInlineChat(model, this._runtime.location));
		return selectable.length > 0 ? selectable : models;
	}

	/**
	 * Replaces a selection that is no longer valid, applying the precedence every such path shares:
	 * the remembered selection if the catalog can offer it, else the closest match for what was
	 * displaced, else the default.
	 *
	 * The callers differ only in *why* the current model stopped being valid — unsupported for the
	 * mode, outside the session pool, withdrawn from the catalog. Routing them all through here
	 * keeps that difference from turning into a difference in what replaces it.
	 */
	private _replaceInvalidSelection(
		displaced: ILanguageModelChatMetadataAndIdentifier | undefined,
		sessionType: string | undefined,
	): void {
		if (this._restoreRememberedModel()) {
			return;
		}
		const candidates = this._selectablePool(sessionType).filter(model => model.identifier !== displaced?.identifier);
		const match = findBestMatchingModel(displaced, candidates);
		if (match) {
			this._applyModel(match);
			return;
		}
		this.selectDefault(sessionType);
	}

	selectDefault(sessionType = this._runtime.getCurrentSessionType()): void {
		const allModels = this._runtime.getAllModels();
		if (sessionType && this._runtime.requiresCustomModels(sessionType) && !hasModelsTargetingSession(allModels, sessionType)) {
			return;
		}
		const models = this._selectablePool(sessionType);
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

	/**
	 * Falls back to the default because the user asked for it, as opposed to because the current
	 * model stopped being valid. That makes it a deliberate choice, so it discards the remembered
	 * selection: a model that reappears later must not reclaim the input behind the user's back.
	 */
	resetToDefault(sessionType = this._runtime.getCurrentSessionType()): void {
		this._clearIntent();
		this._rememberedSelection = undefined;
		// Drop the authority too: `selectDefault` overwrites it whenever it applies something, but
		// leaving a stale `UserSelection` behind on an empty pool would keep blocking
		// `chat.defaultModel` from ever seeding this conversation.
		this._selectionReason = undefined;
		this.selectDefault(sessionType);
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
		this._replaceInvalidSelection(currentModel, this._runtime.getCurrentSessionType());
	}

	/**
	 * Reclaims the remembered model whenever the catalog can offer it again. A model can leave the
	 * pool for reasons that have nothing to do with intent — an agent host that restarts drops its
	 * whole catalog and republishes it moments later — and the default we show meanwhile is a
	 * stand-in, not a decision. Every deliberate choice updates {@link _rememberedSelection}, so a
	 * current model that differs from it is always a stand-in of some kind and may be superseded.
	 * `chat.defaultModel` outranks a merely remembered model, but never an in-conversation choice,
	 * which is why the displaced authority is restored along with the model.
	 */
	private _restoreRememberedModel(): boolean {
		const remembered = this._rememberedSelection;
		if (!remembered || this._currentModel.get()?.identifier === remembered.modelId) {
			return false;
		}
		if (this._selectionReason === ModelSelectionReason.ConfiguredDefault && !isInConversationModelChoice(remembered.reason)) {
			return false;
		}
		// Selectability is the validity test: a model that is not offered here — because the
		// catalog dropped it, or because this mode cannot use it — is not restorable right now.
		const model = this._selectablePool(this._runtime.getCurrentSessionType()).find(model => model.identifier === remembered.modelId);
		if (!model) {
			return false;
		}
		this._diagnostics.report('restore-remembered-model', { model: remembered.modelId, reason: remembered.reason }, 'info');
		this._selectionReason = remembered.reason;
		this._applyModel(model);
		return true;
	}

	syncFromConversationState(
		desiredModel: ILanguageModelChatMetadataAndIdentifier,
		modelConfiguration: Record<string, unknown> | undefined,
		sessionType: string | undefined,
		conversationKey: string,
	): void {
		this.clearHistoryIntent();
		const allModels = this._runtime.getAllModels();
		const currentModel = this._currentModel.get();
		const resolution = this._runtime.resolveModelIdentifier(desiredModel.identifier);
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
			this._applySessionRestore(desiredModel, syncResult.action === 'apply', {
				modelId: desiredModel.identifier,
				configuration: modelConfiguration,
			});
			return;
		}

		const pool = this._runtime.getModels(sessionType);
		const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
		if (match) {
			this._applySessionRestore(match, true);
		} else if (resolution.kind === 'pending' && shouldWaitForSessionModel(desiredModel, sessionType, allModels)) {
			this._clearIntent();
			this._intent = { kind: 'session', model: desiredModel, configuration: modelConfiguration, sessionType, conversationKey };
		} else {
			this._clearIntent();
			this.selectDefault(sessionType);
		}
	}

	/**
	 * Validate that the current model belongs to the current session's pool.
	 * Called when switching sessions to prevent cross-contamination.
	 */
	ensureCurrentModelInSessionPool(): void {
		const currentModel = this._currentModel.get();
		if (currentModel && !isModelValidForSession(currentModel, this._runtime.getAllModels(), this._runtime.getCurrentSessionType())) {
			this._replaceInvalidSelection(currentModel, this._runtime.getCurrentSessionType());
		}
	}

	/**
	 * Reconcile the current model after an explicit session-type pick: restore persisted →
	 * best-match previous → default.
	 */
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
		// A destination pool that has published nothing yet has no stand-in to offer, so clear the
		// selection rather than reaching into another pool for one.
		if (models.length === 0) {
			this._currentModel.set(undefined, undefined);
			return;
		}
		this._replaceInvalidSelection(previousModel, sessionType);
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
			this._rememberedSelection = { modelId: match.identifier, reason: ModelSelectionReason.SessionRestore };
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
		configuration?: { readonly modelId: string; readonly configuration: Record<string, unknown> | undefined },
	): void {
		this._clearIntent();
		this._selectionReason = ModelSelectionReason.SessionRestore;
		this._rememberedSelection = { modelId: model.identifier, reason: ModelSelectionReason.SessionRestore };
		if (configuration) {
			this._runtime.restoreModelConfiguration(configuration.modelId, configuration.configuration);
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

		if (intent.kind === 'session') {
			if (this._runtime.getBoundConversationKey() !== intent.conversationKey) {
				this._clearIntent();
				return true;
			}
			const resolution = this._runtime.resolveModelIdentifier(intent.model.identifier);
			if (resolution.kind === 'available') {
				this._intent = undefined;
				this._applySessionRestore(resolution.model, true, { modelId: intent.model.identifier, configuration: intent.configuration });
				return true;
			}
			if (resolution.kind === 'unavailable') {
				this._intent = undefined;
				const match = findBestMatchingModel(intent.model, this._runtime.getModels(intent.sessionType));
				if (match) {
					this._applySessionRestore(match, true);
				} else {
					this.selectDefault(intent.sessionType);
				}
				return true;
			}
			return false;
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
			this._rememberedSelection = { modelId: model.identifier, reason: ModelSelectionReason.SessionRestore };
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
