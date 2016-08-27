/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsViewlet';
import Event, { Emitter } from 'vs/base/common/event';
import { index } from 'vs/base/common/arrays';
import { assign } from 'vs/base/common/objects';
import { isUUID } from 'vs/base/common/uuid';
import { ThrottledDelayer } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IPager, mapPager, singlePagePager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions, IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from 'vs/platform/extensionManagement/common/extensionTelemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import * as semver from 'semver';
import * as path from 'path';
import URI from 'vs/base/common/uri';
import { readFile } from 'vs/base/node/pfs';
import { asText } from 'vs/base/node/request';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, IExtensionsConfiguration } from './extensions';
import { UpdateAllAction } from './extensionsActions';


interface IExtensionStateProvider {
	(extension: Extension): ExtensionState;
}

class Extension implements IExtension {

	public needsRestart = false;

	constructor(
		private galleryService: IExtensionGalleryService,
		private stateProvider: IExtensionStateProvider,
		public local: ILocalExtension,
		public gallery: IGalleryExtension = null
	) {}

	get name(): string {
		return this.local ? this.local.manifest.name : this.gallery.name;
	}

	get displayName(): string {
		if (this.local) {
			return this.local.manifest.displayName || this.local.manifest.name;
		}

		return this.gallery.displayName || this.gallery.name;
	}

	get publisher(): string {
		return this.local ? this.local.manifest.publisher : this.gallery.publisher;
	}

	get publisherDisplayName(): string {
		if (this.local) {
			if (this.local.metadata && this.local.metadata.publisherDisplayName) {
				return this.local.metadata.publisherDisplayName;
			}

			return this.local.manifest.publisher;
		}

		return this.gallery.publisherDisplayName || this.gallery.publisher;
	}

	get version(): string {
		return this.local ? this.local.manifest.version : this.gallery.version;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.version : this.local.manifest.version;
	}

	get description(): string {
		return this.local ? this.local.manifest.description : this.gallery.description;
	}

	get readmeUrl(): string {
		if (this.local && this.local.readmeUrl) {
			return this.local.readmeUrl;
		}

		return this.gallery && this.gallery.assets.readme;
	}

	get iconUrl(): string {
		return this.localIconUrl || this.galleryIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string {
		return this.localIconUrl || this.galleryIconUrlFallback || this.defaultIconUrl;
	}

	private get localIconUrl(): string {
		return this.local && this.local.manifest.icon
			&& URI.file(path.join(this.local.path, this.local.manifest.icon)).toString();
	}

	private get galleryIconUrl(): string {
		return this.gallery && this.gallery.assets.icon;
	}

	private get galleryIconUrlFallback(): string {
		return this.gallery && this.gallery.assets.iconFallback;
	}

	private get defaultIconUrl(): string {
		return require.toUrl('./media/defaultIcon.png');
	}

	get licenseUrl(): string {
		return this.gallery && this.gallery.assets.license;
	}

	get state(): ExtensionState {
		return this.stateProvider(this);
	}

	get installCount(): number {
		return this.gallery ? this.gallery.installCount : null;
	}

	get rating(): number {
		return this.gallery ? this.gallery.rating : null;
	}

	get ratingCount(): number {
		return this.gallery ? this.gallery.ratingCount : null;
	}

	get outdated(): boolean {
		return semver.gt(this.latestVersion, this.version);
	}

	get telemetryData(): any {
		const { local, gallery } = this;

		if (gallery) {
			return getGalleryExtensionTelemetryData(gallery);
		} else {
			return getLocalExtensionTelemetryData(local);
		}
	}

	getManifest(): TPromise<IExtensionManifest> {
		if (this.local) {
			return TPromise.as(this.local.manifest);
		}

		return this.galleryService.getAsset(this.gallery.assets.manifest)
			.then(asText)
			.then(raw => JSON.parse(raw) as IExtensionManifest);
	}

	getReadme(): TPromise<string> {
		const readmeUrl = this.local && this.local.readmeUrl ? this.local.readmeUrl : this.gallery && this.gallery.assets.readme;

		if (!readmeUrl) {
			return TPromise.wrapError('not available');
		}

		const uri = URI.parse(readmeUrl);

		if (uri.scheme === 'file') {
			return readFile(uri.fsPath, 'utf8');
		}

		return this.galleryService.getAsset(readmeUrl).then(asText);
	}
}

function stripVersion(id: string): string {
	return id.replace(/-\d+\.\d+\.\d+$/, '');
}

enum Operation {
	Installing,
	Updating,
	Uninstalling
}

interface IActiveExtension {
	id: string;
	operation: Operation;
	extension: Extension;
	start: Date;
}

function toTelemetryEventName(operation: Operation) {
	switch (operation) {
		case Operation.Installing: return 'extensionGallery:install';
		case Operation.Updating: return 'extensionGallery:update';
		case Operation.Uninstalling: return 'extensionGallery:uninstall';
	}

	return '';
}

export class ExtensionsWorkbenchService implements IExtensionsWorkbenchService {

