/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { isWeb } from 'vs/base/common/platform';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Schemas } from 'vs/base/common/network';

export class LabelContribution implements IWorkbenchContribution {
	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService) {
		this.registerFormatters();
	}

	private useWindowsPaths(): boolean {
		if (this.environmentService.configuration.folderUri) {
			return this.environmentService.configuration.folderUri.fsPath.indexOf('/') === -1;
		}

		if (this.environmentService.configuration.workspace) {
			return this.environmentService.configuration.workspace.configPath.fsPath.indexOf('/') === -1;
		}

		return false;
	}

	private registerFormatters(): void {
		if (isWeb) {
			this.labelService.registerFormatter({
				scheme: Schemas.vscodeRemote,
				authority: this.environmentService.configuration.remoteAuthority,
				formatting: {
					label: '${path}',
					separator: this.useWindowsPaths() ? '\\' : '/',
					tildify: !this.useWindowsPaths()
				}
			});
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(LabelContribution, LifecyclePhase.Starting);

