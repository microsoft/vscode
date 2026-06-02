/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { promiseWithResolvers, timeout } from '../../../../base/common/async.js';
import { AbstractExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ExtHostExtensionService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('terminate keeps RPC alive during extension deactivation', async () => {
		const log: string[] = [];
		const deactivation = promiseWithResolvers<void>();
		const exited = promiseWithResolvers<void>();

		interface ITerminateHarness {
			terminate(reason: string, code?: number): void;
			_isTerminating: boolean;
			_logService: {
				info: (message: string) => void;
				flush: () => void;
				dispose: () => void;
				error: (message: unknown) => void;
			};
			_extHostTerminalService: { dispose: () => void };
			_activator: { dispose: () => void };
			_extHostContext: { dispose: () => void };
			_deactivateAll: () => Promise<void>;
			_hostUtils: { pid: number | undefined; exit: (code: number) => void };
		}

		const service = Object.create(AbstractExtHostExtensionService.prototype) as ITerminateHarness;
		service._isTerminating = false;
		service._logService = {
			info: message => log.push(`info:${message}`),
			flush: () => log.push('flush'),
			dispose: () => log.push('log:dispose'),
			error: _message => log.push('error')
		};
		service._extHostTerminalService = {
			dispose: () => log.push('terminal:dispose')
		};
		service._activator = {
			dispose: () => log.push('activator:dispose')
		};
		service._extHostContext = {
			dispose: () => log.push('rpc:dispose')
		};
		service._deactivateAll = async () => {
			log.push('deactivate:start');
			await deactivation.promise;
			log.push('deactivate:done');
		};
		service._hostUtils = {
			pid: undefined,
			exit: (_code: number) => {
				log.push('host:exit');
				exited.resolve();
			}
		};

		service.terminate('test-shutdown', 0);
		await timeout(0);

		assert.strictEqual(log.includes('deactivate:start'), true);
		assert.strictEqual(log.includes('rpc:dispose'), false);

		deactivation.resolve();
		await exited.promise;

		assert.strictEqual(log.includes('deactivate:done'), true);
		assert.strictEqual(log.includes('rpc:dispose'), true);
		assert.ok(log.indexOf('rpc:dispose') > log.indexOf('deactivate:done'));
	});

	test('terminate exits after timeout when extension deactivation hangs', async () => {
		const log: string[] = [];
		const exited = promiseWithResolvers<void>();

		interface ITerminateHarness {
			terminate(reason: string, code?: number): void;
			_isTerminating: boolean;
			_logService: {
				info: (message: string) => void;
				flush: () => void;
				dispose: () => void;
				error: (message: unknown) => void;
			};
			_extHostTerminalService: { dispose: () => void };
			_activator: { dispose: () => void };
			_extHostContext: { dispose: () => void };
			_deactivateAll: () => Promise<void>;
			_hostUtils: { pid: number | undefined; exit: (code: number) => void };
		}

		const service = Object.create(AbstractExtHostExtensionService.prototype) as ITerminateHarness;
		service._isTerminating = false;
		service._logService = {
			info: message => log.push(`info:${message}`),
			flush: () => log.push('flush'),
			dispose: () => log.push('log:dispose'),
			error: _message => log.push('error')
		};
		service._extHostTerminalService = {
			dispose: () => log.push('terminal:dispose')
		};
		service._activator = {
			dispose: () => log.push('activator:dispose')
		};
		service._extHostContext = {
			dispose: () => log.push('rpc:dispose')
		};
		service._deactivateAll = async () => {
			log.push('deactivate:start');
			await new Promise<void>(() => { });
		};
		service._hostUtils = {
			pid: undefined,
			exit: (_code: number) => {
				log.push('host:exit');
				exited.resolve();
			}
		};

		const clock = sinon.useFakeTimers();
		try {
			service.terminate('test-timeout', 0);

			clock.tick(4999);
			assert.strictEqual(log.includes('host:exit'), false);

			clock.tick(1);
			await exited.promise;

			assert.strictEqual(log.includes('deactivate:start'), true);
			assert.strictEqual(log.includes('rpc:dispose'), true);
			assert.ok(log.indexOf('rpc:dispose') < log.indexOf('host:exit'));
		} finally {
			clock.restore();
		}
	});
});
