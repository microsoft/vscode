/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as os from 'os';
import Uri from 'vs/base/common/uri';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStringDictionary } from 'vs/base/common/collections';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import { IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TestMessageService, TestContextService, TestHistoryService } from 'vs/workbench/test/workbenchTestServices';
import { MockContextKeyService, MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

class TestTerminalInstance extends TerminalInstance {
	public _getCwd(shell: IShellLaunchConfig, root: Uri): string {
		return super._getCwd(shell, root);
	}

	protected _createProcess(): void { }
	protected _createXterm(): void { }
}

suite('Workbench - TerminalInstance', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IMessageService, new TestMessageService());
		instantiationService.stub(IHistoryService, new TestHistoryService());
	});

	test('TerminalInstance - createTerminalEnv', function () {
		const shell1 = {
			executable: '/bin/foosh',
			args: ['-bar', 'baz']
		};
		const parentEnv1: IStringDictionary<string> = <any>{
			ok: true
		};
		const env1 = TerminalInstance.createTerminalEnv(parentEnv1, shell1, '/foo', 'en-au');
		assert.ok(env1['ok'], 'Parent environment is copied');
		assert.deepStrictEqual(parentEnv1, { ok: true }, 'Parent environment is unchanged');
		assert.equal(env1['PTYPID'], process.pid.toString(), 'PTYPID is equal to the current PID');
		assert.equal(env1['PTYSHELL'], '/bin/foosh', 'PTYSHELL is equal to the provided shell');
		assert.equal(env1['PTYSHELLARG0'], '-bar', 'PTYSHELLARG0 is equal to the first shell argument');
		assert.equal(env1['PTYSHELLARG1'], 'baz', 'PTYSHELLARG1 is equal to the first shell argument');
		assert.ok(!('PTYSHELLARG2' in env1), 'PTYSHELLARG2 is unset');
		assert.equal(env1['PTYCWD'], '/foo', 'PTYCWD is equal to requested cwd');
		assert.equal(env1['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const shell2 = {
			executable: '/bin/foosh',
			args: []
		};
		const parentEnv2: IStringDictionary<string> = <any>{
			LANG: 'en_US.UTF-8'
		};
		const env2 = TerminalInstance.createTerminalEnv(parentEnv2, shell2, '/foo', 'en-au');
		assert.ok(!('PTYSHELLARG0' in env2), 'PTYSHELLARG0 is unset');
		assert.equal(env2['PTYCWD'], '/foo', 'PTYCWD is equal to /foo');
		assert.equal(env2['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const env3 = TerminalInstance.createTerminalEnv(parentEnv1, shell1, '/', null);
		assert.equal(env3['LANG'], 'en_US.UTF-8', 'LANG is equal to en_US.UTF-8 as fallback.'); // More info on issue #14586

		const env4 = TerminalInstance.createTerminalEnv(parentEnv2, shell1, '/', null);
		assert.equal(env4['LANG'], 'en_US.UTF-8', 'LANG is equal to the parent environment\'s LANG');
	});

	suite('_getCwd', () => {
		let instance: TestTerminalInstance;
		let instantiationService: TestInstantiationService;
		let configHelper: { config: { cwd: string } };

		setup(() => {
			let contextKeyService = new MockContextKeyService();
			let keybindingService = new MockKeybindingService();
			let terminalFocusContextKey = contextKeyService.createKey('test', false);
			instantiationService = new TestInstantiationService();
			instantiationService.stub(IMessageService, new TestMessageService());
			instantiationService.stub(IWorkspaceContextService, new TestContextService());
			instantiationService.stub(IKeybindingService, keybindingService);
			instantiationService.stub(IContextKeyService, contextKeyService);
			instantiationService.stub(IHistoryService, new TestHistoryService());
			configHelper = {
				config: {
					cwd: null
				}
			};
			instance = instantiationService.createInstance(TestTerminalInstance, terminalFocusContextKey, configHelper, null, null);
		});

		// This helper checks the paths in a cross-platform friendly manner
		function assertPathsMatch(a: string, b: string): void {
			assert.equal(Uri.file(a).fsPath, Uri.file(b).fsPath);
		}

		test('should default to os.homedir() for an empty workspace', () => {
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, null), os.homedir());
		});

		test('should use to the workspace if it exists', () => {
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, Uri.file('/foo')), '/foo');
		});

		test('should use an absolute custom cwd as is', () => {
			configHelper.config.cwd = '/foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, null), '/foo');
		});

		test('should normalize a relative custom cwd against the workspace path', () => {
			configHelper.config.cwd = 'foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, Uri.file('/bar')), '/bar/foo');
			configHelper.config.cwd = './foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, Uri.file('/bar')), '/bar/foo');
			configHelper.config.cwd = '../foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, Uri.file('/bar'), ), '/foo');
		});

		test('should fall back for relative a custom cwd that doesn\'t have a workspace', () => {
			configHelper.config.cwd = 'foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, null), os.homedir());
			configHelper.config.cwd = './foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, null), os.homedir());
			configHelper.config.cwd = '../foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [] }, null), os.homedir());
		});

		test('should ignore custom cwd when told to ignore', () => {
			configHelper.config.cwd = '/foo';
			assertPathsMatch(instance._getCwd({ executable: null, args: [], ignoreConfigurationCwd: true }, Uri.file('/bar')), '/bar');
		});
	});
});