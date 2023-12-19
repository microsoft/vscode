/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ITunnelService, TunnelOptions, RemoteTunnel, TunnelCreationOptions, ITunnel, TunnelProtocol, TunnelPrivacyId } from 'vs/platform/tunnel/common/tunnel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { ILogService } from 'vs/platform/log/common/log';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { forwardedPortsViewEnabled } from 'vs/workbench/services/remote/common/tunnelModel';

export class TunnelFactoryContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@ITunnelService tunnelService: ITunnelService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IOpenerService private openerService: IOpenerService,
		@IRemoteExplorerService remoteExplorerService: IRemoteExplorerService,
		@ILogService logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		const tunnelFactory = environmentService.options?.tunnelProvider?.tunnelFactory;
		if (tunnelFactory) {
			// At this point we clearly want the ports view/features since we have a tunnel factory
			contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
			let privacyOptions = environmentService.options?.tunnelProvider?.features?.privacyOptions ?? [];
			if (environmentService.options?.tunnelProvider?.features?.public
				&& (privacyOptions.length === 0)) {
				privacyOptions = [
					{
						id: 'private',
						label: nls.localize('tunnelPrivacy.private', "Private"),
						themeIcon: 'lock'
					},
					{
						id: 'public',
						label: nls.localize('tunnelPrivacy.public', "Public"),
						themeIcon: 'eye'
					}
				];
			}

			this._register(tunnelService.setTunnelProvider({
				forwardPort: async (tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions): Promise<RemoteTunnel | string | undefined> => {
					let tunnelPromise: Promise<ITunnel> | undefined;
					try {
						tunnelPromise = tunnelFactory(tunnelOptions, tunnelCreationOptions);
					} catch (e) {
						logService.trace('tunnelFactory: tunnel provider error');
					}

					if (!tunnelPromise) {
						return undefined;
					}
					let tunnel: ITunnel;
					try {
						tunnel = await tunnelPromise;
					} catch (e) {
						logService.trace('tunnelFactory: tunnel provider promise error');
						if (e instanceof Error) {
							return e.message;
						}
						return undefined;
					}
					const localAddress = tunnel.localAddress.startsWith('http') ? tunnel.localAddress : `http://${tunnel.localAddress}`;
					const remoteTunnel: RemoteTunnel = {
						tunnelRemotePort: tunnel.remoteAddress.port,
						tunnelRemoteHost: tunnel.remoteAddress.host,
						// The tunnel factory may give us an inaccessible local address.
						// To make sure this doesn't happen, resolve the uri immediately.
						localAddress: await this.resolveExternalUri(localAddress),
						privacy: tunnel.privacy ?? (tunnel.public ? TunnelPrivacyId.Public : TunnelPrivacyId.Private),
						protocol: tunnel.protocol ?? TunnelProtocol.Http,
						dispose: async () => { await tunnel.dispose(); }
					};
					return remoteTunnel;
				}
			}));
			const tunnelInformation = environmentService.options?.tunnelProvider?.features ?
				{
					features: {
						elevation: !!environmentService.options?.tunnelProvider?.features?.elevation,
						public: !!environmentService.options?.tunnelProvider?.features?.public,
						privacyOptions
					}
				} : undefined;
			remoteExplorerService.setTunnelInformation(tunnelInformation);
		}
	}

	private async resolveExternalUri(uri: string): Promise<string> {
		try {
			return (await this.openerService.resolveExternalUri(URI.parse(uri))).resolved.toString();
		} catch {
			return uri;
		}
	}
}
