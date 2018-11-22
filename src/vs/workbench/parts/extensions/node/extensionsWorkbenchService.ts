/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { readFile } from 'vs/base/node/pfs';
import * as semver from 'semver';
import { Event, Emitter } from 'vs/base/common/event';
import { index } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IPager, mapPager, singlePagePager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions, IExtensionManifest,
	InstallExtensionEvent, DidInstallExtensionEvent, LocalExtensionType, DidUninstallExtensionEvent, IExtensionEnablementService, IExtensionIdentifier, EnablementState, IExtensionManagementServerService
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionIdFromLocal, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, areSameExtensions, getMaliciousExtensionsSet } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowService } from 'vs/platform/windows/common/windows';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { IExtension, IExtensionDependencies, ExtensionState, IExtensionsWorkbenchService, AutoUpdateConfigurationKey, AutoCheckUpdatesConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import product from 'vs/platform/node/product';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { groupBy } from 'vs/base/common/collections';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { CancellationToken } from 'vs/base/common/cancellation';

interface IExtensionStateProvider<T> {
	(extension: Extension): T;
}

class Extension implements IExtension {

	public get local(): ILocalExtension { return this.locals[0]; }
	public enablementState: EnablementState = EnablementState.Enabled;

	constructor(
		private galleryService: IExtensionGalleryService,
		private stateProvider: IExtensionStateProvider<ExtensionState>,
		public locals: ILocalExtension[],
		public gallery: IGalleryExtension,
		private telemetryService: ITelemetryService,
		private logService: ILogService
	) { }

	get type(): LocalExtensionType {
		return this.local ? this.local.type : null;
	}

	get name(): string {
		return this.gallery ? this.gallery.name : this.local.manifest.name;
	}

	get displayName(): string {
		if (this.gallery) {
			return this.gallery.displayName || this.gallery.name;
		}

		return this.local.manifest.displayName || this.local.manifest.name;
	}

	get id(): string {
		if (this.gallery) {
			return this.gallery.identifier.id;
		}
		return getGalleryExtensionIdFromLocal(this.local);
	}

	get uuid(): string {
		return this.gallery ? this.gallery.identifier.uuid : this.local.identifier.uuid;
	}

	get publisher(): string {
		return this.gallery ? this.gallery.publisher : this.local.manifest.publisher;
	}

	get publisherDisplayName(): string {
		if (this.gallery) {
			return this.gallery.publisherDisplayName || this.gallery.publisher;
		}

		if (this.local.metadata && this.local.metadata.publisherDisplayName) {
			return this.local.metadata.publisherDisplayName;
		}

		return this.local.manifest.publisher;
	}

	get version(): string {
		return this.local ? this.local.manifest.version : this.gallery.version;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.version : this.local.manifest.version;
	}

	get description(): string {
		return this.gallery ? this.gallery.description : this.local.manifest.description;
	}

	get url(): string {
		if (!product.extensionsGallery || !this.gallery) {
			return null;
		}

		return `${product.extensionsGallery.itemUrl}?itemName=${this.publisher}.${this.name}`;
	}

	get iconUrl(): string {
		return this.galleryIconUrl || this.localIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string {
		return this.galleryIconUrlFallback || this.localIconUrl || this.defaultIconUrl;
	}

	private get localIconUrl(): string {
		if (this.local && this.local.manifest.icon) {
			return resources.joinPath(this.local.location, this.local.manifest.icon).toString();
		}
		return null;
	}

	private get galleryIconUrl(): string {
		return this.gallery && this.gallery.assets.icon.uri;
	}

	private get galleryIconUrlFallback(): string {
		return this.gallery && this.gallery.assets.icon.fallbackUri;
	}

	private get defaultIconUrl(): string {
		if (this.type === LocalExtensionType.System) {
			if (this.local.manifest && this.local.manifest.contributes) {
				if (Array.isArray(this.local.manifest.contributes.themes) && this.local.manifest.contributes.themes.length) {
					return require.toUrl('../electron-browser/media/theme-icon.png');
				}
				if (Array.isArray(this.local.manifest.contributes.grammars) && this.local.manifest.contributes.grammars.length) {
					return require.toUrl('../electron-browser/media/language-icon.svg');
				}
			}
		}
		return require.toUrl('../electron-browser/media/defaultIcon.png');
	}

	get repository(): string {
		return this.gallery && this.gallery.assets.repository.uri;
	}

	get licenseUrl(): string {
		return this.gallery && this.gallery.assets.license && this.gallery.assets.license.uri;
	}

	get state(): ExtensionState {
		return this.stateProvider(this);
	}

	public isMalicious: boolean = false;

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
		return !!this.gallery && this.type === LocalExtensionType.User && semver.gt(this.latestVersion, this.version);
	}

	get telemetryData(): any {
		const { local, gallery } = this;

		if (gallery) {
			return getGalleryExtensionTelemetryData(gallery);
		} else {
			return getLocalExtensionTelemetryData(local);
		}
	}

	get preview(): boolean {
		return this.gallery ? this.gallery.preview : false;
	}

	private isGalleryOutdated(): boolean {
		return this.local && this.gallery && semver.gt(this.local.manifest.version, this.gallery.version);
	}

	getManifest(token: CancellationToken): Promise<IExtensionManifest> {
		if (this.gallery && !this.isGalleryOutdated()) {
			if (this.gallery.assets.manifest) {
				return this.galleryService.getManifest(this.gallery, token);
			}
			this.logService.error(nls.localize('Manifest is not found', "Manifest is not found"), this.id);
			return Promise.resolve(undefined);
		}

		return Promise.resolve(this.local.manifest);
	}

	hasReadme(): boolean {
		if (this.gallery && !this.isGalleryOutdated() && this.gallery.assets.readme) {
			return true;
		}

		if (this.local && this.local.readmeUrl) {
			return true;
		}

		return this.type === LocalExtensionType.System;
	}

	getReadme(token: CancellationToken): Promise<string> {
		if (this.gallery && !this.isGalleryOutdated()) {
			if (this.gallery.assets.readme) {
				return this.galleryService.getReadme(this.gallery, token);
			}
			this.telemetryService.publicLog('extensions:NotFoundReadMe', this.telemetryData);
		}

		if (this.local && this.local.readmeUrl) {
			const uri = URI.parse(this.local.readmeUrl);
			return readFile(uri.fsPath, 'utf8');
		}

		if (this.type === LocalExtensionType.System) {
			return Promise.resolve(`# ${this.displayName || this.name}
**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.
## Features
${this.description}
`);
		}

		return Promise.reject(new Error('not available'));
	}

	hasChangelog(): boolean {
		if (this.gallery && this.gallery.assets.changelog && !this.isGalleryOutdated()) {
			return true;
		}

		if (this.local && this.local.changelogUrl) {
			const uri = URI.parse(this.local.changelogUrl);
			return uri.scheme === 'file';
		}

		return this.type === LocalExtensionType.System;
	}

	getChangelog(token: CancellationToken): Promise<string> {
		if (this.gallery && this.gallery.assets.changelog && !this.isGalleryOutdated()) {
			return this.galleryService.getChangelog(this.gallery, token);
		}

		const changelogUrl = this.local && this.local.changelogUrl;

		if (!changelogUrl) {
			if (this.type === LocalExtensionType.System) {
				return Promise.resolve('Please check the [VS Code Release Notes](command:update.showCurrentReleaseNotes) for changes to the built-in extensions.');
			}

			return Promise.reject(new Error('not available'));
		}

		const uri = URI.parse(changelogUrl);

		if (uri.scheme === 'file') {
			return readFile(uri.fsPath, 'utf8');
		}

		return Promise.reject(new Error('not available'));
	}

	get dependencies(): string[] {
		const { local, gallery } = this;
		if (gallery && !this.isGalleryOutdated()) {
			return gallery.properties.dependencies || [];
		}
		if (local && local.manifest.extensionDependencies) {
			return local.manifest.extensionDependencies;
		}
		return [];
	}

	get extensionPack(): string[] {
		const { local, gallery } = this;
		if (gallery && !this.isGalleryOutdated()) {
			return gallery.properties.extensionPack || [];
		}
		if (local && local.manifest.extensionPack) {
			return local.manifest.extensionPack;
		}
		return [];
	}
}

class ExtensionDependencies implements IExtensionDependencies {

	private _hasDependencies: boolean | null = null;

	constructor(private _extension: IExtension, private _identifier: string, private _map: Map<string, IExtension>, private _dependent: IExtensionDependencies | null = null) { }

	get hasDependencies(): boolean {
		if (this._hasDependencies === null) {
			this._hasDependencies = this.computeHasDependencies();
		}
		return this._hasDependencies;
	}

	get extension(): IExtension {
		return this._extension;
	}

	get identifier(): string {
		return this._identifier;
	}

	get dependent(): IExtensionDependencies {
		return this._dependent;
	}

	get dependencies(): IExtensionDependencies[] {
		if (!this.hasDependencies) {
			return [];
		}
		return this._extension.dependencies.map(id => new ExtensionDependencies(this._map.get(id), id, this._map, this));
	}

	private computeHasDependencies(): boolean {
		if (this._extension && this._extension.dependencies.length > 0) {
			let dependent = this._dependent;
			while (dependent !== null) {
				if (dependent.identifier === this.identifier) {
					return false;
				}
				dependent = dependent.dependent;
			}
			return true;
		}
		return false;
	}
}

export class ExtensionsWorkbenchService implements IExtensionsWorkbenchService, IURLHandler {

	private static readonly SyncPeriod = 1000 * 60 * 60 * 12; // 12 hours
	_serviceBrand: any;
	private stateProvider: IExtensionStateProvider<ExtensionState>;
	private installing: Extension[] = [];
	private uninstalling: Extension[] = [];
	private installed: Extension[] = [];
	private syncDelayer: ThrottledDelayer<void>;
	private autoUpdateDelayer: ThrottledDelayer<void>;
	private disposables: IDisposable[] = [];

	private readonly _onChange: Emitter<IExtension | undefined> = new Emitter<IExtension | undefined>();
	get onChange(): Event<IExtension | undefined> { return this._onChange.event; }

	private _extensionAllowedBadgeProviders: string[];

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorService private editorService: IEditorService,
		@IExtensionManagementService private extensionService: IExtensionManagementService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@INotificationService private notificationService: INotificationService,
		@IURLService urlService: IURLService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IWindowService private windowService: IWindowService,
		@ILogService private logService: ILogService,
		@IProgressService2 private progressService: IProgressService2,
		@IExtensionService private runtimeExtensionService: IExtensionService,
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService
	) {
		this.stateProvider = ext => this.getExtensionState(ext);

		extensionService.onInstallExtension(this.onInstallExtension, this, this.disposables);
		extensionService.onDidInstallExtension(this.onDidInstallExtension, this, this.disposables);
		extensionService.onUninstallExtension(this.onUninstallExtension, this, this.disposables);
		extensionService.onDidUninstallExtension(this.onDidUninstallExtension, this, this.disposables);
		extensionEnablementService.onEnablementChanged(this.onEnablementChanged, this, this.disposables);

		this.syncDelayer = new ThrottledDelayer<void>(ExtensionsWorkbenchService.SyncPeriod);
		this.autoUpdateDelayer = new ThrottledDelayer<void>(1000);

		urlService.registerHandler(this);

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
				if (this.isAutoUpdateEnabled()) {
					this.checkForUpdates();
				}
			}
			if (e.affectsConfiguration(AutoCheckUpdatesConfigurationKey)) {
				if (this.isAutoCheckUpdatesEnabled()) {
					this.checkForUpdates();
				}
			}
		}, this, this.disposables);

		this.queryLocal().then(() => this.eventuallySyncWithGallery(true));
	}

	get local(): IExtension[] {
		const installing = this.installing
			.filter(e => !this.installed.some(installed => installed.id === e.id))
			.map(e => e);

		return [...this.installed, ...installing];
	}

	queryLocal(): Promise<IExtension[]> {
		return this.extensionService.getInstalled()
			.then(installed => this.getDistinctInstalledExtensions(installed)
				.then(distinctInstalled => {
					const installedById = index(this.installed, e => e.local.identifier.id);
					const groupById = groupBy(installed, i => getGalleryExtensionIdFromLocal(i));
					this.installed = distinctInstalled.map(local => {
						const locals = groupById[getGalleryExtensionIdFromLocal(local)];
						locals.splice(locals.indexOf(local), 1);
						locals.splice(0, 0, local);
						const extension = installedById[local.identifier.id] || new Extension(this.galleryService, this.stateProvider, locals, null, this.telemetryService, this.logService);
						extension.locals = locals;
						extension.enablementState = this.extensionEnablementService.getEnablementState(local);
						return extension;
					});

					this._onChange.fire();
					return this.local;
				}));
	}

	queryGallery(options: IQueryOptions = {}): Promise<IPager<IExtension>> {
		return this.extensionService.getExtensionsReport()
			.then(report => {
				const maliciousSet = getMaliciousExtensionsSet(report);

				return this.galleryService.query(options)
					.then(result => mapPager(result, gallery => this.fromGallery(gallery, maliciousSet)))
					.then(null, err => {
						if (/No extension gallery service configured/.test(err.message)) {
							return Promise.resolve(singlePagePager([]));
						}

						return Promise.reject<IPager<IExtension>>(err);
					});
			});
	}

	loadDependencies(extension: IExtension, token: CancellationToken): Promise<IExtensionDependencies> {
		if (!extension.dependencies.length) {
			return Promise.resolve<IExtensionDependencies>(null);
		}

		return this.extensionService.getExtensionsReport()
			.then(report => {
				const maliciousSet = getMaliciousExtensionsSet(report);

				return this.galleryService.loadAllDependencies((<Extension>extension).dependencies.map(id => ({ id })), token)
					.then(galleryExtensions => galleryExtensions.map(galleryExtension => this.fromGallery(galleryExtension, maliciousSet)))
					.then(extensions => [...this.local, ...extensions])
					.then(extensions => {
						const map = new Map<string, IExtension>();
						for (const extension of extensions) {
							map.set(extension.id, extension);
						}
						return new ExtensionDependencies(extension, extension.id, map);
					});
			});
	}

	open(extension: IExtension, sideByside: boolean = false): Promise<any> {
		return Promise.resolve(this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension), null, sideByside ? SIDE_GROUP : ACTIVE_GROUP));
	}

	private getDistinctInstalledExtensions(allInstalled: ILocalExtension[]): Promise<ILocalExtension[]> {
		if (!this.hasDuplicates(allInstalled)) {
			return Promise.resolve(allInstalled);
		}
		return Promise.all([this.runtimeExtensionService.getExtensions(), this.extensionEnablementService.getDisabledExtensions()])
			.then(([runtimeExtensions, disabledExtensionIdentifiers]) => {
				const groups = groupBy(allInstalled, (extension: ILocalExtension) => {
					const isDisabled = disabledExtensionIdentifiers.some(identifier => areSameExtensions(identifier, { id: getGalleryExtensionIdFromLocal(extension), uuid: extension.identifier.uuid }));
					if (isDisabled) {
						return extension.location.scheme === Schemas.file ? 'disabled:primary' : 'disabled:secondary';
					} else {
						return 'enabled';
					}
				});
				const enabled: ILocalExtension[] = [];
				const notRunningExtensions: ILocalExtension[] = [];
				const seenExtensions: { [id: string]: boolean } = Object.create({});
				for (const extension of (groups['enabled'] || [])) {
					if (runtimeExtensions.some(r => r.extensionLocation.toString() === extension.location.toString())) {
						enabled.push(extension);
						seenExtensions[getGalleryExtensionIdFromLocal(extension)] = true;
					} else {
						notRunningExtensions.push(extension);
					}
				}
				for (const extension of notRunningExtensions) {
					if (!seenExtensions[getGalleryExtensionIdFromLocal(extension)]) {
						enabled.push(extension);
						seenExtensions[getGalleryExtensionIdFromLocal(extension)] = true;
					}
				}
				const primaryDisabled = groups['disabled:primary'] || [];
				const secondaryDisabled = (groups['disabled:secondary'] || []).filter(disabled => {
					const identifier: IExtensionIdentifier = { id: getGalleryExtensionIdFromLocal(disabled), uuid: disabled.identifier.uuid };
					return primaryDisabled.every(p => !areSameExtensions({ id: getGalleryExtensionIdFromLocal(p), uuid: p.identifier.uuid }, identifier));
				});
				return [...enabled, ...primaryDisabled, ...secondaryDisabled];
			});
	}

	private hasDuplicates(extensions: ILocalExtension[]): boolean {
		const seen: { [key: string]: boolean; } = Object.create(null);
		for (const i of extensions) {
			const key = getGalleryExtensionIdFromLocal(i);
			if (seen[key]) {
				return true;
			}
			seen[key] = true;
		}
		return false;
	}

	private fromGallery(gallery: IGalleryExtension, maliciousExtensionSet: Set<string>): Extension {
		let result = this.getInstalledExtensionMatchingGallery(gallery);

		if (result) {
			// Loading the compatible version only there is an engine property
			// Otherwise falling back to old way so that we will not make many roundtrips
			if (gallery.properties.engine) {
				this.galleryService.loadCompatibleVersion(gallery)
					.then(compatible => compatible ? this.syncLocalWithGalleryExtension(result, compatible) : null);
			} else {
				this.syncLocalWithGalleryExtension(result, gallery);
			}
		} else {
			result = new Extension(this.galleryService, this.stateProvider, [], gallery, this.telemetryService, this.logService);
		}

		if (maliciousExtensionSet.has(result.id)) {
			result.isMalicious = true;
		}

		return result;
	}

	private getInstalledExtensionMatchingGallery(gallery: IGalleryExtension): Extension {
		for (const installed of this.installed) {
			if (installed.uuid) { // Installed from Gallery
				if (installed.uuid === gallery.identifier.uuid) {
					return installed;
				}
			} else {
				if (installed.id === gallery.identifier.id) { // Installed from other sources
					return installed;
				}
			}
		}
		return null;
	}

	private syncLocalWithGalleryExtension(extension: Extension, gallery: IGalleryExtension) {
		// Sync the local extension with gallery extension if local extension doesnot has metadata
		Promise.all(extension.locals.map(local => local.metadata ? Promise.resolve(local) : this.extensionService.updateMetadata(local, { id: gallery.identifier.uuid, publisherDisplayName: gallery.publisherDisplayName, publisherId: gallery.publisherId })))
			.then(locals => {
				extension.locals = locals;
				extension.gallery = gallery;
				this._onChange.fire(extension);
				this.eventuallyAutoUpdateExtensions();
			});
	}

	checkForUpdates(): Promise<void> {
		return Promise.resolve(this.syncDelayer.trigger(() => this.syncWithGallery(), 0));
	}

	private isAutoUpdateEnabled(): boolean {
		return this.configurationService.getValue(AutoUpdateConfigurationKey);
	}

	private isAutoCheckUpdatesEnabled(): boolean {
		return this.configurationService.getValue(AutoCheckUpdatesConfigurationKey);
	}

	private eventuallySyncWithGallery(immediate = false): void {
		const shouldSync = this.isAutoUpdateEnabled() || this.isAutoCheckUpdatesEnabled();
		const loop = () => (shouldSync ? this.syncWithGallery() : Promise.resolve(null)).then(() => this.eventuallySyncWithGallery());
		const delay = immediate ? 0 : ExtensionsWorkbenchService.SyncPeriod;

		this.syncDelayer.trigger(loop, delay)
			.then(null, err => null);
	}

	private syncWithGallery(): Promise<void> {
		const ids: string[] = [], names: string[] = [];
		for (const installed of this.installed) {
			if (installed.type === LocalExtensionType.User) {
				if (installed.uuid) {
					ids.push(installed.uuid);
				} else {
					names.push(installed.id);
				}
			}
		}

		const promises: Promise<IPager<IExtension>>[] = [];
		if (ids.length) {
			promises.push(this.queryGallery({ ids, pageSize: ids.length }));
		}
		if (names.length) {
			promises.push(this.queryGallery({ names, pageSize: names.length }));
		}

		return Promise.all(promises).then(() => null);
	}

	private eventuallyAutoUpdateExtensions(): void {
		this.autoUpdateDelayer.trigger(() => this.autoUpdateExtensions())
			.then(null, err => null);
	}

	private autoUpdateExtensions(): Promise<any> {
		if (!this.isAutoUpdateEnabled()) {
			return Promise.resolve(null);
		}

		const toUpdate = this.local.filter(e => e.outdated && (e.state !== ExtensionState.Installing));
		return Promise.all(toUpdate.map(e => this.install(e)));
	}

	canInstall(extension: IExtension): boolean {
		if (!(extension instanceof Extension)) {
			return false;
		}

		if (extension.isMalicious) {
			return false;
		}

		return !!(extension as Extension).gallery;
	}

	install(extension: string | IExtension): Promise<void> {
		if (typeof extension === 'string') {
			return this.progressService.withProgress({
				location: ProgressLocation.Extensions,
				title: nls.localize('installingVSIXExtension', 'Installing extension from VSIX...'),
				source: `${extension}`
			}, () => this.extensionService.install(URI.file(extension)).then(extensionIdentifier => this.checkAndEnableDisabledDependencies(extensionIdentifier)));
		}

		if (!(extension instanceof Extension)) {
			return Promise.resolve(undefined);
		}

		if (extension.isMalicious) {
			return Promise.reject(new Error(nls.localize('malicious', "This extension is reported to be problematic.")));
		}

		const ext = extension as Extension;
		const gallery = ext.gallery;

		if (!gallery) {
			return Promise.reject(new Error('Missing gallery'));
		}

		return this.progressService.withProgress({
			location: ProgressLocation.Extensions,
			title: nls.localize('installingMarketPlaceExtension', 'Installing extension from Marketplace....'),
			source: `${extension.id}`
		}, () => this.extensionService.installFromGallery(gallery).then(() => this.checkAndEnableDisabledDependencies(gallery.identifier)));
	}

	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void> {
		extensions = Array.isArray(extensions) ? extensions : [extensions];
		return this.promptAndSetEnablement(extensions, enablementState);
	}

	uninstall(extension: IExtension): Promise<void> {
		if (!(extension instanceof Extension)) {
			return undefined;
		}

		const ext = extension as Extension;
		const toUninstall: ILocalExtension[] = ext.locals.length ? ext.locals : this.installed.filter(e => e.id === extension.id)[0].locals;

		if (!toUninstall.length) {
			return Promise.reject(new Error('Missing local'));
		}

		this.logService.info(`Requested uninstalling the extension ${extension.id} from window ${this.windowService.getCurrentWindowId()}`);
		return this.progressService.withProgress({
			location: ProgressLocation.Extensions,
			title: nls.localize('uninstallingExtension', 'Uninstalling extension....'),
			source: `${toUninstall[0].identifier.id}`
		}, () => Promise.all(toUninstall.map(local => this.extensionService.uninstall(local))).then(() => null));
	}

	reinstall(extension: IExtension): Promise<void> {
		if (!(extension instanceof Extension)) {
			return undefined;
		}

		const ext = extension as Extension;
		const toReinstall: ILocalExtension[] = ext.locals.length ? ext.locals : this.installed.filter(e => e.id === extension.id)[0].locals;

		if (!toReinstall.length) {
			return Promise.reject(new Error('Missing local'));
		}

		return this.progressService.withProgress({
			location: ProgressLocation.Extensions,
			source: `${toReinstall[0].identifier.id}`
		}, () => Promise.all(toReinstall.map(local => this.extensionService.reinstallFromGallery(local))).then(() => null));
	}

	private checkAndEnableDisabledDependencies(extensionIdentifier: IExtensionIdentifier): Promise<void> {
		const extension = this.local.filter(e => (e.local || e.gallery) && areSameExtensions(extensionIdentifier, e.local ? e.local.identifier : e.gallery.identifier))[0];
		if (extension) {
			const disabledDepencies = this.getExtensionsRecursively([extension], this.local, EnablementState.Enabled, { dependencies: true, pack: false });
			if (disabledDepencies.length) {
				return this.setEnablement(disabledDepencies, EnablementState.Enabled);
			}
		}
		return Promise.resolve(null);
	}

	private promptAndSetEnablement(extensions: IExtension[], enablementState: EnablementState): Promise<any> {
		const enable = enablementState === EnablementState.Enabled || enablementState === EnablementState.WorkspaceEnabled;
		if (enable) {
			const allDependenciesAndPackedExtensions = this.getExtensionsRecursively(extensions, this.local, enablementState, { dependencies: true, pack: true });
			return this.checkAndSetEnablement(extensions, allDependenciesAndPackedExtensions, enablementState);
		} else {
			const packedExtensions = this.getExtensionsRecursively(extensions, this.local, enablementState, { dependencies: false, pack: true });
			if (packedExtensions.length) {
				return this.checkAndSetEnablement(extensions, packedExtensions, enablementState);
			}
			return this.checkAndSetEnablement(extensions, [], enablementState);
		}
	}

	private checkAndSetEnablement(extensions: IExtension[], otherExtensions: IExtension[], enablementState: EnablementState): Promise<any> {
		const allExtensions = [...extensions, ...otherExtensions];
		const enable = enablementState === EnablementState.Enabled || enablementState === EnablementState.WorkspaceEnabled;
		if (!enable) {
			for (const extension of extensions) {
				let dependents = this.getDependentsAfterDisablement(extension, allExtensions, this.local);
				if (dependents.length) {
					return Promise.reject(new Error(this.getDependentsErrorMessage(extension, allExtensions, dependents)));
				}
			}
		}
		return Promise.all(allExtensions.map(e => this.doSetEnablement(e, enablementState)));
	}

	private getExtensionsRecursively(extensions: IExtension[], installed: IExtension[], enablementState: EnablementState, options: { dependencies: boolean, pack: boolean }, checked: IExtension[] = []): IExtension[] {
		const toCheck = extensions.filter(e => checked.indexOf(e) === -1);
		if (toCheck.length) {
			for (const extension of toCheck) {
				checked.push(extension);
			}
			const extensionsToDisable = installed.filter(i => {
				if (checked.indexOf(i) !== -1) {
					return false;
				}
				if (i.enablementState === enablementState) {
					return false;
				}
				const enable = enablementState === EnablementState.Enabled || enablementState === EnablementState.WorkspaceEnabled;
				return (enable || i.type === LocalExtensionType.User) // Include all Extensions for enablement and only user extensions for disablement
					&& (options.dependencies || options.pack)
					&& extensions.some(extension =>
						(options.dependencies && extension.dependencies.some(id => areSameExtensions({ id }, i)))
						|| (options.pack && extension.extensionPack.some(id => areSameExtensions({ id }, i)))
					);
			});
			if (extensionsToDisable.length) {
				extensionsToDisable.push(...this.getExtensionsRecursively(extensionsToDisable, installed, enablementState, options, checked));
			}
			return extensionsToDisable;
		}
		return [];
	}

	private getDependentsAfterDisablement(extension: IExtension, extensionsToDisable: IExtension[], installed: IExtension[]): IExtension[] {
		return installed.filter(i => {
			if (i.dependencies.length === 0) {
				return false;
			}
			if (i === extension) {
				return false;
			}
			if (i.enablementState === EnablementState.WorkspaceDisabled || i.enablementState === EnablementState.Disabled) {
				return false;
			}
			if (extensionsToDisable.indexOf(i) !== -1) {
				return false;
			}
			return i.dependencies.some(dep => [extension, ...extensionsToDisable].some(d => d.id === dep));
		});
	}

	private getDependentsErrorMessage(extension: IExtension, allDisabledExtensions: IExtension[], dependents: IExtension[]): string {
		for (const e of [extension, ...allDisabledExtensions]) {
			let dependentsOfTheExtension = dependents.filter(d => d.dependencies.some(id => areSameExtensions({ id }, e)));
			if (dependentsOfTheExtension.length) {
				return this.getErrorMessageForDisablingAnExtensionWithDependents(e, dependentsOfTheExtension);
			}
		}
		return '';
	}

	private getErrorMessageForDisablingAnExtensionWithDependents(extension: IExtension, dependents: IExtension[]): string {
		if (dependents.length === 1) {
			return nls.localize('singleDependentError', "Cannot disable extension '{0}'. Extension '{1}' depends on this.", extension.displayName, dependents[0].displayName);
		}
		if (dependents.length === 2) {
			return nls.localize('twoDependentsError', "Cannot disable extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
				extension.displayName, dependents[0].displayName, dependents[1].displayName);
		}
		return nls.localize('multipleDependentsError', "Cannot disable extension '{0}'. Extensions '{1}', '{2}' and others depend on this.",
			extension.displayName, dependents[0].displayName, dependents[1].displayName);
	}

	private doSetEnablement(extension: IExtension, enablementState: EnablementState): Promise<boolean> {
		return this.extensionEnablementService.setEnablement(extension.local, enablementState)
			.then(changed => {
				if (changed) {
					/* __GDPR__
					"extension:enable" : {
						"${include}": [
							"${GalleryExtensionTelemetryData}"
						]
					}
					*/
					/* __GDPR__
					"extension:disable" : {
						"${include}": [
							"${GalleryExtensionTelemetryData}"
						]
					}
					*/
					this.telemetryService.publicLog(enablementState === EnablementState.Enabled || enablementState === EnablementState.WorkspaceEnabled ? 'extension:enable' : 'extension:disable', extension.telemetryData);
				}
				return changed;
			});
	}

	get allowedBadgeProviders(): string[] {
		if (!this._extensionAllowedBadgeProviders) {
			this._extensionAllowedBadgeProviders = (product.extensionAllowedBadgeProviders || []).map(s => s.toLowerCase());
		}
		return this._extensionAllowedBadgeProviders;
	}

	private onInstallExtension(event: InstallExtensionEvent): void {
		const { gallery } = event;

		if (!gallery) {
			return;
		}

		let extension = this.installed.filter(e => areSameExtensions(e, gallery.identifier))[0];

		if (!extension) {
			extension = new Extension(this.galleryService, this.stateProvider, [], gallery, this.telemetryService, this.logService);
		}

		extension.gallery = gallery;

		this.installing.push(extension);

		this._onChange.fire(extension);
	}

	private onDidInstallExtension(event: DidInstallExtensionEvent): void {
		const { local, zipPath, error, gallery } = event;
		const installingExtension = gallery ? this.installing.filter(e => areSameExtensions(e, gallery.identifier))[0] : null;
		let extension: Extension = installingExtension ? installingExtension : zipPath ? new Extension(this.galleryService, this.stateProvider, [local], null, this.telemetryService, this.logService) : null;
		if (extension) {
			this.installing = installingExtension ? this.installing.filter(e => e !== installingExtension) : this.installing;
			if (!error) {
				const installed = this.installed.filter(e => e.id === extension.id)[0];
				if (installed) {
					extension = installed;
					const server = this.extensionManagementServerService.getExtensionManagementServer(local.location);
					const existingLocal = installed.locals.filter(l => this.extensionManagementServerService.getExtensionManagementServer(l.location).authority === server.authority)[0];
					if (existingLocal) {
						const locals = [...installed.locals];
						locals.splice(installed.locals.indexOf(existingLocal), 1, local);
						installed.locals = locals;
					} else {
						installed.locals = [...installed.locals, local];
					}
				} else {
					extension.locals = [local];
					this.installed.push(extension);
				}
			}
		}
		this._onChange.fire(error ? null : extension);
	}

	private onUninstallExtension({ id }: IExtensionIdentifier): void {
		this.logService.info(`Uninstalling the extension ${id} from window ${this.windowService.getCurrentWindowId()}`);
		const extension = this.installed.filter(e => e.local.identifier.id === id)[0];
		const newLength = this.installed.filter(e => e.local.identifier.id !== id).length;
		// TODO: Ask @Joao why is this?
		if (newLength === this.installed.length) {
			return;
		}

		const uninstalling = this.uninstalling.filter(e => e.local.identifier.id === id)[0] || extension;
		this.uninstalling = [uninstalling, ...this.uninstalling.filter(e => e.local.identifier.id !== id)];

		this._onChange.fire();
	}

	private onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		const id = identifier.id;
		if (!error) {
			this.installed = this.installed.filter(e => e.local.identifier.id !== id);
		}

		const uninstalling = this.uninstalling.filter(e => e.local.identifier.id === id)[0];
		this.uninstalling = this.uninstalling.filter(e => e.local.identifier.id !== id);
		if (!uninstalling) {
			return;
		}

		this._onChange.fire();
	}

	private onEnablementChanged(identifier: IExtensionIdentifier) {
		const [extension] = this.local.filter(e => areSameExtensions(e, identifier));
		if (extension && extension.local) {
			const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
			if (enablementState !== extension.enablementState) {
				extension.enablementState = enablementState;
				this._onChange.fire(extension);
			}
		}
	}

	private getExtensionState(extension: Extension): ExtensionState {
		if (extension.gallery && this.installing.some(e => e.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier))) {
			return ExtensionState.Installing;
		}

		if (this.uninstalling.some(e => e.id === extension.id)) {
			return ExtensionState.Uninstalling;
		}

		const local = this.installed.filter(e => e === extension || (e.gallery && extension.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier)))[0];
		return local ? ExtensionState.Installed : ExtensionState.Uninstalled;
	}

	private onError(err: any): void {
		if (isPromiseCanceledError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/getaddrinfo ENOTFOUND|getaddrinfo ENOENT|connect EACCES|connect ECONNREFUSED/.test(message)) {
			return;
		}

		this.notificationService.error(err);
	}

	handleURL(uri: URI): Promise<boolean> {
		if (!/^extension/.test(uri.path)) {
			return Promise.resolve(false);
		}

		this.onOpenExtensionUrl(uri);
		return Promise.resolve(true);
	}

	private onOpenExtensionUrl(uri: URI): void {
		const match = /^extension\/([^/]+)$/.exec(uri.path);

		if (!match) {
			return;
		}

		const extensionId = match[1];

		this.queryLocal().then(local => {
			const extension = local.filter(local => areSameExtensions({ id: local.id }, { id: extensionId }))[0];

			if (extension) {
				return this.windowService.show()
					.then(() => this.open(extension));
			}

			return this.queryGallery({ names: [extensionId], source: 'uri' }).then(result => {
				if (result.total < 1) {
					return Promise.resolve(null);
				}

				const extension = result.firstPage[0];

				return this.windowService.show().then(() => {
					return this.open(extension).then(() => {
						this.notificationService.prompt(
							Severity.Info,
							nls.localize('installConfirmation', "Would you like to install the '{0}' extension?", extension.displayName, extension.publisher),
							[{
								label: nls.localize('install', "Install"),
								run: () => this.install(extension).then(undefined, error => this.onError(error))
							}],
							{ sticky: true }
						);
					});
				});
			});
		}).then(undefined, error => this.onError(error));
	}

	dispose(): void {
		this.syncDelayer.cancel();
		this.disposables = dispose(this.disposables);
	}
}