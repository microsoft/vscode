/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
	IAgentHostEndpointMetadata,
	dedupeAgentHostEndpointMetadata,
	getAgentHostEndpointIdentityKey,
	parseAgentHostEndpointMetadataEntry,
	parseAgentHostEndpointRegistry,
	removeAgentHostEndpointMetadata,
	upsertAgentHostEndpointMetadata,
} from '../../common/agentHostEndpointRegistry.js';

function createEntry(overrides: Partial<IAgentHostEndpointMetadata> = {}): IAgentHostEndpointMetadata {
	return {
		schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
		type: 'editor',
		pid: 100,
		instanceId: 'a',
		protocolVersion: '0.7.0',
		connectionToken: 'token',
		endpoint: { type: 'socket', path: '/tmp/vscode-ah/a.sock' },
		...overrides,
	};
}

suite('Agent Host Endpoint Registry (schema v2)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('structurally validates every entry, discriminating the endpoint union', () => {
		const valid = createEntry();
		const validTcp = createEntry({ type: 'standalone', endpoint: { type: 'tcp', host: '127.0.0.1', port: 12345 } });
		const cases: unknown[] = [
			valid,
			validTcp,
			null,
			42,
			'not an object',
			{ ...valid, pid: 'not-a-number' },
			{ ...valid, pid: -1 },
			{ ...valid, type: 'bogus-type' },
			{ ...valid, endpoint: { type: 'bogus-kind', path: '/x' } },
			{ ...valid, endpoint: { type: 'tcp', host: '127.0.0.1', port: 'not-a-number' } },
			{ ...valid, endpoint: { type: 'tcp', host: '127.0.0.1', port: 70000 } },
			{ ...valid, connectionToken: undefined },
		];

		assert.deepStrictEqual(
			cases.map(entry => parseAgentHostEndpointMetadataEntry(entry) !== undefined),
			[true, true, false, false, false, false, false, false, false, false, false, false],
		);
	});

	test('ignores unsupported schema versions without failing the whole array', () => {
		const current = createEntry({ instanceId: 'current' });
		const raw = [
			current,
			{ ...current, instanceId: 'v1', schemaVersion: 1 },
			{ ...current, instanceId: 'v3', schemaVersion: 3 },
			{ not: 'a valid entry' },
			'garbage',
		];

		assert.deepStrictEqual(
			parseAgentHostEndpointRegistry(raw).map(entry => entry.instanceId),
			['current'],
		);
	});

	test('a non-array top-level value yields an empty registry', () => {
		assert.deepStrictEqual(parseAgentHostEndpointRegistry({ not: 'an array' }), []);
		assert.deepStrictEqual(parseAgentHostEndpointRegistry(null), []);
	});

	test('dedupes by (type, pid, instanceId), the later entry winning', () => {
		const stale = createEntry({ instanceId: 'dup', connectionToken: 'stale-token' });
		const fresh = createEntry({ instanceId: 'dup', connectionToken: 'fresh-token' });
		const other = createEntry({ pid: 200, instanceId: 'other' });
		const sameIdsDifferentType = createEntry({ type: 'standalone', instanceId: 'dup', endpoint: { type: 'tcp', host: '127.0.0.1', port: 1 } });

		const deduped = dedupeAgentHostEndpointMetadata([stale, other, sameIdsDifferentType, fresh]);

		assert.deepStrictEqual(
			deduped.map(getAgentHostEndpointIdentityKey).sort(),
			[other, sameIdsDifferentType, fresh].map(getAgentHostEndpointIdentityKey).sort(),
		);
		assert.strictEqual(deduped.find(entry => entry.type === 'editor' && entry.instanceId === 'dup')?.connectionToken, 'fresh-token');
	});

	test('upsert replaces only the matching identity, leaving other writers untouched', () => {
		const a = createEntry({ instanceId: 'a' });
		const b = createEntry({ pid: 200, instanceId: 'b', type: 'standalone', endpoint: { type: 'tcp', host: '127.0.0.1', port: 1 } });
		const updatedA = createEntry({ instanceId: 'a', connectionToken: 'updated-token' });

		assert.deepStrictEqual(upsertAgentHostEndpointMetadata([a, b], updatedA), [b, updatedA]);
	});

	test('remove takes only the exact-identity entry (same PID is not enough)', () => {
		const owner = createEntry({ instanceId: 'a' });
		const impostor = createEntry({ instanceId: 'a-impostor' }); // same (type, pid), different instanceId
		const other = createEntry({ pid: 200, instanceId: 'b' });

		assert.deepStrictEqual(removeAgentHostEndpointMetadata([owner, impostor, other], owner), [impostor, other]);
	});
});
