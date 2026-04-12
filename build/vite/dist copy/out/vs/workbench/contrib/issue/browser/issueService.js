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
import { getZoomLevel } from '../../../../base/browser/browser.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { userAgent } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { normalizeGitHubUrl } from '../common/issueReporterUtil.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, foreground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, textLinkActiveForeground, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { SIDE_BAR_BACKGROUND } from '../../../common/theme.js';
import { IIssueFormService, IWorkbenchIssueService } from '../common/issue.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IIntegrityService } from '../../../services/integrity/common/integrity.js';
let BrowserIssueService = class BrowserIssueService {
    constructor(extensionService, productService, issueFormService, themeService, experimentService, workspaceTrustManagementService, integrityService, extensionManagementService, extensionEnablementService, authenticationService, configurationService, openerService) {
        this.extensionService = extensionService;
        this.productService = productService;
        this.issueFormService = issueFormService;
        this.themeService = themeService;
        this.experimentService = experimentService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.integrityService = integrityService;
        this.extensionManagementService = extensionManagementService;
        this.extensionEnablementService = extensionEnablementService;
        this.authenticationService = authenticationService;
        this.configurationService = configurationService;
        this.openerService = openerService;
    }
    async openReporter(options) {
        // If web reporter setting is false open the old GitHub issue reporter
        if (!this.configurationService.getValue('issueReporter.experimental.webReporter')) {
            const extensionId = options.extensionId;
            // If we don't have a extensionId, treat this as a Core issue
            if (!extensionId) {
                if (this.productService.reportIssueUrl) {
                    const uri = this.getIssueUriFromStaticContent(this.productService.reportIssueUrl);
                    await this.openerService.open(uri, { openExternal: true });
                    return;
                }
                throw new Error(`No issue reporting URL configured for ${this.productService.nameLong}.`);
            }
            const selectedExtension = this.extensionService.extensions.filter(ext => ext.identifier.value === options.extensionId)[0];
            const extensionGitHubUrl = this.getExtensionGitHubUrl(selectedExtension);
            if (!extensionGitHubUrl) {
                throw new Error(`Unable to find issue reporting url for ${extensionId}`);
            }
            const uri = this.getIssueUriFromStaticContent(`${extensionGitHubUrl}/issues/new`, selectedExtension);
            await this.openerService.open(uri, { openExternal: true });
        }
        if (this.productService.reportIssueUrl) {
            const theme = this.themeService.getColorTheme();
            const experiments = await this.experimentService.getCurrentExperiments();
            let githubAccessToken = '';
            try {
                const githubSessions = await this.authenticationService.getSessions('github');
                const potentialSessions = githubSessions.filter(session => session.scopes.includes('repo'));
                githubAccessToken = potentialSessions[0]?.accessToken;
            }
            catch (e) {
                // Ignore
            }
            // air on the side of caution and have false be the default
            let isUnsupported = false;
            try {
                isUnsupported = !(await this.integrityService.isPure()).isPure;
            }
            catch (e) {
                // Ignore
            }
            const extensionData = [];
            try {
                const extensions = await this.extensionManagementService.getInstalled();
                const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled(extension) || (options.extensionId && extension.identifier.id === options.extensionId));
                extensionData.push(...enabledExtensions.map((extension) => {
                    const { manifest } = extension;
                    const manifestKeys = manifest.contributes ? Object.keys(manifest.contributes) : [];
                    const isTheme = !manifest.main && !manifest.browser && manifestKeys.length === 1 && manifestKeys[0] === 'themes';
                    const isBuiltin = extension.type === 0 /* ExtensionType.System */;
                    return {
                        name: manifest.name,
                        publisher: manifest.publisher,
                        version: manifest.version,
                        repositoryUrl: manifest.repository && manifest.repository.url,
                        bugsUrl: manifest.bugs && manifest.bugs.url,
                        displayName: manifest.displayName,
                        id: extension.identifier.id,
                        data: options.data,
                        uri: options.uri,
                        isTheme,
                        isBuiltin,
                        extensionData: 'Extensions data loading',
                    };
                }));
            }
            catch (e) {
                extensionData.push({
                    name: 'Workbench Issue Service',
                    publisher: 'Unknown',
                    version: 'Unknown',
                    repositoryUrl: undefined,
                    bugsUrl: undefined,
                    extensionData: `Extensions not loaded: ${e}`,
                    displayName: `Extensions not loaded: ${e}`,
                    id: 'workbench.issue',
                    isTheme: false,
                    isBuiltin: true
                });
            }
            const issueReporterData = Object.assign({
                styles: getIssueReporterStyles(theme),
                zoomLevel: getZoomLevel(mainWindow),
                enabledExtensions: extensionData,
                experiments: experiments?.join('\n'),
                restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
                isUnsupported,
                githubAccessToken
            }, options);
            return this.issueFormService.openReporter(issueReporterData);
        }
        throw new Error(`No issue reporting URL configured for ${this.productService.nameLong}.`);
    }
    getExtensionGitHubUrl(extension) {
        if (extension.isBuiltin && this.productService.reportIssueUrl) {
            return normalizeGitHubUrl(this.productService.reportIssueUrl);
        }
        let repositoryUrl = '';
        const bugsUrl = extension?.bugs?.url;
        const extensionUrl = extension?.repository?.url;
        // If given, try to match the extension's bug url
        if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
            repositoryUrl = normalizeGitHubUrl(bugsUrl);
        }
        else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
            repositoryUrl = normalizeGitHubUrl(extensionUrl);
        }
        return repositoryUrl;
    }
    getIssueUriFromStaticContent(baseUri, extension) {
        const issueDescription = `ADD ISSUE DESCRIPTION HERE

Version: ${this.productService.version}
Commit: ${this.productService.commit ?? 'unknown'}
User Agent: ${userAgent ?? 'unknown'}
Embedder: ${this.productService.embedderIdentifier ?? 'unknown'}
${extension?.version ? `\nExtension version: ${extension.version}` : ''}
<!-- generated by web issue reporter -->`;
        return `${baseUri}?body=${encodeURIComponent(issueDescription)}&labels=web`;
    }
};
BrowserIssueService = __decorate([
    __param(0, IExtensionService),
    __param(1, IProductService),
    __param(2, IIssueFormService),
    __param(3, IThemeService),
    __param(4, IWorkbenchAssignmentService),
    __param(5, IWorkspaceTrustManagementService),
    __param(6, IIntegrityService),
    __param(7, IExtensionManagementService),
    __param(8, IWorkbenchExtensionEnablementService),
    __param(9, IAuthenticationService),
    __param(10, IConfigurationService),
    __param(11, IOpenerService)
], BrowserIssueService);
export { BrowserIssueService };
export function getIssueReporterStyles(theme) {
    return {
        backgroundColor: getColor(theme, SIDE_BAR_BACKGROUND),
        color: getColor(theme, foreground),
        textLinkColor: getColor(theme, textLinkForeground),
        textLinkActiveForeground: getColor(theme, textLinkActiveForeground),
        inputBackground: getColor(theme, inputBackground),
        inputForeground: getColor(theme, inputForeground),
        inputBorder: getColor(theme, inputBorder),
        inputActiveBorder: getColor(theme, inputActiveOptionBorder),
        inputErrorBorder: getColor(theme, inputValidationErrorBorder),
        inputErrorBackground: getColor(theme, inputValidationErrorBackground),
        inputErrorForeground: getColor(theme, inputValidationErrorForeground),
        buttonBackground: getColor(theme, buttonBackground),
        buttonForeground: getColor(theme, buttonForeground),
        buttonHoverBackground: getColor(theme, buttonHoverBackground),
        sliderActiveColor: getColor(theme, scrollbarSliderActiveBackground),
        sliderBackgroundColor: getColor(theme, scrollbarSliderBackground),
        sliderHoverColor: getColor(theme, scrollbarSliderHoverBackground),
    };
}
function getColor(theme, key) {
    const color = theme.getColor(key);
    return color ? color.toString() : undefined;
}
registerSingleton(IWorkbenchIssueService, BrowserIssueService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNzdWVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaXNzdWUvYnJvd3Nlci9pc3N1ZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFckgsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLFVBQVUsRUFBRSx1QkFBdUIsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSw4QkFBOEIsRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSwrQkFBK0IsRUFBRSx5QkFBeUIsRUFBRSw4QkFBOEIsRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3piLE9BQU8sRUFBZSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5REFBeUQs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