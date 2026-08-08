/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewAgentNetworkFilterSources, IAgentNetworkFilterableBrowserView, setBrowserViewGroupAgentNetworkFiltering } from '../../electron-main/browserViewAgentNetworkFilter.js';

suite('BrowserView network filter lifecycle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

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

	test('agent group add and remove transitions update filtering with the session source', () => {
		const setAgentNetworkFiltering = sinon.stub();
		const view: IAgentNetworkFilterableBrowserView = { setAgentNetworkFiltering };
		const owner = { mainWindowId: 1, sessionId: 'agent-session' };

		setBrowserViewGroupAgentNetworkFiltering(view, owner, true);
		setBrowserViewGroupAgentNetworkFiltering(view, owner, false);

		assert.deepStrictEqual(setAgentNetworkFiltering.args, [
			['agent-session', true],
			['agent-session', false],
		]);
	});

	test('non-agent groups do not change request filtering', () => {
		const setAgentNetworkFiltering = sinon.stub();
		const view: IAgentNetworkFilterableBrowserView = { setAgentNetworkFiltering };
		const owner = { mainWindowId: 1 };

		setBrowserViewGroupAgentNetworkFiltering(view, owner, true);
		setBrowserViewGroupAgentNetworkFiltering(view, owner, false);

		assert.strictEqual(setAgentNetworkFiltering.callCount, 0);
	});
});
