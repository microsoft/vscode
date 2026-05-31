/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RequestMetadata } from '@vscode/copilot-api';
import { HTMLTracer, IChatEndpointInfo, Raw, RenderPromptResult } from '@vscode/prompt-tsx';
import type { Event } from 'vscode';
import { ChatFetchError, ChatFetchResponseType, ChatLocation, ChatResponses, FetchSuccess } from '../../../platform/chat/common/commonTypes';
import { IResponseDelta, OptionalChatRequestParams } from '../../../platform/networking/common/fetch';
import { IChatEndpoint, IEndpointBody } from '../../../platform/networking/common/networking';
import { createServiceIdentifier } from '../../../util/common/services';
import { ThemeIcon } from '../../../util/vs/base/common/themables';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import type { LanguageModelToolResult2 } from '../../../vscodeTypes';
import type { IModelAPIResponse } from '../../endpoint/common/endpointProvider';
import { APIUsage } from '../../networking/common/openai';
import { ThinkingData } from '../../thinking/common/thinking';
import { CapturingToken } from '../common/capturingToken';

export type UriData = { kind: 'request'; id: string } | { kind: 'latest' };

export class ChatRequestScheme {
	public static readonly chatRequestScheme = 'ccreq';

	public static buildUri(data: UriData, format: 'markdown' | 'json' | 'rawrequest' = 'markdown'): string {
		let extension: string;
		if (format === 'markdown') {
			extension = 'copilotmd';
		} else if (format === 'json') {
			extension = 'json';
		} else { // rawrequest
			extension = 'request.json';
		}
		if (data.kind === 'latest') {
			return `${ChatRequestScheme.chatRequestScheme}:latest.${extension}`;
		} else {
			return `${ChatRequestScheme.chatRequestScheme}:${data.id}.${extension}`;
		}
	}

	public static parseUri(uri: string): { data: UriData; format: 'markdown' | 'json' | 'rawrequest' } | undefined {
		// Check for latest markdown
		if (uri === this.buildUri({ kind: 'latest' }, 'markdown')) {
			return { data: { kind: 'latest' }, format: 'markdown' };
		}
		// Check for latest JSON
		if (uri === this.buildUri({ kind: 'latest' }, 'json')) {
			return { data: { kind: 'latest' }, format: 'json' };
		}
		// Check for latest rawrequest
		if (uri === this.buildUri({ kind: 'latest' }, 'rawrequest')) {
			return { data: { kind: 'latest' }, format: 'rawrequest' };
		}

		// Check for specific request markdown
		const mdMatch = uri.match(/ccreq:([^\s]+)\.copilotmd/);
		if (mdMatch) {
			return { data: { kind: 'request', id: mdMatch[1] }, format: 'markdown' };
		}

		// specific raw body json
		const bodyJsonMatch = uri.match(/ccreq:([^\s]+)\.request\.json/);
		if (bodyJsonMatch) {
			return { data: { kind: 'request', id: bodyJsonMatch[1] }, format: 'rawrequest' };
		}

		// Check for specific request JSON
		const jsonMatch = uri.match(/ccreq:([^\s]+)\.json/);
		if (jsonMatch) {
			return { data: { kind: 'request', id: jsonMatch[1] }, format: 'json' };
		}

		return undefined;
	}

	public static findAllUris(text: string): { uri: string; range: OffsetRange }[] {
		const linkRE = /(ccreq:[^\s]+\.(copilotmd|json|request\.json))/g;
		return [...text.matchAll(linkRE)].map(
			(m) => {
				const identifier = m[1];
				return {
					uri: identifier,
					range: new OffsetRange(m.index!, m.index! + identifier.length)
				};
			}
		);
	}
}

export const enum LoggedInfoKind {
	Element,
	Request,
	ToolCall,
}

export interface ILoggedElementInfo {
	kind: LoggedInfoKind.Element;
	id: string;
	name: string;
	tokens: number;
	maxTokens: number;
	trace: HTMLTracer;
	token: CapturingToken | undefined;
	toJSON(): object;
}

