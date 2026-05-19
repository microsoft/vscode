/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationStatus, type CustomizationRef, type SessionCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { getEffectiveAgents } from '../../browser/agentHostAgents.js';

function ref(uri: string, agents?: { uri: string; name: string; description?: string }[]): CustomizationRef {
	return { uri, displayName: uri, ...(agents ? { agents } : {}) };
}

function sessionCustomization(customization: CustomizationRef, clientId?: string): SessionCustomization {
	return {
		customization,
		enabled: true,
		status: CustomizationStatus.Loaded,
		...(clientId ? { clientId } : {}),
	};
}

suite('getEffectiveAgents', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns an empty list when no customizations contribute agents', () => {
		assert.deepStrictEqual(getEffectiveAgents(undefined, undefined, undefined), []);
		assert.deepStrictEqual(getEffectiveAgents([ref('plugin://a')], [ref('plugin://b')], []), []);
	});

	test('treats undefined `agents` as unknown and empty array as no agents', () => {
		const root = [ref('plugin://a', [{ uri: 'agent://review', name: 'review' }])];
		const client = [{ ...ref('plugin://b'), agents: [] as { uri: string; name: string }[] }];
		const result = getEffectiveAgents(root, client, undefined);
		assert.deepStrictEqual(result, [{ uri: 'agent://review', name: 'review' }]);
	});

	test('merges agents across layers and de-dupes by uri (session wins)', () => {
		const sharedAgent = { uri: 'agent://shared', name: 'shared' };
		const result = getEffectiveAgents(
			[ref('plugin://root', [
				{ ...sharedAgent, description: 'from root' },
				{ uri: 'agent://only-root', name: 'only-root' },
			])],
			[ref('plugin://client', [
				{ ...sharedAgent, description: 'from client' },
				{ uri: 'agent://only-client', name: 'only-client' },
			])],
			[sessionCustomization(ref('plugin://session', [
				{ ...sharedAgent, description: 'from session' },
				{ uri: 'agent://only-session', name: 'only-session' },
			]))],
		);
		assert.deepStrictEqual(result, [
			{ uri: 'agent://only-client', name: 'only-client' },
			{ uri: 'agent://only-root', name: 'only-root' },
			{ uri: 'agent://only-session', name: 'only-session' },
			{ uri: 'agent://shared', name: 'shared', description: 'from session' },
		]);
	});

	test('sorts by name, breaking ties by uri', () => {
		const result = getEffectiveAgents(
			[ref('plugin://a', [
				{ uri: 'agent://z', name: 'beta' },
				{ uri: 'agent://x', name: 'beta' },
				{ uri: 'agent://y', name: 'alpha' },
			])],
			undefined,
			undefined,
		);
		assert.deepStrictEqual(result.map(a => a.uri), ['agent://y', 'agent://x', 'agent://z']);
	});
});
