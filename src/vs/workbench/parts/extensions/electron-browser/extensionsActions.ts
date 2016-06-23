/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionActions';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
// import { assign } from 'vs/base/common/objects';
// import Severity from 'vs/base/common/severity';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
// import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
// import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
// import { IMessageService } from 'vs/platform/message/common/message';
// import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { IExtension, ExtensionState, IExtensionsWorkbenchService } from './extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
// import { extensionEquals, getTelemetryData } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
// import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';

// const CloseAction = new Action('action.close', nls.localize('close', "Close"));

// export class ListExtensionsAction extends Action {

// 	static ID = 'workbench.extensions.action.listExtensions';
// 	static LABEL = nls.localize('showInstalledExtensions', "Show Installed Extensions");

// 	constructor(
// 		id: string,
// 		label: string,
// 		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
// 		@IQuickOpenService private quickOpenService: IQuickOpenService
// 	) {
// 		super(id, label, null, true);
// 	}

// 	run(): Promise {
// 		return this.quickOpenService.show('ext ');
// 	}

// 	protected isEnabled(): boolean {
// 		return true;
// 	}
// }

// export class InstallExtensionAction extends Action {

// 	static ID = 'workbench.extensions.action.installExtension';
// 	static LABEL = nls.localize('installExtension', "Install Extension");

// 	constructor(
// 		id: string,
// 		label: string,
// 		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
// 		@IQuickOpenService private quickOpenService: IQuickOpenService
// 	) {
// 		super(id, label, null, true);
// 	}

// 	run(): Promise {
// 		return this.quickOpenService.show('ext install ');
// 	}

// 	protected isEnabled(): boolean {
// 		return true;
// 	}
// }

// export class ListOutdatedExtensionsAction extends Action {

// 	static ID = 'workbench.extensions.action.listOutdatedExtensions';
// 	static LABEL = nls.localize('showOutdatedExtensions', "Show Outdated Extensions");

// 	constructor(
// 		id: string,
// 		label: string,
// 		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
// 		@IQuickOpenService private quickOpenService: IQuickOpenService
// 	) {
// 		super(id, label, null, true);
// 	}

// 	run(): Promise {
// 		return this.quickOpenService.show('ext update ');
// 	}

// 	protected isEnabled(): boolean {
// 		return true;
// 	}
// }

// export class ListSuggestedExtensionsAction extends Action {

// 	static ID = 'workbench.extensions.action.listSuggestedExtensions';
// 	static LABEL = nls.localize('showExtensionRecommendations', "Show Extension Recommendations");

// 	constructor(
// 		id: string,
// 		label: string,
// 		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
// 		@IQuickOpenService private quickOpenService: IQuickOpenService
// 	) {
// 		super(id, label, null, true);
// 	}

// 	run(): Promise {
// 		return this.quickOpenService.show('ext recommend ');
// 	}

// 	protected isEnabled(): boolean {
// 		return true;
// 	}
// }

export class InstallAction extends Action {

	private static InstallLabel = nls.localize('installAction', "Install");
	private static InstallingLabel = nls.localize('installing', "Installing");
	private disposables: IDisposable[] = [];

	constructor(
		private extension: IExtension,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.install', InstallAction.InstallLabel, 'extension-action install', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = this.extensionsWorkbenchService.canInstall(this.extension) && this.extension.state === ExtensionState.Uninstalled;
		this.label = this.extension.state === ExtensionState.Installing ? InstallAction.InstallingLabel : InstallAction.InstallLabel;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.install(this.extension);

		// this.enabled = false;

		// return this.extensionManagementService.getInstalled()
		// 	.then(installed => installed.some(({ manifest }) => extensionEquals(manifest, extension)))
		// 	.then(isUpdate => {
		// 		return this.extensionManagementService
		// 			.install(extension)
		// 			.then(() => this.onSuccess(extension, isUpdate), err => this.onError(err, extension, isUpdate))
		// 			.then(() => this.enabled = true)
		// 			.then(() => null);
		// 	});
	}

	// private onSuccess(extension: IGalleryExtension, isUpdate: boolean) {
	// 	this.reportTelemetry(extension, isUpdate, true);
	// 	this.messageService.show(Severity.Info, {
	// 		message: nls.localize('success-installed', "'{0}' was successfully installed. Restart to enable it.", extension.displayName || extension.name),
	// 		actions: [
	// 			CloseAction,
	// 			this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, nls.localize('restartNow', "Restart Now"))
	// 		]
	// 	});
	// }

	// private onError(err: Error, extension: IGalleryExtension, isUpdate: boolean) {
	// 	this.reportTelemetry(extension, isUpdate, false);
	// 	this.messageService.show(Severity.Error, err);
	// }

	// private reportTelemetry(extension: IGalleryExtension, isUpdate: boolean, success: boolean) {
	// 	const event = isUpdate ? 'extensionGallery:update' : 'extensionGallery:install';
	// 	const data = assign(getTelemetryData(extension), { success });

