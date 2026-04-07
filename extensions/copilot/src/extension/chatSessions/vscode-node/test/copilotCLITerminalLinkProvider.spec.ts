/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken, Terminal, TerminalLinkContext, Uri } from 'vscode';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { CopilotCLITerminalLinkProvider } from '../copilotCLITerminalLinkProvider';

// --- Mocks ---------------------------------------------------------------

const mockStat = vi.hoisted(() => vi.fn());
const mockReadDirectory = vi.hoisted(() => vi.fn());
const mockShowTextDocument = vi.hoisted(() => vi.fn());
const mockShowQuickPick = vi.hoisted(() => vi.fn());
const mockWorkspaceFolders = vi.hoisted(() => ({ value: undefined as { uri: { fsPath: string; scheme: string } }[] | undefined }));

vi.mock('vscode', () => ({
	Uri: {
		file: (path: string) => ({
			fsPath: path,
			scheme: 'file',
			toString: (skipEncoding?: boolean) => skipEncoding ? `file://${path}` : `file://${encodeURI(path)}`,
		}),
		joinPath: (base: { fsPath: string; scheme: string }, ...segments: string[]) => {
			const joined = [base.fsPath, ...segments].join('/');
			return {
				fsPath: joined,
				scheme: base.scheme,
				toString: (skipEncoding?: boolean) => skipEncoding ? `file://${joined}` : `file://${encodeURI(joined)}`,
			};
		},
	},
	Range: class Range {
		constructor(
			public readonly startLine: number,
			public readonly startCharacter: number,
			public readonly endLine: number,
			public readonly endCharacter: number,
		) { }
	},
	window: {
		showTextDocument: mockShowTextDocument,
		showQuickPick: mockShowQuickPick,
	},
	l10n: {
		t: (message: string, ...args: string[]) => message.replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]),
	},
	FileType: {
		Unknown: 0,
		File: 1,
		Directory: 2,
		SymbolicLink: 64,
	},
	workspace: {
		fs: {
			stat: mockStat,
			readDirectory: mockReadDirectory,
		},
		get workspaceFolders() {
			return mockWorkspaceFolders.value;
		},
	},
}));

vi.mock('os', () => ({
	homedir: () => '/Users/anthonykim',
}));

// --- Helpers -------------------------------------------------------------

const SESSION_UUID = 'ak1234fe-ae47-4c68-8123-f4adef123123';
const SESSION_DIR = `/Users/anthonykim/.copilot/session-state/${SESSION_UUID}`;

class MockTerminal {
	readonly processId = Promise.resolve(123);
	readonly name = 'test';
	readonly creationOptions = {};
	readonly exitStatus = undefined;
	readonly state = { isInteractedWith: false, shell: undefined };
	readonly selection = undefined;
	readonly shellIntegration = undefined;
	sendText() { }
	show() { }
	hide() { }
	dispose() { }
}

function makeTerminal(): Terminal {
	return new MockTerminal() as Terminal;
}

function makeContext(line: string, terminal: Terminal): TerminalLinkContext {
	return { line, terminal };
}

function makeToken(): CancellationToken {
	return { isCancellationRequested: false, onCancellationRequested: vi.fn() } as CancellationToken;
}

function makeCancelledToken(): CancellationToken {
	return { isCancellationRequested: true, onCancellationRequested: vi.fn() } as CancellationToken;
}

// --- Tests ---------------------------------------------------------------

