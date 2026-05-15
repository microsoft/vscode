/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as childProcess from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal, TerminalOptions } from 'vscode';
import { ILogService } from '../../../../../../platform/log/common/logService';
import { ITerminalService, NullTerminalService } from '../../../../../../platform/terminal/common/terminalService';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../util/common/test/testUtils';
import { CancellationToken } from '../../../../../../util/vs/base/common/cancellation';
import * as uuid from '../../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../../test/node/services';
import { MockChatResponseStream } from '../../../../../test/node/testHelpers';
import { ClaudeLanguageModelServer } from '../../../node/claudeLanguageModelServer';
import { IClaudeSessionStateService } from '../../../common/claudeSessionStateService';
import { TerminalSlashCommand } from '../terminalCommand';

// Mock child_process.execFile
vi.mock('child_process', () => ({
	execFile: vi.fn(),
}));

interface MockTerminal extends Pick<Terminal, 'show' | 'sendText' | 'dispose'> {
	show: ReturnType<typeof vi.fn>;
	sendText: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
}

class TestTerminalService extends NullTerminalService {
	public mockTerminal: MockTerminal;
	public createTerminalSpy: ReturnType<typeof vi.fn>;

	constructor() {
		super();
		this.mockTerminal = {
			show: vi.fn(),
			sendText: vi.fn(),
			dispose: vi.fn(),
		};
		this.createTerminalSpy = vi.fn().mockReturnValue(this.mockTerminal);
	}

	override createTerminal(): Terminal {
		return this.createTerminalSpy(...arguments);
	}
}

interface MockLanguageModelServer extends Pick<ClaudeLanguageModelServer, 'start' | 'getConfig'> {
	start: ReturnType<typeof vi.fn>;
	getConfig: ReturnType<typeof vi.fn>;
}

