/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IPolicy } from '../../../../base/common/policy.js';
import { JSONSchemaType } from '../../../../base/common/jsonSchema.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { resolvePath } from '../../../../base/common/resources.js';
import { cwd } from '../../../../base/common/process.js';


interface ExportedPolicySetting {
	type: JSONSchemaType | JSONSchemaType[] | undefined;
	description: string;
	default: any;
	policy: IPolicy;
}

export class PolicyConfigurationExportContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.policyConfigurationExport';

	constructor(
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const exportPath = this.nativeEnvironmentService.exportPolicyConfiguration;
		if (!exportPath || !exportPath.length) {
			return;
		}
		this.exportPolicyAndQuit(exportPath);
	}


	private log(msg: string | undefined, ...args: any[]) {
		this.logService.info(`[${PolicyConfigurationExportContribution.ID}]`, msg, ...args);
	}

	private async exportPolicyAndQuit(destinationPath: string): Promise<void> {
		try {
			this.log('Export begun. Waiting for ready state.');
			await this.extensionService.whenInstalledExtensionsRegistered();
			await this.configurationService.whenRemoteConfigurationLoaded();
			this.log('Extensions and configuration loaded');
			const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
			const allConfigProperties = configurationRegistry.getConfigurationProperties();
			const policyEnabledProperties: { [key: string]: ExportedPolicySetting } = {};
			Object.keys(allConfigProperties).forEach(key => {
				const property = allConfigProperties[key];
				if (property.policy) {
					const { type, description, default: defaultValue, policy } = property;
					if (!type || !policy) {
						this.log(`Export failed: '${key}' is malformed`);
						return;
					}
					policyEnabledProperties[key] = {
						type,
						description: description || '', //TODO:
						default: defaultValue,
						policy,
					};
				}
			});
			const content = JSON.stringify(policyEnabledProperties, null, 2);
			const cwdUri = URI.file(cwd());
			await this.fileService.writeFile(resolvePath(cwdUri, destinationPath), VSBuffer.fromString(content));
			this.log(`Exported to '${destinationPath}'`);
			this.log(`Exported ${Object.keys(policyEnabledProperties).length} settings`);
			await this.nativeHostService.exit(0);
		} catch (error) {
			this.log('Failed to export policy configuration', error);
			await this.nativeHostService.exit(1);
		}
	}
}

registerWorkbenchContribution2(
	PolicyConfigurationExportContribution.ID,
	PolicyConfigurationExportContribution,
	WorkbenchPhase.Eventually,
);
