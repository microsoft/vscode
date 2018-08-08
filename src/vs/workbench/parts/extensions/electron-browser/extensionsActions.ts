/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionActions';
import { localize } from 'vs/nls';
import * as semver from 'semver';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, Action } from 'vs/base/common/actions';
import { Throttler } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import * as paths from 'vs/base/common/paths';
import { Event } from 'vs/base/common/event';
import * as json from 'vs/base/common/json';
import { ActionItem, IActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, VIEWLET_ID, IExtensionsViewlet, AutoUpdateConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionsConfigurationInitialContent } from 'vs/workbench/parts/extensions/common/extensionsFileTemplate';
import { LocalExtensionType, IExtensionEnablementService, IExtensionTipsService, EnablementState, ExtensionsLabel, IExtensionManagementServer, IExtensionManagementServerService, IExtensionRecommendation, ExtensionRecommendationSource, IExtensionGalleryService, IGalleryExtension, ILocalExtension, IExtensionsConfigContent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Query } from 'vs/workbench/parts/extensions/common/extensionQuery';
import { IFileService, IContent } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IExtensionService, IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import URI from 'vs/base/common/uri';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { buttonBackground, buttonForeground, buttonHoverBackground, contrastBorder, registerColor, foreground } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { PagedModel } from 'vs/base/common/paging';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import product from 'vs/platform/node/product';
import { ContextSubMenu } from 'vs/base/browser/contextmenu';

const promptDownloadManually = (extension: IGalleryExtension, message: string, instantiationService: IInstantiationService, notificationService: INotificationService, openerService: IOpenerService) => {
	const downloadUrl = `${product.extensionsGallery.serviceUrl}/publishers/${extension.publisher}/vsextensions/${extension.name}/${extension.version}/vspackage`;
	notificationService.prompt(Severity.Error, message, [{
		label: localize('download', "Download Manually"),
		run: () => openerService.open(URI.parse(downloadUrl)).then(() => {
			notificationService.prompt(
				Severity.Info,
				localize('install vsix', 'Once downloaded, please manually install the downloaded VSIX of \'{0}\'.', extension.identifier.id),
				[{
					label: InstallVSIXAction.LABEL,
					run: () => {
						const action = instantiationService.createInstance(InstallVSIXAction, InstallVSIXAction.ID, InstallVSIXAction.LABEL);
						action.run();
						action.dispose();
					}
				}]
			);
		})
	}]);
};

const getExtensionManagementServerForRecommendationSource = (source: ExtensionRecommendationSource, extensionManagementServerService: IExtensionManagementServerService, contextService: IWorkspaceContextService): IExtensionManagementServer => {
	if (source instanceof URI) {
		return extensionManagementServerService.getExtensionManagementServer(source);
	}
	if (source === contextService.getWorkspace()) {
		return extensionManagementServerService.getDefaultExtensionManagementServer();
	}
	for (const workspaceFolder of contextService.getWorkspace().folders) {
		if (source === workspaceFolder) {
			return extensionManagementServerService.getExtensionManagementServer(workspaceFolder.uri);
		}
	}
	return extensionManagementServerService.getDefaultExtensionManagementServer();
};

export interface IExtensionAction extends IAction {
	extension: IExtension;
}

export class InstallAction extends Action {

	private static INSTALL_LABEL = localize('install', "Install");
	private static INSTALLING_LABEL = localize('installing', "Installing");

	private static readonly Class = 'extension-action prominent install';
	private static readonly InstallingClass = 'extension-action install installing';

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@INotificationService private notificationService: INotificationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(`extensions.install`, InstallAction.INSTALL_LABEL, InstallAction.Class, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension || this.extension.type === LocalExtensionType.System) {
			this.enabled = false;
			this.class = InstallAction.Class;
			this.label = InstallAction.INSTALL_LABEL;
			return;
		}

		this.enabled = this.extensionsWorkbenchService.canInstall(this.extension) && this.extension.state === ExtensionState.Uninstalled;

