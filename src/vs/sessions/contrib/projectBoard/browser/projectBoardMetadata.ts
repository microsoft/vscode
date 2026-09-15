/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { equals } from '../../../../base/common/objects.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel, IChatModelInputState, IChatRequestModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChat } from '../../../services/sessions/common/session.js';

export const projectBoardMetadataLimits = Object.freeze({
	activeHelpers: 16,
	requestTail: 64,
	promptLength: 8192,
	contextEntries: 16,
	contextTail: 64,
	labelLength: 256,
});

export interface IProjectBoardContext {
	readonly label: string;
	readonly uri: URI;
}

export type IProjectBoardInputConfiguration = Pick<IChatModelInputState, 'selectedModel' | 'modelConfiguration' | 'mode' | 'permissionLevel'>;

/** Preserves unknown usage instead of treating an unsupported provider as zero cost. */
function getProjectBoardCredits(model: IChatModel, reader?: IReader): number | undefined {
	let reported = false;
	for (const request of model.getRequests()) {
		const usage = request.response?.usageObs.read(reader);
		for (const value of [usage?.copilotCredits, usage?.sessionCopilotCredits]) {
			if (value !== undefined) {
				if (!Number.isFinite(value) || value < 0) {
					throw new Error('Invalid reported AI credit usage');
				}
				reported = true;
			}
		}
	}
	if (!reported) {
		return undefined;
	}
	const credits = model.sessionCost;
	if (!Number.isFinite(credits) || credits < 0) {
		throw new Error('Invalid session AI credit total');
	}
	return credits;
}

export type IProjectBoardMetadata =
	| { readonly kind: 'loading' }
	| { readonly kind: 'unavailable'; readonly message: string }
	| { readonly kind: 'error'; readonly message: string; readonly error: string }
	| {
		readonly kind: 'ready';
		readonly prompt?: string;
		/** Only a known submitted-request timestamp; never a synthesized model/session time. */
		readonly submittedAt?: number;
		readonly message?: string;
		readonly context: readonly IProjectBoardContext[];
	};

/**
 * Reads only submitted time from an already loaded model, without retaining/loading it
 * or copying prompt text. Callers observe chatModels, lastRequestObs and onDidChange.
 */
export function getProjectBoardSubmittedAt(model: IChatModel): number | undefined {
	return getSubmittedAt(getLatestSubmittedRequest(model, model.lastRequest));
}

