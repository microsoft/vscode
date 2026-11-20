/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import type { ICopilotCLISessionTracker } from '../../copilotcli/vscode-node/copilotCLISessionTracker';
import type { ICopilotCLITerminalIntegration } from '../copilotCLITerminalIntegration';
import { registerCopilotCLITerminalCommands, resolveSessionDirsForTerminal } from '../copilotCLITerminalCommands';

describe('resolveSessionDirsForTerminal', () => {
	it('returns matching terminal sessions before non-matching ones', async () => {
		const terminal = {} as vscode.Terminal;
		const otherTerminal = {} as vscode.Terminal;
		const tracker: ICopilotCLISessionTracker = {
			_serviceBrand: undefined,
			getSessionIds: () => ['session-a', 'session-b'],
			getTerminal: vi.fn(async (id: string) => id === 'session-a' ? terminal : otherTerminal),
		} as unknown as ICopilotCLISessionTracker;

		const dirs = await resolveSessionDirsForTerminal(tracker, terminal);
		expect(dirs).toHaveLength(2);
		// First dir should be for the matching session
		expect(dirs[0].fsPath).toContain('session-a');
	});

	it('returns empty array when no sessions exist', async () => {
		const terminal = {} as vscode.Terminal;
		const tracker: ICopilotCLISessionTracker = {
			_serviceBrand: undefined,
			getSessionIds: () => [],
			getTerminal: vi.fn(async () => undefined),
		} as unknown as ICopilotCLISessionTracker;

		const dirs = await resolveSessionDirsForTerminal(tracker, terminal);
		expect(dirs).toHaveLength(0);
	});
});

describe('registerCopilotCLITerminalCommands', () => {
	it('registers the terminal commands, opens terminals and wires terminal-link session directories', async () => {
		const registerCommand = vi.fn((_id: string, _handler: (...args: unknown[]) => unknown) => ({ dispose: vi.fn() }));
		const openTerminal = vi.fn(async () => undefined);
		const setSessionDirResolver = vi.fn();
		const terminalIntegration = { openTerminal, setSessionDirResolver } as unknown as ICopilotCLITerminalIntegration;
		const tracker = { getSessionIds: () => [], getTerminal: async () => undefined } as unknown as ICopilotCLISessionTracker;

		const registration = registerCopilotCLITerminalCommands(terminalIntegration, tracker, registerCommand);
		const handlers = new Map(registerCommand.mock.calls.map(([id, handler]) => [id, handler]));
		await handlers.get('github.copilot.cli.newSession')!();
		await handlers.get('github.copilot.cli.newSessionToSide')!();
		await handlers.get('github.copilot.cli.openInCopilotCLI')!([{ rootUri: URI.file('/repo') }]);
		registration.dispose();

		expect({
			commands: [...handlers.keys()],
			resolverSet: setSessionDirResolver.mock.calls.length,
			openTerminal: openTerminal.mock.calls,
			disposed: registerCommand.mock.results.every(result => (result.value as { dispose: ReturnType<typeof vi.fn> }).dispose.mock.calls.length === 1),
		}).toEqual({
			commands: ['github.copilot.cli.newSession', 'github.copilot.cli.newSessionToSide', 'github.copilot.cli.openInCopilotCLI'],
			resolverSet: 1,
			openTerminal: [
				['Copilot CLI', [], undefined, 'editor'],
				['Copilot CLI', [], undefined, 'editorBeside'],
				['Copilot CLI', [], URI.file('/repo').fsPath, 'editor'],
			],
			disposed: true,
		});
	});
});
