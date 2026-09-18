/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectAgentHostResources } from '../../node/agentHostResources.js';

suite('Agent host resource collection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const totalMemoryBytes = 16 * 1024 ** 3;
	const constrainedMemoryBytes = 4 * 1024 ** 3;
	const source = {
		platform: 'linux',
		architecture: 'x64',
		availableParallelism: () => 8,
		totalmem: () => totalMemoryBytes,
		constrainedMemory: (): number | undefined => 0,
	};

	test('collects logical process parallelism and total memory capacity', () => {
		assert.deepStrictEqual(collectAgentHostResources(source), { platform: 'linux', architecture: 'x64', cpuCount: 8, memoryBytes: totalMemoryBytes });
	});

	test('normalizes supported operating systems without guessing unsupported ones', () => {
		assert.deepStrictEqual(['win32', 'linux', 'darwin', 'freebsd'].map(platform => collectAgentHostResources({ ...source, platform }).platform),
			['windows', 'linux', 'macos', undefined]);
	});

	test('uses the smaller positive total or constrained memory capacity', () => {
		assert.deepStrictEqual([constrainedMemoryBytes, totalMemoryBytes, totalMemoryBytes * 2].map(value => collectAgentHostResources({
			...source, constrainedMemory: () => value,
		}).memoryBytes), [constrainedMemoryBytes, totalMemoryBytes, totalMemoryBytes]);
	});

	test('ignores unavailable, unbounded and invalid constrained memory readings', () => {
		const values = [undefined, 0, -1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1];
		assert.deepStrictEqual(values.map(value => collectAgentHostResources({ ...source, constrainedMemory: () => value }).memoryBytes),
			values.map(() => totalMemoryBytes));
	});

	test('uses a valid constraint when total memory is unknown', () => {
		const values = [0, -1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1];
		assert.deepStrictEqual(values.map(value => collectAgentHostResources({
			...source, totalmem: () => value, constrainedMemory: () => constrainedMemoryBytes,
		}).memoryBytes), values.map(() => constrainedMemoryBytes));
	});

	test('omits invalid capacities rather than fabricating defaults', () => {
		const values = [0, -1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1];
		assert.deepStrictEqual(values.map(value => collectAgentHostResources({
			...source, availableParallelism: () => value, totalmem: () => value,
		})), values.map(() => ({ platform: 'linux', architecture: 'x64' })));
	});

	test('omits empty architectures', () => {
		assert.deepStrictEqual(['', ' \t '].map(architecture => collectAgentHostResources({ ...source, architecture }).architecture), [undefined, undefined]);
	});

	test('leaves resources unknown when system queries fail', () => {
		const fail = () => { throw new Error('Unavailable'); };
		assert.deepStrictEqual([
			collectAgentHostResources({ ...source, constrainedMemory: fail }),
			collectAgentHostResources({ ...source, availableParallelism: fail, totalmem: fail, constrainedMemory: fail }),
		], [
			{ platform: 'linux', architecture: 'x64', cpuCount: 8, memoryBytes: totalMemoryBytes },
			{ platform: 'linux', architecture: 'x64' },
		]);
	});
});