		if (this.extension.state === ExtensionState.Installing) {
			this.label = InstallAction.INSTALLING_LABEL;
			this.class = InstallAction.InstallingClass;
			this.tooltip = InstallAction.INSTALLING_LABEL;
		} else {
			this.label = InstallAction.INSTALL_LABEL;
			this.class = InstallAction.Class;
			this.tooltip = InstallAction.INSTALL_LABEL;
		}
	}

	run(): TPromise<any> {
		this.extensionsWorkbenchService.open(this.extension);

		return this.install(this.extension);
	}

	private install(extension: IExtension): TPromise<void> {
		return this.extensionsWorkbenchService.install(extension).then(null, err => {
			if (!extension.gallery) {
				return this.notificationService.error(err);
			}

			console.error(err);

			promptDownloadManually(extension.gallery, localize('failedToInstall', "Failed to install \'{0}\'.", extension.id), this.instantiationService, this.notificationService, this.openerService);
		});
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UninstallAction extends Action {

	private static readonly UninstallLabel = localize('uninstallAction', "Uninstall");
	private static readonly UninstallingLabel = localize('Uninstalling', "Uninstalling");

	private static readonly UninstallClass = 'extension-action uninstall';
	private static readonly UnInstallingClass = 'extension-action uninstall uninstalling';

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.uninstall', UninstallAction.UninstallLabel, UninstallAction.UninstallClass, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			return;
		}

		const state = this.extension.state;

		if (state === ExtensionState.Uninstalling) {
			this.label = UninstallAction.UninstallingLabel;
			this.class = UninstallAction.UnInstallingClass;
			this.enabled = false;
			return;
		}

		this.label = UninstallAction.UninstallLabel;
		this.class = UninstallAction.UninstallClass;

		const installedExtensions = this.extensionsWorkbenchService.local.filter(e => e.id === this.extension.id);

		if (!installedExtensions.length) {
			this.enabled = false;
			return;
		}

		if (installedExtensions[0].type !== LocalExtensionType.User) {
			this.enabled = false;
			return;
		}

		this.enabled = true;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.uninstall(this.extension);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class CombinedInstallAction extends Action {

	private static readonly NoExtensionClass = 'extension-action prominent install no-extension';
	private installAction: MultiServerInstallAction | InstallAction;
	private uninstallAction: MultiServerUninstallAction | UninstallAction;
	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) {
		this._extension = extension;
		this.installAction.extension = extension;
		this.uninstallAction.extension = extension;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService
	) {
		super('extensions.combinedInstall', '', '', false);

		this.installAction = extensionManagementServerService.extensionManagementServers.length > 1 ? instantiationService.createInstance(MultiServerInstallAction, false) : instantiationService.createInstance(InstallAction);
		this.uninstallAction = extensionManagementServerService.extensionManagementServers.length > 1 ? instantiationService.createInstance(MultiServerUninstallAction) : instantiationService.createInstance(UninstallAction);
		this.disposables.push(this.installAction, this.uninstallAction);

		this.installAction.onDidChange(this.update, this, this.disposables);
		this.uninstallAction.onDidChange(this.update, this, this.disposables);
		this.update();
	}

	private update(): void {
		if (!this.extension || this.extension.type === LocalExtensionType.System) {
			this.enabled = false;
			this.class = CombinedInstallAction.NoExtensionClass;
		} else if (this.installAction.enabled) {
			this.enabled = true;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
			this.tooltip = this.installAction.tooltip;
		} else if (this.uninstallAction.enabled) {
			this.enabled = true;
			this.label = this.uninstallAction.label;
			this.class = this.uninstallAction.class;
			this.tooltip = this.uninstallAction.tooltip;
		} else if (this.extension.state === ExtensionState.Installing) {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
			this.tooltip = this.installAction.tooltip;
		} else if (this.extension.state === ExtensionState.Uninstalling) {
			this.enabled = false;
			this.label = this.uninstallAction.label;
			this.class = this.uninstallAction.class;
			this.tooltip = this.uninstallAction.tooltip;
		} else {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
			this.tooltip = this.installAction.tooltip;
		}
	}

	run(): TPromise<any> {
		if (this.installAction.enabled) {
			return this.installAction.run();
		} else if (this.uninstallAction.enabled) {
			return this.uninstallAction.run();
		}

		return TPromise.as(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UpdateAction extends Action {

	private static readonly EnabledClass = 'extension-action prominent update';
	private static readonly DisabledClass = `${UpdateAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@INotificationService private notificationService: INotificationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(`extensions.update`, '', UpdateAction.DisabledClass, false);
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = UpdateAction.DisabledClass;
			this.label = this.getUpdateLabel();
			return;
		}

		if (this.extension.type !== LocalExtensionType.User) {
			this.enabled = false;
			this.class = UpdateAction.DisabledClass;
			this.label = this.getUpdateLabel();
			return;
		}

		const canInstall = this.extensionsWorkbenchService.canInstall(this.extension);
		const isInstalled = this.extension.state === ExtensionState.Installed;

		this.enabled = canInstall && isInstalled && this.extension.outdated;
		this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
		this.label = this.extension.outdated ? this.getUpdateLabel(this.extension.latestVersion) : this.getUpdateLabel();
	}

	run(): TPromise<any> {
		return this.install(this.extension);
	}

	private install(extension: IExtension): TPromise<void> {
		return this.extensionsWorkbenchService.install(extension).then(null, err => {
			if (!extension.gallery) {
				return this.notificationService.error(err);
			}

			console.error(err);

			promptDownloadManually(extension.gallery, localize('failedToUpdate', "Failed to update \'{0}\'.", extension.id), this.instantiationService, this.notificationService, this.openerService);
		});
	}

	private getUpdateLabel(version?: string): string {
		return version ? localize('updateTo', "Update to {0}", version) : localize('updateAction', "Update");
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class InstallGalleryExtensionAction extends Action {

	private _server: IExtensionManagementServer;
	private _extension: IGalleryExtension;
	get extension(): IGalleryExtension { return this._extension; }
	set extension(extension: IGalleryExtension) { this._extension = extension; this.enabled = !!this._extension; }

	constructor(
		id: string, label: string, server: IExtensionManagementServer,
		@INotificationService private notificationService: INotificationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(id, label, null, false);
		this._server = server;
	}

	run(): TPromise<any> {
		if (this.extension) {
			return this._server.extensionManagementService.installFromGallery(this.extension)
				.then(() => null, err => {
					console.error(err);
					promptDownloadManually(this.extension, localize('failedToInstall', "Failed to install \'{0}\'.", this.extension.identifier.id), this.instantiationService, this.notificationService, this.openerService);
				});
		}
		return TPromise.as(null);
	}
}

export class UninstallExtensionAction extends Action {

	private _server: IExtensionManagementServer;
	private _extension: ILocalExtension;
	get extension(): ILocalExtension { return this._extension; }
	set extension(extension: ILocalExtension) { this._extension = extension; this.enabled = !!this._extension; }

	constructor(
		id: string, label: string, server: IExtensionManagementServer,
	) {
		super(id, label, null, false);
		this._server = server;
	}

	run(): TPromise<any> {
		if (this.extension) {
			return this._server.extensionManagementService.uninstall(this.extension);
		}
		return TPromise.as(null);
	}
}

export class UpdateGalleryExtensionAction extends Action {

	private server: IExtensionManagementServer;

	private local: ILocalExtension;
	private gallery: IGalleryExtension;
	get extension(): { local: ILocalExtension, gallery: IGalleryExtension } { return { local: this.local, gallery: this.gallery }; }
	set extension(extension: { local: ILocalExtension, gallery: IGalleryExtension }) { this.local = extension ? extension.local : null; this.gallery = extension ? extension.gallery : null; this.update(); }

	constructor(
		id: string, label: string, server: IExtensionManagementServer,
		@INotificationService private notificationService: INotificationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(id, label, null, false);
		this.server = server;
	}

	private update(): void {
		this.enabled = this.local && this.gallery && this.local.type === LocalExtensionType.User && semver.gt(this.gallery.version, this.local.manifest.version);
		this.label = this.enabled ? localize('updateToInServer', "Update to {0} ({1})", this.gallery.version, this.server.location.authority) : localize('updateLabelInServer', "Update ({0})", this.server.location.authority);
	}

	run(): TPromise<any> {
		if (this.gallery) {
			return this.server.extensionManagementService.installFromGallery(this.gallery)
				.then(() => null, err => {
					console.error(err);
					promptDownloadManually(this.gallery, localize('failedToInstall', "Failed to install \'{0}\'.", this.gallery.identifier.id), this.instantiationService, this.notificationService, this.openerService);
				});
		}
		return TPromise.as(null);
	}
}

export class MultiServerInstallAction extends Action {

	static ID: string = 'extensions.multiserver.install';

	private static readonly InstallLabel = localize('installAction', "Install");
	private static readonly InstallingLabel = localize('installing', "Installing");

	private static readonly Class = 'extension-action multiserver prominent install';
	private static readonly InstallingClass = 'extension-action multiserver install installing';

	private readonly disableWhenInstalled: boolean;

	readonly actions: InstallGalleryExtensionAction[] = [];
	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	private disposables: IDisposable[] = [];

	constructor(
		disableWhenInstalled: boolean,
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(MultiServerInstallAction.ID, MultiServerInstallAction.InstallLabel, MultiServerInstallAction.Class, false);
		this.disableWhenInstalled = disableWhenInstalled;
		this.actions = this.extensionManagementServerService.extensionManagementServers.map(server => this.instantiationService.createInstance(InstallGalleryExtensionAction, `extensions.install.${server.location.authority}`, localize('installInServer', "{0}", server.location.authority), server));
		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [this.actions]);
		this.disposables.push(...[this._actionItem, ...this.actions]);
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => {
			if (this.extension) {
				this.extension = this.extensionsWorkbenchService.local.filter(l => areSameExtensions({ id: l.id }, { id: this.extension.id }))[0] || this.extension;
			}
		}));
		this.update();
	}

	private update(): void {
		if (!this.extension || this.extension.type === LocalExtensionType.System) {
			this.enabled = false;
			this.class = MultiServerInstallAction.Class;
			this.label = MultiServerInstallAction.InstallLabel;
			return;
		}

		if (this.extension.state === ExtensionState.Installing) {
			this.label = MultiServerInstallAction.InstallingLabel;
			this.class = MultiServerInstallAction.InstallingClass;
			this.tooltip = MultiServerInstallAction.InstallingLabel;
		} else {
			this.label = MultiServerInstallAction.InstallLabel;
			this.class = MultiServerInstallAction.Class;
			this.tooltip = MultiServerInstallAction.InstallLabel;
		}

		const isInstalled = this.extension.locals.length > 0;

		if (isInstalled && this.disableWhenInstalled) {
			this.enabled = false;
			return;
		}

		let isExtensionNotInstalledInRecommendedServer: boolean = false;
		this.actions.forEach((installAction, index) => {
			const server = this.extensionManagementServerService.extensionManagementServers[index];
			installAction.extension = this.extension.gallery;
			installAction.label = localize('installInServer', "{0}", server.location.authority);
			installAction.enabled = this.extension.gallery && !this.extension.locals.some(local => this.extensionManagementServerService.getExtensionManagementServer(local.location) === server);
			if (this.extension.recommendationSources && this.extension.recommendationSources.length) {
				if (this.extension.recommendationSources.some(recommendationSource => getExtensionManagementServerForRecommendationSource(recommendationSource, this.extensionManagementServerService, this.contextService) === server)) {
					installAction.label = localize('installInRecommendedServer', "{0} (Recommended)", server.location.authority);
					isExtensionNotInstalledInRecommendedServer = isExtensionNotInstalledInRecommendedServer || installAction.enabled;
				}
			}
		});

		this.enabled = this.extensionsWorkbenchService.canInstall(this.extension) && (isExtensionNotInstalledInRecommendedServer || this.extension.locals.length === 0);
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class MultiServerInstallSubMenuAction extends ContextSubMenu {

	private readonly action: MultiServerInstallAction;
	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.action.extension = extension; }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super('', []);
		this.action = instantiationService.createInstance(MultiServerInstallAction, false);
		this.disposables.push(this.action);
		this.entries = this.action.actions;
		this.disposables.push(this.onDidChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.label = this.action.label;
		this.enabled = this.action.enabled;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class MultiServerUnInstallSubMenuAction extends ContextSubMenu {

	private readonly action: MultiServerUninstallAction;
	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.action.extension = extension; }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super('', []);
		this.action = instantiationService.createInstance(MultiServerUninstallAction);
		this.disposables.push(this.action);
		this.entries = this.action.actions;
		this.disposables.push(this.onDidChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.label = this.action.label;
		this.enabled = this.action.enabled;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class MultiServerUpdateAction extends Action {

	static ID: string = 'extensions.multiserver.update';

	private static readonly Class = 'extension-action multiserver prominent update';

	private _updateActions: UpdateGalleryExtensionAction[] = [];
	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(MultiServerUpdateAction.ID, localize('update', "Update"), MultiServerUpdateAction.Class, false);
		this._updateActions = this.extensionManagementServerService.extensionManagementServers.map(server => this.instantiationService.createInstance(UpdateGalleryExtensionAction, `extensions.update.${server.location.authority}`, localize('installInServer', "{0}", server.location.authority), server));
		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [this._updateActions]);
		this.disposables.push(this._actionItem);
		this.disposables.push(...this._updateActions);
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this._updateActions.forEach((updateAction, index) => {
			updateAction.extension = null;
			if (this.extension && this.extension.locals && this.extension.gallery) {
				const server = this.extensionManagementServerService.extensionManagementServers[index];
				const local = this.extension.locals.filter(local => this.extensionManagementServerService.getExtensionManagementServer(local.location) === server)[0];
				updateAction.extension = { local, gallery: this.extension.gallery };
			}
		});
		this.enabled = this._updateActions.some(action => action.enabled);
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class MultiServerUninstallAction extends Action {

	static ID: string = 'extensions.multiserver.uninstall';

	private static readonly UninstallLabel = localize('uninstallAction', "Uninstall");
	private static readonly UninstallingLabel = localize('Uninstalling', "Uninstalling");

	private static readonly UninstallClass = 'extension-action uninstall';
	private static readonly UnInstallingClass = 'extension-action uninstall uninstalling';

	readonly actions: UninstallExtensionAction[] = [];
	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	private disposables: IDisposable[] = [];

	constructor(
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(MultiServerUninstallAction.ID, MultiServerUninstallAction.UninstallLabel, MultiServerUninstallAction.UninstallClass, false);
		this.actions = this.extensionManagementServerService.extensionManagementServers.map(server => this.instantiationService.createInstance(UninstallExtensionAction, `extensions.uninstall.${server.location.authority}`, server.location.authority, server));
		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [this.actions]);
		this.disposables.push(...[this._actionItem, ...this.actions]);
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.extension = this.extension ? this.extensionsWorkbenchService.local.filter(l => areSameExtensions({ id: l.id }, { id: this.extension.id }))[0] : this.extension));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
		} else {
			const state = this.extension.state;

			if (state === ExtensionState.Uninstalling) {
				this.label = MultiServerUninstallAction.UninstallingLabel;
				this.class = MultiServerUninstallAction.UnInstallingClass;
				this.enabled = false;
				return;
			}

			this.label = MultiServerUninstallAction.UninstallLabel;
			this.class = MultiServerUninstallAction.UninstallClass;

			const installedExtensions = this.extensionsWorkbenchService.local.filter(e => e.id === this.extension.id);

			if (!installedExtensions.length) {
				this.enabled = false;
				return;
			}

			if (installedExtensions[0].type !== LocalExtensionType.User) {
				this.enabled = false;
				return;
			}

			this.enabled = true;

			this.actions.forEach((installAction, index) => {
				const server = this.extensionManagementServerService.extensionManagementServers[index];
				installAction.extension = this.extension.locals.filter(local => this.extensionManagementServerService.getExtensionManagementServer(local.location) === server)[0];
			});
		}
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DropDownMenuActionItem extends ActionItem {

	private disposables: IDisposable[] = [];

	private _menuActionGroups: IAction[][];
	get menuActionGroups(): IAction[][] { return this._menuActionGroups; }
	set menuActionGroups(menuActionGroups: IAction[][]) { this._menuActionGroups = menuActionGroups; }

	constructor(action: IAction, menuActionGroups: IAction[][],
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super(null, action, { icon: true, label: true });
		this.menuActionGroups = menuActionGroups;
	}

	public showMenu(): void {
		const actions = this.getActions();
		let elementPosition = DOM.getDomNodePagePosition(this.builder.getHTMLElement());
		const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions),
			actionRunner: this.actionRunner
		});
	}

	private getActions(): IAction[] {
		let actions: IAction[] = [];
		const menuActionGroups = this.menuActionGroups;
		for (const menuActions of menuActionGroups) {
			actions = [...actions, ...menuActions, new Separator()];
		}
		return actions.length ? actions.slice(0, actions.length - 1) : actions;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ManageExtensionAction extends Action {

	static readonly ID = 'extensions.manage';

	private static readonly Class = 'extension-action manage';
	private static readonly HideManageExtensionClass = `${ManageExtensionAction.Class} hide`;

	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionManagementServerService private extensionManagmentServerService: IExtensionManagementServerService
	) {
		super(ManageExtensionAction.ID);

		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, this.createMenuActionGroups());
		this.disposables.push(this._actionItem);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private createMenuActionGroups(): IAction[][] {
		const groups: IAction[][] = [];
		groups.push([
			this.instantiationService.createInstance(EnableGloballyAction, EnableGloballyAction.LABEL),
			this.instantiationService.createInstance(EnableForWorkspaceAction, EnableForWorkspaceAction.LABEL)
		]);
		groups.push([
			this.instantiationService.createInstance(DisableGloballyAction, DisableGloballyAction.LABEL),
			this.instantiationService.createInstance(DisableForWorkspaceAction, DisableForWorkspaceAction.LABEL)
		]);
		if (this.extensionManagmentServerService.extensionManagementServers.length > 1) {
			groups.push([this.instantiationService.createInstance(MultiServerInstallSubMenuAction)]);
			groups.push([this.instantiationService.createInstance(MultiServerUnInstallSubMenuAction)]);
		} else {
			groups.push([this.instantiationService.createInstance(UninstallAction)]);
		}
		return groups;
	}

	private update(): void {
		this.class = ManageExtensionAction.HideManageExtensionClass;
		this.tooltip = '';
		this.enabled = false;
		if (this.extension) {
			const state = this.extension.state;
			this.enabled = state === ExtensionState.Installed;
			this.class = this.enabled || state === ExtensionState.Uninstalling ? ManageExtensionAction.Class : ManageExtensionAction.HideManageExtensionClass;
			this.tooltip = state === ExtensionState.Uninstalling ? localize('ManageExtensionAction.uninstallingTooltip', "Uninstalling") : '';
		}
		const menuActionGroups = this.createMenuActionGroups();
		for (const actions of menuActionGroups) {
			for (const action of actions) {
				(<IExtensionAction>action).extension = this.extension;
			}
		}
		this._actionItem.menuActionGroups = menuActionGroups;
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableForWorkspaceAction extends Action implements IExtensionAction {

	static readonly ID = 'extensions.enableForWorkspace';
	static LABEL = localize('enableForWorkspaceAction', "Enable (Workspace)");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(EnableForWorkspaceAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.disposables.push(this.workspaceContextService.onDidChangeWorkbenchState(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = false;
		if (this.extension) {
			this.enabled = (this.extension.enablementState === EnablementState.Disabled || this.extension.enablementState === EnablementState.WorkspaceDisabled) && this.extension.local && this.extensionEnablementService.canChangeEnablement(this.extension.local);
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.WorkspaceEnabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableGloballyAction extends Action implements IExtensionAction {

	static readonly ID = 'extensions.enableGlobally';
	static LABEL = localize('enableGloballyAction', "Enable");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(EnableGloballyAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = false;
		if (this.extension) {
			this.enabled = (this.extension.enablementState === EnablementState.Disabled || this.extension.enablementState === EnablementState.WorkspaceDisabled) && this.extension.local && this.extensionEnablementService.canChangeEnablement(this.extension.local);
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.Enabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAction extends Action {

	static readonly ID = 'extensions.enable';
	private static readonly EnabledClass = 'extension-action prominent enable';
	private static readonly DisabledClass = `${EnableAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];

	private _enableActions: IExtensionAction[];

	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }


	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(EnableAction.ID, localize('enableAction', "Enable"), EnableAction.DisabledClass, false);

		this._enableActions = [
			instantiationService.createInstance(EnableGloballyAction, EnableGloballyAction.LABEL),
			instantiationService.createInstance(EnableForWorkspaceAction, EnableForWorkspaceAction.LABEL)
		];
		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [this._enableActions]);
		this.disposables.push(this._actionItem);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		for (const actions of this._actionItem.menuActionGroups) {
			for (const action of actions) {
				(<IExtensionAction>action).extension = this.extension;
			}
		}

		if (!this.extension) {
			this.enabled = false;
			this.class = EnableAction.DisabledClass;
			return;
		}

		this.enabled = this.extension.state === ExtensionState.Installed && this._enableActions.some(e => e.enabled);
		this.class = this.enabled ? EnableAction.EnabledClass : EnableAction.DisabledClass;
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}

}

