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
import { IRemoteAgentService, RemoteExtensionLogFileName } from 'vs/workbench/services/remote/common/remoteAgentService';
import { ILogService } from 'vs/platform/log/common/log';
import { LogLevelSetterChannelClient } from 'vs/platform/log/common/logIpc';
import { IOutputChannelRegistry, Extensions as OutputExt, } from 'vs/workbench/contrib/output/common/output';
import { localize } from 'vs/nls';
import { joinPath } from 'vs/base/common/resources';
import { Disposable } from 'vs/base/common/lifecycle';
import { ViewContainer, IViewContainersRegistry, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';

export const VIEWLET_ID = 'workbench.view.remote';
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
	VIEWLET_ID,
	true,
	undefined,
	{
		getOrder: (group?: string) => {
			if (!group) {
				return;
			}

			let matches = /^targets@(\d+)$/.exec(group);
			if (matches) {
				return -1000;
			}

			matches = /^details@(\d+)$/.exec(group);

			if (matches) {
				return -500;
			}

			return;
		}
	}
);

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
							tildify: remoteEnvironment.os !== OperatingSystem.Windows,
							normalizeDriveLetter: remoteEnvironment.os === OperatingSystem.Windows
						}
					});
				}
			});
		}
	}
}

class RemoteChannelsContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
	) {
		super();
		const connection = remoteAgentService.getConnection();
		if (connection) {
			const logLevelClient = new LogLevelSetterChannelClient(connection.getChannel('loglevel'));
			logLevelClient.setLevel(logService.getLevel());
			this._register(logService.onDidChangeLogLevel(level => logLevelClient.setLevel(level)));
		}
	}
}

class RemoteLogOutputChannels implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		remoteAgentService.getEnvironment().then(remoteEnv => {
			if (remoteEnv) {
				const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
				outputChannelRegistry.registerChannel({ id: 'remoteExtensionLog', label: localize('remoteExtensionLog', "Remote Server"), file: joinPath(remoteEnv.logsPath, `${RemoteExtensionLogFileName}.log`), log: true });
			}
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(LabelContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteLogOutputChannels, LifecyclePhase.Restored);
