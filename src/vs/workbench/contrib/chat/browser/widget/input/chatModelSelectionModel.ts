/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { IModelSelectionModelsContext, IModelSelectionSessionContext, IModelSelectionTransitionResult, IPendingModelSelection, ModelIdentifierResolution, ModelSelectionApplyReason, ModelSelectionReason, transitionModelSelection } from '../../../common/modelSelection.js';
import { IChatModelSelectionDiagnostics, NullChatModelSelectionDiagnostics } from './chatModelSelectionDiagnostics.js';

/** Captures coordinator state so a failed external selection effect can be rolled back. */
export interface IChatModelSelectionSnapshot {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly sessionKey: string | undefined;
	readonly lastPushedChatKey: string | undefined;
	readonly currentReason: ModelSelectionApplyReason | undefined;
	readonly pendingSelection: IPendingModelSelection | undefined;
}

export interface IChatModelCatalogSnapshot {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly desiredModelResolution: ModelIdentifierResolution;
	readonly modelTarget?: string;
}

export interface IChatModelCatalogTransitionInput<TSnapshot extends IChatModelCatalogSnapshot, TRemembered extends { readonly identifier: string; readonly source?: string }> {
	readonly session: IModelSelectionSessionContext;
	readonly trigger?: string;
	readonly location: ChatAgentLocation;
	readonly configuredModel: string | undefined;
	readonly waitForConfiguredModel: boolean;
	readonly getSnapshot: (desiredModelId: string | undefined) => TSnapshot;
	readonly getRememberedSelection: (snapshot: TSnapshot) => TRemembered | undefined;
}

export interface IChatModelCatalogTransitionResult<TSnapshot extends IChatModelCatalogSnapshot> {
	readonly previousState: IChatModelSelectionSnapshot;
	readonly snapshot: TSnapshot;
	readonly result: IModelSelectionTransitionResult;
}

/** Owns model selection state and transitions independently of picker presentation. */
export class ChatModelSelectionModel {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>(this, undefined);
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> = this._currentModel;

	private _sessionKey: string | undefined;
	private _lastPushedChatKey: string | undefined;
	private _currentReason: ModelSelectionApplyReason | undefined;
	private _pendingSelection: IPendingModelSelection | undefined;

	constructor(private readonly _diagnostics: IChatModelSelectionDiagnostics = NullChatModelSelectionDiagnostics) { }

	get userExplicitlySelectedModel(): boolean {
		return this._currentReason === ModelSelectionReason.UserSelection;
	}

	get selectionReason(): ModelSelectionApplyReason | undefined {
		return this._currentReason;
	}

	getCurrentReason(sessionKey: string | undefined): ModelSelectionApplyReason | undefined {
		return sessionKey === this._sessionKey ? this._currentReason : undefined;
	}

	resetSelectionOrigin(): void {
		this._currentReason = undefined;
	}

	setCurrentModel(model: ILanguageModelChatMetadataAndIdentifier, isUserAction: boolean): void {
		if (isUserAction) {
			this._currentReason = ModelSelectionReason.UserSelection;
		}
		this._currentModel.set(model, undefined);
	}

	setSelectionReason(reason: ModelSelectionApplyReason | undefined): void {
		this._currentReason = reason;
	}

	setTransitionMemory(sessionKey: string | undefined, chatKey: string | undefined, reason: ModelSelectionApplyReason): void {
		this._sessionKey = sessionKey;
		this._lastPushedChatKey = chatKey;
		this._currentReason = reason;
		this._pendingSelection = undefined;
	}

	applyExplicitSelection(
		model: ILanguageModelChatMetadataAndIdentifier,
		sessionKey: string | undefined,
		chatKey: string | undefined,
		apply: () => void,
		rollbackOnError: boolean = true,
	): void {
		const previousState = this.captureState();
		this.setCurrentModel(model, true);
		this.setTransitionMemory(sessionKey, chatKey, ModelSelectionReason.UserSelection);
		this._diagnostics.report('explicit-selection', { model: model.identifier }, 'info');
		try {
			apply();
			this._diagnostics.report('explicit-selection-applied', { model: model.identifier }, 'info');
		} catch (error) {
			if (rollbackOnError) {
				this.restoreState(previousState);
			}
			this._diagnostics.report('explicit-selection-failed', { model: model.identifier, error: String(error) }, 'error');
			throw error;
		}
	}

