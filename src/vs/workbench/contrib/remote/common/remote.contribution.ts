/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { isWeb, OperatingSystem } from 'vs/base/common/platform';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Schemas } from 'vs/base/common/network';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class LabelContribution implements IWorkbenchContribution {
	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService) {
		this.registerFormatters();
	}

	private registerFormatters(): void {
		if (isWeb) {
			this.remoteAgentService.getEnvironment().then(remoteEnvironment => {
				if (remoteEnvironment) {
					this.labelService.registerFormatter({
						scheme: Schemas.vscodeRemote,
						authority: this.environmentService.configuration.remoteAuthority,
						formatting: {
							label: '${path}',
							separator: remoteEnvironment.os === OperatingSystem.Windows ? '\\' : '/',
							tildify: remoteEnvironment.os !== OperatingSystem.Windows
						}
					});
				}
			});
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(LabelContribution, LifecyclePhase.Starting);

