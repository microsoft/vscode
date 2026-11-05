/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { type IAgentHostResources, readAgentHostResources, withAgentHostResources } from '../../common/meta/agentHostResources.js';
import type { RootState } from '../../common/state/sessionState.js';

suite('Agent host resource metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const resources: IAgentHostResources = { platform: 'linux', architecture: 'x64', cpuCount: 8, memoryBytes: 16 * 1024 ** 3 };

	function rootWithResources(value: unknown): RootState {
		return { agents: [], _meta: { 'vscode.agentHost.resources': value } };
	}

	test('round-trips resource metadata', () => {
		assert.deepStrictEqual(readAgentHostResources({ agents: [], _meta: withAgentHostResources(undefined, resources) }), resources);
	});

	test('treats older roots and missing metadata as unknown', () => {
		const roots: (RootState | undefined)[] = [undefined, { agents: [] }, { agents: [], _meta: {} }, { agents: [], _meta: { hostBuild: { version: '1.0.0' } } }];
		assert.deepStrictEqual(roots.map(readAgentHostResources), roots.map(() => undefined));
	});

	test('rejects malformed and empty resource payloads', () => {
		const values = [undefined, null, false, 0, 'linux', [], {}, { unrecognized: 1 }];
		assert.deepStrictEqual(values.map(value => readAgentHostResources(rootWithResources(value))), values.map(() => undefined));
	});

	test('reads valid fields independently and ignores unrecognized fields', () => {
		assert.deepStrictEqual([
			readAgentHostResources(rootWithResources({ platform: 'windows' })),
			readAgentHostResources(rootWithResources({ architecture: 'arm64' })),
			readAgentHostResources(rootWithResources({ cpuCount: 4 })),
			readAgentHostResources(rootWithResources({ memoryBytes: 1024 })),
			readAgentHostResources(rootWithResources({ ...resources, cpuCount: '8', extra: 'ignored' })),
		], [
			{ platform: 'windows' },
			{ architecture: 'arm64' },
			{ cpuCount: 4 },
			{ memoryBytes: 1024 },
			{ platform: 'linux', architecture: 'x64', memoryBytes: resources.memoryBytes },
		]);
	});

	test('accepts only supported platform names', () => {
		const platforms = ['windows', 'linux', 'macos', 'win32', 'darwin', 'freebsd', 'Windows', '', null, 1];
		assert.deepStrictEqual(platforms.map(platform => readAgentHostResources(rootWithResources({ platform }))), [
			{ platform: 'windows' }, { platform: 'linux' }, { platform: 'macos' },
			undefined, undefined, undefined, undefined, undefined, undefined, undefined,
		]);
	});

	test('rejects empty and wrong-typed architectures', () => {
		const architectures = ['', ' \t ', undefined, null, 4, {}, []];
		assert.deepStrictEqual(architectures.map(architecture => readAgentHostResources(rootWithResources({ architecture }))), architectures.map(() => undefined));
	});

	test('rejects invalid CPU and memory numbers', () => {
		const values = [undefined, null, '8', 0, -1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1];
		assert.deepStrictEqual(values.map(value => readAgentHostResources(rootWithResources({ cpuCount: value, memoryBytes: value }))), values.map(() => undefined));
	});

	test('accepts positive safe integer capacities', () => {
		const values = [1, Number.MAX_SAFE_INTEGER];
		assert.deepStrictEqual(values.map(value => readAgentHostResources(rootWithResources({ cpuCount: value, memoryBytes: value }))),
			values.map(value => ({ cpuCount: value, memoryBytes: value })));
	});

	test('preserves unrelated metadata without mutating inputs', () => {
		const original = { other: true, 'vscode.agentHost.resources': { cpuCount: 1 } };
		const updated = withAgentHostResources(original, resources);
		assert.deepStrictEqual({ original, updated }, {
			original: { other: true, 'vscode.agentHost.resources': { cpuCount: 1 } },
			updated: { other: true, 'vscode.agentHost.resources': resources },
		});
	});

	test('removes the resource slot when omitted or invalid and drops empty metadata bags', () => {
		assert.deepStrictEqual([
			withAgentHostResources({ other: true, 'vscode.agentHost.resources': resources }, undefined),
			withAgentHostResources({ 'vscode.agentHost.resources': resources }, undefined),
			withAgentHostResources({ 'vscode.agentHost.resources': resources }, { cpuCount: 0, memoryBytes: NaN }),
			withAgentHostResources(undefined, undefined),
		], [{ other: true }, undefined, undefined, undefined]);
	});
});
