/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { PolicyCategory, PolicyCategoryData } from '../../../../base/common/policy.js';
import { ExportedPolicyDataDto } from '../common/policyDto.js';
import { join } from '../../../../base/common/path.js';

interface ExtensionConfigurationPolicyEntry {
	readonly name: string;
	readonly category: string;
	readonly minimumVersion: `${number}.${number}`;
	readonly description: string;
}

export class PolicyExportContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.policyExport';
	static readonly DEFAULT_POLICY_EXPORT_PATH = 'build/lib/policies/policyData.jsonc';

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

		// Skip for non-development flows
		if (this.nativeEnvironmentService.isBuilt) {
			return;
		}

		const policyDataPath = this.nativeEnvironmentService.exportPolicyData;
		if (policyDataPath !== undefined) {
			const defaultPath = join(this.nativeEnvironmentService.appRoot, PolicyExportContribution.DEFAULT_POLICY_EXPORT_PATH);
			void this.exportPolicyDataAndQuit(policyDataPath ? policyDataPath : defaultPath);
		}
	}

	private log(msg: string | undefined, ...args: unknown[]) {
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

				const policyData: ExportedPolicyDataDto = {
					categories: Object.values(PolicyCategory).map(category => ({
						key: category,
						name: PolicyCategoryData[category].name
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
							included: schema.included !== false,
						});
					}
				}
				this.log(`Discovered ${policyData.policies.length} policies to export.`);

				// Merge extension configuration policies from the distro's product.json.
				// Checks DISTRO_PRODUCT_JSON env var (for testing),
				// then falls back to fetching from GitHub API with GITHUB_TOKEN.
				const distroProduct = await this.getDistroProductJson();
				const extensionPolicies = distroProduct['extensionConfigurationPolicy'] as Record<string, ExtensionConfigurationPolicyEntry> | undefined;
				if (extensionPolicies) {
					const existingKeys = new Set(policyData.policies.map(p => p.key));
					let added = 0;
					for (const [key, entry] of Object.entries(extensionPolicies)) {
						if (existingKeys.has(key)) {
							continue;
						}
						if (!entry.description || !entry.category) {
							throw new Error(`Extension policy '${key}' is missing required 'description' or 'category' field.`);
						}
						policyData.policies.push({
							key,
							name: entry.name,
							category: entry.category,
							minimumVersion: entry.minimumVersion,
							localization: {
								description: { key, value: entry.description },
							},
							type: 'boolean',
							default: true,
							included: true,
						});
						added++;
					}
					this.log(`Merged ${added} extension configuration policies.`);
				}

				const disclaimerComment = `/** THIS FILE IS AUTOMATICALLY GENERATED USING \`npm run export-policy-data\`. DO NOT MODIFY IT MANUALLY. **/`;
				const policyDataFileContent = `${disclaimerComment}\n${JSON.stringify(policyData, null, 4)}\n`;
				await this.fileService.writeFile(URI.file(policyDataPath), VSBuffer.fromString(policyDataFileContent));
				this.log(`Successfully exported ${policyData.policies.length} policies to ${policyDataPath}.`);
			});

			await this.nativeHostService.exit(0);
		} catch (error) {
			this.log('Failed to export policy', error);
			await this.nativeHostService.exit(1);
		}
	}

	/**
	 * Reads the distro product.json for the 'stable' quality.
	 * Checks DISTRO_PRODUCT_JSON env var (for testing),
	 * then falls back to fetching from the GitHub API using GITHUB_TOKEN.
	 */
	private async getDistroProductJson(): Promise<Record<string, unknown>> {
		const root = this.nativeEnvironmentService.appRoot;

		// 1. DISTRO_PRODUCT_JSON env var (for testing)
		const envPath = process.env['DISTRO_PRODUCT_JSON'];
		if (envPath) {
			this.log(`Reading distro product.json from DISTRO_PRODUCT_JSON=${envPath}`);
			const content = (await this.fileService.readFile(URI.file(envPath))).value.toString();
			return JSON.parse(content);
		}

		// 2. GitHub API with GITHUB_TOKEN
		const packageJsonPath = join(root, 'package.json');
		const packageJsonContent = (await this.fileService.readFile(URI.file(packageJsonPath))).value.toString();
		const packageJson = JSON.parse(packageJsonContent);
		const distroCommit: string | undefined = packageJson.distro;

		if (!distroCommit) {
			throw new Error(
				'No distro commit found in package.json. ' +
				'Use `npm run export-policy-data` which sets up the required environment.'
			);
		}

		const token = process.env['GITHUB_TOKEN'];
		if (!token) {
			throw new Error(
				'GITHUB_TOKEN is required to fetch distro product.json. ' +
				'Use `npm run export-policy-data` which sets up the required environment.'
			);
		}

		this.log(`Fetching distro product.json for commit ${distroCommit} from GitHub...`);
		const url = `https://api.github.com/repos/microsoft/vscode-distro/contents/mixin/stable/product.json?ref=${encodeURIComponent(distroCommit)}`;
		const response = await fetch(url, {
			headers: {
				'Accept': 'application/vnd.github+json',
				'Authorization': `Bearer ${token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				'User-Agent': 'VSCode Build'
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch distro product.json: ${response.status} ${response.statusText}`);
		}

		const data = await response.json() as { content: string; encoding: string };
		if (data.encoding !== 'base64') {
			throw new Error(`Unexpected encoding from GitHub API: ${data.encoding}`);
		}
		const content = VSBuffer.wrap(Uint8Array.from(atob(data.content), c => c.charCodeAt(0))).toString();
		return JSON.parse(content);
	}
}

registerWorkbenchContribution2(
	PolicyExportContribution.ID,
	PolicyExportContribution,
	WorkbenchPhase.Eventually,
);
