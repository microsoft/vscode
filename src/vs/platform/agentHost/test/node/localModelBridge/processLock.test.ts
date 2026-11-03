/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { acquireProcessLock, clearStaleProcessLock, type IProcessLock, type IProcessLockOptions } from '../../../node/copilot/localModelBridge/shim/processLock.js';

suite('localModel process lock', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let scope: string;
	const locks: IProcessLock[] = [];
	setup(async () => {
		scope = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-process-lock-'));
	});
	teardown(async () => {
		locks.splice(0).forEach(lock => lock.dispose());
		await fs.promises.rm(scope, { recursive: true, force: true });
	});

	async function acquire(type: string, options?: IProcessLockOptions, scopeDir = scope): Promise<string> {
		const lock = await acquireProcessLock(scopeDir, type, options);
		if (typeof lock === 'string') {
			return lock;
		}
		locks.push(lock);
		return 'acquired';
	}

	/** Seams that record every step: the handle is always in use, and probing it answers `answer()` (`undefined`: something answered). */
	function inUse(platform: NodeJS.Platform, answer: () => string | undefined) {
		const steps: string[] = [];
		const handles = new Set<string>();
		const options: IProcessLockOptions = {
			platform,
			listen: async handle => {
				handles.add(handle);
				steps.push('listen');
				return undefined;
			},
			probe: async handle => {
				handles.add(handle);
				steps.push(`probe:${answer() ?? 'answered'}`);
				return answer();
			},
			unlink: async file => {
				handles.add(file);
				steps.push('unlink');
			},
		};
		return { steps, handles, options };
	}

	test('one holder per handle, in this process too; released locks can be taken again', async () => {
		const first = await acquire('lmtst');
		const second = await acquire('lmtst');
		const otherType = await acquire('lmoth');
		locks.shift()!.dispose();
		const afterRelease = await acquire('lmtst');
		assert.deepStrictEqual({ first, second, otherType, afterRelease }, { first: 'acquired', second: 'busy', otherType: 'acquired', afterRelease: 'acquired' });
	});

	(isWindows ? test : test.skip)('Windows: every spelling of one directory shares the lock', async () => {
		const first = await acquire('lmtst');
		const upperCase = await acquire('lmtst', undefined, scope.toUpperCase());
		const lowerCaseSlashes = await acquire('lmtst', undefined, scope.toLowerCase().replace(/\\/g, '/'));
		assert.deepStrictEqual({ first, upperCase, lowerCaseSlashes }, { first: 'acquired', upperCase: 'busy', lowerCaseSlashes: 'busy' });
	});

	test('Linux: an abstract socket, so no file is created and nothing is ever probed or unlinked', async () => {
		const { steps, handles, options } = inUse('linux', () => 'ECONNREFUSED');
		const result = await acquire('lmtst', options);
		const cleared = await clearStaleProcessLock(scope, 'lmtst', options);
		assert.deepStrictEqual({ result, cleared, steps, handles: [...handles].map(handle => handle.replace(/[0-9a-f]{16}/, '<hash>')), files: await fs.promises.readdir(scope) }, {
			result: 'busy',
			cleared: true,
			steps: ['listen'],
			handles: ['\0vscode-<hash>-1-lmtst'],
			files: [],
		});
	});

	test('macOS: a socket file nobody answers on is stale and never removed while acquiring; clearing removes it only while nothing answers', async () => {
		let answer: string | undefined = 'ECONNREFUSED';
		const { steps, handles, options } = inUse('darwin', () => answer);
		const stale = await acquire('lmtst', options);
		const cleared = await clearStaleProcessLock(scope, 'lmtst', options);
		answer = undefined;
		const live = await acquire('lmtst', options);
		const refused = await clearStaleProcessLock(scope, 'lmtst', options);
		assert.deepStrictEqual({ stale, cleared, live, refused, steps, handles: handles.size }, {
			stale: 'stale',
			cleared: true,
			live: 'busy',
			refused: false,
			steps: ['listen', 'probe:ECONNREFUSED', 'probe:ECONNREFUSED', 'unlink', 'listen', 'probe:answered', 'probe:answered'],
			handles: 1,
		});
	});
});

