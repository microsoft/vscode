/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnelService, TunnelOptions, RemoteTunnel, TunnelCreationOptions, ITunnel } from 'vs/platform/remote/common/tunnel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { ILogService } from 'vs/platform/log/common/log';

export class TunnelFactoryContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ITunnelService tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IOpenerService openerService: IOpenerService,
		@IRemoteExplorerService remoteExplorerService: IRemoteExplorerService,
		@ILogService logService: ILogService
	) {
		super();
		const tunnelFactory = environmentService.options?.tunnelProvider?.tunnelFactory;
		if (tunnelFactory) {
			this._register(tunnelService.setTunnelProvider({
				forwardPort: (tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions): Promise<RemoteTunnel | undefined> | undefined => {
					let tunnelPromise: Promise<ITunnel> | undefined;
					try {
						tunnelPromise = tunnelFactory(tunnelOptions, tunnelCreationOptions);
					} catch (e) {
						logService.trace('tunnelFactory: tunnel provider error');
					}

					return new Promise(async (resolve) => {
						if (!tunnelPromise) {
							resolve(undefined);
							return;
						}
						let tunnel: ITunnel;
						try {
							tunnel = await tunnelPromise;
						} catch (e) {
							logService.trace('tunnelFactory: tunnel provider promise error');
							resolve(undefined);
							return;
						}
						const localAddress = tunnel.localAddress.startsWith('http') ? tunnel.localAddress : `http://${tunnel.localAddress}`;
						const remoteTunnel: RemoteTunnel = {
							tunnelRemotePort: tunnel.remoteAddress.port,
							tunnelRemoteHost: tunnel.remoteAddress.host,
							// The tunnel factory may give us an inaccessible local address.
							// To make sure this doesn't happen, resolve the uri immediately.
							localAddress: (await openerService.resolveExternalUri(URI.parse(localAddress))).resolved.toString(),
							public: !!tunnel.public,
							dispose: async () => { await tunnel.dispose(); }
						};
						resolve(remoteTunnel);
					});
				}
			}, environmentService.options?.tunnelProvider?.features ?? { elevation: false, public: false }));
			remoteExplorerService.setTunnelInformation(undefined);
		}
	}
}
