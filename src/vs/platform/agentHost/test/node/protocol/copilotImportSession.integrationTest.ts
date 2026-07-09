/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK integration test for IMPORTING a translated conversation.
 *
 * Validates the core premise of local→Copilot-CLI migration: a synthesized
 * `events.jsonl` (built by {@link buildSessionEventLogFromTurns}) seeded through
 * a {@link DiskSessionFsProvider}, then `resumeSession`d, reconstitutes as real
 * SDK turns — and is therefore editable (proven by `history.truncate`).
 *
 * Disabled by default. To run it, set `AGENT_HOST_REAL_SDK=1` (a Copilot CLI
 * package must be installed under `node_modules/@github/copilot*`):
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/copilotImportSession.integrationTest.ts
 *
 * Authentication: token from `gh auth token`, overridable via `GITHUB_TOKEN`.
 */

import assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { CopilotClient, RuntimeConnection, approveAll, type CopilotSession, type SessionEvent, type SessionFsFileInfo, type SessionFsProvider } from '@github/copilot-sdk';
import { FileAccess } from '../../../../../base/common/network.js';
import { delimiter, dirname, join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { rgDiskPath } from '../../../../../base/node/ripgrep.js';
import { MessageKind, ResponsePartKind, TurnState, type ResponsePart, type Turn } from '../../../common/state/sessionState.js';
import { buildSessionEventLogFromTurns } from '../../../node/copilot/buildSessionEvents.js';
import { DiskSessionFsProvider } from '../../../node/copilot/diskSessionFsProvider.js';
import { resolveGitHubToken } from './realSdkTestHelpers.js';

/**
 * Directory entry shape returned by {@link SessionFsProvider.readdirWithTypes}.
 * Mirrors the SDK's `SessionFsReaddirWithTypesEntry`, which is not re-exported
 * from the package root.
 */
type SessionFsReaddirWithTypesEntry = { name: string; type: 'file' | 'directory' };

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

/** Session-state directory the client advertises to the runtime for session-scoped files. */
const SESSION_STATE_PATH = 'session-state';

/** `node_modules` directory that ships alongside the compiled `out/`. */
function nodeModulesUri(): URI {
	return URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules');
}

/** Resolve a Copilot CLI entry point from `node_modules/@github/copilot*`. */
async function resolveCopilotCliPath(): Promise<string> {
	const nodeModules = URI.joinPath(nodeModulesUri(), '@github').fsPath;
	const entries = await fs.readdir(nodeModules).catch(() => [] as string[]);
	const candidates = entries
		.filter(name => name === 'copilot' || name.startsWith('copilot-'))
		.filter(name => name !== 'copilot-sdk')
		.map(name => join(nodeModules, name, 'index.js'));
	for (const candidate of candidates) {
		if (await fs.stat(candidate).then(() => true, () => false)) {
			return candidate;
		}
	}
	throw new Error(`No Copilot CLI found under ${nodeModules} (looked for copilot*/index.js). Install a @github/copilot-<platform> package.`);
}

/**
 * Build the subprocess environment the Copilot CLI needs to start in
 * stdio-server mode. Mirrors the production wiring in `copilotAgent.ts`:
 * without `COPILOT_CLI_RUN_AS_NODE=1` the CLI entry point runs interactively
 * and exits ("CLI server exited unexpectedly with code 0"), and without
 * `MXC_BIN_DIR` the sandbox auto-detection cannot locate its binaries.
 */
async function buildCliEnv(): Promise<Record<string, string | undefined>> {
	const env: Record<string, string | undefined> = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
	delete env['NODE_OPTIONS'];
	delete env['VSCODE_INSPECTOR_OPTIONS'];
	delete env['VSCODE_ESM_ENTRYPOINT'];
	delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
	for (const key of Object.keys(env)) {
		if (key === 'ELECTRON_RUN_AS_NODE') {
			continue;
		}
		if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
			delete env[key];
		}
	}
	env['COPILOT_CLI_RUN_AS_NODE'] = '1';
	env['USE_BUILTIN_RIPGREP'] = 'false';
	env['COPILOT_MCP_APPS'] = 'true';

	// Point the MXC sandbox auto-detection at VS Code's bundled binaries.
	env['MXC_BIN_DIR'] = URI.joinPath(nodeModulesUri(), '@microsoft', 'mxc-sdk', 'bin').fsPath;

	// Make VS Code's built-in ripgrep discoverable to the CLI subprocess.
	const rgDir = dirname(await rgDiskPath());
	const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
	const currentPath = env[pathKey];
	env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;

	return env;
}

/** Recursively list every file under `root`, returned as paths relative to `root`. */
async function walkFiles(root: string): Promise<string[]> {
	const out: string[] = [];
	const rec = async (dir: string, rel: string): Promise<void> => {
		let names: string[];
		try {
			names = await fs.readdir(dir);
		} catch {
			return;
		}
		for (const name of names) {
			const childRel = rel ? join(rel, name) : name;
			const stat = await fs.stat(join(dir, name)).catch(() => undefined);
			if (stat?.isDirectory()) {
				await rec(join(dir, name), childRel);
			} else if (stat) {
				out.push(childRel);
			}
		}
	};
	await rec(root, '');
	return out;
}

