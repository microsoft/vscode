/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTerminal = { processId: Promise<number | undefined>; name: string };

const { mockTerminals, terminalCloseListeners, mockExecFile, mockIsWindows } = vi.hoisted(() => ({
	mockTerminals: { value: [] as Array<MockTerminal> },
	terminalCloseListeners: [] as Array<(terminal: MockTerminal) => void>,
	mockExecFile: vi.fn(),
	mockIsWindows: { value: false },
}));

vi.mock('vscode', async (importOriginal) => {
	const actual = await importOriginal() as Record<string, unknown>;
	return {
		...actual,
		window: {
			get terminals() { return mockTerminals.value; },
			onDidCloseTerminal(listener: (terminal: MockTerminal) => void) {
				terminalCloseListeners.push(listener);
				return { dispose: () => { const idx = terminalCloseListeners.indexOf(listener); if (idx >= 0) { terminalCloseListeners.splice(idx, 1); } } };
			},
		},
	};
});

vi.mock('child_process', () => ({
	execFile: mockExecFile,
}));

vi.mock('../../../../../util/vs/base/common/platform', () => ({
	get isWindows() { return mockIsWindows.value; },
}));

import { CopilotCLISessionTracker, getParentPid } from '../copilotCLISessionTracker';

function fireTerminalClose(terminal: MockTerminal): void {
	for (const listener of terminalCloseListeners) {
		listener(terminal);
	}
}

