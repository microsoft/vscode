/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectManagedSettingsDefinitions, hasManagedSettingsDefinitions, managedSettingValue, projectManagedSettings, pickManagedSettings } from '../../common/copilotManagedSettings.js';
import { PolicyDefinition } from '../../common/policy.js';

suite('Copilot managed settings projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const definitions: IStringDictionary<PolicyDefinition> = {
		PolicyA: {
			type: 'boolean',
			managedSettings: { 'permissions.disableBypassPermissionsMode': { type: 'string' } },
		},
		PolicyB: {
			type: 'number',
			managedSettings: { 'limits.maxFoo': { type: 'number' }, 'flags.enableBar': { type: 'boolean' } },
		},
		PolicyC: {
			type: 'string',
		},
	};

	test('collectManagedSettingsDefinitions aggregates declarations across all policies', () => {
		assert.deepStrictEqual(collectManagedSettingsDefinitions(definitions), {
			'permissions.disableBypassPermissionsMode': { type: 'string' },
			'limits.maxFoo': { type: 'number' },
			'flags.enableBar': { type: 'boolean' },
		});
	});

	test('collectManagedSettingsDefinitions returns empty when nothing is declared', () => {
		assert.deepStrictEqual(collectManagedSettingsDefinitions({ P: { type: 'string' } }), {});
	});

	test('hasManagedSettingsDefinitions detects whether any policy declares a managed key', () => {
		assert.deepStrictEqual(
			{
				withKeys: hasManagedSettingsDefinitions(definitions),
				none: hasManagedSettingsDefinitions({ P: { type: 'string' } }),
				empty: hasManagedSettingsDefinitions({}),
			},
			{ withKeys: true, none: false, empty: false },
		);
	});

	test('managedSettingValue locks to the managed value when set, else undefined', () => {
		const value = managedSettingValue('permissions.disableBypassPermissionsMode');
		assert.deepStrictEqual(
			{
				set: value({ managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } } as IPolicyData),
				otherKey: value({ managedSettings: { 'other.key': 'x' } } as IPolicyData),
				noBag: value({} as IPolicyData),
			},
			{ set: 'disable', otherKey: undefined, noBag: undefined },
		);
	});

	test('managedSettingValue returns the same memoized callback per key (stable reference identity)', () => {
		assert.strictEqual(
			managedSettingValue('permissions.disableBypassPermissionsMode'),
			managedSettingValue('permissions.disableBypassPermissionsMode'),
		);
		assert.notStrictEqual(
			managedSettingValue('permissions.disableBypassPermissionsMode'),
			managedSettingValue('some.other.key'),
		);
	});

	test('projectManagedSettings keeps declared+typed keys, drops undeclared and type-mismatched', () => {
		const projected = projectManagedSettings({
			'permissions.disableBypassPermissionsMode': 'disable', // declared string -> kept
			'limits.maxFoo': 5,                                    // declared number -> kept
			'flags.enableBar': 'true',                             // declared boolean, got string -> dropped
			'unknown.key': 'x',                                    // undeclared -> dropped
		}, collectManagedSettingsDefinitions(definitions));

		assert.deepStrictEqual(projected, {
			'permissions.disableBypassPermissionsMode': 'disable',
			'limits.maxFoo': 5,
		});
	});

	test('projectManagedSettings validates without coercing (string stays a string)', () => {
		assert.deepStrictEqual(
			projectManagedSettings(
				{ 'permissions.disableBypassPermissionsMode': 'false' },
				{ 'permissions.disableBypassPermissionsMode': { type: 'string' } },
			),
			{ 'permissions.disableBypassPermissionsMode': 'false' },
		);
	});

	test('projectManagedSettings warns once per type mismatch', () => {
		const warnings: string[] = [];
		projectManagedSettings(
			{ 'flags.enableBar': 'true' },
			{ 'flags.enableBar': { type: 'boolean' } },
			msg => warnings.push(msg),
		);
		assert.strictEqual(warnings.length, 1);
	});
});

