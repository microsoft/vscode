/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as os from 'os';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStringDictionary } from 'vs/base/common/collections';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import { TestMessageService } from 'vs/test/utils/servicesTestUtils';

suite('Workbench - TerminalInstance', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IKeybindingService);
		instantiationService.stub(IMessageService, new TestMessageService());
	});

	test('TerminalInstance - createTerminalEnv', function () {
		const shell1 = {
			executable: '/bin/foosh',
			args: ['-bar', 'baz']
		};
		const parentEnv1: IStringDictionary<string> = <any>{
			ok: true
		};
		const env1 = TerminalInstance.createTerminalEnv(parentEnv1, shell1, null, 'en-au');
		assert.ok(env1['ok'], 'Parent environment is copied');
		assert.deepStrictEqual(parentEnv1, { ok: true }, 'Parent environment is unchanged');
		assert.equal(env1['PTYPID'], process.pid.toString(), 'PTYPID is equal to the current PID');
		assert.equal(env1['PTYSHELL'], '/bin/foosh', 'PTYSHELL is equal to the provided shell');
		assert.equal(env1['PTYSHELLARG0'], '-bar', 'PTYSHELLARG0 is equal to the first shell argument');
		assert.equal(env1['PTYSHELLARG1'], 'baz', 'PTYSHELLARG1 is equal to the first shell argument');
		assert.ok(!('PTYSHELLARG2' in env1), 'PTYSHELLARG2 is unset');
		assert.equal(env1['PTYCWD'], os.homedir(), 'PTYCWD is equal to the home folder');
		assert.equal(env1['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const shell2 = {
			executable: '/bin/foosh',
			args: []
		};
		const parentEnv2: IStringDictionary<string> = <any>{
			LANG: 'en_US.UTF-8'
		};
		const workspace2: IWorkspace = <any>{
			resource: {
				fsPath: '/my/dev/folder'
			}
		};
		const env2 = TerminalInstance.createTerminalEnv(parentEnv2, shell2, workspace2, 'en-au');
		assert.ok(!('PTYSHELLARG0' in env2), 'PTYSHELLARG0 is unset');
		assert.equal(env2['PTYCWD'], '/my/dev/folder', 'PTYCWD is equal to the workspace folder');
		assert.equal(env2['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const env3 = TerminalInstance.createTerminalEnv(parentEnv1, shell1, null, null);
		assert.ok(!('LANG' in env3), 'LANG is unset');

		const env4 = TerminalInstance.createTerminalEnv(parentEnv2, shell1, null, null);
		assert.equal(env4['LANG'], 'en_US.UTF-8', 'LANG is equal to the parent environment\'s LANG');
	});
});