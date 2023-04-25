/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ILogService } from 'vs/platform/log/common/log';
import { IInteractiveProgress, IInteractiveResponse, IInteractiveResponseErrorDetails, IInteractiveSession, IInteractiveSessionFollowup, IInteractiveSessionReplyFollowup, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export interface IInteractiveRequestModel {
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly message: string | IInteractiveSessionReplyFollowup;
	readonly response: IInteractiveResponseModel | undefined;
}

export interface IInteractiveResponseModel {
	readonly onDidChange: Event<void>;
	readonly id: string;
	readonly providerId: string;
	readonly providerResponseId: string | undefined;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly response: IMarkdownString;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly vote: InteractiveSessionVoteDirection | undefined;
	readonly followups?: IInteractiveSessionFollowup[] | undefined;
	readonly errorDetails?: IInteractiveResponseErrorDetails;
	setVote(vote: InteractiveSessionVoteDirection): void;
}

export function isRequest(item: unknown): item is IInteractiveRequestModel {
	return !!item && typeof (item as IInteractiveRequestModel).message !== 'undefined';
}

export function isResponse(item: unknown): item is IInteractiveResponseModel {
	return !isRequest(item);
}

export class InteractiveRequestModel implements IInteractiveRequestModel {
	private static nextId = 0;

	public response: InteractiveResponseModel | undefined;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	constructor(
		public readonly message: string | IInteractiveSessionReplyFollowup,
		public readonly username: string,
		public readonly avatarIconUri?: URI) {
		this._id = 'request_' + InteractiveRequestModel.nextId++;
	}
}

export class InteractiveResponseModel extends Disposable implements IInteractiveResponseModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private static nextId = 0;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	public get providerResponseId(): string | undefined {
		return this._providerResponseId;
	}

	public get isComplete(): boolean {
		return this._isComplete;
	}

	public get isCanceled(): boolean {
		return this._isCanceled;
	}

	public get vote(): InteractiveSessionVoteDirection | undefined {
		return this._vote;
	}

	public get followups(): IInteractiveSessionFollowup[] | undefined {
		return this._followups;
	}

	public get response(): IMarkdownString {
		return this._response;
	}

	public get errorDetails(): IInteractiveResponseErrorDetails | undefined {
		return this._errorDetails;
	}

	public get providerId(): string {
		return this._session.providerId;
	}

	constructor(
		private _response: IMarkdownString,
		private readonly _session: InteractiveSessionModel,
		public readonly username: string,
		public readonly avatarIconUri?: URI,
		private _isComplete: boolean = false,
		private _isCanceled = false,
		private _vote?: InteractiveSessionVoteDirection,
		private _providerResponseId?: string,
		private _errorDetails?: IInteractiveResponseErrorDetails,
		private _followups?: IInteractiveSessionFollowup[]
	) {
		super();
		this._id = 'response_' + InteractiveResponseModel.nextId++;
	}

	updateContent(responsePart: string) {
		this._response = new MarkdownString(this.response.value + responsePart);
		this._onDidChange.fire();
	}

	setProviderResponseId(providerResponseId: string) {
		this._providerResponseId = providerResponseId;
	}

	complete(errorDetails?: IInteractiveResponseErrorDetails): void {
		this._isComplete = true;
		this._errorDetails = errorDetails;
		this._onDidChange.fire();
	}

	cancel(): void {
		this._isComplete = true;
		this._isCanceled = true;
		this._onDidChange.fire();
	}

	setFollowups(followups: IInteractiveSessionFollowup[] | undefined): void {
		this._followups = followups;
		this._onDidChange.fire(); // Fire so that command followups get rendered on the row
	}

	setVote(vote: InteractiveSessionVoteDirection): void {
		this._vote = vote;
		this._onDidChange.fire();
	}
}

export interface IInteractiveSessionModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IInteractiveSessionChangeEvent>;
	readonly sessionId: string;
	readonly providerId: string;
	// readonly title: string;
	readonly welcomeMessage: IInteractiveSessionWelcomeMessageModel | undefined;
	readonly requestInProgress: boolean;
	readonly inputPlaceholder?: string;
	getRequests(): IInteractiveRequestModel[];
	waitForInitialization(): Promise<void>;
}

export interface ISerializableInteractiveSessionsData {
	[sessionId: string]: ISerializableInteractiveSessionData;
}

