/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, agentSdkSetupStatusKey, type AgentSdkDownloadStatus } from '../../common/agentSdkSetup.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentSdkSetupChannel, type IAgentSdkSetupChannelAgent } from '../../node/agentSdkSetupChannel.js';
import { IAgentSdkDownloader, type IAgentSdkDownloadProgress, type IAgentSdkPackage } from '../../node/agentSdkDownloader.js';

const sdkPackage: IAgentSdkPackage = {
	id: 'claude',
	displayName: 'Claude',
	devOverrideEnvVar: 'TEST_CLAUDE_SDK_ROOT',
	hasSeparateMuslLinuxPackage: true,
};

class TestConfigurationService extends mock<IAgentConfigurationService>() implements IDisposable {
	private readonly _onDidRootConfigChange = new Emitter<void>();
	override readonly onDidRootConfigChange = this._onDidRootConfigChange.event;
	readonly statuses: AgentSdkDownloadStatus[] = [];
	readonly values: Record<string, unknown> = {};

	override getRootConfigValues(): Readonly<Record<string, unknown>> {
		return this.values;
	}

	override updateRootConfig(patch: Record<string, unknown>): void {
		Object.assign(this.values, patch);
		this._onDidRootConfigChange.fire();
	}

	override publishRootTransientValues(patch: Readonly<Record<string, unknown>>): void {
		const value = patch[agentSdkSetupStatusKey('claude')];
		if (typeof value !== 'object' || value === null) {
			return;
		}
		const download: unknown = Reflect.get(value, 'download');
		if (download === 'notDownloaded' || download === 'downloadOnUse' || download === 'downloading' || download === 'ready') {
			this.statuses.push(download);
		}
	}

	dispose(): void {
		this._onDidRootConfigChange.dispose();
	}
}

