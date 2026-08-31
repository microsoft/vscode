/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellation, timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { InlineCompletionsProvider } from '../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { hideInlineCompletionId } from '../../../../editor/contrib/inlineCompletions/browser/controller/commandIds.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ResponseModelState } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { cleanNextUserMessageSuggestion, createNextUserMessageContext, createNextUserMessagePrompt } from '../common/nextUserMessageSuggestion.js';

const MODEL_TIMEOUT_MS = 5000;
const FOLLOWUP_SETTLE_MS = 400;
const TREATMENT_NAME = 'chat.nextUserMessageSuggestion';

export function shouldDismissNextUserMessageSuggestion(commandId: string, inputHasTextFocus: boolean): boolean {
	return commandId === hideInlineCompletionId && inputHasTextFocus;
}

export class NextUserMessageSuggestionController extends Disposable {

	private readonly _responseDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _generation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _pendingEditorPlaceholderRestore = this._register(new MutableDisposable());
	private readonly _onDidChangeInlineCompletions = this._register(new Emitter<void>());

	private _treatmentEnabled = false;
	private _treatmentGeneration = 0;
	private _suggestion: { readonly text: string; readonly model: IChatModel; readonly responseId: string } | undefined;
	private _ownedPlaceholder: {
		readonly model: NonNullable<ChatWidget['viewModel']>;
		readonly value: string;
		readonly editorValue: string | undefined;
		readonly previous: string | undefined;
	} | undefined;
	private _placeholderBaseline: {
		readonly model: NonNullable<ChatWidget['viewModel']>;
		readonly value: string | undefined;
		readonly editorValue: string | undefined;
	} | undefined;
	private _active = true;
	private _visible = true;
	private _completedResponseId: string | undefined;
	private _inlineSuggestToolbar: 'always' | 'onHover' | 'never' | undefined;

	constructor(
		private readonly _widget: ChatWidget,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ICommandService commandService: ICommandService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const inputUri = this._widget.inputPart.inputUri;
		const inputEditor = this._widget.inputPart.inputEditor;
		const provider: InlineCompletionsProvider = {
			onDidChangeInlineCompletions: this._onDidChangeInlineCompletions.event,
			provideInlineCompletions: (model, position) => {
				const suggestion = this._suggestion;
				if (!suggestion || !isEqual(model.uri, inputUri) || !this._canPresent(suggestion.model, suggestion.responseId) || !Position.equals(position, new Position(1, 1))) {
					return undefined;
				}
				return {
					items: [{ insertText: suggestion.text, range: new Range(1, 1, 1, 1), doNotLog: true }],
				};
			},
			disposeInlineCompletions: () => { },
		};
		this._register(languageFeaturesService.inlineCompletionsProvider.register({ scheme: inputUri.scheme, pattern: inputUri.path }, provider));

		this._register(this._widget.onDidChangeViewModel(() => this._bindModel()));
		this._register(this._widget.onDidChangeActiveInputEditor(() => this._clearSuggestion()));
		this._register(this._widget.onDidAcceptInput(() => this._clearSuggestion()));
		this._register(inputEditor.onDidChangeModelContent(() => this._clearSuggestion()));
		this._register(inputEditor.onDidFocusEditorText(() => this._updatePresentation()));
		this._register(inputEditor.onDidBlurEditorText(() => this._updatePresentation()));
		this._register(inputEditor.onDidChangeConfiguration(event => {
			if (event.hasChanged(EditorOption.readOnly)) {
				this._resumeEligibleSuggestion();
			}
			if (event.hasChanged(EditorOption.placeholder)
				&& this._ownedPlaceholder
				&& this._ownedPlaceholder.editorValue !== inputEditor.getOption(EditorOption.placeholder)) {
				this._clearSuggestion();
			}
		}));
		this._register(commandService.onWillExecuteCommand(event => {
			if (shouldDismissNextUserMessageSuggestion(event.commandId, inputEditor.hasTextFocus())) {
				this._clearSuggestion();
			}
		}));
		this._register(this._assignmentService.onDidRefetchAssignments(() => this._updateTreatment()));
		this._register(this._chatEntitlementService.onDidChangeSentiment(() => {
			if (!this._isChatEnabled()) {
				this._clearSuggestion();
			} else {
				this._resumeEligibleSuggestion();
			}
		}));

		this._bindModel();
		this._updateTreatment();
	}

	setViewState(active: boolean, visible: boolean): void {
		this._active = active;
		this._visible = visible;
		if (!active || !visible) {
			this._clearSuggestion();
		} else {
			this._resumeEligibleSuggestion();
		}
	}