export class DisableForWorkspaceAction extends Action implements IExtensionAction {

	static readonly ID = 'extensions.disableForWorkspace';
	static LABEL = localize('disableForWorkspaceAction', "Disable (Workspace)");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(DisableForWorkspaceAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = false;
		if (this.extension && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			this.enabled = (this.extension.enablementState === EnablementState.Enabled || this.extension.enablementState === EnablementState.WorkspaceEnabled) && this.extension.local && this.extensionEnablementService.canChangeEnablement(this.extension.local);
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.WorkspaceDisabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DisableGloballyAction extends Action implements IExtensionAction {

	static readonly ID = 'extensions.disableGlobally';
	static LABEL = localize('disableGloballyAction', "Disable");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(DisableGloballyAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = false;
		if (this.extension) {
			this.enabled = (this.extension.enablementState === EnablementState.Enabled || this.extension.enablementState === EnablementState.WorkspaceEnabled) && this.extension.local && this.extensionEnablementService.canChangeEnablement(this.extension.local);
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.Disabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DisableAction extends Action {

	static readonly ID = 'extensions.disable';

	private static readonly EnabledClass = 'extension-action disable';
	private static readonly DisabledClass = `${DisableAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];
	private _disableActions: IExtensionAction[];
	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }


	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(DisableAction.ID, localize('disableAction', "Disable"), DisableAction.DisabledClass, false);
		this._disableActions = [
			instantiationService.createInstance(DisableGloballyAction, DisableGloballyAction.LABEL),
			instantiationService.createInstance(DisableForWorkspaceAction, DisableForWorkspaceAction.LABEL)
		];
		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [this._disableActions]);
		this.disposables.push(this._actionItem);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		for (const actions of this._actionItem.menuActionGroups) {
			for (const action of actions) {
				(<IExtensionAction>action).extension = this.extension;
			}
		}

		if (!this.extension) {
			this.enabled = false;
			this.class = DisableAction.DisabledClass;
			return;
		}

		this.enabled = this.extension.state === ExtensionState.Installed && this._disableActions.some(a => a.enabled);
		this.class = this.enabled ? DisableAction.EnabledClass : DisableAction.DisabledClass;
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class CheckForUpdatesAction extends Action {

	static readonly ID = 'workbench.extensions.action.checkForUpdates';
	static LABEL = localize('checkForUpdates', "Check for Updates");

	constructor(
		id = UpdateAllAction.ID,
		label = UpdateAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, '', true);
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.checkForUpdates();
	}
}

export class ToggleAutoUpdateAction extends Action {

	constructor(
		id: string,
		label: string,
		private autoUpdateValue: boolean,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label, '', true);
		this.updateEnablement();
		configurationService.onDidChangeConfiguration(() => this.updateEnablement());
	}

	private updateEnablement(): void {
		this.enabled = this.configurationService.getValue(AutoUpdateConfigurationKey) !== this.autoUpdateValue;
	}

	run(): TPromise<any> {
		return this.configurationService.updateValue(AutoUpdateConfigurationKey, this.autoUpdateValue);
	}
}

export class EnableAutoUpdateAction extends ToggleAutoUpdateAction {

	static readonly ID = 'workbench.extensions.action.enableAutoUpdate';
	static LABEL = localize('enableAutoUpdate', "Enable Auto Updating Extensions");

	constructor(
		id = EnableAutoUpdateAction.ID,
		label = EnableAutoUpdateAction.LABEL,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, true, configurationService);
	}
}

export class DisableAutoUpdateAction extends ToggleAutoUpdateAction {

	static readonly ID = 'workbench.extensions.action.disableAutoUpdate';
	static LABEL = localize('disableAutoUpdate', "Disable Auto Updating Extensions");

	constructor(
		id = EnableAutoUpdateAction.ID,
		label = EnableAutoUpdateAction.LABEL,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, false, configurationService);
	}
}

export class UpdateAllAction extends Action {

	static readonly ID = 'workbench.extensions.action.updateAllExtensions';
	static LABEL = localize('updateAll', "Update All Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id = UpdateAllAction.ID,
		label = UpdateAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@INotificationService private notificationService: INotificationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(id, label, '', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private get outdated(): IExtension[] {
		return this.extensionsWorkbenchService.local.filter(e => e.outdated && e.state !== ExtensionState.Installing);
	}

	private update(): void {
		this.enabled = this.outdated.length > 0;
	}

	run(): TPromise<any> {
		return TPromise.join(this.outdated.map(e => this.install(e)));
	}

	private install(extension: IExtension): TPromise<void> {
		return this.extensionsWorkbenchService.install(extension).then(null, err => {
			if (!extension.gallery) {
				return this.notificationService.error(err);
			}

			console.error(err);

			promptDownloadManually(extension.gallery, localize('failedToUpdate', "Failed to update \'{0}\'.", extension.id), this.instantiationService, this.notificationService, this.openerService);
		});
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ReloadAction extends Action {

	private static readonly EnabledClass = 'extension-action reload';
	private static readonly DisabledClass = `${ReloadAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	reloadMessage: string = '';
	private throttler: Throttler;

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWindowService private windowService: IWindowService,
		@IExtensionService private extensionService: IExtensionService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService
	) {
		super('extensions.reload', localize('reloadAction', "Reload"), ReloadAction.DisabledClass, false);
		this.throttler = new Throttler();

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.throttler.queue(() => {
			this.enabled = false;
			this.tooltip = '';
			this.reloadMessage = '';
			if (!this.extension) {
				return TPromise.wrap<void>(null);
			}
			const state = this.extension.state;
			if (state === ExtensionState.Installing || state === ExtensionState.Uninstalling) {
				return TPromise.wrap<void>(null);
			}
			return this.extensionService.getExtensions()
				.then(runningExtensions => this.computeReloadState(runningExtensions));
		}).done(() => {
			this.class = this.enabled ? ReloadAction.EnabledClass : ReloadAction.DisabledClass;
		});
	}

	private computeReloadState(runningExtensions: IExtensionDescription[]): void {
		const installed = this.extensionsWorkbenchService.local.filter(e => e.id === this.extension.id)[0];
		const isUninstalled = this.extension.state === ExtensionState.Uninstalled;
		const isDisabled = this.extension.local ? !this.extensionEnablementService.isEnabled(this.extension.local) : false;
		const runningExtension = runningExtensions.filter(e => areSameExtensions(e, this.extension))[0];

		if (installed && installed.local) {
			if (runningExtension) {
				const runningExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(runningExtension.extensionLocation);
				const installedExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(installed.local.location);
				const isSameLocation = runningExtensionServer.location.toString() === installedExtensionServer.location.toString();
				if (isSameLocation) {
					const isDifferentVersionRunning = this.extension.version !== runningExtension.version;
					if (isDifferentVersionRunning && !isDisabled) {
						// Requires reload to run the updated extension
						this.enabled = true;
						this.tooltip = localize('postUpdateTooltip', "Reload to update");
						this.reloadMessage = localize('postUpdateMessage', "Reload this window to activate the updated extension '{0}'?", this.extension.displayName);
						return;
					}
					if (isDisabled) {
						// Requires reload to disable the extension
						this.enabled = true;
						this.tooltip = localize('postDisableTooltip', "Reload to deactivate");
						this.reloadMessage = localize('postDisableMessage', "Reload this window to deactivate the extension '{0}'?", this.extension.displayName);
						return;
					}
				}
				return;
			} else {
				if (!isDisabled) {
					// Requires reload to enable the extension
					this.enabled = true;
					this.tooltip = localize('postEnableTooltip', "Reload to activate");
					this.reloadMessage = localize('postEnableMessage', "Reload this window to activate the extension '{0}'?", this.extension.displayName);
					return;
				}
			}
			return;
		}

		if (isUninstalled && runningExtension) {
			// Requires reload to deactivate the extension
			this.enabled = true;
			this.tooltip = localize('postUninstallTooltip', "Reload to deactivate");
			this.reloadMessage = localize('postUninstallMessage', "Reload this window to deactivate the uninstalled extension '{0}'?", this.extension.displayName);
			return;
		}
	}

	run(): TPromise<any> {
		return this.windowService.reloadWindow();
	}
}

export class OpenExtensionsViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleExtensionsViewlet', "Show Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService);
	}
}

export class InstallExtensionsAction extends OpenExtensionsViewletAction {
	static ID = 'workbench.extensions.action.installExtensions';
	static LABEL = localize('installExtensions', "Install Extensions");
}

export class ShowEnabledExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showEnabledExtensions';
	static LABEL = localize('showEnabledExtensions', 'Show Enabled Extensions');

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@enabled ');
				viewlet.focus();
			});
	}
}

