/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsViewlet';
import Event, { Emitter } from 'vs/base/common/event';
import { index } from 'vs/base/common/arrays';
import { assign } from 'vs/base/common/objects';
import { ThrottledDelayer } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IPager, mapPager, singlePagePager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, ILocalExtension, IGalleryExtension, IQueryOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import * as semver from 'semver';
import * as path from 'path';
import URI from 'vs/base/common/uri';
import { IExtension, ExtensionState, IExtensionsWorkbenchService } from './extensions';

interface IExtensionStateProvider {
	(extension: Extension): ExtensionState;
}

class Extension implements IExtension {

	public needsRestart = false;

	constructor(
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
		return this.local ? this.local.manifest.version : this.gallery.versions[0].version;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.versions[0].version : this.local.manifest.version;
	}

	get description(): string {
		return this.local ? this.local.manifest.description : this.gallery.description;
	}

	get readmeUrl(): string {
		if (this.local && this.local.readmeUrl) {
			return this.local.readmeUrl;
		}

		if (this.gallery && this.gallery.versions[0].readmeUrl) {
			return this.gallery.versions[0].readmeUrl;
		}

		return null;
	}

	get iconUrl(): string {
		if (this.local && this.local.manifest.icon) {
			return URI.file(path.join(this.local.path, this.local.manifest.icon)).toString();
		}

		if (this.gallery && this.gallery.versions[0].iconUrl) {
			return this.gallery.versions[0].iconUrl;
		}

		return require.toUrl('./media/defaultIcon.png');
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
}

export class ExtensionsWorkbenchService implements IExtensionsWorkbenchService {

	private static SyncPeriod = 1000 * 60 * 60 * 12; // 12 hours

	_serviceBrand: any;
	private stateProvider: IExtensionStateProvider;
	private installing: { id: string; extension: Extension; }[] = [];
	private installed: Extension[] = [];
	private syncDelayer: ThrottledDelayer<void>;
	private disposables: IDisposable[] = [];

	private _onChange: Emitter<void> = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	constructor(
		@IExtensionManagementService private extensionService: IExtensionManagementService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IExtensionTipsService private tipsService: IExtensionTipsService
	) {
		this.stateProvider = ext => this.getExtensionState(ext);

		this.disposables.push(extensionService.onInstallExtension(({ id, gallery }) => this.onInstallExtension(id, gallery)));
		this.disposables.push(extensionService.onDidInstallExtension(({ id, local, error }) => this.onDidInstallExtension(id, local, error)));
		this.disposables.push(extensionService.onUninstallExtension(id => this.onUninstallExtension(id)));

		this.syncDelayer = new ThrottledDelayer<void>(ExtensionsWorkbenchService.SyncPeriod);

		this.queryLocal().done(() => this.syncWithGallery(true));
	}

	get local(): IExtension[] {
		const installing = this.installing
			.filter(e => !this.installed.some(installed => installed.local.id === e.id))
			.map(e => e.extension);

		return [...this.installed, ...installing];
	}

	queryLocal(): TPromise<IExtension[]> {
		return this.extensionService.getInstalled().then(result => {
			const installedById = index(this.installed, e => e.local.id);

			this.installed = result.map(local => {
				const extension = installedById[local.id] || new Extension(this.stateProvider, local);
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

	getRecommendations(): TPromise<IExtension[]> {
		return this.tipsService.getRecommendations()
			.then(result => result
				.map(gallery => this.fromGallery(gallery))
				.filter(extension => extension.state === ExtensionState.Uninstalled)
			);
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

		return new Extension(this.stateProvider, null, gallery);
	}

	private syncWithGallery(immediate = false): void {
		const loop = () => this.doSyncWithGallery().then(() => this.syncWithGallery());
		const delay = immediate ? 0 : ExtensionsWorkbenchService.SyncPeriod;

		this.syncDelayer.trigger(loop, delay);
	}

	private doSyncWithGallery(): TPromise<void> {
		const ids = this.installed
			.filter(e => !!(e.local && e.local.metadata))
			.map(e => e.local.metadata.id);

		if (ids.length === 0) {
			return TPromise.as(null);
		}

		return this.queryGallery({ ids, pageSize: ids.length }) as TPromise<any>;
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

		return this.extensionService.install(gallery);
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
			extension = new Extension(this.stateProvider, null, gallery);
		}

		extension.gallery = gallery;
		this.installing.push({ id, extension });

		this._onChange.fire();
	}

	private onDidInstallExtension(id: string, local: ILocalExtension, error: Error): void {
		const installing = this.installing.filter(e => e.id === id)[0];

		if (!installing) {
			return;
		}

		const extension = installing.extension;
		extension.local = local;
		extension.needsRestart = true;

		this.installing = this.installing.filter(e => e.id !== id);

		const galleryId = local.metadata && local.metadata.id;
		const installed = this.installed.filter(e => (e.local.metadata && e.local.metadata.id) === galleryId)[0];
		let eventName: string;

		if (galleryId && installed) {
			eventName = 'extensionGallery:update';
			installed.local = local;
		} else {
			eventName = 'extensionGallery:install';
			this.installed.push(extension);
		}

		this.reportTelemetry(extension, eventName, !error);
		this._onChange.fire();
	}

	private onUninstallExtension(id: string): void {
		const previousLength = this.installed.length;
		const extension = this.installed.filter(e => e.local.id === id)[0];
		this.installed = this.installed.filter(e => e.local.id !== id);

		if (previousLength === this.installed.length) {
			return;
		}

		this.reportTelemetry(extension, 'extensionGallery:uninstall', true);
		this._onChange.fire();
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

	private reportTelemetry(extension: Extension, eventName: string, success: boolean): void {
		if (!extension) {
			return;
		}

		const local = extension.local;
		const gallery = extension.gallery;
		let data = null;

		if (gallery) {
			data = {
				id: `${ gallery.publisher }.${ gallery.name }`,
				name: gallery.name,
				galleryId: gallery.id,
				publisherId: gallery.publisherId,
				publisherName: gallery.publisher,
				publisherDisplayName: gallery.publisherDisplayName
			};
		} else {
			data = {
				id: `${ local.manifest.publisher }.${ local.manifest.name }`,
				name: local.manifest.name,
				galleryId: local.metadata ? local.metadata.id : null,
				publisherId: local.metadata ? local.metadata.publisherId : null,
				publisherName: local.manifest.publisher,
				publisherDisplayName: local.metadata ? local.metadata.publisherDisplayName : null
			};
		}

		this.telemetryService.publicLog(eventName, assign(data, { success }));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}