/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorSettingMigration } from 'vs/editor/browser/config/migrateOptions';
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
		await Promise.all(EditorSettingMigration.items.map(migration => this._migrateEditorSettingForFolderAndOverride(migration, folder, undefined)));
	}

	private async _migrateEditorSettingForFolderAndOverride(migration: EditorSettingMigration, folder: IWorkspaceFolder | undefined, overrideIdentifier: string | undefined): Promise<void> {
		const data = this._configurationService.inspect(`editor.${migration.key}`, { resource: folder?.uri, overrideIdentifier });

		if (typeof data.userValue !== 'undefined') {
			await this._migrateEditorSettingForFolderOverrideAndTarget(data.userValue, migration, folder, overrideIdentifier, ConfigurationTarget.USER);
		}
		if (typeof data.userLocalValue !== 'undefined') {
			await this._migrateEditorSettingForFolderOverrideAndTarget(data.userLocalValue, migration, folder, overrideIdentifier, ConfigurationTarget.USER_LOCAL);
		}
		if (typeof data.userRemoteValue !== 'undefined') {
			await this._migrateEditorSettingForFolderOverrideAndTarget(data.userRemoteValue, migration, folder, overrideIdentifier, ConfigurationTarget.USER_REMOTE);
		}
		if (typeof data.workspaceFolderValue !== 'undefined') {
			await this._migrateEditorSettingForFolderOverrideAndTarget(data.workspaceFolderValue, migration, folder, overrideIdentifier, ConfigurationTarget.WORKSPACE_FOLDER);
		}
		if (typeof data.workspaceValue !== 'undefined') {
			await this._migrateEditorSettingForFolderOverrideAndTarget(data.workspaceValue, migration, folder, overrideIdentifier, ConfigurationTarget.WORKSPACE);
		}

		if (typeof overrideIdentifier === 'undefined' && typeof data.overrideIdentifiers !== 'undefined') {
			for (const overrideIdentifier of data.overrideIdentifiers) {
				await this._migrateEditorSettingForFolderAndOverride(migration, folder, overrideIdentifier);
			}
		}
	}

	private async _migrateEditorSettingForFolderOverrideAndTarget(value: any, migration: EditorSettingMigration, folder: IWorkspaceFolder | undefined, overrideIdentifier: string | undefined, target: ConfigurationTarget): Promise<void> {
		const writeCalls: [string, any][] = [];
		migration.migrate(value, (key: string, value: any) => writeCalls.push([key, value]));
		for (const [wKey, wValue] of writeCalls) {
			await this._configurationService.updateValue(`editor.${wKey}`, wValue, { resource: folder?.uri, overrideIdentifier }, target);
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorSettingsMigration, LifecyclePhase.Eventually);
