/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { cloneAndChange, safeStringify } from '../../../base/common/objects.js';
import { isObject } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { getRemoteName } from '../../remote/common/remoteHosts.js';
import { verifyMicrosoftInternalDomain } from './commonProperties.js';
import { TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from './telemetry.js';
/**
 * A special class used to denoting a telemetry value which should not be clean.
 * This is because that value is "Trusted" not to contain identifiable information such as paths.
 * NOTE: This is used as an API type as well, and should not be changed.
 */
export class TelemetryTrustedValue {
    constructor(value) {
        this.value = value;
        // This is merely used as an identifier as the instance will be lost during serialization over the exthost
        this.isTrustedTelemetryValue = true;
    }
}
export class NullTelemetryServiceShape {
    constructor() {
        this.telemetryLevel = 0 /* TelemetryLevel.NONE */;
        this.sessionId = 'someValue.sessionId';
        this.machineId = 'someValue.machineId';
        this.sqmId = 'someValue.sqmId';
        this.devDeviceId = 'someValue.devDeviceId';
        this.firstSessionDate = 'someValue.firstSessionDate';
        this.sendErrorTelemetry = false;
    }
    publicLog() { }
    publicLog2() { }
    publicLogError() { }
    publicLogError2() { }
    setExperimentProperty() { }
    setCommonProperty() { }
}
export const NullTelemetryService = new NullTelemetryServiceShape();
export class NullEndpointTelemetryService {
    async publicLog(_endpoint, _eventName, _data) {
        // noop
    }
    async publicLogError(_endpoint, _errorEventName, _data) {
        // noop
    }
}
export const telemetryLogId = 'telemetry';
export const TelemetryLogGroup = { id: telemetryLogId, name: localize('telemetryLogName', "Telemetry") };
export const NullAppender = { log: () => null, flush: () => Promise.resolve(undefined) };
/**
 * Determines whether or not we support logging telemetry.
 * This checks if the product is capable of collecting telemetry but not whether or not it can send it
 * For checking the user setting and what telemetry you can send please check `getTelemetryLevel`.
 * This returns true if `--disable-telemetry` wasn't used, the product.json allows for telemetry, and we're not testing an extension
 * If false telemetry is disabled throughout the product
 * @param productService
 * @param environmentService
 * @returns false - telemetry is completely disabled, true - telemetry is logged locally, but may not be sent
 */
export function supportsTelemetry(productService, environmentService) {
    // If it's OSS and telemetry isn't disabled via the CLI we will allow it for logging only purposes
    if (!environmentService.isBuilt && !environmentService.disableTelemetry) {
        return true;
    }
    return !(environmentService.disableTelemetry || !productService.enableTelemetry);
}
/**
 * Checks to see if we're in logging only mode to debug telemetry.
 * This is if telemetry is enabled and we're in OSS, but no telemetry key is provided so it's not being sent just logged.
 * @param productService
 * @param environmentService
 * @returns True if telemetry is actually disabled and we're only logging for debug purposes
 */
export function isLoggingOnly(productService, environmentService) {
    // If we're testing an extension, log telemetry for debug purposes
    if (environmentService.extensionTestsLocationURI) {
        return true;
    }
    // Logging only mode is only for OSS
    if (environmentService.isBuilt) {
        return false;
    }
    if (environmentService.disableTelemetry) {
        return false;
    }
    if (productService.enableTelemetry && productService.aiConfig?.ariaKey) {
        return false;
    }
    return true;
}
/**
 * Determines how telemetry is handled based on the user's configuration.
 *
 * @param configurationService
 * @returns OFF, ERROR, ON
 */
export function getTelemetryLevel(configurationService) {
    const newConfig = configurationService.getValue(TELEMETRY_SETTING_ID);
    const crashReporterConfig = configurationService.getValue(TELEMETRY_CRASH_REPORTER_SETTING_ID);
    const oldConfig = configurationService.getValue(TELEMETRY_OLD_SETTING_ID);
    // If `telemetry.enableCrashReporter` is false or `telemetry.enableTelemetry' is false, disable telemetry
    if (oldConfig === false || crashReporterConfig === false) {
        return 0 /* TelemetryLevel.NONE */;
    }
    // Maps new telemetry setting to a telemetry level
    switch (newConfig ?? "all" /* TelemetryConfiguration.ON */) {
        case "all" /* TelemetryConfiguration.ON */:
            return 3 /* TelemetryLevel.USAGE */;
        case "error" /* TelemetryConfiguration.ERROR */:
            return 2 /* TelemetryLevel.ERROR */;
        case "crash" /* TelemetryConfiguration.CRASH */:
            return 1 /* TelemetryLevel.CRASH */;
        case "off" /* TelemetryConfiguration.OFF */:
            return 0 /* TelemetryLevel.NONE */;
    }
}
export function validateTelemetryData(data) {
    const properties = {};
    const measurements = {};
    const flat = {};
    flatten(data, flat);
    for (let prop in flat) {
        // enforce property names less than 150 char, take the last 150 char
        prop = prop.length > 150 ? prop.substr(prop.length - 149) : prop;
        const value = flat[prop];
        if (typeof value === 'number') {
            measurements[prop] = value;
        }
        else if (typeof value === 'boolean') {
            measurements[prop] = value ? 1 : 0;
        }
        else if (typeof value === 'string') {
            if (value.length > 8192) {
                console.warn(`Telemetry property: ${prop} has been trimmed to 8192, the original length is ${value.length}`);
            }
            //enforce property value to be less than 8192 char, take the first 8192 char
            // https://docs.microsoft.com/en-us/azure/azure-monitor/app/api-custom-events-metrics#limits
            properties[prop] = value.substring(0, 8191);
        }
        else if (typeof value !== 'undefined' && value !== null) {
            properties[prop] = String(value);
        }
    }
    return {
        properties,
        measurements
    };
}
export function cleanRemoteAuthority(remoteAuthority, config) {
    if (!remoteAuthority) {
        return 'none';
    }
    const remoteName = getRemoteName(remoteAuthority);
    const set1 = config?.remoteExtensionTips;
    if (set1 && Object.prototype.hasOwnProperty.call(set1, remoteName)) {
        return remoteName;
    }
    const set2 = config?.virtualWorkspaceExtensionTips;
    if (set2 && Object.prototype.hasOwnProperty.call(set2, remoteName)) {
        return remoteName;
    }
    return 'other';
}
function flatten(obj, result, order = 0, prefix) {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
        return;
    }
    const source = obj;
    for (const item of Object.getOwnPropertyNames(source)) {
        const value = source[item];
        const index = prefix ? prefix + item : item;
        if (Array.isArray(value)) {
            result[index] = safeStringify(value);
        }
        else if (value instanceof Date) {
            // TODO unsure why this is here and not in _getData
            result[index] = value.toISOString();
        }
        else if (isObject(value)) {
            if (order < 2) {
                flatten(value, result, order + 1, index + '.');
            }
            else {
                result[index] = safeStringify(value);
            }
        }
        else {
            result[index] = value;
        }
    }
}
/**
 * Whether or not this is an internal user
 * @param productService The product service
 * @param configService The config servivce
 * @returns true if internal, false otherwise
 */
