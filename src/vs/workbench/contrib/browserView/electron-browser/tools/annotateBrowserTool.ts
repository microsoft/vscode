/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, DEFAULT_ELEMENT_LABEL, errorResult, playwrightInvokeRaw } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
import { BrowserEditor } from '../browserEditor.js';
import { BrowserAnnotationFeature } from '../features/browserAnnotationFeature.js';
import { IElementData } from '../../../../../platform/browserView/common/browserView.js';

// eslint-disable-next-line local/code-import-patterns
import type { Page } from 'playwright-core';

export const AnnotateBrowserToolId = 'annotate_browser_element';

export const AnnotateBrowserToolData: IToolData = {
	id: AnnotateBrowserToolId,
	toolReferenceName: 'annotateBrowserElement',
	displayName: localize('annotateBrowserTool.displayName', 'Annotate Browser Element'),
	userDescription: localize('annotateBrowserTool.userDescription', 'Add a feedback annotation to an element in a browser page'),
	modelDescription: 'Add a feedback annotation to an element in a browser page. The annotation includes a comment about what should change. Annotations appear as numbered markers on the page and can be sent to chat or copied as structured markdown.',
	icon: Codicon.checklist,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: 'The browser page ID, acquired from context or the open tool.',
			},
			ref: {
				type: 'string',
				description: 'Element reference to annotate.',
			},
			selector: {
				type: 'string',
				description: 'Playwright selector of the element to annotate when "ref" is not available.',
			},
			element: {
				type: 'string',
				description: 'Human-readable description of the element to annotate (e.g., "submit button", "navigation bar").',
			},
			comment: {
				type: 'string',
				description: 'Feedback comment describing what should change about this element.',
			},
		},
		required: ['pageId', 'element', 'comment'],
		oneOf: [
			{ required: ['ref'] },
			{ required: ['selector'] },
		],
	},
};

interface IAnnotateBrowserToolParams {
	pageId: string;
	ref?: string;
	selector?: string;
	element?: string;
	comment: string;
}

export class AnnotateBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = _context.parameters as IAnnotateBrowserToolParams;
		const link = createBrowserPageLink(params.pageId);
		const element = escapeMarkdownSyntaxTokens(params.element ?? DEFAULT_ELEMENT_LABEL);
		return {
			invocationMessage: new MarkdownString(localize('browser.annotate.invocation', "Annotating {0} in {1}", element, link)),
			pastTenseMessage: new MarkdownString(localize('browser.annotate.past', "Annotated {0} in {1}", element, link)),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IAnnotateBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		let selector = params.selector;
		if (params.ref) {
			selector = `aria-ref=${params.ref}`;
		}
		if (!selector) {
			return errorResult('Either a "ref" or "selector" parameter is required.');
		}

		if (!params.comment) {
			return errorResult('A "comment" is required for the annotation.');
		}

		// Step 1: Use Playwright to extract element data from the page
		let elementData: IElementData;
		try {
			elementData = await playwrightInvokeRaw<[string], IElementData>(
				this.playwrightService,
				params.pageId,
				async (page: Page, sel: string) => {
					const locator = page.locator(sel);
					await locator.scrollIntoViewIfNeeded();
					return locator.evaluate((el: Element) => {
						const rect = el.getBoundingClientRect();
						const cs = window.getComputedStyle(el); // eslint-disable-line no-restricted-globals

						// Build ancestor chain
						const ancestors: Array<{ tagName: string; id?: string; classNames?: string[] }> = [];
						let current: Element | null = el;
						while (current && current !== document.documentElement) { // eslint-disable-line no-restricted-syntax
							const classNames = current.className && typeof current.className === 'string'
								? current.className.split(/\s+/).filter(Boolean)
								: [];
							ancestors.push({
								tagName: current.tagName.toLowerCase(),
								id: current.id || undefined,
								classNames: classNames.length > 0 ? classNames : undefined,
							});
							current = current.parentElement;
						}

						// Build attributes
						const attributes: Record<string, string> = {};
						for (const attr of el.attributes) {
							attributes[attr.name] = attr.value;
						}

						// Build computed styles subset
						const styleProps = ['color', 'font-size', 'font-weight', 'font-family', 'line-height',
							'background-color', 'border', 'border-radius', 'padding', 'margin',
							'display', 'position', 'width', 'height'];
						const computedStyles: Record<string, string> = {};
						for (const prop of styleProps) {
							const val = cs.getPropertyValue(prop);
							if (val && val !== 'none' && val !== 'normal' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)' && val !== 'auto') {
								computedStyles[prop] = val;
							}
						}

						return {
							outerHTML: el.outerHTML.length > 2000 ? el.outerHTML.slice(0, 2000) + '...' : el.outerHTML,
							computedStyle: Object.entries(computedStyles).map(([k, v]) => `${k}: ${v}`).join('; '),
							bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
							ancestors: ancestors.reverse(),
							attributes,
							computedStyles,
							dimensions: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
							innerText: (el as HTMLElement).innerText?.trim().slice(0, 500) || undefined,
						};
					});
				},
				selector,
			);
		} catch (e) {
			return errorResult(`Could not find element matching "${selector}": ${e instanceof Error ? e.message : String(e)}`);
		}

		// Step 2: Find the BrowserAnnotationFeature for this page and create the annotation
		const feature = this._findAnnotationFeature(params.pageId);
		if (!feature) {
			return errorResult('Could not find annotation feature for this browser page. Ensure the browser editor is open.');
		}

		const annotation = await feature.annotateBySelector(elementData, params.comment);
		if (!annotation) {
			return errorResult('Failed to create annotation.');
		}

		return {
			content: [{
				kind: 'text',
				value: `Created annotation #${annotation.index} on ${annotation.displayName}: "${params.comment}"`,
			}],
		};
	}

	private _findAnnotationFeature(pageId: string): BrowserAnnotationFeature | undefined {
		for (const editor of this.editorService.visibleEditorPanes) {
			if (editor instanceof BrowserEditor && editor.model?.id === pageId) {
				return editor.getContribution(BrowserAnnotationFeature);
			}
		}
		// Fallback: check active editor
		const active = this.editorService.activeEditorPane;
		if (active instanceof BrowserEditor) {
			return active.getContribution(BrowserAnnotationFeature);
		}
		return undefined;
	}
}
