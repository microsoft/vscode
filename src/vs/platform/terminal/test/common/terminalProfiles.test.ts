/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Codicon } from '../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITerminalProfile } from '../../common/terminal.js';
import { createProfileSchemaEnums } from '../../common/terminalProfiles.js';

suite('terminalProfiles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('createProfileSchemaEnums', () => {
		test('should return an empty array when there are no profiles', () => {
			deepStrictEqual(createProfileSchemaEnums([]), {
				values: [
					null
				],
				markdownDescriptions: [
					'Automatically detect the default'
				]
			});
		});
		test('should return a single entry when there is one profile', () => {
			const profile: ITerminalProfile = {
				profileName: 'name',
				path: 'path',
				isDefault: true
			};
			deepStrictEqual(createProfileSchemaEnums([profile]), {
				values: [
					null,
					'name'
				],
				markdownDescriptions: [
					'Automatically detect the default',
					'$(terminal) name\n- path: path'
				]
			});
		});
		test('should show all profile information', () => {
			const profile: ITerminalProfile = {
				profileName: 'name',
				path: 'path',
				isDefault: true,
				args: ['a', 'b'],
				color: 'terminal.ansiRed',
				env: {
					c: 'd',
					e: 'f'
				},
				icon: Codicon.zap,
				overrideName: true
			};
			deepStrictEqual(createProfileSchemaEnums([profile]), {
				values: [
					null,
					'name'
				],
				markdownDescriptions: [
					'Automatically detect the default',
					`$(zap) name\n- path: path\n- args: ['a','b']\n- overrideName: true\n- color: terminal.ansiRed\n- env: {\"c\":\"d\",\"e\":\"f\"}`
				]
			});
		});
		test('should return a multiple entries when there are multiple profiles', () => {
			const profile1: ITerminalProfile = {
				profileName: 'name',
				path: 'path',
				isDefault: true
			};
			const profile2: ITerminalProfile = {
				profileName: 'foo',
				path: 'bar',
				isDefault: false
			};
			deepStrictEqual(createProfileSchemaEnums([profile1, profile2]), {
				values: [
					null,
					'name',
					'foo'
				],
				markdownDescriptions: [
					'Automatically detect the default',
					'$(terminal) name\n- path: path',
					'$(terminal) foo\n- path: bar'
				]
			});
		});
	});
});