	private _bindModel(): void {
		this._clearSuggestion();
		this._completedResponseId = undefined;
		const store = new DisposableStore();
		this._responseDisposables.value = store;
		const model = this._widget.viewModel?.model;
		if (!model) {
			return;
		}

		const watchLastResponse = (generateIfComplete: boolean) => {
			const request = model.lastRequestObs.get();
			const response = request?.response;
			store.clear();
			store.add(model.onDidChange(event => {
				if (event.kind === 'addRequest' || event.kind === 'addResponse' || event.kind === 'removeRequest' || event.kind === 'changedRequest') {
					this._clearSuggestion();
					watchLastResponse(false);
				}
			}));
			if (!request || !response) {
				return;
			}
			store.add(response.onDidChange(event => {
				if (event.reason === 'completedRequest') {
					this._completedResponseId = response.id;
					this._scheduleSuggestion(model, request, response);
				} else if (event.reason === 'undoStop' || response.state !== ResponseModelState.Complete || response.followups?.length) {
					this._clearSuggestion();
				}
			}));
			if (generateIfComplete && response.state === ResponseModelState.Complete) {
				this._scheduleSuggestion(model, request, response);
			}
		};
		watchLastResponse(false);
	}

	private _scheduleSuggestion(model: IChatModel, request: IChatRequestModel, response: IChatResponseModel): void {
		this._clearSuggestion();
		if (!this._isEligibleResponse(model, request, response)) {
			return;
		}

		const cts = new CancellationTokenSource();
		this._generation.value = cts;
		void this._generateSuggestion(model, request, response, cts);
	}

