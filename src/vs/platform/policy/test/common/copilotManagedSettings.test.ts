/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectManagedSettingsDefinitions, projectManagedSettings } from '../../common/copilotManagedSettings.js';
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