export function isInternalTelemetry(productService, configService) {
    const msftInternalDomains = productService.msftInternalDomains || [];
    const internalTesting = configService.getValue('telemetry.internalTesting');
    return verifyMicrosoftInternalDomain(msftInternalDomains) || internalTesting;
}
export function getPiiPathsFromEnvironment(paths) {
    return [paths.appRoot, paths.extensionsPath, paths.userHome.fsPath, paths.tmpDir.fsPath, paths.userDataPath];
}
//#region Telemetry Cleaning
/**
 * Cleans a given stack of possible paths
 * @param stack The stack to sanitize
 * @param cleanupPatterns Cleanup patterns to remove from the stack
 * @returns The cleaned stack
 */
function anonymizeFilePaths(stack, cleanupPatterns) {
    // Fast check to see if it is a file path to avoid doing unnecessary heavy regex work
    if (!stack || (!stack.includes('/') && !stack.includes('\\'))) {
        return stack;
    }
    let updatedStack = stack;
    const cleanUpIndexes = [];
    for (const regexp of cleanupPatterns) {
        while (true) {
            const result = regexp.exec(stack);
            if (!result) {
                break;
            }
            cleanUpIndexes.push([result.index, regexp.lastIndex]);
        }
    }
    // Match node_modules or node_modules.asar at any position in the path, capturing the node_modules/... suffix
    const nodeModulesRegex = /(?:^|[\\\/])((node_modules|node_modules\.asar)[\\\/].*)$/;
    // Match VS Code extension paths:
    // 1. User extensions: .vscode/extensions/, .vscode-insiders/extensions/, .vscode-server/extensions/, .vscode-server-insiders/extensions/, etc.
    // 2. Built-in extensions: resources/app/extensions/
    // Capture everything from the vscode folder or resources/app/extensions onwards
    const vscodeExtensionsPathRegex = /^(.*?)((?:\.vscode(?:-[a-z]+)*|resources[\\\/]app)[\\\/]extensions[\\\/].*)$/i;
    const fileRegex = /(file:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w\-\._@]+(\\\\|\\|\/))+[\w\-\._@]*/g;
    let lastIndex = 0;
    updatedStack = '';
    while (true) {
        const result = fileRegex.exec(stack);
        if (!result) {
            break;
        }
        // Check to see if the any cleanupIndexes partially overlap with this match
        const overlappingRange = cleanUpIndexes.some(([start, end]) => result.index < end && start < fileRegex.lastIndex);
        // anoynimize user file paths that do not need to be retained or cleaned up.
        if (!overlappingRange) {
            // Check if this is a VS Code extension path - if so, preserve the .vscode*/extensions/... portion
            const vscodeExtMatch = vscodeExtensionsPathRegex.exec(result[0]);
            if (vscodeExtMatch) {
                // Keep ".vscode[-variant]/extensions/extension-name/..." but redact the parent folder
                updatedStack += stack.substring(lastIndex, result.index) + '<REDACTED: user-file-path>/' + vscodeExtMatch[2];
            }
            else {
                // Check if node_modules appears in the path — preserve node_modules/... suffix
                const nodeModulesMatch = nodeModulesRegex.exec(result[0]);
                if (nodeModulesMatch) {
                    updatedStack += stack.substring(lastIndex, result.index) + '<REDACTED: user-file-path>/' + nodeModulesMatch[1];
                }
                else {
                    updatedStack += stack.substring(lastIndex, result.index) + '<REDACTED: user-file-path>';
                }
            }
            lastIndex = fileRegex.lastIndex;
        }
    }
    if (lastIndex < stack.length) {
        updatedStack += stack.substr(lastIndex);
    }
    return updatedStack;
}
/**
 * Attempts to remove commonly leaked PII
 * @param property The property which will be removed if it contains user data
 * @returns The new value for the property
 */
