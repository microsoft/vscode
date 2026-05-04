/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElementData, IElementAncestor, formatElementPath } from '../../../../platform/browserView/common/browserView.js';
import { IRectangle } from '../../../../platform/window/common/window.js';

/**
 * Detail level for annotation output generation.
 */
export type BrowserAnnotationDetailLevel = 'compact' | 'standard' | 'detailed' | 'forensic';

/**
 * A single annotation on a browser page element.
 */
export interface IBrowserAnnotation {
	/** Unique identifier. */
	readonly id: string;

	/** 1-based display index. */
	readonly index: number;

	/** User's feedback comment. */
	readonly comment: string;

	/** URL of the page when the annotation was created. */
	readonly url: string;

	/** Display name for the element (e.g. "button#submit.primary"). */
	readonly displayName: string;

	/** Full display name including classes. */
	readonly displayNameFull: string;

	/** HTML path through ancestors (e.g. "body > div#app > form > button"). */
	readonly elementPath: string | undefined;

	/** The outer HTML of the annotated element. */
	readonly outerHTML: string;

	/** Computed CSS styles string. */
	readonly computedStyle: string;

	/** Bounding rectangle of the element at annotation time. */
	readonly bounds: IRectangle;

	/** Ancestor chain for the element. */
	readonly ancestors: readonly IElementAncestor[] | undefined;

	/** Element attributes (id, class, data-*, etc.). */
	readonly attributes: Readonly<Record<string, string>> | undefined;

	/** Computed style properties as key-value pairs. */
	readonly computedStyles: Readonly<Record<string, string>> | undefined;

	/** Element dimensions (top, left, width, height). */
	readonly dimensions: { readonly top: number; readonly left: number; readonly width: number; readonly height: number } | undefined;

	/** Inner text content of the element. */
	readonly innerText: string | undefined;

	/** Base64-encoded screenshot of the element (captured at annotation time). */
	readonly screenshotBase64: string | undefined;

	/** Text the user had selected when creating the annotation. */
	readonly selectedText: string | undefined;

	/** Whether this annotation covers multiple elements (group or area select). */
	readonly isMultiSelect: boolean;

	/** Timestamp when the annotation was created. */
	readonly timestamp: number;
}

/**
 * Build an {@link IBrowserAnnotation} from CDP element data and a user comment.
 */
export function createBrowserAnnotation(
	elementData: IElementData,
	comment: string,
	index: number,
	url: string,
	screenshotBase64?: string,
	selectedText?: string,
	isMultiSelect?: boolean,
): IBrowserAnnotation {
	const { displayNameShort, displayNameFull } = buildDisplayNames(elementData);

	return {
		id: `annotation-${Date.now()}-${index}`,
		index,
		comment,
		url,
		displayName: displayNameShort,
		displayNameFull: displayNameFull,
		elementPath: formatElementPath(elementData.ancestors),
		outerHTML: elementData.outerHTML,
		computedStyle: elementData.computedStyle,
		bounds: elementData.bounds,
		ancestors: elementData.ancestors,
		attributes: elementData.attributes,
		computedStyles: elementData.computedStyles,
		dimensions: elementData.dimensions,
		innerText: elementData.innerText,
		screenshotBase64,
		selectedText,
		isMultiSelect: isMultiSelect ?? false,
		timestamp: Date.now(),
	};
}

function buildDisplayNames(elementData: IElementData): { displayNameShort: string; displayNameFull: string } {
	// Parse tag/id/class from outerHTML
	const firstElementMatch = elementData.outerHTML.match(/^<([^ >]+)([^>]*?)>/);
	let tagName = 'element';
	let id = '';
	let className = '';

	if (firstElementMatch) {
		tagName = firstElementMatch[1];
		const idMatch = firstElementMatch[2].match(/\s+id\s*=\s*["']([^"']+)["']/i);
		id = idMatch ? `#${idMatch[1]}` : '';
		const classMatch = firstElementMatch[2].match(/\s+class\s*=\s*["']([^"']+)["']/i);
		className = classMatch ? `.${classMatch[1].replace(/\s+/g, '.')}` : '';
	}

	let displayNameShort = `${tagName}${id}`;
	let displayNameFull = `${tagName}${id}${className}`;

	// Use ancestor info if available for a more precise name
	if (elementData.ancestors && elementData.ancestors.length > 0) {
		let last = elementData.ancestors[elementData.ancestors.length - 1];
		let pseudo = '';
		if (last.tagName.startsWith('::') && elementData.ancestors.length > 1) {
			pseudo = last.tagName;
			last = elementData.ancestors[elementData.ancestors.length - 2];
		}
		displayNameShort = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ''}${pseudo}`;
		displayNameFull = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ''}${last.classNames?.length ? `.${last.classNames.join('.')}` : ''}${pseudo}`;
	}

	return { displayNameShort, displayNameFull };
}
