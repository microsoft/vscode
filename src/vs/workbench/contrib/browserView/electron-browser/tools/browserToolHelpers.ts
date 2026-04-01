/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IToolResult } from '../../../chat/common/tools/languageModelToolsService.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';

// eslint-disable-next-line local/code-import-patterns
import type { Page } from 'playwright-core';

export const DEFAULT_ELEMENT_LABEL = localize('browser.element', 'element');

/**
 * Creates a markdown link to a browser page.
 */
export function createBrowserPageLink(pageId: string | URI): string {
	if (typeof pageId === 'string') {
		pageId = BrowserViewUri.forId(pageId);
	}
	return `[${BrowserEditorInput.DEFAULT_LABEL}](${pageId.toString()}?vscodeLinkType=browser)`;
}

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

/**
 * Checks whether a browser editor with the same host (hostname + port) already
 * exists. When {@link playwrightService} is provided, only pages tracked by Playwright
 * (i.e. shared with the agent) are considered.
 *
 * @returns The first matching {@link BrowserEditorInput}, or `undefined` if none was found.
 */
export async function findExistingPageByHost(
	editorService: IEditorService,
	playwrightService: IPlaywrightService | undefined,
	url: string,
): Promise<BrowserEditorInput | undefined> {
	const parsed = URL.parse(url);
	if (!parsed?.host) {
		return undefined;
	}

	const trackedIds = playwrightService
		? new Set(await playwrightService.getTrackedPages())
		: undefined;

	for (const editor of editorService.editors) {
		if (!(editor instanceof BrowserEditorInput)) {
			continue;
		}
		if (trackedIds && !trackedIds.has(editor.id)) {
			continue;
		}
		const editorUrl = editor.url;
		if (editorUrl && URL.parse(editorUrl)?.host === parsed.host) {
			return editor;
		}
	}
	return undefined;
}

/**
 * Builds the "already open" tool result returned when an existing page with the
 * same host is found by {@link findExistingPageByHost}.
 */
export function alreadyOpenResult(existing: BrowserEditorInput): IToolResult {
	const link = createBrowserPageLink(existing.id);
	return {
		content: [{
			kind: 'text',
			value: `A page on this host is already open (Page ID: ${existing.id}). Use this page or pass \`forceNew: true\` to open a new one.`,
		}],
		toolResultMessage: new MarkdownString(localize('browser.open.alreadyOpen', "Already open: {0}", link)),
	};
}