function removePropertiesWithPossibleUserInfo(property) {
    // If for some reason it is undefined we skip it (this shouldn't be possible);
    if (!property) {
        return property;
    }
    const userDataRegexes = [
        { label: 'URL', regex: /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]*/ },
        { label: 'Google API Key', regex: /AIza[A-Za-z0-9_\\\-]{35}/ },
        { label: 'JWT', regex: /eyJ[0eXAiOiJKV1Qi|hbGci|a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/ },
        { label: 'Slack Token', regex: /xox[pbar]\-[A-Za-z0-9]/ },
        { label: 'GitHub Token', regex: /(gh[psuro]_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})/ },
        { label: 'Generic Secret', regex: /(key|token|sig|secret|signature|password|passwd|pwd|android:value)[^a-zA-Z0-9]/i },
        { label: 'CLI Credentials', regex: /((login|psexec|(certutil|psexec)\.exe).{1,50}(\s-u(ser(name)?)?\s+.{3,100})?\s-(admin|user|vm|root)?p(ass(word)?)?\s+["']?[^$\-\/\s]|(^|[\s\r\n\\])net(\.exe)?.{1,5}(user\s+|share\s+\/user:| user -? secrets ? set) \s + [^ $\s \/])/ },
        { label: 'Microsoft Entra ID', regex: /eyJ(?:0eXAiOiJKV1Qi|hbGci|[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.)/ },
        { label: 'Email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ }
    ];
    // Check for common user data in the telemetry events
    for (const secretRegex of userDataRegexes) {
        if (secretRegex.regex.test(property)) {
            return `<REDACTED: ${secretRegex.label}>`;
        }
    }
    return property;
}
/**
 * Does a best possible effort to clean a data object from any possible PII.
 * @param data The data object to clean
 * @param paths Any additional patterns that should be removed from the data set
 * @returns A new object with the PII removed
 */
export function cleanData(data, cleanUpPatterns) {
    if (!data) {
        return {};
    }
    return cloneAndChange(data, value => {
        // If it's a trusted value it means it's okay to skip cleaning so we don't clean it
        if (value instanceof TelemetryTrustedValue || Object.hasOwnProperty.call(value, 'isTrustedTelemetryValue')) {
            return value.value;
        }
        // We only know how to clean strings
        if (typeof value === 'string') {
            let updatedProperty = value.replaceAll('%20', ' ');
            // First we anonymize any possible file paths
            updatedProperty = anonymizeFilePaths(updatedProperty, cleanUpPatterns);
            // Then we do a simple regex replace with the defined patterns
            for (const regexp of cleanUpPatterns) {
                updatedProperty = updatedProperty.replace(regexp, '');
            }
            // Lastly, remove commonly leaked PII
            updatedProperty = removePropertiesWithPossibleUserInfo(updatedProperty);
            return updatedProperty;
        }
        return undefined;
    });
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXpELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUszQyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDdEUsT0FBTyxFQUFrSSxtQ0FBbUMsRUFBRSx3QkFBd0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRXJQOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8scUJBQXFCO0lBR2pDLFlBQTRCLEtBQVE7UUFBUixVQUFLLEdBQUwsS0FBSyxDQUFHO1FBRnBDLDBHQUEwRztRQUMxRiw0QkFBdUIsR0FBRyxJQUFJLENBQUM7SUFDUCxDQUFDO0NBQ3pDO0FBRUQsTUFBTSxPQUFPLHlCQUF5QjtJQUF0QztRQUVVLG1CQUFjLCtCQUF1QjtRQUNyQyxjQUFTLEdBQUcscUJBQXFCLENBQUM7UUFDbEMsY0FBUyxHQUFHLHFCQUFxQixDQUFDO1FBQ2xDLFVBQUssR0FBRyxpQkFBaUIsQ0FBQztRQUMxQixnQkFBVyxHQUFHLHVCQUF1QixDQUFDO1FBQ3RDLHFCQUFnQixHQUFHLDRCQUE0QixDQUFDO1FBQ2hELHVCQUFrQixHQUFHLEtBQUssQ0FBQztJQU9yQyxDQUFDO0lBTkEsU0FBUyxLQUFLLENBQUM7SUFDZixVQUFVLEtBQUssQ0FBQztJQUNoQixj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