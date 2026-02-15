/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../tsServer/protocol/protocol';
import { Disposable } from '../utils/dispose';
import { Logger } from './logger';

interface RequestExecutionMetadata {
	readonly queuingStartTime: number;
}

export default class Tracer extends Disposable {

	constructor(
		private readonly logger: Logger
	) {
		super();
	}

	public traceRequest(serverId: string, request: Proto.Request, responseExpected: boolean, queueLength: number): void {
		if (this.logger.logLevel === vscode.LogLevel.Trace) {
			this.trace(serverId, `Sending request: ${request.command} (${request.seq}). Response expected: ${responseExpected ? 'yes' : 'no'}. Current queue length: ${queueLength}`, request.arguments);
		}
	}

	public traceResponse(serverId: string, response: Proto.Response, meta: RequestExecutionMetadata): void {
		if (this.logger.logLevel === vscode.LogLevel.Trace) {
			this.trace(serverId, `Response received: ${response.command} (${response.request_seq}). Request took ${Date.now() - meta.queuingStartTime} ms. Success: ${response.success} ${!response.success ? '. Message: ' + response.message : ''}`, response.body);
		}
	}

	public traceRequestCompleted(serverId: string, command: string, request_seq: number, meta: RequestExecutionMetadata): void {
		if (this.logger.logLevel === vscode.LogLevel.Trace) {
			this.trace(serverId, `Async response received: ${command} (${request_seq}). Request took ${Date.now() - meta.queuingStartTime} ms.`);
		}
	}

	public traceEvent(serverId: string, event: Proto.Event): void {
		if (this.logger.logLevel === vscode.LogLevel.Trace) {
			this.trace(serverId, `Event received: ${event.event} (${event.seq}).`, event.body);
		}
	}

	public trace(serverId: string, message: string, data?: unknown): void {
		this.logger.trace(`<${serverId}> ${message}`, ...(data ? [JSON.stringify(data, null, 4)] : []));
	}
}
