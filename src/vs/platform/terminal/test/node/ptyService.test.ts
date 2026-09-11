/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { XtermSerializer } from '../../node/ptyService.js';

suite('PtyService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function serializeCommands(allowUntrustedCwd: boolean, cwdNonce: string = ''): Promise<{ cwd: string | undefined; exitCode: number | undefined }[]> {
		const nonce = 'test-nonce';
		const serializer = new XtermSerializer(80, 30, 100, '6', undefined, nonce, allowUntrustedCwd, undefined, new NullLogService());
		const sequence = (value: string) => `\x1b]633;${value}\x07`;
		serializer.handleData([
			sequence('P;HasRichCommandDetection=True'),
			sequence('A'),
			sequence(`P;Cwd=/workspace/one${cwdNonce}`),
			sequence('B'),
			'echo one',
			sequence('E;echo one'),
			sequence('C'),
			'one\r\n',
			sequence('D;0'),
			sequence('A'),
			sequence(`P;Cwd=/workspace/two${cwdNonce}`),
			sequence('B'),
			'echo two',
			sequence('E;echo two'),
		].join(''));
		try {
			await timeout(0);
			const replay = await serializer.generateReplayEvent();
			return replay.commands.commands.map(command => ({
				cwd: command.cwd,
				exitCode: command.exitCode,
			}));
		} finally {
			serializer.dispose();
		}
	}

	test('should preserve extension-owned CWD metadata during serialization', async () => {
		deepStrictEqual(await serializeCommands(true), [
			{ cwd: '/workspace/one', exitCode: 0 },
			{ cwd: '/workspace/two', exitCode: undefined },
		]);
	});

	test('should require a nonce for ordinary process CWD metadata', async () => {
		deepStrictEqual(await serializeCommands(false), [
			{ cwd: undefined, exitCode: 0 },
			{ cwd: undefined, exitCode: undefined },
		]);
		deepStrictEqual(await serializeCommands(false, ';test-nonce'), [
			{ cwd: '/workspace/one', exitCode: 0 },
			{ cwd: '/workspace/two', exitCode: undefined },
		]);
	});
});
