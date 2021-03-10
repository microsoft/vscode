/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import { normalize } from 'path';
import { isWindows } from 'vs/base/common/platform';
import { ITerminalProfile } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectAvailableShells, IStatProvider } from 'vs/workbench/contrib/terminal/node/terminalProfiles';

suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableShells', () => {
		if (isWindows) {
			suite('detectAvailableWindowsShells', async () => {
				test('should detect cmd prompt', async () => {
					const _path = 'C:\\Windows\\System32\\cmd.exe';
					const _stat = await fs.promises.stat(normalize(_path));
					const _lstat = await fs.promises.lstat(normalize(_path));
					const statProvider = { stat: _stat, lstat: _lstat } as IStatProvider;
					const shells = await detectAvailableShells(statProvider, undefined);
					const expected = [{ profileName: 'Cmd Prompt', path: _path, args: undefined }];
					assert.deepStrictEqual(shells, expected);
				});
				test('should detect cygwin and provide args', async () => {
					const _path = 'C:\\cygwin64\\bin\\bash.exe';
					const _stat = await fs.promises.stat(normalize(_path));
					const _lstat = await fs.promises.lstat(normalize(_path));
					const statProvider = { stat: _stat, lstat: _lstat } as IStatProvider;
					const shells = await detectAvailableShells(statProvider, undefined) as ITerminalProfile[];
					const expected = [{ profileName: 'Cygwin', path: _path, args: ['-l'] } as ITerminalProfile];
					assert.deepStrictEqual(shells, expected);
				});
			});
		} else {
			suite('detectAvailableUnixShells', async () => {
				test('should detect unix shells', async () => {
					const shells = ['# /etc/shells: valid login shells',
						'/bin/sh',
						'/bin/bash',
						'/usr/bin/bash',
						'/bin/rbash',
						'/usr/bin/rbash',
						'/bin/dash',
						'/usr/bin/dash',
						'/usr/bin/tmux',
						'/usr/bin/screen',
						'/bin/zsh',
						'/usr/bin/zsh',
						'/usr/bin/fish'].join('\n');
					const shell = await detectAvailableShells(undefined, shells);
					const expected = [
						{ profileName: 'sh', path: '/bin/sh' },
						{ profileName: 'bash', path: '/bin/bash' },
						{ profileName: 'bash', path: '/usr/bin/bash' },
						{ profileName: 'rbash', path: '/bin/rbash' },
						{ profileName: 'rbash', path: '/usr/bin/rbash' },
						{ profileName: 'dash', path: '/bin/dash' },
						{ profileName: 'dash', path: '/usr/bin/dash' },
						{ profileName: 'tmux', path: '/usr/bin/tmux' },
						{ profileName: 'screen', path: '/usr/bin/screen' },
						{ profileName: 'zsh', path: '/bin/zsh' },
						{ profileName: 'zsh', path: '/usr/bin/zsh' },
						{ profileName: 'fish', path: '/usr/bin/fish' },
					];
					assert.deepStrictEqual(shell, expected);
				});
			});
		}
	});
});
