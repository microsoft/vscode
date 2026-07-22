/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { InitialModelSelectionResult, ModelIdentifierResolution, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection } from '../../../common/modelSelection.js';
import { findBestMatchingModel, findDefaultModel, findReplacementForProvisionalModel, hasModelsTargetingSession, isModelValidForSession, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange, shouldWaitForSessionModel } from './chatInputModelUtils.js';
import { IChatModelSelectionDiagnostics, NullChatModelSelectionDiagnostics } from './chatModelSelectionDiagnostics.js';
import { ChatModelSelectionModel } from './chatModelSelectionModel.js';

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

/** Reconciles the shared selection model with Workbench-specific input and catalog state. */
export class ChatInputModelSelectionController extends Disposable {

	private readonly _authoritativeModelWait = this._register(new MutableDisposable<IDisposable>());
	private readonly _historyModelWait = this._register(new MutableDisposable<IDisposable>());
	private _provisionalModelId: string | undefined;
	private _restorePerTypeModel = false;

	constructor(
		private readonly _model: ChatModelSelectionModel,
		private readonly _runtime: IChatInputModelSelectionRuntime,
		private readonly _diagnostics: IChatModelSelectionDiagnostics = NullChatModelSelectionDiagnostics,
	) {
		super();
	}

	get restorePerTypeModel(): boolean {
		return this._restorePerTypeModel;
	}

	get provisionalModelId(): string | undefined {
		return this._provisionalModelId;
	}

	beginSessionSwitch(isEmpty: boolean, ownsPool: boolean, hadIncomingModel: boolean): void {
		this._model.resetSelectionOrigin();
		this._provisionalModelId = undefined;
		this._restorePerTypeModel = isEmpty && ownsPool && !hadIncomingModel;
		this.clearAuthoritativeModelWait();
		this.clearHistoryModelWait();
	}

	endSessionSwitch(): void {
		this._restorePerTypeModel = false;
	}

	hasAuthoritativeModelWait(): boolean {
		return !!this._authoritativeModelWait.value;
	}

	clearAuthoritativeModelWait(): void {
		this._authoritativeModelWait.clear();
	}

	clearHistoryModelWait(): void {
		this._historyModelWait.clear();
	}

	applyExplicitSelection(
		model: ILanguageModelChatMetadataAndIdentifier,
		sessionKey: string | undefined,
		conversationKey: string | undefined,
		apply: () => void,
		rollbackOnError: boolean,
	): void {
		this.clearAuthoritativeModelWait();
		this.clearHistoryModelWait();
		this._provisionalModelId = undefined;
		this._model.applyExplicitSelection(model, sessionKey, conversationKey, apply, rollbackOnError);
	}

	initialize(rememberedModelId: string | undefined, onInitialSelection: (selection: InitialModelSelectionResult) => void): void {
		this.clearAuthoritativeModelWait();
		this._provisionalModelId = undefined;
		const resolveSelection = (): InitialModelSelectionResult => {
			const configuredModelValue = this._runtime.getConfiguredModelValue();
			const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
			const configuredModel = resolveConfiguredModel(configuredModelValue, models);
			const resolution = rememberedModelId ? this._runtime.resolveModelIdentifier(rememberedModelId) : { kind: 'notRequested' } as const;
			return resolveInitialModelSelection({
				configuredModelValue,
				configuredModel,
				waitForConfiguredModel: false,
				desiredModelResolution: resolution,
				desiredReason: ModelSelectionReason.Remembered,
				fallbackModel: findDefaultModel(models, this._runtime.location),
				fallbackReason: ModelSelectionReason.FirstAvailable,
			});
		};

		const selection = resolveSelection();
		onInitialSelection(selection);
		this._reportInitialization(this._runtime.getConfiguredModelValue(), rememberedModelId, selection);
		this._applyInitialSelection(selection);

		// The remembered model has not been honored yet when we only applied a provisional fallback
		// (`FirstAvailable`) or are still waiting for the pool to load (`pending`). In both cases,
		// watch the catalog and swap the remembered model in once it appears; a configured or
		// otherwise-available model — or an explicit user pick — supersedes it. Routing both cases
		// through one wait (instead of arming it only for `pending`) means a remembered model that
		// lands *after* the first, possibly non-empty, catalog batch is no longer lost.
		if (rememberedModelId && (selection.kind === 'pending' || (selection.kind === 'apply' && selection.reason === ModelSelectionReason.FirstAvailable))) {
			const desiredIdentifier = rememberedModelId;
			this._watchModelChanges(this._authoritativeModelWait, () => true, () => {
				const lateSelection = resolveSelection();
				if (lateSelection.kind === 'apply' && lateSelection.reason !== ModelSelectionReason.FirstAvailable) {
					this._provisionalModelId = undefined;
					this._model.setSelectionReason(lateSelection.reason);
					this._runtime.applyModel(lateSelection.model);
					this.ensureCurrentModelSupported();
					return 'settled';
				}
				// Keep waiting only while the remembered model's vendor still reports its absence as
				// transient (`pending`); once it is conclusively gone (`unavailable`/`notRequested`)
				// settle on the applied fallback so the wait cannot linger forever.
				return this._runtime.resolveModelIdentifier(desiredIdentifier).kind === 'pending' ? 'waiting' : 'settled';
			});
		}
	}