export class ShowInstalledExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showInstalledExtensions';
	static LABEL = localize('showInstalledExtensions', "Show Installed Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@installed ');
				viewlet.focus();
			});
	}
}

export class ShowDisabledExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showDisabledExtensions';
	static LABEL = localize('showDisabledExtensions', "Show Disabled Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, 'null', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@disabled ');
				viewlet.focus();
			});
	}
}

export class ClearExtensionsInputAction extends Action {

	static readonly ID = 'workbench.extensions.action.clearExtensionsInput';
	static LABEL = localize('clearExtensionsInput', "Clear Extensions Input");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, 'clear-extensions', true);
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		this.enabled = !!value;
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('');
				viewlet.focus();
			});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class ShowBuiltInExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.listBuiltInExtensions';
	static LABEL = localize('showBuiltInExtensions', "Show Built-in Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@builtin ');
				viewlet.focus();
			});
	}
}

export class ShowOutdatedExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.listOutdatedExtensions';
	static LABEL = localize('showOutdatedExtensions', "Show Outdated Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@outdated ');
				viewlet.focus();
			});
	}
}

export class ShowPopularExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showPopularExtensions';
	static LABEL = localize('showPopularExtensions', "Show Popular Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs ');
				viewlet.focus();
			});
	}
}

export class ShowRecommendedExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showRecommendedExtensions';
	static LABEL = localize('showRecommendedExtensions', "Show Recommended Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended ');
				viewlet.focus();
			});
	}
}

export class InstallWorkspaceRecommendedExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.installWorkspaceRecommendedExtensions';
	static LABEL = localize('installWorkspaceRecommendedExtensions', "Install All Workspace Recommended Extensions");

	private disposables: IDisposable[] = [];

	private _recommendations: IExtensionRecommendation[] = [];
	get recommendations(): IExtensionRecommendation[] { return this._recommendations; }
	set recommendations(recommendations: IExtensionRecommendation[]) { this._recommendations = recommendations; this.enabled = this._recommendations.length > 0; }

	constructor(
		id: string = InstallWorkspaceRecommendedExtensionsAction.ID,
		label: string = InstallWorkspaceRecommendedExtensionsAction.LABEL,
		recommendations: IExtensionRecommendation[],
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IViewletService private viewletService: IViewletService,
		@INotificationService private notificationService: INotificationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOpenerService private openerService: IOpenerService,
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService
	) {
		super(id, label, 'extension-action');
		this.recommendations = recommendations;
	}

	run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended ');
				viewlet.focus();
				if (this.recommendations.length === 0) {
					this.notificationService.info(localize('extensionInstalled', "The recommended extension has already been installed"));
					return TPromise.as(null);
				}

				const names = this.recommendations.map(({ extensionId }) => extensionId);
				return this.extensionGalleryService.query({ names, source: 'install-all-workspace-recommendations' }).then(pager => {
					let installPromises = [];
					let model = new PagedModel(pager);
					for (let i = 0; i < pager.total; i++) {
						installPromises.push(model.resolve(i).then(e => {
							return this.install(e);
						}));
					}
					return TPromise.join(installPromises);
				});
			});
	}

	private install(extension: IGalleryExtension): TPromise<void> {
		const servers: IExtensionManagementServer[] = [];
		const recommendation = this.recommendations.filter(r => areSameExtensions({ id: r.extensionId }, extension.identifier))[0];
		if (recommendation) {
			for (const source of recommendation.sources || []) {
				const server = getExtensionManagementServerForRecommendationSource(source, this.extensionManagementServerService, this.contextService);
				if (servers.indexOf(server) === -1) {
					servers.push(server);
				}
			}
		}
		if (!servers.length) {
			servers.push(this.extensionManagementServerService.getDefaultExtensionManagementServer());
		}
		return TPromise.join(servers.map(server => server.extensionManagementService.installFromGallery(extension).then(null, err => {
			console.error(err);
			promptDownloadManually(extension, localize('failedToInstall', "Failed to install \'{0}\'.", extension.identifier.id), this.instantiationService, this.notificationService, this.openerService);
		}))).then(() => null);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class InstallRecommendedExtensionAction extends InstallGalleryExtensionAction {

	static readonly ID = 'workbench.extensions.action.installRecommendedExtension';
	static LABEL = localize('installRecommendedExtension', "Install Recommended Extension");

	private extensionId: string;

	constructor(
		extensionId: string, server: IExtensionManagementServer,
		@IViewletService private viewletService: IViewletService,
		@INotificationService notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService
	) {
		super(InstallRecommendedExtensionAction.ID, InstallRecommendedExtensionAction.LABEL, server, notificationService, instantiationService, openerService);
		this.extensionId = extensionId;
	}

	run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended ');
				viewlet.focus();
				return this.extensionGalleryService.query({ names: [this.extensionId], source: 'install-recommendation', pageSize: 1 })
					.then(pager => {
						if (pager && pager.firstPage && pager.firstPage.length) {
							this.extension = pager.firstPage[0];
						}
						return super.run();
					});
			});
	}
}