	private static SyncPeriod = 1000 * 60 * 60 * 12; // 12 hours

	_serviceBrand: any;
	private stateProvider: IExtensionStateProvider;
	private installing: IActiveExtension[] = [];
	private uninstalling: IActiveExtension[] = [];
	private installed: Extension[] = [];
	private syncDelayer: ThrottledDelayer<void>;
	private disposables: IDisposable[] = [];

	private _onChange: Emitter<void> = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionManagementService private extensionService: IExtensionManagementService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.stateProvider = ext => this.getExtensionState(ext);

		this.disposables.push(extensionService.onInstallExtension(({ id, gallery }) => this.onInstallExtension(id, gallery)));
		this.disposables.push(extensionService.onDidInstallExtension(({ id, local, error }) => this.onDidInstallExtension(id, local, error)));
		this.disposables.push(extensionService.onUninstallExtension(id => this.onUninstallExtension(id)));
		this.disposables.push(extensionService.onDidUninstallExtension(id => this.onDidUninstallExtension(id)));

		this.syncDelayer = new ThrottledDelayer<void>(ExtensionsWorkbenchService.SyncPeriod);

		this.queryLocal().done(() => this.eventuallySyncWithGallery(true));
	}

	get local(): IExtension[] {
		const installing = this.installing
			.filter(e => !this.installed.some(installed => stripVersion(installed.local.id) === e.id))
			.map(e => e.extension);

		return [...this.installed, ...installing];
	}

	queryLocal(): TPromise<IExtension[]> {
		return this.extensionService.getInstalled().then(result => {
			const installedById = index(this.installed, e => e.local.id);

			this.installed = result.map(local => {
				const extension = installedById[local.id] || new Extension(this.galleryService, this.stateProvider, local);
				extension.local = local;
				return extension;
			});

			this._onChange.fire();
			return this.local;
		});
	}

	queryGallery(options: IQueryOptions = {}): TPromise<IPager<IExtension>> {
		return this.galleryService.query(options)
			.then(result => mapPager(result, gallery => this.fromGallery(gallery)))
			.then(null, err => {
				if (/No extension gallery service configured/.test(err.message)) {
					return TPromise.as(singlePagePager([]));
				}

				return TPromise.wrapError(err);
			});
	}

	private fromGallery(gallery: IGalleryExtension): Extension {
		const installedByGalleryId = index(this.installed, e => e.local.metadata ? e.local.metadata.id : '');
		const id = gallery.id;
		const installed = installedByGalleryId[id];

		if (installed) {
			installed.gallery = gallery;
			this._onChange.fire();
			return installed;
		}

		return new Extension(this.galleryService, this.stateProvider, null, gallery);
	}

	private eventuallySyncWithGallery(immediate = false): void {
		const loop = () => this.syncWithGallery().then(() => this.eventuallySyncWithGallery());
		const delay = immediate ? 0 : ExtensionsWorkbenchService.SyncPeriod;

		this.syncDelayer.trigger(loop, delay);
	}

	private syncWithGallery(): TPromise<void> {
		const ids = this.installed
			.filter(e => !!(e.local && e.local.metadata))
			.map(e => e.local.metadata.id)
			.filter(id => isUUID(id));

		if (ids.length === 0) {
			return TPromise.as(null);
		}

		return this.queryGallery({ ids, pageSize: ids.length }).then(() => {
			const config = this.configurationService.getConfiguration<IExtensionsConfiguration>('extensions');

			if (!config.autoUpdate) {
				return;
			}

			const action = this.instantiationService.createInstance(UpdateAllAction);
			return action.enabled && action.run();
		});
	}

