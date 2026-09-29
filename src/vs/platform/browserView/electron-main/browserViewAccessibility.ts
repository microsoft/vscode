/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AXNode } from '../../webContentExtractor/electron-main/cdpAccessibilityDomain.js';
import type { IBrowserViewAccessibilitySnapshot } from '../common/browserView.js';

export const browserViewAccessibilityMaxNodes = 2000;
const accessibilityFetchBatchSize = 32;

export interface IBrowserViewAccessibilityTree {
	readonly nodes: readonly AXNode[];
	readonly truncated: boolean;
}

type AccessibilityCommandSender = (method: string, params?: object) => Promise<unknown>;

export async function readBrowserViewAccessibilityTree(sendCommand: AccessibilityCommandSender, maxNodes = browserViewAccessibilityMaxNodes): Promise<IBrowserViewAccessibilityTree> {
	if (maxNodes <= 0) {
		return { nodes: [], truncated: true };
	}
	const { node: root } = await sendCommand('Accessibility.getRootAXNode') as { node: AXNode };
	const nodes: AXNode[] = [];
	const pending: string[] = [];
	const discovered = new Set<string>([root.nodeId]);
	let truncated = false;

	const appendNode = (node: AXNode) => {
		nodes.push(node);
		const childIds = node.childIds ?? [];
		const retainedChildIds: string[] = [];
		for (const childId of childIds) {
			if (discovered.has(childId)) {
				retainedChildIds.push(childId);
				continue;
			}
			if (nodes.length + pending.length >= maxNodes) {
				truncated = true;
				continue;
			}
			discovered.add(childId);
			pending.push(childId);
			retainedChildIds.push(childId);
		}
		if (retainedChildIds.length !== childIds.length) {
			nodes[nodes.length - 1] = { ...node, childIds: retainedChildIds };
		}
	};

	appendNode(root);
	while (pending.length > 0 && nodes.length < maxNodes) {
		const nodeIds = pending.splice(0, Math.min(accessibilityFetchBatchSize, maxNodes - nodes.length));
		const responses = await Promise.all(nodeIds.map(async nodeId => ({
			nodeId,
			response: await sendCommand('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false }) as { nodes: AXNode[] },
		})));
		for (const { nodeId, response } of responses) {
			const node = response.nodes.find(candidate => candidate.nodeId === nodeId);
			if (!node) {
				truncated = true;
				continue;
			}
			appendNode(node);
		}
	}
	if (pending.length > 0) {
		truncated = true;
	}
	return { nodes, truncated };
}

export function formatBrowserViewAccessibility(nodes: readonly AXNode[], sourceTruncated = false): IBrowserViewAccessibilitySnapshot {
	const maxNodes = browserViewAccessibilityMaxNodes;
	const maxLength = 32768;
	const lines: string[] = [];
	let length = 0;
	const includedIds = new Set(nodes.map(node => node.nodeId));
	let truncated = sourceTruncated || nodes.length > maxNodes || nodes.some(node => node.childIds?.some(id => !includedIds.has(id)));
	for (const node of nodes.slice(0, maxNodes)) {
		const role = node.role?.value;
		const name = node.name?.value;
		if (node.ignored || typeof role !== 'string' || role === 'InlineTextBox' || role === 'RootWebArea' || typeof name !== 'string' || !name.trim()) {
			continue;
		}
		const states = node.properties?.filter(property =>
			['checked', 'pressed', 'expanded', 'selected', 'disabled', 'level'].includes(property.name)
			&& ['boolean', 'string', 'number'].includes(typeof property.value.value))
			.map(property => `${property.name}=${property.value.value}`) ?? [];
		const line = `${role}: ${name.replace(/\s+/g, ' ')}${states.length > 0 ? ` (${states.join(', ')})` : ''}`;
		if (length + line.length + 1 > maxLength) {
			truncated = true;
			break;
		}
		lines.push(line);
		length += line.length + 1;
	}
	return { text: lines.join('\n'), truncated, scope: 'main-frame' };
}
