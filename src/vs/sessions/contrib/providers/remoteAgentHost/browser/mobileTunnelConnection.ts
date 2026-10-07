/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnelAgentHostService, ITunnelInfo, isTunnelHosted } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteTunnelService } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { localize } from '../../../../../nls.js';
import { IConnectionDiagnosticsService } from './connectionDiagnostics.js';

/** Mobile picker orchestration over the existing authentication and tunnel services. */
export class MobileTunnelConnection {
	constructor(
		@ITunnelAgentHostService private readonly tunnels: ITunnelAgentHostService,
		@IConnectionDiagnosticsService private readonly diagnostics: IConnectionDiagnosticsService,
		@IRemoteTunnelService private readonly remoteTunnel: IRemoteTunnelService,
		@IAuthenticationService private readonly authentication: IAuthenticationService,
		@IProductService private readonly product: IProductService,
		@INotificationService private readonly notifications: INotificationService,
	) { }

	async list(): Promise<ITunnelInfo[]> {
		const scopes = this.product.tunnelApplicationConfig?.authenticationProviders?.github?.scopes ?? [];
		if (!(await this.authentication.getSessions('github', scopes)).length) {
			await this.authentication.createSession('github', scopes, { activateImmediate: true });
		}
		const [tunnels, status] = await Promise.all([
			this.diagnostics.trackDiscovery('mobile-add-computer', onDiagnostic => this.tunnels.listTunnels({ authProvider: 'github', onDiagnostic })),
			this.remoteTunnel.getTunnelStatus(),
		]);
		return tunnels.filter(tunnel => !isTunnelHosted(status.type === 'connected' ? status.info : undefined, tunnel))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async connect(tunnel: ITunnelInfo): Promise<void> {
		const progress = this.notifications.notify({
			severity: Severity.Info,
			message: localize('connecting', "Connecting to tunnel '{0}'...", tunnel.name),
			progress: { infinite: true },
		});
		try {
			this.tunnels.clearTunnelDismissal(tunnel.tunnelId);
			await this.tunnels.connect(tunnel, 'github', { userInitiated: true });
		} finally {
			progress.close();
		}
	}
}