	canInstall(extension: IExtension): boolean {
		if (!(extension instanceof Extension)) {
			return;
		}

		return !!(extension as Extension).gallery;
	}

	install(extension: IExtension): TPromise<void> {
		if (!(extension instanceof Extension)) {
			return;
		}

		const ext = extension as Extension;
		const gallery = ext.gallery;

		if (!gallery) {
			return TPromise.wrapError<void>(new Error('Missing gallery'));
		}

		return this.extensionService.installFromGallery(gallery);
	}

	uninstall(extension: IExtension): TPromise<void> {
		if (!(extension instanceof Extension)) {
			return;
		}

		const ext = extension as Extension;
		const local = ext.local || this.installed.filter(e => e.local.metadata && ext.gallery && e.local.metadata.id === ext.gallery.id)[0].local;

		if (!local) {
			return TPromise.wrapError<void>(new Error('Missing local'));
		}

		return this.extensionService.uninstall(local);
	}

	private onInstallExtension(id: string, gallery: IGalleryExtension): void {
		if (!gallery) {
			return;
		}

		let extension = this.installed.filter(e => (e.local.metadata && e.local.metadata.id) === gallery.id)[0];

		if (!extension) {
			extension = new Extension(this.galleryService, this.stateProvider, null, gallery);
		}

		extension.gallery = gallery;

		const start = new Date();
		const operation = Operation.Installing;
		this.installing.push({ id: stripVersion(id), operation, extension, start });

		this._onChange.fire();
	}

	private onDidInstallExtension(id: string, local: ILocalExtension, error: Error): void {
		id = stripVersion(id);

		const installing = this.installing.filter(e => e.id === id)[0];

		if (!installing) {
			return;
		}

		const extension = installing.extension;
		extension.local = local;
		extension.needsRestart = true;

		let eventName: string = 'extensionGallery:install';
		this.installing = this.installing.filter(e => e.id !== id);

		if (!error) {
			const galleryId = local.metadata && local.metadata.id;
			const installed = this.installed.filter(e => (e.local.metadata && e.local.metadata.id) === galleryId)[0];

			if (galleryId && installed) {
				eventName = 'extensionGallery:update';
				installed.local = local;
			} else {
				this.installed.push(extension);
			}
		}

		this.reportTelemetry(installing, !error);
		this._onChange.fire();
	}

	private onUninstallExtension(id: string): void {
		const previousLength = this.installed.length;
		const extension = this.installed.filter(e => e.local.id === id)[0];
		this.installed = this.installed.filter(e => e.local.id !== id);

		if (previousLength === this.installed.length) {
			return;
		}

		const start = new Date();
		const operation = Operation.Uninstalling;
		const uninstalling = this.uninstalling.filter(e => e.id === id)[0] || { id, operation, extension, start };
		this.uninstalling = [uninstalling, ...this.uninstalling.filter(e => e.id !== id)];

		this._onChange.fire();
	}

	private onDidUninstallExtension(id: string): void {
		const uninstalling = this.uninstalling.filter(e => e.id === id)[0];
		this.uninstalling = this.uninstalling.filter(e => e.id !== id);

		if (!uninstalling) {
			return;
		}

		this.reportTelemetry(uninstalling, true);
	}

	private getExtensionState(extension: Extension): ExtensionState {
		if (extension.gallery && this.installing.some(e => e.extension.gallery.id === extension.gallery.id)) {
			return ExtensionState.Installing;
		}

		const local = this.installed.filter(e => e === extension || (e.gallery && extension.gallery && e.gallery.id === extension.gallery.id))[0];

		if (local) {
			return local.needsRestart ? ExtensionState.NeedsRestart : ExtensionState.Installed;
		}

		return ExtensionState.Uninstalled;
	}

	private reportTelemetry(active: IActiveExtension, success: boolean): void {
		const data = active.extension.telemetryData;
		const duration = new Date().getTime() - active.start.getTime();
		const eventName = toTelemetryEventName(active.operation);

		this.telemetryService.publicLog(eventName, assign(data, { success, duration }));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}