/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import * as arrays from '../../../../base/common/arrays.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkingCopyBackupService } from '../../../services/workingCopy/common/workingCopyBackup.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { GettingStartedEditorOptions, GettingStartedInput, gettingStartedInputTypeId } from './gettingStartedInput.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { TerminalCommandId } from '../../terminal/common/terminal.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export const restoreWalkthroughsConfigurationKey = 'workbench.welcomePage.restorableWalkthroughs';
export type RestoreWalkthroughsConfigurationValue = { folder: string; category?: string; step?: string };

const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryOptOutStorageKey = 'workbench.telemetryOptOutShown';

export class StartupPageEditorResolverContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.startupPageEditorResolver';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorResolverService editorResolverService: IEditorResolverService
	) {
		editorResolverService.registerEditor(
			`${GettingStartedInput.RESOURCE.scheme}:/**`,
			{
				id: GettingStartedInput.ID,
				label: localize('welcome.displayName', "Welcome Page"),
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: false,
				canSupportResource: uri => uri.scheme === GettingStartedInput.RESOURCE.scheme,
			},
			{
				createEditorInput: ({ resource, options }) => {
					return {
						editor: this.instantiationService.createInstance(GettingStartedInput, options as GettingStartedEditorOptions),
						options: {
							...options,
							pinned: false
						}
					};
				}
			}
		);
	}
}

export class StartupPageRunnerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.startupPageRunner';

	constructor(
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
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		this.run().then(undefined, onUnexpectedError);
		this._register(this.editorService.onDidCloseEditor((e) => {
			if (e.editor instanceof GettingStartedInput) {
				e.editor.selectedCategory = undefined;
				e.editor.selectedStep = undefined;
			}
		}));
	}

	private async run() {

		// Wait for resolving startup editor until we are restored to reduce startup pressure
		await this.lifecycleService.when(LifecyclePhase.Restored);

		// Always open Welcome page for first-launch, no matter what is open or which startupEditor is set.
		if (
			this.productService.enableTelemetry
			&& this.productService.showTelemetryOptOut
			&& getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE
			&& !this.environmentService.skipWelcome
			&& !this.storageService.get(telemetryOptOutStorageKey, StorageScope.PROFILE)
		) {
			this.storageService.store(telemetryOptOutStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
		}

		if (this.tryOpenWalkthroughForFolder()) {
			return;
		}

		const enabled = isStartupPageEnabled(this.configurationService, this.contextService, this.environmentService, this.logService);
		if (enabled && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			const hasBackups = await this.workingCopyBackupService.hasBackups();
			if (hasBackups) { return; }

			// Open the welcome even if we opened a set of default editors
			if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
				const startupEditorSetting = this.configurationService.inspect<string>(configurationKey);

				if (startupEditorSetting.value === 'readme') {
					await this.openReadme();
				} else if (startupEditorSetting.value === 'welcomePage' || startupEditorSetting.value === 'welcomePageInEmptyWorkbench') {
					await this.openGettingStarted();
				} else if (startupEditorSetting.value === 'terminal') {
					this.commandService.executeCommand(TerminalCommandId.CreateTerminalEditor);
				}
			}
		}
	}

	private tryOpenWalkthroughForFolder(): boolean {
		const toRestore = this.storageService.get(restoreWalkthroughsConfigurationKey, StorageScope.PROFILE);
		if (!toRestore) {
			return false;
		}
		else {
			const restoreData: RestoreWalkthroughsConfigurationValue = JSON.parse(toRestore);
			const currentWorkspace = this.contextService.getWorkspace();
			if (restoreData.folder === UNKNOWN_EMPTY_WINDOW_WORKSPACE.id || restoreData.folder === currentWorkspace.folders[0].uri.toString()) {
				const options: GettingStartedEditorOptions = { selectedCategory: restoreData.category, selectedStep: restoreData.step, pinned: false };
				this.editorService.openEditor({
					resource: GettingStartedInput.RESOURCE,
					options
				});
				this.storageService.remove(restoreWalkthroughsConfigurationKey, StorageScope.PROFILE);
				return true;
			}
		}
		return false;
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
					this.commandService.executeCommand('markdown.showPreview', null, readmes.filter(isMarkDown), { locked: true }).catch(error => {
						this.notificationService.error(localize('startupPage.markdownPreviewError', 'Could not open markdown preview: {0}.\n\nPlease make sure the markdown extension is enabled.', error.message));
					}),
					this.editorService.openEditors(readmes.filter(readme => !isMarkDown(readme)).map(readme => ({ resource: readme }))),
				]);
			} else {
				// If no readme is found, default to showing the welcome page.
				await this.openGettingStarted();
			}
		}
	}

	private async openGettingStarted(showTelemetryNotice?: boolean) {
		const startupEditorTypeID = gettingStartedInputTypeId;
		const editor = this.editorService.activeEditor;

		// Ensure that the welcome editor won't get opened more than once
		if (editor?.typeId === startupEditorTypeID || this.editorService.editors.some(e => e.typeId === startupEditorTypeID)) {
			return;
		}

		const options: GettingStartedEditorOptions = editor ? { pinned: false, index: 0, showTelemetryNotice } : { pinned: false, showTelemetryNotice };
		if (startupEditorTypeID === gettingStartedInputTypeId) {
			this.editorService.openEditor({
				resource: GettingStartedInput.RESOURCE,
				options,
			});
		}
	}
}

function isStartupPageEnabled(configurationService: IConfigurationService, contextService: IWorkspaceContextService, environmentService: IWorkbenchEnvironmentService, logService: ILogService) {
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

	return startupEditor.value === 'welcomePage'
		|| startupEditor.value === 'readme'
		|| (contextService.getWorkbenchState() === WorkbenchState.EMPTY && startupEditor.value === 'welcomePageInEmptyWorkbench')
		|| startupEditor.value === 'terminal';
}
