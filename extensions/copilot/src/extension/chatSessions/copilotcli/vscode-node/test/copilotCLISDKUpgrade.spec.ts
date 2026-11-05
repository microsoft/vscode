/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'fs';
import { isBinaryFile } from 'isbinaryfile';
import { createRequire, syncBuiltinESMExports } from 'module';
import * as os from 'os';
import * as path from 'path';
import { beforeAll, describe, it } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { copyRipgrepShim } from '../../../copilotcli/node/ripgrepShim';

describe('CopilotCLI SDK Upgrade', function () {
	const extensionPath = path.join(__dirname, '..', '..', '..', '..', '..', '..');
	const copilotSDKPath = path.join(extensionPath, 'node_modules', '@github', 'copilot');
	beforeAll(async function () {
		await copyBinaries(extensionPath);
	});

	it('should be able to load the SDK without errors', async function () {
		await import('@github/copilot/sdk');
	}, 10000);

	it('should not contain new native binaries nor removed native binaries', async function () {
		// This is a very basic check to ensure that when the Copilot CLI SDK is upgraded,
		// we are aware of any changes to the native binaries it contains.
		// Such changes may require us to update our extension packaging or other handling.
		const existingBinaries = new Set(await findAllBinaries(copilotSDKPath));
		const knownBinaries = new Set([
			// ripgrep
			path.join('ripgrep', 'bin', 'win32-arm64', 'rg.exe'),
			path.join('ripgrep', 'bin', 'win32-x64', 'rg.exe'),
			// cli-native to be included
			path.join('prebuilds', 'darwin-arm64', 'cli-native.node'),
			path.join('prebuilds', 'darwin-x64', 'cli-native.node'),
			path.join('prebuilds', 'linux-arm64', 'cli-native.node'),
			path.join('prebuilds', 'linux-x64', 'cli-native.node'),
			path.join('prebuilds', 'linuxmusl-arm64', 'cli-native.node'),
			path.join('prebuilds', 'linuxmusl-x64', 'cli-native.node'),
			path.join('prebuilds', 'win32-arm64', 'cli-native.node'),
			path.join('prebuilds', 'win32-x64', 'cli-native.node'),
			// Native modules present in the raw @github/copilot package. Root
			// prebuilds are stripped from the shipped extension by .vscodeignore.
			path.join('prebuilds', 'darwin-arm64', 'runtime.node'),
			path.join('prebuilds', 'darwin-x64', 'runtime.node'),
			path.join('prebuilds', 'linux-arm64', 'runtime.node'),
			path.join('prebuilds', 'linux-x64', 'runtime.node'),
			path.join('prebuilds', 'linuxmusl-arm64', 'runtime.node'),
			path.join('prebuilds', 'linuxmusl-x64', 'runtime.node'),
			path.join('prebuilds', 'win32-arm64', 'runtime.node'),
			path.join('prebuilds', 'win32-x64', 'runtime.node'),
			// Second copy of native prebuilds re-shipped by the @github/copilot/sdk subpackage
			// (previously hidden by a broad sdk/prebuilds/** exclusion that masked the node-pty files we used to shim in at test setup).
			path.join('sdk', 'prebuilds', 'darwin-arm64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'darwin-x64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'linux-arm64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'linux-x64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'linuxmusl-arm64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'linuxmusl-x64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'win32-arm64', 'runtime.node'),
			path.join('sdk', 'prebuilds', 'win32-x64', 'runtime.node'),
			path.join('ripgrep', 'bin', 'darwin-arm64', 'rg'),
			path.join('ripgrep', 'bin', 'darwin-x64', 'rg'),
			path.join('ripgrep', 'bin', 'linux-x64', 'rg'),
			path.join('ripgrep', 'bin', 'linux-arm64', 'rg'),
			path.join('ripgrep', 'bin', 'linuxmusl-arm64', 'rg'),
			path.join('ripgrep', 'bin', 'linuxmusl-x64', 'rg'),
			// tgrep files
			path.join('tgrep', 'bin', 'darwin-arm64', 'tgrep'),
			path.join('tgrep', 'bin', 'darwin-x64', 'tgrep'),
			path.join('tgrep', 'bin', 'linux-x64', 'tgrep'),
			path.join('tgrep', 'bin', 'linux-arm64', 'tgrep'),
			path.join('tgrep', 'bin', 'linuxmusl-arm64', 'tgrep'),
			path.join('tgrep', 'bin', 'linuxmusl-x64', 'tgrep'),
			path.join('tgrep', 'bin', 'win32-arm64', 'tgrep.exe'),
			path.join('tgrep', 'bin', 'win32-x64', 'tgrep.exe'),
			// tgrep files
			path.join('sdk', 'tgrep', 'bin', 'darwin-arm64', 'tgrep'),
			path.join('sdk', 'tgrep', 'bin', 'darwin-x64', 'tgrep'),
			path.join('sdk', 'tgrep', 'bin', 'linux-x64', 'tgrep'),
			path.join('sdk', 'tgrep', 'bin', 'linux-arm64', 'tgrep'),
			path.join('sdk', 'tgrep', 'bin', 'linuxmusl-arm64', 'tgrep'),
			path.join('sdk', 'tgrep', 'bin', 'linuxmusl-x64', 'tgrep'),
			path.join('sdk', 'tgrep', 'bin', 'win32-arm64', 'tgrep.exe'),
			path.join('sdk', 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'),
			// cli-native to be included
			path.join('sdk', 'prebuilds', 'darwin-arm64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'darwin-x64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'linux-arm64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'linux-x64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'linuxmusl-arm64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'linuxmusl-x64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'win32-arm64', 'cli-native.node'),
			path.join('sdk', 'prebuilds', 'win32-x64', 'cli-native.node'),
			// foundry-local-sdk vendored native bindings.
			path.join('foundry-local-sdk', 'node_modules', 'foundry-local-sdk', 'prebuilds', 'darwin-arm64', 'foundry_local_napi.node'),
			path.join('foundry-local-sdk', 'node_modules', 'foundry-local-sdk', 'prebuilds', 'linux-x64', 'foundry_local_napi.node'),
			path.join('foundry-local-sdk', 'node_modules', 'foundry-local-sdk', 'prebuilds', 'linux-arm64', 'foundry_local_napi.node'),
			path.join('foundry-local-sdk', 'node_modules', 'foundry-local-sdk', 'prebuilds', 'win32-arm64', 'foundry_local_napi.node'),
			path.join('foundry-local-sdk', 'node_modules', 'foundry-local-sdk', 'prebuilds', 'win32-x64', 'foundry_local_napi.node'),
			// pvrecorder vendored native bindings.
			path.join('pvrecorder', 'node_modules', '@picovoice', 'pvrecorder-node', 'lib', 'linux', 'x86_64', 'pv_recorder.node'),
			path.join('pvrecorder', 'node_modules', '@picovoice', 'pvrecorder-node', 'lib', 'mac', 'arm64', 'pv_recorder.node'),
			path.join('pvrecorder', 'node_modules', '@picovoice', 'pvrecorder-node', 'lib', 'mac', 'x86_64', 'pv_recorder.node'),
			path.join('pvrecorder', 'node_modules', '@picovoice', 'pvrecorder-node', 'lib', 'windows', 'amd64', 'pv_recorder.node'),
			path.join('pvrecorder', 'node_modules', '@picovoice', 'pvrecorder-node', 'lib', 'windows', 'arm64', 'pv_recorder.node'),
			// parsing commands for shell.
			'tree-sitter-bash.wasm',
			'tree-sitter.wasm',
			'tree-sitter-c_sharp.wasm',
			'tree-sitter-c.wasm',
			'tree-sitter-cpp.wasm',
			'tree-sitter-css.wasm',
			'tree-sitter-html.wasm',
			'tree-sitter-java.wasm',
			'tree-sitter-php.wasm',
			'tree-sitter-go.wasm',
			'tree-sitter-json.wasm',
			'tree-sitter-javascript.wasm',
			'tree-sitter-python.wasm',
			'tree-sitter-ruby.wasm',
			'tree-sitter-tsx.wasm',
			'tree-sitter-rust.wasm',
			'tree-sitter-typescript.wasm',
			'tree-sitter-scala.wasm',
		].map(p => path.join(copilotSDKPath, p)));

		// Exclude ripgrep files that we copy over in src/extension/chatSessions/copilotcli/node/ripgrepShim.ts (until we get better API/solution from SDK)
		const ripgrepFilesWeCopy = path.join(copilotSDKPath, 'sdk', 'ripgrep', 'bin');

		const errors: string[] = [];
		// Look for new binaries
		for (const binary of existingBinaries) {
			if (binary.startsWith(ripgrepFilesWeCopy)) {
				continue;
			}
			const binaryName = path.basename(binary);
			if (binaryName.startsWith('keytar') || binaryName.startsWith('clipboard')) {
				continue;
			}
			if (!knownBinaries.has(binary)) {
				errors.push(`Unexpected native binary found in Copilot CLI SDK: ${path.relative(copilotSDKPath, binary)}`);
			}
		}
		// Look for removed binaries.
		for (const binary of knownBinaries) {
			if (binary.startsWith(ripgrepFilesWeCopy)) {
				continue;
			}
			if (!existingBinaries.has(binary)) {
				if (isNonCurrentCopilotPlatformBinary(copilotSDKPath, binary) || isNonCurrentPvRecorderBinary(copilotSDKPath, binary)) {
					continue;
				}
				errors.push(`Expected native binary missing from Copilot CLI SDK: ${path.relative(copilotSDKPath, binary)}`);
			}
		}

		if (errors.length > 0) {
			throw new Error(errors.join('\n'));
		}
	}, 30000);

	it('should be able to load the @github/copilot module without errors', async function () {
		await import('@github/copilot/sdk');
	});

	// `CopilotCLISessionService` relies on these listing semantics to avoid opening every
	// session's event log at once (see SESSION_LIST_OPTIONS). Fail loudly if an SDK update changes them.
	it('lists ids only with metadataLimit 0 and enriches like a full listing', async function () {
		const originalCopilotHome = process.env.COPILOT_HOME;
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-sdk-listing-'));
		process.env.COPILOT_HOME = path.join(tempHome, '.copilot');
		try {
			const writeSession = async (sessionId: string, options: { userMessage?: string; name?: string }) => {
				const sessionDir = path.join(process.env.COPILOT_HOME!, 'session-state', sessionId);
				await fs.mkdir(sessionDir, { recursive: true });
				await fs.writeFile(path.join(sessionDir, 'workspace.yaml'), `id: ${sessionId}\ncwd: /work/${sessionId}\n${options.name ? `name: ${options.name}\n` : ''}`);
				const events = [JSON.stringify({ type: 'session.start', data: { sessionId } })];
				if (options.userMessage) {
					events.push(JSON.stringify({ type: 'user.message', data: { content: options.userMessage } }));
				}
				await fs.writeFile(path.join(sessionDir, 'events.jsonl'), events.join('\n') + '\n');
			};
			await writeSession('00000000-0000-0000-0000-000000000001', { userMessage: 'hello' });
			await writeSession('00000000-0000-0000-0000-000000000002', {});
			await writeSession('00000000-0000-0000-0000-000000000003', { name: 'Named' });

			const sdk = await import('@github/copilot/sdk');
			const sessionManager = new sdk.internal.LocalSessionManager({
				createFeatureFlagService: sdk.createLocalFeatureFlagServiceCreator(),
				telemetryService: new sdk.internal.NoopTelemetryService(),
				autoModeManager: new sdk.AutoModeSessionManager(),
			}, { flushDebounceMs: undefined, settings: undefined, version: undefined });
			const summarize = (sessions: readonly { sessionId: string; summary?: string; context?: { cwd?: string } }[]) =>
				sessions.map(s => ({ id: s.sessionId.slice(-1), summary: s.summary, hasContext: s.context !== undefined })).sort((a, b) => a.id.localeCompare(b.id));

			// Record which session files each step touches through Node's `fs`. The ids-only
			// listing must not touch any; the full listing is the positive control that proves
			// this observer still sees the SDK's reads (its detached-status scan opens
			// `events.jsonl` via `fs/promises`). The SDK reads `workspace.yaml` and the first
			// user message in native code, which only the returned-metadata checks can cover.
			type ListingPhase = 'idsOnly' | 'enrich' | 'full';
			let phase: ListingPhase = 'idsOnly';
			const sessionFileAccess: Record<ListingPhase, Set<string>> = { idsOnly: new Set(), enrich: new Set(), full: new Set() };
			const stopObserving = observeSessionFileAccess(fileName => sessionFileAccess[phase].add(fileName));
			let listed: Awaited<ReturnType<typeof sessionManager.listSessions>>;
			let enriched: Awaited<ReturnType<typeof sessionManager.enrichSessionMetadata>>;
			let full: Awaited<ReturnType<typeof sessionManager.listSessions>>;
			try {
				listed = await sessionManager.listSessions({ metadataLimit: 0, includeDetached: false });
				phase = 'enrich';
				enriched = await sessionManager.enrichSessionMetadata(listed);
				phase = 'full';
				full = await sessionManager.listSessions();
			} finally {
				stopObserving();
			}

			assert.deepStrictEqual({
				listed: summarize(listed),
				enriched: summarize(enriched),
				idsOnlyListingFileAccess: [...sessionFileAccess.idsOnly],
				fullListingOpensEventLogsObservably: sessionFileAccess.full.has('events.jsonl'),
			}, {
				listed: [
					{ id: '1', summary: undefined, hasContext: false },
					{ id: '2', summary: undefined, hasContext: false },
					{ id: '3', summary: undefined, hasContext: false },
				],
				enriched: summarize(full),
				idsOnlyListingFileAccess: [],
				fullListingOpensEventLogsObservably: true,
			});
			assert.deepStrictEqual(summarize(enriched).map(s => s.id), ['1', '3']);
		} finally {
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	}, 30000);
});

const copilotPlatformArchs = new Set([
	'darwin-arm64',
	'darwin-x64',
	'linux-arm64',
	'linux-x64',
	'linuxmusl-arm64',
	'linuxmusl-x64',
	'win32-arm64',
	'win32-x64',
]);

function currentCopilotPlatformArch(): string {
	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
	if (process.platform === 'linux' && !report?.header?.glibcVersionRuntime) {
		return `linuxmusl-${process.arch}`;
	}

	return `${process.platform}-${process.arch}`;
}

function isNonCurrentCopilotPlatformBinary(copilotSDKPath: string, binary: string): boolean {
	const relativeSegments = path.relative(copilotSDKPath, binary).split(path.sep);
	const platformArch = relativeSegments.find(segment => copilotPlatformArchs.has(segment));
	return platformArch !== undefined && platformArch !== currentCopilotPlatformArch();
}

function isNonCurrentPvRecorderBinary(copilotSDKPath: string, binary: string): boolean {
	const relative = path.relative(copilotSDKPath, binary).split(path.sep).join(path.posix.sep);
	const pvRecorderPrefix = 'pvrecorder/node_modules/@picovoice/pvrecorder-node/lib/';
	if (!relative.startsWith(pvRecorderPrefix)) {
		return false;
	}

	const currentPlatformArch = currentCopilotPlatformArch();
	if (relative.startsWith(`${pvRecorderPrefix}mac/arm64/`)) {
		return currentPlatformArch !== 'darwin-arm64';
	}
	if (relative.startsWith(`${pvRecorderPrefix}mac/x86_64/`)) {
		return currentPlatformArch !== 'darwin-x64';
	}
	if (relative.startsWith(`${pvRecorderPrefix}linux/x86_64/`)) {
		return currentPlatformArch !== 'linux-x64' && currentPlatformArch !== 'linuxmusl-x64';
	}
	if (relative.startsWith(`${pvRecorderPrefix}windows/amd64/`)) {
		return currentPlatformArch !== 'win32-x64';
	}
	if (relative.startsWith(`${pvRecorderPrefix}windows/arm64/`)) {
		return currentPlatformArch !== 'win32-arm64';
	}

	return false;
}

async function copyBinaries(extensionPath: string) {
	const copilotSDKPath = path.join(extensionPath, 'node_modules', '@github', 'copilot');
	const vscodeRipgrepPath = path.join(copilotSDKPath, 'ripgrep', 'bin', process.platform + '-' + process.arch);
	await copyRipgrepShim(extensionPath, vscodeRipgrepPath, new TestLogService());
}

async function findAllBinaries(dir: string): Promise<string[]> {
	const binaryFiles: string[] = [];
	const filesToIgnore = ['.DS_Store'];
	async function findFilesRecursively(dir: string): Promise<void> {
		try {
			await fs.access(dir);
		} catch {
			return;
		}

		const entries = await fs.readdir(dir, { withFileTypes: true });
		await Promise.all(entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name);
			if (filesToIgnore.includes(entry.name)) {
				return;
			}
			if (entry.isDirectory()) {
				await findFilesRecursively(fullPath);
			} else if (entry.isFile()) {
				const isBinary = await isBinaryFile(fullPath);
				if (isBinary) {
					binaryFiles.push(fullPath);
				}
			}
		}));
	}

	await findFilesRecursively(dir);
	return binaryFiles;
}

