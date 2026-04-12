/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as platform from '../../../base/common/platform.js';
export const ASSIGNMENT_STORAGE_KEY = 'VSCode.ABExp.FeatureData';
export const ASSIGNMENT_REFETCH_INTERVAL = 60 * 60 * 1000; // 1 hour
export var TargetPopulation;
(function (TargetPopulation) {
    TargetPopulation["Insiders"] = "insider";
    TargetPopulation["Public"] = "public";
    TargetPopulation["Exploration"] = "exploration";
})(TargetPopulation || (TargetPopulation = {}));
/*
Based upon the official VSCode currently existing filters in the
ExP backend for the VSCode cluster.
https://experimentation.visualstudio.com/Analysis%20and%20Experimentation/_git/AnE.ExP.TAS.TachyonHost.Configuration?path=%2FConfigurations%2Fvscode%2Fvscode.json&version=GBmaster
"X-MSEdge-Market": "detection.market",
"X-FD-Corpnet": "detection.corpnet",
"X-VSCode-AppVersion": "appversion",
"X-VSCode-Build": "build",
"X-MSEdge-ClientId": "clientid",
"X-VSCode-ExtensionName": "extensionname",
"X-VSCode-ExtensionVersion": "extensionversion",
"X-VSCode-TargetPopulation": "targetpopulation",
"X-VSCode-Language": "language",
"X-VSCode-Platform": "platform",
"X-VSCode-ReleaseDate": "releasedate"
*/
export var Filters;
(function (Filters) {
    /**
     * The market in which the extension is distributed.
     */
    Filters["Market"] = "X-MSEdge-Market";
    /**
     * The corporation network.
     */
    Filters["CorpNet"] = "X-FD-Corpnet";
    /**
     * Version of the application which uses experimentation service.
     */
    Filters["ApplicationVersion"] = "X-VSCode-AppVersion";
    /**
     * Insiders vs Stable.
     */
    Filters["Build"] = "X-VSCode-Build";
    /**
     * Client Id which is used as primary unit for the experimentation.
     */
    Filters["ClientId"] = "X-MSEdge-ClientId";
    /**
     * Developer Device Id which can be used as an alternate unit for experimentation.
     */
    Filters["DeveloperDeviceId"] = "X-VSCode-DevDeviceId";
    /**
     * Extension header.
     */
    Filters["ExtensionName"] = "X-VSCode-ExtensionName";
    /**
     * The version of the extension.
     */
    Filters["ExtensionVersion"] = "X-VSCode-ExtensionVersion";
    /**
     * The language in use by VS Code
     */
    Filters["Language"] = "X-VSCode-Language";
    /**
     * The target population.
     * This is used to separate internal, early preview, GA, etc.
     */
    Filters["TargetPopulation"] = "X-VSCode-TargetPopulation";
    /**
     * The platform (OS) on which VS Code is running.
     */
    Filters["Platform"] = "X-VSCode-Platform";
    /**
     * The release/build date of VS Code (UTC) in the format yyyymmddHH.
     */
    Filters["ReleaseDate"] = "X-VSCode-ReleaseDate";
})(Filters || (Filters = {}));
export class AssignmentFilterProvider {
    constructor(version, appName, machineId, devDeviceId, targetPopulation, releaseDate) {
        this.version = version;
        this.appName = appName;
        this.machineId = machineId;
        this.devDeviceId = devDeviceId;
        this.targetPopulation = targetPopulation;
        this.releaseDate = releaseDate;
    }
    /**
     * Returns a version string that can be parsed by the TAS client.
     * The tas client cannot handle suffixes lke "-insider"
     * Ref: https://github.com/microsoft/tas-client/blob/30340d5e1da37c2789049fcf45928b954680606f/vscode-tas-client/src/vscode-tas-client/VSCodeFilterProvider.ts#L35
     *
     * @param version Version string to be trimmed.
    */
    static trimVersionSuffix(version) {
        const regex = /\-[a-zA-Z0-9]+$/;
        const result = version.split(regex);
        return result[0];
    }
    getFilterValue(filter) {
        switch (filter) {
            case Filters.ApplicationVersion:
                return AssignmentFilterProvider.trimVersionSuffix(this.version); // productService.version
            case Filters.Build:
                return this.appName; // productService.nameLong
            case Filters.ClientId:
                return this.machineId;
            case Filters.DeveloperDeviceId:
                return this.devDeviceId;
            case Filters.Language:
                return platform.language;
            case Filters.ExtensionName:
                return 'vscode-core'; // always return vscode-core for exp service
            case Filters.ExtensionVersion:
                return '999999.0'; // always return a very large number for cross-extension experimentation
            case Filters.TargetPopulation:
                return this.targetPopulation;
            case Filters.Platform:
                return platform.PlatformToString(platform.platform);
            case Filters.ReleaseDate:
                return AssignmentFilterProvider.formatReleaseDate(this.releaseDate);
            default:
                return '';
        }
    }
    static formatReleaseDate(iso) {
        // Expect ISO format, fall back to empty string if not provided
        if (!iso) {
            return '';
        }
        // Remove separators and milliseconds: YYYY-MM-DDTHH:MM:SS.sssZ -> YYYYMMDDHH
        // Trimmed to 10 digits to fit within int32 bounds (ExP requirement)
        const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2})/.exec(iso);
        if (!match) {
            return '';
        }
        return match.slice(1, 5).join('');
    }
    getFilters() {
        const filters = new Map();
        const filterValues = Object.values(Filters);
        for (const value of filterValues) {
            filters.set(value, this.getFilterValue(value));
        }
        return filters;
    }
}
export function getInternalOrg(organisations) {
    const isVSCodeInternal = organisations?.includes('Visual-Studio-Code');
    const isGitHubInternal = organisations?.includes('github');
    const isMicrosoftInternal = organisations?.includes('microsoft') || organisations?.includes('ms-copilot') || organisations?.includes('MicrosoftCopilot');
    return isVSCodeInternal ? 'vscode' : isGitHubInternal ? 'github' : isMicrosoftInternal ? 'microsoft' : undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzaWdubWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUc3RCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRywwQkFBMEIsQ0FBQztBQUNqRSxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLFNBQVM7QUFTcEUsTUFBTSxDQUFOLElBQVksZ0JBSVg7QUFKRCxXQUFZLGdCQUFnQjtJQUMzQix3Q0FBb0IsQ0FBQTtJQUNwQixxQ0FBaUIsQ0FBQTtJQUNqQiwrQ0FBMkIsQ0FBQTtBQUM1QixDQUFDLEVBSlcsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUkzQjtBQUVEOzs7Ozs7Ozs7Ozs7Ozs7RUFlRTtBQUNGLE1BQU0sQ0FBTixJQUFZLE9BNkRYO0FBN0RELFdBQVksT0FBTztJQUNsQjs7T0FFRztJQUNILHFDQUEwQixDQUFBO0lBRTFCOztPQUVHO0lBQ0gsbUNBQXdCLENBQUE7SUFFeEI7O09BRUc7SUFDSCxxREFBMEMsQ0FBQTtJQUUxQzs7T0FFRztJQUNILG1DQUF3QixDQUFBO0lBRXhCOztPQUVHO0lBQ0gseUNBQThCLENBQUE7SUFFOUI7O09BRUc7SUFDSCxxREFBMEMsQ0FBQTtJQUUxQzs7T0FFRztJQUNILG1EQUF3QyxDQUFBO0lBRXhDOztPQUVHO0lBQ0gseURBQThDLENBQUE7SUFFOUM7O09BRUc7SUFDSCx5Q0FBOEIsQ0FBQTtJQUU5Qjs7O09BR0c7SUFDSCx5REFBOEMsQ0FBQTtJQUU5Qzs7T0FFRztJQUNILHlDQUE4QixDQUFBO0lBRTlCOztPQUVHO0lBQ0gsK0NBQW9DLENBQUE7QUFD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