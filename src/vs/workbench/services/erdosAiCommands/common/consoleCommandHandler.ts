/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IConsoleCommandHandler = createDecorator<IConsoleCommandHandler>('consoleCommandHandler');

export interface IConsoleCommandHandler {
	readonly _serviceBrand: undefined;

	acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	extractAndProcessCommandContent(accumulatedContent: string, isConsole?: boolean): { content: string; isComplete: boolean };
	executeConsoleCommandWithOutputCapture(command: string, executionId: string, language?: string): Promise<string>;
	focusConsoleForLanguage(language: string): Promise<void>;
}
