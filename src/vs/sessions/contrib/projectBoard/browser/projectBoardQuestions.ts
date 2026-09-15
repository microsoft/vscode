/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableFromPromise, observableSignal, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getDisplayedQuestionText, getOptionsWithDefaultsFirst, submitChatQuestionCarousel } from '../../../../workbench/contrib/chat/common/chatService/chatQuestionCarouselHelpers.js';
import { ElicitationState, IChatQuestionAnswerValue, IChatQuestionCarousel, IChatService, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChat, SessionStatus } from '../../../services/sessions/common/session.js';

export const projectBoardQuestionPreviewLimits = Object.freeze({
	responseParts: 256,
	questions: 8,
	permissions: 8,
	options: 16,
	textLength: 2048,
});

export interface IProjectBoardQuestion {
	readonly id: string;
	readonly type: 'text' | 'singleSelect' | 'multiSelect';
	readonly title: string;
	readonly text: string;
	readonly description: string | undefined;
	readonly detailedMessage?: string;
	readonly carouselMessage?: string;
	readonly required?: boolean;
	readonly options: readonly { readonly id: string; readonly label: string }[];
	readonly allowFreeformInput: boolean;
	readonly allowSkip: boolean;
}

export interface IProjectBoardPermission {
	readonly kind: 'tool' | 'confirmation' | 'elicitation';
	readonly title: string | undefined;
	readonly text: string | undefined;
	/** Undefined means the model does not expose the chat UI's options. */
	readonly options: readonly string[] | undefined;
}

export interface IProjectBoardUnsupportedInput {
	readonly kind: 'planReview' | 'toolPostApproval' | 'toolAuthentication' | 'questionType';
	readonly message: string;
}

export type ProjectBoardQuestionPreviewState =
	| { readonly kind: 'inactive' | 'loading' }
	| { readonly kind: 'unavailable'; readonly reason: 'modelUnavailable' | 'noPendingInput' | 'modelDisposed' | 'previewLimit'; readonly message: string }
	| { readonly kind: 'error'; readonly message: string; readonly error: string }
	| { readonly kind: 'ready'; readonly questions: readonly IProjectBoardQuestion[]; readonly permissions: readonly IProjectBoardPermission[]; readonly unsupported: readonly IProjectBoardUnsupportedInput[]; readonly truncated: boolean };

export interface IProjectBoardPendingQuestion {
	readonly carousel: IChatQuestionCarousel;
	readonly requestId: string;
}

/** Bounded pending input with a submission boundary tied to the currently retained request. */
export class ProjectBoardQuestionPreview extends Disposable {
	private readonly _preview = observableValue<ProjectBoardQuestionPreviewState>(this, Object.freeze({ kind: 'inactive' }));
	readonly preview: IObservable<ProjectBoardQuestionPreviewState> = this._preview;
	private readonly _questionCarousels = observableValue<readonly IProjectBoardPendingQuestion[]>(this, []);
	readonly questionCarousels: IObservable<readonly IProjectBoardPendingQuestion[]> = this._questionCarousels;
	private _activeModel: IChatModel | undefined;
	private readonly _modelStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _completions = new WeakMap<ChatQuestionCarouselData, IObservable<{ value?: true | Error }>>();
	private readonly _answered = new WeakSet<IChatQuestionCarousel>();
	private _loading = false;
	private _isDisposed = false;

	constructor(
		private readonly _chat: Pick<IChat, 'resource' | 'status'>,
		@IChatService private readonly _chatService: IChatService,
		@ILogService private readonly _logService: ILogService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
	) {
		super();
		this._register(autorun(reader => {
			if (this._chat.status.read(reader) !== SessionStatus.NeedsInput) {
				this._modelStore.clear();
				this._questionCarousels.set([], undefined);
				this._preview.set(Object.freeze({ kind: 'inactive' }), undefined);
			} else {
				this._ensureModel();
			}
		}));
	}

	submit(question: IProjectBoardPendingQuestion, answers: Map<string, IChatQuestionAnswerValue> | undefined): boolean {
		const request = this._activeModel?.lastRequest;
		const response = request?.response;
		if (this._isDisposed || this._chat.status.get() !== SessionStatus.NeedsInput || !request || request.isHiddenFromTranscript
			|| request.id !== question.requestId || !response || response.isComplete || response.isCanceled
			|| !response.response.value.includes(question.carousel)
			|| !this._questionCarousels.get().some(pending => pending.carousel === question.carousel && pending.requestId === question.requestId)) {
			this._logService.warn('ProjectBoardQuestionPreview: ignored an answer to an unavailable question');
			return false;
		}
		try {
			return submitChatQuestionCarousel(question.carousel, question.requestId, answers, this._chatService);
		} catch (error) {
			this._fail(error, localize('projectBoard.answerError', "Could not submit the answer. Open the chat to continue."));
			return false;
		}
	}

