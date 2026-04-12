/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
export const DEFAULT_ELEMENT_LABEL = localize('browser.element', 'element');
/**
 * Creates a markdown link to a browser page.
 */
export function createBrowserPageLink(pageId) {
    if (typeof pageId === 'string') {
        pageId = BrowserViewUri.forId(pageId);
    }
    return `[${BrowserEditorInput.DEFAULT_LABEL}](${pageId.toString()}?vscodeLinkType=browser)`;
}
/**
 * Shared helper for running a Playwright function against a page and returning its result.
 */
export async function playwrightInvokeRaw(playwrightService, pageId, fn, ...args) {
    return playwrightService.invokeFunctionRaw(pageId, fn.toString(), ...args);
}
/**
 * Shared helper for running a Playwright function against a page and returning
 * a tool result. Handles success/error formatting.
 *
 * Calls {@link IPlaywrightService.invokeFunction} without a timeout so the
 * action runs to completion — no deferred results are ever produced.
 */
export async function playwrightInvoke(playwrightService, pageId, fn, ...args) {
    try {
        const result = await playwrightService.invokeFunction(pageId, fn.toString(), args);
        return invokeFunctionResultToToolResult(result);
    }
    catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
    }
}
/**
 * Convert an {@link IInvokeFunctionResult} to an {@link IToolResult},
 * including any {@link IInvokeFunctionResult.deferredResultId}.
 */
export function invokeFunctionResultToToolResult(result, code) {
    const content = [];
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
                    ? [{ type: 'embed', isText: true, value: JSON.stringify(result.result ?? result.error, null, 2) }]
                    : [],
                isError: !!result.error,
            },
        } : {}),
    };
}
export function errorResult(message) {
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
export async function findExistingPageByHost(editorService, playwrightService, url) {
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
export function alreadyOpenResult(existing) {
    const link = createBrowserPageLink(existing.id);
    return {
        content: [{
                kind: 'text',
                value: `A page on this host is already open (Page ID: ${existing.id}). Use this page or pass \`forceNew: true\` to open a new one.`,
            }],
        toolResultMessage: new MarkdownString(localize('browser.open.alreadyOpen', "Already open: {0}", link)),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclRvb2xIZWxwZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci90b29scy9icm93c2VyVG9vbEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOERBQThELENBQUM7QUFJOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFLeEUsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBRTVFOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQixDQUFDLE1BQW9CO0lBQ3pELElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxhQUFhLEtBQUssTUFBTSxDQUFDLFFBQVEsRUFBRSwwQkFBMEIsQ0FBQztBQUM3RixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLG1CQUFtQixDQUN4QyxpQkFBcUMsRUFDckMsTUFBYyxFQUNkLEVBQW9ELEVBQ3BELEdBQUcsSUFBVztJQUVkLE9BQU8saUJBQWlCLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQzVFLENBQUM7QUFFRDs7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