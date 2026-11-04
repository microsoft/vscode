/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { AXNode } from '../../../webContentExtractor/electron-main/cdpAccessibilityDomain.js';
import { formatBrowserViewAccessibility, readBrowserViewAccessibilityTree } from '../../electron-main/browserViewAccessibility.js';

suite('BrowserView user accessibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function node(id: string, role: string, name: string): AXNode {
		return { nodeId: id, ignored: false, role: { type: 'role', value: role }, name: { type: 'computedString', value: name } };
	}

	test('retains semantic content and control states without URL metadata or duplicate inline text', () => {
		const nodes: AXNode[] = [
			{ ...node('1', 'RootWebArea', 'Private URL title'), properties: [{ name: 'url', value: { type: 'string', value: 'http://localhost/?token=private' } }] },
			node('2', 'heading', 'Synthetic counter'),
			node('3', 'StaticText', 'Count: 4'),
			node('4', 'InlineTextBox', 'Count: 4'),
			{ ...node('5', 'button', 'Increment'), properties: [{ name: 'disabled', value: { type: 'boolean', value: false } }] },
			{ ...node('6', 'StaticText', 'Hidden'), ignored: true },
		];
		assert.deepStrictEqual(formatBrowserViewAccessibility(nodes), {
			scope: 'main-frame',
			truncated: false,
			text: 'heading: Synthetic counter\nStaticText: Count: 4\nbutton: Increment (disabled=false)',
		});
	});

	test('bounds output without inventing graphical descriptions', () => {
		assert.deepStrictEqual({
			graphical: formatBrowserViewAccessibility([node('1', 'Canvas', '')]),
			oversized: formatBrowserViewAccessibility([node('2', 'StaticText', 'x'.repeat(32769))]),
		}, {
			graphical: { scope: 'main-frame', text: '', truncated: false },
			oversized: { scope: 'main-frame', text: '', truncated: true },
		});
	});

	test('reads the accessibility tree incrementally up to the node limit', async () => {
		const calls: Array<{ method: string; params?: object }> = [];
		const nodes = new Map<string, AXNode>([
			['1', { ...node('1', 'RootWebArea', 'Root'), childIds: ['2'] }],
			['2', { ...node('2', 'heading', 'First'), childIds: ['3', '4'] }],
			['3', node('3', 'button', 'Second')],
			['4', node('4', 'link', 'Omitted')],
		]);
		const tree = await readBrowserViewAccessibilityTree(async (method, params) => {
			calls.push({ method, params });
			if (method === 'Accessibility.enable' || method === 'Accessibility.disable') {
				return {};
			}
			if (method === 'Accessibility.getRootAXNode') {
				return { node: nodes.get('1')! };
			}
			const id = (params as { id: string }).id;
			return {
				nodes: id === '1'
					? [nodes.get('2')!]
					: [nodes.get('3')!, nodes.get('4')!],
			};
		}, 3);

		assert.deepStrictEqual({
			nodeIds: tree.nodes.map(node => node.nodeId),
			truncated: tree.truncated,
			calls,
		}, {
			nodeIds: ['1', '2', '3'],
			truncated: true,
			calls: [
				{ method: 'Accessibility.enable', params: undefined },
				{ method: 'Accessibility.getRootAXNode', params: undefined },
				{ method: 'Accessibility.getChildAXNodes', params: { id: '1' } },
				{ method: 'Accessibility.getChildAXNodes', params: { id: '2' } },
				{ method: 'Accessibility.disable', params: undefined },
			],
		});
	});
});
