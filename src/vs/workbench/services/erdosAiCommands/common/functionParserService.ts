/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface ParseFunctionsResult {
	functions: string[];
	success: boolean;
	error?: string;
}

export const IFunctionParserService = createDecorator<IFunctionParserService>('functionParserService');

export interface IFunctionParserService {
	readonly _serviceBrand: undefined;

	/**
	 * Parse code to extract function calls
	 * @param code The code to parse
	 * @param language The programming language ('python' or 'r')
	 * @returns ParseFunctionsResult with extracted functions
	 */
	parseFunctions(code: string, language: string): Promise<ParseFunctionsResult>;

	/**
	 * Check if code should be auto-accepted based on function calls and settings
	 */
	checkAutoAccept(code: string, language: 'python' | 'r'): Promise<boolean>;

	/**
	 * Extract function calls for display purposes (e.g., for allow-list buttons)
	 */
	extractFunctionCallsForDisplay(code: string, language: 'python' | 'r'): Promise<string>;
}
