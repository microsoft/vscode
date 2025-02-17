/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWindowsConfiguration, IWindowSettings, TitleBarSetting, TitlebarStyle } from '../../../../platform/window/common/window.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isMacintosh, isNative, isLinux } from '../../../../base/common/platform.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUserDataSyncEnablementService, IUserDataSyncService, SyncStatus } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IUserDataSyncWorkbenchService } from '../../../services/userDataSync/common/userDataSync.js';

interface IConfiguration extends IWindowsConfiguration {
	update?: { mode?: string };
	debug?: { console?: { wordWrap?: boolean } };
	editor?: { accessibilitySupport?: 'on' | 'off' | 'auto' };
	security?: { workspace?: { trust?: { enabled?: boolean } }; restrictUNCAccess?: boolean };
	window: IWindowSettings;
	workbench?: { enableExperiments?: boolean };
	_extensionsGallery?: { enablePPE?: boolean };
	accessibility?: { verbosity?: { debug?: boolean } };
}

export class SettingsChangeRelauncher extends Disposable implements IWorkbenchContribution {

	private static SETTINGS = [
		TitleBarSetting.TITLE_BAR_STYLE,
		'window.nativeTabs',
		'window.nativeFullScreen',
		'window.clickThroughInactive',
		'update.mode',
		'editor.accessibilitySupport',
		'security.workspace.trust.enabled',
		'workbench.enableExperiments',
		'_extensionsGallery.enablePPE',
		'security.restrictUNCAccess',
		'accessibility.verbosity.debug'
	];

	private readonly titleBarStyle = new ChangeObserver<TitlebarStyle>('string');
	private readonly nativeTabs = new ChangeObserver('boolean');
	private readonly nativeFullScreen = new ChangeObserver('boolean');
	private readonly clickThroughInactive = new ChangeObserver('boolean');
	private readonly updateMode = new ChangeObserver('string');
	private accessibilitySupport: 'on' | 'off' | 'auto' | undefined;
	private readonly workspaceTrustEnabled = new ChangeObserver('boolean');
	private readonly experimentsEnabled = new ChangeObserver('boolean');
	private readonly enablePPEExtensionsGallery = new ChangeObserver('boolean');
	private readonly restrictUNCAccess = new ChangeObserver('boolean');
	private readonly accessibilityVerbosityDebug = new ChangeObserver('boolean');

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncWorkbenchService userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
		@IProductService private readonly productService: IProductService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();

		this.update(false);
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e)));
		this._register(userDataSyncWorkbenchService.onDidTurnOnSync(e => this.update(true)));
	}

	private onConfigurationChange(e: IConfigurationChangeEvent): void {
		if (e && !SettingsChangeRelauncher.SETTINGS.some(key => e.affectsConfiguration(key))) {
			return;
		}

		// Skip if turning on sync is in progress
		if (this.isTurningOnSyncInProgress()) {
			return;
		}

		this.update(e.source !== ConfigurationTarget.DEFAULT /* do not ask to relaunch if defaults changed */);
	}

	private isTurningOnSyncInProgress(): boolean {
		return !this.userDataSyncEnablementService.isEnabled() && this.userDataSyncService.status === SyncStatus.Syncing;
	}

	private update(askToRelaunch: boolean): void {
		let changed = false;

		function processChanged(didChange: boolean) {
			changed = changed || didChange;
		}

		const config = this.configurationService.getValue<IConfiguration>();
		if (isNative) {

			// Titlebar style
			processChanged((config.window.titleBarStyle === TitlebarStyle.NATIVE || config.window.titleBarStyle === TitlebarStyle.CUSTOM) && this.titleBarStyle.handleChange(config.window?.titleBarStyle));

			// macOS: Native tabs
			processChanged(isMacintosh && this.nativeTabs.handleChange(config.window?.nativeTabs));

			// macOS: Native fullscreen
			processChanged(isMacintosh && this.nativeFullScreen.handleChange(config.window?.nativeFullScreen));

			// macOS: Click through (accept first mouse)
			processChanged(isMacintosh && this.clickThroughInactive.handleChange(config.window?.clickThroughInactive));

			// Update mode
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

			// UNC host access restrictions
			processChanged(this.restrictUNCAccess.handleChange(config?.security?.restrictUNCAccess));

			// Debug accessibility verbosity
			processChanged(this.accessibilityVerbosityDebug.handleChange(config?.accessibility?.verbosity?.debug));
		}

		// Experiments
		processChanged(this.experimentsEnabled.handleChange(config.workbench?.enableExperiments));

		// Profiles
		processChanged(this.productService.quality !== 'stable' && this.enablePPEExtensionsGallery.handleChange(config._extensionsGallery?.enablePPE));

		if (askToRelaunch && changed && this.hostService.hasFocus) {
			this.doConfirm(
				isNative ?
					localize('relaunchSettingMessage', "A setting has changed that requires a restart to take effect.") :
					localize('relaunchSettingMessageWeb', "A setting has changed that requires a reload to take effect."),
				isNative ?
					localize('relaunchSettingDetail', "Press the restart button to restart {0} and enable the setting.", this.productService.nameLong) :
					localize('relaunchSettingDetailWeb', "Press the reload button to reload {0} and enable the setting.", this.productService.nameLong),
				isNative ?
					localize({ key: 'restart', comment: ['&& denotes a mnemonic'] }, "&&Restart") :
					localize({ key: 'restartWeb', comment: ['&& denotes a mnemonic'] }, "&&Reload"),
				() => this.hostService.restart()
			);
		}
	}

	private async doConfirm(message: string, detail: string, primaryButton: string, confirmedFn: () => void): Promise<void> {
		const { confirmed } = await this.dialogService.confirm({ message, detail, primaryButton });
		if (confirmed) {
			confirmedFn();
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

		this.extensionHostRestarter = this._register(new RunOnceScheduler(async () => {
			if (!!environmentService.extensionTestsLocationURI) {
				return; // no restart when in tests: see https://github.com/microsoft/vscode/issues/66936
			}

			if (environmentService.remoteAuthority) {
				hostService.reload(); // TODO@aeschli, workaround
			} else if (isNative) {
				const stopped = await extensionService.stopExtensionHosts(localize('restartExtensionHost.reason', "Changing workspace folders"));
				if (stopped) {
					extensionService.startExtensionHosts();
				}
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