export class IgnoreExtensionRecommendationAction extends Action {

	static readonly ID = 'extensions.ignore';

	private static readonly Class = 'extension-action ignore';

	private disposables: IDisposable[] = [];
	extension: IExtension;

	constructor(
		@IExtensionTipsService private extensionsTipsService: IExtensionTipsService,
	) {
		super(IgnoreExtensionRecommendationAction.ID, 'Ignore Recommendation');

		this.class = IgnoreExtensionRecommendationAction.Class;
		this.tooltip = localize('ignoreExtensionRecommendation', "Do not recommend this extension again");
		this.enabled = true;
	}

	public run(): TPromise<any> {
		this.extensionsTipsService.toggleIgnoredRecommendation(this.extension.id, true);
		return TPromise.as(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UndoIgnoreExtensionRecommendationAction extends Action {

	static readonly ID = 'extensions.ignore';

	private static readonly Class = 'extension-action undo-ignore';

	private disposables: IDisposable[] = [];
	extension: IExtension;

	constructor(
		@IExtensionTipsService private extensionsTipsService: IExtensionTipsService,
	) {
		super(UndoIgnoreExtensionRecommendationAction.ID, 'Undo');

		this.class = UndoIgnoreExtensionRecommendationAction.Class;
		this.tooltip = localize('undo', "Undo");
		this.enabled = true;
	}

	public run(): TPromise<any> {
		this.extensionsTipsService.toggleIgnoredRecommendation(this.extension.id, false);
		return TPromise.as(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}


export class ShowRecommendedKeymapExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showRecommendedKeymapExtensions';
	static SHORT_LABEL = localize('showRecommendedKeymapExtensionsShort', "Keymaps");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended:keymaps ');
				viewlet.focus();
			});
	}
}

export class ShowLanguageExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showLanguageExtensions';
	static SHORT_LABEL = localize('showLanguageExtensionsShort', "Language Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs category:languages ');
				viewlet.focus();
			});
	}
}

export class ShowAzureExtensionsAction extends Action {

	static readonly ID = 'workbench.extensions.action.showAzureExtensions';
	static SHORT_LABEL = localize('showAzureExtensionsShort', "Azure Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs azure ');
				viewlet.focus();
			});
	}
}

export class ChangeSortAction extends Action {

	private query: Query;
	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		private sortBy: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);

		if (sortBy === undefined) {
			throw new Error('bad arguments');
		}

		this.query = Query.parse('');
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		const query = Query.parse(value);
		this.query = new Query(query.value, this.sortBy || query.sortBy, query.groupBy);
		this.enabled = value && this.query.isValid() && !this.query.equals(query);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search(this.query.toString());
				viewlet.focus();
			});
	}
}

export class ChangeGroupAction extends Action {

	private query: Query;
	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		private groupBy: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);

		if (groupBy === undefined) {
			throw new Error('bad arguments');
		}

		this.query = Query.parse('');
		onSearchChange(this.onSearchChange, this, this.disposables);
		this.onSearchChange('');
	}

	private onSearchChange(value: string): void {
		const query = Query.parse(value);
		this.query = new Query(query.value, query.sortBy, this.groupBy || query.groupBy);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search(this.query.toString());
				viewlet.focus();
			});
	}
}

export class ConfigureRecommendedExtensionsCommandsContributor extends Disposable implements IWorkbenchContribution {

	private workspaceContextKey = new RawContextKey<boolean>('workspaceRecommendations', true);
	private workspaceFolderContextKey = new RawContextKey<boolean>('workspaceFolderRecommendations', true);
	private addToWorkspaceRecommendationsContextKey = new RawContextKey<boolean>('addToWorkspaceRecommendations', false);
	private addToWorkspaceFolderRecommendationsContextKey = new RawContextKey<boolean>('addToWorkspaceFolderRecommendations', false);

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService
	) {
		super();
		const boundWorkspaceContextKey = this.workspaceContextKey.bindTo(contextKeyService);
		boundWorkspaceContextKey.set(workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE);
		this._register(workspaceContextService.onDidChangeWorkbenchState(() => boundWorkspaceContextKey.set(workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE)));

		const boundWorkspaceFolderContextKey = this.workspaceFolderContextKey.bindTo(contextKeyService);
		boundWorkspaceFolderContextKey.set(workspaceContextService.getWorkspace().folders.length > 0);
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => boundWorkspaceFolderContextKey.set(workspaceContextService.getWorkspace().folders.length > 0)));

		const boundAddToWorkspaceRecommendationsContextKey = this.addToWorkspaceRecommendationsContextKey.bindTo(contextKeyService);
		boundAddToWorkspaceRecommendationsContextKey.set(editorService.activeEditor instanceof ExtensionsInput && workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE);
		this._register(editorService.onDidActiveEditorChange(() => boundAddToWorkspaceRecommendationsContextKey.set(
			editorService.activeEditor instanceof ExtensionsInput && workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE)));
		this._register(workspaceContextService.onDidChangeWorkbenchState(() => boundAddToWorkspaceRecommendationsContextKey.set(
			editorService.activeEditor instanceof ExtensionsInput && workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE)));

		const boundAddToWorkspaceFolderRecommendationsContextKey = this.addToWorkspaceFolderRecommendationsContextKey.bindTo(contextKeyService);
		boundAddToWorkspaceFolderRecommendationsContextKey.set(editorService.activeEditor instanceof ExtensionsInput);
		this._register(editorService.onDidActiveEditorChange(() => boundAddToWorkspaceFolderRecommendationsContextKey.set(editorService.activeEditor instanceof ExtensionsInput)));

		this.registerCommands();
	}

	private registerCommands(): void {
		CommandsRegistry.registerCommand(ConfigureWorkspaceRecommendedExtensionsAction.ID, serviceAccessor => {
			serviceAccessor.get(IInstantiationService).createInstance(ConfigureWorkspaceRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction.ID, ConfigureWorkspaceRecommendedExtensionsAction.LABEL).run();
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: ConfigureWorkspaceRecommendedExtensionsAction.ID,
				title: `${ExtensionsLabel}: ${ConfigureWorkspaceRecommendedExtensionsAction.LABEL}`,
			},
			when: this.workspaceContextKey
		});

		CommandsRegistry.registerCommand(ConfigureWorkspaceFolderRecommendedExtensionsAction.ID, serviceAccessor => {
			serviceAccessor.get(IInstantiationService).createInstance(ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceFolderRecommendedExtensionsAction.ID, ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL).run();
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: ConfigureWorkspaceFolderRecommendedExtensionsAction.ID,
				title: `${ExtensionsLabel}: ${ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL}`,
			},
			when: this.workspaceFolderContextKey
		});

		CommandsRegistry.registerCommand(AddToWorkspaceRecommendationsAction.ADD_ID, serviceAccessor => {
			serviceAccessor.get(IInstantiationService)
				.createInstance(AddToWorkspaceRecommendationsAction, AddToWorkspaceRecommendationsAction.ADD_ID, AddToWorkspaceRecommendationsAction.ADD_LABEL)
				.run(AddToWorkspaceRecommendationsAction.ADD);
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: AddToWorkspaceRecommendationsAction.ADD_ID,
				title: `${ExtensionsLabel}: ${AddToWorkspaceRecommendationsAction.ADD_LABEL}`
			},
			when: this.addToWorkspaceRecommendationsContextKey
		});

		CommandsRegistry.registerCommand(AddToWorkspaceFolderRecommendationsAction.ADD_ID, serviceAccessor => {
			serviceAccessor.get(IInstantiationService)
				.createInstance(AddToWorkspaceFolderRecommendationsAction, AddToWorkspaceFolderRecommendationsAction.ADD_ID, AddToWorkspaceFolderRecommendationsAction.ADD_LABEL)
				.run(AddToWorkspaceRecommendationsAction.ADD);
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: AddToWorkspaceFolderRecommendationsAction.ADD_ID,
				title: `${ExtensionsLabel}: ${AddToWorkspaceFolderRecommendationsAction.ADD_LABEL}`
			},
			when: this.addToWorkspaceFolderRecommendationsContextKey
		});

		CommandsRegistry.registerCommand(AddToWorkspaceRecommendationsAction.IGNORE_ID, serviceAccessor => {
			serviceAccessor.get(IInstantiationService)
				.createInstance(AddToWorkspaceRecommendationsAction, AddToWorkspaceRecommendationsAction.IGNORE_ID, AddToWorkspaceRecommendationsAction.IGNORE_LABEL)
				.run(AddToWorkspaceRecommendationsAction.IGNORE);
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: AddToWorkspaceRecommendationsAction.IGNORE_ID,
				title: `${ExtensionsLabel}: ${AddToWorkspaceRecommendationsAction.IGNORE_LABEL}`
			},
			when: this.addToWorkspaceRecommendationsContextKey
		});

		CommandsRegistry.registerCommand(AddToWorkspaceFolderRecommendationsAction.IGNORE_ID, serviceAccessor => {
			serviceAccessor.get(IInstantiationService)
				.createInstance(AddToWorkspaceFolderRecommendationsAction, AddToWorkspaceFolderRecommendationsAction.IGNORE_ID, AddToWorkspaceFolderRecommendationsAction.IGNORE_LABEL)
				.run(AddToWorkspaceRecommendationsAction.IGNORE);
		});
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: AddToWorkspaceFolderRecommendationsAction.IGNORE_ID,
				title: `${ExtensionsLabel}: ${AddToWorkspaceFolderRecommendationsAction.IGNORE_LABEL}`
			},
			when: this.addToWorkspaceFolderRecommendationsContextKey
		});
	}
}

