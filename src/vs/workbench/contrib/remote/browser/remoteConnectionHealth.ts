/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from '../../../services/remote/common/remoteAgentService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { localize } from '../../../../nls.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { getRemoteName } from '../../../../platform/remote/common/remoteHosts.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Codicon } from '../../../../base/common/codicons.js';
import Severity from '../../../../base/common/severity.js';


const REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY = 'remote.unsupportedConnectionChoice';
const BANNER_REMOTE_UNSUPPORTED_CONNECTION_DISMISSED_KEY = 'workbench.banner.remote.unsupportedConnection.dismissed';

export class InitialRemoteConnectionHealthContribution implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IBannerService private readonly bannerService: IBannerService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
	) {
		if (this._environmentService.remoteAuthority) {
			this._checkInitialRemoteConnectionHealth();
		}
	}

	private async _confirmConnection(): Promise<boolean> {
		const enum ConnectionChoice {
			Allow = 1,
			LearnMore = 2,
			Cancel = 0
		}

		const { result, checkboxChecked } = await this.dialogService.prompt<ConnectionChoice>({
			type: Severity.Warning,
			message: localize('unsupportedGlibcWarning', "You are about to connect to an OS version that is unsupported by {0}.", this.productService.nameLong),
			buttons: [
				{
					label: localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
					run: () => ConnectionChoice.Allow
				},
				{
					label: localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
					run: async () => { await this.openerService.open('https://aka.ms/vscode-remote/faq/old-linux'); return ConnectionChoice.LearnMore; }
				}
			],
			cancelButton: {
				run: () => ConnectionChoice.Cancel
			},
			checkbox: {
				label: localize('remember', "Do not show again"),
			}
		});

		if (result === ConnectionChoice.LearnMore) {
			return await this._confirmConnection();
		}

		const allowed = result === ConnectionChoice.Allow;
		if (allowed && checkboxChecked) {
			this.storageService.store(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, allowed, StorageScope.PROFILE, StorageTarget.MACHINE);
		}

		return allowed;
	}

	private async _checkInitialRemoteConnectionHealth(): Promise<void> {
		try {
			const environment = await this._remoteAgentService.getRawEnvironment();

			if (environment && environment.isUnsupportedGlibc) {
				let allowed = this.storageService.getBoolean(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, StorageScope.PROFILE);
				if (allowed === undefined) {
					allowed = await this._confirmConnection();
				}
				if (allowed) {
					const bannerDismissedVersion = this.storageService.get(`${BANNER_REMOTE_UNSUPPORTED_CONNECTION_DISMISSED_KEY}`, StorageScope.PROFILE) ?? '';
					// Ignore patch versions and dismiss the banner if the major and minor versions match.
					const shouldShowBanner = bannerDismissedVersion.slice(0, bannerDismissedVersion.lastIndexOf('.')) !== this.productService.version.slice(0, this.productService.version.lastIndexOf('.'));
					if (shouldShowBanner) {
						const actions = [
							{
								label: localize('unsupportedGlibcBannerLearnMore', "Learn More"),
								href: 'https://aka.ms/vscode-remote/faq/old-linux'
							}
						];
						this.bannerService.show({
							id: 'unsupportedGlibcWarning.banner',
							message: localize('unsupportedGlibcWarning.banner', "You are connected to an OS version that is unsupported by {0}.", this.productService.nameLong),
							actions,
							icon: Codicon.warning,
							closeLabel: `Do not show again in v${this.productService.version}`,
							onClose: () => {
								this.storageService.store(`${BANNER_REMOTE_UNSUPPORTED_CONNECTION_DISMISSED_KEY}`, this.productService.version, StorageScope.PROFILE, StorageTarget.MACHINE);
							}
						});
					}
				} else {
					this.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
					return;
				}
			}

			type RemoteConnectionSuccessClassification = {
				owner: 'alexdima';
				comment: 'The initial connection succeeded';
				web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Is web ui.' };
				connectionTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time, in ms, until connected' };
				remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
			};
			type RemoteConnectionSuccessEvent = {
				web: boolean;
				connectionTimeMs: number | undefined;
				remoteName: string | undefined;
			};
			this._telemetryService.publicLog2<RemoteConnectionSuccessEvent, RemoteConnectionSuccessClassification>('remoteConnectionSuccess', {
				web: isWeb,
				connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
				remoteName: getRemoteName(this._environmentService.remoteAuthority)
			});

			await this._measureExtHostLatency();

		} catch (err) {

			type RemoteConnectionFailureClassification = {
				owner: 'alexdima';
				comment: 'The initial connection failed';
				web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Is web ui.' };
				remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
				connectionTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time, in ms, until connection failure' };
				message: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Error message' };
			};
			type RemoteConnectionFailureEvent = {
				web: boolean;
				remoteName: string | undefined;
				connectionTimeMs: number | undefined;
				message: string;
			};
			this._telemetryService.publicLog2<RemoteConnectionFailureEvent, RemoteConnectionFailureClassification>('remoteConnectionFailure', {
				web: isWeb,
				connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
				remoteName: getRemoteName(this._environmentService.remoteAuthority),
				message: err ? err.message : ''
			});

		}
	}

	private async _measureExtHostLatency() {
		const measurement = await remoteConnectionLatencyMeasurer.measure(this._remoteAgentService);
		if (measurement === undefined) {
			return;
		}

		type RemoteConnectionLatencyClassification = {
			owner: 'connor4312';
			comment: 'The latency to the remote extension host';
			web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this is running on web' };
			remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Anonymized remote name' };
			latencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Latency to the remote, in milliseconds' };
		};
		type RemoteConnectionLatencyEvent = {
			web: boolean;
			remoteName: string | undefined;
			latencyMs: number;
		};

		this._telemetryService.publicLog2<RemoteConnectionLatencyEvent, RemoteConnectionLatencyClassification>('remoteConnectionLatency', {
			web: isWeb,
			remoteName: getRemoteName(this._environmentService.remoteAuthority),
			latencyMs: measurement.current
		});
	}
}
