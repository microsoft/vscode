/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IConsoleCommandHandler = createDecorator<IConsoleCommandHandler>('consoleCommandHandler');

export interface IConsoleCommandHandler {
	readonly _serviceBrand: undefined;

	acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	extractAndProcessCommandContent(accumulatedContent: string, isConsole?: boolean): { content: string; isComplete: boolean };
	executeConsoleCommandWithOutputCapture(command: string, executionId: string, language?: string): Promise<string>;
}
