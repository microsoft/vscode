/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationValue } from 'vs/platform/configuration/common/configuration';
import { EditorSettingMigration, ISettingsReader, ISettingsWriter } from 'vs/editor/browser/config/migrateOptions';
import { Disposable } from 'vs/base/common/lifecycle';

class EditorSettingsMigration extends Disposable implements IWorkbenchContribution {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
	) {
		super();
		this._register(this._workspaceService.onDidChangeWorkspaceFolders(async (e) => {
			for (const folder of e.added) {
				await this._migrateEditorSettingsForFolder(folder);
			}
		}));
		this._migrateEditorSettings();
	}

	private async _migrateEditorSettings(): Promise<void> {
		await this._migrateEditorSettingsForFolder(undefined);
		for (const folder of this._workspaceService.getWorkspace().folders) {
			await this._migrateEditorSettingsForFolder(folder);
		}
	}

	private async _migrateEditorSettingsForFolder(folder: IWorkspaceFolder | undefined): Promise<void> {
		await Promise.all(EditorSettingMigration.items.map(migration => this._migrateEditorSettingForFolderAndOverride(migration, { resource: folder?.uri })));
	}

	private async _migrateEditorSettingForFolderAndOverride(migration: EditorSettingMigration, overrides: IConfigurationOverrides): Promise<void> {
		const data = this._configurationService.inspect(`editor.${migration.key}`, overrides);

		await this._migrateEditorSettingForFolderOverrideAndTarget(migration, overrides, data, 'userValue', ConfigurationTarget.USER);
		await this._migrateEditorSettingForFolderOverrideAndTarget(migration, overrides, data, 'userLocalValue', ConfigurationTarget.USER_LOCAL);
		await this._migrateEditorSettingForFolderOverrideAndTarget(migration, overrides, data, 'userRemoteValue', ConfigurationTarget.USER_REMOTE);
		await this._migrateEditorSettingForFolderOverrideAndTarget(migration, overrides, data, 'workspaceFolderValue', ConfigurationTarget.WORKSPACE_FOLDER);
		await this._migrateEditorSettingForFolderOverrideAndTarget(migration, overrides, data, 'workspaceValue', ConfigurationTarget.WORKSPACE);

		if (typeof overrides.overrideIdentifier === 'undefined' && typeof data.overrideIdentifiers !== 'undefined') {
			for (const overrideIdentifier of data.overrideIdentifiers) {
				await this._migrateEditorSettingForFolderAndOverride(migration, { resource: overrides.resource, overrideIdentifier });
			}
		}
	}

	private async _migrateEditorSettingForFolderOverrideAndTarget(migration: EditorSettingMigration, overrides: IConfigurationOverrides, data: IConfigurationValue<any>, dataKey: keyof IConfigurationValue<any>, target: ConfigurationTarget): Promise<void> {
		const value = data[dataKey];
		if (typeof value === 'undefined') {
			return;
		}

		const writeCalls: [string, any][] = [];
		const read: ISettingsReader = (key: string) => this._configurationService.inspect(`editor.${key}`, overrides)[dataKey];
		const write: ISettingsWriter = (key: string, value: any) => writeCalls.push([key, value]);
		migration.migrate(value, read, write);
		for (const [wKey, wValue] of writeCalls) {
			await this._configurationService.updateValue(`editor.${wKey}`, wValue, overrides, target);
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorSettingsMigration, LifecyclePhase.Eventually);
