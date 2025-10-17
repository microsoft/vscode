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
import { Extensions, IConfigurationRegistry, IRegisteredConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IPolicy, LocalizedValue, PolicyCategory, PolicyCategoryTitle } from '../../../../base/common/policy.js';

interface CategoryDto {
	key: string;
	name: LocalizedValue;
}

type PolicyDto = Omit<IPolicy, 'value'> & {
	key: string;
	type: IRegisteredConfigurationPropertySchema['type'];
	default: IRegisteredConfigurationPropertySchema['default'];
	enum: IRegisteredConfigurationPropertySchema['enum'];
};

interface ExportedPolicyData {
	categories: CategoryDto[];
	policies: PolicyDto[];
}

export class PolicyExportContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.policyExport';
	static readonly DEFAULT_POLICY_EXPORT_PATH = 'build/lib/policyData.json';

	constructor(
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProgressService private readonly progressService: IProgressService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const policyDataPath = this.nativeEnvironmentService.exportPolicyData;
		if (policyDataPath !== undefined) {
			void this.exportPolicyDataAndQuit(policyDataPath ? policyDataPath : PolicyExportContribution.DEFAULT_POLICY_EXPORT_PATH);
		}
	}

	private log(msg: string | undefined, ...args: any[]) {
		this.logService.info(`[${PolicyExportContribution.ID}]`, msg, ...args);
	}

	private async exportPolicyDataAndQuit(policyDataPath: string): Promise<void> {
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: `Exporting policy data to ${policyDataPath}`
			}, async (_progress) => {
				this.log('Export started. Waiting for configurations to load.');
				await this.extensionService.whenInstalledExtensionsRegistered();
				await this.configurationService.whenRemoteConfigurationLoaded();

				this.log('Extensions and configuration loaded.');
				const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
				const configurationProperties = {
					...configurationRegistry.getExcludedConfigurationProperties(),
					...configurationRegistry.getConfigurationProperties(),
				};

				const policyData: ExportedPolicyData = {
					categories: Object.values(PolicyCategory).map(category => ({
						key: category,
						name: {
							key: category,
							value: PolicyCategoryTitle[category],
						}
					})),
					policies: []
				};

				for (const [key, schema] of Object.entries(configurationProperties)) {
					// Check for the localization property for now to remain backwards compatible.
					if (schema.policy?.localization) {
						policyData.policies.push({
							key,
							name: schema.policy.name,
							category: schema.policy.category,
							minimumVersion: schema.policy.minimumVersion,
							localization: {
								description: schema.policy.localization.description,
								enumDescriptions: schema.policy.localization.enumDescriptions,
							},
							type: schema.type,
							default: schema.default,
							enum: schema.enum,
						});
					}
				}
				this.log(`Discovered ${policyData.policies.length} policies to export.`);

				const policyDataFileContent = JSON.stringify(policyData, null, 4);
				await this.fileService.writeFile(URI.file(policyDataPath), VSBuffer.fromString(policyDataFileContent));
				this.log(`Successfully exported ${policyData.policies.length} policies.`);
			});

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
