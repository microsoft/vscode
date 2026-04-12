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
import { localize } from '../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { Emitter } from '../../base/common/event.js';
import { IRemoteAgentService } from '../services/remote/common/remoteAgentService.js';
import { isWindows } from '../../base/common/platform.js';
import { equals } from '../../base/common/objects.js';
import { DeferredPromise } from '../../base/common/async.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
export const applicationConfigurationNodeBase = Object.freeze({
    'id': 'application',
    'order': 100,
    'title': localize('applicationConfigurationTitle', "Application"),
    'type': 'object'
});
export const workbenchConfigurationNodeBase = Object.freeze({
    'id': 'workbench',
    'order': 7,
    'title': localize('workbenchConfigurationTitle', "Workbench"),
    'type': 'object',
});
export const securityConfigurationNodeBase = Object.freeze({
    'id': 'security',
    'scope': 1 /* ConfigurationScope.APPLICATION */,
    'title': localize('securityConfigurationTitle', "Security"),
    'type': 'object',
    'order': 7
});
export const problemsConfigurationNodeBase = Object.freeze({
    'id': 'problems',
    'title': localize('problemsConfigurationTitle', "Problems"),
    'type': 'object',
    'order': 101
});
export const windowConfigurationNodeBase = Object.freeze({
    'id': 'window',
    'order': 8,
    'title': localize('windowConfigurationTitle', "Window"),
    'type': 'object',
});
export const Extensions = {
    ConfigurationMigration: 'base.contributions.configuration.migration'
};
class ConfigurationMigrationRegistry {
    constructor() {
        this.migrations = [];
        this._onDidRegisterConfigurationMigrations = new Emitter();
        this.onDidRegisterConfigurationMigration = this._onDidRegisterConfigurationMigrations.event;
    }
    registerConfigurationMigrations(configurationMigrations) {
        this.migrations.push(...configurationMigrations);
    }
}
const configurationMigrationRegistry = new ConfigurationMigrationRegistry();
Registry.add(Extensions.ConfigurationMigration, configurationMigrationRegistry);
let ConfigurationMigrationWorkbenchContribution = class ConfigurationMigrationWorkbenchContribution extends Disposable {
    static { this.ID = 'workbench.contrib.configurationMigration'; }
    constructor(configurationService, workspaceService) {
        super();
        this.configurationService = configurationService;
        this.workspaceService = workspaceService;
        this._register(this.workspaceService.onDidChangeWorkspaceFolders(async (e) => {
            for (const folder of e.added) {
                await this.migrateConfigurationsForFolder(folder, configurationMigrationRegistry.migrations);
            }
        }));
        this.migrateConfigurations(configurationMigrationRegistry.migrations);
        this._register(configurationMigrationRegistry.onDidRegisterConfigurationMigration(migration => this.migrateConfigurations(migration)));
    }
    async migrateConfigurations(migrations) {
        await this.migrateConfigurationsForFolder(undefined, migrations);
        for (const folder of this.workspaceService.getWorkspace().folders) {
            await this.migrateConfigurationsForFolder(folder, migrations);
        }
    }
    async migrateConfigurationsForFolder(folder, migrations) {
        await Promise.all([migrations.map(migration => this.migrateConfigurationsForFolderAndOverride(migration, folder?.uri))]);
    }
    async migrateConfigurationsForFolderAndOverride(migration, resource) {
        const inspectData = this.configurationService.inspect(migration.key, { resource });
        const targetPairs = this.workspaceService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ ? [
            ['user', 2 /* ConfigurationTarget.USER */],
            ['userLocal', 3 /* ConfigurationTarget.USER_LOCAL */],
            ['userRemote', 4 /* ConfigurationTarget.USER_REMOTE */],
            ['workspace', 5 /* ConfigurationTarget.WORKSPACE */],
            ['workspaceFolder', 6 /* ConfigurationTarget.WORKSPACE_FOLDER */],
        ] : [
            ['user', 2 /* ConfigurationTarget.USER */],
            ['userLocal', 3 /* ConfigurationTarget.USER_LOCAL */],
            ['userRemote', 4 /* ConfigurationTarget.USER_REMOTE */],
            ['workspace', 5 /* ConfigurationTarget.WORKSPACE */],
        ];
        for (const [dataKey, target] of targetPairs) {
            const inspectValue = inspectData[dataKey];
            if (!inspectValue) {
                continue;
            }
            const migrationValues = [];
            if (inspectValue.value !== undefined) {
                const keyValuePairs = await this.runMigration(migration, dataKey, inspectValue.value, resource, undefined);
                for (const keyValuePair of keyValuePairs ?? []) {
                    migrationValues.push([keyValuePair, []]);
                }
            }
            for (const { identifiers, value } of inspectValue.overrides ?? []) {
                if (value !== undefined) {
                    const keyValuePairs = await this.runMigration(migration, dataKey, value, resource, identifiers);
                    for (const keyValuePair of keyValuePairs ?? []) {
                        migrationValues.push([keyValuePair, identifiers]);
                    }
                }
            }
            if (migrationValues.length) {
                // apply migrations
                await Promise.allSettled(migrationValues.map(async ([[key, value], overrideIdentifiers]) => this.configurationService.updateValue(key, value.value, { resource, overrideIdentifiers }, target)));
            }
        }
    }
    async runMigration(migration, dataKey, value, resource, overrideIdentifiers) {
        const valueAccessor = (key) => {
            const inspectData = this.configurationService.inspect(key, { resource });
            const inspectValue = inspectData[dataKey];
            if (!inspectValue) {
                return undefined;
            }
            if (!overrideIdentifiers) {
                return inspectValue.value;
            }
            return inspectValue.overrides?.find(({ identifiers }) => equals(identifiers, overrideIdentifiers))?.value;
        };
        const result = await migration.migrateFn(value, valueAccessor);
        return Array.isArray(result) ? result : [[migration.key, result]];
    }
};
ConfigurationMigrationWorkbenchContribution = __decorate([
    __param(0, IConfigurationService),
    __param(1, IWorkspaceContextService)
], ConfigurationMigrationWorkbenchContribution);
export { ConfigurationMigrationWorkbenchContribution };
let DynamicWorkbenchSecurityConfiguration = class DynamicWorkbenchSecurityConfiguration extends Disposable {
    static { this.ID = 'workbench.contrib.dynamicWorkbenchSecurityConfiguration'; }
    constructor(remoteAgentService) {
        super();
        this.remoteAgentService = remoteAgentService;
        this._ready = new DeferredPromise();
        this.ready = this._ready.p;
        this.create();
    }
    async create() {
        try {
            await this.doCreate();
        }
        finally {
            this._ready.complete();
        }
    }
    async doCreate() {
        if (!isWindows) {
            const remoteEnvironment = await this.remoteAgentService.getEnvironment();
            if (remoteEnvironment?.os !== 1 /* OperatingSystem.Windows */) {
                return;
            }
        }
        // Windows: UNC allow list security configuration
        const registry = Registry.as(ConfigurationExtensions.Configuration);
        registry.registerConfiguration({
            ...securityConfigurationNodeBase,
            'properties': {
                'security.allowedUNCHosts': {
                    'type': 'array',
                    'items': {
                        'type': 'string',
                        'pattern': '^[^\\\\]+$',
                        'patternErrorMessage': localize('security.allowedUNCHosts.patternErrorMessage', 'UNC host names must not contain backslashes.')
                    },
                    'default': [],
                    'markdownDescription': localize('security.allowedUNCHosts', 'A set of UNC host names (without leading or trailing backslash, for example `192.168.0.1` or `my-server`) to allow without user confirmation. If a UNC host is being accessed that is not allowed via this setting or has not been acknowledged via user confirmation, an error will occur and the operation stopped. A restart is required when changing this setting. Find out more about this setting at https://aka.ms/vscode-windows-unc.'),
                    'scope': 3 /* ConfigurationScope.APPLICATION_MACHINE */
                },
                'security.restrictUNCAccess': {
                    'type': 'boolean',
                    'default': true,
                    'markdownDescription': localize('security.restrictUNCAccess', 'If enabled, only allows access to UNC host names that are allowed by the `#security.allowedUNCHosts#` setting or after user confirmation. Find out more about this setting at https://aka.ms/vscode-windows-unc.'),
                    'scope': 3 /* ConfigurationScope.APPLICATION_MACHINE */
                }
            }
        });
    }
};
DynamicWorkbenchSecurityConfiguration = __decorate([
    __param(0, IRemoteAgentService)
], DynamicWorkbenchSecurityConfiguration);
export { DynamicWorkbenchSecurityConfiguration };
export const CONFIG_NEW_WINDOW_PROFILE = 'window.newWindowProfile';
let DynamicWindowConfiguration = class DynamicWindowConfiguration extends Disposable {
    static { this.ID = 'workbench.contrib.dynamicWindowConfiguration'; }
    constructor(userDataProfilesService, configurationService) {
        super();
        this.userDataProfilesService = userDataProfilesService;
        this.configurationService = configurationService;
        this.registerNewWindowProfileConfiguration();
        this._register(this.userDataProfilesService.onDidChangeProfiles((e) => this.registerNewWindowProfileConfiguration()));
        this.setNewWindowProfile();
        this.checkAndResetNewWindowProfileConfig();
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.source !== 7 /* ConfigurationTarget.DEFAULT */ && e.affectsConfiguration(CONFIG_NEW_WINDOW_PROFILE)) {
                this.setNewWindowProfile();
            }
        }));
        this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.checkAndResetNewWindowProfileConfig()));
    }
    registerNewWindowProfileConfiguration() {
        const registry = Registry.as(ConfigurationExtensions.Configuration);
        const configurationNode = {
            ...windowConfigurationNodeBase,
            'properties': {
                [CONFIG_NEW_WINDOW_PROFILE]: {
                    'type': ['string', 'null'],
                    'default': null,
                    'enum': [...this.userDataProfilesService.profiles.map(profile => profile.name), null],
                    'enumItemLabels': [...this.userDataProfilesService.profiles.map(() => ''), localize('active window', "Active Window")],
                    'description': localize('newWindowProfile', "Specifies the profile to use when opening a new window. If a profile name is provided, the new window will use that profile. If no profile name is provided, the new window will use the profile of the active window or the Default profile if no active window exists."),
                    'scope': 1 /* ConfigurationScope.APPLICATION */,
                }
            }
        };
        if (this.configurationNode) {
            registry.updateConfigurations({ add: [configurationNode], remove: [this.configurationNode] });
        }
        else {
            registry.registerConfiguration(configurationNode);
        }
        this.configurationNode = configurationNode;
    }
    setNewWindowProfile() {
        const newWindowProfileName = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE);
        this.newWindowProfile = newWindowProfileName ? this.userDataProfilesService.profiles.find(profile => profile.name === newWindowProfileName) : undefined;
    }
    checkAndResetNewWindowProfileConfig() {
        const newWindowProfileName = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE);
        if (!newWindowProfileName) {
            return;
        }
        const profile = this.newWindowProfile ? this.userDataProfilesService.profiles.find(profile => profile.id === this.newWindowProfile.id) : undefined;
        if (newWindowProfileName === profile?.name) {
            return;
        }
        this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, profile?.name);
    }
};
DynamicWindowConfiguration = __decorate([
    __param(0, IUserDataProfilesService),
    __param(1, IConfigurationService)
], DynamicWindowConfiguration);
export { DynamicWindowConfiguration };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb21tb24vY29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3hDLE9BQU8sRUFBa0UsVUFBVSxJQUFJLHVCQUF1QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDckwsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXRFLE9BQU8sRUFBRSx3QkFBd0IsRUFBb0MsTUFBTSw4Q0FBOEMsQ0FBQztBQUMxSCxPQUFPLEVBQXVCLHFCQUFxQixFQUFzQyxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RKLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDckQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdEYsT0FBTyxFQUFtQixTQUFTLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUzRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzdELE9BQU8sRUFBb0Isd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUV0SCxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFxQjtJQUNqRixJQUFJLEVBQUUsYUFBYTtJQUNuQixPQUFPLEVBQUUsR0FBRztJQUNaLE9BQU8sRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsYUFBYSxDQUFDO0lBQ2pFLE1BQU0sRUFBRSxRQUFRO0NBQ2hC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