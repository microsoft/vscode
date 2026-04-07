/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../util/common/test/testUtils';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { MockChatResponseStream } from '../../../../test/node/testHelpers';
import { ClaudeSlashCommandService, IClaudeSlashCommandRequest } from '../claudeSlashCommandService';
import { IClaudeSlashCommandHandler, IClaudeSlashCommandHandlerCtor } from '../slashCommands/claudeSlashCommandRegistry';

// Wire test handler ctors through the registry so the service populates its cache naturally
const mockGetRegistry = vi.fn<() => readonly IClaudeSlashCommandHandlerCtor[]>().mockReturnValue([]);
vi.mock('../slashCommands/claudeSlashCommandRegistry', async importOriginal => {
	const actual = await importOriginal<typeof import('../slashCommands/claudeSlashCommandRegistry')>();
	return { ...actual, getClaudeSlashCommandRegistry: () => mockGetRegistry() };
});

class TestHooksHandler implements IClaudeSlashCommandHandler {
	static handleSpy = vi.fn<IClaudeSlashCommandHandler['handle']>().mockResolvedValue({});
	readonly commandName = 'hooks';
	readonly description = 'Test hooks handler';

	handle(args: string, stream: vscode.ChatResponseStream | undefined, token: CancellationToken): Promise<vscode.ChatResult | void> {
		return TestHooksHandler.handleSpy(args, stream, token);
	}
}

class TestMemoryHandler implements IClaudeSlashCommandHandler {
	static handleSpy = vi.fn<IClaudeSlashCommandHandler['handle']>().mockResolvedValue({});
	readonly commandName = 'memory';
	readonly description = 'Test memory handler';

	handle(args: string, stream: vscode.ChatResponseStream | undefined, token: CancellationToken): Promise<vscode.ChatResult | void> {
		return TestMemoryHandler.handleSpy(args, stream, token);
	}
}

function makeRequest(prompt: string, command?: string): IClaudeSlashCommandRequest {
	return { prompt, command };
}

describe('ClaudeSlashCommandService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: ClaudeSlashCommandService;
	let stream: MockChatResponseStream;

	beforeEach(() => {
		TestHooksHandler.handleSpy.mockReset().mockResolvedValue({});
		TestMemoryHandler.handleSpy.mockReset().mockResolvedValue({});
		mockGetRegistry.mockReturnValue([TestHooksHandler, TestMemoryHandler]);

		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		const accessor = serviceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		service = store.add(instantiationService.createInstance(ClaudeSlashCommandService));
		stream = new MockChatResponseStream();
	});

	// #region request.command (VS Code UI slash command)

	describe('request.command handling', () => {
		it('dispatches to handler when request.command matches', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('some prompt', 'hooks'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(TestHooksHandler.handleSpy).toHaveBeenCalledWith('some prompt', stream, CancellationToken.None);
		});

		it('passes the full prompt as args when dispatched via request.command', async () => {
			await service.tryHandleCommand(
				makeRequest('event PreToolUse', 'hooks'),
				stream,
				CancellationToken.None,
			);

			expect(TestHooksHandler.handleSpy).toHaveBeenCalledWith('event PreToolUse', stream, CancellationToken.None);
		});

		it('is case-insensitive for request.command', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('test', 'HOOKS'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(TestHooksHandler.handleSpy).toHaveBeenCalled();
		});

		it('returns handled:false for unknown request.command and no prompt match', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('hello', 'unknown'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(false);
		});

		it('falls through to prompt parsing when request.command is unknown', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('/memory list', 'unknown'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(TestMemoryHandler.handleSpy).toHaveBeenCalledWith('list', stream, CancellationToken.None);
		});

		it('takes precedence over prompt-based parsing', async () => {
			await service.tryHandleCommand(
				makeRequest('/memory list', 'hooks'),
				stream,
				CancellationToken.None,
			);

			// request.command = 'hooks' wins, prompt is passed as-is
			expect(TestHooksHandler.handleSpy).toHaveBeenCalledWith('/memory list', stream, CancellationToken.None);
			expect(TestMemoryHandler.handleSpy).not.toHaveBeenCalled();
		});
	});

	// #endregion

	// #region Prompt-based slash command parsing

	describe('prompt-based slash command parsing', () => {
		it('dispatches /command from prompt text', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('/hooks event'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(TestHooksHandler.handleSpy).toHaveBeenCalledWith('event', stream, CancellationToken.None);
		});

		it('passes empty string args when no arguments in prompt', async () => {
			await service.tryHandleCommand(
				makeRequest('/hooks'),
				stream,
				CancellationToken.None,
			);

			expect(TestHooksHandler.handleSpy).toHaveBeenCalledWith('', stream, CancellationToken.None);
		});

		it('is case-insensitive for command name in prompt', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('/HOOKS'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(TestHooksHandler.handleSpy).toHaveBeenCalled();
		});

		it('trims whitespace before parsing', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('  /hooks  '),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
		});

		it('returns handled:false for non-slash prompt', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('hello world'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(false);
		});

		it('returns handled:false for unknown command in prompt', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('/nonexistent'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(false);
		});

		it('returns handled:false for prompt with slash mid-text', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('please run /hooks'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(false);
		});
	});

	// #endregion

	// #region Handler result propagation

	describe('result propagation', () => {
		it('returns handler result in the response', async () => {
			const expectedResult: vscode.ChatResult = { metadata: { key: 'value' } };
			TestHooksHandler.handleSpy.mockResolvedValue(expectedResult);

			const result = await service.tryHandleCommand(
				makeRequest('/hooks'),
				stream,
				CancellationToken.None,
			);

			expect(result.result).toEqual(expectedResult);
		});

		it('returns empty object when handler returns void', async () => {
			TestHooksHandler.handleSpy.mockResolvedValue(undefined);

			const result = await service.tryHandleCommand(
				makeRequest('/hooks'),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(result.result).toEqual({});
		});
	});

	// #endregion

	// #region request.command undefined / not set

	describe('when request.command is undefined', () => {
		it('falls through to prompt-based parsing', async () => {
			const result = await service.tryHandleCommand(
				makeRequest('/memory foo', undefined),
				stream,
				CancellationToken.None,
			);

			expect(result.handled).toBe(true);
			expect(TestMemoryHandler.handleSpy).toHaveBeenCalledWith('foo', stream, CancellationToken.None);
		});
	});

	// #endregion
});
