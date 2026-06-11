/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { unflattenManagedSettings } from '../../common/copilotPolicy.js';

suite('unflattenManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty map returns empty object', () => {
		const result = unflattenManagedSettings(new Map());
		assert.deepStrictEqual(result, {});
	});

	test('single dotted key produces nested structure', () => {
		const flat = new Map<string, string | number | boolean>([
			['permissions.disableBypassPermissionsMode', 'disable'],
		]);
		assert.deepStrictEqual(unflattenManagedSettings(flat), {
			permissions: { disableBypassPermissionsMode: 'disable' },
		});
	});

	test('multiple keys under the same parent', () => {
		const flat = new Map<string, string | number | boolean>([
			['permissions.disableBypassPermissionsMode', 'disable'],
			['permissions.anotherSetting', 'value'],
		]);
		assert.deepStrictEqual(unflattenManagedSettings(flat), {
			permissions: {
				disableBypassPermissionsMode: 'disable',
				anotherSetting: 'value',
			},
		});
	});

	test('single-segment key (no dots)', () => {
		const flat = new Map<string, string | number | boolean>([
			['topLevel', 'yes'],
		]);
		assert.deepStrictEqual(unflattenManagedSettings(flat), {
			topLevel: 'yes',
		});
	});

	test('deeply nested key', () => {
		const flat = new Map<string, string | number | boolean>([
			['a.b.c.d', 42],
		]);
		assert.deepStrictEqual(unflattenManagedSettings(flat), {
			a: { b: { c: { d: 42 } } },
		});
	});

	test('boolean values are preserved', () => {
		const flat = new Map<string, string | number | boolean>([
			['feature.enabled', true],
		]);
		assert.deepStrictEqual(unflattenManagedSettings(flat), {
			feature: { enabled: true },
		});
	});
});
