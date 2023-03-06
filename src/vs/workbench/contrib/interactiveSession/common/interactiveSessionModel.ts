/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IInteractiveSession } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export interface IInteractiveRequestModel {
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly message: string;
	readonly response: IInteractiveResponseModel | undefined;
}

export interface IInteractiveResponseModel {
	readonly onDidChange: Event<void>;
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly response: IMarkdownString;
	readonly isComplete: boolean;
	readonly followups?: string[];
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

	private _isComplete: boolean;
	public get isComplete(): boolean {
		return this._isComplete;
	}

	private _followups: string[] | undefined;
	public get followups(): string[] | undefined {
		return this._followups;
	}

	private _response: IMarkdownString;
	public get response(): IMarkdownString {
		return this._response;
	}

	constructor(response: IMarkdownString, public readonly username: string, public readonly avatarIconUri?: URI, isComplete: boolean = false, followups?: string[]) {
		super();
		this._response = response;
		this._isComplete = isComplete;
		this._followups = followups;
		this._id = 'response_' + InteractiveResponseModel.nextId++;
	}

	updateContent(responsePart: string) {
		this._response = new MarkdownString(this.response.value + responsePart);
		this._onDidChange.fire();
	}

	complete(followups: string[] | undefined): void {
		this._isComplete = true;
		this._followups = followups;
		this._onDidChange.fire();
	}
}

export interface IInteractiveSessionModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IInteractiveSessionChangeEvent>;
	readonly sessionId: number;
	getRequests(): IInteractiveRequestModel[];
}

export interface ISerializableInteractiveSessionsData {
	[providerId: string]: ISerializableInteractiveSessionData[];
}

export interface ISerializableInteractiveSessionRequestData {
	message: string;
	response: string | undefined;
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

		return requests.map((r: ISerializableInteractiveSessionRequestData) => {
			const request = new InteractiveRequestModel(r.message, this.session.requesterUsername, this.session.requesterAvatarIconUri);
			if (r.response) {
				request.response = new InteractiveResponseModel(new MarkdownString(r.response), this.session.responderUsername, this.session.responderAvatarIconUri, true);
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
		request.response = new InteractiveResponseModel(new MarkdownString(''), this.session.responderUsername, this.session.responderAvatarIconUri);

		this._requests.push(request);
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	mergeResponseContent(request: InteractiveRequestModel, part: string): void {
		if (request.response) {
			request.response.updateContent(part);
		} else {
			request.response = new InteractiveResponseModel(new MarkdownString(part), this.session.responderUsername, this.session.responderAvatarIconUri);
		}
	}

	completeResponse(request: InteractiveRequestModel, followups?: string[]): void {
		request.response!.complete(followups);
	}

	setResponse(request: InteractiveRequestModel, response: InteractiveResponseModel): void {
		request.response = response;
		this._onDidChange.fire({ kind: 'addResponse', response });
	}

	toJSON(): ISerializableInteractiveSessionData {
		return {
			requests: this._requests.map(r => {
				return {
					message: r.message,
					response: r.response ? r.response.response.value : undefined,
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
