/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PolicyExportContribution_1;
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { PolicyCategory, PolicyCategoryData } from '../../../../base/common/policy.js';
import { join } from '../../../../base/common/path.js';
let PolicyExportContribution = class PolicyExportContribution extends Disposable {
    static { PolicyExportContribution_1 = this; }
    static { this.ID = 'workbench.contrib.policyExport'; }
    static { this.DEFAULT_POLICY_EXPORT_PATH = 'build/lib/policies/policyData.jsonc'; }
    constructor(nativeEnvironmentService, extensionService, fileService, configurationService, nativeHostService, progressService, logService) {
        super();
        this.nativeEnvironmentService = nativeEnvironmentService;
        this.extensionService = extensionService;
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.nativeHostService = nativeHostService;
        this.progressService = progressService;
        this.logService = logService;
        // Skip for non-development flows
        if (this.nativeEnvironmentService.isBuilt) {
            return;
        }
        const policyDataPath = this.nativeEnvironmentService.exportPolicyData;
        if (policyDataPath !== undefined) {
            const defaultPath = join(this.nativeEnvironmentService.appRoot, PolicyExportContribution_1.DEFAULT_POLICY_EXPORT_PATH);
            void this.exportPolicyDataAndQuit(policyDataPath ? policyDataPath : defaultPath);
        }
    }
    log(msg, ...args) {
        this.logService.info(`[${PolicyExportContribution_1.ID}]`, msg, ...args);
    }
    async exportPolicyDataAndQuit(policyDataPath) {
        try {
            await this.progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: `Exporting policy data to ${policyDataPath}`
            }, async (_progress) => {
                this.log('Export started. Waiting for configurations to load.');
                await this.extensionService.whenInstalledExtensionsRegistered();
                await this.configurationService.whenRemoteConfigurationLoaded();
                this.log('Extensions and configuration loaded.');
                const configurationRegistry = Registry.as(Extensions.Configuration);
                const configurationProperties = {
                    ...configurationRegistry.getExcludedConfigurationProperties(),
                    ...configurationRegistry.getConfigurationProperties(),
                };
                const policyData = {
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
                const extensionPolicies = distroProduct['extensionConfigurationPolicy'];
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
        }
        catch (error) {
            this.log('Failed to export policy', error);
            await this.nativeHostService.exit(1);
        }
    }
    /**
     * Reads the distro product.json for the 'stable' quality.
     * Checks DISTRO_PRODUCT_JSON env var (for testing),
     * then falls back to fetching from the GitHub API using GITHUB_TOKEN.
     */
    async getDistroProductJson() {
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
        const distroCommit = packageJson.distro;
        if (!distroCommit) {
            throw new Error('No distro commit found in package.json. ' +
                'Use `npm run export-policy-data` which sets up the required environment.');
        }
        const token = process.env['GITHUB_TOKEN'];
        if (!token) {
            throw new Error('GITHUB_TOKEN is required to fetch distro product.json. ' +
                'Use `npm run export-policy-data` which sets up the required environment.');
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
        const data = await response.json();
        if (data.encoding !== 'base64') {
            throw new Error(`Unexpected encoding from GitHub API: ${data.encoding}`);
        }
        const content = VSBuffer.wrap(Uint8Array.from(atob(data.content), c => c.charCodeAt(0))).toString();
        return JSON.parse(content);
    }
};
PolicyExportContribution = PolicyExportContribution_1 = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, IExtensionService),
    __param(2, IFileService),
    __param(3, IWorkbenchConfigurationService),
    __param(4, INativeHostService),
    __param(5, IProgressService),
    __param(6, ILogService)
], PolicyExportContribution);
export { PolicyExportContribution };
registerWorkbenchContribution2(PolicyExportContribution.ID, PolicyExportContribution, 4 /* WorkbenchPhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWN5RXhwb3J0LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3BvbGljeUV4cG9ydC9lbGVjdHJvbi1icm93c2VyL3BvbGljeUV4cG9ydC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sa0NBQWtDLENBQUM7QUFDMUgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNyRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQTBCLE1BQU0sb0VBQW9FLENBQUM7QUFDeEgsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLGtEQUFrRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVB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