/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Heavily lifted from https://github.com/microsoft/vscode/tree/main/src/vs/workbench/common/configuration.ts
 * It is a little simplified and does not handle overrides, but currently we are only migrating experimental configurations
 */


import { ConfigurationTarget, l10n, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { ConfigurationKeyValuePairs, ConfigurationMigration, ConfigurationMigrationRegistry, ConfigurationValue } from '../../../platform/configuration/common/configurationService';
import { NextCursorLinePrediction } from '../../../platform/inlineEdits/common/dataTypes/nextCursorLinePrediction';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';


interface IConfigurationNode {
	id: string;
	title: string;
	type: string;
	order?: number;

}

export const applicationConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	'id': 'application',
	'order': 100,
	'title': l10n.t("Application"),
	'type': 'object'
});

export const Extensions = {
	ConfigurationMigration: 'base.contributions.configuration.migration'
};

export class ConfigurationMigrationContribution implements IExtensionContribution {
	private readonly _disposables = new DisposableStore();

	constructor() {
		this._register(workspace.onDidChangeWorkspaceFolders(async (e) => {
			for (const folder of e.added) {
				await this.migrateConfigurationForFolder(folder, ConfigurationMigrationRegistry.migrations);
			}
		}));
		this.migrateConfigurations(ConfigurationMigrationRegistry.migrations);
		this._register(ConfigurationMigrationRegistry.onDidRegisterConfigurationMigration(migration => this.migrateConfigurations(migration)));
	}

	private async migrateConfigurations(migrations: ConfigurationMigration[]): Promise<void> {
		if (window.state.focused) {
			await this.migrateConfigurationForFolder(undefined, migrations);
			for (const folder of workspace.workspaceFolders ?? []) {
				await this.migrateConfigurationForFolder(folder, migrations);
			}
		}
	}

	private async migrateConfigurationForFolder(folder: WorkspaceFolder | undefined, migrations: ConfigurationMigration[]): Promise<void> {
		await Promise.all([migrations.map(migration => this.migrateConfigurationsForFolder(migration, folder?.uri))]);
	}

	private async migrateConfigurationsForFolder(migration: ConfigurationMigration, resource?: Uri): Promise<void> {

		const configuration = workspace.getConfiguration(undefined, resource);
		const inspectData = configuration.inspect(migration.key);

		if (!inspectData) {
			return;
		}

		const targetPairs: [unknown, ConfigurationTarget][] = [
			[inspectData.globalValue, ConfigurationTarget.Global],
			[inspectData.workspaceValue, ConfigurationTarget.Workspace],
		];

		for (const [inspectValue, target] of targetPairs) {
			if (!inspectValue) {
				continue;
			}

			const migrationValues: [string, ConfigurationValue][] = [];

			if (inspectValue !== undefined) {
				const keyValuePairs = await this.runMigration(migration, inspectValue);
				for (const keyValuePair of keyValuePairs ?? []) {
					migrationValues.push(keyValuePair);
				}
			}

			if (migrationValues.length) {
				// apply migrations
				await Promise.allSettled(migrationValues.map(async ([key, value]) => {
					configuration.update(key, value.value, target);
				}));
			}
		}
	}

	private async runMigration(migration: ConfigurationMigration, value: any): Promise<ConfigurationKeyValuePairs | undefined> {
		const result = await migration.migrateFn(value);
		return Array.isArray(result) ? result : [[migration.key, result]];
	}

	private _register(disposable: IDisposable): void {
		this._disposables.add(disposable);
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

ConfigurationMigrationRegistry.registerConfigurationMigrations([{
	key: 'github.copilot.chat.experimental.setupTests.enabled',
	migrateFn: async (value: any) => {
		return [
			['github.copilot.chat.setupTests.enabled', { value }],
			['github.copilot.chat.experimental.setupTests.enabled', { value: undefined }]
		];
	}
}]);

ConfigurationMigrationRegistry.registerConfigurationMigrations([{
	key: 'github.copilot.chat.experimental.codeGeneration.instructions',
	migrateFn: async (value: any) => {
		return [
			['github.copilot.chat.codeGeneration.instructions', { value }],
			['github.copilot.chat.experimental.codeGeneration.instructions', { value: undefined }]
		];
	}
}]);

ConfigurationMigrationRegistry.registerConfigurationMigrations([{
	key: 'github.copilot.chat.experimental.codeGeneration.useInstructionFiles',
	migrateFn: async (value: any) => {
		return [
			['github.copilot.chat.codeGeneration.useInstructionFiles', { value }],
			['github.copilot.chat.experimental.codeGeneration.useInstructionFiles', { value: undefined }]
		];
	}
}]);

ConfigurationMigrationRegistry.registerConfigurationMigrations([{
	key: 'github.copilot.chat.experimental.testGeneration.instructions',
	migrateFn: async (value: any) => {
		return [
			['github.copilot.chat.testGeneration.instructions', { value }],
			['github.copilot.chat.experimental.testGeneration.instructions', { value: undefined }]
		];
	}
}]);

ConfigurationMigrationRegistry.registerConfigurationMigrations([{
	key: 'github.copilot.chat.planAgent.model',
	migrateFn: async (value: any) => {
		return [
			['chat.planAgent.defaultModel', { value }],
			['github.copilot.chat.planAgent.model', { value: undefined }]
		];
	}
}]);

const oldCursorJumpKey = 'github.copilot.chat.advanced.inlineEdits.nextCursorPrediction.enabled';
const newCursorJumpKey = 'github.copilot.nextEditSuggestions.extendedRange';
ConfigurationMigrationRegistry.registerConfigurationMigrations([{
	key: oldCursorJumpKey,
	migrateFn: async (value: boolean |  /* the rest is for backward compat: */ NextCursorLinePrediction | 'labelOnlyWithEdit' | boolean | undefined) => {
		if (typeof value === 'string') { // for backward compatibility -- one of 'onlyWithEdit' | 'jump' | 'labelOnlyWithEdit'
			value = true;
		} else if (value === undefined) {
			value = false;
		}
		return [
			[newCursorJumpKey, { value }],
			[oldCursorJumpKey, { value: undefined }]
		];
	}
}]);
