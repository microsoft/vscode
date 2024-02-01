/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, WorkbenchContributionInstantiation, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ShowCandidateContribution } from 'vs/workbench/contrib/remote/browser/showCandidate';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TunnelFactoryContribution } from 'vs/workbench/contrib/remote/browser/tunnelFactory';
import { RemoteAgentConnectionStatusListener, RemoteMarkers } from 'vs/workbench/contrib/remote/browser/remote';
import { RemoteStatusIndicator } from 'vs/workbench/contrib/remote/browser/remoteIndicator';
import { AutomaticPortForwarding, ForwardedPortsView, PortRestore } from 'vs/workbench/contrib/remote/browser/remoteExplorer';

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(ShowCandidateContribution.ID, ShowCandidateContribution, WorkbenchContributionInstantiation.BlockRestore);
registerWorkbenchContribution2(TunnelFactoryContribution.ID, TunnelFactoryContribution, WorkbenchContributionInstantiation.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentConnectionStatusListener, LifecyclePhase.Eventually);
registerWorkbenchContribution2(RemoteStatusIndicator.ID, RemoteStatusIndicator, WorkbenchContributionInstantiation.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(ForwardedPortsView, LifecyclePhase.Restored);
workbenchContributionsRegistry.registerWorkbenchContribution(PortRestore, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(AutomaticPortForwarding, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteMarkers, LifecyclePhase.Eventually);
