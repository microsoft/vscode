/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { Event, Emitter } from 'vs/base/common/event';
import { index, distinct } from 'vs/base/common/arrays';
import { Promises, ThrottledDelayer } from 'vs/base/common/async';
import { CancellationError, isCancellationError } from 'vs/base/common/errors';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IPager, singlePagePager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import {
	IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions,
	InstallExtensionEvent, DidUninstallExtensionEvent, InstallOperation, InstallOptions, WEB_EXTENSION_TAG, InstallExtensionResult,
	IExtensionsControlManifest, InstallVSIXOptions, IExtensionInfo, IExtensionQueryOptions, IDeprecationInfo
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IWorkbenchExtensionManagementService, DefaultIconPath } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, areSameExtensions, groupByExtension, ExtensionKey, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { URI } from 'vs/base/common/uri';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, AutoUpdateConfigurationKey, AutoCheckUpdatesConfigurationKey, HasOutdatedExtensionsContext } from 'vs/workbench/contrib/extensions/common/extensions';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IURLService, IURLHandler, IOpenURLOptions } from 'vs/platform/url/common/url';
import { ExtensionsInput, IExtensionEditorOptions } from 'vs/workbench/contrib/extensions/common/extensionsInput';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import * as resources from 'vs/base/common/resources';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionManifest, ExtensionType, IExtension as IPlatformExtension, TargetPlatform, ExtensionIdentifier, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IProductService } from 'vs/platform/product/common/productService';
import { FileAccess } from 'vs/base/common/network';
import { IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { IUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataSync';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { isBoolean, isUndefined } from 'vs/base/common/types';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IExtensionService, IExtensionsStatus } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionEditor } from 'vs/workbench/contrib/extensions/browser/extensionEditor';
import { isWeb, language } from 'vs/base/common/platform';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/contrib/localization/common/locale';

interface IExtensionStateProvider<T> {
	(extension: Extension): T;
}

interface InstalledExtensionsEvent {
	readonly extensionIds: string;
	readonly count: number;
}
type ExtensionsLoadClassification = {
	owner: 'digitarald';
	comment: 'Helps to understand which extensions are the most actively used.';
	readonly extensionIds: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The list of extension ids that are installed.' };
	readonly count: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The number of extensions that are installed.' };
};

export class Extension implements IExtension {

	public enablementState: EnablementState = EnablementState.EnabledGlobally;

	constructor(
		private stateProvider: IExtensionStateProvider<ExtensionState>,
		public readonly server: IExtensionManagementServer | undefined,
		public local: ILocalExtension | undefined,
		public gallery: IGalleryExtension | undefined,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService
	) { }

	get type(): ExtensionType {
		return this.local ? this.local.type : ExtensionType.User;
	}

	get isBuiltin(): boolean {
		return this.local ? this.local.isBuiltin : false;
	}

	get name(): string {
		return this.gallery ? this.gallery.name : this.local!.manifest.name;
	}

	get displayName(): string {
		if (this.gallery) {
			return this.gallery.displayName || this.gallery.name;
		}

		return this.local!.manifest.displayName || this.local!.manifest.name;
	}

	get identifier(): IExtensionIdentifier {
		if (this.gallery) {
			return this.gallery.identifier;
		}
		return this.local!.identifier;
	}

	get uuid(): string | undefined {
		return this.gallery ? this.gallery.identifier.uuid : this.local!.identifier.uuid;
	}

	get publisher(): string {
		return this.gallery ? this.gallery.publisher : this.local!.manifest.publisher;
	}

	get publisherDisplayName(): string {
		if (this.gallery) {
			return this.gallery.publisherDisplayName || this.gallery.publisher;
		}

		if (this.local?.publisherDisplayName) {
			return this.local.publisherDisplayName;
		}

		return this.local!.manifest.publisher;
	}

	get publisherUrl(): URI | undefined {
		if (!this.productService.extensionsGallery || !this.gallery) {
			return undefined;
		}

		return resources.joinPath(URI.parse(this.productService.extensionsGallery.publisherUrl), this.publisher);
	}

	get publisherDomain(): { link: string; verified: boolean } | undefined {
		return this.gallery?.publisherDomain;
	}

	get publisherSponsorLink(): URI | undefined {
		return this.gallery?.publisherSponsorLink ? URI.parse(this.gallery.publisherSponsorLink) : undefined;
	}

	get version(): string {
		return this.local ? this.local.manifest.version : this.latestVersion;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.version : this.local!.manifest.version;
	}

	get description(): string {
		return this.gallery ? this.gallery.description : this.local!.manifest.description || '';
	}

	get url(): string | undefined {
		if (!this.productService.extensionsGallery || !this.gallery) {
			return undefined;
		}

		return `${this.productService.extensionsGallery.itemUrl}?itemName=${this.publisher}.${this.name}`;
	}

	get iconUrl(): string {
		return this.galleryIconUrl || this.localIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string {
		return this.galleryIconUrlFallback || this.localIconUrl || this.defaultIconUrl;
	}

	private get localIconUrl(): string | null {
		if (this.local && this.local.manifest.icon) {
			return FileAccess.asBrowserUri(resources.joinPath(this.local.location, this.local.manifest.icon)).toString(true);
		}
		return null;
	}

	private get galleryIconUrl(): string | null {
		return this.gallery?.assets.icon ? this.gallery.assets.icon.uri : null;
	}

	private get galleryIconUrlFallback(): string | null {
		return this.gallery?.assets.icon ? this.gallery.assets.icon.fallbackUri : null;
	}

	private get defaultIconUrl(): string {
		if (this.type === ExtensionType.System && this.local) {
			if (this.local.manifest && this.local.manifest.contributes) {
				if (Array.isArray(this.local.manifest.contributes.themes) && this.local.manifest.contributes.themes.length) {
					return FileAccess.asBrowserUri('./media/theme-icon.png', require).toString(true);
				}
				if (Array.isArray(this.local.manifest.contributes.grammars) && this.local.manifest.contributes.grammars.length) {
					return FileAccess.asBrowserUri('./media/language-icon.svg', require).toString(true);
				}
			}
		}
		return DefaultIconPath;
	}

	get repository(): string | undefined {
		return this.gallery && this.gallery.assets.repository ? this.gallery.assets.repository.uri : undefined;
	}

	get licenseUrl(): string | undefined {
		return this.gallery && this.gallery.assets.license ? this.gallery.assets.license.uri : undefined;
	}

	get state(): ExtensionState {
		return this.stateProvider(this);
	}

	public isMalicious: boolean = false;
	public deprecationInfo: IDeprecationInfo | undefined;

	get installCount(): number | undefined {
		return this.gallery ? this.gallery.installCount : undefined;
	}

	get rating(): number | undefined {
		return this.gallery ? this.gallery.rating : undefined;
	}

	get ratingCount(): number | undefined {
		return this.gallery ? this.gallery.ratingCount : undefined;
	}

	get outdated(): boolean {
		try {
			if (!this.gallery || !this.local) {
				return false;
			}
			// Do not allow updating system extensions in stable
			if (this.type === ExtensionType.System && this.productService.quality === 'stable') {
				return false;
			}
			if (!this.local.preRelease && this.gallery.properties.isPreReleaseVersion) {
				return false;
			}
			if (semver.gt(this.latestVersion, this.version)) {
				return true;
			}
			if (this.outdatedTargetPlatform) {
				return true;
			}
		} catch (error) {
			/* Ignore */
		}
		return false;
	}

	get outdatedTargetPlatform(): boolean {
		return !!this.local && !!this.gallery
			&& ![TargetPlatform.UNDEFINED, TargetPlatform.WEB].includes(this.local.targetPlatform)
			&& this.gallery.properties.targetPlatform !== TargetPlatform.WEB
			&& this.local.targetPlatform !== this.gallery.properties.targetPlatform
			&& semver.eq(this.latestVersion, this.version);
	}

	get telemetryData(): any {
		const { local, gallery } = this;

		if (gallery) {
			return getGalleryExtensionTelemetryData(gallery);
		} else {
			return getLocalExtensionTelemetryData(local!);
		}
	}

	get preview(): boolean {
		return this.gallery ? this.gallery.preview : false;
	}

	get hasPreReleaseVersion(): boolean {
		return !!this.gallery?.hasPreReleaseVersion;
	}

	get hasReleaseVersion(): boolean {
		return !!this.gallery?.hasReleaseVersion;
	}

	private getLocal(): ILocalExtension | undefined {
		return this.local && !this.outdated ? this.local : undefined;
	}

	async getManifest(token: CancellationToken): Promise<IExtensionManifest | null> {
		const local = this.getLocal();
		if (local) {
			return local.manifest;
		}

		if (this.gallery) {
			if (this.gallery.assets.manifest) {
				return this.galleryService.getManifest(this.gallery, token);
			}
			this.logService.error(nls.localize('Manifest is not found', "Manifest is not found"), this.identifier.id);
			return null;
		}

		return null;
	}

	hasReadme(): boolean {
		if (this.local && this.local.readmeUrl) {
			return true;
		}

		if (this.gallery && this.gallery.assets.readme) {
			return true;
		}

		return this.type === ExtensionType.System;
	}

	async getReadme(token: CancellationToken): Promise<string> {
		const local = this.getLocal();
		if (local?.readmeUrl) {
			const content = await this.fileService.readFile(local.readmeUrl);
			return content.value.toString();
		}

		if (this.gallery) {
			if (this.gallery.assets.readme) {
				return this.galleryService.getReadme(this.gallery, token);
			}
			this.telemetryService.publicLog('extensions:NotFoundReadMe', this.telemetryData);
		}

		if (this.type === ExtensionType.System) {
			return Promise.resolve(`# ${this.displayName || this.name}
**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.
## Features
${this.description}
`);
		}

		return Promise.reject(new Error('not available'));
	}

	hasChangelog(): boolean {
		if (this.local && this.local.changelogUrl) {
			return true;
		}

		if (this.gallery && this.gallery.assets.changelog) {
			return true;
		}

		return this.type === ExtensionType.System;
	}

	async getChangelog(token: CancellationToken): Promise<string> {
		const local = this.getLocal();
		if (local?.changelogUrl) {
			const content = await this.fileService.readFile(local.changelogUrl);
			return content.value.toString();
		}

		if (this.gallery?.assets.changelog) {
			return this.galleryService.getChangelog(this.gallery, token);
		}

		if (this.type === ExtensionType.System) {
			return Promise.resolve('Please check the [VS Code Release Notes](command:update.showCurrentReleaseNotes) for changes to the built-in extensions.');
		}

		return Promise.reject(new Error('not available'));
	}

	get categories(): readonly string[] {
		const { local, gallery } = this;
		if (local && local.manifest.categories && !this.outdated) {
			return local.manifest.categories;
		}
		if (gallery) {
			return gallery.categories;
		}
		return [];
	}

	get tags(): readonly string[] {
		const { gallery } = this;
		if (gallery) {
			return gallery.tags.filter(tag => !tag.startsWith('_'));
		}
		return [];
	}

	get dependencies(): string[] {
		const { local, gallery } = this;
		if (local && local.manifest.extensionDependencies && !this.outdated) {
			return local.manifest.extensionDependencies;
		}
		if (gallery) {
			return gallery.properties.dependencies || [];
		}
		return [];
	}

	get extensionPack(): string[] {
		const { local, gallery } = this;
		if (local && local.manifest.extensionPack && !this.outdated) {
			return local.manifest.extensionPack;
		}
		if (gallery) {
			return gallery.properties.extensionPack || [];
		}
		return [];
	}
}

class Extensions extends Disposable {

	static updateExtensionFromControlManifest(extension: Extension, extensionsControlManifest: IExtensionsControlManifest): void {
		extension.isMalicious = extensionsControlManifest.malicious.some(identifier => areSameExtensions(extension.identifier, identifier));
		extension.deprecationInfo = extensionsControlManifest.deprecated ? extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()] : undefined;
	}

	private readonly _onChange = this._register(new Emitter<{ extension: Extension; operation?: InstallOperation } | undefined>());
	get onChange() { return this._onChange.event; }

	private readonly _onReset = this._register(new Emitter<void>());
	get onReset() { return this._onReset.event; }

	private installing: Extension[] = [];
	private uninstalling: Extension[] = [];
	private installed: Extension[] = [];

	constructor(
		readonly server: IExtensionManagementServer,
		private readonly stateProvider: IExtensionStateProvider<ExtensionState>,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._register(server.extensionManagementService.onInstallExtension(e => this.onInstallExtension(e)));
		this._register(server.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(server.extensionManagementService.onUninstallExtension(e => this.onUninstallExtension(e.identifier)));
		this._register(server.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
		this._register(server.extensionManagementService.onDidChangeProfile(e => this.onDidChangeProfile(e.added, e.removed)));
		this._register(extensionEnablementService.onEnablementChanged(e => this.onEnablementChanged(e)));
	}

	get local(): IExtension[] {
		const installing = this.installing
			.filter(e => !this.installed.some(installed => areSameExtensions(installed.identifier, e.identifier)))
			.map(e => e);

		return [...this.installed, ...installing];
	}

	async queryInstalled(): Promise<IExtension[]> {
		const extensionsControlManifest = await this.server.extensionManagementService.getExtensionsControlManifest();
		const all = await this.server.extensionManagementService.getInstalled();

		// dedup user and system extensions by giving priority to user extensions.
		const installed = groupByExtension(all, r => r.identifier).reduce((result, extensions) => {
			const extension = extensions.length === 1 ? extensions[0]
				: extensions.find(e => e.type === ExtensionType.User) || extensions.find(e => e.type === ExtensionType.System);
			result.push(extension!);
			return result;
		}, []);

		const byId = index(this.installed, e => e.local ? e.local.identifier.id : e.identifier.id);
		this.installed = installed.map(local => {
			const extension = byId[local.identifier.id] || this.instantiationService.createInstance(Extension, this.stateProvider, this.server, local, undefined);
			extension.local = local;
			extension.enablementState = this.extensionEnablementService.getEnablementState(local);
			Extensions.updateExtensionFromControlManifest(extension, extensionsControlManifest);
			return extension;
		});
		this._onChange.fire(undefined);
		return this.local;
	}

	async syncInstalledExtensionsWithGallery(galleryExtensions: IGalleryExtension[]): Promise<boolean> {
		let hasChanged: boolean = false;
		const extensions = await this.mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions);
		for (const [extension, gallery] of extensions) {
			// update metadata of the extension if it does not exist
			if (extension.local && !extension.local.identifier.uuid) {
				extension.local = await this.updateMetadata(extension.local, gallery);
			}
			if (!extension.gallery || extension.gallery.version !== gallery.version || extension.gallery.properties.targetPlatform !== gallery.properties.targetPlatform) {
				extension.gallery = gallery;
				this._onChange.fire({ extension });
				hasChanged = true;
			}
		}
		return hasChanged;
	}

	private async mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions: IGalleryExtension[]): Promise<[Extension, IGalleryExtension][]> {
		const mappedExtensions = this.mapInstalledExtensionWithGalleryExtension(galleryExtensions);
		const targetPlatform = await this.server.extensionManagementService.getTargetPlatform();
		const compatibleGalleryExtensions: IGalleryExtension[] = [];
		const compatibleGalleryExtensionsToFetch: IExtensionInfo[] = [];
		await Promise.allSettled(mappedExtensions.map(async ([extension, gallery]) => {
			if (extension.local) {
				if (await this.galleryService.isExtensionCompatible(gallery, extension.local.preRelease, targetPlatform)) {
					compatibleGalleryExtensions.push(gallery);
				} else {
					compatibleGalleryExtensionsToFetch.push({ ...extension.local.identifier, preRelease: extension.local.preRelease });
				}
			}
		}));
		if (compatibleGalleryExtensionsToFetch.length) {
			const result = await this.galleryService.getExtensions(compatibleGalleryExtensionsToFetch, { targetPlatform, compatible: true, queryAllVersions: true }, CancellationToken.None);
			compatibleGalleryExtensions.push(...result);
		}
		return this.mapInstalledExtensionWithGalleryExtension(compatibleGalleryExtensions);
	}

	private mapInstalledExtensionWithGalleryExtension(galleryExtensions: IGalleryExtension[]): [Extension, IGalleryExtension][] {
		const mappedExtensions: [Extension, IGalleryExtension][] = [];
		const byUUID = new Map<string, IGalleryExtension>(), byID = new Map<string, IGalleryExtension>();
		for (const gallery of galleryExtensions) {
			byUUID.set(gallery.identifier.uuid, gallery);
			byID.set(gallery.identifier.id.toLowerCase(), gallery);
		}
		for (const installed of this.installed) {
			if (installed.uuid) {
				const gallery = byUUID.get(installed.uuid);
				if (gallery) {
					mappedExtensions.push([installed, gallery]);
					continue;
				}
			}
			const gallery = byID.get(installed.identifier.id.toLowerCase());
			if (gallery) {
				mappedExtensions.push([installed, gallery]);
			}
		}
		return mappedExtensions;
	}

	private async updateMetadata(localExtension: ILocalExtension, gallery: IGalleryExtension): Promise<ILocalExtension> {
		let isPreReleaseVersion = false;
		if (localExtension.manifest.version !== gallery.version) {
			const galleryWithLocalVersion: IGalleryExtension | undefined = (await this.galleryService.getExtensions([{ ...localExtension.identifier, version: localExtension.manifest.version }], CancellationToken.None))[0];
			isPreReleaseVersion = !!galleryWithLocalVersion?.properties?.isPreReleaseVersion;
		}
		return this.server.extensionManagementService.updateMetadata(localExtension, { id: gallery.identifier.uuid, publisherDisplayName: gallery.publisherDisplayName, publisherId: gallery.publisherId, isPreReleaseVersion });
	}

	canInstall(galleryExtension: IGalleryExtension): Promise<boolean> {
		return this.server.extensionManagementService.canInstall(galleryExtension);
	}

	private onInstallExtension(event: InstallExtensionEvent): void {
		const { source } = event;
		if (source && !URI.isUri(source)) {
			const extension = this.installed.filter(e => areSameExtensions(e.identifier, source.identifier))[0]
				|| this.instantiationService.createInstance(Extension, this.stateProvider, this.server, undefined, source);
			this.installing.push(extension);
			this._onChange.fire({ extension });
		}
	}

	private async onDidChangeProfile(added: ILocalExtension[], removed: ILocalExtension[]): Promise<void> {
		const extensionsControlManifest = await this.server.extensionManagementService.getExtensionsControlManifest();
		for (const addedExtension of added) {
			if (this.installed.find(e => areSameExtensions(e.identifier, addedExtension.identifier))) {
				const extension = this.instantiationService.createInstance(Extension, this.stateProvider, this.server, addedExtension, undefined);
				this.installed.push(extension);
				Extensions.updateExtensionFromControlManifest(extension, extensionsControlManifest);
			}
		}

		if (removed.length) {
			this.installed = this.installed.filter(e => !removed.some(removedExtension => areSameExtensions(e.identifier, removedExtension.identifier)));
		}

		this._onReset.fire();
	}

	private async onDidInstallExtensions(results: readonly InstallExtensionResult[]): Promise<void> {
		for (const event of results) {
			const { local, source } = event;
			const gallery = source && !URI.isUri(source) ? source : undefined;
			const location = source && URI.isUri(source) ? source : undefined;
			const installingExtension = gallery ? this.installing.filter(e => areSameExtensions(e.identifier, gallery.identifier))[0] : null;
			this.installing = installingExtension ? this.installing.filter(e => e !== installingExtension) : this.installing;

			let extension: Extension | undefined = installingExtension ? installingExtension
				: (location || local) ? this.instantiationService.createInstance(Extension, this.stateProvider, this.server, local, undefined)
					: undefined;
			if (extension) {
				if (local) {
					const installed = this.installed.filter(e => areSameExtensions(e.identifier, extension!.identifier))[0];
					if (installed) {
						extension = installed;
					} else {
						this.installed.push(extension);
					}
					extension.local = local;
					if (!extension.gallery) {
						extension.gallery = gallery;
					}
					Extensions.updateExtensionFromControlManifest(extension, await this.server.extensionManagementService.getExtensionsControlManifest());
					extension.enablementState = this.extensionEnablementService.getEnablementState(local);
				}
			}
			this._onChange.fire(!local || !extension ? undefined : { extension, operation: event.operation });
			if (extension && extension.local && !extension.gallery) {
				await this.syncInstalledExtensionWithGallery(extension);
			}
		}
	}

	private async syncInstalledExtensionWithGallery(extension: Extension): Promise<void> {
		if (!this.galleryService.isEnabled()) {
			return;
		}
		const [compatible] = await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: extension.local?.preRelease }], { compatible: true, targetPlatform: await this.server.extensionManagementService.getTargetPlatform() }, CancellationToken.None);
		if (compatible) {
			extension.gallery = compatible;
			this._onChange.fire({ extension });
		}
	}

	private onUninstallExtension(identifier: IExtensionIdentifier): void {
		const extension = this.installed.filter(e => areSameExtensions(e.identifier, identifier))[0];
		if (extension) {
			const uninstalling = this.uninstalling.filter(e => areSameExtensions(e.identifier, identifier))[0] || extension;
			this.uninstalling = [uninstalling, ...this.uninstalling.filter(e => !areSameExtensions(e.identifier, identifier))];
			this._onChange.fire(uninstalling ? { extension: uninstalling } : undefined);
		}
	}

	private onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		const uninstalled = this.uninstalling.find(e => areSameExtensions(e.identifier, identifier)) || this.installed.find(e => areSameExtensions(e.identifier, identifier));
		this.uninstalling = this.uninstalling.filter(e => !areSameExtensions(e.identifier, identifier));
		if (!error) {
			this.installed = this.installed.filter(e => !areSameExtensions(e.identifier, identifier));
		}
		if (uninstalled) {
			this._onChange.fire({ extension: uninstalled });
		}
	}

	private onEnablementChanged(platformExtensions: readonly IPlatformExtension[]) {
		const extensions = this.local.filter(e => platformExtensions.some(p => areSameExtensions(e.identifier, p.identifier)));
		for (const extension of extensions) {
			if (extension.local) {
				const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
				if (enablementState !== extension.enablementState) {
					(extension as Extension).enablementState = enablementState;
					this._onChange.fire({ extension: extension as Extension });
				}
			}
		}
	}

	getExtensionState(extension: Extension): ExtensionState {
		if (extension.gallery && this.installing.some(e => !!e.gallery && areSameExtensions(e.gallery.identifier, extension.gallery!.identifier))) {
			return ExtensionState.Installing;
		}
		if (this.uninstalling.some(e => areSameExtensions(e.identifier, extension.identifier))) {
			return ExtensionState.Uninstalling;
		}
		const local = this.installed.filter(e => e === extension || (e.gallery && extension.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier)))[0];
		return local ? ExtensionState.Installed : ExtensionState.Uninstalled;
	}
}

