/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { IShellLaunchConfig, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { TerminalService } from 'vs/workbench/contrib/terminal/browser/terminalService';
import { URI } from 'vs/base/common/uri';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestLifecycleService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceHost, ITerminalInstanceService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Emitter } from 'vs/base/common/event';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';

class TestTerminalInstanceHost implements ITerminalInstanceHost {
	activeInstance: ITerminalInstance | undefined = undefined;
	instances: readonly ITerminalInstance[] = [];
	onDidChangeInstances = new Emitter<void>().event;
	onDidDisposeInstance = new Emitter<ITerminalInstance>().event;
	onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>().event;
	onDidFocusInstance = new Emitter<ITerminalInstance>().event;
	setActiveInstance(instance: ITerminalInstance): void {
		throw new Error('Method not implemented.');
	}
	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
		throw new Error('Method not implemented.');
	}
}

class TestTerminalService extends TerminalService {
	convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig {
		return this._convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile, cwd);
	}
}

suite('Workbench - TerminalService', () => {
	let instantiationService: TestInstantiationService;
	let terminalService: TestTerminalService;

	setup(async () => {
		const configurationService = new TestConfigurationService({
			terminal: {
				integrated: {
					fontWeight: 'normal'
				}
			}
		});

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(ITerminalEditorService, new TestTerminalInstanceHost());
		instantiationService.stub(ITerminalGroupService, new TestTerminalInstanceHost());
		instantiationService.stub(ITerminalGroupService, 'onDidChangeActiveGroup', new Emitter().event);
		instantiationService.stub(ITerminalInstanceService, {});
		instantiationService.stub(ITerminalInstanceService, 'onDidCreateInstance', new Emitter().event);
		instantiationService.stub(ITerminalProfileService, {});
		instantiationService.stub(ITerminalProfileService, 'onDidChangeAvailableProfiles', new Emitter().event);

		terminalService = instantiationService.createInstance(TestTerminalService);
		instantiationService.stub(ITerminalService, terminalService);
	});

	suite('convertProfileToShellLaunchConfig', () => {
		test('should return an empty shell launch config when undefined is provided', () => {
			deepStrictEqual(terminalService.convertProfileToShellLaunchConfig(), {});
			deepStrictEqual(terminalService.convertProfileToShellLaunchConfig(undefined), {});
		});
		test('should return the same shell launch config when provided', () => {
			deepStrictEqual(
				terminalService.convertProfileToShellLaunchConfig({}),
				{}
			);
			deepStrictEqual(
				terminalService.convertProfileToShellLaunchConfig({ executable: '/foo' }),
				{ executable: '/foo' }
			);
			deepStrictEqual(
				terminalService.convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }),
				{ executable: '/foo', cwd: '/bar', args: ['a', 'b'] }
			);
			deepStrictEqual(
				terminalService.convertProfileToShellLaunchConfig({ executable: '/foo' }, '/bar'),
				{ executable: '/foo', cwd: '/bar' }
			);
			deepStrictEqual(
				terminalService.convertProfileToShellLaunchConfig({ executable: '/foo', cwd: '/bar' }, '/baz'),
				{ executable: '/foo', cwd: '/baz' }
			);
		});
		test('should convert a provided profile to a shell launch config', () => {
			deepStrictEqual(
				terminalService.convertProfileToShellLaunchConfig({
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
				terminalService.convertProfileToShellLaunchConfig({
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
				terminalService.convertProfileToShellLaunchConfig({
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