describe('CopilotCLISessionTracker', () => {
	let tracker: CopilotCLISessionTracker;

	beforeEach(() => {
		tracker?.dispose();
		tracker = new CopilotCLISessionTracker();
		mockTerminals.value = [];
		mockIsWindows.value = false;
		// Default: getParentPid fails (process not found), so grandparent fallback is a no-op
		mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
			callback(new Error('process not found'), '', '');
		});
	});

	describe('registerSession', () => {
		it('should register a session with pid and ppid', () => {
			const disposable = tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			expect(disposable).toBeDefined();
			expect(disposable.dispose).toBeInstanceOf(Function);
		});

		it('should remove session on dispose', async () => {
			const disposable = tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			mockTerminals.value = [
				{ processId: Promise.resolve(5678), name: 'terminal-1' },
			];

			// Terminal should be found before dispose
			const terminalBefore = await tracker.getTerminal('session-1');
			expect(terminalBefore).toBeDefined();

			disposable.dispose();

			// Terminal should not be found after dispose
			const terminalAfter = await tracker.getTerminal('session-1');
			expect(terminalAfter).toBeUndefined();
		});

		it('should overwrite existing session with same id', async () => {
			tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			tracker.registerSession('session-1', { pid: 3000, ppid: 4000 });

			mockTerminals.value = [
				{ processId: Promise.resolve(2000), name: 'terminal-old' },
				{ processId: Promise.resolve(4000), name: 'terminal-new' },
			];

			const terminal = await tracker.getTerminal('session-1');
			// Should match the new ppid (4000), not the old one (2000)
			expect(terminal).toBeDefined();
			expect((terminal as { name: string }).name).toBe('terminal-new');
		});
	});

	describe('getTerminal', () => {
		it('should return undefined for unknown session', async () => {
			const terminal = await tracker.getTerminal('unknown-session');
			expect(terminal).toBeUndefined();
		});

		it('should return undefined when no terminals exist', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			mockTerminals.value = [];

			const terminal = await tracker.getTerminal('session-1');
			expect(terminal).toBeUndefined();
		});

		it('should find terminal matching session ppid', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const expectedTerminal = { processId: Promise.resolve(5678), name: 'matching-terminal' };
			mockTerminals.value = [
				{ processId: Promise.resolve(1111), name: 'other-terminal' },
				expectedTerminal,
				{ processId: Promise.resolve(9999), name: 'another-terminal' },
			];

			const terminal = await tracker.getTerminal('session-1');
			expect(terminal).toBe(expectedTerminal);
		});

		it('should return undefined when no terminal matches ppid', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			mockTerminals.value = [
				{ processId: Promise.resolve(1111), name: 'terminal-1' },
				{ processId: Promise.resolve(2222), name: 'terminal-2' },
			];

			const terminal = await tracker.getTerminal('session-1');
			expect(terminal).toBeUndefined();
		});

		it('should handle terminals with undefined processId', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			mockTerminals.value = [
				{ processId: Promise.resolve(undefined as unknown as number), name: 'no-pid-terminal' },
				{ processId: Promise.resolve(5678), name: 'matching-terminal' },
			];

			const terminal = await tracker.getTerminal('session-1');
			expect(terminal).toBeDefined();
			expect((terminal as { name: string }).name).toBe('matching-terminal');
		});

		it('should return first matching terminal when multiple match', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const firstMatch = { processId: Promise.resolve(5678), name: 'first-match' };
			const secondMatch = { processId: Promise.resolve(5678), name: 'second-match' };
			mockTerminals.value = [firstMatch, secondMatch];

			const terminal = await tracker.getTerminal('session-1');
			expect(terminal).toBe(firstMatch);
		});

		it('should find correct terminal for different sessions', async () => {
			tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			tracker.registerSession('session-2', { pid: 3000, ppid: 4000 });

			const terminal1 = { processId: Promise.resolve(2000), name: 'terminal-for-session-1' };
			const terminal2 = { processId: Promise.resolve(4000), name: 'terminal-for-session-2' };
			mockTerminals.value = [terminal1, terminal2];

			const result1 = await tracker.getTerminal('session-1');
			const result2 = await tracker.getTerminal('session-2');
			expect(result1).toBe(terminal1);
			expect(result2).toBe(terminal2);
		});
	});

	describe('setSessionName and getSessionDisplayName', () => {
		it('should return sessionId when no name is set', () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			expect(tracker.getSessionDisplayName('session-1')).toBe('Copilot CLI Session');
		});

		it('should return sessionId when name is empty string', () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			tracker.setSessionName('session-1', '');
			expect(tracker.getSessionDisplayName('session-1')).toBe('Copilot CLI Session');
		});

		it('should return custom name after setSessionName', () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			tracker.setSessionName('session-1', 'Fix Login Bug');
			expect(tracker.getSessionDisplayName('session-1')).toBe('Fix Login Bug');
		});

		it('should update name when setSessionName called multiple times', () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			tracker.setSessionName('session-1', 'First Name');
			tracker.setSessionName('session-1', 'Second Name');
			expect(tracker.getSessionDisplayName('session-1')).toBe('Second Name');
		});

		it('should clear name when session is disposed', () => {
			const disposable = tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			tracker.setSessionName('session-1', 'My Session');
			expect(tracker.getSessionDisplayName('session-1')).toBe('My Session');

			disposable.dispose();
			expect(tracker.getSessionDisplayName('session-1')).toBe('Copilot CLI Session');
		});

		it('should track names independently for different sessions', () => {
			tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			tracker.registerSession('session-2', { pid: 3000, ppid: 4000 });

			tracker.setSessionName('session-1', 'Session One');
			tracker.setSessionName('session-2', 'Session Two');

			expect(tracker.getSessionDisplayName('session-1')).toBe('Session One');
			expect(tracker.getSessionDisplayName('session-2')).toBe('Session Two');
		});
	});

	describe('dispose lifecycle', () => {
		it('disposing first registration does not affect second registration with different id', async () => {
			const disposable1 = tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			tracker.registerSession('session-2', { pid: 3000, ppid: 4000 });

			disposable1.dispose();

			mockTerminals.value = [
				{ processId: Promise.resolve(4000), name: 'terminal-2' },
			];

			// session-1 should be gone
			const terminal1 = await tracker.getTerminal('session-1');
			expect(terminal1).toBeUndefined();

			// session-2 should still work
			const terminal2 = await tracker.getTerminal('session-2');
			expect(terminal2).toBeDefined();
		});

		it('disposing overwritten registration removes the session', async () => {
			const disposable1 = tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			const disposable2 = tracker.registerSession('session-1', { pid: 3000, ppid: 4000 });

			// Disposing the second registration should remove the session
			disposable2.dispose();

			mockTerminals.value = [
				{ processId: Promise.resolve(4000), name: 'terminal-new' },
			];

			const terminal = await tracker.getTerminal('session-1');
			expect(terminal).toBeUndefined();

			// Disposing the first (already overwritten) should be a no-op
			disposable1.dispose();
		});
	});

	describe('setSessionTerminal', () => {
		it('should return directly-set terminal from getTerminal', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const directTerminal = { processId: Promise.resolve(9999), name: 'direct-terminal' } as MockTerminal;
			tracker.setSessionTerminal('session-1', directTerminal as any);

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(directTerminal);
		});

		it('should take priority over PID matching', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const pidTerminal = { processId: Promise.resolve(5678), name: 'pid-terminal' };
			const directTerminal = { processId: Promise.resolve(9999), name: 'direct-terminal' } as MockTerminal;
			mockTerminals.value = [pidTerminal];

			tracker.setSessionTerminal('session-1', directTerminal as any);

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(directTerminal);
		});

		it('should remove mapping when terminal is closed', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const directTerminal = { processId: Promise.resolve(9999), name: 'direct-terminal' } as MockTerminal;
			tracker.setSessionTerminal('session-1', directTerminal as any);

			// Verify it's set
			expect(await tracker.getTerminal('session-1')).toBe(directTerminal);

			// Fire terminal close
			fireTerminalClose(directTerminal);

			// Should fall back to PID lookup (which returns undefined since no terminals match ppid)
			mockTerminals.value = [];
			expect(await tracker.getTerminal('session-1')).toBeUndefined();
		});

		it('should fall back to PID matching after terminal close', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const directTerminal = { processId: Promise.resolve(9999), name: 'direct-terminal' } as MockTerminal;
			const pidTerminal = { processId: Promise.resolve(5678), name: 'pid-terminal' };
			tracker.setSessionTerminal('session-1', directTerminal as any);
			mockTerminals.value = [pidTerminal];

			// Fire terminal close for the direct terminal
			fireTerminalClose(directTerminal);

			// Should now fall back to PID-based lookup
			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(pidTerminal);
		});

		it('should remove mapping when session is disposed', async () => {
			const disposable = tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const directTerminal = { processId: Promise.resolve(9999), name: 'direct-terminal' } as MockTerminal;
			tracker.setSessionTerminal('session-1', directTerminal as any);

			expect(await tracker.getTerminal('session-1')).toBe(directTerminal);

			disposable.dispose();

			expect(await tracker.getTerminal('session-1')).toBeUndefined();
		});

		it('should track terminals independently for different sessions', async () => {
			tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			tracker.registerSession('session-2', { pid: 3000, ppid: 4000 });

			const terminal1 = { processId: Promise.resolve(9991), name: 'terminal-1' } as MockTerminal;
			const terminal2 = { processId: Promise.resolve(9992), name: 'terminal-2' } as MockTerminal;

			tracker.setSessionTerminal('session-1', terminal1 as any);
			tracker.setSessionTerminal('session-2', terminal2 as any);

			expect(await tracker.getTerminal('session-1')).toBe(terminal1);
			expect(await tracker.getTerminal('session-2')).toBe(terminal2);
		});

		it('should only remove mapping for the closed terminal', async () => {
			tracker.registerSession('session-1', { pid: 1000, ppid: 2000 });
			tracker.registerSession('session-2', { pid: 3000, ppid: 4000 });

			const terminal1 = { processId: Promise.resolve(9991), name: 'terminal-1' } as MockTerminal;
			const terminal2 = { processId: Promise.resolve(9992), name: 'terminal-2' } as MockTerminal;

			tracker.setSessionTerminal('session-1', terminal1 as any);
			tracker.setSessionTerminal('session-2', terminal2 as any);

			// Close only terminal1
			fireTerminalClose(terminal1);

			// session-1 should lose its direct mapping
			mockTerminals.value = [];
			expect(await tracker.getTerminal('session-1')).toBeUndefined();
			// session-2 should still have its direct mapping
			expect(await tracker.getTerminal('session-2')).toBe(terminal2);
		});

		it('should overwrite previous terminal for same session', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });

			const terminal1 = { processId: Promise.resolve(9991), name: 'terminal-1' } as MockTerminal;
			const terminal2 = { processId: Promise.resolve(9992), name: 'terminal-2' } as MockTerminal;

			tracker.setSessionTerminal('session-1', terminal1 as any);
			tracker.setSessionTerminal('session-1', terminal2 as any);

			expect(await tracker.getTerminal('session-1')).toBe(terminal2);
		});
	});

	describe('getTerminal grandparent fallback', () => {
		beforeEach(() => {
			mockExecFile.mockClear();
		});

		it('should fall back to grandparent PID when no direct PPID match', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });

			// No terminal matches ppid 5678, but grandparent is 9999
			const grandparentTerminal = { processId: Promise.resolve(9999), name: 'grandparent-terminal' };
			mockTerminals.value = [grandparentTerminal];

			// Mock getParentPid(5678) -> 9999
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '  9999\n', '');
			});

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(grandparentTerminal);
		});

		it('should return undefined when both PPID and grandparent fail', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			mockTerminals.value = [
				{ processId: Promise.resolve(1111), name: 'unrelated-terminal' },
			];

			// getParentPid fails
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(new Error('process not found'), '', '');
			});

			const result = await tracker.getTerminal('session-1');
			expect(result).toBeUndefined();
		});

		it('should not call getParentPid when direct PPID match succeeds', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const ppidTerminal = { processId: Promise.resolve(5678), name: 'ppid-terminal' };
			mockTerminals.value = [ppidTerminal];

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(ppidTerminal);
			// execFile should not have been called since PPID matched directly
			expect(mockExecFile).not.toHaveBeenCalled();
		});

		it('should not call getParentPid when direct terminal mapping exists', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			const directTerminal = { processId: Promise.resolve(7777), name: 'direct' } as MockTerminal;
			tracker.setSessionTerminal('session-1', directTerminal as any);

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(directTerminal);
			expect(mockExecFile).not.toHaveBeenCalled();
		});

		it('should return undefined when grandparent PID matches no terminal', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 5678 });
			mockTerminals.value = [
				{ processId: Promise.resolve(1111), name: 'unrelated-terminal' },
			];

			// getParentPid returns a PID that no terminal matches
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '2222\n', '');
			});

			const result = await tracker.getTerminal('session-1');
			expect(result).toBeUndefined();
		});

		it('should walk multiple generations to find a terminal', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 100 });

			// Terminal has PID 400 (great-great-grandparent)
			const ancestorTerminal = { processId: Promise.resolve(400), name: 'ancestor-terminal' };
			mockTerminals.value = [ancestorTerminal];

			// Chain: 100 -> 200 -> 300 -> 400
			mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				const pid = args[args.length - 1];
				const chain: Record<string, string> = { '100': '200', '200': '300', '300': '400' };
				if (chain[pid]) {
					callback(null, `${chain[pid]}\n`, '');
				} else {
					callback(new Error('not found'), '', '');
				}
			});

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(ancestorTerminal);
		});

		it('should stop walking after 4 generations', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 100 });

			// Terminal has PID 600 (5th generation — too far)
			const farTerminal = { processId: Promise.resolve(600), name: 'far-terminal' };
			mockTerminals.value = [farTerminal];

			// Chain: 100 -> 200 -> 300 -> 400 -> 500 -> 600
			mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				const pid = args[args.length - 1];
				const chain: Record<string, string> = { '100': '200', '200': '300', '300': '400', '400': '500', '500': '600' };
				if (chain[pid]) {
					callback(null, `${chain[pid]}\n`, '');
				} else {
					callback(new Error('not found'), '', '');
				}
			});

			const result = await tracker.getTerminal('session-1');
			expect(result).toBeUndefined();
			// Should have called getParentPid exactly 4 times (generations 1-4)
			expect(mockExecFile).toHaveBeenCalledTimes(4);
		});

		it('should cache ancestor PIDs and reuse them on subsequent calls', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 100 });

			// First call: no terminal matches anything
			mockTerminals.value = [];
			mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				const pid = args[args.length - 1];
				const chain: Record<string, string> = { '100': '200', '200': '300' };
				if (chain[pid]) {
					callback(null, `${chain[pid]}\n`, '');
				} else {
					callback(new Error('not found'), '', '');
				}
			});

			await tracker.getTerminal('session-1');
			const firstCallCount = mockExecFile.mock.calls.length;
			expect(firstCallCount).toBeGreaterThan(0);

			// Second call: terminal now matches grandparent PID 200
			mockExecFile.mockClear();
			const terminal = { processId: Promise.resolve(200), name: 'grandparent-terminal' };
			mockTerminals.value = [terminal];

			const result = await tracker.getTerminal('session-1');
			expect(result).toBe(terminal);
			// Should not call execFile again — PIDs 200 and 300 are cached
			expect(mockExecFile).not.toHaveBeenCalled();
		});

		it('should store found terminal in _sessionTerminals for faster future lookups', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 100 });

			const ancestorTerminal = { processId: Promise.resolve(200), name: 'ancestor-terminal' };
			mockTerminals.value = [ancestorTerminal];

			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '200\n', '');
			});

			// First call: finds terminal via ancestor walk
			const result1 = await tracker.getTerminal('session-1');
			expect(result1).toBe(ancestorTerminal);

			mockExecFile.mockClear();

			// Second call: should return immediately from _sessionTerminals (direct mapping)
			const result2 = await tracker.getTerminal('session-1');
			expect(result2).toBe(ancestorTerminal);
			// No ancestor walking needed
			expect(mockExecFile).not.toHaveBeenCalled();
		});

		it('should stop walking when getParentPid returns undefined', async () => {
			tracker.registerSession('session-1', { pid: 1234, ppid: 100 });
			mockTerminals.value = [];

			// Only one generation available: 100 -> 200, then fails
			mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				const pid = args[args.length - 1];
				if (pid === '100') {
					callback(null, '200\n', '');
				} else {
					callback(new Error('not found'), '', '');
				}
			});

			const result = await tracker.getTerminal('session-1');
			expect(result).toBeUndefined();
			// Should have called getParentPid twice: once for 100->200, once for 200->fail
			expect(mockExecFile).toHaveBeenCalledTimes(2);
		});

		it('should clear cached ancestor PIDs when session is disposed', async () => {
			const disposable = tracker.registerSession('session-1', { pid: 1234, ppid: 100 });
			mockTerminals.value = [];

			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '200\n', '');
			});

			// Populate cache
			await tracker.getTerminal('session-1');

			disposable.dispose();
			mockExecFile.mockClear();

			// Re-register and call again — should need to re-fetch
			tracker.registerSession('session-1', { pid: 1234, ppid: 100 });
			await tracker.getTerminal('session-1');
			expect(mockExecFile).toHaveBeenCalled();
		});
	});
});

