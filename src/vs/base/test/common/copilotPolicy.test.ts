/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils/testUtils.js';
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

	test('prototype pollution keys are skipped', () => {
		const flat = new Map<string, string | number | boolean>([
			['__proto__.polluted', 'yes'],
			['constructor.polluted', 'yes'],
			['prototype.polluted', 'yes'],
			['safe.key', 'value'],
		]);
		const result = unflattenManagedSettings(flat);
		assert.deepStrictEqual(result, { safe: { key: 'value' } });
		// Verify Object.prototype was not polluted
		assert.strictEqual((Object.prototype as Record<string, unknown>)['polluted'], undefined);
	});

	test('prototype poison in nested segments is skipped', () => {
		const flat = new Map<string, string | number | boolean>([
			['permissions.__proto__.bad', 'yes'],
		]);
		assert.deepStrictEqual(unflattenManagedSettings(flat), {});
	});
});
