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
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, foreground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, scrollbarSliderActiveBackground, scrollbarSliderHoverBackground, textLinkActiveForeground, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { SIDE_BAR_BACKGROUND } from '../../../common/theme.js';
import { IIssueFormService, IWorkbenchIssueService } from '../common/issue.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IIntegrityService } from '../../../services/integrity/common/integrity.js';
let NativeIssueService = class NativeIssueService {
    constructor(issueFormService, themeService, extensionManagementService, extensionEnablementService, workspaceTrustManagementService, experimentService, authenticationService, integrityService) {
        this.issueFormService = issueFormService;
        this.themeService = themeService;
        this.extensionManagementService = extensionManagementService;
        this.extensionEnablementService = extensionEnablementService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.experimentService = experimentService;
        this.authenticationService = authenticationService;
        this.integrityService = integrityService;
    }
    async openReporter(dataOverrides = {}) {
        const extensionData = [];
        try {
            const extensions = await this.extensionManagementService.getInstalled();
            const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled(extension) || (dataOverrides.extensionId && extension.identifier.id === dataOverrides.extensionId));
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
                    data: dataOverrides.data,
                    uri: dataOverrides.uri,
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
                version: '0.0.0',
                repositoryUrl: undefined,
                bugsUrl: undefined,
                extensionData: 'Extensions data loading',
                displayName: `Extensions not loaded: ${e}`,
                id: 'workbench.issue',
                isTheme: false,
                isBuiltin: true
            });
        }
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
        const theme = this.themeService.getColorTheme();
        const issueReporterData = Object.assign({
            styles: getIssueReporterStyles(theme),
            zoomLevel: getZoomLevel(mainWindow),
            enabledExtensions: extensionData,
            experiments: experiments?.join('\n'),
            restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
            isUnsupported,
            githubAccessToken
        }, dataOverrides);
        return this.issueFormService.openReporter(issueReporterData);
    }
};
NativeIssueService = __decorate([
    __param(0, IIssueFormService),
    __param(1, IThemeService),
    __param(2, IExtensionManagementService),
    __param(3, IWorkbenchExtensionEnablementService),
    __param(4, IWorkspaceTrustManagementService),
    __param(5, IWorkbenchAssignmentService),
    __param(6, IAuthenticationService),
    __param(7, IIntegrityService)
], NativeIssueService);
export { NativeIssueService };
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
        sliderBackgroundColor: getColor(theme, SIDE_BAR_BACKGROUND),
        sliderHoverColor: getColor(theme, scrollbarSliderHoverBackground),
    };
}
function getColor(theme, key) {
    const color = theme.getColor(key);
    return color ? color.toString() : undefined;
}
registerSingleton(IWorkbenchIssueService, NativeIssueService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNzdWVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaXNzdWUvZWxlY3Ryb24tYnJvd3Nlci9pc3N1ZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUVySCxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLFVBQVUsRUFBRSx1QkFBdUIsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSw4QkFBOEIsRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSwrQkFBK0IsRUFBRSw4QkFBOEIsRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlaLE9BQU8sRUFBZSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMzRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQXNFLHNCQUFzQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkosT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDdkcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDbkcsT0FBTyxFQUFFLG9DQUFvQyxF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