export abstract class AbstractConfigureRecommendedExtensionsAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@IEditorService protected editorService: IEditorService,
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@ITextModelService private textModelResolverService: ITextModelService
	) {
		super(id, label, null);
	}

	protected openExtensionsFile(extensionsFileResource: URI): TPromise<any> {
		return this.getOrCreateExtensionsFile(extensionsFileResource)
			.then(({ created, content }) =>
				this.getSelectionPosition(content, extensionsFileResource, ['recommendations'])
					.then(selection => this.editorService.openEditor({
						resource: extensionsFileResource,
						options: {
							pinned: created,
							selection
						}
					})),
				error => TPromise.wrapError(new Error(localize('OpenExtensionsFile.failed', "Unable to create 'extensions.json' file inside the '.vscode' folder ({0}).", error))));
	}

	protected openWorkspaceConfigurationFile(workspaceConfigurationFile: URI): TPromise<any> {
		return this.getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile)
			.then(content => this.getSelectionPosition(content.value, content.resource, ['extensions', 'recommendations']))
			.then(selection => this.editorService.openEditor({
				resource: workspaceConfigurationFile,
				options: {
					selection,
					forceReload: true // because content has changed
				}
			}));
	}

	protected addExtensionToWorkspaceConfig(workspaceConfigurationFile: URI, extensionId: string, shouldRecommend: boolean) {
		return this.getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile)
			.then(content => {
				const extensionIdLowerCase = extensionId.toLowerCase();
				const workspaceExtensionsConfigContent: IExtensionsConfigContent = (json.parse(content.value) || {})['extensions'] || {};
				let insertInto = shouldRecommend ? workspaceExtensionsConfigContent.recommendations || [] : workspaceExtensionsConfigContent.unwantedRecommendations || [];
				let removeFrom = shouldRecommend ? workspaceExtensionsConfigContent.unwantedRecommendations || [] : workspaceExtensionsConfigContent.recommendations || [];

				if (insertInto.some(e => e.toLowerCase() === extensionIdLowerCase)) {
					return TPromise.as(null);
				}

				insertInto.push(extensionId);
				removeFrom = removeFrom.filter(x => x.toLowerCase() !== extensionIdLowerCase);

				return this.jsonEditingService.write(workspaceConfigurationFile,
					{
						key: 'extensions',
						value: {
							recommendations: shouldRecommend ? insertInto : removeFrom,
							unwantedRecommendations: shouldRecommend ? removeFrom : insertInto
						}
					},
					true);
			});
	}

	protected addExtensionToWorkspaceFolderConfig(extensionsFileResource: URI, extensionId: string, shouldRecommend: boolean): TPromise<any> {
		return this.getOrCreateExtensionsFile(extensionsFileResource)
			.then(({ content }) => {
				const extensionIdLowerCase = extensionId.toLowerCase();
				const extensionsConfigContent: IExtensionsConfigContent = json.parse(content) || {};
				let insertInto = shouldRecommend ? extensionsConfigContent.recommendations || [] : extensionsConfigContent.unwantedRecommendations || [];
				let removeFrom = shouldRecommend ? extensionsConfigContent.unwantedRecommendations || [] : extensionsConfigContent.recommendations || [];

				if (insertInto.some(e => e.toLowerCase() === extensionIdLowerCase)) {
					return TPromise.as(null);
				}

				insertInto.push(extensionId);

				let removeFromPromise = TPromise.wrap(null);
				if (removeFrom.some(e => e.toLowerCase() === extensionIdLowerCase)) {
					removeFrom = removeFrom.filter(x => x.toLowerCase() !== extensionIdLowerCase);
					removeFromPromise = this.jsonEditingService.write(extensionsFileResource,
						{
							key: shouldRecommend ? 'unwantedRecommendations' : 'recommendations',
							value: removeFrom
						},
						true);
				}

				return removeFromPromise.then(() =>
					this.jsonEditingService.write(extensionsFileResource,
						{
							key: shouldRecommend ? 'recommendations' : 'unwantedRecommendations',
							value: insertInto
						},
						true)
				);
			});
	}

	protected getWorkspaceExtensionsConfigContent(extensionsFileResource: URI): TPromise<IExtensionsConfigContent> {
		return this.fileService.resolveContent(extensionsFileResource)
			.then(content => {
				return (json.parse(content.value) || {})['extensions'] || {};
			}, err => ({ recommendations: [], unwantedRecommendations: [] }));
	}

	protected getWorkspaceFolderExtensionsConfigContent(extensionsFileResource: URI): TPromise<IExtensionsConfigContent> {
		return this.fileService.resolveContent(extensionsFileResource)
			.then(content => {
				return (<IExtensionsConfigContent>json.parse(content.value));
			}, err => ({ recommendations: [], unwantedRecommendations: [] }));
	}

	private getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile: URI): TPromise<IContent> {
		return this.fileService.resolveContent(workspaceConfigurationFile)
			.then(content => {
				const workspaceRecommendations = <IExtensionsConfigContent>json.parse(content.value)['extensions'];
				if (!workspaceRecommendations || !workspaceRecommendations.recommendations) {
					return this.jsonEditingService.write(workspaceConfigurationFile, { key: 'extensions', value: { recommendations: [] } }, true)
						.then(() => this.fileService.resolveContent(workspaceConfigurationFile));
				}
				return content;
			});
	}

	private getSelectionPosition(content: string, resource: URI, path: json.JSONPath): TPromise<ITextEditorSelection> {
		const tree = json.parseTree(content);
		const node = json.findNodeAtLocation(tree, path);
		if (node && node.parent.children[1]) {
			const recommendationsValueNode = node.parent.children[1];
			const lastExtensionNode = recommendationsValueNode.children && recommendationsValueNode.children.length ? recommendationsValueNode.children[recommendationsValueNode.children.length - 1] : null;
			const offset = lastExtensionNode ? lastExtensionNode.offset + lastExtensionNode.length : recommendationsValueNode.offset + 1;
			return this.textModelResolverService.createModelReference(resource)
				.then(reference => {
					const position = reference.object.textEditorModel.getPositionAt(offset);
					reference.dispose();
					return <ITextEditorSelection>{
						startLineNumber: position.lineNumber,
						startColumn: position.column,
						endLineNumber: position.lineNumber,
						endColumn: position.column,
					};
				});
		}
		return TPromise.as(null);
	}

	private getOrCreateExtensionsFile(extensionsFileResource: URI): TPromise<{ created: boolean, extensionsFileResource: URI, content: string }> {
		return this.fileService.resolveContent(extensionsFileResource).then(content => {
			return { created: false, extensionsFileResource, content: content.value };
		}, err => {
			return this.fileService.updateContent(extensionsFileResource, ExtensionsConfigurationInitialContent).then(() => {
				return { created: true, extensionsFileResource, content: ExtensionsConfigurationInitialContent };
			});
		});
	}
}

export class ConfigureWorkspaceRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {

