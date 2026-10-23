/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import type { InProcHttpServer } from '../inProcHttpServer';
import { MockHttpServer, MockSessionTracker, createMockEditor, createMockEditorWithScheme } from './testHelpers';

const { mockRegisterCommand, mockActiveTextEditor, mockShowQuickPick } = vi.hoisted(() => ({
	mockRegisterCommand: vi.fn(),
	mockActiveTextEditor: { value: null as unknown },
	mockShowQuickPick: vi.fn(),
}));

vi.mock('vscode', () => ({
	window: {
		get activeTextEditor() { return mockActiveTextEditor.value; },
		showWarningMessage: vi.fn(),
		showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
	},
	commands: {
		registerCommand: (...args: unknown[]) => mockRegisterCommand(...args),
	},
}));

import * as vscode from 'vscode';
import { ADD_SELECTION_COMMAND, registerAddSelectionCommand } from '../commands/addSelection';
import { ADD_FILE_REFERENCE_NOTIFICATION } from '../commands/sendContext';

describe('addSelection command', () => {
	const logger = new TestLogService();
	let httpServer: MockHttpServer;
	let sessionTracker: MockSessionTracker;
	let registeredCommands: Map<string, (...args: unknown[]) => unknown>;

	beforeEach(() => {
		vi.clearAllMocks();
		httpServer = new MockHttpServer();
		sessionTracker = new MockSessionTracker();
		registeredCommands = new Map();
		mockActiveTextEditor.value = null;

		// Default: one connected session
		httpServer.setConnectedSessionIds(['session-1']);

		mockRegisterCommand.mockImplementation((name: string, callback: (...args: unknown[]) => unknown) => {
			registeredCommands.set(name, callback);
			return { dispose: () => { } };
		});
	});

	it('should register the command', () => {
		registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		expect(registeredCommands.has(ADD_SELECTION_COMMAND)).toBe(true);
	});

	it('should send selection notification from active editor with selection', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'line 0\nline 1\nline 2', 1, 0, 1, 6);

		registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_SELECTION_COMMAND)!();

		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-1',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({
				filePath: '/test/file.ts',
				selection: {
					start: { line: 1, character: 0 },
					end: { line: 1, character: 6 },
				},
				selectedText: 'line 1',
			}),
		);
	});

	it('should send context with null selection when no text is selected (fallback to file)', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'Hello World', 0, 0, 0, 0);

		registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_SELECTION_COMMAND)!();

		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-1',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({
				filePath: '/test/file.ts',
				selection: null,
				selectedText: null,
			}),
		);
	});

	it('should show warning when no active editor', async () => {
		registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_SELECTION_COMMAND)!();

		expect(httpServer.sendNotification).not.toHaveBeenCalled();
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			'No active editor. Open a file to add a reference.',
		);
	});

	it('should show warning when no sessions are connected', async () => {
		httpServer.setConnectedSessionIds([]);
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'content', 0, 0, 0, 0);

		registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_SELECTION_COMMAND)!();

		expect(httpServer.sendNotification).not.toHaveBeenCalled();
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			'No Copilot CLI sessions are connected.',
		);
	});

	it('should show picker when multiple sessions are connected', async () => {
		httpServer.setConnectedSessionIds(['session-1', 'session-2']);
		mockShowQuickPick.mockResolvedValue({ sessionId: 'session-2', label: 'session-2' });
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'content', 0, 0, 0, 7);

		registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_SELECTION_COMMAND)!();

		expect(mockShowQuickPick).toHaveBeenCalled();
		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-2',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({ filePath: '/test/file.ts' }),
		);
	});

	describe('URI scheme validation', () => {
		it('should allow file scheme', async () => {
			mockActiveTextEditor.value = createMockEditorWithScheme('/test/file.ts', 'content', 0, 0, 0, 7, 'file');

			registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
			await registeredCommands.get(ADD_SELECTION_COMMAND)!();

			expect(httpServer.sendNotification).toHaveBeenCalled();
		});

		it('should reject vscode-remote scheme with warning', async () => {
			mockActiveTextEditor.value = createMockEditorWithScheme('/test/file.ts', 'content', 0, 0, 0, 7, 'vscode-remote');

			registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
			await registeredCommands.get(ADD_SELECTION_COMMAND)!();

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});

		it('should reject output scheme with warning', async () => {
			mockActiveTextEditor.value = createMockEditorWithScheme('/Output', 'content', 0, 0, 0, 7, 'output');

			registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
			await registeredCommands.get(ADD_SELECTION_COMMAND)!();

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});

		it('should reject untitled scheme with warning', async () => {
			mockActiveTextEditor.value = createMockEditorWithScheme('/Untitled-1', 'content', 0, 0, 0, 7, 'untitled');

			registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
			await registeredCommands.get(ADD_SELECTION_COMMAND)!();

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});

		it('should reject vscode-chat-code-block scheme with warning', async () => {
			mockActiveTextEditor.value = createMockEditorWithScheme('/block', 'content', 0, 0, 0, 7, 'vscode-chat-code-block');

			registerAddSelectionCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
			await registeredCommands.get(ADD_SELECTION_COMMAND)!();

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});
	});
});
