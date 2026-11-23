/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DEFAULT_NAMED_LAYOUT_ID } from '../../../services/namedLayouts/common/namedLayouts.js';
import { ExtHostWindowLayouts } from '../../common/extHostWindowLayouts.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostWindowLayouts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a switch between layouts with the same label changes the active layout', () => {
		const testObject = new ExtHostWindowLayouts(SingleProxyRPCProtocol({}));
		const changes: string[] = [];
		store.add(testObject.onDidChangeActiveLayout(layout => changes.push(layout.label)));

		testObject.$acceptActiveLayout({ id: DEFAULT_NAMED_LAYOUT_ID, label: 'Default', contribution: undefined });
		testObject.$acceptActiveLayout({ id: 'first', label: 'Debug', contribution: undefined });
		testObject.$acceptActiveLayout({ id: 'second', label: 'Debug', contribution: undefined });
		testObject.$acceptActiveLayout({ id: 'second', label: 'Debug', contribution: undefined });

		assert.deepStrictEqual({ changes, active: testObject.activeLayout.label }, { changes: ['Debug', 'Debug'], active: 'Debug' });
	});

	test('the label of the active layout is updated without a change of the active layout', () => {
		const testObject = new ExtHostWindowLayouts(SingleProxyRPCProtocol({}));
		const changes: string[] = [];
		store.add(testObject.onDidChangeActiveLayout(layout => changes.push(layout.label)));

		testObject.$acceptActiveLayout({ id: DEFAULT_NAMED_LAYOUT_ID, label: 'Standard', contribution: undefined });

		assert.deepStrictEqual({ changes, active: testObject.activeLayout.label }, { changes: [], active: 'Standard' });
	});
});
