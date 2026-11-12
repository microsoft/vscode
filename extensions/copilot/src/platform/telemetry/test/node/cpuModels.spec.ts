/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as os from 'os';
import { suite, test, vi } from 'vitest';
import { parseCpuInfoModelNames, setCommonCpuProperty } from '../../node/cpuModels';

suite('CPU model names', function () {
	test('parses model names from /proc/cpuinfo like libuv', function () {
		const cpuInfo = [
			'processor\t: 0',
			'vendor_id\t: GenuineIntel',
			'model\t\t: 183',
			'model name\t: 13th Gen Intel(R) Core(TM) i9-13900K',
			'cpu MHz\t\t: 5500.000',
			'',
			'processor\t: 1',
			'vendor_id\t: GenuineIntel',
			'model\t\t: 183',
			'model name\t: 13th Gen Intel(R) Core(TM) i9-13900K',
			'',
			'processor\t: 2',
			'model name\t: Intel(R) Xeon(R) Platinum 8480+',
			'',
			'processor\t: 3',
			'vendor_id\t: GenuineIntel',
			'',
			'',
		].join('\n');

		assert.deepStrictEqual(parseCpuInfoModelNames(cpuInfo), [
			'13th Gen Intel(R) Core(TM) i9-13900K',
			'13th Gen Intel(R) Core(TM) i9-13900K',
			'Intel(R) Xeon(R) Platinum 8480+',
			'unknown',
		]);
	});

	test('sets common_cpu to the os.cpus() model names', async function () {
		const properties: Record<string, string> = {};
		setCommonCpuProperty(properties);

		const expected = Array.from(new Set(os.cpus().map(c => c.model))).join();
		await vi.waitFor(() => assert.strictEqual(properties.common_cpu, expected));
	});
});