suite('Copilot managed settings per-key precedence (pickManagedSettings)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('distinct keys each win from their highest-precedence channel; a lower channel fills a gap the higher ones leave', () => {
		// The headline per-key behavior: `shared` is contested by all three (native wins) while
		// `nativeOnly`/`serverOnly`/`fileOnly` are each supplied by a single channel and all survive.
		const pick = pickManagedSettings(
			{ 'shared': 'native', 'nativeOnly': 'n' },
			{ 'shared': 'server', 'serverOnly': 's' },
			{ 'shared': 'file', 'fileOnly': 'f' },
		);
		assert.deepStrictEqual(pick.values, { 'shared': 'native', 'nativeOnly': 'n', 'serverOnly': 's', 'fileOnly': 'f' });
		assert.deepStrictEqual(pick.activeSources, ['nativeMdm', 'server', 'file']);
		assert.deepStrictEqual(pick.resolutions.get('shared'), {
			value: 'native',
			source: 'nativeMdm',
			contributions: [
				{ channel: 'nativeMdm', value: 'native' },
				{ channel: 'server', value: 'server' },
				{ channel: 'file', value: 'file' },
			],
		});
	});

	test('with native absent, the mid-tier server wins a contested key over file', () => {
		const pick = pickManagedSettings(undefined, { 'k': 'server' }, { 'k': 'file' });
		assert.deepStrictEqual(pick.resolutions.get('k'), {
			value: 'server',
			source: 'server',
			contributions: [
				{ channel: 'server', value: 'server' },
				{ channel: 'file', value: 'file' },
			],
		});
		assert.deepStrictEqual(pick.activeSources, ['server']);
	});

	test('falsy-but-present values are real contributions and win over a lower channel', () => {
		// `false`, `0` and `''` must not be mistaken for "unset" — a higher channel that sets them
		// still locks the key against a lower channel's value.
		const pick = pickManagedSettings(
			{ 'flag': false, 'count': 0, 'name': '' },
			undefined,
			{ 'flag': true, 'count': 99, 'name': 'lower' },
		);
		assert.deepStrictEqual(pick.values, { 'flag': false, 'count': 0, 'name': '' });
		assert.deepStrictEqual(pick.activeSources, ['nativeMdm']);
	});

	test('an explicit `undefined` hole in a higher channel falls through to a lower channel', () => {
		// A key present-but-undefined is skipped, so a lower channel can supply it.
		const pick = pickManagedSettings(
			{ 'a': undefined as unknown as string, 'b': 'native' },
			{ 'a': 'server' },
			undefined,
		);
		assert.deepStrictEqual(pick.values, { 'a': 'server', 'b': 'native' });
		assert.strictEqual(pick.resolutions.get('a')!.source, 'server');
	});

	test('the merged bag is a fresh object, never an alias of an input channel bag', () => {
		// AccountPolicyService projects `pick.values` directly, relying on it not aliasing/mutating a
		// channel's bag.
		const native = { 'a': 'native' };
		const pick = pickManagedSettings(native, undefined, undefined);
		assert.notStrictEqual(pick.values, native);
		assert.deepStrictEqual(pick.values, { 'a': 'native' });
	});

	test('empty/absent channels contribute nothing and activeSources skips a non-contributing middle channel', () => {
		assert.deepStrictEqual(
			{
				partial: pickManagedSettings({}, { 'b': 'server' }, undefined),
				// native + file contribute, server does not — activeSources must skip the gap.
				gap: pickManagedSettings({ 'x': 'n' }, undefined, { 'y': 'f' }).activeSources,
				allUndefined: pickManagedSettings(undefined, undefined, undefined),
				allEmpty: pickManagedSettings({}, {}, {}),
			},
			{
				partial: { values: { 'b': 'server' }, resolutions: new Map([['b', { value: 'server', source: 'server', contributions: [{ channel: 'server', value: 'server' }] }]]), activeSources: ['server'] },
				gap: ['nativeMdm', 'file'],
				allUndefined: { values: {}, resolutions: new Map(), activeSources: [] },
				allEmpty: { values: {}, resolutions: new Map(), activeSources: [] },
			},
		);
	});

	test('a malicious `__proto__` key does not pollute any prototype chain', () => {
		// Simulates a JSON-parsed bag carrying an own `__proto__` key with an object value (the
		// classic prototype-pollution vector). Merging it must neither pollute Object.prototype nor
		// corrupt the returned bag's own prototype.
		const malicious = JSON.parse('{ "__proto__": { "polluted": true } }') as Record<string, string>;
		const pick = pickManagedSettings(malicious, undefined, undefined);
		assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
		assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
		assert.strictEqual(Object.getPrototypeOf(pick.values), Object.prototype);
	});
});
