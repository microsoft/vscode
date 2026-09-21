/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getNativeCliArguments, getNativeCliBundledExecutablePaths, isStoredNativeCliSession, IStoredNativeCliSession, readNativeCopilotForeground, readNativeCopilotMetadata, resolveNativeCliWorkspace } from '../../common/nativeCli.js';

suite('Native CLI session configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const id = '12345678-1234-1234-1234-123456789abc';

	test('launches interactive CLIs without overriding authentication or approval settings', () => {
		assert.deepStrictEqual({
			copilot: getNativeCliArguments('copilot', id, false),
			claude: getNativeCliArguments('claude', id, false),
			codex: getNativeCliArguments('codex', id, false),
			copilotResume: getNativeCliArguments('copilot', id, true),
			claudeResume: getNativeCliArguments('claude', id, true),
			codexResume: getNativeCliArguments('codex', id, true, id),
			codexUnboundResume: getNativeCliArguments('codex', id, true),
		}, {
			copilot: ['--session-id', id],
			claude: ['--session-id', id],
			codex: [],
			copilotResume: ['--session-id', id],
			claudeResume: ['--resume', id],
			codexResume: ['resume', id],
			codexUnboundResume: ['resume'],
		});
	});

	test('retains the selected local repository and requires trust', () => {
		const folder = URI.file('/repos/my project');
		const workspace = resolveNativeCliWorkspace(folder);
		assert.deepStrictEqual({
			resource: workspace?.uri.toString(),
			directory: workspace?.folders[0].workingDirectory.toString(),
			root: workspace?.folders[0].root.toString(),
			trust: workspace?.requiresWorkspaceTrust,
			virtual: workspace?.isVirtualWorkspace,
			remote: resolveNativeCliWorkspace(URI.parse('vscode-remote://host/repos/project')),
		}, { resource: folder.toString(), directory: folder.toString(), root: folder.toString(), trust: true, virtual: false, remote: undefined });
	});

	test('resolves the native binary layouts shipped by each provider', () => {
		assert.deepStrictEqual({
			copilot: getNativeCliBundledExecutablePaths('copilot', 'darwin', 'arm64'),
			claude: getNativeCliBundledExecutablePaths('claude', 'linux', 'x64'),
			codexMac: getNativeCliBundledExecutablePaths('codex', 'darwin', 'arm64'),
			codexWindows: getNativeCliBundledExecutablePaths('codex', 'win32', 'x64'),
		}, {
			copilot: ['@github/copilot-darwin-arm64/copilot'],
			claude: ['@anthropic-ai/claude-agent-sdk-linux-x64/claude', '@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude'],
			codexMac: ['@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex'],
			codexWindows: ['@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe'],
		});
	});

	test('validates persisted session state instead of accepting malformed launch arguments', () => {
		const data: IStoredNativeCliSession = {
			id, kind: 'copilot', folder: URI.file('/repo').toString(), title: 'Session', createdAt: 1, updatedAt: 2,
			isArchived: false, isRead: true, hasStarted: true, titleIsUserDefined: false,
		};
		assert.deepStrictEqual([
			isStoredNativeCliSession(data),
			isStoredNativeCliSession({ ...data, id: '--allow-all-tools' }),
			isStoredNativeCliSession({ ...data, kind: 'shell' }),
			isStoredNativeCliSession({ ...data, updatedAt: NaN }),
			isStoredNativeCliSession({ ...data, nativeSessionId: '--last' }),
			isStoredNativeCliSession({ ...data, nativeSessionId: '-'.repeat(36) }),
			isStoredNativeCliSession({ ...data, baseRef: 'a'.repeat(41) }),
			isStoredNativeCliSession({ ...data, changesSummary: { files: -1, additions: 0, deletions: 0 } }),
			isStoredNativeCliSession(null),
		], [true, false, false, false, false, false, false, false, false]);
	});

	test('reads exact Copilot foreground records and bounded native metadata', () => {
		const timestamp = '2026-09-14T17:06:50.941Z';
		assert.deepStrictEqual({
			foreground: readNativeCopilotForeground(`${timestamp} [INFO] Registering foreground session: ${id}\r`),
			unrelated: readNativeCopilotForeground(`${timestamp} [INFO] Workspace initialized: ${id}`),
			malformed: readNativeCopilotForeground(`${timestamp} [INFO] Registering foreground session: --latest`),
			metadata: readNativeCopilotMetadata(`id: ${id}\ncwd: /repo\nname: Native task\n`),
		}, {
			foreground: { sessionId: id, timestamp: Date.parse(timestamp) },
			unrelated: undefined, malformed: undefined,
			metadata: { id, cwd: '/repo', title: 'Native task' },
		});
		assert.throws(() => readNativeCopilotMetadata(`id: ${id}\ncwd: ../another-repo`), /directory/);
	});
});