	static readonly ID = 'workbench.extensions.action.configureWorkspaceRecommendedExtensions';
	static LABEL = localize('configureWorkspaceRecommendedExtensions', "Configure Recommended Extensions (Workspace)");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(id, label, contextService, fileService, editorService, jsonEditingService, textModelResolverService);
		this.contextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.update();
	}

	private update(): void {
		this.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	public run(): TPromise<any> {
		switch (this.contextService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return this.openExtensionsFile(this.contextService.getWorkspace().folders[0].toResource(paths.join('.vscode', 'extensions.json')));
			case WorkbenchState.WORKSPACE:
				return this.openWorkspaceConfigurationFile(this.contextService.getWorkspace().configuration);
		}
		return TPromise.as(null);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class ConfigureWorkspaceFolderRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {

	static readonly ID = 'workbench.extensions.action.configureWorkspaceFolderRecommendedExtensions';
	static LABEL = localize('configureWorkspaceFolderRecommendedExtensions', "Configure Recommended Extensions (Workspace Folder)");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label, contextService, fileService, editorService, jsonEditingService, textModelResolverService);
		this.contextService.onDidChangeWorkspaceFolders(() => this.update(), this, this.disposables);
		this.update();
	}

	private update(): void {
		this.enabled = this.contextService.getWorkspace().folders.length > 0;
	}

	public run(): TPromise<any> {
		const folderCount = this.contextService.getWorkspace().folders.length;
		const pickFolderPromise = folderCount === 1 ? TPromise.as(this.contextService.getWorkspace().folders[0]) : this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
		return pickFolderPromise
			.then(workspaceFolder => {
				if (workspaceFolder) {
					return this.openExtensionsFile(workspaceFolder.toResource(paths.join('.vscode', 'extensions.json')));
				}
				return null;
			});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class AddToWorkspaceFolderRecommendationsAction extends AbstractConfigureRecommendedExtensionsAction {
	static readonly ADD = true;
	static readonly IGNORE = false;
	static readonly ADD_ID = 'workbench.extensions.action.addToWorkspaceFolderRecommendations';
	static readonly ADD_LABEL = localize('addToWorkspaceFolderRecommendations', "Add to Recommended Extensions (Workspace Folder)");
	static readonly IGNORE_ID = 'workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations';
	static readonly IGNORE_LABEL = localize('addToWorkspaceFolderIgnoredRecommendations', "Ignore Recommended Extension (Workspace Folder)");

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService,
		@ICommandService private commandService: ICommandService,
		@INotificationService private notificationService: INotificationService
	) {
		super(id, label, contextService, fileService, editorService, jsonEditingService, textModelResolverService);
	}

	run(shouldRecommend: boolean): TPromise<void> {
		if (!(this.editorService.activeEditor instanceof ExtensionsInput) || !this.editorService.activeEditor.extension) {
			return TPromise.as(null);
		}
		const folders = this.contextService.getWorkspace().folders;
		if (!folders || !folders.length) {
			this.notificationService.info(localize('AddToWorkspaceFolderRecommendations.noWorkspace', 'There are no workspace folders open to add recommendations.'));
			return TPromise.as(null);
		}

		const extensionId = this.editorService.activeEditor.extension.id;
		const pickFolderPromise = folders.length === 1
			? TPromise.as(folders[0])
			: this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
		return pickFolderPromise
			.then(workspaceFolder => {
				if (!workspaceFolder) {
					return TPromise.as(null);
				}
				const configurationFile = workspaceFolder.toResource(paths.join('.vscode', 'extensions.json'));
				return this.getWorkspaceFolderExtensionsConfigContent(configurationFile).then(content => {
					const extensionIdLowerCase = extensionId.toLowerCase();
					if (shouldRecommend) {
						if ((content.recommendations || []).some(e => e.toLowerCase() === extensionIdLowerCase)) {
							this.notificationService.info(localize('AddToWorkspaceFolderRecommendations.alreadyExists', 'This extension is already present in this workspace folder\'s recommendations.'));
							return TPromise.as(null);
						}

						return this.addExtensionToWorkspaceFolderConfig(configurationFile, extensionId, shouldRecommend).then(() => {
							this.notificationService.prompt(Severity.Info,
								localize('AddToWorkspaceFolderRecommendations.success', 'The extension was successfully added to this workspace folder\'s recommendations.'),
								[{
									label: localize('viewChanges', "View Changes"),
									run: () => this.openExtensionsFile(configurationFile)
								}]);
						}, err => {
							this.notificationService.error(localize('AddToWorkspaceFolderRecommendations.failure', 'Failed to write to extensions.json. {0}', err));
						});
					}
					else {
						if ((content.unwantedRecommendations || []).some(e => e.toLowerCase() === extensionIdLowerCase)) {
							this.notificationService.info(localize('AddToWorkspaceFolderIgnoredRecommendations.alreadyExists', 'This extension is already present in this workspace folder\'s unwanted recommendations.'));
							return TPromise.as(null);
						}

						return this.addExtensionToWorkspaceFolderConfig(configurationFile, extensionId, shouldRecommend).then(() => {
							this.notificationService.prompt(Severity.Info,
								localize('AddToWorkspaceFolderIgnoredRecommendations.success', 'The extension was successfully added to this workspace folder\'s unwanted recommendations.'),
								[{
									label: localize('viewChanges', "View Changes"),
									run: () => this.openExtensionsFile(configurationFile)
								}]);
						}, err => {
							this.notificationService.error(localize('AddToWorkspaceFolderRecommendations.failure', 'Failed to write to extensions.json. {0}', err));
						});
					}
				});
			});
	}
}

export class AddToWorkspaceRecommendationsAction extends AbstractConfigureRecommendedExtensionsAction {
	static readonly ADD = true;
	static readonly IGNORE = false;
	static readonly ADD_ID = 'workbench.extensions.action.addToWorkspaceRecommendations';
	static readonly ADD_LABEL = localize('addToWorkspaceRecommendations', "Add to Recommended Extensions (Workspace)");
	static readonly IGNORE_ID = 'workbench.extensions.action.addToWorkspaceIgnoredRecommendations';
	static readonly IGNORE_LABEL = localize('addToWorkspaceIgnoredRecommendations', "Ignore Recommended Extension (Workspace)");

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService,
		@INotificationService private notificationService: INotificationService
	) {
		super(id, label, contextService, fileService, editorService, jsonEditingService, textModelResolverService);
	}

	run(shouldRecommend: boolean): TPromise<void> {
		if (!(this.editorService.activeEditor instanceof ExtensionsInput) || !this.editorService.activeEditor.extension) {
			return TPromise.as(null);
		}
		const workspaceConfig = this.contextService.getWorkspace().configuration;

		const extensionId = this.editorService.activeEditor.extension.id;

		return this.getWorkspaceExtensionsConfigContent(workspaceConfig).then(content => {
			const extensionIdLowerCase = extensionId.toLowerCase();
			if (shouldRecommend) {
				if ((content.recommendations || []).some(e => e.toLowerCase() === extensionIdLowerCase)) {
					this.notificationService.info(localize('AddToWorkspaceRecommendations.alreadyExists', 'This extension is already present in workspace recommendations.'));
					return TPromise.as(null);
				}

				return this.addExtensionToWorkspaceConfig(workspaceConfig, extensionId, shouldRecommend).then(() => {
					this.notificationService.prompt(Severity.Info,
						localize('AddToWorkspaceRecommendations.success', 'The extension was successfully added to this workspace\'s recommendations.'),
						[{
							label: localize('viewChanges', "View Changes"),
							run: () => this.openWorkspaceConfigurationFile(workspaceConfig)
						}]);

				}, err => {
					this.notificationService.error(localize('AddToWorkspaceRecommendations.failure', 'Failed to write. {0}', err));
				});
			} else {
				if ((content.unwantedRecommendations || []).some(e => e.toLowerCase() === extensionIdLowerCase)) {
					this.notificationService.info(localize('AddToWorkspaceUnwantedRecommendations.alreadyExists', 'This extension is already present in workspace unwanted recommendations.'));
					return TPromise.as(null);
				}

				return this.addExtensionToWorkspaceConfig(workspaceConfig, extensionId, shouldRecommend).then(() => {
					this.notificationService.prompt(Severity.Info,
						localize('AddToWorkspaceUnwantedRecommendations.success', 'The extension was successfully added to this workspace\'s unwanted recommendations.'),
						[{
							label: localize('viewChanges', "View Changes"),
							run: () => this.openWorkspaceConfigurationFile(workspaceConfig)
						}]);
				}, err => {
					this.notificationService.error(localize('AddToWorkspaceRecommendations.failure', 'Failed to write. {0}', err));
				});
			}
		});
	}
}

export class MaliciousStatusLabelAction extends Action {

	private static readonly Class = 'malicious-status';

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(long: boolean) {
		const tooltip = localize('malicious tooltip', "This extension was reported to be problematic.");
		const label = long ? tooltip : localize('malicious', "Malicious");
		super('extensions.install', label, '', false);
		this.tooltip = localize('malicious tooltip', "This extension was reported to be problematic.");
	}

	private update(): void {
		if (this.extension && this.extension.isMalicious) {
			this.class = `${MaliciousStatusLabelAction.Class} malicious`;
		} else {
			this.class = `${MaliciousStatusLabelAction.Class} not-malicious`;
		}
	}

	run(): TPromise<any> {
		return TPromise.as(null);
	}
}

export class DisabledStatusLabelAction extends Action {

	private static readonly Class = 'disable-status';

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	private disposables: IDisposable[] = [];
	private throttler: Throttler = new Throttler();

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super('extensions.install', localize('disabled', "Disabled"), `${DisabledStatusLabelAction.Class} hide`, false);
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.throttler.queue(() => this.extensionService.getExtensions()
			.then(runningExtensions => {
				this.class = `${DisabledStatusLabelAction.Class} hide`;
				this.tooltip = '';
				if (this.extension && !this.extension.isMalicious && !runningExtensions.some(e => e.id === this.extension.id)) {
					if (this.extension.enablementState === EnablementState.Disabled || this.extension.enablementState === EnablementState.WorkspaceDisabled) {
						this.class = `${DisabledStatusLabelAction.Class}`;
						this.tooltip = this.extension.enablementState === EnablementState.Disabled ? localize('disabled globally', "Disabled") : localize('disabled workspace', "Disabled for this Workspace");
					}
				}
			}));
	}

	run(): TPromise<any> {
		return TPromise.as(null);
	}
}

export class DisableAllAction extends Action {

	static readonly ID = 'workbench.extensions.action.disableAll';
	static LABEL = localize('disableAll', "Disable All Installed Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = DisableAllAction.ID, label: string = DisableAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label);
		this.update();
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
	}

