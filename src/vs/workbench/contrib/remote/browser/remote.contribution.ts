/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ShowCandidateContribution } from './showCandidate.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { TunnelFactoryContribution } from './tunnelFactory.js';
import { RemoteAgentConnectionStatusListener, RemoteMarkers } from './remote.js';
import { RemoteStatusIndicator } from './remoteIndicator.js';
import { AutomaticPortForwarding, ForwardedPortsView, PortRestore } from './remoteExplorer.js';
import { InitialRemoteConnectionHealthContribution } from './remoteConnectionHealth.js';

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(ShowCandidateContribution.ID, ShowCandidateContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(TunnelFactoryContribution.ID, TunnelFactoryContribution, WorkbenchPhase.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentConnectionStatusListener, LifecyclePhase.Eventually);
registerWorkbenchContribution2(RemoteStatusIndicator.ID, RemoteStatusIndicator, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(ForwardedPortsView, LifecyclePhase.Restored);
workbenchContributionsRegistry.registerWorkbenchContribution(PortRestore, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(AutomaticPortForwarding, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteMarkers, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(InitialRemoteConnectionHealthContribution, LifecyclePhase.Restored);
