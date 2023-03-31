/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ProviderResult } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';

export interface IInteractiveSession {
	id: number;
	requesterUsername: string;
	requesterAvatarIconUri?: URI;
	responderUsername: string;
	responderAvatarIconUri?: URI;
	inputPlaceholder?: string;
	dispose?(): void;
}

export interface IInteractiveRequest {
	session: IInteractiveSession;
	message: string | IInteractiveSessionReplyFollowup;
}

export interface IInteractiveResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
	responseIsFiltered?: boolean;
}

export interface IInteractiveResponse {
	session: IInteractiveSession;
	errorDetails?: IInteractiveResponseErrorDetails;
	timings?: {
		firstProgress: number;
		totalElapsed: number;
	};
}

export type IInteractiveProgress =
	{ content: string } | { responseId: string };

export interface IPersistedInteractiveState { }
export interface IInteractiveProvider {
	readonly id: string;
	readonly progressiveRenderingEnabled?: boolean;
	readonly iconUrl?: string;
	prepareSession(initialState: IPersistedInteractiveState | undefined, token: CancellationToken): ProviderResult<IInteractiveSession | undefined>;
	resolveRequest?(session: IInteractiveSession, context: any, token: CancellationToken): ProviderResult<IInteractiveRequest>;
	provideWelcomeMessage?(token: CancellationToken): ProviderResult<(string | IInteractiveSessionReplyFollowup[])[] | undefined>;
	provideSuggestions?(token: CancellationToken): ProviderResult<string[] | undefined>;
	provideFollowups?(session: IInteractiveSession, token: CancellationToken): ProviderResult<IInteractiveSessionFollowup[] | undefined>;
	provideReply(request: IInteractiveRequest, progress: (progress: IInteractiveProgress) => void, token: CancellationToken): ProviderResult<IInteractiveResponse>;
	provideSlashCommands?(session: IInteractiveSession, token: CancellationToken): ProviderResult<IInteractiveSlashCommand[]>;
}

export interface IInteractiveSlashCommand {
	command: string;
	sortText?: string;
	detail?: string;
}

export interface IInteractiveSessionReplyFollowup {
	kind: 'reply';
	message: string;
	title?: string;
	tooltip?: string;
	metadata?: any;
}

export interface IInteractiveSessionResponseCommandFollowup {
	kind: 'command';
	commandId: string;
	args?: any[];
	title: string; // supports codicon strings
}

export type IInteractiveSessionFollowup = IInteractiveSessionReplyFollowup | IInteractiveSessionResponseCommandFollowup;

export enum InteractiveSessionVoteDirection {
	Up = 1,
	Down = 2
}

export interface IInteractiveSessionVoteAction {
	kind: 'vote';
	responseId: string;
	direction: InteractiveSessionVoteDirection;
}

export enum InteractiveSessionCopyKind {
	// Keyboard shortcut or context menu
	Action = 1,
	Toolbar = 2
}

export interface IInteractiveSessionCopyAction {
	kind: 'copy';
	responseId: string;
	codeBlockIndex: number;
	copyType: InteractiveSessionCopyKind;
	copiedCharacters: number;
	totalCharacters: number;
	copiedText: string;
}

export interface IInteractiveSessionInsertAction {
	kind: 'insert';
	responseId: string;
	codeBlockIndex: number;
}

export interface IInteractiveSessionCommandAction {
	kind: 'command';
	command: IInteractiveSessionResponseCommandFollowup;
}

export type InteractiveSessionUserAction = IInteractiveSessionVoteAction | IInteractiveSessionCopyAction | IInteractiveSessionInsertAction | IInteractiveSessionCommandAction;

export interface IInteractiveSessionUserActionEvent {
	action: InteractiveSessionUserAction;
	providerId: string;
}

export interface IInteractiveSessionDynamicRequest {
	/**
	 * The message that will be displayed in the UI
	 */
	message: string;

	/**
	 * Any extra metadata/context that will go to the provider.
	 */
	metadata?: any;
}

export interface IInteractiveSessionCompleteResponse {
	message: string;
	errorDetails?: IInteractiveResponseErrorDetails;
}

export const IInteractiveSessionService = createDecorator<IInteractiveSessionService>('IInteractiveSessionService');

export interface IInteractiveSessionService {
	_serviceBrand: undefined;
	registerProvider(provider: IInteractiveProvider): IDisposable;
	progressiveRenderingEnabled(providerId: string): boolean;
	startSession(providerId: string, allowRestoringSession: boolean, token: CancellationToken): Promise<InteractiveSessionModel | undefined>;

	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: number, message: string | IInteractiveSessionReplyFollowup): { completePromise: Promise<void> } | undefined;
	cancelCurrentRequestForSession(sessionId: number): void;
	getSlashCommands(sessionId: number, token: CancellationToken): Promise<IInteractiveSlashCommand[] | undefined>;
	clearSession(sessionId: number): void;
	acceptNewSessionState(sessionId: number, state: any): void;
	addInteractiveRequest(context: any): void;
	addCompleteRequest(message: string, response: IInteractiveSessionCompleteResponse): void;
	sendInteractiveRequestToProvider(providerId: string, message: IInteractiveSessionDynamicRequest): void;
	provideSuggestions(providerId: string, token: CancellationToken): Promise<string[] | undefined>;
	releaseSession(sessionId: number): void;

	onDidPerformUserAction: Event<IInteractiveSessionUserActionEvent>;
	notifyUserAction(event: IInteractiveSessionUserActionEvent): void;
}