describe('getParentPid', () => {
	beforeEach(() => {
		mockExecFile.mockClear();
		mockIsWindows.value = false;
	});

	describe('on Linux/macOS', () => {
		it('should return the parent PID from ps output', async () => {
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '  1234\n', '');
			});

			const result = await getParentPid(5678);
			expect(result).toBe(1234);
			expect(mockExecFile).toHaveBeenCalledWith('ps', ['-o', 'ppid=', '-p', '5678'], { windowsHide: true }, expect.any(Function));
		});

		it('should return undefined when ps fails', async () => {
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(new Error('No such process'), '', '');
			});

			const result = await getParentPid(99999);
			expect(result).toBeUndefined();
		});

		it('should return undefined when ps returns non-numeric output', async () => {
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '', '');
			});

			const result = await getParentPid(5678);
			expect(result).toBeUndefined();
		});
	});

	describe('on Windows', () => {
		beforeEach(() => {
			mockIsWindows.value = true;
		});

		it('should return the parent PID from PowerShell output', async () => {
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '5678\r\n', '');
			});

			const result = await getParentPid(1234);
			expect(result).toBe(5678);
			expect(mockExecFile).toHaveBeenCalledWith(
				'powershell.exe',
				['-NoProfile', '-Command', '(Get-CimInstance Win32_Process -Filter \"ProcessId=1234\").ParentProcessId'],
				{ windowsHide: true },
				expect.any(Function)
			);
		});

		it('should return undefined when PowerShell fails', async () => {
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(new Error('PowerShell error'), '', '');
			});

			const result = await getParentPid(1234);
			expect(result).toBeUndefined();
		});

		it('should return undefined when PowerShell returns empty output', async () => {
			mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
				callback(null, '\r\n', '');
			});

			const result = await getParentPid(1234);
			expect(result).toBeUndefined();
		});
	});
});
