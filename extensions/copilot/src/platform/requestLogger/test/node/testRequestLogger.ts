/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RequestMetadata } from '@vscode/copilot-api';
import type { HTMLTracer, IChatEndpointInfo, RenderPromptResult } from '@vscode/prompt-tsx';
import type { LanguageModelToolResult2 } from 'vscode';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IModelAPIResponse } from '../../../endpoint/common/endpointProvider';
import { ThinkingData } from '../../../thinking/common/thinking';
import { CapturingToken } from '../../common/capturingToken';
import { ILoggedRequestInfo, LoggedInfo, LoggedInfoKind, LoggedRequest, LoggedRequestKind, resolveMarkdownContent } from '../../common/requestLogger';
import { AbstractRequestLogger } from '../../node/requestLogger';

/**
 * A test implementation of IRequestLogger that stores logged requests for verification in tests.
 * Unlike NullRequestLogger, this actually stores entries so they can be validated.
 */
export class TestRequestLogger extends AbstractRequestLogger {
	private readonly _entries: LoggedInfo[] = [];
	private readonly _onDidChangeRequests = new Emitter<void>();
	public readonly onDidChangeRequests: Event<void> = this._onDidChangeRequests.event;

	public override addPromptTrace(elementName: string, endpoint: IChatEndpointInfo, result: RenderPromptResult, trace: HTMLTracer): void {
		const id = generateUuid().substring(0, 8);
		this._entries.push(new TestLoggedElementInfo(id, elementName, result.tokenCount, endpoint.modelMaxPromptTokens, trace, this.currentRequest));
		this._onDidChangeRequests.fire();
	}

	public addEntry(entry: LoggedRequest): void {
		const id = generateUuid().substring(0, 8);
		this._entries.push(new TestLoggedRequestInfo(id, entry, this.currentRequest));
		this._onDidChangeRequests.fire();
	}

	public override getRequests(): LoggedInfo[] {
		return [...this._entries];
	}

	public override getRequestById(id: string): LoggedInfo | undefined {
		return this._entries.find(e => e.id === id);
	}

	public override logModelListCall(id: string, requestMetadata: RequestMetadata, models: IModelAPIResponse[]): void {
		this.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: 'modelList',
			startTimeMs: Date.now(),
			icon: undefined,
			markdownContent: `Model list call: ${models.length} models`,
			isConversationRequest: false
		});
	}

	public override logToolCall(id: string, name: string, args: unknown, response: LanguageModelToolResult2, thinking?: ThinkingData): void {
		this._entries.push(new TestLoggedToolCall(id, name, args, response, this.currentRequest, Date.now(), thinking));
		this._onDidChangeRequests.fire();
	}

	/**
	 * Clear all logged entries (useful between tests).
	 */
	public clear(): void {
		this._entries.length = 0;
		this._onDidChangeRequests.fire();
	}
}

class TestLoggedElementInfo {
	public readonly kind = LoggedInfoKind.Element;

	constructor(
		public readonly id: string,
		public readonly name: string,
		public readonly tokens: number,
		public readonly maxTokens: number,
		public readonly trace: HTMLTracer,
		public readonly token: CapturingToken | undefined
	) { }

	toJSON(): object {
		return {
			id: this.id,
			kind: 'element',
			name: this.name,
			tokens: this.tokens,
			maxTokens: this.maxTokens
		};
	}
}

class TestLoggedRequestInfo implements ILoggedRequestInfo {
	public readonly kind = LoggedInfoKind.Request;

	constructor(
		public readonly id: string,
		public readonly entry: LoggedRequest,
		public readonly token: CapturingToken | undefined
	) { }

	toJSON(): object {
		const baseInfo = {
			id: this.id,
			kind: 'request',
			type: this.entry.type,
			name: this.entry.debugName
		};

		if (this.entry.type === LoggedRequestKind.MarkdownContentRequest) {
			return {
				...baseInfo,
				startTime: new Date(this.entry.startTimeMs).toISOString(),
				content: resolveMarkdownContent(this.entry)
			};
		}

		// Handle ChatML request types (Success, Failure, Cancellation)
		// These all have startTime/endTime as Date objects
		if (this.entry.type === LoggedRequestKind.ChatMLSuccess ||
			this.entry.type === LoggedRequestKind.ChatMLFailure ||
			this.entry.type === LoggedRequestKind.ChatMLCancelation) {

			const metadata = {
				model: this.entry.chatParams?.model,
				location: this.entry.chatParams?.location,
				startTime: this.entry.startTime.toISOString(),
				endTime: this.entry.endTime.toISOString(),
				duration: this.entry.endTime.getTime() - this.entry.startTime.getTime(),
				maxResponseTokens: this.entry.chatParams?.body?.max_tokens ?? this.entry.chatParams?.body?.max_output_tokens,
			};

			// Build response data matching the real LoggedRequestInfo.toJSON() format
			let responseData;
			let errorInfo;

			if (this.entry.type === LoggedRequestKind.ChatMLSuccess) {
				responseData = {
					type: 'success',
					message: this.entry.result.value
				};
			} else if (this.entry.type === LoggedRequestKind.ChatMLFailure) {
				errorInfo = {
					type: 'failure',
					reason: this.entry.result.reason
				};
			} else if (this.entry.type === LoggedRequestKind.ChatMLCancelation) {
				errorInfo = {
					type: 'canceled'
				};
			}

			const response = responseData || errorInfo ? {
				...responseData,
				...errorInfo
			} : undefined;

			return {
				...baseInfo,
				metadata,
				response,
				isConversationRequest: this.entry.isConversationRequest
			};
		}

		// Fallback for any unknown types
		return baseInfo;
	}
}

class TestLoggedToolCall {
	public readonly kind = LoggedInfoKind.ToolCall;
	public readonly toolMetadata: unknown;

	constructor(
		public readonly id: string,
		public readonly name: string,
		public readonly args: unknown,
		public readonly response: LanguageModelToolResult2,
		public readonly token: CapturingToken | undefined,
		public readonly time: number,
		public readonly thinking?: ThinkingData,
	) {
		// Extract toolMetadata from response if it exists
		this.toolMetadata = 'toolMetadata' in response ? (response as { toolMetadata?: unknown }).toolMetadata : undefined;
	}

	async toJSON(): Promise<object> {
		return {
			id: this.id,
			kind: 'toolCall',
			tool: this.name,
			args: this.args,
			time: new Date(this.time).toISOString(),
		};
	}
}
