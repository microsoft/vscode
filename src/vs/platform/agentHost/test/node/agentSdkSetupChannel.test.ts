/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { agentSdkSetupStatusKey, type AgentSdkDownloadStatus } from '../../common/agentSdkSetup.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentSdkSetupChannel, type IAgentSdkSetupChannelAgent } from '../../node/agentSdkSetupChannel.js';
import { IAgentSdkDownloader, type IAgentSdkDownloadProgress, type IAgentSdkPackage } from '../../node/agentSdkDownloader.js';

const sdkPackage: IAgentSdkPackage = {
	id: 'claude',
	displayName: 'Claude',
	devOverrideEnvVar: 'TEST_CLAUDE_SDK_ROOT',
	hasSeparateMuslLinuxPackage: true,
};

class TestConfigurationService extends mock<IAgentConfigurationService>() {
	override readonly onDidRootConfigChange = Event.None;
	readonly statuses: AgentSdkDownloadStatus[] = [];

	override publishRootTransientValues(patch: Readonly<Record<string, unknown>>): void {
		const value = patch[agentSdkSetupStatusKey('claude')];
		if (typeof value !== 'object' || value === null) {
			return;
		}
		const download: unknown = Reflect.get(value, 'download');
		if (download === 'notDownloaded' || download === 'downloading' || download === 'ready') {
			this.statuses.push(download);
		}
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

	function createChannel(): {
		channel: AgentSdkSetupChannel;
		configuration: TestConfigurationService;
		downloads: Emitter<IAgentSdkDownloadProgress>;
		lookedAgain: string[];
	} {
		const configuration = new TestConfigurationService();
		const downloads = store.add(new Emitter<IAgentSdkDownloadProgress>());
		const lookedAgain: string[] = [];
		const downloader = new class extends mock<IAgentSdkDownloader>() {
			override readonly onDidDownloadProgress = downloads.event;
		}();
		const agent: IAgentSdkSetupChannelAgent = {
			id: 'claude',
			sdkPackage,
			setupInfo: {},
			isSdkLocal: async () => false,
			downloadSdk: async () => { },
			restartChatDiscovery: () => { lookedAgain.push('discovery'); },
			refreshModels: async () => { lookedAgain.push('models'); },
		};
		const channel = store.add(new AgentSdkSetupChannel(agent, configuration, downloader, new NullLogService()));
		return { channel, configuration, downloads, lookedAgain };
	}

	test('a first-turn download replaces the offer with downloading and then ready', async () => {
		const { configuration, downloads, lookedAgain } = createChannel();
		await timeout(0);

		downloads.fire(progress('started'));
		downloads.fire(progress('completed'));
		await timeout(0);

		assert.deepStrictEqual({
			statuses: configuration.statuses,
			lookedAgain,
		}, {
			statuses: ['notDownloaded', 'downloading', 'ready'],
			lookedAgain: ['discovery', 'models'],
		});
	});

	test('a failed first-turn download returns to the offer', async () => {
		const { configuration, downloads } = createChannel();
		await timeout(0);
		downloads.fire(progress('started'));
		downloads.fire(progress('failed'));

		assert.deepStrictEqual(configuration.statuses, ['notDownloaded', 'downloading', 'notDownloaded']);
	});

	test('another agent download does not change this agent status', async () => {
		const { configuration, downloads } = createChannel();
		await timeout(0);

		downloads.fire(progress('started', 'codex'));

		assert.deepStrictEqual(configuration.statuses, ['notDownloaded']);
	});
});
