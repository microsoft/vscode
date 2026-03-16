/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IToolResult } from '../../../chat/common/tools/languageModelToolsService.js';

// eslint-disable-next-line local/code-import-patterns
import type { Page } from 'playwright-core';

/**
 * Shared helper for running a Playwright function against a page and returning its result.
 */
export async function playwrightInvokeRaw<TArgs extends unknown[], TReturn>(
	playwrightService: IPlaywrightService,
	pageId: string,
	fn: (page: Page, ...args: TArgs) => Promise<TReturn>,
	...args: TArgs
): Promise<TReturn> {
	return playwrightService.invokeFunctionRaw(pageId, fn.toString(), ...args);
}

/**
 * Shared helper for running a Playwright function against a page and returning
 * a tool result. Handles success/error formatting.
 */
export async function playwrightInvoke<TArgs extends unknown[], TReturn>(
	playwrightService: IPlaywrightService,
	pageId: string,
	fn: (page: Page, ...args: TArgs) => Promise<TReturn>,
	...args: TArgs
): Promise<IToolResult> {
	try {
		const result = await playwrightService.invokeFunction(pageId, fn.toString(), ...args);
		return {
			content: [
				{ kind: 'text', value: result.result ? JSON.stringify(result.result) : 'Script executed successfully' },
				{ kind: 'text', value: result.summary }
			]
		};
	} catch (e) {
		return errorResult(e instanceof Error ? e.message : String(e));
	}
}

export function errorResult(message: string): IToolResult {
	return {
		content: [{ kind: 'text', value: message }],
		toolResultError: message,
	};
}
