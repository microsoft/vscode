/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { convertProfileToShellLaunchConfig } from 'vs/workbench/contrib/terminal/browser/terminalService';
import { URI } from 'vs/base/common/uri';

suite('Workbench - TerminalService', () => {
	suite('convertProfileToShellLaunchConfig', () => {
		test('should return an empty shell launch config when undefined is provided', () => {
			deepStrictEqual(convertProfileToShellLaunchConfig(), {});
			deepStrictEqual(convertProfileToShellLaunchConfig(undefined), {});
		});
		test('should return the same shell launch config when provided', () => {
			deepStrictEqual(
				convertProfileToShellLaunchConfig({}),
				{}
			);
			deepStrictEqual(
				convertProfileToShellLaunchConfig({ executable: '/foo' }),
				{ executable: '/foo' }
			);
			deepStrictEqual(
				convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }),
				{ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }
			);
			deepStrictEqual(
				convertProfileToShellLaunchConfig({ executable: '/foo' }, '/bar'),
				{ executable: '/foo', cwd: '/bar' }
			);
			deepStrictEqual(
				convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar' }, '/baz'),
				{ executable: '/foo', cwd: '/baz' }
			);
		});
		test('should convert a provided profile to a shell launch config', () => {
			deepStrictEqual(
				convertProfileToShellLaunchConfig({
					profileName: 'abc',
					path: '/foo',
					isDefault: true
				}),
				{
					args: undefined,
					color: undefined,
					cwd: undefined,
					env: undefined,
					executable: '/foo',
					icon: undefined,
					name: undefined
				}
			);
			const icon = URI.file('/icon');
			deepStrictEqual(
				convertProfileToShellLaunchConfig({
					profileName: 'abc',
					path: '/foo',
					isDefault: true,
					args: ['a', 'b'],
					color: 'color',
					env: { test: 'TEST' },
					icon
				} as ITerminalProfile, '/bar'),
				{
					args: ['a', 'b'],
					color: 'color',
					cwd: '/bar',
					env: { test: 'TEST' },
					executable: '/foo',
					icon,
					name: undefined
				}
			);
		});
		test('should respect overrideName in profile', () => {
			deepStrictEqual(
				convertProfileToShellLaunchConfig({
					profileName: 'abc',
					path: '/foo',
					isDefault: true,
					overrideName: true
				}),
				{
					args: undefined,
					color: undefined,
					cwd: undefined,
					env: undefined,
					executable: '/foo',
					icon: undefined,
					name: 'abc'
				}
			);
		});
	});
});