export interface ISerializableInteractiveSessionRequestData {
	providerResponseId: string | undefined;
	message: string;
	response: string | undefined;
	responseErrorDetails: IInteractiveResponseErrorDetails | undefined;
	followups: IInteractiveSessionFollowup[] | undefined;
	isCanceled: boolean | undefined;
	vote: InteractiveSessionVoteDirection | undefined;
}

export interface ISerializableInteractiveSessionData {
	sessionId: string;
	creationDate: number;
	welcomeMessage: (string | IInteractiveSessionReplyFollowup[])[] | undefined;
	requests: ISerializableInteractiveSessionRequestData[];
	requesterUsername: string;
	responderUsername: string;
	requesterAvatarIconUri: UriComponents | undefined;
	responderAvatarIconUri: UriComponents | undefined;
	providerId: string;
	providerState: any;
}

export type IInteractiveSessionChangeEvent = IInteractiveSessionAddRequestEvent | IInteractiveSessionAddResponseEvent | IInteractiveSessionClearEvent;

export interface IInteractiveSessionAddRequestEvent {
	kind: 'addRequest';
	request: IInteractiveRequestModel;
}

export interface IInteractiveSessionAddResponseEvent {
	kind: 'addResponse';
	response: IInteractiveResponseModel;
}

export interface IInteractiveSessionClearEvent {
	kind: 'clear';
}

export class InteractiveSessionModel extends Disposable implements IInteractiveSessionModel {
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<IInteractiveSessionChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private _requests: InteractiveRequestModel[];
	private _isInitializedDeferred = new DeferredPromise<void>();

	private _session: IInteractiveSession | undefined;
	get session(): IInteractiveSession | undefined {
		return this._session;
	}

	private _welcomeMessage: InteractiveSessionWelcomeMessageModel | undefined;
	get welcomeMessage(): InteractiveSessionWelcomeMessageModel | undefined {
		return this._welcomeMessage;
	}

	private _providerState: any;
	get providerState(): any {
		return this._providerState;
	}

	// TODO to be clear, this is not the same as the id from the session object, which belongs to the provider.
	// It's easier to be able to identify this model before its async initialization is complete
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get inputPlaceholder(): string | undefined {
		return this._session?.inputPlaceholder;
	}

	get requestInProgress(): boolean {
		const lastRequest = this._requests[this._requests.length - 1];
		return !!lastRequest && !!lastRequest.response && !lastRequest.response.isComplete;
	}

	private _creationDate: number;

	constructor(
		public readonly providerId: string,
		initialData: ISerializableInteractiveSessionData | undefined,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._sessionId = initialData ? initialData.sessionId : generateUuid();
		this._requests = initialData ? this._deserialize(initialData) : [];
		this._providerState = initialData ? initialData.providerState : undefined;
		this._creationDate = initialData?.creationDate ?? Date.now();
	}

	private _deserialize(obj: ISerializableInteractiveSessionData): InteractiveRequestModel[] {
		const requests = obj.requests;
		if (!Array.isArray(requests)) {
			this.logService.error(`Ignoring malformed session data: ${obj}`);
			return [];
		}

		if (obj.welcomeMessage) {
			const content = obj.welcomeMessage.map(item => typeof item === 'string' ? new MarkdownString(item) : item);
			this._welcomeMessage = new InteractiveSessionWelcomeMessageModel(content, obj.responderUsername, obj.responderAvatarIconUri && URI.revive(obj.responderAvatarIconUri));
		}

		return requests.map((raw: ISerializableInteractiveSessionRequestData) => {
			const request = new InteractiveRequestModel(raw.message, obj.requesterUsername, obj.requesterAvatarIconUri && URI.revive(obj.requesterAvatarIconUri));
			if (raw.response || raw.responseErrorDetails) {
				request.response = new InteractiveResponseModel(new MarkdownString(raw.response), this, obj.responderUsername, obj.responderAvatarIconUri && URI.revive(obj.responderAvatarIconUri), true, raw.isCanceled, raw.vote, raw.providerResponseId, raw.responseErrorDetails, raw.followups);
			}
			return request;
		});
	}

	initialize(session: IInteractiveSession, welcomeMessage: InteractiveSessionWelcomeMessageModel | undefined): void {
		if (this._session) {
			throw new Error('InteractiveSessionModel is already initialized');
		}

		this._session = session;
		if (!this._welcomeMessage) {
			// Could also have loaded the welcome message from persisted data
			this._welcomeMessage = welcomeMessage;
		}

		this._isInitializedDeferred.complete();

		if (session.onDidChangeState) {
			this._register(session.onDidChangeState(state => {
				this._providerState = state;
				this.logService.trace('InteractiveSessionModel#acceptNewSessionState');
			}));
		}
	}