export interface ILoggedRequestInfo {
	kind: LoggedInfoKind.Request;
	id: string;
	entry: LoggedRequest;
	token: CapturingToken | undefined;
	toJSON(): object;
}

export interface ILoggedToolCall {
	kind: LoggedInfoKind.ToolCall;
	id: string;
	name: string;
	args: unknown;
	response: LanguageModelToolResult2;
	token: CapturingToken | undefined;
	time: number;
	thinking?: ThinkingData;
	toolMetadata?: unknown;
	toJSON(): Promise<object>;
}

export interface ILoggedPendingRequest {
	messages: Raw.ChatMessage[];
	ourRequestId: string;
	model: string;
	location: ChatLocation;
	intent?: string;
	postOptions?: OptionalChatRequestParams;
	body?: IEndpointBody;
	ignoreStatefulMarker?: boolean;
	isConversationRequest?: boolean;
	/** Custom metadata to be displayed in the log document */
	customMetadata?: Record<string, string | number | boolean | undefined>;
}

export type LoggedInfo = ILoggedElementInfo | ILoggedRequestInfo | ILoggedToolCall;

export const IRequestLogger = createServiceIdentifier<IRequestLogger>('IRequestLogger');
export interface IRequestLogger {

	readonly _serviceBrand: undefined;

	promptRendererTracing: boolean;

	captureInvocation<T>(request: CapturingToken, fn: () => Promise<T>): Promise<T>;

	logToolCall(id: string, name: string, args: unknown, response: LanguageModelToolResult2, thinking?: ThinkingData): void;

	logModelListCall(requestId: string, requestMetadata: RequestMetadata, models: IModelAPIResponse[]): void;

	logContentExclusionRules(repos: string[], rules: { patterns: string[]; ifAnyMatch: string[]; ifNoneMatch: string[] }[], durationMs: number): void;

	logChatRequest(debugName: string, chatEndpoint: IChatEndpointLogInfo, chatParams: ILoggedPendingRequest): PendingLoggedChatRequest;

	addPromptTrace(elementName: string, endpoint: IChatEndpointInfo, result: RenderPromptResult, trace: HTMLTracer): void;
	addEntry(entry: LoggedRequest): void;

	onDidChangeRequests: Event<void>;
	getRequests(): LoggedInfo[];
	getRequestById(id: string): LoggedInfo | undefined;

	enableWorkspaceEditTracing(): void;
	disableWorkspaceEditTracing(): void;
}

export const enum LoggedRequestKind {
	ChatMLSuccess = 'ChatMLSuccess',
	ChatMLFailure = 'ChatMLFailure',
	ChatMLCancelation = 'ChatMLCancelation',
	MarkdownContentRequest = 'MarkdownContentRequest',
}

export type IChatEndpointLogInfo = Partial<Pick<IChatEndpoint, 'model' | 'modelMaxPromptTokens' | 'urlOrRequestMetadata'>>;

export interface ILoggedChatMLRequest {
	debugName: string;
	chatEndpoint: IChatEndpointLogInfo;
	chatParams: ILoggedPendingRequest;
	startTime: Date;
	endTime: Date;
	isConversationRequest?: boolean;
	/** Custom metadata to be displayed in the log document */
	customMetadata?: Record<string, string | number | boolean | undefined>;
}

export interface ILoggedChatMLSuccessRequest extends ILoggedChatMLRequest {
	type: LoggedRequestKind.ChatMLSuccess;
	timeToFirstToken: number | undefined;
	usage: APIUsage | undefined;
	result: FetchSuccess<string[]>;
	deltas?: IResponseDelta[];
}

export interface ILoggedChatMLFailureRequest extends ILoggedChatMLRequest {
	type: LoggedRequestKind.ChatMLFailure;
	timeToFirstToken: number | undefined;
	result: ChatFetchError;
}