type FileSystemFunctions = Record<string, (...args: unknown[]) => unknown>;

const OBSERVED_SESSION_FILES = new Set(['events.jsonl', 'workspace.yaml']);

/**
 * Reports `events.jsonl` / `workspace.yaml` accesses made through Node's `fs` and `fs/promises`,
 * including from already-loaded ES modules (via `syncBuiltinESMExports`). Returns a function that
 * restores the original implementations.
 */
function observeSessionFileAccess(onAccess: (fileName: string) => void): () => void {
	const nodeFs = createRequire(__filename)('fs') as typeof import('fs');
	const restores: (() => void)[] = [];
	const wrap = (target: FileSystemFunctions, names: readonly string[]) => {
		for (const name of names) {
			const original = target[name];
			target[name] = (...args: unknown[]) => {
				const file = args[0];
				const fileName = typeof file === 'string' ? path.basename(file) : file instanceof URL ? path.posix.basename(file.pathname) : undefined;
				if (fileName && OBSERVED_SESSION_FILES.has(fileName)) {
					onAccess(fileName);
				}
				return original(...args);
			};
			restores.push(() => { target[name] = original; });
		}
	};
	wrap(nodeFs.promises as unknown as FileSystemFunctions, ['open', 'readFile', 'stat']);
	wrap(nodeFs as unknown as FileSystemFunctions, ['open', 'openSync', 'readFile', 'readFileSync', 'createReadStream', 'stat', 'statSync']);
	syncBuiltinESMExports();
	return () => {
		for (const restore of restores) {
			restore();
		}
		syncBuiltinESMExports();
	};
}
