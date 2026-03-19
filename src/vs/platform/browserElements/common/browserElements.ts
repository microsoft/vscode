/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRectangle } from '../../window/common/window.js';

export const INativeBrowserElementsService = createDecorator<INativeBrowserElementsService>('nativeBrowserElementsService');

export interface IElementAncestor {
	readonly tagName: string;
	readonly id?: string;
	readonly classNames?: string[];
}

export interface IElementData {
	readonly outerHTML: string;
	readonly computedStyle: string;
	readonly bounds: IRectangle;
	readonly ancestors?: IElementAncestor[];
	readonly attributes?: Record<string, string>;
	readonly computedStyles?: Record<string, string>;
	readonly dimensions?: { readonly top: number; readonly left: number; readonly width: number; readonly height: number };
	readonly innerText?: string;
}

/**
 * Locator for identifying a browser target/webview.
 * Uses either the parent webview or browser view id to uniquely identify the target.
 */
export interface IBrowserTargetLocator {
	/**
	 * Identifier of the parent webview hosting the target.
	 *
	 * Exactly one of {@link webviewId} or {@link browserViewId} should be provided.
	 * Use this when the target is rendered inside a webview.
	 */
	readonly webviewId?: string;
	/**
	 * Identifier of the browser view hosting the target.
	 *
	 * Exactly one of {@link webviewId} or {@link browserViewId} should be provided.
	 * Use this when the target is rendered inside a browser view rather than a webview.
	 */
	readonly browserViewId?: string;
}

export interface INativeBrowserElementsService {

	readonly _serviceBrand: undefined;

	// Properties
	readonly windowId: number;

	getElementData(rect: IRectangle, token: CancellationToken, locator: IBrowserTargetLocator, cancellationId?: number): Promise<IElementData | undefined>;

	getFocusedElementData(rect: IRectangle, token: CancellationToken, locator: IBrowserTargetLocator, cancellationId?: number): Promise<IElementData | undefined>;

	startDebugSession(token: CancellationToken, locator: IBrowserTargetLocator, cancelAndDetachId?: number): Promise<void>;

	startConsoleSession(token: CancellationToken, locator: IBrowserTargetLocator, cancelAndDetachId?: number): Promise<void>;

	getConsoleLogs(locator: IBrowserTargetLocator): Promise<string | undefined>;
}

/**
 * Extract a display name from outer HTML (e.g., "div#myId.myClass1.myClass2")
 */
export function getDisplayNameFromOuterHTML(outerHTML: string): string {
	const firstElementMatch = outerHTML.match(/^<([^ >]+)([^>]*?)>/);
	if (!firstElementMatch) {
		throw new Error('No outer element found');
	}

	const tagName = firstElementMatch[1];
	const idMatch = firstElementMatch[2].match(/\s+id\s*=\s*["']([^"']+)["']/i);
	const id = idMatch ? `#${idMatch[1]}` : '';
	const classMatch = firstElementMatch[2].match(/\s+class\s*=\s*["']([^"']+)["']/i);
	const className = classMatch ? `.${classMatch[1].replace(/\s+/g, '.')}` : '';
	return `${tagName}${id}${className}`;
}

/**
 * Format an array of element ancestors into a CSS-selector-like path string.
 */
export function formatElementPath(ancestors: readonly IElementAncestor[] | undefined): string | undefined {
	if (!ancestors || ancestors.length === 0) {
		return undefined;
	}

	return ancestors
		.map(ancestor => {
			const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join('.')}` : '';
			const id = ancestor.id ? `#${ancestor.id}` : '';
			return `${ancestor.tagName}${id}${classes}`;
		})
		.join(' > ');
}

/**
 * Collapse margin-top/right/bottom/left or padding-top/right/bottom/left
 * into a single shorthand value, removing the individual entries from the map.
 */
function createBoxShorthand(entries: Map<string, string>, propertyName: 'margin' | 'padding'): string | undefined {
	const topKey = `${propertyName}-top`;
	const rightKey = `${propertyName}-right`;
	const bottomKey = `${propertyName}-bottom`;
	const leftKey = `${propertyName}-left`;

	const top = entries.get(topKey);
	const right = entries.get(rightKey);
	const bottom = entries.get(bottomKey);
	const left = entries.get(leftKey);

	if (top === undefined || right === undefined || bottom === undefined || left === undefined) {
		return undefined;
	}

	entries.delete(topKey);
	entries.delete(rightKey);
	entries.delete(bottomKey);
	entries.delete(leftKey);

	return `${top} ${right} ${bottom} ${left}`;
}

/**
 * Format a key-value record into a markdown-style list,
 * collapsing margin/padding into shorthand values.
 */
export function formatElementMap(entries: Readonly<Record<string, string>> | undefined): string | undefined {
	if (!entries || Object.keys(entries).length === 0) {
		return undefined;
	}

	const normalizedEntries = new Map(Object.entries(entries));
	const lines: string[] = [];

	const marginShorthand = createBoxShorthand(normalizedEntries, 'margin');
	if (marginShorthand) {
		lines.push(`- margin: ${marginShorthand}`);
	}

	const paddingShorthand = createBoxShorthand(normalizedEntries, 'padding');
	if (paddingShorthand) {
		lines.push(`- padding: ${paddingShorthand}`);
	}

	for (const [name, value] of Array.from(normalizedEntries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`- ${name}: ${value}`);
	}

	return lines.join('\n');
}

/**
 * Build a structured text representation of element data for use as chat context.
 */
export function createElementContextValue(elementData: IElementData, displayName: string, attachCss: boolean): string {
	const sections: string[] = [];
	sections.push('Attached Element Context from Integrated Browser');
	sections.push(`Element: ${displayName}`);

	const htmlPath = formatElementPath(elementData.ancestors);
	if (htmlPath) {
		sections.push(`HTML Path:\n${htmlPath}`);
	}

	const attributeTable = formatElementMap(elementData.attributes);
	if (attributeTable) {
		sections.push(`Attributes:\n${attributeTable}`);
	}

	if (attachCss) {
		const computedStyleTable = formatElementMap(elementData.computedStyles);
		if (computedStyleTable) {
			sections.push(`Computed Styles:\n${computedStyleTable}`);
		}
	}

	if (elementData.dimensions) {
		const { top, left, width, height } = elementData.dimensions;
		sections.push(
			`Dimensions:\n- top: ${Math.round(top)}px\n- left: ${Math.round(left)}px\n- width: ${Math.round(width)}px\n- height: ${Math.round(height)}px`
		);
	}

	const innerText = elementData.innerText?.trim();
	if (innerText) {
		sections.push(`Inner Text:\n\`\`\`text\n${innerText}\n\`\`\``);
	}

	sections.push(`Outer HTML:\n\`\`\`html\n${elementData.outerHTML}\n\`\`\``);

	if (attachCss) {
		sections.push(`Full Computed CSS:\n\`\`\`css\n${elementData.computedStyle}\n\`\`\``);
	}

	return sections.join('\n\n');
}
