/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ShowCandidateContribution } from 'vs/workbench/contrib/remote/browser/showCandidate';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TunnelFactoryContribution } from 'vs/workbench/contrib/remote/browser/tunnelFactory';
import { RemoteAgentConnectionStatusListener, RemoteMarkers } from 'vs/workbench/contrib/remote/browser/remote';
import { RemoteStatusIndicator } from 'vs/workbench/contrib/remote/browser/remoteIndicator';
import { AutomaticPortForwarding, ForwardedPortsView, PortRestore } from 'vs/workbench/contrib/remote/browser/remoteExplorer';

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ShowCandidateContribution, 'ShowCandidateContribution', LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(TunnelFactoryContribution, 'TunnelFactoryContribution', LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentConnectionStatusListener, 'RemoteAgentConnectionStatusListener', LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteStatusIndicator, 'RemoteStatusIndicator', LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(ForwardedPortsView, 'ForwardedPortsView', LifecyclePhase.Restored);
workbenchContributionsRegistry.registerWorkbenchContribution(PortRestore, 'PortRestore', LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(AutomaticPortForwarding, 'AutomaticPortForwarding', LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteMarkers, 'RemoteMarkers', LifecyclePhase.Eventually);
