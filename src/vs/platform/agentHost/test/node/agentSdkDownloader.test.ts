/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import type * as httpType from 'http';
import * as os from 'os';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../files/common/fileService.js';
import type { IFileService } from '../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { RequestService } from '../../../request/node/requestService.js';
import { AgentSdkDownloader, type IAgentSdkPackage } from '../../node/agentSdkDownloader.js';
import { ClaudeSdkPackage } from '../../node/claude/claudeAgentSdkService.js';
import { AgentHostClaudeSdkRootEnvVar } from '../../common/agentService.js';
import type { INativeEnvironmentService } from '../../../environment/common/environment.js';
import type { IProductService } from '../../../product/common/productService.js';

interface ITestSdkDownloadFixture {
	tarballPath: string;
	innerFile: string; // path that should exist inside the extracted root
	innerContents: string;
	cleanup: () => Promise<void>;
}

async function buildFixtureTarball(): Promise<ITestSdkDownloadFixture> {
	const tar = await import('tar');
	const stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sdk-fixture-'));
	const innerRel = path.join('node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');
	const innerContents = '// fixture sdk.mjs\nexport default {};\n';
	await fsp.mkdir(path.dirname(path.join(stagingDir, innerRel)), { recursive: true });
	await fsp.writeFile(path.join(stagingDir, innerRel), innerContents);
	const tarballPath = path.join(stagingDir, 'fixture.tgz');
	await tar.c({ file: tarballPath, cwd: stagingDir, gzip: true }, ['node_modules']);
	return {
		tarballPath,
		innerFile: innerRel,
		innerContents,
		cleanup: async () => fsp.rm(stagingDir, { recursive: true, force: true }),
	};
}

interface ITestServer {
	port: number;
	requestCount: number;
	lastPath: string | undefined;
	close: () => Promise<void>;
}

async function startServer(body: Buffer): Promise<ITestServer> {
	const http: typeof httpType = await import('http');
	return new Promise(resolve => {
		const state = { count: 0, lastPath: undefined as string | undefined };
		const server = http.createServer((req, res) => {
			state.count++;
			state.lastPath = req.url;
			res.statusCode = 200;
			res.setHeader('content-type', 'application/octet-stream');
			res.setHeader('content-length', String(body.length));
			res.end(body);
		});
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			const port = typeof addr === 'object' && addr ? addr.port : 0;
			resolve({
				get port() { return port; },
				get requestCount() { return state.count; },
				get lastPath() { return state.lastPath; },
				close: () => new Promise(res => server.close(() => res())),
			});
		});
	});
}

function makeEnvService(userDataPath: string): INativeEnvironmentService {
	// `RequestService.request` calls `getResolvedShellEnv(configService, logService, args, process.env)`.
	// `force-disable-user-env: true` short-circuits before spawning a shell —
	// without it `shellEnv.ts:140` registers a cancellation listener that
	// leaks across tests and trips ensureNoDisposablesAreLeakedInTestSuite.
	return { userDataPath, args: { 'force-disable-user-env': true } as never } as unknown as INativeEnvironmentService;
}

function makeProductService(config: { version: string; urlTemplate: string } | undefined): IProductService {
	return {
		agentSdks: config ? { claude: config } : undefined,
	} as unknown as IProductService;
}

function makeRequestService(disposables: Pick<DisposableStore, 'add'>): RequestService {
	// Bare RequestService: no http.proxy setting, no special config.
	// Reads system proxy env vars (HTTP_PROXY, HTTPS_PROXY, NO_PROXY) — none set
	// in CI so direct connection to the test loopback server works.
	return disposables.add(new RequestService(
		'local',
		new TestConfigurationService(),
		makeEnvService('/unused-for-requestservice'),
		new NullLogService(),
	));
}

function makeFileService(disposables: Pick<DisposableStore, 'add'>): IFileService {
	// Real FileService with DiskFileSystemProvider for `file://` — matches
	// the wiring in `agentHostMain.ts`. Each test gets its own clean instance
	// so provider registrations don't bleed across tests.
	const log = new NullLogService();
	const svc = disposables.add(new FileService(log));
	disposables.add(svc.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(log))));
	return svc;
}

/**
 * Test package that lets us pin `currentSdkTarget()` from each test — the
 * production `ClaudeSdkPackage` would resolve to whatever the test host
 * is, which makes tests depend on `process.platform`.
 *
 * Reuses ClaudeSdkPackage's id + devOverrideEnvVar so the
 * `process.env[AgentHostClaudeSdkRootEnvVar]` short-circuit still works
 * and so the cache dir lands under `.../claude/...`.
 */
function makeTestPackage(currentSdkTarget: string | undefined): IAgentSdkPackage {
	return {
		id: ClaudeSdkPackage.id,
		devOverrideEnvVar: ClaudeSdkPackage.devOverrideEnvVar,
		currentSdkTarget: () => currentSdkTarget,
	};
}

