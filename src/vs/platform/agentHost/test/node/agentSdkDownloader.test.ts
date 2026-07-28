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
import { AgentSdkDownloader, resolveSdkTarget, type IAgentSdkPackage, type IAgentSdkDownloadProgress } from '../../node/agentSdkDownloader.js';
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
 * Unit tests for the platform/arch/libc → sdkTarget mapping. These cover
 * the cross-product the downloader can't easily exercise (Universal x64
 * launches from arm64 hosts, musl Linux from a macOS CI runner, …) by
 * passing a synthetic host directly to the pure function.
 */
suite('resolveSdkTarget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function fakePkg(hasSeparateMuslLinuxPackage: boolean): IAgentSdkPackage {
		return { id: 'test', displayName: 'Test', devOverrideEnvVar: 'X', hasSeparateMuslLinuxPackage };
	}

	test('returns <platform>-<arch> for supported (platform, arch)', () => {
		assert.deepStrictEqual({
			'darwin-x64': resolveSdkTarget(fakePkg(false), { platform: 'darwin', arch: 'x64', libc: undefined }),
			'darwin-arm64': resolveSdkTarget(fakePkg(false), { platform: 'darwin', arch: 'arm64', libc: undefined }),
			'linux-x64': resolveSdkTarget(fakePkg(false), { platform: 'linux', arch: 'x64', libc: 'glibc' }),
			'linux-arm64': resolveSdkTarget(fakePkg(false), { platform: 'linux', arch: 'arm64', libc: 'glibc' }),
			'win32-x64': resolveSdkTarget(fakePkg(false), { platform: 'win32', arch: 'x64', libc: undefined }),
			'win32-arm64': resolveSdkTarget(fakePkg(false), { platform: 'win32', arch: 'arm64', libc: undefined }),
		}, {
			'darwin-x64': 'darwin-x64',
			'darwin-arm64': 'darwin-arm64',
			'linux-x64': 'linux-x64',
			'linux-arm64': 'linux-arm64',
			'win32-x64': 'win32-x64',
			'win32-arm64': 'win32-arm64',
		});
	});

	test('appends -musl on musl Linux iff the package has separate musl SKUs', () => {
		assert.strictEqual(
			resolveSdkTarget(fakePkg(true), { platform: 'linux', arch: 'x64', libc: 'musl' }),
			'linux-x64-musl',
			'claude-style: musl host → -musl suffix',
		);
		assert.strictEqual(
			resolveSdkTarget(fakePkg(false), { platform: 'linux', arch: 'x64', libc: 'musl' }),
			'linux-x64',
			'codex-style: musl host → no suffix (statically musl-linked, single SKU)',
		);
		assert.strictEqual(
			resolveSdkTarget(fakePkg(true), { platform: 'linux', arch: 'x64', libc: 'glibc' }),
			'linux-x64',
			'claude-style: glibc host → no suffix',
		);
	});

	test('returns undefined for unsupported (platform, arch)', () => {
		assert.strictEqual(resolveSdkTarget(fakePkg(true), { platform: 'linux', arch: 'armhf', libc: 'glibc' }), undefined);
		assert.strictEqual(resolveSdkTarget(fakePkg(true), { platform: 'freebsd' as NodeJS.Platform, arch: 'x64', libc: undefined }), undefined);
		assert.strictEqual(resolveSdkTarget(fakePkg(false), { platform: 'darwin', arch: 'ia32', libc: undefined }), undefined);
	});
});

/**
 * Integration tests for the downloader's network → cache → extract flow.
 * These run against whatever `process.platform` the test host is — the
 * pure `resolveSdkTarget` suite above covers the cross-host matrix.
 */
