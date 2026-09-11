/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITerminalProcessOptions, ProcessPropertyType } from '../../common/terminal.js';
import { PersistentTerminalProcess, XtermSerializer } from '../../node/ptyService.js';
import { TerminalProcess } from '../../node/terminalProcess.js';

suite('PtyService', () => {
	const testContext = ensureNoDisposablesAreLeakedInTestSuite();

	const processOptions: ITerminalProcessOptions = {
		shellIntegration: { enabled: false, suggestEnabled: false, nonce: 'test-nonce' },
		windowsUseConptyDll: false,
		environmentVariableCollections: undefined,
		workspaceFolder: undefined,
		isScreenReaderOptimized: false,
	};

	class TestTerminalProcess extends TerminalProcess {
		override async start(): Promise<undefined> {
			return undefined;
		}
	}

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

	test('should publish extension ownership before replay', async () => {
		const store = testContext.add(new DisposableStore());
		const logService = new NullLogService();
		const productService = { _serviceBrand: undefined, ...product } satisfies IProductService;
		const shellLaunchConfig = {
			executable: process.execPath,
			isExtensionOwnedTerminal: true,
		};
		const environment = { ...process.env };

		const createPersistentProcess = (id: number, isRevived: boolean): PersistentTerminalProcess => {
			const terminalProcess = store.add(new TestTerminalProcess(
				shellLaunchConfig,
				process.cwd(),
				80,
				30,
				environment,
				environment,
				processOptions,
				logService,
				productService
			));
			return store.add(new PersistentTerminalProcess(
				id,
				terminalProcess,
				'workspace',
				'workspace',
				true,
				80,
				30,
				{ env: environment, executableEnv: environment, options: processOptions },
				'6',
				{ graceTime: 60000, shortGraceTime: 60000, scrollback: 100 },
				logService,
				isRevived ? 'restored' : undefined,
				undefined
			));
		};

		const getReplayOrder = async (persistentProcess: PersistentTerminalProcess): Promise<string[]> => {
			const listenerStore = new DisposableStore();
			const order: string[] = [];
			try {
				const replay = new Promise<void>(resolve => {
					listenerStore.add(persistentProcess.onDidChangeProperty(e => {
						if (e.type === ProcessPropertyType.IsExtensionOwnedTerminal) {
							order.push('isExtensionOwnedTerminal');
						}
					}));
					listenerStore.add(persistentProcess.onProcessReplay(() => {
						order.push('replay');
						resolve();
					}));
				});
				const result = await persistentProcess.start();
				deepStrictEqual(result, undefined);
				await replay;
				return order;
			} finally {
				listenerStore.dispose();
			}
		};

		const reattachedProcess = createPersistentProcess(1, false);
		const launchResult = await reattachedProcess.start();
		deepStrictEqual(launchResult, undefined);

		deepStrictEqual({
			reattach: await getReplayOrder(reattachedProcess),
			revive: await getReplayOrder(createPersistentProcess(2, true)),
		}, {
			reattach: ['isExtensionOwnedTerminal', 'replay'],
			revive: ['isExtensionOwnedTerminal', 'replay'],
		});
	});
});
