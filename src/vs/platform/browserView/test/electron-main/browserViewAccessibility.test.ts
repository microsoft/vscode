/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { AXNode } from '../../../webContentExtractor/electron-main/cdpAccessibilityDomain.js';
import { formatBrowserViewAccessibility } from '../../electron-main/browserViewAccessibility.js';

suite('BrowserView user accessibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function node(id: string, role: string, name: string): AXNode {
		return { nodeId: id, ignored: false, role: { type: 'role', value: role }, name: { type: 'computedString', value: name } };
	}

	test('retains actual semantic content and states without URL metadata or duplicate inline text', () => {
		const nodes: AXNode[] = [
			{ ...node('1', 'RootWebArea', 'Private URL title'), properties: [{ name: 'url', value: { type: 'string', value: 'http://localhost/?token=private' } }] },
			node('2', 'heading', 'Synthetic counter'),
			node('3', 'StaticText', 'Count: 4'),
			node('4', 'InlineTextBox', 'Count: 4'),
			{ ...node('5', 'button', 'Increment'), properties: [{ name: 'disabled', value: { type: 'boolean', value: false } }] },
			{ ...node('6', 'StaticText', 'Hidden'), ignored: true },
		];
		assert.deepStrictEqual(formatBrowserViewAccessibility(nodes), {
			scope: 'main-frame', truncated: false,
			text: 'heading: Synthetic counter\nStaticText: Count: 4\nbutton: Increment (disabled=false)',
		});
	});

	test('bounds output and does not invent a description of graphical content', () => {
		assert.deepStrictEqual({
			graphical: formatBrowserViewAccessibility([node('1', 'Canvas', '')]),
			oversized: formatBrowserViewAccessibility([node('2', 'StaticText', 'x'.repeat(32769))]),
		}, {
			graphical: { scope: 'main-frame', text: '', truncated: false },
			oversized: { scope: 'main-frame', text: '', truncated: true },
		});
	});
});