suite('AgentSdkDownloader', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	let userDataPath: string;
	let fixture: ITestSdkDownloadFixture;
	let server: ITestServer;
	let originalEnvOverride: string | undefined;
	/** Whatever the host resolves to — used for cache-dir path assertions. */
	let hostSdkTarget: string;

	/** A cancellation token whose source is disposed in teardown. */
	function newToken() {
		const src = disposables.add(new CancellationTokenSource());
		return src.token;
	}

	suiteSetup(function () {
		// Skip the integration suite on hosts the downloader can't resolve
		// a target for (e.g. linux-armhf). `resolveSdkTarget` is covered
		// above and doesn't need a real host.
		const target = resolveSdkTarget(ClaudeSdkPackage);
		if (!target) {
			this.skip();
		}
		hostSdkTarget = target;
	});

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

	/**
	 * Default urlTemplate references `{sdkTarget}` so we exercise the
	 * substitution path; tests that need a custom URL pass urlTemplate
	 * explicitly. Pass `productConfig: null` to omit the agentSdks block
	 * entirely (the "no product config" case).
	 */
	function makeDownloader(productConfig?: { version?: string; urlTemplate?: string } | null) {
		const config = productConfig === null ? undefined : {
			version: productConfig?.version ?? '1.0.0',
			urlTemplate: productConfig?.urlTemplate ?? `http://127.0.0.1:${server.port}/sdk-{sdkTarget}.tgz`,
		};
		return disposables.add(new AgentSdkDownloader(
			makeEnvService(userDataPath),
			makeProductService(config),
			makeRequestService(disposables),
			makeFileService(disposables),
			new NullLogService(),
		));
	}

	test('isAvailable: false when no env override and no product config', () => {
		assert.strictEqual(makeDownloader(null).isAvailable(ClaudeSdkPackage), false);
	});

	test('isAvailable: true when env override set', () => {
		process.env[AgentHostClaudeSdkRootEnvVar] = '/some/path';
		assert.strictEqual(makeDownloader(null).isAvailable(ClaudeSdkPackage), true);
	});

	test('isAvailable: true when product config populated and host has a target', () => {
		assert.strictEqual(makeDownloader().isAvailable(ClaudeSdkPackage), true);
	});

	test('loadSdkRoot: dev override returns the path unchanged', async () => {
		process.env[AgentHostClaudeSdkRootEnvVar] = '/path/to/dev/sdk';
		const root = await makeDownloader(null).loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(root, '/path/to/dev/sdk');
	});

	test('loadSdkRoot: substitutes {sdkTarget} into urlTemplate', async () => {
		await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.lastPath, `/sdk-${hostSdkTarget}.tgz`);
	});

	test('loadSdkRoot: cache miss → downloads, extracts, writes sentinel', async () => {
		const root = await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1);
		const extracted = await fsp.readFile(path.join(root, fixture.innerFile), 'utf8');
		assert.strictEqual(extracted, fixture.innerContents);
		assert.ok(fs.existsSync(path.join(root, '.complete')));
	});

	test('loadSdkRoot: reports monotonic download progress ending at totalBytes', async () => {
		const downloader = makeDownloader();
		const samples: IAgentSdkDownloadProgress[] = [];
		disposables.add(downloader.onDidDownloadProgress(p => samples.push(p)));

		await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());

		const tarballSize = (await fsp.stat(fixture.tarballPath)).size;
		// One `started`, ≥1 `progress`, one terminal `completed`, all sharing a
		// single downloadId and carrying the brand display name.
		assert.ok(samples.length >= 2, 'expected at least a started and a completed frame');
		assert.strictEqual(samples[0].phase, 'started');
		const completed = samples[samples.length - 1];
		assert.strictEqual(completed.phase, 'completed');
		assert.ok(samples.every(s => s.downloadId === samples[0].downloadId), 'all frames share one downloadId');
		assert.ok(samples.every(s => s.displayName === 'Claude'), 'all frames carry the brand display name');

		// receivedBytes is monotonically non-decreasing and reaches the total
		// reported via Content-Length.
		for (let i = 1; i < samples.length; i++) {
			assert.ok(samples[i].receivedBytes >= samples[i - 1].receivedBytes, 'receivedBytes must be monotonic');
		}
		assert.strictEqual(completed.totalBytes, tarballSize);
		assert.strictEqual(completed.receivedBytes, tarballSize);
	});

	test('loadSdkRoot: cache hit returns immediately without re-downloading', async () => {
		const downloader = makeDownloader();
		await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1);

		// Second call hits the cache.
		await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(server.requestCount, 1, 'cache hit should not re-download');
	});

	test('loadSdkRoot: cache dir includes sdkTarget so Universal launches stay separate', async () => {
		// Direct path check that the cache dir layout encodes sdkTarget —
		// pairs with the resolveSdkTarget unit tests above to cover the
		// macOS-Universal case (which we can't simulate end-to-end without
		// injecting a host the production downloader doesn't accept).
		const root = await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
		const expected = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude', '1.0.0', hostSdkTarget);
		assert.strictEqual(root, expected);
	});

	test('loadSdkRoot: missing product config and no env override throws actionable error', async () => {
		await assert.rejects(
			() => makeDownloader(null).loadSdkRoot(ClaudeSdkPackage, newToken()),
			/no `product\.agentSdks\.claude` configured/,
		);
	});

	test('loadSdkRoot: urlTemplate with unknown placeholder throws config error', async () => {
		// vscode-distro typo guard: `{sdkTaret}` left untouched by format2
		// would otherwise yield a 404 from the CDN with no hint at the
		// real cause.
		const downloader = makeDownloader({
			urlTemplate: `http://127.0.0.1:${server.port}/sdk-{sdkTaret}.tgz`,
		});
		await assert.rejects(
			() => downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
			/unknown placeholder \{sdkTaret\}/,
		);
		assert.strictEqual(server.requestCount, 0, 'should fail before any HTTP call');
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
			const downloader = makeDownloader({
				version: '1.0.0',
				urlTemplate: `http://127.0.0.1:${port}/sdk-{sdkTarget}.tgz`,
			});
			const cts = disposables.add(new CancellationTokenSource());
			const promise = downloader.loadSdkRoot(ClaudeSdkPackage, cts.token);
			// Give the request a moment to start.
			await new Promise(r => setTimeout(r, 50));
			cts.cancel();
			await assert.rejects(() => promise, /Cancel|cancel|Failed to download/);
			// No half-extracted dir left around. The scratch dir lands at
			// <userDataPath>/agent-host/sdk-cache/claude/1.0.0/<target>.tmp.<pid>
			// — a sibling of the resolved target dir under the version dir.
			const versionDir = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude', '1.0.0');
			const leftover = fs.existsSync(versionDir)
				? (await fsp.readdir(versionDir)).filter(f => f.includes('.tmp.'))
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
		const target = path.join(userDataPath, 'agent-host', 'sdk-cache', 'claude', '1.0.0', hostSdkTarget);

		// Pre-populate the cache as if a "winner" already extracted it.
		await fsp.mkdir(target, { recursive: true });
		await fsp.mkdir(path.dirname(path.join(target, fixture.innerFile)), { recursive: true });
		await fsp.writeFile(path.join(target, fixture.innerFile), fixture.innerContents);
		await fsp.writeFile(path.join(target, '.complete'), '');

		// loadSdkRoot should hit the cache first and never invoke the server.
		const root = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
		assert.strictEqual(root, target);
		assert.strictEqual(server.requestCount, 0);
	});
});
