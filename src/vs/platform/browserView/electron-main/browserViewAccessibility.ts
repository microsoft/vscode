/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AXNode } from '../../webContentExtractor/electron-main/cdpAccessibilityDomain.js';
import type { IBrowserViewAccessibilitySnapshot } from '../common/browserView.js';

/** Preserve accessible names and control states rather than a page-reading tool's links and logs. */
export function formatBrowserViewAccessibility(nodes: readonly AXNode[]): IBrowserViewAccessibilitySnapshot {
	const maxNodes = 2000;
	const maxLength = 32768;
	const lines: string[] = [];
	let length = 0;
	const includedIds = new Set(nodes.map(node => node.nodeId));
	let truncated = nodes.length > maxNodes || nodes.some(node => node.childIds?.some(id => !includedIds.has(id)));
	for (const node of nodes.slice(0, maxNodes)) {
		const role = node.role?.value;
		const name = node.name?.value;
		if (node.ignored || typeof role !== 'string' || role === 'InlineTextBox'
			|| role === 'RootWebArea' || typeof name !== 'string' || !name.trim()) {
			continue;
		}
		const states = node.properties?.filter(property =>
			['checked', 'pressed', 'expanded', 'selected', 'disabled', 'level'].includes(property.name)
			&& ['boolean', 'string', 'number'].includes(typeof property.value.value))
			.map(property => `${property.name}=${property.value.value}`) ?? [];
		const line = `${role}: ${name.replace(/\s+/g, ' ')}${states.length ? ` (${states.join(', ')})` : ''}`;
		if (length + line.length + 1 > maxLength) {
			truncated = true;
			break;
		}
		lines.push(line);
		length += line.length + 1;
	}
	return { text: lines.join('\n'), truncated, scope: 'main-frame' };
}