describe('CopilotCLITerminalLinkProvider', () => {
	let provider: CopilotCLITerminalLinkProvider;
	let terminal: Terminal;
	let sessionDirUri: Uri;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockWorkspaceFolders.value = undefined;
		mockReadDirectory.mockResolvedValue([]);
		mockShowQuickPick.mockResolvedValue(undefined);
		const vscode = await import('vscode');

		provider = new CopilotCLITerminalLinkProvider(new TestLogService());
		terminal = makeTerminal();
		sessionDirUri = vscode.Uri.file(SESSION_DIR);

		provider.registerTerminal(terminal);
		provider.setSessionDir(terminal, sessionDirUri);

		// By default, stat succeeds (file exists).
		mockStat.mockResolvedValue({ type: 1 });
	});

	describe('relative paths', () => {
		it('should detect files/sample-summary.md', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('  Relative: files/sample-summary.md', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('files/sample-summary.md');
			expect(links[0].uri?.fsPath).toBe(`${SESSION_DIR}/files/sample-summary.md`);
		});

		it('should detect bare files/sample-summary.md at start of line', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('files/sample-summary.md', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('files/sample-summary.md');
		});

		it('should detect dot-prefixed ./files/sample-summary.md', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('./files/sample-summary.md', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('./files/sample-summary.md');
		});

		it('should detect standalone plan.md in a sentence', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('Created plan.md with next steps', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('plan.md');
			expect(links[0].uri?.fsPath).toBe(`${SESSION_DIR}/plan.md`);
		});

		it('should detect standalone plan.md with :line:col suffix', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('See plan.md:12:3 for details', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('plan.md');
			expect(links[0].line).toBe(12);
			expect(links[0].col).toBe(3);
		});

		it('should detect standalone filenames with 1-character extensions', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('Compile main.c next', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('main.c');
		});

		it('should not detect numeric tokens like version 1.2', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('Version 1.2 is installed', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(0);
		});

		it('should resolve bare filename to files/<name> when root file does not exist', async () => {
			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${SESSION_DIR}/todo.md`) {
					return Promise.reject(new Error('not found'));
				}
				if (uri.fsPath === `${SESSION_DIR}/files/todo.md`) {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			const links = await provider.provideTerminalLinks(
				makeContext('| todo.md | /Users/anthonykim/.copilot/session-state/id/files/todo.md | files/todo.md |', terminal),
				makeToken(),
			);

			const todoLink = links.find(link => link.pathText === 'todo.md');
			expect(todoLink).toBeDefined();
			expect(todoLink?.uri?.fsPath).toBe(`${SESSION_DIR}/files/todo.md`);
		});

		it('should resolve slash paths relative to files/ when session-root path does not exist', async () => {
			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${SESSION_DIR}/anotherFolderNamehere/thenyourfilehere.txt`) {
					return Promise.reject(new Error('not found'));
				}
				if (uri.fsPath === `${SESSION_DIR}/files/anotherFolderNamehere/thenyourfilehere.txt`) {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			const links = await provider.provideTerminalLinks(
				makeContext('anotherFolderNamehere/thenyourfilehere.txt', terminal),
				makeToken(),
			);

			expect(links).toHaveLength(1);
			expect(links[0].uri?.fsPath).toBe(`${SESSION_DIR}/files/anotherFolderNamehere/thenyourfilehere.txt`);
		});

		it('should resolve bare filename in nested session subdirectories', async () => {
			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${SESSION_DIR}/001-created-session-files-and-path.md`) {
					return Promise.reject(new Error('not found'));
				}
				if (uri.fsPath === `${SESSION_DIR}/files/001-created-session-files-and-path.md`) {
					return Promise.reject(new Error('not found'));
				}
				return Promise.reject(new Error('not found'));
			});

			mockReadDirectory.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === SESSION_DIR) {
					return Promise.resolve([
						['checkpoints', 2],
					]);
				}

				if (uri.fsPath === `${SESSION_DIR}/checkpoints`) {
					return Promise.resolve([
						['001-created-session-files-and-path.md', 1],
					]);
				}

				return Promise.resolve([]);
			});

			const links = await provider.provideTerminalLinks(
				makeContext('001-created-session-files-and-path.md', terminal),
				makeToken(),
			);

			expect(links).toHaveLength(1);
			expect(links[0].uri?.fsPath).toBe(`${SESSION_DIR}/checkpoints/001-created-session-files-and-path.md`);
		});
	});

	describe('tilde paths', () => {
		it('should expand ~/.copilot/session-state/.../files/sample-summary.md', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext(`  Absolute: ~/.copilot/session-state/${SESSION_UUID}/files/sample-summary.md`, terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toContain('~/.copilot/session-state');
			expect(links[0].uri?.fsPath).toBe(`/Users/anthonykim/.copilot/session-state/${SESSION_UUID}/files/sample-summary.md`);
		});
	});

	describe('absolute paths', () => {
		it('should skip /Users/anthonykim/.copilot/.../files/sample-summary.md', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext(`  /Users/anthonykim/.copilot/session-state/${SESSION_UUID}/files/sample-summary.md`, terminal),
				makeToken(),
			);
			// Absolute paths are skipped — the built-in detector handles them.
			expect(links).toHaveLength(0);
		});
	});

	describe('trailing punctuation', () => {
		it('should strip trailing period from files/sample-summary.md.', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('file at files/sample-summary.md.', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('files/sample-summary.md');
		});

		it('should strip multiple trailing dots', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('files/sample-summary.md...', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('files/sample-summary.md');
		});
	});

	describe('line and column suffixes', () => {
		it('should parse :line:col suffix', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('src/foo/bar.ts:10:5', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('src/foo/bar.ts');
			expect(links[0].line).toBe(10);
			expect(links[0].col).toBe(5);
		});

		it('should parse (line, col) suffix', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('src/foo/bar.ts(42, 7)', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].line).toBe(42);
			expect(links[0].col).toBe(7);
		});
	});

	describe('URLs', () => {
		it('should skip https:// URLs', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('Visit https://example.com/path for info', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(0);
		});
	});

	describe('guards', () => {
		it('should return empty for blank lines', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('   ', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(0);
		});

		it('should return empty for lines over 2000 chars', async () => {
			const longLine = 'files/summary.md ' + 'x'.repeat(2000);
			const links = await provider.provideTerminalLinks(
				makeContext(longLine, terminal),
				makeToken(),
			);
			expect(links).toHaveLength(0);
		});

		it('should cap links at 10 per line', async () => {
			const paths = Array.from({ length: 15 }, (_, i) => `dir/file${i}.ts`).join(' ');
			const links = await provider.provideTerminalLinks(
				makeContext(paths, terminal),
				makeToken(),
			);
			expect(links.length).toBeLessThanOrEqual(10);
		});

		it('should skip unregistered terminals with no session dirs', async () => {
			const unknownTerminal = makeTerminal();
			const links = await provider.provideTerminalLinks(
				makeContext('files/summary.md', unknownTerminal),
				makeToken(),
			);
			expect(links).toHaveLength(0);
		});

		it('should stop processing when cancellation is requested before path resolution', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('files/sample-summary.md', terminal),
				makeCancelledToken(),
			);
			expect(links).toHaveLength(0);
			expect(mockStat).not.toHaveBeenCalled();
			expect(mockReadDirectory).not.toHaveBeenCalled();
		});
	});

	describe('cancellation', () => {
		it('should stop nested lookup when token is cancelled during traversal', async () => {
			const token = makeToken();
			const cancellationState = { cancelled: false };
			Object.defineProperty(token, 'isCancellationRequested', {
				get: () => cancellationState.cancelled,
			});

			mockStat.mockRejectedValue(new Error('not found'));
			mockReadDirectory.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === SESSION_DIR) {
					cancellationState.cancelled = true;
					return Promise.resolve([
						['checkpoints', 2],
					]);
				}

				return Promise.resolve([]);
			});

			const links = await provider.provideTerminalLinks(
				makeContext('001-created-session-files-and-path.md', terminal),
				token,
			);

			expect(links).toHaveLength(0);
			expect(mockReadDirectory).toHaveBeenCalledTimes(1);
		});
	});

	describe('handleTerminalLink', () => {
		it('should prompt when multiple targets exist and open selected target', async () => {
			const vscode = await import('vscode');
			mockWorkspaceFolders.value = [{ uri: vscode.Uri.file('/workspace/project') }];

			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${SESSION_DIR}/plan.md`) {
					return Promise.resolve({ type: 1 });
				}
				if (uri.fsPath === '/workspace/project/plan.md') {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			mockShowQuickPick.mockImplementation(async (items: Array<{ uri: { fsPath: string }; label: string; description?: string; detail?: string }>) => {
				expect(items).toHaveLength(2);
				expect(items[0].label).toBe('plan.md');
				expect(items[1].label).toBe('plan.md');
				expect(items.some(item => item.description === 'session-state/ak1234fe-ae47-4c68-8123-f4adef123123')).toBe(true);
				expect(items.some(item => item.description === 'workspace')).toBe(true);
				expect(items.every(item => item.detail === undefined)).toBe(true);
				return items.find(item => item.uri.fsPath === '/workspace/project/plan.md');
			});

			const links = await provider.provideTerminalLinks(
				makeContext('plan.md', terminal),
				makeToken(),
			);

			expect(links).toHaveLength(1);
			await provider.handleTerminalLink(links[0]);
			expect(mockShowQuickPick).toHaveBeenCalled();
			expect(mockShowTextDocument).toHaveBeenCalled();
			expect(mockShowTextDocument.mock.calls[0][0].fsPath).toBe('/workspace/project/plan.md');
		});

		it('should not open when quick pick is cancelled', async () => {
			const vscode = await import('vscode');
			mockWorkspaceFolders.value = [{ uri: vscode.Uri.file('/workspace/project') }];

			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${SESSION_DIR}/plan.md`) {
					return Promise.resolve({ type: 1 });
				}
				if (uri.fsPath === '/workspace/project/plan.md') {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			mockShowQuickPick.mockResolvedValue(undefined);

			const links = await provider.provideTerminalLinks(
				makeContext('plan.md', terminal),
				makeToken(),
			);

			expect(links).toHaveLength(1);
			await provider.handleTerminalLink(links[0]);
			expect(mockShowQuickPick).toHaveBeenCalled();
			expect(mockShowTextDocument).not.toHaveBeenCalled();
		});

		it('should open directly without prompting when only one target exists', async () => {
			const vscode = await import('vscode');
			mockWorkspaceFolders.value = [{ uri: vscode.Uri.file('/workspace/project') }];

			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${SESSION_DIR}/plan.md`) {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			const links = await provider.provideTerminalLinks(
				makeContext('plan.md', terminal),
				makeToken(),
			);

			expect(links).toHaveLength(1);
			await provider.handleTerminalLink(links[0]);
			expect(mockShowQuickPick).not.toHaveBeenCalled();
			expect(mockShowTextDocument).toHaveBeenCalledTimes(1);
			expect(mockShowTextDocument.mock.calls[0][0].fsPath).toBe(`${SESSION_DIR}/plan.md`);
		});
	});

	describe('session dir resolution', () => {
		it('should resolve via session dir resolver when no cached dir', async () => {
			const vscode = await import('vscode');
			const freshTerminal = makeTerminal();
			provider.registerTerminal(freshTerminal);
			provider.setSessionDirResolver(async _t => [vscode.Uri.file(SESSION_DIR)]);

			const links = await provider.provideTerminalLinks(
				makeContext('files/demo.md', freshTerminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].uri?.fsPath).toBe(`${SESSION_DIR}/files/demo.md`);
		});

		it('should fall back to workspace folders when file not in session dir', async () => {
			const vscode = await import('vscode');
			// stat fails for session dir, succeeds for workspace
			mockStat.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ type: 1 });

			mockWorkspaceFolders.value = [{ uri: vscode.Uri.file('/workspace/project') }];

			const links = await provider.provideTerminalLinks(
				makeContext('src/index.ts', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].uri?.fsPath).toBe('/workspace/project/src/index.ts');
		});

		// Regression test for https://github.com/microsoft/vscode/issues/301594
		// Resolver first returned an unrelated session (only one tracked at the
		// time).
		it('should not cache stale resolver result when session tracker learns the real session later', async () => {
			const vscode = await import('vscode');
			const freshTerminal = makeTerminal();
			provider.registerTerminal(freshTerminal);

			const staleDir = '/Users/anthonykim/.copilot/session-state/31830812-0221-4389-b6bf-b1d33fe556e2';
			const realDir = '/Users/anthonykim/.copilot/session-state/278b1a81-eb86-4a81-bff0-ba68035c1b48';

			// sessionTracker initially only knows about an unrelated session,
			// then later also learns the real one for this terminal.
			let call = 0;
			provider.setSessionDirResolver(async _t => {
				call++;
				return call === 1
					? [vscode.Uri.file(staleDir)]
					: [vscode.Uri.file(staleDir), vscode.Uri.file(realDir)];
			});

			// files/file-01.md only exists under the real session dir.
			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${realDir}/files/file-01.md`) {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			// First hover: only the stale dir is known, file isn't found there.
			const first = await provider.provideTerminalLinks(
				makeContext('files/file-01.md', freshTerminal),
				makeToken(),
			);
			expect(first).toHaveLength(0);

			// Second hover: resolver must be consulted again and pick up the
			// real dir. Previously this returned the stale dir from the cache.
			const second = await provider.provideTerminalLinks(
				makeContext('files/file-01.md', freshTerminal),
				makeToken(),
			);
			expect(call).toBe(2);
			expect(second).toHaveLength(1);
			expect(second[0].uri?.fsPath).toBe(`${realDir}/files/file-01.md`);
		});

		it('should still consult resolver even when an explicit session dir is cached', async () => {
			const vscode = await import('vscode');
			const freshTerminal = makeTerminal();
			provider.registerTerminal(freshTerminal);

			const oldDir = '/Users/anthonykim/.copilot/session-state/old';
			const newDir = '/Users/anthonykim/.copilot/session-state/new';

			// Explicitly cached (e.g. resumed session) but user then started a
			// new `copilot` run in the same terminal.
			provider.setSessionDir(freshTerminal, vscode.Uri.file(oldDir));
			provider.setSessionDirResolver(async _t => [vscode.Uri.file(newDir)]);

			mockStat.mockImplementation((uri: { fsPath: string }) => {
				if (uri.fsPath === `${newDir}/files/demo.md`) {
					return Promise.resolve({ type: 1 });
				}
				return Promise.reject(new Error('not found'));
			});

			const links = await provider.provideTerminalLinks(
				makeContext('files/demo.md', freshTerminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].uri?.fsPath).toBe(`${newDir}/files/demo.md`);
		});

		// Scenario 1: User quits session X and starts session Y in the SAME
		// terminal. The stale cached dir from X's resume should not shadow Y's
		// active session dir, even when both have a file with the same name.
		it('should prefer active resolver dir over stale cached dir when file exists in both', async () => {
			const vscode = await import('vscode');
			const freshTerminal = makeTerminal();
			provider.registerTerminal(freshTerminal);

			const staleDir = '/Users/anthonykim/.copilot/session-state/ended-session';
			const activeDir = '/Users/anthonykim/.copilot/session-state/active-session';

			// Stale cache from a previous resumed session that has since ended.
			provider.setSessionDir(freshTerminal, vscode.Uri.file(staleDir));

			// Resolver only returns the active session (stale one was disposed).
			provider.setSessionDirResolver(async _t => [vscode.Uri.file(activeDir)]);

			// The file exists in BOTH dirs on disk (session-state persists).
			mockStat.mockResolvedValue({ type: 1 });

			const links = await provider.provideTerminalLinks(
				makeContext('files/summary.md', freshTerminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			// Must resolve to the active session dir, not the stale cached one.
			expect(links[0].uri?.fsPath).toBe(`${activeDir}/files/summary.md`);
		});

		// Scenario 2: Two terminals, each with its own session. The resolver
		// returns matching-terminal sessions first for correct isolation.
		it('should prefer terminal-matched resolver dirs over unrelated sessions', async () => {
			const vscode = await import('vscode');
			const terminalA = makeTerminal();
			const terminalB = makeTerminal();
			provider.registerTerminal(terminalA);
			provider.registerTerminal(terminalB);

			const sessionXDir = '/Users/anthonykim/.copilot/session-state/session-x';
			const sessionYDir = '/Users/anthonykim/.copilot/session-state/session-y';

			// Terminal-aware resolver: session X belongs to terminal A,
			// session Y belongs to terminal B.
			provider.setSessionDirResolver(async t => {
				if (t === terminalA) {
					return [vscode.Uri.file(sessionXDir), vscode.Uri.file(sessionYDir)];
				}
				return [vscode.Uri.file(sessionYDir), vscode.Uri.file(sessionXDir)];
			});

			// The file exists in both session dirs.
			mockStat.mockResolvedValue({ type: 1 });

			const linksA = await provider.provideTerminalLinks(
				makeContext('files/summary.md', terminalA),
				makeToken(),
			);
			expect(linksA).toHaveLength(1);
			expect(linksA[0].uri?.fsPath).toBe(`${sessionXDir}/files/summary.md`);

			const linksB = await provider.provideTerminalLinks(
				makeContext('files/summary.md', terminalB),
				makeToken(),
			);
			expect(linksB).toHaveLength(1);
			expect(linksB[0].uri?.fsPath).toBe(`${sessionYDir}/files/summary.md`);
		});
	});

	describe('extensionless files', () => {
		it('should detect dir/Makefile', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('dir/Makefile', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('dir/Makefile');
		});
	});

	describe('Windows paths', () => {
		it('should detect backslash relative paths', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('files\\sample-summary.md', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].pathText).toBe('files\\sample-summary.md');
		});

		it('should expand tilde with backslash (~\\.copilot\\...)', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('Create ~\\.copilot\\session-state\\5d9e\\files\\sample-summary.md (+4)', terminal),
				makeToken(),
			);
			expect(links).toHaveLength(1);
			expect(links[0].uri?.fsPath).toContain('/Users/anthonykim');
			expect(links[0].uri?.fsPath).toContain('.copilot');
		});

		it('should skip Windows absolute paths (C:\\...)', async () => {
			const links = await provider.provideTerminalLinks(
				makeContext('Absolute: C:\\Users\\antho\\.copilot\\files\\sample-summary.md', terminal),
				makeToken(),
			);
			// C:\... matched as \Users\... which starts with \ and is skipped.
			expect(links).toHaveLength(0);
		});
	});
});
