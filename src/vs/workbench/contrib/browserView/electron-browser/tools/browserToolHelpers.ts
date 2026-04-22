/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { IInvokeFunctionResult, IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IToolResult } from '../../../chat/common/tools/languageModelToolsService.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';

// eslint-disable-next-line local/code-import-patterns
import type { Page } from 'playwright-core';

export const DEFAULT_ELEMENT_LABEL = localize('browser.element', 'element');

export interface FormatBrowserEditorLinesOptions {
	indent?: string;
	numbered?: boolean;
	excludeIds?: boolean;
	agentNetworkFilterService?: IAgentNetworkFilterService;
}

/**
 * Formats a list of browser editors as summary lines such as
 * `- [pageId] Title (url) (active)`. Active/visible hints are
 * derived from the editor service automatically.
 *
 * When {@link FormatBrowserEditorLinesOptions.agentNetworkFilterService} is
 * provided, pages whose URL is blocked by network policy are masked to avoid
 * leaking title or URL to the model.
 */
export function formatBrowserEditorList(editorService: IEditorService, editors: readonly BrowserEditorInput[], options?: FormatBrowserEditorLinesOptions): string {
	const activeEditor = editorService.activeEditor;
	const visibleEditors = new Set(editorService.visibleEditors);
	const indent = options?.indent ?? '';
	const filterService = options?.agentNetworkFilterService;
	return editors.map((editor, index) => {
		const url = editor.url || 'about:blank';

		// If the page URL is blocked by network policy, mask its details.
		let blocked = false;
		if (filterService && url !== 'about:blank') {
			try { blocked = !filterService.isUriAllowed(URI.parse(url)); } catch { }
		}

		const title = blocked ? localize('browser.blockedByPolicy', "Blocked by network domain policy") : (editor.title || 'Untitled');
		const displayUrl = blocked ? '' : ` (${url})`;
		const hint = editor === activeEditor ? ' (active)' : visibleEditors.has(editor) ? ' (visible)' : '';
		const id = options?.excludeIds ? '' : `[${editor.id}] `;

		// By default, use numbers only if we're excluding IDs, so models don't get confused about which ID to use.
		const bullet = (options?.numbered ?? options?.excludeIds) ? `${index + 1}. ` : '- ';
		return `${indent}${bullet}${id}${title}${displayUrl}${hint}`;
	}).join('\n');
}

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
 *
 * Calls {@link IPlaywrightService.invokeFunction} without a timeout so the
 * action runs to completion — no deferred results are ever produced.
 */
export async function playwrightInvoke<TArgs extends unknown[], TReturn>(
	playwrightService: IPlaywrightService,
	pageId: string,
	fn: (page: Page, ...args: TArgs) => Promise<TReturn>,
	...args: TArgs
): Promise<IToolResult> {
	try {
		const result = await playwrightService.invokeFunction(pageId, fn.toString(), args);
		return invokeFunctionResultToToolResult(result);
	} catch (e) {
		return errorResult(e instanceof Error ? e.message : String(e));
	}
}

/**
 * Convert an {@link IInvokeFunctionResult} to an {@link IToolResult},
 * including any {@link IInvokeFunctionResult.deferredResultId}.
 */
export function invokeFunctionResultToToolResult(result: IInvokeFunctionResult, code?: string): IToolResult {
	const content: IToolResult['content'] = [];
	if (result.result !== undefined) {
		content.push({ kind: 'text', value: `Result: ${JSON.stringify(result.result)}` });
	}
	if (result.error) {
		content.push({ kind: 'text', value: result.error });
	}
	if (result.deferredResultId) {
		content.push({ kind: 'text', value: `[deferredResultId=${result.deferredResultId}] The code has not finished executing yet. Call run_playwright_code again with this deferredResultId and the same pageId (no code) to continue waiting.` });
	}
	content.push({ kind: 'text', value: result.summary });
	return {
		content,
		...(code ? {
			toolResultDetails: {
				input: code,
				inputLanguage: 'javascript',
				output: result.result || result.error
					? [{ type: 'embed' as const, isText: true, value: JSON.stringify(result.result ?? result.error, null, 2) }]
					: [],
				isError: !!result.error,
			},
		} : {}),
	};
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
async function findExistingPagesByHost(
	editorService: IEditorService,
	playwrightService: IPlaywrightService | undefined,
	url: string,
): Promise<BrowserEditorInput[]> {
	const parsed = URL.parse(url);
	if (!parsed || (parsed.protocol !== 'file:' && !parsed.host)) {
		return [];
	}

	const trackedIds = playwrightService
		? new Set(await playwrightService.getTrackedPages())
		: undefined;

	const results: BrowserEditorInput[] = [];
	for (const editor of editorService.editors) {
		if (!(editor instanceof BrowserEditorInput)) {
			continue;
		}
		if (trackedIds && !trackedIds.has(editor.id)) {
			continue;
		}
		const editorUrl = URL.parse(editor.url || '');
		if (
			!editor.url ||
			editorUrl?.host === parsed.host ||
			(parsed.protocol === 'file:' && editorUrl?.protocol === 'file:')
		) {
			results.push(editor);
		}
		// Check for subdomain matches
		if (
			editorUrl?.host && parsed.host &&
			(
				editorUrl.host.endsWith('.' + parsed.host) ||
				parsed.host.endsWith('.' + editorUrl.host)
			)
		) {
			results.push(editor);
		}
	}
	return results;
}

/**
 * Builds the "already open" tool result returned when an existing page with the
 * same host is found by {@link findExistingPagesByHost}.
 */
export async function getExistingPagesResult(
	editorService: IEditorService,
	playwrightService: IPlaywrightService | undefined,
	url: string,
	formatOptions?: FormatBrowserEditorLinesOptions
): Promise<IToolResult | undefined> {
	const existing = await findExistingPagesByHost(editorService, playwrightService, url);
	if (existing.length === 0) {
		return undefined;
	}

	const list = formatBrowserEditorList(editorService, existing, { indent: '  ', ...formatOptions });
	const links = existing.map(e => createBrowserPageLink(e.id));
	return {
		content: [{
			kind: 'text',
			value: `At least one similar page is already open:\n${list}\n\nUse an existing page or pass \`forceNew: true\` to open a new one.`
		}],
		toolResultMessage: new MarkdownString(localize('browser.open.alreadyOpen', "Already open: {0}", links.join(', '))),
	};
}