	private update(): void {
		this.enabled = this.extensionsWorkbenchService.local.some(e => e.type === LocalExtensionType.User && (e.enablementState === EnablementState.Enabled || e.enablementState === EnablementState.WorkspaceEnabled));
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extensionsWorkbenchService.local.filter(e => e.type === LocalExtensionType.User), EnablementState.Disabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DisableAllWorkpsaceAction extends Action {

	static readonly ID = 'workbench.extensions.action.disableAllWorkspace';
	static LABEL = localize('disableAllWorkspace', "Disable All Installed Extensions for this Workspace");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = DisableAllWorkpsaceAction.ID, label: string = DisableAllWorkpsaceAction.LABEL,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label);
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.extensionsWorkbenchService.onChange(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.extensionsWorkbenchService.local.some(e => e.type === LocalExtensionType.User && (e.enablementState === EnablementState.Enabled || e.enablementState === EnablementState.WorkspaceEnabled));
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extensionsWorkbenchService.local.filter(e => e.type === LocalExtensionType.User), EnablementState.WorkspaceDisabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAllAction extends Action {

	static readonly ID = 'workbench.extensions.action.enableAll';
	static LABEL = localize('enableAll', "Enable All Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = EnableAllAction.ID, label: string = EnableAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(id, label);
		this.update();
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
	}

	private update(): void {
		this.enabled = this.extensionsWorkbenchService.local.some(e => e.local && this.extensionEnablementService.canChangeEnablement(e.local) && (e.enablementState === EnablementState.Disabled || e.enablementState === EnablementState.WorkspaceDisabled));
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extensionsWorkbenchService.local, EnablementState.Enabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAllWorkpsaceAction extends Action {

	static readonly ID = 'workbench.extensions.action.enableAllWorkspace';
	static LABEL = localize('enableAllWorkspace', "Enable All Extensions for this Workspace");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = EnableAllWorkpsaceAction.ID, label: string = EnableAllWorkpsaceAction.LABEL,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(id, label);
		this.update();
		this.extensionsWorkbenchService.onChange(() => this.update(), this, this.disposables);
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.extensionsWorkbenchService.local.some(e => e.local && this.extensionEnablementService.canChangeEnablement(e.local) && (e.enablementState === EnablementState.Disabled || e.enablementState === EnablementState.WorkspaceDisabled));
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extensionsWorkbenchService.local, EnablementState.WorkspaceEnabled);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class OpenExtensionsFolderAction extends Action {

	static readonly ID = 'workbench.extensions.action.openExtensionsFolder';
	static LABEL = localize('openExtensionsFolder', "Open Extensions Folder");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService,
		@IFileService private fileService: IFileService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		const extensionsHome = this.environmentService.extensionsPath;

		return this.fileService.resolveFile(URI.file(extensionsHome)).then(file => {
			let itemToShow: string;
			if (file.children && file.children.length > 0) {
				itemToShow = file.children[0].resource.fsPath;
			} else {
				itemToShow = paths.normalize(extensionsHome, true);
			}

			return this.windowsService.showItemInFolder(itemToShow);
		});
	}
}

export class InstallVSIXAction extends Action {

	static readonly ID = 'workbench.extensions.action.installVSIX';
	static LABEL = localize('installVSIX', "Install from VSIX...");

	constructor(
		id = InstallVSIXAction.ID,
		label = InstallVSIXAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label, 'extension-action install-vsix', true);
	}

	run(): TPromise<any> {
		return this.windowService.showOpenDialog({
			title: localize('installFromVSIX', "Install from VSIX"),
			filters: [{ name: 'VSIX Extensions', extensions: ['vsix'] }],
			properties: ['openFile'],
			buttonLabel: mnemonicButtonLabel(localize({ key: 'installButton', comment: ['&& denotes a mnemonic'] }, "&&Install"))
		}).then(result => {
			if (!result) {
				return TPromise.as(null);
			}

			return TPromise.join(result.map(vsix => this.extensionsWorkbenchService.install(vsix))).then(() => {
				this.notificationService.prompt(
					Severity.Info,
					localize('InstallVSIXAction.success', "Successfully installed the extension. Reload to enable it."),
					[{
						label: localize('InstallVSIXAction.reloadNow', "Reload Now"),
						run: () => this.windowService.reloadWindow()
					}]
				);
			});
		});
	}
}

export class ReinstallAction extends Action {

	static readonly ID = 'workbench.extensions.action.reinstall';
	static LABEL = localize('reinstall', "Reinstall Extension...");

	constructor(
		id: string = ReinstallAction.ID, label: string = ReinstallAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	get enabled(): boolean {
		return this.extensionsWorkbenchService.local.filter(l => l.type === LocalExtensionType.User && l.local).length > 0;
	}

	run(): TPromise<any> {
		return this.quickOpenService.pick(this.getEntries(), { placeHolder: localize('selectExtension', "Select Extension to Reinstall") });
	}

	private getEntries(): TPromise<IPickOpenEntry[]> {
		return this.extensionsWorkbenchService.queryLocal()
			.then(local => {
				const entries: IPickOpenEntry[] = local
					.filter(extension => extension.type === LocalExtensionType.User)
					.map(extension => {
						return <IPickOpenEntry>{
							id: extension.id,
							label: extension.displayName,
							description: extension.id,
							run: () => this.reinstallExtension(extension),
						};
					});
				return entries;
			});
	}

	private reinstallExtension(extension: IExtension): TPromise<void> {
		return this.extensionsWorkbenchService.reinstall(extension)
			.then(() => {
				this.notificationService.prompt(
					Severity.Info,
					localize('ReinstallAction.success', "Successfully reinstalled the extension."),
					[{
						label: localize('ReinstallAction.reloadNow', "Reload Now"),
						run: () => this.windowService.reloadWindow()
					}]
				);
			}, error => this.notificationService.error(error));
	}
}

CommandsRegistry.registerCommand('workbench.extensions.action.showExtensionsForLanguage', function (accessor: ServicesAccessor, fileExtension: string) {
	const viewletService = accessor.get(IViewletService);

	return viewletService.openViewlet(VIEWLET_ID, true)
		.then(viewlet => viewlet as IExtensionsViewlet)
		.then(viewlet => {
			viewlet.search(`ext:${fileExtension.replace(/^\./, '')}`);
			viewlet.focus();
		});
});

CommandsRegistry.registerCommand('workbench.extensions.action.showExtensionsWithIds', function (accessor: ServicesAccessor, extensionIds: string[]) {
	const viewletService = accessor.get(IViewletService);

	return viewletService.openViewlet(VIEWLET_ID, true)
		.then(viewlet => viewlet as IExtensionsViewlet)
		.then(viewlet => {
			const query = extensionIds
				.map(id => `@id:${id}`)
				.join(' ');
			viewlet.search(query);
			viewlet.focus();
		});
});

export const extensionButtonProminentBackground = registerColor('extensionButton.prominentBackground', {
	dark: '#327e36',
	light: '#327e36',
	hc: null
}, localize('extensionButtonProminentBackground', "Button background color for actions extension that stand out (e.g. install button)."));

export const extensionButtonProminentForeground = registerColor('extensionButton.prominentForeground', {
	dark: Color.white,
	light: Color.white,
	hc: null
}, localize('extensionButtonProminentForeground', "Button foreground color for actions extension that stand out (e.g. install button)."));

export const extensionButtonProminentHoverBackground = registerColor('extensionButton.prominentHoverBackground', {
	dark: '#28632b',
	light: '#28632b',
	hc: null
}, localize('extensionButtonProminentHoverBackground', "Button background hover color for actions extension that stand out (e.g. install button)."));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.extension .monaco-action-bar .action-item .action-label.extension-action.built-in-status { border-color: ${foregroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item .action-label.extension-action.built-in-status { border-color: ${foregroundColor}; }`);
	}

	const buttonBackgroundColor = theme.getColor(buttonBackground);
	if (buttonBackgroundColor) {
		collector.addRule(`.extension .monaco-action-bar .action-item .action-label.extension-action { background-color: ${buttonBackgroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item .action-label.extension-action { background-color: ${buttonBackgroundColor}; }`);
	}

	const buttonForegroundColor = theme.getColor(buttonForeground);
	if (buttonForegroundColor) {
		collector.addRule(`.extension .monaco-action-bar .action-item .action-label.extension-action { color: ${buttonForegroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item .action-label.extension-action { color: ${buttonForegroundColor}; }`);
	}

	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.extension .monaco-action-bar .action-item:hover .action-label.extension-action { background-color: ${buttonHoverBackgroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item:hover .action-label.extension-action { background-color: ${buttonHoverBackgroundColor}; }`);
	}

	const contrastBorderColor = theme.getColor(contrastBorder);
	if (contrastBorderColor) {
		collector.addRule(`.extension .monaco-action-bar .action-item .action-label.extension-action { border: 1px solid ${contrastBorderColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item .action-label.extension-action { border: 1px solid ${contrastBorderColor}; }`);
	}

	const extensionButtonProminentBackgroundColor = theme.getColor(extensionButtonProminentBackground);
	if (extensionButtonProminentBackground) {
		collector.addRule(`.extension .monaco-action-bar .action-item .action-label.extension-action.prominent { background-color: ${extensionButtonProminentBackgroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item .action-label.extension-action.prominent { background-color: ${extensionButtonProminentBackgroundColor}; }`);
	}

	const extensionButtonProminentForegroundColor = theme.getColor(extensionButtonProminentForeground);
	if (extensionButtonProminentForeground) {
		collector.addRule(`.extension .monaco-action-bar .action-item .action-label.extension-action.prominent { color: ${extensionButtonProminentForegroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item .action-label.extension-action.prominent { color: ${extensionButtonProminentForegroundColor}; }`);
	}

	const extensionButtonProminentHoverBackgroundColor = theme.getColor(extensionButtonProminentHoverBackground);
	if (extensionButtonProminentHoverBackground) {
		collector.addRule(`.extension .monaco-action-bar .action-item:hover .action-label.extension-action.prominent { background-color: ${extensionButtonProminentHoverBackgroundColor}; }`);
		collector.addRule(`.extension-editor .monaco-action-bar .action-item:hover .action-label.extension-action.prominent { background-color: ${extensionButtonProminentHoverBackgroundColor}; }`);
	}
});
