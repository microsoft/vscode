/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
	IAgentHostEndpointMetadata,
	dedupeAgentHostEndpointMetadata,
	getAgentHostEndpointIdentityHashInput,
	getAgentHostEndpointIdentityKey,
	parseAgentHostEndpointMetadataEntry,
	parseAgentHostEndpointRegistry,
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

	test('derives a stable, cross-language identity hash input and file name', () => {
		// These vectors are shared byte-for-byte with the Rust CLI
		// (`cli/src/tunnels/agent_host_registry.rs`); both languages must
		// derive the same `entries/<sha256hex>.json` name for a given identity.
		const hashName = (type: 'editor' | 'standalone', pid: number, instanceId: string) =>
			createHash('sha256').update(getAgentHostEndpointIdentityHashInput({ type, pid, instanceId }), 'utf8').digest('hex');

		assert.deepStrictEqual({
			input: getAgentHostEndpointIdentityHashInput({ type: 'editor', pid: 1234, instanceId: 'fixed-instance-id' }),
			editorHash: hashName('editor', 1234, 'fixed-instance-id'),
			standaloneHash: hashName('standalone', 4321, 'abc-XYZ_123'),
		}, {
			input: 'editor' + '\0' + '1234' + '\0' + 'fixed-instance-id',
			editorHash: '029edbd47070427f394376710b64ae91d13904edadc1d26ac520a12995168a37',
			standaloneHash: '5457fbcae051e99f111749d6e9a1064acae7dd701b87802314c28d273986413e',
		});
	});
});
