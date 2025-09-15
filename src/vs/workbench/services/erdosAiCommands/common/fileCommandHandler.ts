/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IFileCommandHandler = createDecorator<IFileCommandHandler>('fileCommandHandler');

export interface IFileCommandHandler {
	readonly _serviceBrand: undefined;

	acceptFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	cancelFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	processFileForExecution(functionCall: any, callId: string): Promise<string>;
	extractFileContentForWidgetExecution(filename: string, startLine?: number, endLine?: number): Promise<string>;
}