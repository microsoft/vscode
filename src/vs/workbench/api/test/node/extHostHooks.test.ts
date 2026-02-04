/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { NodeExtHostHooks } from '../../node/extHostHooksNode.js';
import { IHookCommandDto, MainThreadHooksShape } from '../../common/extHost.protocol.js';
import { IHookResult, HookResultKind } from '../../../contrib/chat/common/hooksExecutionService.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

function createHookCommandDto(command: string, options?: Partial<Omit<IHookCommandDto, 'type' | 'command'>>): IHookCommandDto {
	return {
		type: 'command',
		command,
		...options,
	};
}

function createMockExtHostRpcService(mainThreadProxy: MainThreadHooksShape): IExtHostRpcService {
	return {
		_serviceBrand: undefined,
		getProxy<T>(): T {
			return mainThreadProxy as unknown as T;
		},
		set<T, R extends T>(_identifier: unknown, instance: R): R {
			return instance;
		},
		dispose(): void { },
		assertRegistered(): void { },
		drain(): Promise<void> { return Promise.resolve(); },
	} as IExtHostRpcService;
}

suite.skip('ExtHostHooks', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let hooksService: NodeExtHostHooks;

	setup(() => {
		const mockMainThreadProxy: MainThreadHooksShape = {
			$executeHook: async (): Promise<IHookResult[]> => {
				return [];
			},
			dispose: () => { }
		};

		const mockRpcService = createMockExtHostRpcService(mockMainThreadProxy);
		hooksService = new NodeExtHostHooks(mockRpcService, new NullLogService());
	});

	test('$runHookCommand runs command and returns success result', async () => {
		const hookCommand = createHookCommandDto('echo "hello world"');
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Success);
		assert.strictEqual((result.result as string).trim(), 'hello world');
	});

	test('$runHookCommand parses JSON output', async () => {
		const hookCommand = createHookCommandDto('echo \'{"key": "value"}\'');
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Success);
		assert.deepStrictEqual(result.result, { key: 'value' });
	});

	test('$runHookCommand returns error result for non-zero exit code', async () => {
		const hookCommand = createHookCommandDto('exit 1');
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Error);
	});

	test('$runHookCommand captures stderr on failure', async () => {
		const hookCommand = createHookCommandDto('echo "error message" >&2 && exit 1');
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Error);
		assert.strictEqual((result.result as string).trim(), 'error message');
	});

	test('$runHookCommand passes input to stdin as JSON', async () => {
		const hookCommand = createHookCommandDto('cat');
		const input = { tool: 'bash', args: { command: 'ls' } };
		const result = await hooksService.$runHookCommand(hookCommand, input, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Success);
		assert.deepStrictEqual(result.result, input);
	});

	test('$runHookCommand returns error for invalid command', async () => {
		const hookCommand = createHookCommandDto('/nonexistent/command/that/does/not/exist');
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Error);
	});

	test('$runHookCommand uses custom environment variables', async () => {
		const hookCommand = createHookCommandDto('echo $MY_VAR', { env: { MY_VAR: 'custom_value' } });
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Success);
		assert.strictEqual((result.result as string).trim(), 'custom_value');
	});

	test('$runHookCommand uses custom cwd', async () => {
		const hookCommand = createHookCommandDto('pwd', { cwd: URI.file('/tmp') });
		const result = await hooksService.$runHookCommand(hookCommand, undefined, CancellationToken.None);

		assert.strictEqual(result.kind, HookResultKind.Success);
		// The result should contain /tmp or /private/tmp (macOS symlink)
		assert.ok((result.result as string).includes('tmp'));
	});
});