	waitForInitialization(): Promise<void> {
		return this._isInitializedDeferred.p;
	}

	clear(): void {
		this._requests.forEach(r => r.response?.dispose());
		this._requests = [];
		this._onDidChange.fire({ kind: 'clear' });
	}

	getRequests(): InteractiveRequestModel[] {
		return this._requests;
	}

	addRequest(message: string | IInteractiveSessionReplyFollowup): InteractiveRequestModel {
		if (!this._session) {
			throw new Error('addRequest: No session');
		}

		const request = new InteractiveRequestModel(message, this._session.requesterUsername, this._session.requesterAvatarIconUri);
		request.response = new InteractiveResponseModel(new MarkdownString(''), this, this._session.responderUsername, this._session.responderAvatarIconUri);

		this._requests.push(request);
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	acceptResponseProgress(request: InteractiveRequestModel, progress: IInteractiveProgress): void {
		if (!this._session) {
			throw new Error('acceptResponseProgress: No session');
		}

		if (!request.response) {
			request.response = new InteractiveResponseModel(new MarkdownString(''), this, this._session.responderUsername, this._session.responderAvatarIconUri);
		}

		if (request.response.isComplete) {
			throw new Error('acceptResponseProgress: Adding progress to a completed response');
		}

		if ('content' in progress) {
			request.response.updateContent(progress.content);
		} else {
			request.response.setProviderResponseId(progress.responseId);
		}
	}

	cancelRequest(request: InteractiveRequestModel): void {
		if (request.response) {
			request.response.cancel();
		}
	}

	completeResponse(request: InteractiveRequestModel, rawResponse: IInteractiveResponse): void {
		if (!this._session) {
			throw new Error('completeResponse: No session');
		}

		if (!request.response) {
			request.response = new InteractiveResponseModel(new MarkdownString(''), this, this._session.responderUsername, this._session.responderAvatarIconUri);
		}

		request.response.complete(rawResponse.errorDetails);
	}

	setFollowups(request: InteractiveRequestModel, followups: IInteractiveSessionFollowup[] | undefined): void {
		if (!request.response) {
			// Maybe something went wrong?
			return;
		}

		request.response.setFollowups(followups);
	}

	setResponse(request: InteractiveRequestModel, response: InteractiveResponseModel): void {
		request.response = response;
		this._onDidChange.fire({ kind: 'addResponse', response });
	}

	toJSON(): ISerializableInteractiveSessionData {
		return {
			sessionId: this.sessionId,
			creationDate: this._creationDate,
			requesterUsername: this._session!.requesterUsername,
			requesterAvatarIconUri: this._session!.requesterAvatarIconUri,
			responderUsername: this._session!.responderUsername,
			responderAvatarIconUri: this._session!.responderAvatarIconUri,
			welcomeMessage: this._welcomeMessage?.content.map(c => {
				if (Array.isArray(c)) {
					return c;
				} else {
					return c.value;
				}
			}),
			requests: this._requests.map((r): ISerializableInteractiveSessionRequestData => {
				return {
					providerResponseId: r.response?.providerResponseId,
					message: typeof r.message === 'string' ? r.message : r.message.message,
					response: r.response ? r.response.response.value : undefined,
					responseErrorDetails: r.response?.errorDetails,
					followups: r.response?.followups,
					isCanceled: r.response?.isCanceled,
					vote: r.response?.vote
				};
			}),
			providerId: this.providerId,
			providerState: this._providerState
		};
	}

	override dispose() {
		this._session?.dispose?.();
		this._requests.forEach(r => r.response?.dispose());
		this._onDidDispose.fire();
		if (!this._isInitializedDeferred.isSettled) {
			this._isInitializedDeferred.error(new Error('model disposed before initialization'));
		}

		super.dispose();
	}
}

export type IInteractiveWelcomeMessageContent = IMarkdownString | IInteractiveSessionReplyFollowup[];

export interface IInteractiveSessionWelcomeMessageModel {
	readonly id: string;
	readonly content: IInteractiveWelcomeMessageContent[];
	readonly username: string;
	readonly avatarIconUri?: URI;

}

export class InteractiveSessionWelcomeMessageModel implements IInteractiveSessionWelcomeMessageModel {
	private static nextId = 0;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	constructor(public readonly content: IInteractiveWelcomeMessageContent[], public readonly username: string, public readonly avatarIconUri?: URI) {
		this._id = 'welcome_' + InteractiveSessionWelcomeMessageModel.nextId++;
	}
}