describe('TerminalSlashCommand', () => {
	let terminalCommand: TerminalSlashCommand;
	let testTerminalService: TestTerminalService;
	let mockLogService: ILogService;
	let mockLanguageModelServer: MockLanguageModelServer;
	let execFileMock: ReturnType<typeof vi.fn>;
	let mockSessionStateService: IClaudeSessionStateService;

	const TEST_SESSION_ID = 'test-uuid-1234';

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	beforeEach(() => {
		// Mock generateUuid to return a deterministic value
		vi.spyOn(uuid, 'generateUuid').mockReturnValue(TEST_SESSION_ID);

		// Setup execFile mock - default to claude being available
		execFileMock = vi.fn((cmd: string, args: string[], callback: (error: Error | null) => void) => {
			if (args[0] === 'claude') {
				callback(null);
			} else {
				callback(new Error('not found'));
			}
		});
		vi.mocked(childProcess.execFile).mockImplementation(execFileMock);

		// Create test terminal service
		testTerminalService = store.add(new TestTerminalService());

		// Create mock language model server
		mockLanguageModelServer = {
			start: vi.fn().mockResolvedValue(undefined),
			getConfig: vi.fn().mockReturnValue({
				port: 12345,
				nonce: 'test-nonce-123',
			}),
		};

		// Create testing services
		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		serviceCollection.set(ITerminalService, testTerminalService);

		const accessor = serviceCollection.createTestingAccessor();
		mockLogService = accessor.get(ILogService);
		mockSessionStateService = accessor.get(IClaudeSessionStateService);

		terminalCommand = accessor.get(IInstantiationService).createInstance(TerminalSlashCommand);
		// Set the mock language model server directly using defineProperty to bypass type checking
		Object.defineProperty(terminalCommand, '_langModelServer', {
			value: mockLanguageModelServer,
			writable: true,
		});
	});

	describe('command properties', () => {
		it('has correct command name', () => {
			expect(terminalCommand.commandName).toBe('terminal');
		});

		it('has correct description', () => {
			expect(terminalCommand.description).toBe('Launch Claude Code CLI using your GitHub Copilot subscription');
		});

		it('has correct command ID', () => {
			expect(terminalCommand.commandId).toBe('copilot.claude.terminal');
		});
	});

	describe('handle', () => {
		it('creates a terminal with correct environment variables', async () => {
			const mockStream = new MockChatResponseStream();

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(testTerminalService.createTerminalSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Claude',
					env: {
						ANTHROPIC_BASE_URL: 'http://localhost:12345',
						ANTHROPIC_AUTH_TOKEN: `test-nonce-123.${TEST_SESSION_ID}`,
						CLAUDE_CODE_HIDE_ACCOUNT_INFO: '1',
					}
				})
			);
		});

		it('creates a terminal with styled message', async () => {
			const mockStream = new MockChatResponseStream();

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			const createTerminalCall = testTerminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(createTerminalCall.message).toContain('\x1b[0;104m');
			expect(createTerminalCall.message).toContain('GitHub Copilot subscription');
		});

		it('shows the terminal after creation', async () => {
			const mockStream = new MockChatResponseStream();

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(testTerminalService.mockTerminal.show).toHaveBeenCalled();
		});

		it('sends claude command to terminal when claude is available', async () => {
			const mockStream = new MockChatResponseStream();

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(testTerminalService.mockTerminal.sendText).toHaveBeenCalledWith(`claude --session-id ${TEST_SESSION_ID}`);
		});

		it('sends agency claude command when only agency is available', async () => {
			// Mock: claude not available, agency available
			execFileMock.mockImplementation((cmd: string, args: string[], callback: (error: Error | null) => void) => {
				if (args[0] === 'agency') {
					callback(null);
				} else {
					callback(new Error('not found'));
				}
			});

			const mockStream = new MockChatResponseStream();

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(testTerminalService.mockTerminal.sendText).toHaveBeenCalledWith(`agency claude --session-id ${TEST_SESSION_ID}`);
		});

		it('shows download button when neither CLI is available', async () => {
			// Mock: neither claude nor agency available
			execFileMock.mockImplementation((cmd: string, args: string[], callback: (error: Error | null) => void) => {
				callback(new Error('not found'));
			});

			const mockStream = new MockChatResponseStream();
			const buttonSpy = vi.spyOn(mockStream, 'button');

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(mockStream.output.some(o => o.includes('not installed'))).toBe(true);
			expect(buttonSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					command: 'vscode.open',
					title: expect.stringContaining('Download'),
				})
			);
			expect(testTerminalService.createTerminalSpy).not.toHaveBeenCalled();
		});

		it('handles undefined stream gracefully', async () => {
			await expect(terminalCommand.handle('', undefined, CancellationToken.None)).resolves.toBeDefined();

			expect(testTerminalService.createTerminalSpy).toHaveBeenCalled();
			expect(testTerminalService.mockTerminal.show).toHaveBeenCalled();
		});

		it('handles errors gracefully with stream', async () => {
			// Make createTerminal throw an error
			testTerminalService.createTerminalSpy.mockImplementation(() => {
				throw new Error('Failed to create terminal');
			});

			const mockStream = new MockChatResponseStream();

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(mockStream.output.some(o => o.includes('Error creating terminal'))).toBe(true);
		});

		it('sets capturing token on session state service', async () => {
			const mockStream = new MockChatResponseStream();
			const setCapturingSpy = vi.spyOn(mockSessionStateService, 'setCapturingTokenForSession');

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(setCapturingSpy).toHaveBeenCalledWith(
				TEST_SESSION_ID,
				expect.objectContaining({
					label: `Claude CLI (${TEST_SESSION_ID})`,
					icon: 'claude',
				})
			);
		});

		it('logs terminal creation info', async () => {
			const mockStream = new MockChatResponseStream();
			const infoSpy = vi.spyOn(mockLogService, 'info');

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Created terminal with Claude CLI configured on port 12345'));
		});

		it('logs errors when terminal creation fails', async () => {
			// Make createTerminal throw an error
			testTerminalService.createTerminalSpy.mockImplementation(() => {
				throw new Error('Failed to create terminal');
			});

			const mockStream = new MockChatResponseStream();
			const errorSpy = vi.spyOn(mockLogService, 'error');

			await terminalCommand.handle('', mockStream, CancellationToken.None);

			expect(errorSpy).toHaveBeenCalled();
		});
	});
});