/** Wraps a provider to record the SessionFs paths the runtime touches (diagnostics on failure). */
class RecordingSessionFsProvider implements SessionFsProvider {
	readonly reads: string[] = [];
	constructor(private readonly _inner: SessionFsProvider) { }
	readFile(path: string): Promise<string> { this.reads.push(`readFile ${path}`); return this._inner.readFile(path); }
	writeFile(path: string, content: string, mode?: number): Promise<void> { return this._inner.writeFile(path, content, mode); }
	appendFile(path: string, content: string, mode?: number): Promise<void> { return this._inner.appendFile(path, content, mode); }
	exists(path: string): Promise<boolean> { this.reads.push(`exists ${path}`); return this._inner.exists(path); }
	stat(path: string): Promise<SessionFsFileInfo> { this.reads.push(`stat ${path}`); return this._inner.stat(path); }
	mkdir(path: string, recursive: boolean, mode?: number): Promise<void> { return this._inner.mkdir(path, recursive, mode); }
	readdir(path: string): Promise<string[]> { this.reads.push(`readdir ${path}`); return this._inner.readdir(path); }
	readdirWithTypes(path: string): Promise<SessionFsReaddirWithTypesEntry[]> { this.reads.push(`readdirWithTypes ${path}`); return this._inner.readdirWithTypes(path); }
	rm(path: string, recursive: boolean, force: boolean): Promise<void> { return this._inner.rm(path, recursive, force); }
	rename(src: string, dest: string): Promise<void> { return this._inner.rename(src, dest); }
}

function markdown(content: string): ResponsePart {
	return { kind: ResponsePartKind.Markdown, id: generateUuid(), content };
}

function userTurn(id: string, text: string, response: string): Turn {
	return {
		id,
		message: { text, origin: { kind: MessageKind.User } },
		responseParts: response ? [markdown(response)] : [],
		usage: undefined,
		state: TurnState.Complete,
	};
}

(REAL_SDK_ENABLED ? suite : suite.skip)('Real Copilot SDK — import via seeded events.jsonl', function () {

	this.timeout(120_000);

	let client: CopilotClient;
	let baseDir: string;

	suiteSetup(async function () {
		baseDir = await fs.mkdtemp(join(tmpdir(), 'ahp-import-'));
		const cliPath = await resolveCopilotCliPath();
		client = new CopilotClient({
			useLoggedInUser: false,
			gitHubToken: resolveGitHubToken(),
			connection: RuntimeConnection.forStdio({ path: cliPath }),
			env: await buildCliEnv(),
			logLevel: 'error',
			sessionFs: {
				initialCwd: baseDir,
				sessionStatePath: SESSION_STATE_PATH,
				conventions: process.platform === 'win32' ? 'windows' : 'posix',
			},
		});
		await client.start();
	});

	suiteTeardown(async function () {
		await client?.stop().catch(() => { });
		if (baseDir) {
			await fs.rm(baseDir, { recursive: true, force: true }).catch(() => { });
		}
	});

	test('seeded conversation resumes as real, editable turns', async function () {
		const sessionId = generateUuid();
		const turns: Turn[] = [
			userTurn('turn-a', 'What is 2+2? Reply with just the number.', 'It is 4.'),
			userTurn('turn-b', 'And 3+3? Reply with just the number.', 'It is 6.'),
		];

		// Seed the synthesized event log at the runtime's session-state path.
		const sessionDir = join(baseDir, SESSION_STATE_PATH);
		await fs.mkdir(sessionDir, { recursive: true });
		const jsonl = buildSessionEventLogFromTurns(turns, { sessionId, workingDirectory: baseDir });
		await fs.writeFile(join(sessionDir, 'events.jsonl'), jsonl, 'utf8');

		const provider = new RecordingSessionFsProvider(new DiskSessionFsProvider(baseDir));

		let session: CopilotSession;
		try {
			session = await client.resumeSession(sessionId, {
				onPermissionRequest: approveAll,
				createSessionFsProvider: () => provider,
				workingDirectory: baseDir,
			});
		} catch (err) {
			assert.fail(`resumeSession failed. SessionFs accesses:\n  ${provider.reads.join('\n  ')}\nError: ${err instanceof Error ? err.message : String(err)}`);
		}

		try {
			const events: SessionEvent[] = await session.getEvents();
			const userMessages = events.filter(e => e.type === 'user.message').map(e => e.data.content);
			assert.ok(
				userMessages.some(c => c.includes('What is 2+2?')) && userMessages.some(c => c.includes('And 3+3?')),
				`expected both imported prompts in reconstructed history, got: ${JSON.stringify(userMessages)}\nSessionFs accesses:\n  ${provider.reads.join('\n  ')}`,
			);

			// Editability: truncating at the first imported user turn removes it
			// and everything after — only possible because these are real events.
			const firstUser = events.find(e => e.type === 'user.message');
			assert.ok(firstUser, 'expected a reconstructed user.message event');
			const truncate = await session.rpc.history.truncate({ eventId: firstUser.id });
			assert.ok(truncate.eventsRemoved >= 1, `expected truncate to remove events, removed ${truncate.eventsRemoved}`);
		} finally {
			await session.disconnect().catch(() => { });
		}
	});
});