	applyTransitionEffect(previousState: IChatModelSelectionSnapshot, apply: () => void): void {
		try {
			apply();
		} catch (error) {
			this.restoreState(previousState);
			throw error;
		}
	}

	private transition(session: IModelSelectionSessionContext, models: IModelSelectionModelsContext): IModelSelectionTransitionResult {
		const currentReason = this.getCurrentReason(session.kind === 'none' ? undefined : session.key);
		const result = transitionModelSelection({
			session,
			models,
			previous: {
				sessionKey: this._sessionKey,
				lastPushedChatKey: this._lastPushedChatKey,
				currentModel: this._currentModel.get(),
				currentReason,
			},
		});
		this._sessionKey = result.sessionKey;
		this._lastPushedChatKey = result.lastPushedChatKey;
		this._currentReason = result.currentReason;
		this._pendingSelection = result.pendingSelection;
		this._currentModel.set(result.currentModel, undefined);
		return result;
	}

	transitionFromCatalog<TSnapshot extends IChatModelCatalogSnapshot, TRemembered extends { readonly identifier: string; readonly source?: string }>(
		input: IChatModelCatalogTransitionInput<TSnapshot, TRemembered>,
	): IChatModelCatalogTransitionResult<TSnapshot> {
		const previousState = this.captureState();
		const sessionKey = input.session.kind === 'none' ? undefined : input.session.key;
		const sessionModelId = input.session.kind === 'none' ? undefined : input.session.modelId;
		const currentReason = this.getCurrentReason(sessionKey);
		const initialSnapshot = input.getSnapshot(sessionModelId);
		const rememberedSelection = input.getRememberedSelection(initialSnapshot);
		const rememberedModelId = rememberedSelection?.identifier;
		const desiredModelIdentifier = input.session.kind === 'untitled'
			? (currentReason === ModelSelectionReason.FirstAvailable ? rememberedModelId : (sessionModelId ?? rememberedModelId))
			: sessionModelId;
		const snapshot = desiredModelIdentifier !== sessionModelId
			? input.getSnapshot(desiredModelIdentifier)
			: initialSnapshot;
		const fallbackModel = snapshot.models.find(model => model.metadata.isDefaultForLocation[input.location]) ?? snapshot.models[0];
		const result = this.transition(input.session, {
			available: snapshot.models,
			configuredModel: input.configuredModel,
			waitForConfiguredModel: input.waitForConfiguredModel,
			rememberedModelId,
			desiredModelResolution: snapshot.desiredModelResolution,
			fallbackModel,
		});
		this._diagnostics.report('transition', {
			trigger: input.trigger,
			sessionKind: input.session.kind,
			modelTarget: snapshot.modelTarget,
			configuredModel: input.configuredModel,
			rememberedModel: rememberedModelId,
			rememberedSource: rememberedSelection?.source,
			desiredModel: desiredModelIdentifier,
			desiredResolution: snapshot.desiredModelResolution.kind,
			fallbackModel: fallbackModel?.identifier,
			availableModels: snapshot.models.map(model => model.identifier).join(','),
			previousModel: previousState.currentModel?.identifier,
			previousReason: currentReason,
			resultModel: result.currentModel?.identifier,
			resultReason: result.currentReason,
			pendingSource: result.pendingSelection?.source,
			pendingReference: result.pendingSelection?.reference,
			effect: result.effect.kind,
			effectModel: result.effect.kind === 'apply' ? result.effect.model.identifier : undefined,
			effectReason: result.effect.kind === 'none' ? undefined : result.effect.reason,
		}, result.effect.kind === 'none' && previousState.currentModel?.identifier === result.currentModel?.identifier ? 'debug' : 'info');
		return { previousState, snapshot, result };
	}

	captureState(): IChatModelSelectionSnapshot {
		return {
			currentModel: this._currentModel.get(),
			sessionKey: this._sessionKey,
			lastPushedChatKey: this._lastPushedChatKey,
			currentReason: this._currentReason,
			pendingSelection: this._pendingSelection,
		};
	}

	restoreState(snapshot: IChatModelSelectionSnapshot): void {
		this._sessionKey = snapshot.sessionKey;
		this._lastPushedChatKey = snapshot.lastPushedChatKey;
		this._currentReason = snapshot.currentReason;
		this._pendingSelection = snapshot.pendingSelection;
		this._currentModel.set(snapshot.currentModel, undefined);
	}
}
