/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISearchReplaceCommandHandler = createDecorator<ISearchReplaceCommandHandler>('searchReplaceCommandHandler');

export interface ISearchReplaceCommandHandler {
	readonly _serviceBrand: undefined;

	acceptSearchReplaceCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}>;
	cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	extractAndProcessSearchReplaceContent(accumulatedContent: string, callId: string): { content: string; isComplete: boolean };
	validateAndProcessSearchReplace(functionCall: any, messageId: number, relatedToId: number, requestId: string): Promise<{success: boolean, errorMessage?: string}>;
	executeSearchReplace(args: any, context: any): Promise<any>;
	openDocumentInEditor(filePath: string): Promise<void>;
}
