/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminalInstanceService';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('Workbench - TerminalInstanceService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let terminalInstanceService: ITerminalInstanceService;

	setup(async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		terminalInstanceService = store.add(instantiationService.createInstance(TerminalInstanceService));
	});

	suite('convertProfileToShellLaunchConfig', () => {
		test('should return an empty shell launch config when undefined is provided', () => {
			deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig(), {});
			deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig(undefined), {});
		});
		test('should return the same shell launch config when provided', () => {
			deepStrictEqual(
				terminalInstanceService.convertProfileToShellLaunchConfig({}),
				{}
			);
			deepStrictEqual(
				terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo' }),
				{ executable: '/foo' }
			);
			deepStrictEqual(
				terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }),
				{ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }
			);
			deepStrictEqual(
				terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo' }, '/bar'),
				{ executable: '/foo', cwd: '/bar' }
			);
			deepStrictEqual(
				terminalInstanceService.convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar' }, '/baz'),
				{ executable: '/foo', cwd: '/baz' }
			);
		});
		test('should convert a provided profile to a shell launch config', () => {
			deepStrictEqual(
				terminalInstanceService.convertProfileToShellLaunchConfig({
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
				terminalInstanceService.convertProfileToShellLaunchConfig({
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
				terminalInstanceService.convertProfileToShellLaunchConfig({
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
