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
	await sendCommand('Accessibility.enable');
	try {
		const { node: root } = await sendCommand('Accessibility.getRootAXNode') as { node: AXNode };
		const nodes: AXNode[] = [root];
		const nodeIndexes = new Map<string, number>([[root.nodeId, 0]]);
		const pending = root.childIds?.length ? [root.nodeId] : [];
		const discovered = new Set<string>([root.nodeId]);
		let truncated = false;

		while (pending.length > 0 && nodes.length < maxNodes) {
			const parentIds = pending.splice(0, accessibilityFetchBatchSize);
			const responses = await Promise.all(parentIds.map(async id => ({
				id,
				response: await sendCommand('Accessibility.getChildAXNodes', { id }) as { nodes: AXNode[] },
			})));
			for (const { id, response } of responses) {
				const retainedChildIds: string[] = [];
				for (const child of response.nodes) {
					if (discovered.has(child.nodeId)) {
						retainedChildIds.push(child.nodeId);
						continue;
					}
					if (nodes.length >= maxNodes) {
						truncated = true;
						continue;
					}
					discovered.add(child.nodeId);
					nodeIndexes.set(child.nodeId, nodes.length);
					nodes.push(child);
					retainedChildIds.push(child.nodeId);
					if (child.childIds?.length) {
						pending.push(child.nodeId);
					}
				}
				const parentIndex = nodeIndexes.get(id);
				if (parentIndex !== undefined) {
					const parent = nodes[parentIndex];
					if (retainedChildIds.length !== (parent.childIds?.length ?? 0)) {
						nodes[parentIndex] = { ...parent, childIds: retainedChildIds };
					}
				}
			}
		}
		if (pending.length > 0) {
			truncated = true;
		}
		return { nodes, truncated };
	} finally {
		await sendCommand('Accessibility.disable');
	}
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
