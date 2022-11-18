/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWindowsConfiguration, IWindowSettings } from 'vs/platform/window/common/window';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';
import { isMacintosh, isNative, isLinux, isWindows } from 'vs/base/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProductService } from 'vs/platform/product/common/productService';

interface IConfiguration extends IWindowsConfiguration {
	update?: { mode?: string };
	debug?: { console?: { wordWrap?: boolean } };
	editor?: { accessibilitySupport?: 'on' | 'off' | 'auto' };
	security?: { workspace?: { trust?: { enabled?: boolean } } };
	window: IWindowSettings & { experimental?: { windowControlsOverlay?: { enabled?: boolean }; useSandbox?: boolean } };
	workbench?: { experimental?: { settingsProfiles?: { enabled?: boolean } }; enableExperiments?: boolean };
	_extensionsGallery?: { enablePPE?: boolean };
}

export class SettingsChangeRelauncher extends Disposable implements IWorkbenchContribution {

	private readonly titleBarStyle = new ChangeObserver<'native' | 'custom'>('string');
	private readonly windowControlsOverlayEnabled = new ChangeObserver('boolean');
	private readonly windowSandboxEnabled = new ChangeObserver('boolean');
	private readonly nativeTabs = new ChangeObserver('boolean');
	private readonly nativeFullScreen = new ChangeObserver('boolean');
	private readonly clickThroughInactive = new ChangeObserver('boolean');
	private readonly updateMode = new ChangeObserver('string');
	private accessibilitySupport: 'on' | 'off' | 'auto' | undefined;
	private readonly workspaceTrustEnabled = new ChangeObserver('boolean');
	private readonly profilesEnabled = new ChangeObserver('boolean');
	private readonly experimentsEnabled = new ChangeObserver('boolean');
	private readonly enablePPEExtensionsGallery = new ChangeObserver('boolean');

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();

		this.onConfigurationChange(configurationService.getValue<IConfiguration>(), false);
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(this.configurationService.getValue<IConfiguration>(), true)));
	}

	private onConfigurationChange(config: IConfiguration, notify: boolean): void {
		let changed = false;

		function processChanged(didChange: boolean) {
			changed = changed || didChange;
		}

		if (isNative) {

			// Titlebar style
			processChanged((config.window.titleBarStyle === 'native' || config.window.titleBarStyle === 'custom') && this.titleBarStyle.handleChange(config.window?.titleBarStyle));

			// Windows: Window Controls Overlay
			processChanged(isWindows && this.windowControlsOverlayEnabled.handleChange(config.window?.experimental?.windowControlsOverlay?.enabled));

			// Windows: Sandbox
			processChanged(this.windowSandboxEnabled.handleChange(config.window?.experimental?.useSandbox));

			// macOS: Native tabs
			processChanged(isMacintosh && this.nativeTabs.handleChange(config.window?.nativeTabs));

			// macOS: Native fullscreen
			processChanged(isMacintosh && this.nativeFullScreen.handleChange(config.window?.nativeFullScreen));

			// macOS: Click through (accept first mouse)
			processChanged(isMacintosh && this.clickThroughInactive.handleChange(config.window?.clickThroughInactive));

			// Update channel
			processChanged(this.updateMode.handleChange(config.update?.mode));

			// On linux turning on accessibility support will also pass this flag to the chrome renderer, thus a restart is required
			if (isLinux && typeof config.editor?.accessibilitySupport === 'string' && config.editor.accessibilitySupport !== this.accessibilitySupport) {
				this.accessibilitySupport = config.editor.accessibilitySupport;
				if (this.accessibilitySupport === 'on') {
					changed = true;
				}
			}

			// Workspace trust
			processChanged(this.workspaceTrustEnabled.handleChange(config?.security?.workspace?.trust?.enabled));
		}

		// Profiles
		processChanged(this.productService.quality === 'stable' && this.profilesEnabled.handleChange(config.workbench?.experimental?.settingsProfiles?.enabled));

		// Experiments
		processChanged(this.experimentsEnabled.handleChange(config.workbench?.enableExperiments));

		// Profiles
		processChanged(this.productService.quality !== 'stable' && this.enablePPEExtensionsGallery.handleChange(config._extensionsGallery?.enablePPE));

		// Notify only when changed and we are the focused window (avoids notification spam across windows)
		if (notify && changed) {
			this.doConfirm(
				isNative ?
					localize('relaunchSettingMessage', "A setting has changed that requires a restart to take effect.") :
					localize('relaunchSettingMessageWeb', "A setting has changed that requires a reload to take effect."),
				isNative ?
					localize('relaunchSettingDetail', "Press the restart button to restart {0} and enable the setting.", this.productService.nameLong) :
					localize('relaunchSettingDetailWeb', "Press the reload button to reload {0} and enable the setting.", this.productService.nameLong),
				isNative ?
					localize('restart', "&&Restart") :
					localize('restartWeb', "&&Reload"),
				() => this.hostService.restart()
			);
		}
	}

	private async doConfirm(message: string, detail: string, primaryButton: string, confirmed: () => void): Promise<void> {
		if (this.hostService.hasFocus) {
			const res = await this.dialogService.confirm({ type: 'info', message, detail, primaryButton });
			if (res.confirmed) {
				confirmed();
			}
		}
	}
}

interface TypeNameToType {
	readonly boolean: boolean;
	readonly string: string;
}

class ChangeObserver<T> {

	static create<TTypeName extends 'boolean' | 'string'>(typeName: TTypeName): ChangeObserver<TypeNameToType[TTypeName]> {
		return new ChangeObserver(typeName);
	}

	constructor(private readonly typeName: string) { }

	private lastValue: T | undefined = undefined;

	/**
	 * Returns if there was a change compared to the last value
	 */
	handleChange(value: T | undefined): boolean {
		if (typeof value === this.typeName && value !== this.lastValue) {
			this.lastValue = value;
			return true;
		}

		return false;
	}
}

export class WorkspaceChangeExtHostRelauncher extends Disposable implements IWorkbenchContribution {

	private firstFolderResource?: URI;
	private extensionHostRestarter: RunOnceScheduler;

	private onDidChangeWorkspaceFoldersUnbind: IDisposable | undefined;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IExtensionService extensionService: IExtensionService,
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.extensionHostRestarter = this._register(new RunOnceScheduler(() => {
			if (!!environmentService.extensionTestsLocationURI) {
				return; // no restart when in tests: see https://github.com/microsoft/vscode/issues/66936
			}

			if (environmentService.remoteAuthority) {
				hostService.reload(); // TODO@aeschli, workaround
			} else if (isNative) {
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
			this.onDidChangeWorkspaceFoldersUnbind?.dispose();
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
