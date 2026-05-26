/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationStatus, type CustomizationAgentRef, type SessionCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { getEffectiveAgents } from '../../../../../../platform/agentHost/common/customAgents.js';

function sc(uri: string, agents?: CustomizationAgentRef[], enabled = true): SessionCustomization {
	return {
		customization: { uri, displayName: uri },
		enabled,
		status: CustomizationStatus.Loaded,
		...(agents ? { agents } : {}),
	};
}

suite('getEffectiveAgents', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns an empty list when no customizations contribute agents', () => {
		assert.deepStrictEqual(getEffectiveAgents(undefined), []);
		assert.deepStrictEqual(getEffectiveAgents([sc('plugin://a'), sc('plugin://b', [])]), []);
	});

	test('treats undefined `agents` as unknown and empty array as no agents', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [{ uri: 'agent://review', name: 'review' }]),
			sc('plugin://b', []),
		]);
		assert.deepStrictEqual(result, [{ uri: 'agent://review', name: 'review' }]);
	});

	test('skips disabled session customizations', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [{ uri: 'agent://a', name: 'a' }], false),
			sc('plugin://b', [{ uri: 'agent://b', name: 'b' }]),
		]);
		assert.deepStrictEqual(result, [{ uri: 'agent://b', name: 'b' }]);
	});

	test('de-dupes by uri (first-seen wins)', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [
				{ uri: 'agent://shared', name: 'shared', description: 'from a' },
				{ uri: 'agent://only-a', name: 'only-a' },
			]),
			sc('plugin://b', [
				{ uri: 'agent://shared', name: 'shared', description: 'from b' },
				{ uri: 'agent://only-b', name: 'only-b' },
			]),
		]);
		assert.deepStrictEqual(result, [
			{ uri: 'agent://only-a', name: 'only-a' },
			{ uri: 'agent://only-b', name: 'only-b' },
			{ uri: 'agent://shared', name: 'shared', description: 'from a' },
		]);
	});

	test('sorts by name, breaking ties by uri', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [
				{ uri: 'agent://z', name: 'beta' },
				{ uri: 'agent://x', name: 'beta' },
				{ uri: 'agent://y', name: 'alpha' },
			]),
		]);
		assert.deepStrictEqual(result.map(a => a.uri), ['agent://y', 'agent://x', 'agent://z']);
	});
});
