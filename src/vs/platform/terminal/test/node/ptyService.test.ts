/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IReconnectConstants, ISerializedTerminalState, IShellLaunchConfig, TitleEventSource } from '../../common/terminal.js';
import { PtyService } from '../../node/ptyService.js';

suite('PtyService process revival', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reconnect-only owners are not relaunched while ordinary terminal revival is preserved', async () => {
		const launched: string[] = [];
		const service = store.add(new class extends PtyService {
			override async createProcess(config: IShellLaunchConfig): Promise<number> {
				launched.push(config.executable!);
				return launched.length;
			}
		}(new NullLogService(), new class extends mock<IProductService>() { }(), upcastPartial<IReconnectConstants>({}), 0));
		const state = (id: number, executable: string, canRevive?: boolean): ISerializedTerminalState => ({
			id,
			shellLaunchConfig: { executable, reconnectionProperties: { ownerId: 'test', canRevive } },
			processDetails: upcastPartial<ISerializedTerminalState['processDetails']>({
				cwd: '/repo', title: executable, titleSource: TitleEventSource.Process, workspaceId: 'workspace', workspaceName: 'Workspace',
			}),
			processLaunchConfig: { env: {}, executableEnv: {}, options: upcastPartial<ISerializedTerminalState['processLaunchConfig']['options']>({}) },
			unicodeVersion: '11',
			replayEvent: { events: [{ cols: 80, rows: 24, data: '' }], commands: { isWindowsPty: false, hasRichCommandDetection: false, commands: [], promptInputModel: undefined } },
			timestamp: 0,
		});
		await service.reviveTerminalProcesses('workspace', [
			state(1, 'native-agent', false),
			state(2, 'shell'),
			state(3, 'another-shell', true),
		], 'en');
		assert.deepStrictEqual(launched, ['shell', 'another-shell']);
	});
});