/**
 * Validates the PRODUCTION import seam: `SessionConfigBase.configDirectory`.
 *
 * Unlike the `SessionFsProvider` route above (which requires flipping the
 * client-level `sessionFs` master switch — routing *all* sessions through a
 * provider and dropping native SQLite/todo support), `configDirectory` is a
 * per-session override. We seed a synthesized `events.jsonl` at the CLI's
 * native on-disk layout under a per-session `configDirectory`, then resume
 * with an ordinary client (no `sessionFs`), leaving every other session's
 * storage untouched. The test first creates a throwaway session to *discover*
 * the exact native layout, then seeds a fresh session at that layout.
 */
(REAL_SDK_ENABLED ? suite : suite.skip)('Real Copilot SDK — import via configDirectory (native storage)', function () {

	this.timeout(120_000);

	let client: CopilotClient;
	let root: string;
	let configDir: string;
	let workDir: string;

	suiteSetup(async function () {
		root = await fs.mkdtemp(join(tmpdir(), 'ahp-import-cfg-'));
		configDir = join(root, 'config');
		workDir = join(root, 'work');
		await fs.mkdir(configDir, { recursive: true });
		await fs.mkdir(workDir, { recursive: true });
		const cliPath = await resolveCopilotCliPath();
		client = new CopilotClient({
			// Deliberately NO `sessionFs`: native on-disk storage, redirected
			// per session via `configDirectory` — the low-risk production seam.
			useLoggedInUser: false,
			gitHubToken: resolveGitHubToken(),
			connection: RuntimeConnection.forStdio({ path: cliPath }),
			env: await buildCliEnv(),
			logLevel: 'error',
		});
		await client.start();
	});

	suiteTeardown(async function () {
		await client?.stop().catch(() => { });
		if (root) {
			await fs.rm(root, { recursive: true, force: true }).catch(() => { });
		}
	});

	test('seeding events.jsonl under configDirectory resumes as real, editable turns', async function () {
		// Phase 1 — discover the native events.jsonl layout by creating a
		// throwaway session and inspecting what the CLI writes on disk.
		const discoverId = generateUuid();
		try {
			const throwaway = await client.createSession({
				sessionId: discoverId,
				configDirectory: configDir,
				workingDirectory: workDir,
				onPermissionRequest: approveAll,
			});
			await throwaway.disconnect().catch(() => { });
		} catch {
			// Best-effort discovery; fall back to the assumed layout below.
		}
		const discoveredRel = (await walkFiles(configDir)).find(f => f.endsWith('events.jsonl') && f.includes(discoverId));

		// Phase 2 — seed a fresh session's events.jsonl at the discovered
		// layout (or the assumed one) and resume it with the normal client.
		const importId = generateUuid();
		const turns: Turn[] = [
			userTurn('turn-a', 'What is 2+2? Reply with just the number.', 'It is 4.'),
			userTurn('turn-b', 'And 3+3? Reply with just the number.', 'It is 6.'),
		];
		const jsonl = buildSessionEventLogFromTurns(turns, { sessionId: importId, workingDirectory: workDir });
		const seedRel = discoveredRel
			? discoveredRel.replace(discoverId, importId)
			: join('session-state', importId, 'events.jsonl');
		const seedPath = join(configDir, seedRel);
		await fs.mkdir(dirname(seedPath), { recursive: true });
		await fs.writeFile(seedPath, jsonl, 'utf8');

		let session: CopilotSession;
		try {
			session = await client.resumeSession(importId, {
				configDirectory: configDir,
				workingDirectory: workDir,
				onPermissionRequest: approveAll,
			});
		} catch (err) {
			const tree = (await walkFiles(configDir)).join('\n  ');
			assert.fail(`resumeSession(configDirectory) failed.\nDiscovered layout: ${discoveredRel ?? '(none — used assumed layout)'}\nSeeded at: ${seedRel}\nconfigDir tree:\n  ${tree}\nError: ${err instanceof Error ? err.message : String(err)}`);
		}

		try {
			const events: SessionEvent[] = await session.getEvents();
			const userMessages = events.filter(e => e.type === 'user.message').map(e => e.data.content);
			assert.ok(
				userMessages.some(c => c.includes('What is 2+2?')) && userMessages.some(c => c.includes('And 3+3?')),
				`expected both imported prompts in reconstructed history, got: ${JSON.stringify(userMessages)}\nSeeded at: ${seedRel}`,
			);

			const firstUser = events.find(e => e.type === 'user.message');
			assert.ok(firstUser, 'expected a reconstructed user.message event');
			const truncate = await session.rpc.history.truncate({ eventId: firstUser.id });
			assert.ok(truncate.eventsRemoved >= 1, `expected truncate to remove events, removed ${truncate.eventsRemoved}`);
		} finally {
			await session.disconnect().catch(() => { });
		}
	});
});
