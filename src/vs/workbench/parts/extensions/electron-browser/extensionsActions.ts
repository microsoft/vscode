/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { assign } from 'vs/base/common/objects';
import Severity from 'vs/base/common/severity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { IExtensionManagementService, ILocalExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { extensionEquals, getTelemetryData } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';

const CloseAction = new Action('action.close', nls.localize('close', "Close"));

export class ListExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listExtensions';
	static LABEL = nls.localize('showInstalledExtensions', "Show Installed Extensions");

	constructor(
		id: string,
		label: string,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	run(): Promise {
		return this.quickOpenService.show('ext ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class InstallExtensionAction extends Action {

	static ID = 'workbench.extensions.action.installExtension';
	static LABEL = nls.localize('installExtension', "Install Extension");

	constructor(
		id: string,
		label: string,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	run(): Promise {
		return this.quickOpenService.show('ext install ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ListOutdatedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listOutdatedExtensions';
	static LABEL = nls.localize('showOutdatedExtensions', "Show Outdated Extensions");

	constructor(
		id: string,
		label: string,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	run(): Promise {
		return this.quickOpenService.show('ext update ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ListSuggestedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listSuggestedExtensions';
	static LABEL = nls.localize('showExtensionRecommendations', "Show Extension Recommendations");

	constructor(
		id: string,
		label: string,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	run(): Promise {
		return this.quickOpenService.show('ext recommend ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class InstallAction extends Action {

	constructor(
		label: string,
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@IExtensionManagementService protected extensionManagementService: IExtensionManagementService,
		@IMessageService protected messageService: IMessageService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super('extensions.install', label, 'octicon octicon-cloud-download', true);
	}

	run(extension: IGalleryExtension): TPromise<any> {
		this.enabled = false;

		return this.extensionManagementService.getInstalled()
			.then(installed => installed.some(({ manifest }) => extensionEquals(manifest, extension)))
			.then(isUpdate => {
				return this.extensionManagementService
					.install(extension)
					.then(() => this.onSuccess(extension, isUpdate), err => this.onError(err, extension, isUpdate))
					.then(() => this.enabled = true)
					.then(() => null);
			});
	}

	private onSuccess(extension: IGalleryExtension, isUpdate: boolean) {
		this.reportTelemetry(extension, isUpdate, true);
		this.messageService.show(Severity.Info, {
			message: nls.localize('success-installed', "'{0}' was successfully installed. Restart to enable it.", extension.displayName || extension.name),
			actions: [
				CloseAction,
				this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, nls.localize('restartNow', "Restart Now"))
			]
		});
	}

	private onError(err: Error, extension: IGalleryExtension, isUpdate: boolean) {
		this.reportTelemetry(extension, isUpdate, false);
		this.messageService.show(Severity.Error, err);
	}

	private reportTelemetry(extension: IGalleryExtension, isUpdate: boolean, success: boolean) {
		const event = isUpdate ? 'extensionGallery:update' : 'extensionGallery:install';
		const data = assign(getTelemetryData(extension), { success });

		this.telemetryService.publicLog(event, data);
	}
}

export class UninstallAction extends Action {

	constructor(
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@IExtensionManagementService protected extensionManagementService: IExtensionManagementService,
		@IMessageService protected messageService: IMessageService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super('extensions.uninstall', nls.localize('uninstall', "Uninstall Extension"), 'octicon octicon-x', true);
	}

	run(extension: ILocalExtension): TPromise<any> {
		const name = extension.manifest.displayName || extension.manifest.name;

		if (!window.confirm(nls.localize('deleteSure', "Are you sure you want to uninstall '{0}'?", name))) {
			return TPromise.as(null);
		}

		this.enabled = false;

		return this.extensionManagementService.getInstalled().then(localExtensions => {
			const [local] = localExtensions.filter(local => extensionEquals(local.manifest, extension.manifest));

			if (!local) {
				return TPromise.wrapError(nls.localize('notFound', "Extension '{0}' not installed.", name));
			}

			return this.extensionManagementService.uninstall(local)
				.then(() => this.onSuccess(local), err => this.onError(err, local))
				.then(() => this.enabled = true)
				.then(() => null);
		});
	}

	private onSuccess(extension: ILocalExtension) {
		const name = extension.manifest.displayName || extension.manifest.name;
		this.reportTelemetry(extension, true);

		this.messageService.show(Severity.Info, {
			message: nls.localize('success-uninstalled', "'{0}' was successfully uninstalled. Restart to deactivate it.", name),
			actions: [
				CloseAction,
				this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, nls.localize('restartNow2', "Restart Now"))
			]
		});
	}

	private onError(err: Error, extension: ILocalExtension) {
		this.reportTelemetry(extension, false);
		this.messageService.show(Severity.Error, err);
	}

	private reportTelemetry(extension: ILocalExtension, success: boolean) {
		const data = assign(getTelemetryData(extension), { success });

		this.telemetryService.publicLog('extensionGallery:uninstall', data);
	}
}
