/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ConfigurationScope, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationValue } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';

export const applicationConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	'id': 'application',
	'order': 100,
	'title': localize('applicationConfigurationTitle', "Application"),
	'type': 'object'
});

export const workbenchConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	'id': 'workbench',
	'order': 7,
	'title': localize('workbenchConfigurationTitle', "Workbench"),
	'type': 'object',
});

export const securityConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	'id': 'security',
	'scope': ConfigurationScope.APPLICATION,
	'title': localize('securityConfigurationTitle', "Security"),
	'type': 'object',
	'order': 7
});

export const Extensions = {
	ConfigurationMigration: 'base.contributions.configuration.migration'
};

export type ConfigurationValue = { value: any | undefined /* Remove */ };
export type ConfigurationKeyValuePairs = [string, ConfigurationValue][];
export type ConfigurationMigrationFn = (value: any, valueAccessor: (key: string) => any) => ConfigurationValue | ConfigurationKeyValuePairs | Promise<ConfigurationValue | ConfigurationKeyValuePairs>;
export type ConfigurationMigration = { key: string; migrateFn: ConfigurationMigrationFn };

export interface IConfigurationMigrationRegistry {
	registerConfigurationMigrations(configurationMigrations: ConfigurationMigration[]): void;
}

class ConfigurationMigrationRegistry implements IConfigurationMigrationRegistry {

	readonly migrations: ConfigurationMigration[] = [];

	private readonly _onDidRegisterConfigurationMigrations = new Emitter<ConfigurationMigration[]>();
	readonly onDidRegisterConfigurationMigration = this._onDidRegisterConfigurationMigrations.event;

	registerConfigurationMigrations(configurationMigrations: ConfigurationMigration[]): void {
		this.migrations.push(...configurationMigrations);
	}

}

const configurationMigrationRegistry = new ConfigurationMigrationRegistry();
Registry.add(Extensions.ConfigurationMigration, configurationMigrationRegistry);

export class ConfigurationMigrationWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(async (e) => {
			for (const folder of e.added) {
				await this.migrateConfigurationsForFolder(folder, configurationMigrationRegistry.migrations);
			}
		}));
		this.migrateConfigurations(configurationMigrationRegistry.migrations);
		this._register(configurationMigrationRegistry.onDidRegisterConfigurationMigration(migration => this.migrateConfigurations(migration)));
	}

	private async migrateConfigurations(migrations: ConfigurationMigration[]): Promise<void> {
		await this.migrateConfigurationsForFolder(undefined, migrations);
		for (const folder of this.workspaceService.getWorkspace().folders) {
			await this.migrateConfigurationsForFolder(folder, migrations);
		}
	}

	private async migrateConfigurationsForFolder(folder: IWorkspaceFolder | undefined, migrations: ConfigurationMigration[]): Promise<void> {
		await Promise.all(migrations.map(migration => this.migrateConfigurationsForFolderAndOverride(migration, { resource: folder?.uri })));
	}

	private async migrateConfigurationsForFolderAndOverride(migration: ConfigurationMigration, overrides: IConfigurationOverrides): Promise<void> {
		const data = this.configurationService.inspect(migration.key, overrides);

		await this.migrateConfigurationForFolderOverrideAndTarget(migration, overrides, data, 'userValue', ConfigurationTarget.USER);
		await this.migrateConfigurationForFolderOverrideAndTarget(migration, overrides, data, 'userLocalValue', ConfigurationTarget.USER_LOCAL);
		await this.migrateConfigurationForFolderOverrideAndTarget(migration, overrides, data, 'userRemoteValue', ConfigurationTarget.USER_REMOTE);
		await this.migrateConfigurationForFolderOverrideAndTarget(migration, overrides, data, 'workspaceFolderValue', ConfigurationTarget.WORKSPACE_FOLDER);
		await this.migrateConfigurationForFolderOverrideAndTarget(migration, overrides, data, 'workspaceValue', ConfigurationTarget.WORKSPACE);

		if (typeof overrides.overrideIdentifier === 'undefined' && typeof data.overrideIdentifiers !== 'undefined') {
			for (const overrideIdentifier of data.overrideIdentifiers) {
				await this.migrateConfigurationsForFolderAndOverride(migration, { resource: overrides.resource, overrideIdentifier });
			}
		}
	}

	private async migrateConfigurationForFolderOverrideAndTarget(migration: ConfigurationMigration, overrides: IConfigurationOverrides, data: IConfigurationValue<any>, dataKey: keyof IConfigurationValue<any>, target: ConfigurationTarget): Promise<void> {
		const value = data[dataKey];
		if (typeof value === 'undefined') {
			return;
		}

		const valueAccessor = (key: string) => this.configurationService.inspect(key, overrides)[dataKey];
		const result = await migration.migrateFn(value, valueAccessor);
		const keyValuePairs: ConfigurationKeyValuePairs = Array.isArray(result) ? result : [[migration.key, result]];
		await Promise.allSettled(keyValuePairs.map(async ([key, value]) => this.configurationService.updateValue(key, value.value, overrides, target)));
	}
}