	private _applyInitialSelection(selection: InitialModelSelectionResult): void {
		if (selection.kind === 'apply') {
			this._model.setSelectionReason(selection.reason);
			this._provisionalModelId = selection.reason === ModelSelectionReason.FirstAvailable
				&& !selection.model.metadata.isDefaultForLocation[this._runtime.location]
				? selection.model.identifier
				: undefined;
			this._runtime.applyModel(selection.model);
			this.ensureCurrentModelSupported();
		} else if (selection.kind === 'pending') {
			const fallbackModel = findDefaultModel(this._runtime.getModels(this._runtime.getCurrentSessionType()), this._runtime.location);
			if (fallbackModel) {
				this._model.setSelectionReason(ModelSelectionReason.FirstAvailable);
				this._provisionalModelId = fallbackModel.metadata.isDefaultForLocation[this._runtime.location]
					? undefined
					: fallbackModel.identifier;
				this._runtime.applyModel(fallbackModel);
			}
		}
	}

	/**
	 * Subscribes to catalog changes and re-runs `reevaluate` on each one, tearing the subscription
	 * down as soon as it reports `'settled'` — or when `isRelevant()` becomes false (the bound/visible
	 * conversation moved on) or the controller is disposed. Shared by the restore waits so the
	 * subscription lifecycle and relevance guard live in one place; `reevaluate` is responsible for
	 * applying any model change and returning whether the wait is done.
	 */
	private _watchModelChanges(
		wait: MutableDisposable<IDisposable>,
		isRelevant: () => boolean,
		reevaluate: () => 'settled' | 'waiting',
	): void {
		wait.value = this._runtime.subscribeToModelChanges(() => {
			if (!isRelevant()) {
				wait.clear();
				return;
			}
			if (reevaluate() === 'settled') {
				wait.clear();
			}
		});
	}

