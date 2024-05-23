/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ConfigurationScope, IConfigurationNode, IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationService, IConfigurationValue, IInspectValue } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { OperatingSystem, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { equals } from 'vs/base/common/objects';
import { DeferredPromise } from 'vs/base/common/async';

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

	static readonly ID = 'workbench.contrib.configurationMigration';

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
			const inspectValue = inspectData[dataKey] as IInspectValue<any> | undefined;
			if (!inspectValue) {
				continue;
			}

			const migrationValues: [[string, ConfigurationValue], string[]][] = [];

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
				await Promise.allSettled(migrationValues.map(async ([[key, value], overrideIdentifiers]) =>
					this.configurationService.updateValue(key, value.value, { resource, overrideIdentifiers }, target)));
			}
		}
	}

	private async runMigration(migration: ConfigurationMigration, dataKey: keyof IConfigurationValue<any>, value: any, resource: URI | undefined, overrideIdentifiers: string[] | undefined): Promise<ConfigurationKeyValuePairs | undefined> {
		const valueAccessor = (key: string) => {
			const inspectData = this.configurationService.inspect(key, { resource });
			const inspectValue = inspectData[dataKey] as IInspectValue<any> | undefined;
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
}

export class DynamicWorkbenchSecurityConfiguration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.dynamicWorkbenchSecurityConfiguration';

	private readonly _ready = new DeferredPromise<void>();
	readonly ready = this._ready.p;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService
	) {
		super();

		this.create();
	}

	private async create(): Promise<void> {
		try {
			await this.doCreate();
		} finally {
			this._ready.complete();
		}
	}

	private async doCreate(): Promise<void> {
		if (!isWindows) {
			const remoteEnvironment = await this.remoteAgentService.getEnvironment();
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
	}
}
