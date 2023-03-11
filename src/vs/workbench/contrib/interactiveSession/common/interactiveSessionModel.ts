/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IInteractiveProgress, IInteractiveResponse, IInteractiveSession } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export interface IInteractiveRequestModel {
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly message: string;
	readonly response: IInteractiveResponseModel | undefined;
}

export interface IInteractiveSessionResponseCommandFollowup {
	commandId: string;
	args: any[];
	title: string; // supports codicon strings
}

export interface IInteractiveResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
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
	readonly followups?: string[];
	readonly commandFollowups?: IInteractiveSessionResponseCommandFollowup[];
	readonly errorDetails?: IInteractiveResponseErrorDetails;
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

	constructor(public readonly message: string, public readonly username: string, public readonly avatarIconUri?: URI) {
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

	private _providerResponseId: string | undefined;
	public get providerResponseId(): string | undefined {
		return this._providerResponseId;
	}

	private _isComplete: boolean;
	public get isComplete(): boolean {
		return this._isComplete;
	}

	private _followups: string[] | undefined;
	public get followups(): string[] | undefined {
		return this._followups;
	}

	private _commandFollowups: IInteractiveSessionResponseCommandFollowup[] | undefined;
	public get commandFollowups(): IInteractiveSessionResponseCommandFollowup[] | undefined {
		return this._commandFollowups;
	}

	private _response: IMarkdownString;
	public get response(): IMarkdownString {
		return this._response;
	}

	private _errorDetails: IInteractiveResponseErrorDetails | undefined;
	public get errorDetails(): IInteractiveResponseErrorDetails | undefined {
		return this._errorDetails;
	}

	constructor(response: IMarkdownString, public readonly username: string, public readonly providerId: string, public readonly avatarIconUri?: URI, isComplete: boolean = false, providerResponseId?: string, errorDetails?: IInteractiveResponseErrorDetails, followups?: string[]) {
		super();
		this._response = response;
		this._isComplete = isComplete;
		this._followups = followups;
		this._providerResponseId = providerResponseId;
		this._errorDetails = errorDetails;
		this._id = 'response_' + InteractiveResponseModel.nextId++;
	}

	updateContent(responsePart: string) {
		this._response = new MarkdownString(this.response.value + responsePart);
		this._onDidChange.fire();
	}

	setProviderResponseId(providerResponseId: string) {
		this._providerResponseId = providerResponseId;
	}

	complete(followups: string[] | undefined, commandFollowups: IInteractiveSessionResponseCommandFollowup[] | undefined, errorDetails?: IInteractiveResponseErrorDetails): void {
		this._isComplete = true;
		this._followups = followups;
		this._commandFollowups = commandFollowups;
		this._errorDetails = errorDetails;
		this._onDidChange.fire();
	}
}

export interface IInteractiveSessionModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IInteractiveSessionChangeEvent>;
	readonly sessionId: number;
	readonly providerId: string;
	getRequests(): IInteractiveRequestModel[];
}

export interface ISerializableInteractiveSessionsData {
	[providerId: string]: ISerializableInteractiveSessionData[];
}

export interface ISerializableInteractiveSessionRequestData {
	providerResponseId: string | undefined;
	message: string;
	response: string | undefined;
	responseErrorDetails: IInteractiveResponseErrorDetails | undefined;
}

export interface ISerializableInteractiveSessionData {
	requests: ISerializableInteractiveSessionRequestData[];
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
	private _providerState: any;

	get sessionId(): number {
		return this.session.id;
	}

	constructor(
		public readonly session: IInteractiveSession,
		public readonly providerId: string,
		initialData: ISerializableInteractiveSessionData | undefined,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._requests = initialData ? this._deserialize(initialData) : [];
		this._providerState = initialData ? initialData.providerState : undefined;
	}

	private _deserialize(obj: ISerializableInteractiveSessionData): InteractiveRequestModel[] {
		const requests = obj.requests;
		if (!Array.isArray(requests)) {
			this.logService.error(`Ignoring malformed session data: ${obj}`);
			return [];
		}

		return requests.map((raw: ISerializableInteractiveSessionRequestData) => {
			const request = new InteractiveRequestModel(raw.message, this.session.requesterUsername, this.session.requesterAvatarIconUri);
			if (raw.response || raw.responseErrorDetails) {
				request.response = new InteractiveResponseModel(new MarkdownString(raw.response), this.session.responderUsername, this.providerId, this.session.responderAvatarIconUri, true, raw.providerResponseId, raw.responseErrorDetails);
			}
			return request;
		});
	}

	acceptNewProviderState(providerState: any): void {
		this._providerState = providerState;
	}

	clear(): void {
		this._requests.forEach(r => r.response?.dispose());
		this._requests = [];
		this._onDidChange.fire({ kind: 'clear' });
	}

	getRequests(): InteractiveRequestModel[] {
		return this._requests;
	}

	addRequest(message: string): InteractiveRequestModel {
		const request = new InteractiveRequestModel(message, this.session.requesterUsername, this.session.requesterAvatarIconUri);

		// TODO this is suspicious, maybe the request should know that it is "in progress" instead of having a fake response model.
		// But the response already knows that it is "in progress" and so does a map in the session service.
		request.response = new InteractiveResponseModel(new MarkdownString(''), this.session.responderUsername, this.providerId, this.session.responderAvatarIconUri);

		this._requests.push(request);
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	acceptResponseProgress(request: InteractiveRequestModel, progress: IInteractiveProgress): void {
		if (!request.response) {
			request.response = new InteractiveResponseModel(new MarkdownString(''), this.session.responderUsername, this.providerId, this.session.responderAvatarIconUri);
		}

		if ('content' in progress) {
			request.response.updateContent(progress.content);
		} else {
			request.response.setProviderResponseId(progress.responseId);
		}
	}

	completeResponse(request: InteractiveRequestModel, response: IInteractiveResponse): void {
		request.response!.complete(response.followups, response.commandFollowups, response.errorDetails);
	}

	setResponse(request: InteractiveRequestModel, response: InteractiveResponseModel): void {
		request.response = response;
		this._onDidChange.fire({ kind: 'addResponse', response });
	}

	toJSON(): ISerializableInteractiveSessionData {
		return {
			requests: this._requests.map(r => {
				return {
					providerResponseId: r.response?.providerResponseId,
					message: r.message,
					response: r.response ? r.response.response.value : undefined,
					responseErrorDetails: r.response?.errorDetails
				};
			}),
			providerId: this.providerId,
			providerState: this._providerState
		};
	}

	override dispose() {
		this._requests.forEach(r => r.response?.dispose());
		this._onDidDispose.fire();
		super.dispose();
	}
}
