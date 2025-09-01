/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IOutputLimiter = createDecorator<IOutputLimiter>('outputLimiter');

export interface IOutputLimiter {
	readonly _serviceBrand: undefined;

	limitOutputText(outputText: string[] | string, maxTotalChars?: number, maxLines?: number, maxLineLength?: number): string[];
	limitFileContent(fileContent: string): string;
	limitConsoleOutput(output: string): string;
	limitSearchResults(results: string, maxMatches?: number): string;
	smartTruncate(text: string, maxLength: number, suffix?: string): string;
	getLimitsForContentType(contentType: 'file' | 'console' | 'terminal' | 'search' | 'image' | 'general'): any;
	limitByContentType(content: string, contentType: 'file' | 'console' | 'terminal' | 'search' | 'image' | 'general'): string;
}
