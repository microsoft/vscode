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
			this._authoritativeModelWait.value = this._runtime.subscribeToModelChanges(() => {
				const lateSelection = resolveSelection();
				if (lateSelection.kind === 'apply') {
					this.clearAuthoritativeModelWait();
					this._provisionalModelId = undefined;
					this._model.setSelectionReason(lateSelection.reason);
					this._runtime.applyModel(lateSelection.model);
					this.ensureCurrentModelSupported();
				} else if (lateSelection.kind === 'none') {
					this.clearAuthoritativeModelWait();
				}
			});
		}
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
			this._authoritativeModelWait.value = this._runtime.subscribeToModelChanges(() => {
				if (this._runtime.getBoundConversationKey() !== conversationKey) {
					this.clearAuthoritativeModelWait();
					return;
				}
				const lateResolution = this._runtime.resolveModelIdentifier(desiredModel.identifier);
				if (lateResolution.kind === 'available') {
					this.clearAuthoritativeModelWait();
					this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
					this._runtime.restoreModelConfiguration(desiredModel.identifier, modelConfiguration);
					this._runtime.applyModel(lateResolution.model);
				} else if (lateResolution.kind === 'unavailable') {
					this.clearAuthoritativeModelWait();
					const lateMatch = findBestMatchingModel(desiredModel, this._runtime.getModels(sessionType));
					if (lateMatch) {
						this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
						this._runtime.applyModel(lateMatch);
					} else {
						this.selectDefault(sessionType);
					}
				}
			});
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
		this._historyModelWait.value = this._runtime.subscribeToModelChanges(() => {
			if (this._runtime.getVisibleConversationKey() !== conversationKey) {
				this.clearHistoryModelWait();
				return;
			}
			const lateMatch = tryMatch();
			if (lateMatch) {
				this.clearHistoryModelWait();
				this._model.setSelectionReason(ModelSelectionReason.SessionRestore);
				this._runtime.applyModel(lateMatch);
			}
		});
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
