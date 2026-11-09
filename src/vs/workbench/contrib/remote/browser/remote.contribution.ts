/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ShowCandidateContribution } from './showCandidate.js';
import { TunnelFactoryContribution } from './tunnelFactory.js';
import { RemoteAgentConnectionStatusListener, RemoteMarkers } from './remote.js';
import { RemoteStatusIndicator } from './remoteIndicator.js';
import { AutomaticPortForwarding, ForwardedPortsView, PortRestore, TOGGLE_VIEW_ACTION_ID } from './remoteExplorer.js';
import { InitialRemoteConnectionHealthContribution } from './remoteConnectionHealth.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { TUNNEL_VIEW_ID } from '../../../services/remote/common/remoteExplorerService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TOGGLE_VIEW_ACTION_ID,
			title: localize('remote.togglePortsView', "Toggle Forwarded Ports View"),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		if (viewsService.isViewVisible(TUNNEL_VIEW_ID)) {
			viewsService.closeView(TUNNEL_VIEW_ID);
		} else {
			await viewsService.openView(TUNNEL_VIEW_ID, true);
		}
	}
});

registerWorkbenchContribution2(ShowCandidateContribution.ID, ShowCandidateContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(TunnelFactoryContribution.ID, TunnelFactoryContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(RemoteAgentConnectionStatusListener.ID, RemoteAgentConnectionStatusListener, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(RemoteStatusIndicator.ID, RemoteStatusIndicator, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ForwardedPortsView.ID, ForwardedPortsView, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PortRestore.ID, PortRestore, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AutomaticPortForwarding.ID, AutomaticPortForwarding, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(RemoteMarkers.ID, RemoteMarkers, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(InitialRemoteConnectionHealthContribution.ID, InitialRemoteConnectionHealthContribution, WorkbenchPhase.AfterRestored);