function getSubmittedAt(request: IChatRequestModel | undefined): number | undefined {
	const timestamp = request?.requestTimestamp;
	return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

function getLatestSubmittedRequest(model: IChatModel, lastRequest: IChatRequestModel | undefined): IChatRequestModel | undefined {
	if (!lastRequest || isUserRequest(lastRequest)) {
		return lastRequest;
	}
	// Most cards use lastRequest alone. Internal hidden turns only justify a bounded tail.
	const requests = model.getRequests();
	const first = Math.max(0, requests.length - projectBoardMetadataLimits.requestTail);
	for (let index = requests.length - 1; index >= first; index--) {
		if (isUserRequest(requests[index])) {
			return requests[index];
		}
	}
	return undefined;
}

function isUserRequest(request: IChatRequestModel): boolean {
	return !request.isHiddenFromTranscript && !request.isRequestHiddenFromTranscript && !request.isSystemInitiated;
}

/**
 * Read-only prompt snapshot. The board owns/disposes helpers for visible cards only,
 * with at most `activeHelpers` retained or loading models across the board.
 * The owner surfaces error notifications once; this helper logs and exposes them.
 */
export class ProjectBoardMetadata extends Disposable {
	private readonly _metadata = observableValue<IProjectBoardMetadata>(this, Object.freeze({ kind: 'loading' }));
	readonly metadata: IObservable<IProjectBoardMetadata> = this._metadata;
	private readonly _modelStore = this._register(new DisposableStore());
	private readonly includeCredits = observableValue(this, false);
	private readonly _credits = observableValue<number | undefined>(this, undefined);
	readonly credits: IObservable<number | undefined> = this._credits;
	private readonly _creditsError = observableValue<string | undefined>(this, undefined);
	readonly creditsError: IObservable<string | undefined> = this._creditsError;
	private readonly includeConfiguration = observableValue(this, false);
	private readonly _configuration = observableValue<IProjectBoardInputConfiguration | undefined>(this, undefined);
	readonly configuration: IObservable<IProjectBoardInputConfiguration | undefined> = this._configuration;

	setIncludeConfiguration(enabled: boolean): void {
		this.includeConfiguration.set(enabled, undefined);
	}

	setIncludeCredits(enabled: boolean): void {
		this.includeCredits.set(enabled, undefined);
	}

	constructor(
		chat: Pick<IChat, 'resource'>,
		@IChatService private readonly _chatService: IChatService,
		@ILogService private readonly _logService: ILogService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
	) {
		super();
		const cancellation = new CancellationTokenSource();
		this._modelStore.add(toDisposable(() => cancellation.dispose(true)));
		void this._load(chat.resource, cancellation);
	}

	private async _load(resource: URI, cancellation: CancellationTokenSource): Promise<void> {
		try {
			const materialized = this._chatSessionsService.getMaterializedSessionResource(resource) ?? resource;
			const reference = this._chatService.acquireExistingSession(materialized, 'ProjectBoardMetadata')
				?? await this._chatService.acquireOrLoadSession(materialized, ChatAgentLocation.Chat, cancellation.token, 'ProjectBoardMetadata');
			if (this._modelStore.isDisposed) {
				reference?.dispose();
				return;
			}
			if (!reference) {
				this._unavailable(localize('projectBoard.metadata.modelUnavailable', "Last submitted prompt unavailable from this provider."));
				return;
			}
			this._modelStore.add(reference);
			this._observe(reference.object);
		} catch (error) {
			if (!this._modelStore.isDisposed) {
				this._fail(error);
			}
		}
	}

	private _observe(model: IChatModel): void {
		const changed = observableSignalFromEvent(this, model.onDidChange);
		this._modelStore.add(model.onDidDispose(() => {
			this._configuration.set(undefined, undefined);
			this._credits.set(undefined, undefined);
			this._unavailable(localize('projectBoard.metadata.modelDisposed', "Last submitted prompt unavailable because the conversation was closed."));
			this._modelStore.dispose();
		}));
		this._modelStore.add(autorun(reader => {
			try {
				changed.read(reader);
				const lastRequest = model.lastRequestObs.read(reader);
				// Pending/queued input lives outside getRequests(), so it must not be projected.
				const request = getLatestSubmittedRequest(model, lastRequest);
				if (request?.response) {
					observableSignalFromEvent(this, request.response.onDidChange).read(reader);
				}
				this._publish(request);
			} catch (error) {
				this._fail(error);
			}
		}));
		this._modelStore.add(autorun(reader => {
			try {
				if (this.includeCredits.read(reader)) {
					changed.read(reader);
					model.lastRequestObs.read(reader);
					this._credits.set(getProjectBoardCredits(model, reader), undefined);
				} else {
					this._credits.set(undefined, undefined);
				}
				this._creditsError.set(undefined, undefined);
			} catch (error) {
				this._credits.set(undefined, undefined);
				const message = toErrorMessage(error);
				if (this._creditsError.read(undefined) !== message) {
					this._logService.error('[ProjectBoardMetadata] Could not read AI credits', error);
					this._creditsError.set(message, undefined);
				}
			}
		}));
		this._modelStore.add(autorun(reader => {
			const input = this.includeConfiguration.read(reader) ? model.inputModel.state.read(reader) : undefined;
			const configuration = input ? {
				selectedModel: input.selectedModel, modelConfiguration: input.modelConfiguration,
				mode: input.mode, permissionLevel: input.permissionLevel,
			} : undefined;
			if (!equals(this._configuration.read(undefined), configuration)) {
				this._configuration.set(configuration, undefined);
			}
		}));
	}

	private _publish(request: IChatRequestModel | undefined): void {
		if (!request) {
			this._unavailable(localize('projectBoard.metadata.noPrompt', "No submitted user prompt available."));
			return;
		}
		const prompt = request.message.text.trim().slice(0, projectBoardMetadataLimits.promptLength) || undefined;
		const submittedAt = getSubmittedAt(request);
		const context = this._context(request);
		const message = !prompt
			? context.length
				? localize('projectBoard.metadata.contextOnly', "The latest request has attached context but no stored prompt text.")
				: localize('projectBoard.metadata.emptyPrompt', "The latest request has no stored prompt text.")
			: submittedAt === undefined
				? localize('projectBoard.metadata.unknownTime', "Last submitted prompt time unavailable.")
				: undefined;
		const previous = this._metadata.get();
		if (previous.kind === 'ready' && previous.prompt === prompt && previous.submittedAt === submittedAt && previous.message === message
			&& previous.context.length === context.length && previous.context.every((item, index) => item.label === context[index].label && item.uri.toString() === context[index].uri.toString())) {
			return;
		}
		this._metadata.set(Object.freeze({ kind: 'ready', prompt, submittedAt, message, context }), undefined);
	}

	private _context(request: IChatRequestModel): readonly IProjectBoardContext[] {
		const context: IProjectBoardContext[] = [];
		const seen = new Set<string>();
		const variables = request.variableData.variables;
		for (const entry of variables.slice(-projectBoardMetadataLimits.contextTail)) {
			const value = entry.value;
			const uri = URI.isUri(value) ? value : isLocation(value) ? value.uri : undefined;
			// Only supported resource/link shapes; never infer paths or open command/data URIs.
			if (!uri || !['file', 'vscode-remote', 'http', 'https'].includes(uri.scheme) || seen.has(uri.toString())) {
				continue;
			}
			seen.add(uri.toString());
			context.push(Object.freeze({ label: (entry.fullName || entry.name || uri.toString()).slice(0, projectBoardMetadataLimits.labelLength), uri }));
			if (context.length === projectBoardMetadataLimits.contextEntries) {
				break;
			}
		}
		return Object.freeze(context);
	}

	private _unavailable(message: string): void {
		const previous = this._metadata.get();
		if (previous.kind !== 'unavailable' || previous.message !== message) {
			this._metadata.set(Object.freeze({ kind: 'unavailable', message }), undefined);
		}
	}

	private _fail(error: unknown): void {
		const detail = toErrorMessage(error);
		const previous = this._metadata.get();
		if (previous.kind === 'error' && previous.error === detail) {
			return;
		}
		this._logService.error('[ProjectBoard] Failed to load submitted prompt metadata', error);
		this._metadata.set(Object.freeze({
			kind: 'error',
			message: localize('projectBoard.metadata.error', "Could not load the last submitted prompt: {0}", detail),
			error: detail,
		}), undefined);
	}
}
