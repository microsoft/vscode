/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile, type ExecFileException } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import * as sinon from 'sinon';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { upcastDeepPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentNetworkFilterService, IAgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import { IProtocolMainService } from '../../../protocol/electron-main/protocol.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { BrowserViewStorageScope, IBrowserViewNetwork } from '../../common/browserView.js';
import type { BrowserSession } from '../../electron-main/browserSession.js';

suite('BrowserSession network filtering', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	async function runInMain(testName: string): Promise<boolean> {
		if (process.type === 'browser') {
			return false;
		}
		const executable = process.env['VSCODE_TEST_ELECTRON_PATH'];
		assert.ok(executable, 'These tests require the Electron unit runner');
		const userData = await mkdtemp(join(tmpdir(), 'vscode-network-filter-test-'));
		const resultFile = join(userData, 'result.json');
		const env: NodeJS.ProcessEnv = { ...process.env, VSCODE_DEV: '1' };
		delete env.ELECTRON_RUN_AS_NODE;
		try {
			let exitCode = 0;
			try {
				await promisify(execFile)(executable, [
					fileURLToPath(new URL('./fixtures/browserSessionNetworkFilterRunner.js', import.meta.url)),
					fileURLToPath(import.meta.url),
					testName,
					resultFile,
					`--user-data-dir=${userData}`,
				], { env, timeout: 10000, maxBuffer: 1024 * 1024 });
			} catch (error) {
				if (!(error instanceof Error)) {
					throw error;
				}
				const processError: ExecFileException = error;
				if (processError.code !== 1) {
					throw error;
				}
				exitCode = 1;
			}
			const result: { stats: { tests: number }; failures: { fullTitle: string; err: { message: string } }[] } =
				JSON.parse(await readFile(resultFile, 'utf8'));
			assert.deepStrictEqual({
				exitCode,
				tests: result.stats.tests,
				failures: result.failures.map(failure => ({ test: failure.fullTitle, message: failure.err.message })),
			}, { exitCode: 0, tests: 1, failures: [] });
			return true;
		} finally {
			await rm(userData, { recursive: true, force: true });
		}
	}

	async function createSession(denied: string[], network?: IBrowserViewNetwork) {
		const { BrowserSession } = await import('../../electron-main/browserSession.js');
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, denied);
		const filter = store.add(new AgentNetworkFilterService(configuration));
		const onBeforeRequest = sinon.stub();
		const resolveHost = sinon.stub().callsFake(async (host: string) => ({
			endpoints: [{ address: host === 'allowed.example' ? '127.0.0.2' : '127.0.0.1', family: 'ipv4' }],
		}));
		const setProxy = sinon.stub().resolves();
		const electronSession = upcastDeepPartial<Electron.Session>({
			webRequest: { onBeforeRequest },
			resolveHost,
			setProxy,
			closeAllConnections: sinon.stub().resolves(),
			setCertificateVerifyProc: sinon.stub(),
			setPermissionRequestHandler: sinon.stub(),
			setPermissionCheckHandler: sinon.stub(),
			setDevicePermissionHandler: sinon.stub(),
			registerPreloadScript: sinon.stub(),
			protocol: { handle: sinon.stub().resolves() },
			on: sinon.stub(),
		});
		const instantiationService = store.add(new InstantiationService(new ServiceCollection(
			[IAgentNetworkFilterService, filter],
			[IWindowsMainService, upcastDeepPartial<IWindowsMainService>({})],
			[IProtocolMainService, upcastDeepPartial<IProtocolMainService>({})],
			[ILogService, store.add(new NullLogService())],
		)));
		const browserSession = instantiationService.createInstance(
			BrowserSession, generateUuid(), electronSession, BrowserViewStorageScope.Agent, network, undefined,
		);
		for (const resource of [browserSession.history, browserSession.permissions]) {
			if (resource instanceof Disposable) {
				store.add(resource);
			}
		}
		const owner: BrowserSession & {
			acquireNetworkFilter?: (options: { resolveProxy: (url: string) => Promise<string> }) => IDisposable;
		} = browserSession;
		const reference = owner.acquireNetworkFilter?.({ resolveProxy: async () => 'DIRECT' });
		if (reference) {
			store.add(reference);
		}
		const listener: (details: { url: string }, callback: (response: Electron.CallbackResponse) => void) => void =
			onBeforeRequest.lastCall.args[0];
		return {
			resolveHost,
			setProxy,
			request: (url: string) => new Promise<Electron.CallbackResponse>(resolve => listener({ url }, resolve)),
		};
	}

	test('blocks DNS aliases at the agent browser session while allowing a permitted address', async () => {
		if (await runInMain('blocks DNS aliases at the agent browser session while allowing a permitted address')) {
			return;
		}
		const fixture = await createSession(['127.0.0.1', '[::1]']);
		const urls = [
			'http://127.0.0.1:8971/prodpath-control-127',
			'http://127-0-0-1.nip.io:8971/prodpath-alias-nip-dash',
			'http://127.0.0.1.nip.io:8080/',
			'http://ssrf.127.0.0.1.nip.io:8080/',
			'http://localtest.me/',
			'http://allowed.example:8080/',
		];
		const results = [];
		const permittedRequests: string[] = [];
		for (const url of urls) {
			const result = await fixture.request(url);
			results.push(result);
			if (!result.cancel) {
				permittedRequests.push(url);
			}
		}
		assert.deepStrictEqual({ results, permittedRequests }, {
			results: [true, true, true, true, true, false].map(cancel => ({ cancel })),
			permittedRequests: ['http://allowed.example:8080/'],
		});
	});

	test('fails closed on remote address restrictions without using local DNS or changing hostname-only routing', async () => {
		if (await runInMain('fails closed on remote address restrictions without using local DNS or changing hostname-only routing')) {
			return;
		}
		const restricted = await createSession(['127.0.0.1'], { authority: 'test-remote' });
		const hostnameOnly = await createSession(['blocked.example'], { authority: 'test-remote' });
		assert.deepStrictEqual({
			restricted: await restricted.request('http://allowed.example:8080/'),
			hostnameOnly: await hostnameOnly.request('http://allowed.example:8080/'),
			localLookups: restricted.resolveHost.callCount + hostnameOnly.resolveHost.callCount,
			proxyChanges: restricted.setProxy.callCount + hostnameOnly.setProxy.callCount,
		}, {
			restricted: { cancel: true },
			hostnameOnly: { cancel: false },
			localLookups: 0,
			proxyChanges: 0,
		});
	});
});