	private async _generateSuggestion(model: IChatModel, request: IChatRequestModel, response: IChatResponseModel, cts: CancellationTokenSource): Promise<void> {
		const token = cts.token;
		const timeoutHandle = setTimeout(() => {
			if (this._generation.value === cts) {
				cts.cancel();
			}
		}, MODEL_TIMEOUT_MS);
		try {
			await timeout(FOLLOWUP_SETTLE_MS, token);
			if (!this._isEligibleResponse(model, request, response)) {
				return;
			}

			const models = await raceCancellation(
				this._languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-utility' }),
				token,
			);
			if (!models?.length || token.isCancellationRequested) {
				return;
			}

			const context = createNextUserMessageContext(request.message.text, response.response.getFinalResponse());
			const modelResponse = await this._languageModelsService.sendChatRequest(
				models[0],
				undefined,
				[
					{ role: ChatMessageRole.System, content: [{ type: 'text', value: createNextUserMessagePrompt() }] },
					{ role: ChatMessageRole.User, content: [{ type: 'text', value: context.latestRequest }] },
					{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: context.finalResponse }] },
				],
				{},
				token
			);
			if (token.isCancellationRequested) {
				return;
			}
			let raw = '';
			for await (const part of modelResponse.stream) {
				if (token.isCancellationRequested) {
					return;
				}
				if (Array.isArray(part)) {
					raw += part.filter(part => part.type === 'text').map(part => part.value).join('');
				} else if (part.type === 'text') {
					raw += part.value;
				}
			}
			await modelResponse.result;
			if (token.isCancellationRequested) {
				return;
			}
			const suggestion = cleanNextUserMessageSuggestion(raw);
			if (!suggestion || !this._isEligibleResponse(model, request, response)) {
				return;
			}
			this._suggestion = { text: suggestion, model, responseId: response.id };
			const viewModel = this._widget.viewModel;
			this._placeholderBaseline = viewModel ? {
				model: viewModel,
				value: viewModel.inputPlaceholder,
				editorValue: this._widget.inputPart.inputEditor.getOption(EditorOption.placeholder),
			} : undefined;
			this._updatePresentation();
		} catch (error) {
			if (!token.isCancellationRequested) {
				this._logService.debug('[NextUserMessageSuggestion] Failed to generate suggestion', error);
			}
		} finally {
			clearTimeout(timeoutHandle);
		}
	}

	private _isEligibleResponse(model: IChatModel, request: IChatRequestModel, response: IChatResponseModel): boolean {
		return this._treatmentEnabled
			&& this._isChatEnabled()
			&& this._active
			&& this._visible
			&& this._widget.visible
			&& !this._widget.inputPart.inputEditor.getOption(EditorOption.readOnly)
			&& this._widget.viewModel?.model === model
			&& !this._widget.viewModel.editing
			&& model.lastRequestObs.get() === request
			&& request.response === response
			&& !request.isHiddenFromTranscript
			&& !request.isSystemInitiated
			&& response.state === ResponseModelState.Complete
			&& !response.isStale
			&& !response.result?.errorDetails
			&& !response.result?.nextQuestion
			&& !response.followups?.length
			&& !!response.response.getFinalResponse().trim()
			&& !this._widget.getInput();
	}

	private _canPresent(model: IChatModel, responseId: string): boolean {
		const request = model.lastRequestObs.get();
		const response = request?.response;
		return !!request
			&& !!response
			&& response.id === responseId
			&& this._isEligibleResponse(model, request, response)
			&& this._widget.inputPart.inputEditor.hasTextFocus();
	}

	private _isChatEnabled(): boolean {
		const sentiment = this._chatEntitlementService.sentiment;
		return !sentiment.hidden && !sentiment.disabled && !sentiment.disabledInWorkspace && !sentiment.untrusted;
	}

	private _updatePresentation(): void {
		const suggestion = this._suggestion;
		if (!suggestion || !this._canPresentWithoutFocus(suggestion.model, suggestion.responseId)) {
			if (!this._restorePlaceholder()) {
				this._clearSuggestion();
				return;
			}
			this._onDidChangeInlineCompletions.fire();
			return;
		}

		this._suppressInlineSuggestToolbar();
		const hasTextFocus = this._widget.inputPart.inputEditor.hasTextFocus();
		if (!this._setOwnedPlaceholder(hasTextFocus ? '' : suggestion.text)) {
			this._clearSuggestion();
			return;
		}
		if (hasTextFocus) {
			this._onDidChangeInlineCompletions.fire();
			void InlineCompletionsController.get(this._widget.inputPart.inputEditor)?.model.get()?.triggerExplicitly();
		}
	}

	private _setOwnedPlaceholder(value: string): boolean {
		const viewModel = this._widget.viewModel;
		if (!viewModel) {
			return false;
		}
		const owned = this._ownedPlaceholder;
		if (owned) {
			if (owned.model !== viewModel || owned.model.inputPlaceholder !== owned.value) {
				return false;
			}
			this._ownedPlaceholder = { ...owned, value, editorValue: value };
			viewModel.setInputPlaceholder(value);
			return true;
		}
		const baseline = this._placeholderBaseline;
		const inputEditor = this._widget.inputPart.inputEditor;
		if (!baseline
			|| baseline.model !== viewModel
			|| baseline.value !== viewModel.inputPlaceholder
			|| baseline.editorValue !== inputEditor.getOption(EditorOption.placeholder)
			|| (baseline.editorValue !== undefined && baseline.editorValue !== baseline.value)) {
			return false;
		}
		this._ownedPlaceholder = { model: viewModel, value, editorValue: value, previous: baseline.value };
		viewModel.setInputPlaceholder(value);
		return true;
	}

	private _canPresentWithoutFocus(model: IChatModel, responseId: string): boolean {
		const request = model.lastRequestObs.get();
		const response = request?.response;
		return !!request && !!response && response.id === responseId && this._isEligibleResponse(model, request, response);
	}

	private _restorePlaceholder(): boolean {
		const owned = this._ownedPlaceholder;
		this._ownedPlaceholder = undefined;
		if (!owned) {
			return true;
		}
		const inputEditor = this._widget.inputPart.inputEditor;
		if (owned.model.inputPlaceholder !== owned.value) {
			return false;
		}
		const editorPlaceholder = inputEditor.getOption(EditorOption.placeholder);
		if (owned.previous === undefined) {
			owned.model.resetInputPlaceholder();
		} else {
			owned.model.setInputPlaceholder(owned.previous);
		}
		if (editorPlaceholder === owned.editorValue) {
			inputEditor.updateOptions({ placeholder: owned.previous });
		} else {
			this._pendingEditorPlaceholderRestore.value = disposableTimeout(() => {
				if (inputEditor.getOption(EditorOption.placeholder) === owned.previous) {
					inputEditor.updateOptions({ placeholder: editorPlaceholder });
				}
			});
		}
		return true;
	}

	private _clearSuggestion(): void {
		this._generation.value?.cancel();
		this._generation.clear();
		this._suggestion = undefined;
		this._restorePlaceholder();
		this._placeholderBaseline = undefined;
		this._restoreInlineSuggestToolbar();
		this._onDidChangeInlineCompletions.fire();
	}

	private _suppressInlineSuggestToolbar(): void {
		if (this._inlineSuggestToolbar !== undefined) {
			return;
		}
		const inputEditor = this._widget.inputPart.inputEditor;
		this._inlineSuggestToolbar = inputEditor.getOption(EditorOption.inlineSuggest).showToolbar;
		inputEditor.updateOptions({ inlineSuggest: { showToolbar: 'never' } });
	}

	private _restoreInlineSuggestToolbar(): void {
		const showToolbar = this._inlineSuggestToolbar;
		this._inlineSuggestToolbar = undefined;
		if (showToolbar !== undefined && this._widget.inputPart.inputEditor.getOption(EditorOption.inlineSuggest).showToolbar === 'never') {
			this._widget.inputPart.inputEditor.updateOptions({ inlineSuggest: { showToolbar } });
		}
	}

	private _resumeEligibleSuggestion(): void {
		const model = this._widget.viewModel?.model;
		const request = model?.lastRequestObs.get();
		const response = request?.response;
		if (model && request && response && this._completedResponseId === response.id && !this._suggestion) {
			this._scheduleSuggestion(model, request, response);
		} else {
			this._updatePresentation();
		}
	}

	private async _updateTreatment(): Promise<void> {
		const generation = ++this._treatmentGeneration;
		let enabled: boolean | undefined;
		try {
			enabled = await this._assignmentService.getTreatment<boolean>(TREATMENT_NAME);
		} catch (error) {
			this._logService.debug('[NextUserMessageSuggestion] Failed to resolve treatment', error);
		}
		if (generation !== this._treatmentGeneration || this._store.isDisposed) {
			return;
		}
		this._treatmentEnabled = enabled === true;
		if (!this._treatmentEnabled) {
			this._clearSuggestion();
		} else {
			this._resumeEligibleSuggestion();
		}
	}

	override dispose(): void {
		this._clearSuggestion();
		super.dispose();
	}
}