	// 	this.telemetryService.publicLog(event, data);
	// }

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UninstallAction extends Action {

	private disposables: IDisposable[] = [];

	constructor(
		private extension: IExtension,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.uninstall', nls.localize('uninstall', "Uninstall"), 'extension-action uninstall', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.updateEnablement()));
		this.updateEnablement();
	}

	private updateEnablement(): void {
		this.enabled = this.extension.state === ExtensionState.Installed;
	}

	run(): TPromise<any> {
		// const name = extension.manifest.displayName || extension.manifest.name;

		if (!window.confirm(nls.localize('deleteSure', "Are you sure you want to uninstall '{0}'?", this.extension.displayName))) {
			return TPromise.as(null);
		}

		return this.extensionsWorkbenchService.uninstall(this.extension);

		// this.enabled = false;

		// return this.extensionManagementService.getInstalled().then(localExtensions => {
		// 	const [local] = localExtensions.filter(local => extensionEquals(local.manifest, extension.manifest));

		// 	if (!local) {
		// 		return TPromise.wrapError(nls.localize('notFound', "Extension '{0}' not installed.", name));
		// 	}

		// 	return this.extensionManagementService.uninstall(local)
		// 		.then(() => this.onSuccess(local), err => this.onError(err, local))
		// 		.then(() => this.enabled = true)
		// 		.then(() => null);
		// });
	}

// 	private onSuccess(extension: ILocalExtension) {
// 		const name = extension.manifest.displayName || extension.manifest.name;
// 		this.reportTelemetry(extension, true);

// 		this.messageService.show(Severity.Info, {
// 			message: nls.localize('success-uninstalled', "'{0}' was successfully uninstalled. Restart to deactivate it.", name),
// 			actions: [
// 				CloseAction,
// 				this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, nls.localize('restartNow2', "Restart Now"))
// 			]
// 		});
// 	}

// 	private onError(err: Error, extension: ILocalExtension) {
// 		this.reportTelemetry(extension, false);
// 		this.messageService.show(Severity.Error, err);
// 	}

// 	private reportTelemetry(extension: ILocalExtension, success: boolean) {
// 		const data = assign(getTelemetryData(extension), { success });

// 		this.telemetryService.publicLog('extensionGallery:uninstall', data);
// 	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class CombinedInstallAction extends Action {

	private installAction: InstallAction;
	private uninstallAction: UninstallAction;
	private disposables: IDisposable[] = [];

	constructor(
		private extension: IExtension,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.combinedInstall', '', '', false);

		this.installAction = instantiationService.createInstance(InstallAction, extension);
		this.uninstallAction = instantiationService.createInstance(UninstallAction, extension);
		this.disposables.push(this.installAction, this.uninstallAction);

		this.disposables.push(this.installAction.addListener2(Action.ENABLED, () => this.update()));
		this.disposables.push(this.installAction.addListener2(Action.LABEL, () => this.update()));
		this.disposables.push(this.uninstallAction.addListener2(Action.ENABLED, () => this.update()));
		this.update();
	}

	private update(): void {
		if (this.installAction.enabled) {
			this.enabled = true;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		} else if (this.uninstallAction.enabled) {
			this.enabled = true;
			this.label = this.uninstallAction.label;
			this.class = this.uninstallAction.class;
		} else if (this.extension.state === ExtensionState.Installing) {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		} else {
			this.enabled = false;
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

	private static EnabledClass = 'extension-action update';
	private static DisabledClass = `${ UpdateAction.EnabledClass } disabled`;

	private disposables: IDisposable[] = [];

	constructor(
		private extension: IExtension,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.update', nls.localize('updateAction', "Update"), UpdateAction.DisabledClass, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.updateEnablement()));
		this.updateEnablement();
	}

	private updateEnablement(): void {
		const canInstall = this.extensionsWorkbenchService.canInstall(this.extension);
		const isInstalled = this.extension.state === ExtensionState.Installed;

		this.enabled = canInstall && isInstalled && this.extension.outdated;
		this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.install(this.extension);

		// this.enabled = false;

		// return this.extensionManagementService.getInstalled()
		// 	.then(installed => installed.some(({ manifest }) => extensionEquals(manifest, extension)))
		// 	.then(isUpdate => {
		// 		return this.extensionManagementService
		// 			.install(extension)
		// 			.then(() => this.onSuccess(extension, isUpdate), err => this.onError(err, extension, isUpdate))
		// 			.then(() => this.enabled = true)
		// 			.then(() => null);
		// 	});
	}

	// private onSuccess(extension: IGalleryExtension, isUpdate: boolean) {
	// 	this.reportTelemetry(extension, isUpdate, true);
	// 	this.messageService.show(Severity.Info, {
	// 		message: nls.localize('success-installed', "'{0}' was successfully installed. Restart to enable it.", extension.displayName || extension.name),
	// 		actions: [
	// 			CloseAction,
	// 			this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, nls.localize('restartNow', "Restart Now"))
	// 		]
	// 	});
	// }

	// private onError(err: Error, extension: IGalleryExtension, isUpdate: boolean) {
	// 	this.reportTelemetry(extension, isUpdate, false);
	// 	this.messageService.show(Severity.Error, err);
	// }

	// private reportTelemetry(extension: IGalleryExtension, isUpdate: boolean, success: boolean) {
	// 	const event = isUpdate ? 'extensionGallery:update' : 'extensionGallery:install';
	// 	const data = assign(getTelemetryData(extension), { success });

	// 	this.telemetryService.publicLog(event, data);
	// }

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}