export class ExtensionsWorkbenchService extends Disposable implements IExtensionsWorkbenchService, IURLHandler {

	private static readonly UpdatesCheckInterval = 1000 * 60 * 60 * 12; // 12 hours
	declare readonly _serviceBrand: undefined;

	private hasOutdatedExtensionsContextKey: IContextKey<boolean>;

	private readonly localExtensions: Extensions | null = null;
	private readonly remoteExtensions: Extensions | null = null;
	private readonly webExtensions: Extensions | null = null;
	private updatesCheckDelayer: ThrottledDelayer<void>;
	private autoUpdateDelayer: ThrottledDelayer<void>;

	private readonly _onChange: Emitter<IExtension | undefined> = new Emitter<IExtension | undefined>();
	get onChange(): Event<IExtension | undefined> { return this._onChange.event; }

	private readonly _onReset = new Emitter<void>();
	get onReset() { return this._onReset.event; }

	readonly preferPreReleases = this.productService.quality !== 'stable';

	private installing: IExtension[] = [];

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IURLService urlService: IURLService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IHostService private readonly hostService: IHostService,
		@IProgressService private readonly progressService: IProgressService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IStorageService private readonly storageService: IStorageService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IIgnoredExtensionsManagementService private readonly extensionsSyncManagementService: IIgnoredExtensionsManagementService,
		@IUserDataAutoSyncService private readonly userDataAutoSyncService: IUserDataAutoSyncService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILanguagePackService private readonly languagePackService: ILanguagePackService,
		@ILocaleService private readonly localeService: ILocaleService,
	) {
		super();
		const preferPreReleasesValue = configurationService.getValue('_extensions.preferPreReleases');
		if (!isUndefined(preferPreReleasesValue)) {
			this.preferPreReleases = !!preferPreReleasesValue;
		}
		this.hasOutdatedExtensionsContextKey = HasOutdatedExtensionsContext.bindTo(contextKeyService);
		if (extensionManagementServerService.localExtensionManagementServer) {
			this.localExtensions = this._register(instantiationService.createInstance(Extensions, extensionManagementServerService.localExtensionManagementServer, ext => this.getExtensionState(ext)));
			this._register(this.localExtensions.onChange(e => this._onChange.fire(e ? e.extension : undefined)));
			this._register(this.localExtensions.onReset(e => { this._onChange.fire(undefined); this._onReset.fire(); }));
		}
		if (extensionManagementServerService.remoteExtensionManagementServer) {
			this.remoteExtensions = this._register(instantiationService.createInstance(Extensions, extensionManagementServerService.remoteExtensionManagementServer, ext => this.getExtensionState(ext)));
			this._register(this.remoteExtensions.onChange(e => this._onChange.fire(e ? e.extension : undefined)));
			this._register(this.remoteExtensions.onReset(e => { this._onChange.fire(undefined); this._onReset.fire(); }));
		}
		if (extensionManagementServerService.webExtensionManagementServer) {
			this.webExtensions = this._register(instantiationService.createInstance(Extensions, extensionManagementServerService.webExtensionManagementServer, ext => this.getExtensionState(ext)));
			this._register(this.webExtensions.onChange(e => this._onChange.fire(e ? e.extension : undefined)));
			this._register(this.webExtensions.onReset(e => { this._onChange.fire(undefined); this._onReset.fire(); }));
		}

		this.updatesCheckDelayer = new ThrottledDelayer<void>(ExtensionsWorkbenchService.UpdatesCheckInterval);
		this.autoUpdateDelayer = new ThrottledDelayer<void>(1000);

		this._register(toDisposable(() => {
			this.updatesCheckDelayer.cancel();
			this.autoUpdateDelayer.cancel();
		}));

		urlService.registerHandler(this);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
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
		}, this));

		this._register(extensionEnablementService.onEnablementChanged(platformExtensions => {
			if (this.getAutoUpdateValue() === 'onlyEnabledExtensions' && platformExtensions.some(e => this.extensionEnablementService.isEnabled(e))) {
				this.checkForUpdates();
			}
		}, this));

		this.queryLocal().then(() => {
			this.resetIgnoreAutoUpdateExtensions();
			this.eventuallyCheckForUpdates(true);
			this._reportTelemetry();
			// Always auto update builtin extensions in web
			if (isWeb && !this.isAutoUpdateEnabled()) {
				this.autoUpdateBuiltinExtensions();
			}
		});

		this._register(this.onChange(() => {
			this.updateContexts();
			this.updateActivity();
		}));

		this._register(this.storageService.onDidChangeValue(e => this.onDidChangeStorage(e)));
	}
	private _reportTelemetry() {
		const extensionIds = this.installed.filter(extension =>
			!extension.isBuiltin &&
			(extension.enablementState === EnablementState.EnabledWorkspace ||
				extension.enablementState === EnablementState.EnabledGlobally))
			.map(extension => ExtensionIdentifier.toKey(extension.identifier.id));
		this.telemetryService.publicLog2<InstalledExtensionsEvent, ExtensionsLoadClassification>('installedExtensions', { extensionIds: extensionIds.join(';'), count: extensionIds.length });
	}

	get local(): IExtension[] {
		const byId = groupByExtension(this.installed, r => r.identifier);
		return byId.reduce((result, extensions) => { result.push(this.getPrimaryExtension(extensions)); return result; }, []);
	}

	get installed(): IExtension[] {
		const result = [];
		if (this.localExtensions) {
			result.push(...this.localExtensions.local);
		}
		if (this.remoteExtensions) {
			result.push(...this.remoteExtensions.local);
		}
		if (this.webExtensions) {
			result.push(...this.webExtensions.local);
		}
		return result;
	}

	get outdated(): IExtension[] {
		const allLocal = [];
		if (this.localExtensions) {
			allLocal.push(...this.localExtensions.local);
		}
		if (this.remoteExtensions) {
			allLocal.push(...this.remoteExtensions.local);
		}
		if (this.webExtensions) {
			allLocal.push(...this.webExtensions.local);
		}
		return allLocal.filter(e => e.outdated && e.local && e.state === ExtensionState.Installed);
	}

	async queryLocal(server?: IExtensionManagementServer): Promise<IExtension[]> {
		if (server) {
			if (this.localExtensions && this.extensionManagementServerService.localExtensionManagementServer === server) {
				return this.localExtensions.queryInstalled();
			}
			if (this.remoteExtensions && this.extensionManagementServerService.remoteExtensionManagementServer === server) {
				return this.remoteExtensions.queryInstalled();
			}
			if (this.webExtensions && this.extensionManagementServerService.webExtensionManagementServer === server) {
				return this.webExtensions.queryInstalled();
			}
		}

		if (this.localExtensions) {
			try {
				await this.localExtensions.queryInstalled();
			}
			catch (error) {
				this.logService.error(error);
			}
		}
		if (this.remoteExtensions) {
			try {
				await this.remoteExtensions.queryInstalled();
			}
			catch (error) {
				this.logService.error(error);
			}
		}
		if (this.webExtensions) {
			try {
				await this.webExtensions.queryInstalled();
			}
			catch (error) {
				this.logService.error(error);
			}
		}
		return this.local;
	}

	queryGallery(token: CancellationToken): Promise<IPager<IExtension>>;
	queryGallery(options: IQueryOptions, token: CancellationToken): Promise<IPager<IExtension>>;
	async queryGallery(arg1: any, arg2?: any): Promise<IPager<IExtension>> {
		const options: IQueryOptions = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
		const token: CancellationToken = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
		options.text = options.text ? this.resolveQueryText(options.text) : options.text;
		options.includePreRelease = isUndefined(options.includePreRelease) ? this.preferPreReleases : options.includePreRelease;

		const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
		try {
			const pager = await this.galleryService.query(options, token);
			this.syncInstalledExtensionsWithGallery(pager.firstPage);
			return {
				firstPage: pager.firstPage.map(gallery => this.fromGallery(gallery, extensionsControlManifest)),
				total: pager.total,
				pageSize: pager.pageSize,
				getPage: async (pageIndex, token) => {
					const page = await pager.getPage(pageIndex, token);
					this.syncInstalledExtensionsWithGallery(page);
					return page.map(gallery => this.fromGallery(gallery, extensionsControlManifest));
				}
			};
		} catch (error) {
			if (/No extension gallery service configured/.test(error.message)) {
				return Promise.resolve(singlePagePager([]));
			}
			throw error;
		}
	}

	getExtensions(extensionInfos: IExtensionInfo[], token: CancellationToken): Promise<IExtension[]>;
	getExtensions(extensionInfos: IExtensionInfo[], options: IExtensionQueryOptions, token: CancellationToken): Promise<IExtension[]>;
	async getExtensions(extensionInfos: IExtensionInfo[], arg1: any, arg2?: any): Promise<IExtension[]> {
		extensionInfos.forEach(e => e.preRelease = e.preRelease ?? this.preferPreReleases);

		const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
		const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, arg1, arg2);
		this.syncInstalledExtensionsWithGallery(galleryExtensions);
		return galleryExtensions.map(gallery => this.fromGallery(gallery, extensionsControlManifest));
	}

	private resolveQueryText(text: string): string {
		text = text.replace(/@web/g, `tag:"${WEB_EXTENSION_TAG}"`);

		const extensionRegex = /\bext:([^\s]+)\b/g;
		if (extensionRegex.test(text)) {
			text = text.replace(extensionRegex, (m, ext) => {

				// Get curated keywords
				const lookup = this.productService.extensionKeywords || {};
				const keywords = lookup[ext] || [];

				// Get mode name
				const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(`.${ext}`));
				const languageName = languageId && this.languageService.getLanguageName(languageId);
				const languageTag = languageName ? ` tag:"${languageName}"` : '';

				// Construct a rich query
				return `tag:"__ext_${ext}" tag:"__ext_.${ext}" ${keywords.map(tag => `tag:"${tag}"`).join(' ')}${languageTag} tag:"${ext}"`;
			});
		}
		return text.substr(0, 350);
	}

	private fromGallery(gallery: IGalleryExtension, extensionsControlManifest: IExtensionsControlManifest): IExtension {
		let extension = this.getInstalledExtensionMatchingGallery(gallery);
		if (!extension) {
			extension = this.instantiationService.createInstance(Extension, ext => this.getExtensionState(ext), undefined, undefined, gallery);
			Extensions.updateExtensionFromControlManifest(<Extension>extension, extensionsControlManifest);
		}
		return extension;
	}

	private getInstalledExtensionMatchingGallery(gallery: IGalleryExtension): IExtension | null {
		for (const installed of this.local) {
			if (installed.identifier.uuid) { // Installed from Gallery
				if (installed.identifier.uuid === gallery.identifier.uuid) {
					return installed;
				}
			} else {
				if (areSameExtensions(installed.identifier, gallery.identifier)) { // Installed from other sources
					return installed;
				}
			}
		}
		return null;
	}

	async open(extension: IExtension, options?: IExtensionEditorOptions): Promise<void> {
		const editor = await this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension), options, options?.sideByside ? SIDE_GROUP : ACTIVE_GROUP);
		if (options?.tab && editor instanceof ExtensionEditor) {
			await editor.openTab(options.tab);
		}
	}

	getExtensionStatus(extension: IExtension): IExtensionsStatus | undefined {
		const extensionsStatus = this.extensionService.getExtensionsStatus();
		for (const id of Object.keys(extensionsStatus)) {
			if (areSameExtensions({ id }, extension.identifier)) {
				return extensionsStatus[id];
			}
		}
		return undefined;
	}

	private getPrimaryExtension(extensions: IExtension[]): IExtension {
		if (extensions.length === 1) {
			return extensions[0];
		}

		const enabledExtensions = extensions.filter(e => e.local && this.extensionEnablementService.isEnabled(e.local));
		if (enabledExtensions.length === 1) {
			return enabledExtensions[0];
		}

		const extensionsToChoose = enabledExtensions.length ? enabledExtensions : extensions;
		const manifest = extensionsToChoose.find(e => e.local && e.local.manifest)?.local?.manifest;

		// Manifest is not found which should not happen.
		// In which case return the first extension.
		if (!manifest) {
			return extensionsToChoose[0];
		}

		const extensionKinds = this.extensionManifestPropertiesService.getExtensionKind(manifest);

		let extension = extensionsToChoose.find(extension => {
			for (const extensionKind of extensionKinds) {
				switch (extensionKind) {
					case 'ui':
						/* UI extension is chosen only if it is installed locally */
						if (extension.server === this.extensionManagementServerService.localExtensionManagementServer) {
							return true;
						}
						return false;
					case 'workspace':
						/* Choose remote workspace extension if exists */
						if (extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
							return true;
						}
						return false;
					case 'web':
						/* Choose web extension if exists */
						if (extension.server === this.extensionManagementServerService.webExtensionManagementServer) {
							return true;
						}
						return false;
				}
			}
			return false;
		});

		if (!extension && this.extensionManagementServerService.localExtensionManagementServer) {
			extension = extensionsToChoose.find(extension => {
				for (const extensionKind of extensionKinds) {
					switch (extensionKind) {
						case 'workspace':
							/* Choose local workspace extension if exists */
							if (extension.server === this.extensionManagementServerService.localExtensionManagementServer) {
								return true;
							}
							return false;
						case 'web':
							/* Choose local web extension if exists */
							if (extension.server === this.extensionManagementServerService.localExtensionManagementServer) {
								return true;
							}
							return false;
					}
				}
				return false;
			});
		}

		if (!extension && this.extensionManagementServerService.webExtensionManagementServer) {
			extension = extensionsToChoose.find(extension => {
				for (const extensionKind of extensionKinds) {
					switch (extensionKind) {
						case 'web':
							/* Choose web extension if exists */
							if (extension.server === this.extensionManagementServerService.webExtensionManagementServer) {
								return true;
							}
							return false;
					}
				}
				return false;
			});
		}

		if (!extension && this.extensionManagementServerService.remoteExtensionManagementServer) {
			extension = extensionsToChoose.find(extension => {
				for (const extensionKind of extensionKinds) {
					switch (extensionKind) {
						case 'web':
							/* Choose remote web extension if exists */
							if (extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
								return true;
							}
							return false;
					}
				}
				return false;
			});
		}

		return extension || extensions[0];
	}

	private getExtensionState(extension: Extension): ExtensionState {
		const isInstalling = this.installing.some(i => areSameExtensions(i.identifier, extension.identifier));
		if (extension.server) {
			const state = (extension.server === this.extensionManagementServerService.localExtensionManagementServer
				? this.localExtensions! : extension.server === this.extensionManagementServerService.remoteExtensionManagementServer ? this.remoteExtensions! : this.webExtensions!).getExtensionState(extension);
			return state === ExtensionState.Uninstalled && isInstalling ? ExtensionState.Installing : state;
		} else if (isInstalling) {
			return ExtensionState.Installing;
		}
		if (this.remoteExtensions) {
			const state = this.remoteExtensions.getExtensionState(extension);
			if (state !== ExtensionState.Uninstalled) {
				return state;
			}
		}
		if (this.webExtensions) {
			const state = this.webExtensions.getExtensionState(extension);
			if (state !== ExtensionState.Uninstalled) {
				return state;
			}
		}
		if (this.localExtensions) {
			return this.localExtensions.getExtensionState(extension);
		}
		return ExtensionState.Uninstalled;
	}

	async checkForUpdates(onlyBuiltin?: boolean): Promise<void> {
		const extensions: Extensions[] = [];
		if (this.localExtensions) {
			extensions.push(this.localExtensions);
		}
		if (this.remoteExtensions) {
			extensions.push(this.remoteExtensions);
		}
		if (this.webExtensions) {
			extensions.push(this.webExtensions);
		}
		if (!extensions.length) {
			return;
		}
		const infos: IExtensionInfo[] = [];
		for (const installed of this.local) {
			if (onlyBuiltin && !installed.isBuiltin) {
				// Skip if check updates only for builtin extensions and current extension is not builtin.
				continue;
			}
			if (installed.isBuiltin && (!installed.local?.identifier.uuid || (!isWeb && this.productService.quality === 'stable'))) {
				// Skip checking updates for a builtin extension if it does not has Marketplace identifier or the current product is VS Code Desktop stable.
				continue;
			}
			infos.push({ ...installed.identifier, preRelease: !!installed.local?.preRelease });
		}
		if (infos.length) {
			const targetPlatform = await extensions[0].server.extensionManagementService.getTargetPlatform();
			const galleryExtensions = await this.galleryService.getExtensions(infos, { targetPlatform, compatible: true }, CancellationToken.None);
			if (galleryExtensions.length) {
				await this.syncInstalledExtensionsWithGallery(galleryExtensions);
			}
		}
	}

	private async syncInstalledExtensionsWithGallery(gallery: IGalleryExtension[]): Promise<void> {
		const extensions: Extensions[] = [];
		if (this.localExtensions) {
			extensions.push(this.localExtensions);
		}
		if (this.remoteExtensions) {
			extensions.push(this.remoteExtensions);
		}
		if (this.webExtensions) {
			extensions.push(this.webExtensions);
		}
		if (!extensions.length) {
			return;
		}
		const result = await Promise.allSettled(extensions.map(extensions => extensions.syncInstalledExtensionsWithGallery(gallery)));
		if (this.isAutoUpdateEnabled() && result.some(r => r.status === 'fulfilled' && r.value)) {
			this.eventuallyAutoUpdateExtensions();
		}
	}

	private getAutoUpdateValue(): boolean | 'onlyEnabledExtensions' {
		const autoUpdate = this.configurationService.getValue<boolean | 'onlyEnabledExtensions'>(AutoUpdateConfigurationKey);
		return isBoolean(autoUpdate) || autoUpdate === 'onlyEnabledExtensions' ? autoUpdate : true;
	}

	private isAutoUpdateEnabled(): boolean {
		return this.getAutoUpdateValue() !== false;
	}

	private isAutoCheckUpdatesEnabled(): boolean {
		return this.configurationService.getValue(AutoCheckUpdatesConfigurationKey);
	}

	private eventuallyCheckForUpdates(immediate = false): void {
		this.updatesCheckDelayer.trigger(async () => {
			if (this.isAutoUpdateEnabled() || this.isAutoCheckUpdatesEnabled()) {
				await this.checkForUpdates();
			}
			this.eventuallyCheckForUpdates();
		}, immediate ? 0 : ExtensionsWorkbenchService.UpdatesCheckInterval).then(undefined, err => null);
	}

	private eventuallyAutoUpdateExtensions(): void {
		this.autoUpdateDelayer.trigger(() => this.autoUpdateExtensions())
			.then(undefined, err => null);
	}

	private async autoUpdateBuiltinExtensions(): Promise<void> {
		await this.checkForUpdates(true);
		const toUpdate = this.outdated.filter(e => e.isBuiltin);
		await Promises.settled(toUpdate.map(e => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true } : undefined)));
	}

	private autoUpdateExtensions(): Promise<any> {
		if (!this.isAutoUpdateEnabled()) {
			return Promise.resolve();
		}

		const toUpdate = this.outdated.filter(e =>
			!this.isAutoUpdateIgnored(new ExtensionKey(e.identifier, e.version)) &&
			(this.getAutoUpdateValue() === true || (e.local && this.extensionEnablementService.isEnabled(e.local)))
		);

		return Promises.settled(toUpdate.map(e => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true } : undefined)));
	}

	async canInstall(extension: IExtension): Promise<boolean> {
		if (!(extension instanceof Extension)) {
			return false;
		}

		if (extension.isMalicious) {
			return false;
		}

		if (extension.deprecationInfo?.disallowInstall) {
			return false;
		}

		if (!extension.gallery) {
			return false;
		}

		if (this.localExtensions && await this.localExtensions.canInstall(extension.gallery)) {
			return true;
		}

		if (this.remoteExtensions && await this.remoteExtensions.canInstall(extension.gallery)) {
			return true;
		}

		if (this.webExtensions && await this.webExtensions.canInstall(extension.gallery)) {
			return true;
		}

		return false;
	}

	install(extension: URI | IExtension, installOptions?: InstallOptions | InstallVSIXOptions, progressLocation?: ProgressLocation): Promise<IExtension> {
		if (extension instanceof URI) {
			return this.installWithProgress(() => this.installFromVSIX(extension, installOptions));
		}

		if (extension.isMalicious) {
			return Promise.reject(new Error(nls.localize('malicious', "This extension is reported to be problematic.")));
		}

		const gallery = extension.gallery;

		if (!gallery) {
			return Promise.reject(new Error('Missing gallery'));
		}

		return this.installWithProgress(() => this.installFromGallery(extension, gallery, installOptions), gallery.displayName, progressLocation);
	}

	canSetLanguage(extension: IExtension): boolean {
		if (!isWeb) {
			return false;
		}

		if (!extension.gallery) {
			return false;
		}

		const locale = this.languagePackService.getLocale(extension.gallery);
		if (!locale) {
			return false;
		}

		return true;
	}

	async setLanguage(extension: IExtension): Promise<void> {
		if (!this.canSetLanguage(extension)) {
			throw new Error('Can not set language');
		}
		const locale = this.languagePackService.getLocale(extension.gallery!);
		if (locale === language) {
			return;
		}
		return this.localeService.setLocale({ id: locale, galleryExtension: extension.gallery, extensionId: extension.identifier.id, label: extension.displayName });
	}

	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void> {
		extensions = Array.isArray(extensions) ? extensions : [extensions];
		return this.promptAndSetEnablement(extensions, enablementState);
	}

	uninstall(extension: IExtension): Promise<void> {
		const ext = extension.local ? extension : this.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0];
		const toUninstall: ILocalExtension | null = ext && ext.local ? ext.local : null;

		if (!toUninstall) {
			return Promise.reject(new Error('Missing local'));
		}
		return this.progressService.withProgress({
			location: ProgressLocation.Extensions,
			title: nls.localize('uninstallingExtension', 'Uninstalling extension....'),
			source: `${toUninstall.identifier.id}`
		}, () => this.extensionManagementService.uninstall(toUninstall).then(() => undefined));
	}

	async installVersion(extension: IExtension, version: string, installOptions: InstallOptions = {}): Promise<IExtension> {
		if (!(extension instanceof Extension)) {
			return extension;
		}

		if (!extension.gallery) {
			throw new Error('Missing gallery');
		}

		const targetPlatform = extension.server ? await extension.server.extensionManagementService.getTargetPlatform() : undefined;
		const [gallery] = await this.galleryService.getExtensions([{ id: extension.gallery.identifier.id, version }], { targetPlatform }, CancellationToken.None);
		if (!gallery) {
			throw new Error(nls.localize('not found', "Unable to install extension '{0}' because the requested version '{1}' is not found.", extension.gallery!.identifier.id, version));
		}

		return this.installWithProgress(async () => {
			installOptions.installGivenVersion = true;
			const installed = await this.installFromGallery(extension, gallery, installOptions);
			if (extension.latestVersion !== version) {
				this.ignoreAutoUpdate(new ExtensionKey(gallery.identifier, version));
			}
			return installed;
		}, gallery.displayName);
	}

	reinstall(extension: IExtension): Promise<IExtension> {
		const ext = extension.local ? extension : this.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0];
		const toReinstall: ILocalExtension | null = ext && ext.local ? ext.local : null;

		if (!toReinstall) {
			return Promise.reject(new Error('Missing local'));
		}

		return this.progressService.withProgress({
			location: ProgressLocation.Extensions,
			source: `${toReinstall.identifier.id}`
		}, () => this.extensionManagementService.reinstallFromGallery(toReinstall).then(() => this.local.filter(local => areSameExtensions(local.identifier, extension.identifier))[0]));
	}

	isExtensionIgnoredToSync(extension: IExtension): boolean {
		return extension.local ? !this.isInstalledExtensionSynced(extension.local)
			: this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
	}

	async toggleExtensionIgnoredToSync(extension: IExtension): Promise<void> {
		const isIgnored = this.isExtensionIgnoredToSync(extension);
		if (extension.local && isIgnored) {
			(<Extension>extension).local = await this.updateSynchronizingInstalledExtension(extension.local, true);
			this._onChange.fire(extension);
		} else {
			this.extensionsSyncManagementService.updateIgnoredExtensions(extension.identifier.id, !isIgnored);
		}
		await this.userDataAutoSyncService.triggerSync(['IgnoredExtensionsUpdated'], false, false);
	}

	private isInstalledExtensionSynced(extension: ILocalExtension): boolean {
		if (extension.isMachineScoped) {
			return false;
		}
		if (this.extensionsSyncManagementService.hasToAlwaysSyncExtension(extension.identifier.id)) {
			return true;
		}
		return !this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
	}

	async updateSynchronizingInstalledExtension(extension: ILocalExtension, sync: boolean): Promise<ILocalExtension> {
		const isMachineScoped = !sync;
		if (extension.isMachineScoped !== isMachineScoped) {
			extension = await this.extensionManagementService.updateExtensionScope(extension, isMachineScoped);
		}
		if (sync) {
			this.extensionsSyncManagementService.updateIgnoredExtensions(extension.identifier.id, false);
		}
		return extension;
	}

	private installWithProgress<T>(installTask: () => Promise<T>, extensionName?: string, progressLocation?: ProgressLocation): Promise<T> {
		const title = extensionName ? nls.localize('installing named extension', "Installing '{0}' extension....", extensionName) : nls.localize('installing extension', 'Installing extension....');
		return this.progressService.withProgress({
			location: progressLocation ?? ProgressLocation.Extensions,
			title
		}, () => installTask());
	}

	private async installFromVSIX(vsix: URI, installOptions?: InstallVSIXOptions): Promise<IExtension> {
		const manifest = await this.extensionManagementService.getManifest(vsix);
		const existingExtension = this.local.find(local => areSameExtensions(local.identifier, { id: getGalleryExtensionId(manifest.publisher, manifest.name) }));
		const { identifier } = await this.extensionManagementService.installVSIX(vsix, manifest, installOptions);

		if (existingExtension && existingExtension.latestVersion !== manifest.version) {
			this.ignoreAutoUpdate(new ExtensionKey(identifier, manifest.version));
		}

		return this.waitAndGetInstalledExtension(identifier);
	}

	private async installFromGallery(extension: IExtension, gallery: IGalleryExtension, installOptions?: InstallOptions): Promise<IExtension> {
		this.installing.push(extension);
		this._onChange.fire(extension);
		try {
			if (extension.state === ExtensionState.Installed && extension.local) {
				await this.extensionManagementService.updateFromGallery(gallery, extension.local, installOptions);
			} else {
				await this.extensionManagementService.installFromGallery(gallery, installOptions);
			}
			return this.waitAndGetInstalledExtension(gallery.identifier);
		} finally {
			this.installing = this.installing.filter(e => e !== extension);
			this._onChange.fire(this.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0]);
		}
	}

	private async waitAndGetInstalledExtension(identifier: IExtensionIdentifier): Promise<IExtension> {
		let installedExtension = this.local.find(local => areSameExtensions(local.identifier, identifier));
		if (!installedExtension) {
			await Event.toPromise(Event.filter(this.onChange, e => !!e && this.local.some(local => areSameExtensions(local.identifier, identifier))));
		}
		installedExtension = this.local.find(local => areSameExtensions(local.identifier, identifier));
		if (!installedExtension) {
			// This should not happen
			throw new Error('Extension should have been installed');
		}
		return installedExtension;
	}

	private promptAndSetEnablement(extensions: IExtension[], enablementState: EnablementState): Promise<any> {
		const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
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
		const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
		if (!enable) {
			for (const extension of extensions) {
				const dependents = this.getDependentsAfterDisablement(extension, allExtensions, this.local);
				if (dependents.length) {
					return new Promise<void>((resolve, reject) => {
						this.notificationService.prompt(Severity.Error, this.getDependentsErrorMessage(extension, allExtensions, dependents), [
							{
								label: nls.localize('disable all', 'Disable All'),
								run: async () => {
									try {
										await this.checkAndSetEnablement(dependents, [extension], enablementState);
										resolve();
									} catch (error) {
										reject(error);
									}
								}
							}
						], {
							onCancel: () => reject(new CancellationError())
						});
					});
				}
			}
		}
		return this.doSetEnablement(allExtensions, enablementState);
	}

	private getExtensionsRecursively(extensions: IExtension[], installed: IExtension[], enablementState: EnablementState, options: { dependencies: boolean; pack: boolean }, checked: IExtension[] = []): IExtension[] {
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
				const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
				return (enable || !i.isBuiltin) // Include all Extensions for enablement and only non builtin extensions for disablement
					&& (options.dependencies || options.pack)
					&& extensions.some(extension =>
						(options.dependencies && extension.dependencies.some(id => areSameExtensions({ id }, i.identifier)))
						|| (options.pack && extension.extensionPack.some(id => areSameExtensions({ id }, i.identifier)))
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
			if (!this.extensionEnablementService.isEnabledEnablementState(i.enablementState)) {
				return false;
			}
			if (extensionsToDisable.indexOf(i) !== -1) {
				return false;
			}
			return i.dependencies.some(dep => [extension, ...extensionsToDisable].some(d => areSameExtensions(d.identifier, { id: dep })));
		});
	}

	private getDependentsErrorMessage(extension: IExtension, allDisabledExtensions: IExtension[], dependents: IExtension[]): string {
		for (const e of [extension, ...allDisabledExtensions]) {
			const dependentsOfTheExtension = dependents.filter(d => d.dependencies.some(id => areSameExtensions({ id }, e.identifier)));
			if (dependentsOfTheExtension.length) {
				return this.getErrorMessageForDisablingAnExtensionWithDependents(e, dependentsOfTheExtension);
			}
		}
		return '';
	}

	private getErrorMessageForDisablingAnExtensionWithDependents(extension: IExtension, dependents: IExtension[]): string {
		if (dependents.length === 1) {
			return nls.localize('singleDependentError', "Cannot disable '{0}' extension alone. '{1}' extension depends on this. Do you want to disable all these extensions?", extension.displayName, dependents[0].displayName);
		}
		if (dependents.length === 2) {
			return nls.localize('twoDependentsError', "Cannot disable '{0}' extension alone. '{1}' and '{2}' extensions depend on this. Do you want to disable all these extensions?",
				extension.displayName, dependents[0].displayName, dependents[1].displayName);
		}
		return nls.localize('multipleDependentsError', "Cannot disable '{0}' extension alone. '{1}', '{2}' and other extensions depend on this. Do you want to disable all these extensions?",
			extension.displayName, dependents[0].displayName, dependents[1].displayName);
	}

	private async doSetEnablement(extensions: IExtension[], enablementState: EnablementState): Promise<boolean[]> {
		const changed = await this.extensionEnablementService.setEnablement(extensions.map(e => e.local!), enablementState);
		for (let i = 0; i < changed.length; i++) {
			if (changed[i]) {
				/* __GDPR__
				"extension:enable" : {
					"owner": "sandy081",
					"${include}": [
						"${GalleryExtensionTelemetryData}"
					]
				}
				*/
				/* __GDPR__
				"extension:disable" : {
					"owner": "sandy081",
					"${include}": [
						"${GalleryExtensionTelemetryData}"
					]
				}
				*/
				this.telemetryService.publicLog(enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace ? 'extension:enable' : 'extension:disable', extensions[i].telemetryData);
			}
		}
		return changed;
	}

	private updateContexts(extension?: Extension): void {
		if (extension && extension.outdated) {
			this.hasOutdatedExtensionsContextKey.set(true);
		} else {
			this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0);
		}
	}

	private _activityCallBack: ((value: void) => void) | null = null;
	private updateActivity(): void {
		if ((this.localExtensions && this.localExtensions.local.some(e => e.state === ExtensionState.Installing || e.state === ExtensionState.Uninstalling))
			|| (this.remoteExtensions && this.remoteExtensions.local.some(e => e.state === ExtensionState.Installing || e.state === ExtensionState.Uninstalling))
			|| (this.webExtensions && this.webExtensions.local.some(e => e.state === ExtensionState.Installing || e.state === ExtensionState.Uninstalling))) {
			if (!this._activityCallBack) {
				this.progressService.withProgress({ location: ProgressLocation.Extensions }, () => new Promise(resolve => this._activityCallBack = resolve));
			}
		} else {
			this._activityCallBack?.();
			this._activityCallBack = null;
		}
	}

	private onError(err: any): void {
		if (isCancellationError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/getaddrinfo ENOTFOUND|getaddrinfo ENOENT|connect EACCES|connect ECONNREFUSED/.test(message)) {
			return;
		}

		this.notificationService.error(err);
	}

	handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
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

		this.queryLocal().then(async local => {
			let extension = local.find(local => areSameExtensions(local.identifier, { id: extensionId }));
			if (!extension) {
				[extension] = await this.getExtensions([{ id: extensionId }], { source: 'uri' }, CancellationToken.None);
			}
			if (extension) {
				await this.hostService.focus();
				await this.open(extension);
			}
		}).then(undefined, error => this.onError(error));
	}

	//#region Ignore Autoupdates when specific versions are installed

	/* TODO: @sandy081 Extension version shall be moved to extensions.json file */
	private _ignoredAutoUpdateExtensions: string[] | undefined;
	private get ignoredAutoUpdateExtensions(): string[] {
		if (!this._ignoredAutoUpdateExtensions) {
			this._ignoredAutoUpdateExtensions = JSON.parse(this.storageService.get('extensions.ignoredAutoUpdateExtension', StorageScope.PROFILE, '[]') || '[]');
		}
		return this._ignoredAutoUpdateExtensions!;
	}

	private set ignoredAutoUpdateExtensions(extensionIds: string[]) {
		this._ignoredAutoUpdateExtensions = distinct(extensionIds.map(id => id.toLowerCase()));
		this.storageService.store('extensions.ignoredAutoUpdateExtension', JSON.stringify(this._ignoredAutoUpdateExtensions), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private onDidChangeStorage(e: IStorageValueChangeEvent): void {
		if (e.scope === StorageScope.PROFILE && e.key === 'extensions.ignoredAutoUpdateExtension') {
			this._ignoredAutoUpdateExtensions = undefined;
		}
	}

	private ignoreAutoUpdate(extensionKey: ExtensionKey): void {
		if (!this.isAutoUpdateIgnored(extensionKey)) {
			this.ignoredAutoUpdateExtensions = [...this.ignoredAutoUpdateExtensions, extensionKey.toString()];
		}
	}

	private isAutoUpdateIgnored(extensionKey: ExtensionKey): boolean {
		return this.ignoredAutoUpdateExtensions.indexOf(extensionKey.toString()) !== -1;
	}

	private resetIgnoreAutoUpdateExtensions(): void {
		this.ignoredAutoUpdateExtensions = this.ignoredAutoUpdateExtensions.filter(extensionId => this.local.some(local => !!local.local && new ExtensionKey(local.identifier, local.version).toString() === extensionId));
	}

	//#endregion

}