suite('AgentSdkDownloader', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	let userDataPath: string;
	let fixture: ITestSdkDownloadFixture;
	let server: ITestServer;
	let originalEnvOverride: string | undefined;

	/** A cancellation token whose source is disposed in teardown. */
	function newToken() {
		const src = disposables.add(new CancellationTokenSource());
		return src.token;
	}

	setup(async () => {
		originalEnvOverride = process.env[AgentHostClaudeSdkRootEnvVar];
		delete process.env[AgentHostClaudeSdkRootEnvVar];
		userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'sdk-userdata-'));
		fixture = await buildFixtureTarball();
		server = await startServer(await fsp.readFile(fixture.tarballPath));
	});

	teardown(async () => {
		await server.close();
		await fixture.cleanup();
		await fsp.rm(userDataPath, { recursive: true, force: true });
		if (originalEnvOverride === undefined) {
			delete process.env[AgentHostClaudeSdkRootEnvVar];
		} else {
			process.env[AgentHostClaudeSdkRootEnvVar] = originalEnvOverride;
		}
	});

	function makeDownloader(productConfig?: { version?: string; urlTemplate?: string }) {
		// Default urlTemplate references `{sdkTarget}` so we exercise the
		// substitution path; tests that need a custom URL pass urlTemplate
		// explicitly.
		const config = {
			version: productConfig?.version ?? '1.0.0',
			urlTemplate: productConfig?.urlTemplate ?? `http://127.0.0.1:${server.port}/sdk-{sdkTarget}.tgz`,
		};
		return new AgentSdkDownloader(
			makeEnvService(userDataPath),
			makeProductService(config),
			makeRequestService(disposables),
			makeFileService(disposables),
			new NullLogService(),
		);
	}

	test('isAvailable: false when no env override and no product config', () => {
		const downloader = new AgentSdkDownloader(
			makeEnvService(userDataPath),
			makeProductService(undefined),
			makeRequestService(disposables),
			makeFileService(disposables),
			new NullLogService(),
		);
		assert.strictEqual(downloader.isAvailable(makeTestPackage('linux-x64')), false);
	});

	test('isAvailable: true when env override set', () => {
		process.env[AgentHostClaudeSdkRootEnvVar] = '/some/path';
		const downloader = new AgentSdkDownloader(
			makeEnvService(userDataPath),
			makeProductService(undefined),
			makeRequestService(disposables),
			makeFileService(disposables),
			new NullLogService(),
		);
		assert.strictEqual(downloader.isAvailable(makeTestPackage('linux-x64')), true);
	});

	test('isAvailable: true when product config populated and currentSdkTarget resolves', () => {
		const downloader = makeDownloader();
		assert.strictEqual(downloader.isAvailable(makeTestPackage('linux-x64')), true);
	});

	test('isAvailable: false when product config populated but currentSdkTarget undefined', () => {
		// armhf / unsupported-host case: product.json carries agentSdks
		// (it would, on a Universal-style build) but the runtime has no
		// matching SKU — we must NOT register the provider.
		const downloader = makeDownloader();
		assert.strictEqual(downloader.isAvailable(makeTestPackage(undefined)), false);
	});

	test('loadSdkRoot: dev override returns the path unchanged', async () => {
		process.env[AgentHostClaudeSdkRootEnvVar] = '/path/to/dev/sdk';
		const downloader = new AgentSdkDownloader(
			makeEnvService(userDataPath),
			makeProductService(undefined),
			makeRequestService(disposables),
			makeFileService(disposables),
			new NullLogService(),
		);
		const root = await downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken());
		assert.strictEqual(root, '/path/to/dev/sdk');
	});

	test('loadSdkRoot: substitutes {sdkTarget} into urlTemplate', async () => {
		const downloader = makeDownloader();
		await downloader.loadSdkRoot(makeTestPackage('linux-arm64-musl'), newToken());
		assert.strictEqual(server.lastPath, '/sdk-linux-arm64-musl.tgz');
	});

	test('loadSdkRoot: cache miss → downloads, extracts, writes sentinel', async () => {
		const downloader = makeDownloader();
		const root = await downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken());
		assert.strictEqual(server.requestCount, 1);
		const extracted = await fsp.readFile(path.join(root, fixture.innerFile), 'utf8');
		assert.strictEqual(extracted, fixture.innerContents);
		assert.ok(fs.existsSync(path.join(root, '.complete')));
	});

	test('loadSdkRoot: cache hit returns immediately without re-downloading', async () => {
		const downloader = makeDownloader();
		await downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken());
		assert.strictEqual(server.requestCount, 1);

		// Second call hits the cache.
		await downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken());
		assert.strictEqual(server.requestCount, 1, 'cache hit should not re-download');
	});

	test('loadSdkRoot: different sdkTargets use separate cache dirs and trigger separate downloads', async () => {
		// Simulates a macOS Universal build: one product.json, two arches
		// over the lifetime of an install (or two Rosetta-vs-native users).
		// Each resolved target gets its own cache, no thrash.
		const downloader = makeDownloader();
		const arm64Root = await downloader.loadSdkRoot(makeTestPackage('darwin-arm64'), newToken());
		const x64Root = await downloader.loadSdkRoot(makeTestPackage('darwin-x64'), newToken());
		assert.notStrictEqual(arm64Root, x64Root);
		assert.strictEqual(server.requestCount, 2);

		// Re-fetching the arm64 target hits the cache; the x64 entry doesn't
		// invalidate it.
		await downloader.loadSdkRoot(makeTestPackage('darwin-arm64'), newToken());
		assert.strictEqual(server.requestCount, 2, 'sibling target must not invalidate cache');
	});

	test('loadSdkRoot: missing product config and no env override throws actionable error', async () => {
		const downloader = new AgentSdkDownloader(
			makeEnvService(userDataPath),
			makeProductService(undefined),
			makeRequestService(disposables),
			makeFileService(disposables),
			new NullLogService(),
		);
		await assert.rejects(
			() => downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken()),
			/no `product\.agentSdks\.claude` configured/,
		);
	});

	test('loadSdkRoot: currentSdkTarget undefined throws actionable error', async () => {
		const downloader = makeDownloader();
		await assert.rejects(
			() => downloader.loadSdkRoot(makeTestPackage(undefined), newToken()),
			/no SDK target for this host/,
		);
	});

	test('loadSdkRoot: cancel before download completes cleans up scratch dir', async function () {
		this.timeout(15_000);
		// Replace server with one that hangs forever.
		await server.close();
		const http: typeof httpType = await import('http');
		const hangingServer = http.createServer((_req, res) => {
			res.writeHead(200, { 'content-length': '999999' });
			res.write(Buffer.alloc(8));
			// never end
		});
		await new Promise<void>(r => hangingServer.listen(0, '127.0.0.1', () => r()));
		const port = (hangingServer.address() as { port: number }).port;
		try {
			const downloader = new AgentSdkDownloader(
				makeEnvService(userDataPath),
				makeProductService({
					version: '1.0.0',
					urlTemplate: `http://127.0.0.1:${port}/sdk-{sdkTarget}.tgz`,
				}),
				makeRequestService(disposables),
				makeFileService(disposables),
				new NullLogService(),
			);
			const cts = disposables.add(new CancellationTokenSource());
			const promise = downloader.loadSdkRoot(makeTestPackage('linux-x64'), cts.token);
			// Give the request a moment to start.
			await new Promise(r => setTimeout(r, 50));
			cts.cancel();
			await assert.rejects(() => promise, /Cancel|cancel|Failed to download/);
			// No half-extracted dir left around.
			const targetParent = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude');
			const leftover = fs.existsSync(targetParent)
				? (await listLeftovers(targetParent))
				: [];
			assert.deepStrictEqual(leftover, []);
		} finally {
			// Force-close any sockets the test left dangling — the cancel path
			// only tears down OUR streams, the underlying http connection on
			// the server side stays alive until the OS reaps it. Without this
			// `hangingServer.close()` would hang waiting for the still-open
			// connection.
			hangingServer.closeAllConnections();
			await new Promise<void>(r => hangingServer.close(() => r()));
		}
	});

	test('loadSdkRoot: concurrent calls in same process share one download', async () => {
		const downloader = makeDownloader();
		const [a, b, c] = await Promise.all([
			downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken()),
			downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken()),
			downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken()),
		]);
		assert.strictEqual(a, b);
		assert.strictEqual(b, c);
		assert.strictEqual(server.requestCount, 1, 'concurrent loaders must dedupe');
	});

	test('loadSdkRoot: rename-loser path returns existing cache when winner already published', async () => {
		const downloader = makeDownloader();
		const target = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude', '1.0.0', 'linux-x64');

		// Pre-populate the cache as if a "winner" already extracted it.
		await fsp.mkdir(target, { recursive: true });
		await fsp.mkdir(path.dirname(path.join(target, fixture.innerFile)), { recursive: true });
		await fsp.writeFile(path.join(target, fixture.innerFile), fixture.innerContents);
		await fsp.writeFile(path.join(target, '.complete'), 'http://example/anything');

		// loadSdkRoot should hit the cache first and never invoke the server.
		const root = await downloader.loadSdkRoot(makeTestPackage('linux-x64'), newToken());
		assert.strictEqual(root, target);
		assert.strictEqual(server.requestCount, 0);
	});
});

/**
 * Walks the `claude/` cache subtree looking for `*.tmp.*` scratch dirs —
 * sdkTarget partitioning means leftovers live two levels deeper than they
 * used to.
 */
async function listLeftovers(claudeCacheRoot: string): Promise<string[]> {
	const found: string[] = [];
	async function walk(dir: string) {
		let entries: string[];
		try {
			entries = await fsp.readdir(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.includes('.tmp.')) {
				found.push(entry);
				continue;
			}
			const full = path.join(dir, entry);
			let stat;
			try {
				stat = await fsp.stat(full);
			} catch {
				continue;
			}
			if (stat.isDirectory()) {
				await walk(full);
			}
		}
	}
	await walk(claudeCacheRoot);
	return found;
}
