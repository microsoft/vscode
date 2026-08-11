/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewAgentNetworkFilterSources } from '../../electron-main/browserViewAgentNetworkFilter.js';

suite('BrowserView network filter sources', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps filtering enabled until every agent source releases the view', () => {
		const sources = new BrowserViewAgentNetworkFilterSources();

		assert.deepStrictEqual([
			sources.set('agent-one', true),
			sources.set('agent-two', true),
			sources.set('agent-one', false),
			sources.set('agent-two', false),
		], [
			true,
			true,
			true,
			false,
		]);
	});

	test('clearing sources disables filtering state', () => {
		const sources = new BrowserViewAgentNetworkFilterSources();
		sources.set('agent-one', true);
		sources.set('agent-two', true);

		sources.clear();

		assert.strictEqual(sources.set('agent-three', false), false);
	});
});
