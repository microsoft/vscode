/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../base/common/assert.js';
import * as types from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IConfigurationService = createDecorator('configurationService');
export function isConfigurationOverrides(obj) {
    const thing = obj;
    return thing
        && typeof thing === 'object'
        && (!thing.overrideIdentifier || typeof thing.overrideIdentifier === 'string')
        && (!thing.resource || thing.resource instanceof URI);
}
export function isConfigurationUpdateOverrides(obj) {
    const thing = obj;
    return thing
        && typeof thing === 'object'
        && (!thing.overrideIdentifiers || Array.isArray(thing.overrideIdentifiers))
        && !thing.overrideIdentifier
        && (!thing.resource || thing.resource instanceof URI);
}
export var ConfigurationTarget;
(function (ConfigurationTarget) {
    ConfigurationTarget[ConfigurationTarget["APPLICATION"] = 1] = "APPLICATION";
    ConfigurationTarget[ConfigurationTarget["USER"] = 2] = "USER";
    ConfigurationTarget[ConfigurationTarget["USER_LOCAL"] = 3] = "USER_LOCAL";
    ConfigurationTarget[ConfigurationTarget["USER_REMOTE"] = 4] = "USER_REMOTE";
    ConfigurationTarget[ConfigurationTarget["WORKSPACE"] = 5] = "WORKSPACE";
    ConfigurationTarget[ConfigurationTarget["WORKSPACE_FOLDER"] = 6] = "WORKSPACE_FOLDER";
    ConfigurationTarget[ConfigurationTarget["DEFAULT"] = 7] = "DEFAULT";
    ConfigurationTarget[ConfigurationTarget["MEMORY"] = 8] = "MEMORY";
})(ConfigurationTarget || (ConfigurationTarget = {}));
export function ConfigurationTargetToString(configurationTarget) {
    switch (configurationTarget) {
        case 1 /* ConfigurationTarget.APPLICATION */: return 'APPLICATION';
        case 2 /* ConfigurationTarget.USER */: return 'USER';
        case 3 /* ConfigurationTarget.USER_LOCAL */: return 'USER_LOCAL';
        case 4 /* ConfigurationTarget.USER_REMOTE */: return 'USER_REMOTE';
        case 5 /* ConfigurationTarget.WORKSPACE */: return 'WORKSPACE';
        case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */: return 'WORKSPACE_FOLDER';
        case 7 /* ConfigurationTarget.DEFAULT */: return 'DEFAULT';
        case 8 /* ConfigurationTarget.MEMORY */: return 'MEMORY';
    }
}
export function getConfigValueInTarget(configValue, scope) {
    switch (scope) {
        case 1 /* ConfigurationTarget.APPLICATION */:
            return configValue.applicationValue;
        case 2 /* ConfigurationTarget.USER */:
            return configValue.userValue;
        case 3 /* ConfigurationTarget.USER_LOCAL */:
            return configValue.userLocalValue;
        case 4 /* ConfigurationTarget.USER_REMOTE */:
            return configValue.userRemoteValue;
        case 5 /* ConfigurationTarget.WORKSPACE */:
            return configValue.workspaceValue;
        case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
            return configValue.workspaceFolderValue;
        case 7 /* ConfigurationTarget.DEFAULT */:
            return configValue.defaultValue;
        case 8 /* ConfigurationTarget.MEMORY */:
            return configValue.memoryValue;
        default:
            assertNever(scope);
    }
}
export function isConfigured(configValue) {
    return configValue.applicationValue !== undefined ||
        configValue.userValue !== undefined ||
        configValue.userLocalValue !== undefined ||
        configValue.userRemoteValue !== undefined ||
        configValue.workspaceValue !== undefined ||
        configValue.workspaceFolderValue !== undefined;
}
export function toValuesTree(properties, conflictReporter) {
    const root = Object.create(null);
    for (const key in properties) {
        addToValueTree(root, key, properties[key], conflictReporter);
    }
    return root;
}
export function addToValueTree(settingsTreeRoot, key, value, conflictReporter) {
    const segments = key.split('.');
    const last = segments.pop();
    let curr = settingsTreeRoot;
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        let obj = curr[s];
        switch (typeof obj) {
            case 'undefined':
                obj = curr[s] = Object.create(null);
                break;
            case 'object':
                if (obj === null) {
                    conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is null`);
                    return;
                }
                break;
            default:
                conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is ${JSON.stringify(obj)}`);
                return;
        }
        curr = obj;
    }
    if (typeof curr === 'object' && curr !== null) {
        try {
            curr[last] = value; // workaround https://github.com/microsoft/vscode/issues/13606
        }
        catch (e) {
            conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
        }
    }
    else {
        conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
    }
}
export function removeFromValueTree(valueTree, key) {
    const segments = key.split('.');
    doRemoveFromValueTree(valueTree, segments);
}
function doRemoveFromValueTree(valueTree, segments) {
    if (!valueTree) {
        return;
    }
    const valueTreeRecord = valueTree;
    const first = segments.shift();
    if (segments.length === 0) {
        // Reached last segment
        delete valueTreeRecord[first];
        return;
    }
    if (Object.keys(valueTreeRecord).indexOf(first) !== -1) {
        const value = valueTreeRecord[first];
        if (typeof value === 'object' && !Array.isArray(value)) {
            doRemoveFromValueTree(value, segments);
            if (Object.keys(value).length === 0) {
                delete valueTreeRecord[first];
            }
        }
    }
}
export function getConfigurationValue(config, settingPath, defaultValue) {
    function accessSetting(config, path) {
        let current = config;
        for (const component of path) {
            if (typeof current !== 'object' || current === null) {
                return undefined;
            }
            current = current[component];
        }
        return current;
    }
    const path = settingPath.split('.');
    const result = accessSetting(config, path);
    return typeof result === 'undefined' ? defaultValue : result;
}
export function merge(base, add, overwrite) {
    Object.keys(add).forEach(key => {
        if (key !== '__proto__') {
            if (key in base) {
                if (types.isObject(base[key]) && types.isObject(add[key])) {
                    merge(base[key], add[key], overwrite);
                }
                else if (overwrite) {
                    base[key] = add[key];
                }
            }
            else {
                base[key] = add[key];
            }
        }
    });
}
export function getLanguageTagSettingPlainKey(settingKey) {
    return settingKey
        .replace(/^\[/, '')
        .replace(/]$/g, '')
        .replace(/\]\[/g, ', ');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRzdELE9BQU8sS0FBSyxLQUFLLE1BQU0sK0JBQStCLENBQUM7QUFDdkQsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHOUUsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsZUFBZSxDQUF3QixzQkFBc0IsQ0FBQyxDQUFDO0FBRXBHLE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFZO0lBQ3BELE1BQU0sS0FBSyxHQUFHLEdBQThCLENBQUM7SUFDN0MsT0FBTyxLQUFLO1dBQ1IsT0FBTyxLQUFLLEtBQUssUUFBUTtXQUN6QixDQUFDLENBQUMsS0FBSyxDQUFDLGtCQUFrQixJQUFJLE9BQU8sS0FBSyxDQUFDLGtCQUFrQixLQUFLLFFBQVEsQ0FBQztXQUMzRSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFPRCxNQUFNLFVBQVUsOEJBQThCLENBQUMsR0FBWTtJQUMxRCxNQUFNLEtBQUssR0FBRyxHQUE4RCxDQUFDO0lBQzdFLE9BQU8sS0FBSztXQUNSLE9BQU8sS0FBSyxLQUFLLFFBQVE7V0FDekIsQ0FBQyxDQUFFLEtBQXVDLENBQUMsbUJBQW1CLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBRSxLQUF1QyxDQUFDLG1CQUFtQixDQUFDLENBQUM7V0FDOUksQ0FBRSxLQUFpQyxDQUFD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