/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as crypto from 'crypto';
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
import { AgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { ClaudeSdkPackage } from '../../node/claude/claudeAgentSdkService.js';
import { AgentHostClaudeSdkRootEnvVar } from '../../common/agentService.js';
import type { INativeEnvironmentService } from '../../../environment/common/environment.js';
import type { IProductService } from '../../../product/common/productService.js';

interface ITestSdkDownloadFixture {
	tarballPath: string;
	tarballSha: string;
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
	const tarballSha = crypto
		.createHash('sha256')
		.update(await fsp.readFile(tarballPath))
		.digest('hex');
	return {
		tarballPath,
		tarballSha,
		innerFile: innerRel,
		innerContents,
		cleanup: async () => fsp.rm(stagingDir, { recursive: true, force: true }),
	};
}

interface ITestServer {
	port: number;
	requestCount: number;
	close: () => Promise<void>;
}

async function startServer(body: Buffer): Promise<ITestServer> {
	const http: typeof httpType = await import('http');
	return new Promise(resolve => {
		const state = { count: 0 };
		const server = http.createServer((_req, res) => {
			state.count++;
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

function makeProductService(config: { version: string; url: string; sha256: string } | undefined): IProductService {
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

	function makeDownloader(productConfig?: { version?: string; sha256?: string; url?: string }) {
		const config = {
			version: productConfig?.version ?? '1.0.0',
			url: productConfig?.url ?? `http://127.0.0.1:${server.port}/sdk.tgz`,
			sha256: productConfig?.sha256 ?? fixture.tarballSha,
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
		assert.strictEqual(downloader.isAvailable(ClaudeSdkPackage), false);
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
		assert.strictEqual(downloader.isAvailable(ClaudeSdkPackage), true);
	});

	test('isAvailable: true when product config is populated', () => {
		const downloader = makeDownloader();
		assert.strictEqual(downloader.isAvailable(ClaudeSdkPackage), true);
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
		const root = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(root, '/path/to/dev/sdk');
	});

	test('loadSdkRoot: cache miss → downloads, verifies, extracts', async () => {
		const downloader = makeDownloader();
		const root = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1);
		const extracted = await fsp.readFile(path.join(root, fixture.innerFile), 'utf8');
		assert.strictEqual(extracted, fixture.innerContents);
		assert.ok(fs.existsSync(path.join(root, '.complete')));
	});

	test('loadSdkRoot: cache hit returns immediately without re-downloading', async () => {
		const downloader = makeDownloader();
		await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1);

		// Second call hits the cache.
		await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1, 'cache hit should not re-download');
	});

	test('loadSdkRoot: stale cache (different sha) is invalidated and re-downloaded', async () => {
		const downloader = makeDownloader();
		const cacheDir = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1);

		// Tamper with the cache: write a different sha into .complete.
		await fsp.writeFile(path.join(cacheDir, '.complete'), 'a'.repeat(64));

		await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 2, 'sha mismatch must trigger re-download');
		// Sentinel restored.
		const recorded = (await fsp.readFile(path.join(cacheDir, '.complete'), 'utf8')).trim();
		assert.strictEqual(recorded, fixture.tarballSha);
	});

	test('loadSdkRoot: sha256 mismatch → throws and leaves no cache dir', async () => {
		const downloader = makeDownloader({ sha256: 'b'.repeat(64) });
		await assert.rejects(
			() => downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
			/sha256 mismatch|Failed to download/,
		);
		// Cache dir absent — only its parent might exist.
		const target = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude', '1.0.0');
		assert.strictEqual(fs.existsSync(target), false);
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
			() => downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
			/no `product\.agentSdks\.claude` configured/,
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
					url: `http://127.0.0.1:${port}/sdk.tgz`,
					sha256: fixture.tarballSha,
				}),
				makeRequestService(disposables),
				makeFileService(disposables),
				new NullLogService(),
			);
			const cts = disposables.add(new CancellationTokenSource());
			const promise = downloader.loadSdkRoot(ClaudeSdkPackage, cts.token);
			// Give the request a moment to start.
			await new Promise(r => setTimeout(r, 50));
			cts.cancel();
			await assert.rejects(() => promise, /Cancel|cancel|Failed to download/);
			// No half-extracted dir left around.
			const targetParent = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude');
			const leftover = fs.existsSync(targetParent)
				? (await fsp.readdir(targetParent)).filter(f => f.includes('.tmp.'))
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
			downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
			downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
			downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
		]);
		assert.strictEqual(a, b);
		assert.strictEqual(b, c);
		assert.strictEqual(server.requestCount, 1, 'concurrent loaders must dedupe');
	});

	test('loadSdkRoot: rename-loser path returns existing cache when winner already published', async () => {
		const downloader = makeDownloader();
		const target = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude', '1.0.0');

		// Pre-populate the cache as if a "winner" already extracted it.
		await fsp.mkdir(target, { recursive: true });
		await fsp.mkdir(path.dirname(path.join(target, fixture.innerFile)), { recursive: true });
		await fsp.writeFile(path.join(target, fixture.innerFile), fixture.innerContents);
		await fsp.writeFile(path.join(target, '.complete'), fixture.tarballSha);

		// loadSdkRoot should hit the cache first and never invoke the server.
		const root = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(root, target);
		assert.strictEqual(server.requestCount, 0);
	});
});
