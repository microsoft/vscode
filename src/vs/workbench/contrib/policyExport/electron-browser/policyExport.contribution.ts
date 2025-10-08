/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IPolicyWriterService } from '../../../../platform/policy/common/policy.js';

export class PolicyExportContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.policyExport';

	constructor(
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IPolicyWriterService private readonly policyWriterService: IPolicyWriterService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const platform = this.nativeEnvironmentService.exportPolicyType;
		if (platform) {
			void this.exportPolicyAndQuit(platform);
		}
	}

	private log(msg: string | undefined, ...args: any[]) {
		this.logService.info(`[${PolicyExportContribution.ID}]`, msg, ...args);
	}

	private async exportPolicyAndQuit(platform: string): Promise<void> {
		try {
			if (platform !== 'darwin' && platform !== 'win32') {
				throw new Error(`Received invalid platform: ${platform}. Usage: <code> --export-policy-type=darwin|win32`);
			}

			this.log('Export begun. Waiting for ready state.');
			await this.extensionService.whenInstalledExtensionsRegistered();
			await this.configurationService.whenRemoteConfigurationLoaded();

			this.log('Extensions and configuration loaded.');
			const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
			const configurationProperties = configurationRegistry.getConfigurationProperties();
			const configs = [];
			for (const [key, schema] of Object.entries(configurationProperties)) {
				// Check for the localization property for now to remain backwards compatible.
				if (schema.policy?.localization) {
					configs.push({ key, schema });
				}
			}

			this.log(`Discovered ${configs.length} configurations to export for policy.`);
			await this.policyWriterService.write(configs, platform);
			this.log(`Successfully exported policy for ${configs.length} configurations.`);

			await this.nativeHostService.exit(0);
		} catch (error) {
			this.log('Failed to export policy', error);
			await this.nativeHostService.exit(1);
		}
	}
}

registerWorkbenchContribution2(
	PolicyExportContribution.ID,
	PolicyExportContribution,
	WorkbenchPhase.Eventually,
);