	private _ensureModel(): void {
		if (this._isDisposed || this._chat.status.get() !== SessionStatus.NeedsInput || this._modelStore.value) {
			return;
		}
		this._preview.set(Object.freeze({ kind: 'loading' }), undefined);
		// Do not overlap loads, even if a provider ignores cancellation during a status change.
		if (this._loading) {
			return;
		}
		const store = this._modelStore.value = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		this._loading = true;
		void this._loadModel(store, cancellation);
	}

	private async _loadModel(store: DisposableStore, cancellation: CancellationTokenSource): Promise<void> {
		try {
			const resource = this._chatSessionsService.getMaterializedSessionResource(this._chat.resource) ?? this._chat.resource;
			const reference = this._chatService.acquireExistingSession(resource, 'ProjectBoardQuestionPreview')
				?? await this._chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, cancellation.token, 'ProjectBoardQuestionPreview');
			if (store.isDisposed) {
				reference?.dispose();
				return;
			}
			if (reference) {
				store.add(reference);
				this._observeModel(reference.object, store);
			} else {
				this._unavailable('modelUnavailable');
			}
		} catch (error) {
			if (!store.isDisposed) {
				this._fail(error);
			}
		} finally {
			this._loading = false;
			if (!this._modelStore.value) {
				this._ensureModel();
			}
		}
	}

	private _observeModel(model: IChatModel, store: DisposableStore): void {
		this._activeModel = model;
		store.add(toDisposable(() => {
			if (this._activeModel === model) {
				this._activeModel = undefined;
				this._questionCarousels.set([], undefined);
			}
		}));
		const changed = observableSignalFromEvent(this, model.onDidChange);
		const answersChanged = observableSignal(this);
		store.add(this._chatService.onDidReceiveQuestionCarouselAnswer(event => {
			try {
				const request = model.lastRequest;
				if (request?.id !== event.requestId) {
					return;
				}
				for (const part of request.response?.response.value.slice(-projectBoardQuestionPreviewLimits.responseParts) ?? []) {
					if (part.kind === 'questionCarousel' && part.resolveId === event.resolveId) {
						this._answered.add(part);
					}
				}
				answersChanged.trigger(undefined);
			} catch (error) {
				this._fail(error);
			}
		}));
		store.add(model.onDidDispose(() => {
			this._unavailable('modelDisposed');
			store.dispose();
		}));
		store.add(autorun(reader => {
			try {
				changed.read(reader);
				answersChanged.read(reader);
				const request = model.lastRequestObs.read(reader);
				const response = request?.isHiddenFromTranscript ? undefined : request?.response;
				if (response) {
					observableSignalFromEvent(this, response.onDidChange).read(reader);
				}
				const questions: IProjectBoardPendingQuestion[] = [];
				const preview = this._project(response, reader, questions);
				transaction(tx => {
					this._questionCarousels.set(questions, tx);
					this._preview.set(preview, tx);
				});
			} catch (error) {
				this._fail(error);
			}
		}));
	}

	private _project(response: IChatResponseModel | undefined, reader: IReader, pending: IProjectBoardPendingQuestion[]): ProjectBoardQuestionPreviewState {
		const questions: IProjectBoardQuestion[] = [];
		const permissions: IProjectBoardPermission[] = [];
		const unsupported: IProjectBoardUnsupportedInput[] = [];
		const limits = projectBoardQuestionPreviewLimits;
		const parts = response && !response.isComplete && !response.isCanceled ? response.response.value : [];
		let truncated = parts.length > limits.responseParts;
		const text = (value: string | IMarkdownString): string => {
			const source = typeof value === 'string' ? value : value.value;
			truncated ||= source.length > limits.textLength;
			return source.slice(0, limits.textLength);
		};
		const optionalText = (value: string | IMarkdownString | undefined): string | undefined => {
			return value === undefined ? undefined : text(value);
		};
		const take = <T>(values: readonly T[], limit: number): T[] => {
			truncated ||= values.length > limit;
			return values.slice(0, limit);
		};
		const addPermission = (kind: IProjectBoardPermission['kind'], title: string | IMarkdownString | undefined, message: string | IMarkdownString | undefined, options: readonly string[] | undefined): void => {
			if (permissions.length === limits.permissions) {
				truncated = true;
				return;
			}
			permissions.push(Object.freeze({
				kind, title: optionalText(title), text: optionalText(message),
				options: options?.length ? Object.freeze(take(options, limits.options).map(text)) : undefined,
			}));
		};
		const addUnsupported = (kind: IProjectBoardUnsupportedInput['kind']): void => {
			if (!unsupported.some(input => input.kind === kind)) {
				unsupported.push(Object.freeze({ kind, message: localize('projectBoard.unsupportedInput', "This input type cannot be previewed. Open the chat to continue.") }));
			}
		};
		for (const part of parts.slice(-limits.responseParts)) {
			if (part.kind === 'toolInvocation') {
				const state = part.state.read(reader);
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
					const messages = IChatToolInvocation.getConfirmationMessages(part, reader);
					addPermission('tool', messages?.title, messages?.message, messages?.customOptions ? take(messages.customOptions, limits.options).map(option => option.label) : undefined);
				} else if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					addUnsupported('toolPostApproval');
				} else if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
					addUnsupported('toolAuthentication');
				}
			} else if (part.kind === 'confirmation' && !part.isUsed) {
				addPermission('confirmation', part.title, part.message, part.buttons);
			} else if (part.kind === 'elicitation2' && part.state.read(reader) === ElicitationState.Pending && !part.isHidden?.read(reader)) {
				addPermission('elicitation', part.title, part.message, [
					part.acceptButtonLabel,
					...(part.rejectButtonLabel ? [part.rejectButtonLabel] : []),
					...take(part.moreActions ?? [], limits.options).map(action => action.label),
				]);
			} else if (part.kind === 'planReview' && !part.isUsed) {
				addUnsupported('planReview');
			}
			if (part.kind !== 'questionCarousel') {
				continue;
			}
			if (part.isUsed || part.answeredExternally || this._answered.has(part)) {
				continue;
			}
			if (part instanceof ChatQuestionCarouselData) {
				let completion = this._completions.get(part);
				if (!completion) {
					completion = observableFromPromise(part.completion.p.then(() => true as const, error => new Error(toErrorMessage(error))));
					this._completions.set(part, completion);
				}
				const result = completion.read(reader).value;
				if (result instanceof Error) {
					throw result;
				}
				if (part.completion.isSettled) {
					continue;
				}
			}
			const fits = (value: string | IMarkdownString | undefined) => value === undefined || (typeof value === 'string' ? value : value.value).length <= limits.textLength;
			if (response && (part instanceof ChatQuestionCarouselData || part.resolveId) && pending.length < limits.questions
				&& part.questions.length > 0 && part.questions.length <= limits.questions - pending.reduce((count, question) => count + question.carousel.questions.length, 0) && fits(part.message)
				&& part.questions.every(question => (question.type === 'text' || question.type === 'singleSelect' || question.type === 'multiSelect')
					&& fits(question.title) && fits(question.message) && fits(question.description) && fits(question.detailedMessage)
					&& (question.options?.length ?? 0) <= limits.options && (question.options ?? []).every(option => fits(option.label)))) {
				pending.push({ carousel: part, requestId: response.requestId });
			}
			for (const [index, question] of take(part.questions, limits.questions - questions.length).entries()) {
				if (question.type !== 'text' && question.type !== 'singleSelect' && question.type !== 'multiSelect') {
					addUnsupported('questionType');
					continue;
				}
				const options = getOptionsWithDefaultsFirst({
					...question,
					options: take(question.options ?? [], limits.options),
					defaultValue: Array.isArray(question.defaultValue) ? take(question.defaultValue, limits.options) : question.defaultValue,
				});
				questions.push(Object.freeze({
					id: text(question.id),
					type: question.type,
					title: text(question.title),
					text: text(getDisplayedQuestionText(question)),
					description: optionalText(question.description),
					...(question.detailedMessage !== undefined ? { detailedMessage: text(question.detailedMessage) } : {}),
					...(index === 0 && part.message !== undefined ? { carouselMessage: text(part.message) } : {}),
					...(question.required ? { required: true } : {}),
					options: Object.freeze(options.map(({ option }) => Object.freeze({ id: text(option.id), label: text(option.label) }))),
					allowFreeformInput: question.type === 'text' || question.allowFreeformInput !== false,
					allowSkip: part.allowSkip,
				}));
			}
		}
		return questions.length || permissions.length || unsupported.length
			? Object.freeze({ kind: 'ready', questions: Object.freeze(questions), permissions: Object.freeze(permissions), unsupported: Object.freeze(unsupported), truncated })
			: Object.freeze({
				kind: 'unavailable', reason: truncated ? 'previewLimit' : 'noPendingInput',
				message: truncated
					? localize('projectBoard.questionPreviewLimit', "Question preview limit reached. Open the chat to continue.")
					: localize('projectBoard.noPendingInput', "No pending question metadata is available. Open the chat to continue."),
			});
	}

	private _unavailable(reason: 'modelUnavailable' | 'modelDisposed'): void {
		this._questionCarousels.set([], undefined);
		this._preview.set(Object.freeze({ kind: 'unavailable', reason, message: localize('projectBoard.questionUnavailable', "Question preview is unavailable. Open the chat to continue.") }), undefined);
	}

	private _fail(error: unknown, message = localize('projectBoard.questionError', "Could not load the question preview. Open the chat to continue.")): void {
		this._logService.error('ProjectBoardQuestionPreview: pending input failed', error);
		this._preview.set(Object.freeze({ kind: 'error', message, error: toErrorMessage(error) }), undefined);
		this._questionCarousels.set([], undefined);
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
		this._questionCarousels.set([], undefined);
		this._preview.set(Object.freeze({ kind: 'inactive' }), undefined);
	}
}
