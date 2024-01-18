/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ConfigurationScope, IConfigurationNode, IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationValue } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { OperatingSystem, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { equals } from 'vs/base/common/objects';

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

export const problemsConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	'id': 'problems',
	'title': localize('problemsConfigurationTitle', "Problems"),
	'type': 'object',
	'order': 101
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
		await Promise.all([migrations.map(migration => this.migrateConfigurationsForFolderAndOverride(migration, folder?.uri))]);
	}

	private async migrateConfigurationsForFolderAndOverride(migration: ConfigurationMigration, resource?: URI): Promise<void> {
		const inspectData = this.configurationService.inspect(migration.key, { resource });

		const targetPairs: [keyof IConfigurationValue<any>, ConfigurationTarget][] = this.workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE ? [
			['user', ConfigurationTarget.USER],
			['userLocal', ConfigurationTarget.USER_LOCAL],
			['userRemote', ConfigurationTarget.USER_REMOTE],
			['workspace', ConfigurationTarget.WORKSPACE],
			['workspaceFolder', ConfigurationTarget.WORKSPACE_FOLDER],
		] : [
			['user', ConfigurationTarget.USER],
			['userLocal', ConfigurationTarget.USER_LOCAL],
			['userRemote', ConfigurationTarget.USER_REMOTE],
			['workspace', ConfigurationTarget.WORKSPACE],
		];
		for (const [dataKey, target] of targetPairs) {
			const migrationValues: [[string, ConfigurationValue], string[]][] = [];

			// Collect migrations for language overrides
			for (const overrideIdentifier of inspectData.overrideIdentifiers ?? []) {
				const keyValuePairs = await this.runMigration(migration, { resource, overrideIdentifier }, dataKey);
				for (const keyValuePair of keyValuePairs ?? []) {
					let keyValueAndOverridesPair = migrationValues.find(([[k, v]]) => k === keyValuePair[0] && equals(v.value, keyValuePair[1].value));
					if (!keyValueAndOverridesPair) {
						migrationValues.push(keyValueAndOverridesPair = [keyValuePair, []]);
					}
					keyValueAndOverridesPair[1].push(overrideIdentifier);
				}
			}

			// Collect migrations
			const keyValuePairs = await this.runMigration(migration, { resource }, dataKey, inspectData);
			for (const keyValuePair of keyValuePairs ?? []) {
				migrationValues.push([keyValuePair, []]);
			}

			if (migrationValues.length) {
				// apply migrations
				await Promise.allSettled(migrationValues.map(async ([[key, value], overrideIdentifiers]) =>
					this.configurationService.updateValue(key, value.value, { resource, overrideIdentifiers }, target)));
			}
		}
	}

	private async runMigration(migration: ConfigurationMigration, overrides: IConfigurationOverrides, dataKey: keyof IConfigurationValue<any>, data?: IConfigurationValue<any>): Promise<ConfigurationKeyValuePairs | undefined> {
		const valueAccessor = (key: string) => getInspectValue(this.configurationService.inspect(key, overrides));
		const getInspectValue = (data: IConfigurationValue<any>) => {
			const inspectValue: { value?: any; override?: any } | undefined = data[dataKey];
			return overrides.overrideIdentifier ? inspectValue?.override : inspectValue?.value;
		};
		const value = data ? getInspectValue(data) : valueAccessor(migration.key);
		if (value === undefined) {
			return undefined;
		}
		const result = await migration.migrateFn(value, valueAccessor);
		return Array.isArray(result) ? result : [[migration.key, result]];
	}
}

export class DynamicWorkbenchConfigurationWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		super();

		(async () => {
			if (!isWindows) {
				const remoteEnvironment = await remoteAgentService.getEnvironment();
				if (remoteEnvironment?.os !== OperatingSystem.Windows) {
					return;
				}
			}

			// Windows: UNC allow list security configuration
			const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
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
						'scope': ConfigurationScope.MACHINE
					},
					'security.restrictUNCAccess': {
						'type': 'boolean',
						'default': true,
						'markdownDescription': localize('security.restrictUNCAccess', 'If enabled, only allows access to UNC host names that are allowed by the `#security.allowedUNCHosts#` setting or after user confirmation. Find out more about this setting at https://aka.ms/vscode-windows-unc.'),
						'scope': ConfigurationScope.MACHINE
					}
				}
			});
		})();
	}
}
