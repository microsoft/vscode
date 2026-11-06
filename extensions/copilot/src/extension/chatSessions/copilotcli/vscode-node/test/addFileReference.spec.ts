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
import { ADD_FILE_REFERENCE_COMMAND, registerAddFileReferenceCommand } from '../commands/addFileReference';
import { ADD_FILE_REFERENCE_NOTIFICATION } from '../commands/sendContext';

describe('addFileReference command', () => {
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
		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		expect(registeredCommands.has(ADD_FILE_REFERENCE_COMMAND)).toBe(true);
	});

	it('should send file reference from URI (explorer context menu)', async () => {
		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());

		const uri = {
			fsPath: '/test/explorer-file.ts',
			scheme: 'file',
			toString: () => 'file:///test/explorer-file.ts',
		};

		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!(uri);

		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-1',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({
				filePath: '/test/explorer-file.ts',
				fileUrl: 'file:///test/explorer-file.ts',
				selection: null,
				selectedText: null,
			}),
		);
	});

	it('should send file reference from active editor with no selection', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/active-file.ts', 'Hello World', 0, 0, 0, 0);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-1',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({
				filePath: '/test/active-file.ts',
				selection: null,
				selectedText: null,
			}),
		);
	});

	it('should include selection info when text is selected', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'line 0\nline 1\nline 2', 1, 0, 1, 6);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

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

	it('should include multi-line selection info', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'line 0\nline 1\nline 2', 0, 0, 2, 6);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-1',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({
				selection: {
					start: { line: 0, character: 0 },
					end: { line: 2, character: 6 },
				},
				selectedText: 'line 0\nline 1\nline 2',
			}),
		);
	});

	it('should show warning when no active editor and no URI', async () => {
		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

		expect(httpServer.sendNotification).not.toHaveBeenCalled();
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			'No active editor. Open a file to add a reference.',
		);
	});

	it('should prefer provided URI over active editor', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/active-file.ts', 'Active content', 0, 0, 0, 6);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());

		const explorerUri = {
			fsPath: '/test/explorer-file.ts',
			scheme: 'file',
			toString: () => 'file:///test/explorer-file.ts',
		};
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!(explorerUri);

		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-1',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({
				filePath: '/test/explorer-file.ts',
				selection: null,
				selectedText: null,
			}),
		);
	});

	it('should show warning when no sessions are connected', async () => {
		httpServer.setConnectedSessionIds([]);
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'content', 0, 0, 0, 0);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

		expect(httpServer.sendNotification).not.toHaveBeenCalled();
		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			'No Copilot CLI sessions are connected.',
		);
	});

	it('should show picker when multiple sessions are connected', async () => {
		httpServer.setConnectedSessionIds(['session-1', 'session-2']);
		mockShowQuickPick.mockResolvedValue({ sessionId: 'session-2', label: 'session-2' });

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());

		const uri = {
			fsPath: '/test/file.ts',
			scheme: 'file',
			toString: () => 'file:///test/file.ts',
		};
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!(uri);

		expect(mockShowQuickPick).toHaveBeenCalled();
		expect(httpServer.sendNotification).toHaveBeenCalledWith(
			'session-2',
			ADD_FILE_REFERENCE_NOTIFICATION,
			expect.objectContaining({ filePath: '/test/file.ts' }),
		);
	});

	it('should use session name as picker label when available', async () => {
		httpServer.setConnectedSessionIds(['session-1', 'session-2']);
		sessionTracker.setSessionName('session-1', 'My CLI');
		sessionTracker.setSessionName('session-2', 'session-2');
		mockShowQuickPick.mockResolvedValue({ sessionId: 'session-1', label: 'My CLI' });
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'content', 0, 0, 0, 0);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

		const items = mockShowQuickPick.mock.calls[0][0] as Array<{ label: string; description?: string; sessionId: string }>;
		expect(items[0].label).toBe('My CLI');
		expect(items[0].description).toBe('session-1');
		expect(items[1].label).toBe('session-2');
		expect(items[1].description).toBeUndefined();
	});

	it('should do nothing when picker is dismissed', async () => {
		httpServer.setConnectedSessionIds(['session-1', 'session-2']);
		mockShowQuickPick.mockResolvedValue(undefined);

		registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
		await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

		expect(httpServer.sendNotification).not.toHaveBeenCalled();
	});

	describe('URI scheme validation', () => {
		it('should reject output scheme from editor with warning', async () => {
			mockActiveTextEditor.value = createMockEditorWithScheme('/Output', 'content', 0, 0, 0, 7, 'output');

			registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());
			await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!();

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});

		it('should reject virtual scheme from explorer URI with warning', async () => {
			registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());

			const uri = {
				fsPath: '/block',
				scheme: 'vscode-chat-code-block',
				toString: () => 'vscode-chat-code-block:///block',
			};
			await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!(uri);

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});

		it('should reject vscode-remote scheme from explorer URI with warning', async () => {
			registerAddFileReferenceCommand(logger, httpServer as unknown as InProcHttpServer, sessionTracker.asTracker());

			const uri = {
				fsPath: '/remote/file.ts',
				scheme: 'vscode-remote',
				toString: () => 'vscode-remote:///remote/file.ts',
			};
			await registeredCommands.get(ADD_FILE_REFERENCE_COMMAND)!(uri);

			expect(httpServer.sendNotification).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'Cannot send virtual files to Copilot CLI.',
			);
		});
	});
});
