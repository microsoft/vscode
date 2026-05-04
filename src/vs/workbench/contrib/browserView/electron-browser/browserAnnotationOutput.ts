/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserAnnotation, BrowserAnnotationDetailLevel } from '../common/browserAnnotation.js';
import { formatElementMap } from '../../../../platform/browserView/common/browserView.js';

/**
 * Generate structured markdown output from a collection of browser annotations.
 * The output is designed to be pasted into AI coding agents as structured feedback.
 */
export function generateAnnotationOutput(
	annotations: readonly IBrowserAnnotation[],
	pageUrl: string,
	detailLevel: BrowserAnnotationDetailLevel = 'standard',
): string {
	if (annotations.length === 0) {
		return '';
	}

	let output = `## Page Feedback: ${pageUrl}\n`;

	if (detailLevel !== 'compact') {
		output += '\n';
	}

	for (const annotation of annotations) {
		switch (detailLevel) {
			case 'compact':
				output += formatCompact(annotation);
				break;
			case 'forensic':
				output += formatForensic(annotation);
				break;
			default:
				output += formatStandardOrDetailed(annotation, detailLevel);
				break;
		}
	}

	return output.trim();
}

function formatCompact(a: IBrowserAnnotation): string {
	let line = `${a.index}. **${a.displayName}**`;

	const text = a.innerText?.trim();
	if (text) {
		const preview = text.length > 30 ? text.slice(0, 30) + '...' : text;
		line += ` (re: "${preview}")`;
	}

	line += `: ${a.comment}\n`;
	return line;
}

function formatStandardOrDetailed(a: IBrowserAnnotation, level: BrowserAnnotationDetailLevel): string {
	let output = `### ${a.index}. ${a.displayName}\n`;

	if (a.elementPath) {
		output += `**Location:** ${a.elementPath}\n`;
	}

	if (level === 'detailed') {
		const attributeTable = formatElementMap(a.attributes as Record<string, string> | undefined);
		if (attributeTable) {
			output += `**Attributes:**\n${attributeTable}\n`;
		}

		if (a.dimensions) {
			const { top, left, width, height } = a.dimensions;
			output += `**Position:** ${Math.round(left)}px, ${Math.round(top)}px (${Math.round(width)}×${Math.round(height)}px)\n`;
		}
	}

	const text = a.innerText?.trim();
	if (text) {
		const preview = text.length > 100 ? text.slice(0, 100) + '...' : text;
		output += `**Text:** "${preview}"\n`;
	}

	output += `**Feedback:** ${a.comment}\n\n`;
	return output;
}

function formatForensic(a: IBrowserAnnotation): string {
	let output = `### ${a.index}. ${a.displayNameFull}\n`;

	if (a.elementPath) {
		output += `**Full Path:** ${a.elementPath}\n`;
	}

	const attributeTable = formatElementMap(a.attributes as Record<string, string> | undefined);
	if (attributeTable) {
		output += `**Attributes:**\n${attributeTable}\n`;
	}

	if (a.dimensions) {
		const { top, left, width, height } = a.dimensions;
		output += `**Position:** x:${Math.round(left)}, y:${Math.round(top)} (${Math.round(width)}×${Math.round(height)}px)\n`;
	}

	const text = a.innerText?.trim();
	if (text) {
		output += `**Text:** "${text}"\n`;
	}

	const stylesTable = formatElementMap(a.computedStyles as Record<string, string> | undefined);
	if (stylesTable) {
		output += `**Computed Styles:**\n${stylesTable}\n`;
	}

	output += `**Outer HTML:**\n\`\`\`html\n${a.outerHTML}\n\`\`\`\n`;
	output += `**Feedback:** ${a.comment}\n\n`;
	return output;
}
