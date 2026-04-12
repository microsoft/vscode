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
import { distinct } from '../../../base/common/arrays.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IIgnoredExtensionsManagementService = createDecorator('IIgnoredExtensionsManagementService');
let IgnoredExtensionsManagementService = class IgnoredExtensionsManagementService {
    constructor(configurationService) {
        this.configurationService = configurationService;
    }
    hasToNeverSyncExtension(extensionId) {
        const configuredIgnoredExtensions = this.getConfiguredIgnoredExtensions();
        return configuredIgnoredExtensions.includes(extensionId.toLowerCase());
    }
    hasToAlwaysSyncExtension(extensionId) {
        const configuredIgnoredExtensions = this.getConfiguredIgnoredExtensions();
        return configuredIgnoredExtensions.includes(`-${extensionId.toLowerCase()}`);
    }
    updateIgnoredExtensions(ignoredExtensionId, ignore) {
        // first remove the extension completely from ignored extensions
        let currentValue = [...this.configurationService.getValue('settingsSync.ignoredExtensions')].map(id => id.toLowerCase());
        currentValue = currentValue.filter(v => v !== ignoredExtensionId && v !== `-${ignoredExtensionId}`);
        // Add only if ignored
        if (ignore) {
            currentValue.push(ignoredExtensionId.toLowerCase());
        }
        return this.configurationService.updateValue('settingsSync.ignoredExtensions', currentValue.length ? currentValue : undefined, 2 /* ConfigurationTarget.USER */);
    }
    updateSynchronizedExtensions(extensionId, sync) {
        // first remove the extension completely from ignored extensions
        let currentValue = [...this.configurationService.getValue('settingsSync.ignoredExtensions')].map(id => id.toLowerCase());
        currentValue = currentValue.filter(v => v !== extensionId && v !== `-${extensionId}`);
        // Add only if synced
        if (sync) {
            currentValue.push(`-${extensionId.toLowerCase()}`);
        }
        return this.configurationService.updateValue('settingsSync.ignoredExtensions', currentValue.length ? currentValue : undefined, 2 /* ConfigurationTarget.USER */);
    }
    getIgnoredExtensions(installed) {
        const defaultIgnoredExtensions = installed.filter(i => i.isMachineScoped).map(i => i.identifier.id.toLowerCase());
        const value = this.getConfiguredIgnoredExtensions().map(id => id.toLowerCase());
        const added = [], removed = [];
        if (Array.isArray(value)) {
            for (const key of value) {
                if (key.startsWith('-')) {
                    removed.push(key.substring(1));
                }
                else {
                    added.push(key);
                }
            }
        }
        return distinct([...defaultIgnoredExtensions, ...added,].filter(setting => !removed.includes(setting)));
    }
    getConfiguredIgnoredExtensions() {
        return (this.configurationService.getValue('settingsSync.ignoredExtensions') || []).map(id => id.toLowerCase());
    }
};
IgnoredExtensionsManagementService = __decorate([
    __param(0, IConfigurationService)
], IgnoredExtensionsManagementService);
export { IgnoredExtensionsManagementService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWdub3JlZEV4dGVuc2lvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL2lnbm9yZWRFeHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFekcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLGVBQWUsQ0FBc0MscUNBQXFDLENBQUMsQ0FBQztBQVl4SSxJQUFNLGtDQUFrQyxHQUF4QyxNQUFNLGtDQUFrQztJQUk5QyxZQUN5QyxvQkFBMkM7UUFBM0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtJQUVwRixDQUFDO0lBRUQsdUJBQXVCLENBQUMsV0FBbUI7UUFDMUMsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLENBQUMsOEJBQThCLEVBQUUsQ0FBQztRQUMxRSxPQUFPLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsd0JBQXdCLENBQUMsV0FBbUI7UUFDM0MsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLENBQUMsOEJBQThCLEVBQUUsQ0FBQztRQUMxRSxPQUFPLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVELHVCQUF1QixDQUFDLGtCQUEwQixFQUFFLE1BQWU7UUFDbEUsZ0VBQWdFO1FBQ2hFLElBQUksWUFBWSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsb0JBQW9C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