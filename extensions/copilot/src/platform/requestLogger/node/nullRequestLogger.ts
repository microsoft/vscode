/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RequestMetadata } from '@vscode/copilot-api';
import type { LanguageModelToolResult, LanguageModelToolResult2 } from 'vscode';
import { AbstractRequestLogger, ILoggedRequestInfo, LoggedRequest } from '../../../platform/requestLogger/node/requestLogger';
import { Event } from '../../../util/vs/base/common/event';
import { IModelAPIResponse } from '../../endpoint/common/endpointProvider';

export class NullRequestLogger extends AbstractRequestLogger {
	public override addPromptTrace(): void {
	}
	public addEntry(entry: LoggedRequest): void {
	}
	public override getRequests(): ILoggedRequestInfo[] {
		return [];
	}
	public override getRequestById(_id: string): undefined {
		return undefined;
	}
	public override logModelListCall(id: string, requestMetadata: RequestMetadata, models: IModelAPIResponse[]): void {

	}
	public override logToolCall(name: string | undefined, args: unknown, response: LanguageModelToolResult): void {
	}
	public override logServerToolCall(id: string, name: string, args: unknown, result: LanguageModelToolResult2): void {
	}
	override onDidChangeRequests: Event<void> = Event.None;
}