export interface ILoggedChatMLCancelationRequest extends ILoggedChatMLRequest {
	type: LoggedRequestKind.ChatMLCancelation;
}

export interface IMarkdownContentRequest {
	type: LoggedRequestKind.MarkdownContentRequest;
	startTimeMs: number;
	icon: ThemeIcon | undefined | (() => ThemeIcon | undefined);
	debugName: string;
	markdownContent: string | (() => string);
	isConversationRequest?: boolean;
	/**
	 * When set, the log tree and virtual document will refresh when this event fires.
	 * Used for "live" entries that update over time (e.g. in-progress NES requests).
	 */
	onDidChange?: Event<void>;
	/**
	 * When set, determines whether this entry should be visible in the log tree.
	 * Used for live entries that may become hidden (e.g. skipped/cancelled NES requests).
	 */
	isVisible?: () => boolean;
}

export function resolveMarkdownContent(entry: IMarkdownContentRequest): string {
	return typeof entry.markdownContent === 'function' ? entry.markdownContent() : entry.markdownContent;
}

export function resolveMarkdownIcon(entry: IMarkdownContentRequest): ThemeIcon | undefined {
	return typeof entry.icon === 'function' ? entry.icon() : entry.icon;
}

export type LoggedRequest = (
	ILoggedChatMLSuccessRequest
	| ILoggedChatMLFailureRequest
	| ILoggedChatMLCancelationRequest
	| IMarkdownContentRequest
);

class AbstractPendingLoggedRequest {
	protected _time: Date;
	protected _timeToFirstToken: number | undefined = undefined;

	constructor(
		protected _logbook: IRequestLogger,
		protected _debugName: string,
		protected _chatEndpoint: IChatEndpointLogInfo,
		protected _chatParams: ILoggedPendingRequest
	) {
		this._time = new Date();
	}

	markTimeToFirstToken(timeToFirstToken: number): void {
		this._timeToFirstToken = timeToFirstToken;
	}

	resolveWithCancelation() {
		this._logbook.addEntry({
			type: LoggedRequestKind.ChatMLCancelation,
			debugName: this._debugName,
			chatEndpoint: this._chatEndpoint,
			chatParams: this._chatParams,
			startTime: this._time,
			endTime: new Date(),
			isConversationRequest: this._chatParams.isConversationRequest,
			customMetadata: this._chatParams.customMetadata
		});
	}
}

export class PendingLoggedChatRequest extends AbstractPendingLoggedRequest {
	constructor(
		logbook: IRequestLogger,
		debugName: string,
		chatEndpoint: IChatEndpoint,
		chatParams: ILoggedPendingRequest
	) {
		super(logbook, debugName, chatEndpoint, chatParams);
	}

	resolve(result: ChatResponses, deltas?: IResponseDelta[]): void {
		if (result.type === ChatFetchResponseType.Success) {
			this._logbook.addEntry({
				type: LoggedRequestKind.ChatMLSuccess,
				debugName: this._debugName,
				usage: result.usage,
				chatEndpoint: this._chatEndpoint,
				chatParams: this._chatParams,
				startTime: this._time,
				endTime: new Date(),
				timeToFirstToken: this._timeToFirstToken,
				isConversationRequest: this._chatParams.isConversationRequest,
				customMetadata: this._chatParams.customMetadata,
				result,
				deltas
			});
		} else {
			this._logbook.addEntry({
				type: result.type === ChatFetchResponseType.Canceled ? LoggedRequestKind.ChatMLCancelation : LoggedRequestKind.ChatMLFailure,
				debugName: this._debugName,
				chatEndpoint: this._chatEndpoint,
				chatParams: this._chatParams,
				startTime: this._time,
				endTime: new Date(),
				timeToFirstToken: this._timeToFirstToken,
				isConversationRequest: this._chatParams.isConversationRequest,
				customMetadata: this._chatParams.customMetadata,
				result,
			});
		}
	}
}
