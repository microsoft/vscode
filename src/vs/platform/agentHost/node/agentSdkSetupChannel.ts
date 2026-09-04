/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, AgentSdkDownloadStatus, IAgentSdkSetupInfo, agentSdkSetupStatusKey, isAgentSdkSetupRequestFor } from '../common/agentSdkSetup.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentSdkDownloader, type IAgentSdkDownloadProgress, type IAgentSdkPackage } from './agentSdkDownloader.js';

/** The per-agent half of {@link AgentSdkSetupChannel}. */
export interface IAgentSdkSetupChannelAgent {
	/** Agent/provider id, which becomes {@link IAgentSdkSetupInfo.agent}. */
	readonly id: string;
	readonly sdkPackage: IAgentSdkPackage;

	/** What this agent offers besides the download. Published verbatim. */
	readonly setupInfo: Omit<IAgentSdkSetupInfo, 'agent' | 'download'>;

	/** Whether the SDK can be loaded without a network fetch. */
	isSdkLocal(): Promise<boolean>;

	/** Fetch the SDK. */
	downloadSdk(): Promise<void>;

	/** Restart chat discovery, which defers itself while there is no SDK to read a catalog from. */
	restartChatDiscovery(): void;

	/** Re-enumerate models against the SDK that just landed. */
	refreshModels(): Promise<void>;
}

/**
 * One agent's side of the SDK setup channel: publishes whether its SDK is on
 * disk, tracks first-use and explicit downloads, and handles setup requests.
 */
export class AgentSdkSetupChannel extends Disposable {

	/** Consumed request nonce per request key, so a root-config change we caused isn't re-handled. */
	private readonly _lastRequests = new Map<string, string>();
	private readonly _operations = new Sequencer();

	private _downloadActivity: 'idle' | 'explicit' | 'lazy' = 'idle';
	private _downloadFailed = false;

	constructor(
		private readonly _agent: IAgentSdkSetupChannelAgent,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _downloader: IAgentSdkDownloader,
		private readonly _logService: ILogService,
	) {
		super();
		// The workbench addresses the agent through the root config bag. The key is
		// cleared as it is consumed so a later identical press still lands.
		this._register(this._configurationService.onDidRootConfigChange(() => this._handleRequest()));
		this._register(this._downloader.onDidDownloadProgress(progress => this._handleDownloadProgress(progress)));
		this.refresh();
	}

	/** Recompute the host's SDK status after an outside state change. */
	refresh(): void {
		this._queue('failed to refresh agent SDK setup', async () => this._publish(await this._agent.isSdkLocal()));
	}

	private _publish(sdkIsLocal: boolean): void {
		const download: AgentSdkDownloadStatus = this._downloadActivity !== 'idle'
			? 'downloading'
			: sdkIsLocal
				? 'ready'
				: this._hasDownloadConsent() && !this._downloadFailed ? 'downloadOnUse' : 'notDownloaded';
		const info: Omit<IAgentSdkSetupInfo, 'agent'> = { ...this._agent.setupInfo, download };
		this._configurationService.publishRootTransientValues?.({ [agentSdkSetupStatusKey(this._agent.id)]: info });
	}

	private _handleDownloadProgress(progress: IAgentSdkDownloadProgress): void {
		if (progress.packageId !== this._agent.sdkPackage.id) {
			return;
		}
		switch (progress.phase) {
			case 'started':
				if (this._downloadActivity === 'idle') {
					this._downloadActivity = 'lazy';
					this._downloadFailed = false;
					this._publish(false);
					this._queue('failed to record agent SDK download consent', () => this._recordDownloadConsent());
				}
				break;
			case 'completed':
				if (this._downloadActivity === 'lazy') {
					this._queue('refresh after agent SDK download failed', () => this._finishLazyDownload());
				}
				break;
			case 'failed':
				if (this._downloadActivity === 'lazy') {
					this._downloadActivity = 'idle';
					this._downloadFailed = true;
					this._publish(false);
				}
				break;
		}
	}

	private _handleRequest(): void {
		const values = this._configurationService.getRootConfigValues?.() ?? {};
		if (this._takeRequest(values, AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY)) {
			if (this._downloadActivity === 'idle') {
				this._queue('explicit agent SDK download failed', async () => {
					await this._recordDownloadConsent();
					await this._download();
				});
			}
		}
		if (this._takeRequest(values, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY)) {
			this._queue('agent SDK configuration reload failed', async () => {
				this._logService.info(`[AgentSdkSetup] ${this._agent.id}: reloading the agent's configuration at the user's request`);
				await this._lookAgain();
			});
		}
	}

	private _queue(failureMessage: string, operation: () => Promise<void>): void {
		void this._operations.queue(operation).catch(error => {
			this._logService.error(error, `[AgentSdkSetup] ${this._agent.id}: ${failureMessage}`);
		});
	}

	/** Claim one request addressed to this agent, clearing the key so a repeat press still lands. */
	private _takeRequest(values: Readonly<Record<string, unknown>>, key: string): boolean {
		const request = values[key];
		if (!isAgentSdkSetupRequestFor(request, this._agent.id) || request.request === this._lastRequests.get(key)) {
			return false;
		}
		this._lastRequests.set(key, request.request);
		this._configurationService.updateRootConfig({ [key]: undefined });
		return true;
	}

	private _hasDownloadConsent(): boolean {
		return this._downloader.hasDownloadConsent(this._agent.sdkPackage);
	}

	private async _recordDownloadConsent(): Promise<void> {
		try {
			await this._downloader.recordDownloadConsent(this._agent.sdkPackage);
		} catch (error) {
			this._logService.error(error, `[AgentSdkSetup] ${this._agent.id}: failed to persist agent SDK download consent`);
		}
	}

	/** Download requested explicitly through the setup UI. */
	private async _download(): Promise<void> {
		if (this._downloadActivity !== 'idle') {
			return;
		}
		const progressInterest = this._downloader.acquireDownloadProgressInterest(this._agent.sdkPackage);
		this._downloadFailed = false;
		this._downloadActivity = 'explicit';
		this._publish(false);
		let downloaded = false;
		try {
			this._logService.info(`[AgentSdkSetup] ${this._agent.id}: downloading the agent SDK at the user's request`);
			try {
				await this._agent.downloadSdk();
				downloaded = true;
			} catch (error) {
				this._downloadFailed = true;
				this._logService.error(error, `[AgentSdkSetup] ${this._agent.id}: agent SDK download failed`);
			}
			if (downloaded) {
				await this._lookAgain();
			}
		} finally {
			this._downloadActivity = 'idle';
			progressInterest.dispose();
			this._publish(downloaded);
		}
	}

	private async _finishLazyDownload(): Promise<void> {
		try {
			await this._lookAgain();
		} finally {
			this._downloadActivity = 'idle';
			this._publish(true);
		}
	}

	/**
	 * Re-read the world: the tail of a download, and the whole of a reload. Both
	 * gestures change exactly what these two calls see — one puts the SDK on disk,
	 * the other follows a `claude login` the app could not observe.
	 */
	private async _lookAgain(): Promise<void> {
		// Chat discovery deferred itself while there was no SDK to read the catalog
		// from; this is the one moment that can change.
		this._agent.restartChatDiscovery();
		// Second, not first: the refresh is what asks the SDK about the account, so
		// announcing `ready` ahead of it would show "no account found" to a user who
		// has one for as long as enumeration takes.
		await this._agent.refreshModels();
	}
}