	ensureCurrentModelSupported(): void {
		const currentModel = this._model.currentModel.get();
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
			currentModel: this._model.currentModel.get()?.identifier,
		}, defaultModel ? 'info' : 'debug');
		if (!defaultModel) {
			return;
		}
		const isProvisional = this._runtime.isEmpty()
			&& !this._model.userExplicitlySelectedModel
			&& !configuredModel
			&& !defaultModel.metadata.isDefaultForLocation[this._runtime.location];
		this._model.setSelectionReason(configuredModel ? ModelSelectionReason.ConfiguredDefault : ModelSelectionReason.FirstAvailable);
		this._provisionalModelId = isProvisional ? defaultModel.identifier : undefined;
		this._runtime.applyModel(defaultModel);
	}

	applyConfiguredDefault(): boolean {
		if (!this._runtime.isEmpty()
			|| this._model.userExplicitlySelectedModel
			|| this._model.selectionReason === ModelSelectionReason.SessionRestore) {
			return false;
		}
		const configuredValue = this._runtime.getConfiguredModelValue();
		if (!configuredValue) {
			return false;
		}
		const configuredModel = resolveConfiguredModel(configuredValue, this._runtime.getModels(this._runtime.getCurrentSessionType()));
		if (!configuredModel || configuredModel.identifier === this._model.currentModel.get()?.identifier) {
			return false;
		}
		this.clearAuthoritativeModelWait();
		this._model.setSelectionReason(ModelSelectionReason.ConfiguredDefault);
		this._runtime.applyModel(configuredModel);
		this.ensureCurrentModelSupported();
		return true;
	}

	reconcileModelListChange(models: readonly ILanguageModelChatMetadataAndIdentifier[]): void {
		if (this.applyConfiguredDefault() || this._replaceProvisionalModelWithDefault(models)) {
			return;
		}
		if (!shouldResetOnModelListChange(this._model.currentModel.get()?.identifier, [...models])) {
			return;
		}
		const match = findBestMatchingModel(this._model.currentModel.get(), models);
		if (match) {
			this._runtime.applyModel(match);
		} else {
			this.selectDefault();
		}
	}

	syncFromConversationState(
		desiredModel: ILanguageModelChatMetadataAndIdentifier,
		modelConfiguration: Record<string, unknown> | undefined,
		sessionType: string | undefined,
		conversationKey: string,
	): void {
		this.clearHistoryModelWait();
		const allModels = this._runtime.getAllModels();
		const currentModel = this._model.currentModel.get();
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
			this.clearAuthoritativeModelWait();
			this.clearHistoryModelWait();
			this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
			this._runtime.restoreModelConfiguration(desiredModel.identifier, modelConfiguration);
			if (syncResult.action === 'apply') {
				this._runtime.applyModel(desiredModel);
			}
			return;
		}

		const pool = this._runtime.getModels(sessionType);
		const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
		if (match) {
			this.clearAuthoritativeModelWait();
			this.clearHistoryModelWait();
			this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
			this._runtime.applyModel(match);
		} else if (resolution.kind === 'pending' && shouldWaitForSessionModel(desiredModel, sessionType, allModels)) {
			this._watchModelChanges(
				this._authoritativeModelWait,
				() => this._runtime.getBoundConversationKey() === conversationKey,
				() => {
					const lateResolution = this._runtime.resolveModelIdentifier(desiredModel.identifier);
					if (lateResolution.kind === 'available') {
						this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
						this._runtime.restoreModelConfiguration(desiredModel.identifier, modelConfiguration);
						this._runtime.applyModel(lateResolution.model);
						return 'settled';
					}
					if (lateResolution.kind === 'unavailable') {
						const lateMatch = findBestMatchingModel(desiredModel, this._runtime.getModels(sessionType));
						if (lateMatch) {
							this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
							this._runtime.applyModel(lateMatch);
						} else {
							this.selectDefault(sessionType);
						}
						return 'settled';
					}
					return 'waiting';
				},
			);
		} else {
			this.clearAuthoritativeModelWait();
			this.selectDefault(sessionType);
		}
	}

	ensureCurrentModelInSessionPool(): void {
		const currentModel = this._model.currentModel.get();
		if (currentModel && !isModelValidForSession(currentModel, this._runtime.getAllModels(), this._runtime.getCurrentSessionType())) {
			this.selectDefault();
		}
	}

	revalidateForSessionType(initialize: () => void): void {
		const previousModel = this._model.currentModel.get();
		this._model.resetSelectionOrigin();
		initialize();
		const restoredModel = this._model.currentModel.get();
		const sessionType = this._runtime.getCurrentSessionType();
		if (restoredModel && isModelValidForSession(restoredModel, this._runtime.getAllModels(), sessionType)) {
			return;
		}
		const match = findBestMatchingModel(previousModel, this._runtime.getModels(sessionType));
		if (match) {
			this._runtime.applyModel(match);
		} else {
			this.selectDefault(sessionType);
		}
	}

	preselectFromHistory(modelId: string, conversationKey: string): void {
		this.clearAuthoritativeModelWait();
		this.clearHistoryModelWait();
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
			this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
			this._runtime.applyModel(match);
			return;
		}
		this._watchModelChanges(
			this._historyModelWait,
			() => this._runtime.getVisibleConversationKey() === conversationKey,
			() => {
				const lateMatch = tryMatch();
				if (lateMatch) {
					this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
					this._runtime.applyModel(lateMatch);
					return 'settled';
				}
				return 'waiting';
			},
		);
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

	private _replaceProvisionalModelWithDefault(models: readonly ILanguageModelChatMetadataAndIdentifier[]): boolean {
		if (!this._runtime.isEmpty() || this._model.userExplicitlySelectedModel || this.hasAuthoritativeModelWait()) {
			return false;
		}
		const replacement = findReplacementForProvisionalModel(
			this._model.currentModel.get()?.identifier,
			this._provisionalModelId,
			models,
			this._runtime.location,
		);
		if (!replacement) {
			return false;
		}
		this._provisionalModelId = undefined;
		this._model.setSelectionReason(ModelSelectionReason.FirstAvailable);
		this._runtime.applyModel(replacement);
		this.ensureCurrentModelSupported();
		return true;
	}

	private _reportInitialization(configuredModel: string | undefined, rememberedModel: string | undefined, selection: InitialModelSelectionResult): void {
		this._diagnostics.report('initialize', {
			configuredModel,
			rememberedModel,
			availableModels: this._runtime.getModels(this._runtime.getCurrentSessionType()).map(model => model.identifier).join(','),
			selection: selection.kind,
			resultModel: selection.kind === 'apply' ? selection.model.identifier : undefined,
			resultReason: selection.kind === 'apply' ? selection.reason : undefined,
			pendingSource: selection.kind === 'pending' ? selection.selection.source : undefined,
			pendingReference: selection.kind === 'pending' ? selection.selection.reference : undefined,
		}, selection.kind === 'none' ? 'debug' : 'info');
	}
}
