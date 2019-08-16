/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWindowsService, IWindowService, IWindowsConfiguration } from 'vs/platform/windows/common/windows';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';
import { isMacintosh, isNative } from 'vs/base/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

interface IConfiguration extends IWindowsConfiguration {
	update: { mode: string; };
	telemetry: { enableCrashReporter: boolean };
	workbench: { list: { horizontalScrolling: boolean }, useExperimentalGridLayout: boolean };
	debug: { console: { wordWrap: boolean } };
}

export class SettingsChangeRelauncher extends Disposable implements IWorkbenchContribution {

	private titleBarStyle: 'native' | 'custom';
	private nativeTabs: boolean;
	private nativeFullScreen: boolean;
	private clickThroughInactive: boolean;
	private updateMode: string;
	private enableCrashReporter: boolean;
	private treeHorizontalScrolling: boolean;
	private useGridLayout: boolean;
	private debugConsoleWordWrap: boolean;

	constructor(
		@IWindowsService private readonly windowsService: IWindowsService,
		@IWindowService private readonly windowService: IWindowService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly envService: IEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();

		this.onConfigurationChange(configurationService.getValue<IConfiguration>(), false);
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(this.configurationService.getValue<IConfiguration>(), true)));
	}

	private onConfigurationChange(config: IConfiguration, notify: boolean): void {
		let changed = false;

		// Tree horizontal scrolling support
		if (config.workbench && config.workbench.list && typeof config.workbench.list.horizontalScrolling === 'boolean' && config.workbench.list.horizontalScrolling !== this.treeHorizontalScrolling) {
			this.treeHorizontalScrolling = config.workbench.list.horizontalScrolling;
			changed = true;
		}

		// Workbench Grid Layout
		if (config.workbench && typeof config.workbench.useExperimentalGridLayout === 'boolean' && config.workbench.useExperimentalGridLayout !== this.useGridLayout) {
			this.useGridLayout = config.workbench.useExperimentalGridLayout;
			changed = true;
		}

		// Debug console word wrap
		if (config.debug && typeof config.debug.console.wordWrap === 'boolean' && config.debug.console.wordWrap !== this.debugConsoleWordWrap) {
			this.debugConsoleWordWrap = config.debug.console.wordWrap;
			changed = true;
		}

		if (isNative) {

			// Titlebar style
			if (config.window && config.window.titleBarStyle !== this.titleBarStyle && (config.window.titleBarStyle === 'native' || config.window.titleBarStyle === 'custom')) {
				this.titleBarStyle = config.window.titleBarStyle;
				changed = true;
			}

			// macOS: Native tabs
			if (isMacintosh && config.window && typeof config.window.nativeTabs === 'boolean' && config.window.nativeTabs !== this.nativeTabs) {
				this.nativeTabs = config.window.nativeTabs;
				changed = true;
			}

			// macOS: Native fullscreen
			if (isMacintosh && config.window && typeof config.window.nativeFullScreen === 'boolean' && config.window.nativeFullScreen !== this.nativeFullScreen) {
				this.nativeFullScreen = config.window.nativeFullScreen;
				changed = true;
			}

			// macOS: Click through (accept first mouse)
			if (isMacintosh && config.window && typeof config.window.clickThroughInactive === 'boolean' && config.window.clickThroughInactive !== this.clickThroughInactive) {
				this.clickThroughInactive = config.window.clickThroughInactive;
				changed = true;
			}

			// Update channel
			if (config.update && typeof config.update.mode === 'string' && config.update.mode !== this.updateMode) {
				this.updateMode = config.update.mode;
				changed = true;
			}

			// Crash reporter
			if (config.telemetry && typeof config.telemetry.enableCrashReporter === 'boolean' && config.telemetry.enableCrashReporter !== this.enableCrashReporter) {
				this.enableCrashReporter = config.telemetry.enableCrashReporter;
				changed = true;
			}
		}

		// Notify only when changed and we are the focused window (avoids notification spam across windows)
		if (notify && changed) {
			this.doConfirm(
				isNative ?
					localize('relaunchSettingMessage', "A setting has changed that requires a restart to take effect.") :
					localize('relaunchSettingMessageWeb', "A setting has changed that requires a reload to take effect."),
				isNative ?
					localize('relaunchSettingDetail', "Press the restart button to restart {0} and enable the setting.", this.envService.appNameLong) :
					localize('relaunchSettingDetailWeb', "Press the reload button to reload {0} and enable the setting.", this.envService.appNameLong),
				isNative ?
					localize('restart', "&&Restart") :
					localize('restartWeb', "&&Reload"),
				() => this.windowsService.relaunch(Object.create(null))
			);
		}
	}

	private doConfirm(message: string, detail: string, primaryButton: string, confirmed: () => void): void {
		this.windowService.isFocused().then(focused => {
			if (focused) {
				return this.dialogService.confirm({
					type: 'info',
					message,
					detail,
					primaryButton
				}).then(res => {
					if (res.confirmed) {
						confirmed();
					}
				});
			}

			return undefined;
		});
	}
}

export class WorkspaceChangeExtHostRelauncher extends Disposable implements IWorkbenchContribution {

	private firstFolderResource?: URI;
	private extensionHostRestarter: RunOnceScheduler;

	private onDidChangeWorkspaceFoldersUnbind: IDisposable | undefined;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IExtensionService extensionService: IExtensionService,
		@IWindowService windowService: IWindowService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.extensionHostRestarter = this._register(new RunOnceScheduler(() => {
			if (!!environmentService.extensionTestsLocationURI) {
				return; // no restart when in tests: see https://github.com/Microsoft/vscode/issues/66936
			}

			if (environmentService.configuration.remoteAuthority) {
				windowService.reloadWindow(); // TODO@aeschli, workaround
			} else {
				extensionService.restartExtensionHost();
			}
		}, 10));

		this.contextService.getCompleteWorkspace()
			.then(workspace => {
				this.firstFolderResource = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;
				this.handleWorkbenchState();
				this._register(this.contextService.onDidChangeWorkbenchState(() => setTimeout(() => this.handleWorkbenchState())));
			});

		this._register(toDisposable(() => {
			if (this.onDidChangeWorkspaceFoldersUnbind) {
				this.onDidChangeWorkspaceFoldersUnbind.dispose();
			}
		}));
	}

	private handleWorkbenchState(): void {

		// React to folder changes when we are in workspace state
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {

			// Update our known first folder path if we entered workspace
			const workspace = this.contextService.getWorkspace();
			this.firstFolderResource = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;

			// Install workspace folder listener
			if (!this.onDidChangeWorkspaceFoldersUnbind) {
				this.onDidChangeWorkspaceFoldersUnbind = this.contextService.onDidChangeWorkspaceFolders(() => this.onDidChangeWorkspaceFolders());
			}
		}

		// Ignore the workspace folder changes in EMPTY or FOLDER state
		else {
			dispose(this.onDidChangeWorkspaceFoldersUnbind);
			this.onDidChangeWorkspaceFoldersUnbind = undefined;
		}
	}

	private onDidChangeWorkspaceFolders(): void {
		const workspace = this.contextService.getWorkspace();

		// Restart extension host if first root folder changed (impact on deprecated workspace.rootPath API)
		const newFirstFolderResource = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;
		if (!isEqual(this.firstFolderResource, newFirstFolderResource)) {
			this.firstFolderResource = newFirstFolderResource;

			this.extensionHostRestarter.schedule(); // buffer calls to extension host restart
		}
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SettingsChangeRelauncher, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(WorkspaceChangeExtHostRelauncher, LifecyclePhase.Restored);
