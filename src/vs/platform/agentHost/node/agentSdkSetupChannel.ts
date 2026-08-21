/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, AgentSdkDownloadStatus, IAgentSdkSetupInfo, agentSdkSetupStatusKey, isAgentSdkSetupRequestFor } from '../common/agentSdkSetup.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentSdkDownloader, IAgentSdkPackage } from './agentSdkDownloader.js';

/** The per-agent half of {@link AgentSdkSetupChannel}. */
export interface IAgentSdkSetupChannelAgent {
	/** Agent/provider id, which becomes {@link IAgentSdkSetupInfo.agent}. */
	readonly id: string;
	readonly sdkPackage: IAgentSdkPackage;

	/** What this agent offers besides the download. Published verbatim. */
	readonly setupInfo: Omit<IAgentSdkSetupInfo, 'agent' | 'download'>;

	/** Whether the SDK can be loaded without a network fetch. */
	isSdkLocal(): Promise<boolean>;

	/** Fetch the SDK. Only ever called for the explicit gesture. */
	downloadSdk(): Promise<void>;

	/** Restart chat discovery, which defers itself while there is no SDK to read a catalog from. */
	restartChatDiscovery(): void;

	/** Re-enumerate models against the SDK that just landed. */
	refreshModels(): Promise<void>;
}

/**
 * One agent's side of the SDK setup channel: publishes whether its SDK is on
 * disk, performs the download the workbench asks for, and looks again when it
 * asks for that. Every agent needs the same nonce handling, latching and publish
 * ordering, so only the calls in {@link IAgentSdkSetupChannelAgent} differ.
 */
export class AgentSdkSetupChannel extends Disposable {

	/** Consumed request nonce per request key, so a root-config change we caused isn't re-handled. */
	private readonly _lastRequests = new Map<string, string>();

	/**
	 * Latched while the *explicit* download runs. {@link IAgentSdkSetupChannelAgent.isSdkLocal}
	 * stays false throughout, so without this the channel could only ever report
	 * `notDownloaded` and the banner would keep offering a button for work already
	 * underway. Deliberately not a query on the downloader, which would also latch
	 * for background fetches — those are the ones the user never asked for and so
	 * must stay invisible.
	 */
	private _downloadInFlight = false;

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
		queueMicrotask(() => { void this.publish(); });
	}

	/** Publish the current status, paying for the is-local probe. */
	async publish(): Promise<void> {
		this.publishWith(await this._agent.isSdkLocal());
	}

	/** The synchronous half, for callers that have just paid for the probe. */
	publishWith(sdkIsLocal: boolean): void {
		const download: AgentSdkDownloadStatus = this._downloadInFlight
			? 'downloading'
			: sdkIsLocal ? 'ready' : 'notDownloaded';
		const info: Omit<IAgentSdkSetupInfo, 'agent'> = { ...this._agent.setupInfo, download };
		this._configurationService.publishRootTransientValues?.({ [agentSdkSetupStatusKey(this._agent.id)]: info });
	}

	private _handleRequest(): void {
		const values = this._configurationService.getRootConfigValues?.() ?? {};
		if (this._takeRequest(values, AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY)) {
			void this._download();
		}
		if (this._takeRequest(values, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY)) {
			this._logService.info(`[AgentSdkSetup] ${this._agent.id}: reloading the agent's configuration at the user's request`);
			// Nothing to publish: the SDK is already on disk either way, and what the
			// banner reads is the catalog the re-look republishes.
			void this._lookAgain();
		}
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

	/**
	 * The explicit download gesture. Acquiring progress interest is what makes the
	 * fetch visible: the downloader only emits frames for a session that asked or an
	 * explicitly-registered interest, and this download belongs to no session.
	 */
	private async _download(): Promise<void> {
		if (this._downloadInFlight) {
			return;
		}
		const progressInterest = this._downloader.acquireDownloadProgressInterest(this._agent.sdkPackage);
		this._downloadInFlight = true;
		this.publishWith(false);
		try {
			this._logService.info(`[AgentSdkSetup] ${this._agent.id}: downloading the agent SDK at the user's request`);
			await this._agent.downloadSdk();
		} catch (error) {
			this._logService.error(error, `[AgentSdkSetup] ${this._agent.id}: agent SDK download failed`);
		} finally {
			this._downloadInFlight = false;
			progressInterest.dispose();
		}
		await this._lookAgain();
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
