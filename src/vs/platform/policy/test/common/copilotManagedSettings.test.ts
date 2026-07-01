/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectManagedSettingsDefinitions, hasManagedSettingsDefinitions, managedSettingValue, projectManagedSettings, selectManagedSettings } from '../../common/copilotManagedSettings.js';
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

	test('selectManagedSettings: native MDM wins over server and file, never merged', () => {
		const selection = selectManagedSettings(
			{ 'permissions.y': 'native' },
			{ 'permissions.x': 'server' },
			{ 'permissions.z': 'file' },
		);
		assert.deepStrictEqual(selection, { source: 'nativeMdm', values: { 'permissions.y': 'native' } });
	});

	test('selectManagedSettings: falls through to server when native MDM is absent or empty', () => {
		const fromUndefined = selectManagedSettings(undefined, { 'permissions.x': 'server' }, undefined);
		const fromEmptyObject = selectManagedSettings({}, { 'permissions.x': 'server' }, undefined);
		assert.deepStrictEqual(fromUndefined, { source: 'server', values: { 'permissions.x': 'server' } });
		assert.deepStrictEqual(fromEmptyObject, { source: 'server', values: { 'permissions.x': 'server' } });
	});

	test('selectManagedSettings: falls through to file when native MDM and server are absent or empty', () => {
		const fromUndefined = selectManagedSettings(undefined, undefined, { 'permissions.z': 'file' });
		const fromEmptyObjects = selectManagedSettings({}, {}, { 'permissions.z': 'file' });
		assert.deepStrictEqual(fromUndefined, { source: 'file', values: { 'permissions.z': 'file' } });
		assert.deepStrictEqual(fromEmptyObjects, { source: 'file', values: { 'permissions.z': 'file' } });
	});

	test('selectManagedSettings: reports `none` with no values when every channel is empty', () => {
		assert.deepStrictEqual(selectManagedSettings(undefined, undefined, undefined), { source: 'none', values: undefined });
		assert.deepStrictEqual(selectManagedSettings({}, {}, {}), { source: 'none', values: undefined });
	});
});
