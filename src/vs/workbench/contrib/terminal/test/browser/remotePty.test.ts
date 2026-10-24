/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import type { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import type { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemotePty } from '../../browser/remotePty.js';
import type { RemoteTerminalChannelClient } from '../../common/remote/remoteTerminalChannel.js';

suite('RemotePty', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createStartedPty(resizes: [number, number][]): Promise<RemotePty> {
		const channel = {
			start: async () => undefined,
			resize: (_id: number, cols: number, rows: number) => { resizes.push([cols, rows]); },
		} as unknown as RemoteTerminalChannelClient;
		const remoteAgentService = {
			getEnvironment: async () => ({}),
		} as unknown as IRemoteAgentService;
		const logService: ITerminalLogService = new class extends NullLogService { readonly _logBrand = undefined; };
		const pty = store.add(new RemotePty(1, false, channel, remoteAgentService, logService));
		await pty.start();
		return pty;
	}

	test('resize dedupes identical consecutive sizes', async () => {
		const resizes: [number, number][] = [];
		const pty = await createStartedPty(resizes);
		pty.resize(80, 30);
		pty.resize(80, 30);
		await timeout(0);
		assert.deepStrictEqual(resizes, [[80, 30]]);
	});

	test('resize forwards the final size of an A-B-A sequence issued within one turn', async () => {
		const resizes: [number, number][] = [];
		const pty = await createStartedPty(resizes);
		pty.resize(80, 30);
		await timeout(0);
		// Mimics showing a hidden maximized panel: full -> restored -> full without yielding
		pty.resize(80, 30);
		pty.resize(80, 15);
		pty.resize(80, 30);
		await timeout(0);
		assert.deepStrictEqual(resizes, [[80, 30], [80, 15], [80, 30]]);
	});
});
