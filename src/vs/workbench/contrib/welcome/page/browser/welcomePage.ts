/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import * as arrays from 'vs/base/common/arrays';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { ILifecycleService, StartupKind } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { joinPath } from 'vs/base/common/resources';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { GettingStartedInput, gettingStartedInputTypeId } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedInput';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { getTelemetryLevel } from 'vs/platform/telemetry/common/telemetryUtils';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IProductService } from 'vs/platform/product/common/productService';

const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryOptOutStorageKey = 'workbench.telemetryOptOutShown';

export class WelcomePageContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IStorageService private readonly storageService: IStorageService
	) {
		this.run().then(undefined, onUnexpectedError);
	}

	private async run() {

		// Always open Welcome page for first-launch, no matter what is open or which startupEditor is set.
		if (
			this.productService.enableTelemetry
			&& this.productService.showTelemetryOptOut
			&& getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE
			&& !this.environmentService.skipWelcome
			&& !this.storageService.get(telemetryOptOutStorageKey, StorageScope.GLOBAL)
		) {
			this.storageService.store(telemetryOptOutStorageKey, true, StorageScope.GLOBAL, StorageTarget.USER);
			await this.openWelcome(true);
			return;
		}

		const enabled = isWelcomePageEnabled(this.configurationService, this.contextService, this.environmentService);
		if (enabled && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			const hasBackups = await this.workingCopyBackupService.hasBackups();
			if (hasBackups) { return; }

			// Open the welcome even if we opened a set of default editors
			if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
				const startupEditorSetting = this.configurationService.inspect<string>(configurationKey);

				// 'readme' should not be set in workspace settings to prevent tracking,
				// but it can be set as a default (as in codespaces) or a user setting
				const openWithReadme = startupEditorSetting.value === 'readme' &&
					(startupEditorSetting.userValue === 'readme' || startupEditorSetting.defaultValue === 'readme');

				if (openWithReadme) {
					await this.openReadme();
				} else {
					await this.openWelcome();
				}
			}
		}
	}

	private async openReadme() {
		const readmes = arrays.coalesce(
			await Promise.all(this.contextService.getWorkspace().folders.map(
				async folder => {
					const folderUri = folder.uri;
					const folderStat = await this.fileService.resolve(folderUri).catch(onUnexpectedError);
					const files = folderStat?.children ? folderStat.children.map(child => child.name).sort() : [];
					const file = files.find(file => file.toLowerCase() === 'readme.md') || files.find(file => file.toLowerCase().startsWith('readme'));
					if (file) { return joinPath(folderUri, file); }
					else { return undefined; }
				})));

		if (!this.editorService.activeEditor) {
			if (readmes.length) {
				const isMarkDown = (readme: URI) => readme.path.toLowerCase().endsWith('.md');
				await Promise.all([
					this.commandService.executeCommand('markdown.showPreview', null, readmes.filter(isMarkDown), { locked: true }),
					this.editorService.openEditors(readmes.filter(readme => !isMarkDown(readme)).map(readme => ({ resource: readme }))),
				]);
			} else {
				await this.openWelcome();
			}
		}
	}

	private async openWelcome(showTelemetryNotice?: boolean) {
		const startupEditorTypeID = gettingStartedInputTypeId;
		const editor = this.editorService.activeEditor;

		// Ensure that the welcome editor won't get opened more than once
		if (editor?.typeId === startupEditorTypeID || this.editorService.editors.some(e => e.typeId === startupEditorTypeID)) {
			return;
		}

		const options: IEditorOptions = editor ? { pinned: false, index: 0 } : { pinned: false };
		if (startupEditorTypeID === gettingStartedInputTypeId) {
			this.editorService.openEditor(this.instantiationService.createInstance(GettingStartedInput, { showTelemetryNotice }), options);
		}
	}
}

function isWelcomePageEnabled(configurationService: IConfigurationService, contextService: IWorkspaceContextService, environmentService: IWorkbenchEnvironmentService) {
	if (environmentService.skipWelcome) {
		return false;
	}

	const startupEditor = configurationService.inspect<string>(configurationKey);
	if (!startupEditor.userValue && !startupEditor.workspaceValue) {
		const welcomeEnabled = configurationService.inspect(oldConfigurationKey);
		if (welcomeEnabled.value !== undefined && welcomeEnabled.value !== null) {
			return welcomeEnabled.value;
		}
	}

	if (startupEditor.value === 'readme' && startupEditor.userValue !== 'readme' && startupEditor.defaultValue !== 'readme') {
		console.error(`Warning: 'workbench.startupEditor: readme' setting ignored due to being set somewhere other than user or default settings (user=${startupEditor.userValue}, default=${startupEditor.defaultValue})`);
	}
	return startupEditor.value === 'welcomePage'
		|| startupEditor.value === 'readme' && (startupEditor.userValue === 'readme' || startupEditor.defaultValue === 'readme')
		|| (contextService.getWorkbenchState() === WorkbenchState.EMPTY && startupEditor.value === 'welcomePageInEmptyWorkbench');
}
