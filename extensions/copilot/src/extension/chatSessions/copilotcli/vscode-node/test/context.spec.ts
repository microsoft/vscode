/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
}));

import * as vscode from 'vscode';
import { registerCommandContext } from '../commands/context';

type Listener = (...args: unknown[]) => void;

/**
 * A mock InProcHttpServer with controllable events and session ids.
 */
class MockHttpServerWithEvents {
	private _connectListeners: Listener[] = [];
	private _disconnectListeners: Listener[] = [];
	private _connectedSessionIds: readonly string[] = [];

	readonly onDidClientConnect = vi.fn((listener: Listener) => {
		this._connectListeners.push(listener);
		return { dispose: () => { this._connectListeners = this._connectListeners.filter(l => l !== listener); } };
	});

	readonly onDidClientDisconnect = vi.fn((listener: Listener) => {
		this._disconnectListeners.push(listener);
		return { dispose: () => { this._disconnectListeners = this._disconnectListeners.filter(l => l !== listener); } };
	});

	readonly getConnectedSessionIds = vi.fn((): readonly string[] => this._connectedSessionIds);

	setConnectedSessionIds(ids: readonly string[]): void {
		this._connectedSessionIds = ids;
	}

	fireConnect(): void {
		for (const listener of this._connectListeners) {
			listener();
		}
	}

	fireDisconnect(): void {
		for (const listener of this._disconnectListeners) {
			listener();
		}
	}
}

describe('registerCommandContext', () => {
	let mockServer: MockHttpServerWithEvents;

	beforeEach(() => {
		vi.mocked(vscode.commands.executeCommand).mockClear();
		mockServer = new MockHttpServerWithEvents();
	});

	it('should set context to false when no sessions are connected initially', () => {
		mockServer.setConnectedSessionIds([]);
		registerCommandContext(mockServer as any);

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			false,
		);
	});

	it('should set context to true when sessions are connected initially', () => {
		mockServer.setConnectedSessionIds(['session-1']);
		registerCommandContext(mockServer as any);

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			true,
		);
	});

	it('should update context to true when a client connects', () => {
		mockServer.setConnectedSessionIds([]);
		registerCommandContext(mockServer as any);
		vi.mocked(vscode.commands.executeCommand).mockClear();

		mockServer.setConnectedSessionIds(['session-1']);
		mockServer.fireConnect();

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			true,
		);
	});

	it('should update context to false when all clients disconnect', () => {
		mockServer.setConnectedSessionIds(['session-1']);
		registerCommandContext(mockServer as any);
		vi.mocked(vscode.commands.executeCommand).mockClear();

		mockServer.setConnectedSessionIds([]);
		mockServer.fireDisconnect();

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			false,
		);
	});

	it('should remain true when one of multiple clients disconnects', () => {
		mockServer.setConnectedSessionIds(['session-1', 'session-2']);
		registerCommandContext(mockServer as any);
		vi.mocked(vscode.commands.executeCommand).mockClear();

		mockServer.setConnectedSessionIds(['session-2']);
		mockServer.fireDisconnect();

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			true,
		);
	});

	it('should register listeners for both connect and disconnect events', () => {
		mockServer.setConnectedSessionIds([]);
		registerCommandContext(mockServer as any);

		expect(mockServer.onDidClientConnect).toHaveBeenCalledOnce();
		expect(mockServer.onDidClientDisconnect).toHaveBeenCalledOnce();
	});

	it('should return a disposable that cleans up event listeners', () => {
		mockServer.setConnectedSessionIds([]);
		const disposables = registerCommandContext(mockServer as any);
		vi.mocked(vscode.commands.executeCommand).mockClear();

		disposables.dispose();

		// After disposing, firing events should not trigger context updates
		mockServer.setConnectedSessionIds(['session-1']);
		mockServer.fireConnect();
		mockServer.fireDisconnect();

		expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('should handle multiple connect and disconnect events', () => {
		mockServer.setConnectedSessionIds([]);
		registerCommandContext(mockServer as any);
		vi.mocked(vscode.commands.executeCommand).mockClear();

		// First client connects
		mockServer.setConnectedSessionIds(['session-1']);
		mockServer.fireConnect();
		expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			true,
		);

		// Second client connects
		mockServer.setConnectedSessionIds(['session-1', 'session-2']);
		mockServer.fireConnect();
		expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			true,
		);

		// First client disconnects
		mockServer.setConnectedSessionIds(['session-2']);
		mockServer.fireDisconnect();
		expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			true,
		);

		// Last client disconnects
		mockServer.setConnectedSessionIds([]);
		mockServer.fireDisconnect();
		expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
			'setContext',
			'github.copilot.chat.copilotCLI.hasSession',
			false,
		);
	});
});