suite('AgentSdkSetupChannel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function progress(phase: IAgentSdkDownloadProgress['phase'], packageId = 'claude'): IAgentSdkDownloadProgress {
		return {
			downloadId: 'download-1',
			packageId,
			displayName: 'Claude',
			phase,
			receivedBytes: 0,
			totalBytes: undefined,
			explicitlyRequested: false,
		};
	}

	function createChannel(options: {
		configuration?: TestConfigurationService;
		downloadConsent?: boolean;
		downloadSdk?: () => Promise<void>;
		isSdkLocal?: () => Promise<boolean>;
	} = {}): {
		channel: AgentSdkSetupChannel;
		configuration: TestConfigurationService;
		downloads: Emitter<IAgentSdkDownloadProgress>;
		lookedAgain: string[];
		downloadCalls: () => number;
		downloadConsents: () => readonly string[];
		progressInterests: string[];
	} {
		const configuration = options.configuration ?? store.add(new TestConfigurationService());
		const downloads = store.add(new Emitter<IAgentSdkDownloadProgress>());
		const lookedAgain: string[] = [];
		const downloadConsents = new Set(options.downloadConsent ? ['claude'] : []);
		const progressInterests: string[] = [];
		let downloadCalls = 0;
		const downloader = new class extends mock<IAgentSdkDownloader>() {
			override readonly onDidDownloadProgress = downloads.event;
			override hasDownloadConsent = (pkg: IAgentSdkPackage) => downloadConsents.has(pkg.id);
			override recordDownloadConsent = async (pkg: IAgentSdkPackage) => { downloadConsents.add(pkg.id); };
			override acquireDownloadProgressInterest = () => {
				progressInterests.push('claude');
				return toDisposable(() => { });
			};
		}();
		const agent: IAgentSdkSetupChannelAgent = {
			id: 'claude',
			sdkPackage,
			setupInfo: {},
			isSdkLocal: options.isSdkLocal ?? (async () => false),
			downloadSdk: async () => {
				downloadCalls++;
				await options.downloadSdk?.();
			},
			restartChatDiscovery: () => { lookedAgain.push('discovery'); },
			refreshModels: async () => { lookedAgain.push('models'); },
		};
		const channel = store.add(new AgentSdkSetupChannel(agent, configuration, downloader, new NullLogService()));
		return { channel, configuration, downloads, lookedAgain, downloadCalls: () => downloadCalls, downloadConsents: () => [...downloadConsents], progressInterests };
	}

	test('a first-turn download replaces the offer with downloading and then ready', async () => {
		const { configuration, downloads, lookedAgain, downloadConsents } = createChannel();
		await timeout(0);

		downloads.fire(progress('started'));
		downloads.fire(progress('completed'));
		await timeout(0);

		assert.deepStrictEqual({
			statuses: configuration.statuses,
			lookedAgain,
			downloadConsents: downloadConsents(),
		}, {
			statuses: ['notDownloaded', 'downloading', 'ready'],
			lookedAgain: ['discovery', 'models'],
			downloadConsents: ['claude'],
		});
	});

	test('a failed first-turn download returns to the offer', async () => {
		const { configuration, downloads, downloadConsents } = createChannel();
		await timeout(0);
		downloads.fire(progress('started'));
		downloads.fire(progress('failed'));
		await timeout(0);

		assert.deepStrictEqual({
			statuses: configuration.statuses,
			downloadConsents: downloadConsents(),
		}, {
			statuses: ['notDownloaded', 'downloading', 'notDownloaded'],
			downloadConsents: ['claude'],
		});
	});

	test('another agent download does not change this agent status', async () => {
		const { configuration, downloads, downloadConsents } = createChannel();
		await timeout(0);

		downloads.fire(progress('started', 'codex'));

		assert.deepStrictEqual({
			statuses: configuration.statuses,
			downloadConsents: downloadConsents(),
		}, {
			statuses: ['notDownloaded'],
			downloadConsents: [],
		});
	});

	test('standing consent waits for SDK use instead of downloading on host startup', async () => {
		const ctx = createChannel({ downloadConsent: true });
		await timeout(0);

		assert.deepStrictEqual({
			statuses: ctx.configuration.statuses,
			downloads: ctx.downloadCalls(),
			progressInterests: ctx.progressInterests,
			lookedAgain: ctx.lookedAgain,
		}, {
			statuses: ['downloadOnUse'],
			downloads: 0,
			progressInterests: [],
			lookedAgain: [],
		});
	});

	test('an explicit request records host consent and surfaces progress', async () => {
		const ctx = createChannel();
		await timeout(0);

		ctx.configuration.updateRootConfig({
			[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY]: { agent: 'claude', request: 'request-1' },
		});
		await timeout(0);

		assert.deepStrictEqual({
			downloadConsents: ctx.downloadConsents(),
			downloads: ctx.downloadCalls(),
			progressInterests: ctx.progressInterests,
			statuses: ctx.configuration.statuses,
		}, {
			downloadConsents: ['claude'],
			downloads: 1,
			progressInterests: ['claude'],
			statuses: ['notDownloaded', 'downloading', 'ready'],
		});
	});

	test('a late startup probe cannot overwrite a completed lazy download', async () => {
		const sdkIsLocal = new DeferredPromise<boolean>();
		const ctx = createChannel({ isSdkLocal: () => sdkIsLocal.p });
		await timeout(0);

		ctx.downloads.fire(progress('started'));
		ctx.downloads.fire(progress('completed'));
		await timeout(0);
		const whileStartupProbeIsPending = [...ctx.configuration.statuses];

		await sdkIsLocal.complete(false);
		await timeout(0);

		assert.deepStrictEqual({
			whileStartupProbeIsPending,
			statuses: ctx.configuration.statuses,
			lookedAgain: ctx.lookedAgain,
		}, {
			whileStartupProbeIsPending: ['downloading'],
			statuses: ['downloading', 'downloading', 'ready'],
			lookedAgain: ['discovery', 'models'],
		});
	});

	test('an explicit request racing lazy completion does not start a second download', async () => {
		const ctx = createChannel();
		await timeout(0);

		ctx.downloads.fire(progress('started'));
		ctx.downloads.fire(progress('completed'));
		ctx.configuration.updateRootConfig({
			[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY]: { agent: 'claude', request: 'request-1' },
		});
		await timeout(0);

		assert.deepStrictEqual({
			downloads: ctx.downloadCalls(),
			progressInterests: ctx.progressInterests,
			statuses: ctx.configuration.statuses,
		}, {
			downloads: 0,
			progressInterests: [],
			statuses: ['notDownloaded', 'downloading', 'ready'],
		});
	});

	test('repeated explicit requests while another operation is running queue one download', async () => {
		const sdkIsLocal = new DeferredPromise<boolean>();
		const ctx = createChannel({ isSdkLocal: () => sdkIsLocal.p });
		await timeout(0);

		ctx.configuration.updateRootConfig({
			[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY]: { agent: 'claude', request: 'request-1' },
		});
		ctx.configuration.updateRootConfig({
			[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY]: { agent: 'claude', request: 'request-2' },
		});
		await sdkIsLocal.complete(false);
		await timeout(0);

		assert.deepStrictEqual({
			downloads: ctx.downloadCalls(),
			progressInterests: ctx.progressInterests,
			statuses: ctx.configuration.statuses,
		}, {
			downloads: 1,
			progressInterests: ['claude'],
			statuses: ['downloading', 'downloading', 'ready'],
		});
	});

});
