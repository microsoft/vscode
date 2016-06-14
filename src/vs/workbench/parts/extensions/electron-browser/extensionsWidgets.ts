/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { ThrottledDelayer } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { emmet as $, append, toggleClass } from 'vs/base/browser/dom';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { onUnexpectedPromiseError } from 'vs/base/common/errors';
import { assign } from 'vs/base/common/objects';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IExtensionService, IMessage } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionManagementService, IExtensionGalleryService, ExtensionsLabel, ExtensionsChannelId, IExtension, IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { getOutdatedExtensions } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface IState {
	errors: IMessage[];
	installing: IExtensionManifest[];
	outdated: IExtension[];
}

const InitialState: IState = {
	errors: [],
	installing: [],
	outdated: []
};

function extensionEquals(one: IExtensionManifest, other: IExtensionManifest): boolean {
	return one.publisher === other.publisher && one.name === other.name;
}

const OutdatedPeriod = 12 * 60 * 60 * 1000; // every 12 hours

export class ExtensionsStatusbarItem implements IStatusbarItem {

	private domNode: HTMLElement;
	private state: IState = InitialState;
	private outdatedDelayer = new ThrottledDelayer<void>(OutdatedPeriod);

	constructor(
		@IExtensionService private extensionService: IExtensionService,
		@IOutputService private outputService: IOutputService,
		@IExtensionManagementService protected extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService protected extensionGalleryService: IExtensionGalleryService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@ITelemetryService protected telemetrService: ITelemetryService
	) {}

	render(container: HTMLElement): IDisposable {
		this.domNode = append(container, $('a.extensions-statusbar'));
		append(this.domNode, $('.icon'));
		this.domNode.onclick = () => this.onClick();

		this.checkErrors();
		this.checkOutdated();

		const disposables = [];
		this.extensionManagementService.onInstallExtension(this.onInstallExtension, this, disposables);
		this.extensionManagementService.onDidInstallExtension(this.onDidInstallExtension, this, disposables);
		this.extensionManagementService.onDidUninstallExtension(this.onDidUninstallExtension, this, disposables);

		return combinedDisposable(disposables);
	}

	private updateState(obj: any): void {
		this.state = assign(this.state, obj);
		this.onStateChange();
	}

	private get hasErrors() { return this.state.errors.length > 0; }
	private get isInstalling() { return this.state.installing.length > 0; }
	private get hasUpdates() { return this.state.outdated.length > 0; }

	private onStateChange(): void {
		toggleClass(this.domNode, 'has-errors', this.hasErrors);
		toggleClass(this.domNode, 'is-installing', !this.hasErrors && this.isInstalling);
		toggleClass(this.domNode, 'has-updates', !this.hasErrors && !this.isInstalling && this.hasUpdates);

		if (this.hasErrors) {
			const singular = nls.localize('oneIssue', "Extensions (1 issue)");
			const plural = nls.localize('multipleIssues', "Extensions ({0} issues)", this.state.errors.length);
			this.domNode.title = this.state.errors.length > 1 ? plural : singular;
		} else if (this.isInstalling) {
			this.domNode.title = nls.localize('extensionsInstalling', "Extensions ({0} installing...)", this.state.installing.length);
		} else if (this.hasUpdates) {
			const singular = nls.localize('oneUpdate', "Extensions (1 update available)");
			const plural = nls.localize('multipleUpdates', "Extensions ({0} updates available)", this.state.outdated.length);
			this.domNode.title = this.state.outdated.length > 1 ? plural : singular;
		} else {
			this.domNode.title = nls.localize('extensions', "Extensions");
		}
	}

	private onClick(): void {
		if (this.hasErrors) {
			this.telemetrService.publicLog('extensionWidgetClick', {mode : 'hasErrors'});
			this.showErrors(this.state.errors);
			this.updateState({ errors: [] });
		} else if (this.hasUpdates) {
			this.telemetrService.publicLog('extensionWidgetClick', {mode : 'hasUpdate'});
			this.quickOpenService.show(`ext update `);
		} else {
			this.telemetrService.publicLog('extensionWidgetClick', {mode : 'none'});
			this.quickOpenService.show(`>${ExtensionsLabel}: `);
		}
	}

	private showErrors(errors: IMessage[]): void {
		const promise = onUnexpectedPromiseError(this.extensionManagementService.getInstalled());
		promise.done(installed => {
			errors.forEach(m => {
				const extension = installed.filter(ext => ext.path === m.source).pop();
				const name = extension && extension.name;
				const message = name ? `${ name }: ${ m.message }` : m.message;

				const outputChannel = this.outputService.getChannel(ExtensionsChannelId);
				outputChannel.append(message);
				outputChannel.show(true);
			});
		});
	}

	private onInstallExtension(manifest: IExtensionManifest): void {
		const installing = [...this.state.installing, manifest];
		this.updateState({ installing });
	}

	private onDidInstallExtension({ extension }: { extension: IExtension; }): void {
		const installing = this.state.installing
			.filter(e => !extensionEquals(extension, e));
		this.updateState({ installing });
		this.outdatedDelayer.trigger(() => this.checkOutdated(), 0);
	}

	private onDidUninstallExtension(): void {
		this.outdatedDelayer.trigger(() => this.checkOutdated(), 0);
	}

	private checkErrors(): void {
		const promise = onUnexpectedPromiseError(this.extensionService.onReady());
		promise.done(() => {
			const status = this.extensionService.getExtensionsStatus();
			const errors = Object.keys(status)
				.map(k => status[k].messages)
				.reduce((r, m) => r.concat(m), [])
				.filter(m => m.type > Severity.Info);

			this.updateState({ errors });
		});
	}

	private checkOutdated(): TPromise<void> {
		return getOutdatedExtensions(this.extensionManagementService, this.extensionGalleryService)
			.then(null, _ => []) // ignore errors
			.then(outdated => {
				this.updateState({ outdated });

				// repeat this later
				this.outdatedDelayer.trigger(() => this.checkOutdated());
			});
	}
}