/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getV8CompatibilityFlags, IV8RuntimeCompatibility } from '../../node/v8Flags.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('V8 compatibility flags', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const affectedRuntime: IV8RuntimeCompatibility = {
		platform: 'darwin',
		architecture: 'arm64',
		electronVersion: '42.10.0'
	};

	test('disables Maglev for Electron 42 on macOS ARM64', () => {
		assert.deepStrictEqual(getV8CompatibilityFlags(affectedRuntime, []), ['--no-maglev']);
	});

	test('preserves an explicit Maglev choice', () => {
		assert.deepStrictEqual([
			getV8CompatibilityFlags(affectedRuntime, ['--maglev']),
			getV8CompatibilityFlags(affectedRuntime, ['--maglev=false']),
			getV8CompatibilityFlags(affectedRuntime, ['--no-maglev']),
			getV8CompatibilityFlags(affectedRuntime, ['--no-maglev=true']),
			getV8CompatibilityFlags(affectedRuntime, ['--trace-gc --maglev'])
		], [[], [], [], [], []]);
	});

	test('does not affect other runtimes', () => {
		assert.deepStrictEqual([
			getV8CompatibilityFlags({ ...affectedRuntime, platform: 'linux' }, []),
			getV8CompatibilityFlags({ ...affectedRuntime, architecture: 'x64' }, []),
			getV8CompatibilityFlags({ ...affectedRuntime, electronVersion: '43.0.0' }, []),
			getV8CompatibilityFlags({ ...affectedRuntime, electronVersion: undefined }, [])
		], [[], [], [], []]);
	});
});
