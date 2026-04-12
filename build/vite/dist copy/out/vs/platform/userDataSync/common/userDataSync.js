/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct } from '../../../base/common/arrays.js';
import { isObject, isString } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { allSettings, Extensions as ConfigurationExtensions, getAllConfigurationProperties, parseScope } from '../../configuration/common/configurationRegistry.js';
import { EXTENSION_IDENTIFIER_PATTERN } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../registry/common/platform.js';
export function getDisallowedIgnoredSettings() {
    const allSettings = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    return Object.keys(allSettings).filter(setting => !!allSettings[setting].disallowSyncIgnore);
}
export function getDefaultIgnoredSettings(excludeExtensions = false) {
    const allSettings = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const ignoredSettings = getIgnoredSettings(allSettings, excludeExtensions);
    const disallowedSettings = getDisallowedIgnoredSettings();
    return distinct([...ignoredSettings, ...disallowedSettings]);
}
export function getIgnoredSettingsForExtension(manifest) {
    if (!manifest.contributes?.configuration) {
        return [];
    }
    const configurations = Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration];
    if (!configurations.length) {
        return [];
    }
    const properties = getAllConfigurationProperties(configurations);
    return getIgnoredSettings(properties, false);
}
function getIgnoredSettings(properties, excludeExtensions) {
    const ignoredSettings = new Set();
    for (const key in properties) {
        if (excludeExtensions && !!properties[key].source) {
            continue;
        }
        const scope = isString(properties[key].scope) ? parseScope(properties[key].scope) : properties[key].scope;
        if (properties[key].ignoreSync
            || scope === 2 /* ConfigurationScope.MACHINE */
            || scope === 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */) {
            ignoredSettings.add(key);
        }
    }
    return [...ignoredSettings.values()];
}
export const USER_DATA_SYNC_CONFIGURATION_SCOPE = 'settingsSync';
export const CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM = 'settingsSync.keybindingsPerPlatform';
export function registerConfiguration() {
    const ignoredSettingsSchemaId = 'vscode://schemas/ignoredSettings';
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
        id: 'settingsSync',
        order: 30,
        title: localize('settings sync', "Settings Sync"),
        type: 'object',
        properties: {
            [CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM]: {
                type: 'boolean',
                description: localize('settingsSync.keybindingsPerPlatform', "Synchronize keybindings for each platform."),
                default: true,
                scope: 1 /* ConfigurationScope.APPLICATION */,
                tags: ['sync', 'usesOnlineServices']
            },
            'settingsSync.ignoredExtensions': {
                'type': 'array',
                markdownDescription: localize('settingsSync.ignoredExtensions', "List of extensions to be ignored while synchronizing. The identifier of an extension is always `${publisher}.${name}`. For example: `vscode.csharp`."),
                items: [{
                        type: 'string',
                        pattern: EXTENSION_IDENTIFIER_PATTERN,
                        errorMessage: localize('app.extension.identifier.errorMessage', "Expected format '${publisher}.${name}'. Example: 'vscode.csharp'.")
                    }],
                'default': [],
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                uniqueItems: true,
                disallowSyncIgnore: true,
                tags: ['sync', 'usesOnlineServices']
            },
            'settingsSync.ignoredSettings': {
                'type': 'array',
                description: localize('settingsSync.ignoredSettings', "Configure settings to be ignored while synchronizing."),
                'default': [],
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                $ref: ignoredSettingsSchemaId,
                additionalProperties: true,
                uniqueItems: true,
                disallowSyncIgnore: true,
                tags: ['sync', 'usesOnlineServices']
            }
        }
    });
    const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
    const registerIgnoredSettingsSchema = () => {
        const disallowedIgnoredSettings = getDisallowedIgnoredSettings();
        const defaultIgnoredSettings = getDefaultIgnoredSettings();
        const settings = Object.keys(allSettings.properties).filter(setting => !defaultIgnoredSettings.includes(setting));
        const ignoredSettings = defaultIgnoredSettings.filter(setting => !disallowedIgnoredSettings.includes(setting));
        const ignoredSettingsSchema = {
            items: {
                type: 'string',
                enum: [...settings, ...ignoredSettings.map(setting => `-${setting}`)]
            },
        };
        jsonRegistry.registerSchema(ignoredSettingsSchemaId, ignoredSettingsSchema);
    };
    return configurationRegistry.onDidUpdateConfiguration(() => registerIgnoredSettingsSchema());
}
// #region User Data Sync Store
export const NON_EXISTING_RESOURCE_REF = '0';
export function isAuthenticationProvider(thing) {
    return thing
        && isObject(thing)
        && isString(thing.id)
        && Array.isArray(thing.scopes);
}
export var SyncResource;
(function (SyncResource) {
    SyncResource["Settings"] = "settings";
    SyncResource["Keybindings"] = "keybindings";
    SyncResource["Snippets"] = "snippets";
    SyncResource["Prompts"] = "prompts";
    SyncResource["Tasks"] = "tasks";
    SyncResource["Mcp"] = "mcp";
    SyncResource["Extensions"] = "extensions";
    SyncResource["GlobalState"] = "globalState";
    SyncResource["Profiles"] = "profiles";
    SyncResource["WorkspaceState"] = "workspaceState";
})(SyncResource || (SyncResource = {}));
export const ALL_SYNC_RESOURCES = ["settings" /* SyncResource.Settings */, "keybindings" /* SyncResource.Keybindings */, "snippets" /* SyncResource.Snippets */, "prompts" /* SyncResource.Prompts */, "tasks" /* SyncResource.Tasks */, "extensions" /* SyncResource.Extensions */, "globalState" /* SyncResource.GlobalState */, "profiles" /* SyncResource.Profiles */, "mcp" /* SyncResource.Mcp */];
export function getPathSegments(collection, ...paths) {
    return collection ? [collection, ...paths] : paths;
}
export function getLastSyncResourceUri(collection, syncResource, environmentService, extUri) {
    return extUri.joinPath(environmentService.userDataSyncHome, ...getPathSegments(collection, syncResource, `lastSync${syncResource}.json`));
}
export function isUserDataManifest(thing) {
    return thing
        && isString(thing.session)
        && isString(thing.ref)
        && (isObject(thing.latest) || thing.latest === undefined)
        && (isObject(thing.collections) || thing.collections === undefined);
}
export const IUserDataSyncStoreManagementService = createDecorator('IUserDataSyncStoreManagementService');
export const IUserDataSyncStoreService = createDecorator('IUserDataSyncStoreService');
export const IUserDataSyncLocalStoreService = createDecorator('IUserDataSyncLocalStoreService');
//#endregion
// #region User Data Sync Headers
export const HEADER_OPERATION_ID = 'x-operation-id';
export const HEADER_EXECUTION_ID = 'X-Execution-Id';
export function createSyncHeaders(executionId) {
    const headers = {};
    headers[HEADER_EXECUTION_ID] = executionId;
    return headers;
}
//#endregion
// #region User Data Sync Error
export var UserDataSyncErrorCode;
(function (UserDataSyncErrorCode) {
    // Client Errors (>= 400 )
    UserDataSyncErrorCode["Unauthorized"] = "Unauthorized";
    UserDataSyncErrorCode["Forbidden"] = "Forbidden";
    UserDataSyncErrorCode["NotFound"] = "NotFound";
    UserDataSyncErrorCode["MethodNotFound"] = "MethodNotFound";
    UserDataSyncErrorCode["Conflict"] = "Conflict";
    UserDataSyncErrorCode["Gone"] = "Gone";
    UserDataSyncErrorCode["PreconditionFailed"] = "PreconditionFailed";
    UserDataSyncErrorCode["TooLarge"] = "TooLarge";
    UserDataSyncErrorCode["UpgradeRequired"] = "UpgradeRequired";
    UserDataSyncErrorCode["PreconditionRequired"] = "PreconditionRequired";
    UserDataSyncErrorCode["TooManyRequests"] = "RemoteTooManyRequests";
    UserDataSyncErrorCode["TooManyRequestsAndRetryAfter"] = "TooManyRequestsAndRetryAfter";
    // Local Errors
    UserDataSyncErrorCode["RequestFailed"] = "RequestFailed";
    UserDataSyncErrorCode["RequestCanceled"] = "RequestCanceled";
    UserDataSyncErrorCode["RequestTimeout"] = "RequestTimeout";
    UserDataSyncErrorCode["RequestProtocolNotSupported"] = "RequestProtocolNotSupported";
    UserDataSyncErrorCode["RequestPathNotEscaped"] = "RequestPathNotEscaped";
    UserDataSyncErrorCode["RequestHeadersNotObject"] = "RequestHeadersNotObject";
    UserDataSyncErrorCode["NoCollection"] = "NoCollection";
    UserDataSyncErrorCode["NoRef"] = "NoRef";
    UserDataSyncErrorCode["EmptyResponse"] = "EmptyResponse";
    UserDataSyncErrorCode["TurnedOff"] = "TurnedOff";
    UserDataSyncErrorCode["SessionExpired"] = "SessionExpired";
    UserDataSyncErrorCode["ServiceChanged"] = "ServiceChanged";
    UserDataSyncErrorCode["DefaultServiceChanged"] = "DefaultServiceChanged";
    UserDataSyncErrorCode["LocalTooManyProfiles"] = "LocalTooManyProfiles";
    UserDataSyncErrorCode["LocalTooManyRequests"] = "LocalTooManyRequests";
    UserDataSyncErrorCode["LocalPreconditionFailed"] = "LocalPreconditionFailed";
    UserDataSyncErrorCode["LocalInvalidContent"] = "LocalInvalidContent";
    UserDataSyncErrorCode["LocalError"] = "LocalError";
    UserDataSyncErrorCode["IncompatibleLocalContent"] = "IncompatibleLocalContent";
    UserDataSyncErrorCode["IncompatibleRemoteContent"] = "IncompatibleRemoteContent";
    UserDataSyncErrorCode["Unknown"] = "Unknown";
})(UserDataSyncErrorCode || (UserDataSyncErrorCode = {}));
export class UserDataSyncError extends Error {
    constructor(message, code, resource, operationId) {
        super(message);
        this.code = code;
        this.resource = resource;
        this.operationId = operationId;
        this.name = `${this.code} (UserDataSyncError) syncResource:${this.resource || 'unknown'} operationId:${this.operationId || 'unknown'}`;
    }
}
export class UserDataSyncStoreError extends UserDataSyncError {
    constructor(message, url, code, serverCode, operationId) {
        super(message, code, undefined, operationId);
        this.url = url;
        this.serverCode = serverCode;
    }
}
export class UserDataAutoSyncError extends UserDataSyncError {
    constructor(message, code) {
        super(message, code);
    }
}
(function (UserDataSyncError) {
    function toUserDataSyncError(error) {
        if (error instanceof UserDataSyncError) {
            return error;
        }
        const match = /^(.+) \(UserDataSyncError\) syncResource:(.+) operationId:(.+)$/.exec(error.name);
        if (match && match[1]) {
            const syncResource = match[2] === 'unknown' ? undefined : match[2];
            const operationId = match[3] === 'unknown' ? undefined : match[3];
            return new UserDataSyncError(error.message, match[1], syncResource, operationId);
        }
        return new UserDataSyncError(error.message, "Unknown" /* UserDataSyncErrorCode.Unknown */);
    }
    UserDataSyncError.toUserDataSyncError = toUserDataSyncError;
})(UserDataSyncError || (UserDataSyncError = {}));
export var SyncStatus;
(function (SyncStatus) {
    SyncStatus["Uninitialized"] = "uninitialized";
    SyncStatus["Idle"] = "idle";
    SyncStatus["Syncing"] = "syncing";
    SyncStatus["HasConflicts"] = "hasConflicts";
})(SyncStatus || (SyncStatus = {}));
export var Change;
(function (Change) {
    Change[Change["None"] = 0] = "None";
    Change[Change["Added"] = 1] = "Added";
    Change[Change["Modified"] = 2] = "Modified";
    Change[Change["Deleted"] = 3] = "Deleted";
})(Change || (Change = {}));
export var MergeState;
(function (MergeState) {
    MergeState["Preview"] = "preview";
    MergeState["Conflict"] = "conflict";
    MergeState["Accepted"] = "accepted";
})(MergeState || (MergeState = {}));
//#endregion
// #region keys synced only in web
export const SYNC_SERVICE_URL_TYPE = 'sync.store.url.type';
export function getEnablementKey(resource) { return `sync.enable.${resource}`; }
// #endregion
// #region User Data Sync Services
export const IUserDataSyncEnablementService = createDecorator('IUserDataSyncEnablementService');
export const IUserDataSyncService = createDecorator('IUserDataSyncService');
export const IUserDataSyncResourceProviderService = createDecorator('IUserDataSyncResourceProviderService');
export const IUserDataAutoSyncService = createDecorator('IUserDataAutoSyncService');
export const IUserDataSyncUtilService = createDecorator('IUserDataSyncUtilService');
export const IUserDataSyncLogService = createDecorator('IUserDataSyncLogService');
//#endregion
export const USER_DATA_SYNC_LOG_ID = 'userDataSync';
export const USER_DATA_SYNC_SCHEME = 'vscode-userdata-sync';
export const PREVIEW_DIR_NAME = 'preview';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBUTFELE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxXQUFXLEVBQXNCLFVBQVUsSUFBSSx1QkFBdUIsRUFBa0UsNkJBQTZCLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFeFAsT0FBTyxFQUFFLDRCQUE0QixFQUF3QixNQUFNLHlEQUF5RCxDQUFDO0FBRTdILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsVUFBVSxJQUFJLGNBQWMsRUFBNkIsTUFBTSxzREFBc0QsQ0FBQztBQUUvSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJN0QsTUFBTSxVQUFVLDRCQUE0QjtJQUMzQyxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQywwQkFBMEIsRUFBRSxDQUFDO0lBQzVILE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDOUYsQ0FBQztBQUVELE1BQU0sVUFBVSx5QkFBeUIsQ0FBQyxvQkFBNkIsS0FBSztJQUMzRSxN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