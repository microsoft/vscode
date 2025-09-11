/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as semver from '../../../../base/common/semver/semver.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { index } from '../../../../base/common/arrays.js';
import { CancelablePromise, Promises, ThrottledDelayer, createCancelablePromise } from '../../../../base/common/async.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IPager, singlePagePager } from '../../../../base/common/paging.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import {
	IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions,
	InstallExtensionEvent, DidUninstallExtensionEvent, InstallOperation, WEB_EXTENSION_TAG, InstallExtensionResult,
	IExtensionsControlManifest, IExtensionInfo, IExtensionQueryOptions, IDeprecationInfo, isTargetPlatformCompatible, InstallExtensionInfo, EXTENSION_IDENTIFIER_REGEX,
	InstallOptions, IProductVersion,
	UninstallExtensionInfo,
	TargetPlatformToString,
	IAllowedExtensionsService,
	AllowedExtensionsConfigKey,
	EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT,
	ExtensionManagementError,
	ExtensionManagementErrorCode,
	MaliciousExtensionInfo,
	shouldRequireRepositorySignatureFor,
	IGalleryExtensionVersion
} from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IWorkbenchExtensionManagementService, IResourceExtension } from '../../../services/extensionManagement/common/extensionManagement.js';
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, areSameExtensions, groupByExtension, getGalleryExtensionId, findMatchingMaliciousEntry } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, AutoUpdateConfigurationKey, AutoCheckUpdatesConfigurationKey, HasOutdatedExtensionsContext, AutoUpdateConfigurationValue, InstallExtensionOptions, ExtensionRuntimeState, ExtensionRuntimeActionType, AutoRestartConfigurationKey, VIEWLET_ID, IExtensionsViewPaneContainer, IExtensionsNotification } from '../common/extensions.js';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { IURLService, IURLHandler, IOpenURLOptions } from '../../../../platform/url/common/url.js';
import { ExtensionsInput, IExtensionEditorOptions } from '../common/extensionsInput.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgressOptions, IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import * as resources from '../../../../base/common/resources.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IExtensionManifest, ExtensionType, IExtension as IPlatformExtension, TargetPlatform, ExtensionIdentifier, IExtensionIdentifier, IExtensionDescription, isApplicationScopedExtension } from '../../../../platform/extensions/common/extensions.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IIgnoredExtensionsManagementService } from '../../../../platform/userDataSync/common/ignoredExtensions.js';
import { IUserDataAutoSyncService, IUserDataSyncEnablementService, SyncResource } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { isBoolean, isDefined, isString, isUndefined } from '../../../../base/common/types.js';
import { IExtensionManifestPropertiesService } from '../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService, IExtensionsStatus as IExtensionRuntimeStatus, toExtension, toExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { isWeb, language } from '../../../../base/common/platform.js';
import { getLocale } from '../../../../platform/languagePacks/common/languagePacks.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IDialogService, IFileDialogService, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { areApiProposalsCompatible, isEngineValid } from '../../../../platform/extensions/common/extensionValidator.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ShowCurrentReleaseNotesActionId } from '../../update/common/update.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { fromNow } from '../../../../base/common/date.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';

interface IExtensionStateProvider<T> {
	(extension: Extension): T;
}

interface InstalledExtensionsEvent {
	readonly extensionIds: TelemetryTrustedValue<string>;
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

	private galleryResourcesCache = new Map<string, any>();

	private _missingFromGallery: boolean | undefined;

	constructor(
		private stateProvider: IExtensionStateProvider<ExtensionState>,
		private runtimeStateProvider: IExtensionStateProvider<ExtensionRuntimeState | undefined>,
		public readonly server: IExtensionManagementServer | undefined,
		public local: ILocalExtension | undefined,
		private _gallery: IGalleryExtension | undefined,
		private readonly resourceExtensionInfo: { resourceExtension: IResourceExtension; isWorkspaceScoped: boolean } | undefined,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService
	) {
	}

	get resourceExtension(): IResourceExtension | undefined {
		if (this.resourceExtensionInfo) {
			return this.resourceExtensionInfo.resourceExtension;
		}
		if (this.local?.isWorkspaceScoped) {
			return {
				type: 'resource',
				identifier: this.local.identifier,
				location: this.local.location,
				manifest: this.local.manifest,
				changelogUri: this.local.changelogUrl,
				readmeUri: this.local.readmeUrl,
			};
		}
		return undefined;
	}

	get gallery(): IGalleryExtension | undefined {
		return this._gallery;
	}

	set gallery(gallery: IGalleryExtension | undefined) {
		this._gallery = gallery;
		this.galleryResourcesCache.clear();
	}

	get missingFromGallery(): boolean {
		return !!this._missingFromGallery;
	}

	set missingFromGallery(missing: boolean) {
		this._missingFromGallery = missing;
	}

	get type(): ExtensionType {
		return this.local ? this.local.type : ExtensionType.User;
	}

	get isBuiltin(): boolean {
		return this.local ? this.local.isBuiltin : false;
	}

	get isWorkspaceScoped(): boolean {
		if (this.local) {
			return this.local.isWorkspaceScoped;
		}
		if (this.resourceExtensionInfo) {
			return this.resourceExtensionInfo.isWorkspaceScoped;
		}
		return false;
	}

	get name(): string {
		if (this.gallery) {
			return this.gallery.name;
		}
		return this.getManifestFromLocalOrResource()?.name ?? '';
	}

	get displayName(): string {
		if (this.gallery) {
			return this.gallery.displayName || this.gallery.name;
		}

		return this.getManifestFromLocalOrResource()?.displayName ?? this.name;
	}

	get identifier(): IExtensionIdentifier {
		if (this.gallery) {
			return this.gallery.identifier;
		}
		if (this.resourceExtension) {
			return this.resourceExtension.identifier;
		}
		return this.local?.identifier ?? { id: '' };
	}

	get uuid(): string | undefined {
		return this.gallery ? this.gallery.identifier.uuid : this.local?.identifier.uuid;
	}

	get publisher(): string {
		if (this.gallery) {
			return this.gallery.publisher;
		}
		return this.getManifestFromLocalOrResource()?.publisher ?? '';
	}

	get publisherDisplayName(): string {
		if (this.gallery) {
			return this.gallery.publisherDisplayName || this.gallery.publisher;
		}

		if (this.local?.publisherDisplayName) {
			return this.local.publisherDisplayName;
		}

		return this.publisher;
	}

	get publisherUrl(): URI | undefined {
		return this.gallery?.publisherLink ? URI.parse(this.gallery.publisherLink) : undefined;
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

	get private(): boolean {
		return this.gallery ? this.gallery.private : this.local ? this.local.private : false;
	}

	get pinned(): boolean {
		return !!this.local?.pinned;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.version : this.getManifestFromLocalOrResource()?.version ?? '';
	}

	get description(): string {
		return this.gallery ? this.gallery.description : this.getManifestFromLocalOrResource()?.description ?? '';
	}

	get url(): string | undefined {
		return this.gallery?.detailsLink;
	}

	get iconUrl(): string | undefined {
		return this.galleryIconUrl || this.resourceExtensionIconUrl || this.localIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string | undefined {
		return this.gallery?.assets.icon?.fallbackUri;
	}

	private get localIconUrl(): string | undefined {
		if (this.local && this.local.manifest.icon) {
			return FileAccess.uriToBrowserUri(resources.joinPath(this.local.location, this.local.manifest.icon)).toString(true);
		}
		return undefined;
	}

	private get resourceExtensionIconUrl(): string | undefined {
		if (this.resourceExtension?.manifest.icon) {
			return FileAccess.uriToBrowserUri(resources.joinPath(this.resourceExtension.location, this.resourceExtension.manifest.icon)).toString(true);
		}
		return undefined;
	}

	private get galleryIconUrl(): string | undefined {
		return this.gallery?.assets.icon?.uri;
	}

	private get defaultIconUrl(): string | undefined {
		if (this.type === ExtensionType.System && this.local) {
			if (this.local.manifest && this.local.manifest.contributes) {
				if (Array.isArray(this.local.manifest.contributes.themes) && this.local.manifest.contributes.themes.length) {
					return FileAccess.asBrowserUri('vs/workbench/contrib/extensions/browser/media/theme-icon.png').toString(true);
				}
				if (Array.isArray(this.local.manifest.contributes.grammars) && this.local.manifest.contributes.grammars.length) {
					return FileAccess.asBrowserUri('vs/workbench/contrib/extensions/browser/media/language-icon.svg').toString(true);
				}
			}
		}
		return undefined;
	}

	get repository(): string | undefined {
		return this.gallery && this.gallery.assets.repository ? this.gallery.assets.repository.uri : undefined;
	}

	get licenseUrl(): string | undefined {
		return this.gallery && this.gallery.assets.license ? this.gallery.assets.license.uri : undefined;
	}

	get supportUrl(): string | undefined {
		return this.gallery && this.gallery.supportLink ? this.gallery.supportLink : undefined;
	}

	get state(): ExtensionState {
		return this.stateProvider(this);
	}

	private malicious: MaliciousExtensionInfo | undefined;
	public get isMalicious(): boolean | undefined {
		return !!this.malicious || this.enablementState === EnablementState.DisabledByMalicious;
	}

	public get maliciousInfoLink(): string | undefined {
		return this.malicious?.learnMoreLink;
	}

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

	get ratingUrl(): string | undefined {
		return this.gallery?.ratingLink;
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

	get runtimeState(): ExtensionRuntimeState | undefined {
		return this.runtimeStateProvider(this);
	}

	get telemetryData(): any {
		const { local, gallery } = this;

		if (gallery) {
			return getGalleryExtensionTelemetryData(gallery);
		} else if (local) {
			return getLocalExtensionTelemetryData(local);
		} else {
			return {};
		}
	}

	get preview(): boolean {
		return this.local?.manifest.preview ?? this.gallery?.preview ?? false;
	}

	get preRelease(): boolean {
		return !!this.local?.preRelease;
	}

	get isPreReleaseVersion(): boolean {
		if (this.local) {
			return this.local.isPreReleaseVersion;
		}
		return !!this.gallery?.properties.isPreReleaseVersion;
	}

	get hasPreReleaseVersion(): boolean {
		return this.gallery ? this.gallery.hasPreReleaseVersion : !!this.local?.hasPreReleaseVersion;
	}

	get hasReleaseVersion(): boolean {
		return !!this.resourceExtension || !!this.gallery?.hasReleaseVersion;
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
			return this.getGalleryManifest(token);
		}

		if (this.resourceExtension) {
			return this.resourceExtension.manifest;
		}

		return null;
	}

	async getGalleryManifest(token: CancellationToken = CancellationToken.None): Promise<IExtensionManifest | null> {
		if (this.gallery) {
			let cache = this.galleryResourcesCache.get('manifest');
			if (!cache) {
				if (this.gallery.assets.manifest) {
					this.galleryResourcesCache.set('manifest', cache = this.galleryService.getManifest(this.gallery, token)
						.catch(e => {
							this.galleryResourcesCache.delete('manifest');
							throw e;
						}));
				} else {
					this.logService.error(nls.localize('Manifest is not found', "Manifest is not found"), this.identifier.id);
				}
			}
			return cache;
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

		if (this.resourceExtension?.readmeUri) {
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

		if (this.resourceExtension?.readmeUri) {
			const content = await this.fileService.readFile(this.resourceExtension?.readmeUri);
			return content.value.toString();
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
			return Promise.resolve(`Please check the [VS Code Release Notes](command:${ShowCurrentReleaseNotesActionId}) for changes to the built-in extensions.`);
		}

		return Promise.reject(new Error('not available'));
	}

	get categories(): readonly string[] {
		const { local, gallery, resourceExtension } = this;
		if (local && local.manifest.categories && !this.outdated) {
			return local.manifest.categories;
		}
		if (gallery) {
			return gallery.categories;
		}
		if (resourceExtension) {
			return resourceExtension.manifest.categories ?? [];
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
		const { local, gallery, resourceExtension } = this;
		if (local && local.manifest.extensionDependencies && !this.outdated) {
			return local.manifest.extensionDependencies;
		}
		if (gallery) {
			return gallery.properties.dependencies || [];
		}
		if (resourceExtension) {
			return resourceExtension.manifest.extensionDependencies || [];
		}
		return [];
	}

	get extensionPack(): string[] {
		const { local, gallery, resourceExtension } = this;
		if (local && local.manifest.extensionPack && !this.outdated) {
			return local.manifest.extensionPack;
		}
		if (gallery) {
			return gallery.properties.extensionPack || [];
		}
		if (resourceExtension) {
			return resourceExtension.manifest.extensionPack || [];
		}
		return [];
	}

	setExtensionsControlManifest(extensionsControlManifest: IExtensionsControlManifest): void {
		this.malicious = findMatchingMaliciousEntry(this.identifier, extensionsControlManifest.malicious);
		this.deprecationInfo = extensionsControlManifest.deprecated ? extensionsControlManifest.deprecated[this.identifier.id.toLowerCase()] : undefined;
	}

	private getManifestFromLocalOrResource(): IExtensionManifest | null {
		if (this.local) {
			return this.local.manifest;
		}
		if (this.resourceExtension) {
			return this.resourceExtension.manifest;
		}
		return null;
	}
}

const EXTENSIONS_AUTO_UPDATE_KEY = 'extensions.autoUpdate';
const EXTENSIONS_DONOT_AUTO_UPDATE_KEY = 'extensions.donotAutoUpdate';
const EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY = 'extensions.dismissedNotifications';

class Extensions extends Disposable {

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
		private readonly runtimeStateProvider: IExtensionStateProvider<ExtensionRuntimeState | undefined>,
		private readonly isWorkspaceServer: boolean,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkbenchExtensionManagementService private readonly workbenchExtensionManagementService: IWorkbenchExtensionManagementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._register(server.extensionManagementService.onInstallExtension(e => this.onInstallExtension(e)));
		this._register(server.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(server.extensionManagementService.onUninstallExtension(e => this.onUninstallExtension(e.identifier)));
		this._register(server.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
		this._register(server.extensionManagementService.onDidUpdateExtensionMetadata(e => this.onDidUpdateExtensionMetadata(e.local)));
		this._register(server.extensionManagementService.onDidChangeProfile(() => this.reset()));
		this._register(extensionEnablementService.onEnablementChanged(e => this.onEnablementChanged(e)));
		this._register(Event.any(this.onChange, this.onReset)(() => this._local = undefined));
		if (this.isWorkspaceServer) {
			this._register(this.workbenchExtensionManagementService.onInstallExtension(e => {
				if (e.workspaceScoped) {
					this.onInstallExtension(e);
				}
			}));
			this._register(this.workbenchExtensionManagementService.onDidInstallExtensions(e => {
				const result = e.filter(e => e.workspaceScoped);
				if (result.length) {
					this.onDidInstallExtensions(result);
				}
			}));
			this._register(this.workbenchExtensionManagementService.onUninstallExtension(e => {
				if (e.workspaceScoped) {
					this.onUninstallExtension(e.identifier);
				}
			}));
			this._register(this.workbenchExtensionManagementService.onDidUninstallExtension(e => {
				if (e.workspaceScoped) {
					this.onDidUninstallExtension(e);
				}
			}));
		}
	}

	private _local: Extension[] | undefined;
	get local(): Extension[] {
		if (!this._local) {
			this._local = [];
			for (const extension of this.installed) {
				this._local.push(extension);
			}
			for (const extension of this.installing) {
				if (!this.installed.some(installed => areSameExtensions(installed.identifier, extension.identifier))) {
					this._local.push(extension);
				}
			}
		}
		return this._local;
	}

	async queryInstalled(productVersion: IProductVersion): Promise<IExtension[]> {
		await this.fetchInstalledExtensions(productVersion);
		this._onChange.fire(undefined);
		return this.local;
	}

	async syncInstalledExtensionsWithGallery(galleryExtensions: IGalleryExtension[], productVersion: IProductVersion, flagExtensionsMissingFromGallery?: IExtensionInfo[]): Promise<void> {
		const extensions = await this.mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions, productVersion);
		for (const [extension, gallery] of extensions) {
			// update metadata of the extension if it does not exist
			if (extension.local && !extension.local.identifier.uuid) {
				extension.local = await this.updateMetadata(extension.local, gallery);
			}
			if (!extension.gallery || extension.gallery.version !== gallery.version || extension.gallery.properties.targetPlatform !== gallery.properties.targetPlatform) {
				extension.gallery = gallery;
				this._onChange.fire({ extension });
			}
		}
		// Detect extensions that do not have a corresponding gallery entry.
		if (flagExtensionsMissingFromGallery) {
			const extensionsToQuery = [];
			for (const extension of this.local) {
				// Extension is already paired with a gallery object
				if (extension.gallery) {
					continue;
				}
				// Already flagged as missing from gallery
				if (extension.missingFromGallery) {
					continue;
				}
				// A UUID indicates extension originated from gallery
				if (!extension.identifier.uuid) {
					continue;
				}
				// Extension is not present in the set we are concerned about
				if (!flagExtensionsMissingFromGallery.some(f => areSameExtensions(f, extension.identifier))) {
					continue;
				}
				extensionsToQuery.push(extension);
			}
			if (extensionsToQuery.length) {
				const queryResult = await this.galleryService.getExtensions(extensionsToQuery.map(e => ({ ...e.identifier, version: e.version })), CancellationToken.None);
				const queriedIds: string[] = [];
				const missingIds: string[] = [];
				for (const extension of extensionsToQuery) {
					queriedIds.push(extension.identifier.id);
					const gallery = queryResult.find(g => areSameExtensions(g.identifier, extension.identifier));
					if (gallery) {
						extension.gallery = gallery;
					} else {
						extension.missingFromGallery = true;
						missingIds.push(extension.identifier.id);
					}
					this._onChange.fire({ extension });
				}
				type MissingFromGalleryClassification = {
					owner: 'joshspicer';
					comment: 'Report when installed extensions are no longer available in the gallery';
					queriedIds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extensions queried as potentially missing from gallery' };
					missingIds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extensions determined missing from gallery' };
				};
				type MissingFromGalleryEvent = {
					readonly queriedIds: TelemetryTrustedValue<string>;
					readonly missingIds: TelemetryTrustedValue<string>;
				};
				this.telemetryService.publicLog2<MissingFromGalleryEvent, MissingFromGalleryClassification>('extensions:missingFromGallery', {
					queriedIds: new TelemetryTrustedValue(queriedIds.join(';')),
					missingIds: new TelemetryTrustedValue(missingIds.join(';'))
				});
			}
		}
	}

	private async mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions: IGalleryExtension[], productVersion: IProductVersion): Promise<[Extension, IGalleryExtension][]> {
		const mappedExtensions = this.mapInstalledExtensionWithGalleryExtension(galleryExtensions);
		const targetPlatform = await this.server.extensionManagementService.getTargetPlatform();
		const compatibleGalleryExtensions: IGalleryExtension[] = [];
		const compatibleGalleryExtensionsToFetch: IExtensionInfo[] = [];
		await Promise.allSettled(mappedExtensions.map(async ([extension, gallery]) => {
			if (extension.local) {
				if (await this.galleryService.isExtensionCompatible(gallery, extension.local.preRelease, targetPlatform, productVersion)) {
					compatibleGalleryExtensions.push(gallery);
				} else {
					compatibleGalleryExtensionsToFetch.push({ ...extension.local.identifier, preRelease: extension.local.preRelease });
				}
			}
		}));
		if (compatibleGalleryExtensionsToFetch.length) {
			const result = await this.galleryService.getExtensions(compatibleGalleryExtensionsToFetch, { targetPlatform, compatible: true, queryAllVersions: true, productVersion }, CancellationToken.None);
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
			if (installed.local?.source !== 'resource') {
				const gallery = byID.get(installed.identifier.id.toLowerCase());
				if (gallery) {
					mappedExtensions.push([installed, gallery]);
				}
			}
		}
		return mappedExtensions;
	}

	private async updateMetadata(localExtension: ILocalExtension, gallery: IGalleryExtension): Promise<ILocalExtension> {
		let isPreReleaseVersion = false;
		if (localExtension.manifest.version !== gallery.version) {
			type GalleryServiceMatchInstalledExtensionClassification = {
				owner: 'sandy081';
				comment: 'Report when a request is made to update metadata of an installed extension';
			};
			this.telemetryService.publicLog2<{}, GalleryServiceMatchInstalledExtensionClassification>('galleryService:updateMetadata');
			const galleryWithLocalVersion: IGalleryExtension | undefined = (await this.galleryService.getExtensions([{ ...localExtension.identifier, version: localExtension.manifest.version }], CancellationToken.None))[0];
			isPreReleaseVersion = !!galleryWithLocalVersion?.properties?.isPreReleaseVersion;
		}
		return this.workbenchExtensionManagementService.updateMetadata(localExtension, { id: gallery.identifier.uuid, publisherDisplayName: gallery.publisherDisplayName, publisherId: gallery.publisherId, isPreReleaseVersion });
	}

	canInstall(galleryExtension: IGalleryExtension): Promise<true | IMarkdownString> {
		return this.server.extensionManagementService.canInstall(galleryExtension);
	}

	private onInstallExtension(event: InstallExtensionEvent): void {
		const { source } = event;
		if (source && !URI.isUri(source)) {
			const extension = this.installed.find(e => areSameExtensions(e.identifier, source.identifier))
				?? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, undefined, source, undefined);
			this.installing.push(extension);
			this._onChange.fire({ extension });
		}
	}

	private async fetchInstalledExtensions(productVersion?: IProductVersion): Promise<void> {
		const extensionsControlManifest = await this.server.extensionManagementService.getExtensionsControlManifest();
		const all = await this.server.extensionManagementService.getInstalled(undefined, undefined, productVersion);
		if (this.isWorkspaceServer) {
			all.push(...await this.workbenchExtensionManagementService.getInstalledWorkspaceExtensions(true));
		}

		// dedup workspace, user and system extensions by giving priority to workspace first and then to user extension.
		const installed = groupByExtension(all, r => r.identifier).reduce((result, extensions) => {
			if (extensions.length === 1) {
				result.push(extensions[0]);
			} else {
				let workspaceExtension: ILocalExtension | undefined,
					userExtension: ILocalExtension | undefined,
					systemExtension: ILocalExtension | undefined;
				for (const extension of extensions) {
					if (extension.isWorkspaceScoped) {
						workspaceExtension = extension;
					} else if (extension.type === ExtensionType.User) {
						userExtension = extension;
					} else {
						systemExtension = extension;
					}
				}
				const extension = workspaceExtension ?? userExtension ?? systemExtension;
				if (extension) {
					result.push(extension);
				}
			}
			return result;
		}, []);

		const byId = index(this.installed, e => e.local ? e.local.identifier.id : e.identifier.id);
		this.installed = installed.map(local => {
			const extension = byId[local.identifier.id] || this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, undefined, undefined);
			extension.local = local;
			extension.enablementState = this.extensionEnablementService.getEnablementState(local);
			extension.setExtensionsControlManifest(extensionsControlManifest);
			return extension;
		});
	}

	private async reset(): Promise<void> {
		this.installed = [];
		this.installing = [];
		this.uninstalling = [];
		await this.fetchInstalledExtensions();
		this._onReset.fire();
	}

	private async onDidInstallExtensions(results: readonly InstallExtensionResult[]): Promise<void> {
		const extensions: Extension[] = [];
		for (const event of results) {
			const { local, source } = event;
			const gallery = source && !URI.isUri(source) ? source : undefined;
			const location = source && URI.isUri(source) ? source : undefined;
			const installingExtension = gallery ? this.installing.filter(e => areSameExtensions(e.identifier, gallery.identifier))[0] : null;
			this.installing = installingExtension ? this.installing.filter(e => e !== installingExtension) : this.installing;

			let extension: Extension | undefined = installingExtension ? installingExtension
				: (location || local) ? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, undefined, undefined)
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
					extension.enablementState = this.extensionEnablementService.getEnablementState(local);
				}
				extensions.push(extension);
			}
			this._onChange.fire(!local || !extension ? undefined : { extension, operation: event.operation });
		}

		if (extensions.length) {
			const manifest = await this.server.extensionManagementService.getExtensionsControlManifest();
			for (const extension of extensions) {
				extension.setExtensionsControlManifest(manifest);
			}
			this.matchInstalledExtensionsWithGallery(extensions);
		}
	}

	private async onDidUpdateExtensionMetadata(local: ILocalExtension): Promise<void> {
		const extension = this.installed.find(e => areSameExtensions(e.identifier, local.identifier));
		if (extension?.local) {
			extension.local = local;
			this._onChange.fire({ extension });
		}
	}

	private async matchInstalledExtensionsWithGallery(extensions: Extension[]): Promise<void> {
		const toMatch = extensions.filter(e => e.local && !e.gallery && e.local.source !== 'resource');
		if (!toMatch.length) {
			return;
		}
		if (!this.galleryService.isEnabled()) {
			return;
		}
		const galleryExtensions = await this.galleryService.getExtensions(toMatch.map(e => ({ ...e.identifier, preRelease: e.local?.preRelease })), { compatible: true, targetPlatform: await this.server.extensionManagementService.getTargetPlatform() }, CancellationToken.None);
		for (const extension of extensions) {
			const compatible = galleryExtensions.find(e => areSameExtensions(e.identifier, extension.identifier));
			if (compatible) {
				extension.gallery = compatible;
				this._onChange.fire({ extension });
			}
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
					extension.enablementState = enablementState;
					this._onChange.fire({ extension });
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
	private readonly extensionsServers: Extensions[] = [];

	private updatesCheckDelayer: ThrottledDelayer<void>;
	private autoUpdateDelayer: ThrottledDelayer<void>;

	private readonly _onChange = this._register(new Emitter<IExtension | undefined>());
	get onChange(): Event<IExtension | undefined> { return this._onChange.event; }

	private extensionsNotification: IExtensionsNotification & { readonly key: string } | undefined;
	private readonly _onDidChangeExtensionsNotification = new Emitter<IExtensionsNotification | undefined>();
	readonly onDidChangeExtensionsNotification = this._onDidChangeExtensionsNotification.event;

	private readonly _onReset = new Emitter<void>();
	get onReset() { return this._onReset.event; }

	private installing: IExtension[] = [];
	private tasksInProgress: CancelablePromise<any>[] = [];

	readonly whenInitialized: Promise<void>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionGalleryManifestService private readonly extensionGalleryManifestService: IExtensionGalleryManifestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IURLService urlService: IURLService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IHostService private readonly hostService: IHostService,
		@IProgressService private readonly progressService: IProgressService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IIgnoredExtensionsManagementService private readonly extensionsSyncManagementService: IIgnoredExtensionsManagementService,
		@IUserDataAutoSyncService private readonly userDataAutoSyncService: IUserDataAutoSyncService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILocaleService private readonly localeService: ILocaleService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IViewsService private readonly viewsService: IViewsService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
	) {
		super();

		this.hasOutdatedExtensionsContextKey = HasOutdatedExtensionsContext.bindTo(contextKeyService);
		if (extensionManagementServerService.localExtensionManagementServer) {
			this.localExtensions = this._register(instantiationService.createInstance(Extensions,
				extensionManagementServerService.localExtensionManagementServer,
				ext => this.getExtensionState(ext),
				ext => this.getRuntimeState(ext),
				!extensionManagementServerService.remoteExtensionManagementServer
			));
			this._register(this.localExtensions.onChange(e => this.onDidChangeExtensions(e?.extension)));
			this._register(this.localExtensions.onReset(e => this.reset()));
			this.extensionsServers.push(this.localExtensions);
		}
		if (extensionManagementServerService.remoteExtensionManagementServer) {
			this.remoteExtensions = this._register(instantiationService.createInstance(Extensions,
				extensionManagementServerService.remoteExtensionManagementServer,
				ext => this.getExtensionState(ext),
				ext => this.getRuntimeState(ext),
				true
			));
			this._register(this.remoteExtensions.onChange(e => this.onDidChangeExtensions(e?.extension)));
			this._register(this.remoteExtensions.onReset(e => this.reset()));
			this.extensionsServers.push(this.remoteExtensions);
		}
		if (extensionManagementServerService.webExtensionManagementServer) {
			this.webExtensions = this._register(instantiationService.createInstance(Extensions,
				extensionManagementServerService.webExtensionManagementServer,
				ext => this.getExtensionState(ext),
				ext => this.getRuntimeState(ext),
				!(extensionManagementServerService.remoteExtensionManagementServer || extensionManagementServerService.localExtensionManagementServer)
			));
			this._register(this.webExtensions.onChange(e => this.onDidChangeExtensions(e?.extension)));
			this._register(this.webExtensions.onReset(e => this.reset()));
			this.extensionsServers.push(this.webExtensions);
		}

		this.updatesCheckDelayer = new ThrottledDelayer<void>(ExtensionsWorkbenchService.UpdatesCheckInterval);
		this.autoUpdateDelayer = new ThrottledDelayer<void>(1000);
		this._register(toDisposable(() => {
			this.updatesCheckDelayer.cancel();
			this.autoUpdateDelayer.cancel();
		}));

		urlService.registerHandler(this);

		this.whenInitialized = this.initialize();
	}

	private async initialize(): Promise<void> {
		// initialize local extensions
		await Promise.all([this.queryLocal(), this.extensionService.whenInstalledExtensionsRegistered()]);
		if (this._store.isDisposed) {
			return;
		}
		this.onDidChangeRunningExtensions(this.extensionService.extensions, []);
		this._register(this.extensionService.onDidChangeExtensions(({ added, removed }) => this.onDidChangeRunningExtensions(added, removed)));

		await this.lifecycleService.when(LifecyclePhase.Eventually);
		if (this._store.isDisposed) {
			return;
		}

		this.initializeAutoUpdate();
		this.updateExtensionsNotificaiton();
		this.reportInstalledExtensionsTelemetry();
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, this._store)(e => this.onDidDismissedNotificationsValueChange()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_AUTO_UPDATE_KEY, this._store)(e => this.onDidSelectedExtensionToAutoUpdateValueChange()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_DONOT_AUTO_UPDATE_KEY, this._store)(e => this.onDidSelectedExtensionToAutoUpdateValueChange()));
		this._register(Event.debounce(this.onChange, () => undefined, 100)(() => {
			this.updateExtensionsNotificaiton();
			this.reportProgressFromOtherSources();
		}));
	}

	private initializeAutoUpdate(): void {
		// Register listeners for auto updates
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
				if (this.isAutoUpdateEnabled()) {
					this.eventuallyAutoUpdateExtensions();
				}
			}
			if (e.affectsConfiguration(AutoCheckUpdatesConfigurationKey)) {
				if (this.isAutoCheckUpdatesEnabled()) {
					this.checkForUpdates(`Enabled auto check updates`);
				}
			}
		}));
		this._register(this.extensionEnablementService.onEnablementChanged(platformExtensions => {
			if (this.getAutoUpdateValue() === 'onlyEnabledExtensions' && platformExtensions.some(e => this.extensionEnablementService.isEnabled(e))) {
				this.checkForUpdates('Extension enablement changed');
			}
		}));
		this._register(Event.debounce(this.onChange, () => undefined, 100)(() => this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0)));
		this._register(this.updateService.onStateChange(e => {
			if ((e.type === StateType.CheckingForUpdates && e.explicit) || e.type === StateType.AvailableForDownload || e.type === StateType.Downloaded) {
				this.telemetryService.publicLog2<{}, {
					owner: 'sandy081';
					comment: 'Report when update check is triggered on product update';
				}>('extensions:updatecheckonproductupdate');
				if (this.isAutoCheckUpdatesEnabled()) {
					this.checkForUpdates('Product update');
				}
			}
		}));

		this._register(this.allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => {
			if (this.isAutoCheckUpdatesEnabled()) {
				this.checkForUpdates('Allowed extensions changed');
			}
		}));

		// Update AutoUpdate Contexts
		this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0);

		// Check for updates
		this.eventuallyCheckForUpdates(true);

		if (isWeb) {
			this.syncPinnedBuiltinExtensions();
			// Always auto update builtin extensions in web
			if (!this.isAutoUpdateEnabled()) {
				this.autoUpdateBuiltinExtensions();
			}
		}

		this.registerAutoRestartListener();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoRestartConfigurationKey)) {
				this.registerAutoRestartListener();
			}
		}));
	}

	private isAutoUpdateEnabled(): boolean {
		return this.getAutoUpdateValue() !== false;
	}

	getAutoUpdateValue(): AutoUpdateConfigurationValue {
		const autoUpdate = this.configurationService.getValue<AutoUpdateConfigurationValue>(AutoUpdateConfigurationKey);
		if (<any>autoUpdate === 'onlySelectedExtensions') {
			return false;
		}
		return isBoolean(autoUpdate) || autoUpdate === 'onlyEnabledExtensions' ? autoUpdate : true;
	}

	async updateAutoUpdateForAllExtensions(isAutoUpdateEnabled: boolean): Promise<void> {
		const wasAutoUpdateEnabled = this.isAutoUpdateEnabled();
		if (wasAutoUpdateEnabled === isAutoUpdateEnabled) {
			return;
		}

		const result = await this.dialogService.confirm({
			title: nls.localize('confirmEnableDisableAutoUpdate', "Auto Update Extensions"),
			message: isAutoUpdateEnabled
				? nls.localize('confirmEnableAutoUpdate', "Do you want to enable auto update for all extensions?")
				: nls.localize('confirmDisableAutoUpdate', "Do you want to disable auto update for all extensions?"),
			detail: nls.localize('confirmEnableDisableAutoUpdateDetail', "This will reset any auto update settings you have set for individual extensions."),
		});
		if (!result.confirmed) {
			return;
		}

		// Reset extensions enabled for auto update first to prevent them from being updated
		this.setEnabledAutoUpdateExtensions([]);

		await this.configurationService.updateValue(AutoUpdateConfigurationKey, isAutoUpdateEnabled);

		this.setDisabledAutoUpdateExtensions([]);
		await this.updateExtensionsPinnedState(!isAutoUpdateEnabled);
		this._onChange.fire(undefined);
	}

	private readonly autoRestartListenerDisposable = this._register(new MutableDisposable());
	private registerAutoRestartListener(): void {
		this.autoRestartListenerDisposable.value = undefined;
		if (this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
			this.autoRestartListenerDisposable.value = this.hostService.onDidChangeFocus(focus => {
				if (!focus && this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
					this.updateRunningExtensions(undefined, true);
				}
			});
		}
	}

	private reportInstalledExtensionsTelemetry() {
		const extensionIds = this.installed.filter(extension =>
			!extension.isBuiltin &&
			(extension.enablementState === EnablementState.EnabledWorkspace ||
				extension.enablementState === EnablementState.EnabledGlobally))
			.map(extension => ExtensionIdentifier.toKey(extension.identifier.id));
		this.telemetryService.publicLog2<InstalledExtensionsEvent, ExtensionsLoadClassification>('installedExtensions', { extensionIds: new TelemetryTrustedValue(extensionIds.join(';')), count: extensionIds.length });
	}

	private async onDidChangeRunningExtensions(added: ReadonlyArray<IExtensionDescription>, removed: ReadonlyArray<IExtensionDescription>): Promise<void> {
		const changedExtensions: IExtension[] = [];
		const extensionsToFetch: IExtensionDescription[] = [];
		for (const desc of added) {
			const extension = this.installed.find(e => areSameExtensions({ id: desc.identifier.value, uuid: desc.uuid }, e.identifier));
			if (extension) {
				changedExtensions.push(extension);
			} else {
				extensionsToFetch.push(desc);
			}
		}
		const workspaceExtensions: IExtensionDescription[] = [];
		for (const desc of removed) {
			if (this.workspaceContextService.isInsideWorkspace(desc.extensionLocation)) {
				workspaceExtensions.push(desc);
			} else {
				extensionsToFetch.push(desc);
			}
		}
		if (extensionsToFetch.length) {
			const extensions = await this.getExtensions(extensionsToFetch.map(e => ({ id: e.identifier.value, uuid: e.uuid })), CancellationToken.None);
			changedExtensions.push(...extensions);
		}
		if (workspaceExtensions.length) {
			const extensions = await this.getResourceExtensions(workspaceExtensions.map(e => e.extensionLocation), true);
			changedExtensions.push(...extensions);
		}
		for (const changedExtension of changedExtensions) {
			this._onChange.fire(changedExtension);
		}
	}

	private updateExtensionsPinnedState(pinned: boolean): Promise<void> {
		return this.progressService.withProgress({
			location: ProgressLocation.Extensions,
			title: nls.localize('updatingExtensions', "Updating Extensions Auto Update State"),
		}, () => this.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned));
	}

	private reset(): void {
		for (const task of this.tasksInProgress) {
			task.cancel();
		}
		this.tasksInProgress = [];
		this.installing = [];
		this.onDidChangeExtensions();
		this._onReset.fire();
	}

	private onDidChangeExtensions(extension?: IExtension): void {
		this._installed = undefined;
		this._local = undefined;
		this._onChange.fire(extension);
	}

	private _local: IExtension[] | undefined;
	get local(): IExtension[] {
		if (!this._local) {
			if (this.extensionsServers.length === 1) {
				this._local = this.installed;
			} else {
				this._local = [];
				const byId = groupByExtension(this.installed, r => r.identifier);
				for (const extensions of byId) {
					this._local.push(this.getPrimaryExtension(extensions));
				}
			}
		}
		return this._local;
	}

	private _installed: IExtension[] | undefined;
	get installed(): IExtension[] {
		if (!this._installed) {
			this._installed = [];
			for (const extensions of this.extensionsServers) {
				for (const extension of extensions.local) {
					this._installed.push(extension);
				}
			}
		}
		return this._installed;
	}

	get outdated(): IExtension[] {
		return this.installed.filter(e => e.outdated && e.local && e.state === ExtensionState.Installed);
	}

	async queryLocal(server?: IExtensionManagementServer): Promise<IExtension[]> {
		if (server) {
			if (this.localExtensions && this.extensionManagementServerService.localExtensionManagementServer === server) {
				return this.localExtensions.queryInstalled(this.getProductVersion());
			}
			if (this.remoteExtensions && this.extensionManagementServerService.remoteExtensionManagementServer === server) {
				return this.remoteExtensions.queryInstalled(this.getProductVersion());
			}
			if (this.webExtensions && this.extensionManagementServerService.webExtensionManagementServer === server) {
				return this.webExtensions.queryInstalled(this.getProductVersion());
			}
		}

		if (this.localExtensions) {
			try {
				await this.localExtensions.queryInstalled(this.getProductVersion());
			}
			catch (error) {
				this.logService.error(error);
			}
		}
		if (this.remoteExtensions) {
			try {
				await this.remoteExtensions.queryInstalled(this.getProductVersion());
			}
			catch (error) {
				this.logService.error(error);
			}
		}
		if (this.webExtensions) {
			try {
				await this.webExtensions.queryInstalled(this.getProductVersion());
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
		if (!this.galleryService.isEnabled()) {
			return singlePagePager([]);
		}

		const options: IQueryOptions = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
		const token: CancellationToken = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
		options.text = options.text ? this.resolveQueryText(options.text) : options.text;
		options.includePreRelease = isUndefined(options.includePreRelease) ? this.extensionManagementService.preferPreReleases : options.includePreRelease;

		const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
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
	}

	getExtensions(extensionInfos: IExtensionInfo[], token: CancellationToken): Promise<IExtension[]>;
	getExtensions(extensionInfos: IExtensionInfo[], options: IExtensionQueryOptions, token: CancellationToken): Promise<IExtension[]>;
	async getExtensions(extensionInfos: IExtensionInfo[], arg1: any, arg2?: any): Promise<IExtension[]> {
		if (!this.galleryService.isEnabled()) {
			return [];
		}

		extensionInfos.forEach(e => e.preRelease = e.preRelease ?? this.extensionManagementService.preferPreReleases);
		const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
		const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, arg1, arg2);
		this.syncInstalledExtensionsWithGallery(galleryExtensions);
		return galleryExtensions.map(gallery => this.fromGallery(gallery, extensionsControlManifest));
	}

	async getResourceExtensions(locations: URI[], isWorkspaceScoped: boolean): Promise<IExtension[]> {
		const resourceExtensions = await this.extensionManagementService.getExtensions(locations);
		return resourceExtensions.map(resourceExtension => this.getInstalledExtensionMatchingLocation(resourceExtension.location)
			?? this.instantiationService.createInstance(Extension, ext => this.getExtensionState(ext), ext => this.getRuntimeState(ext), undefined, undefined, undefined, { resourceExtension, isWorkspaceScoped }));
	}

	private onDidDismissedNotificationsValueChange(): void {
		if (
			this.dismissedNotificationsValue !== this.getDismissedNotificationsValue() /* This checks if current window changed the value or not */
		) {
			this._dismissedNotificationsValue = undefined;
			this.updateExtensionsNotificaiton();
		}
	}

	private updateExtensionsNotificaiton(): void {
		const computedNotificiations = this.computeExtensionsNotifications();
		const dismissedNotifications: string[] = [];

		let extensionsNotification: IExtensionsNotification & { key: string } | undefined;
		if (computedNotificiations.length) {
			// populate dismissed notifications with the ones that are still valid
			for (const dismissedNotification of this.getDismissedNotifications()) {
				if (computedNotificiations.some(e => e.key === dismissedNotification)) {
					dismissedNotifications.push(dismissedNotification);
				}
			}
			if (!dismissedNotifications.includes(computedNotificiations[0].key)) {
				extensionsNotification = {
					message: computedNotificiations[0].message,
					severity: computedNotificiations[0].severity,
					extensions: computedNotificiations[0].extensions,
					key: computedNotificiations[0].key,
					dismiss: () => {
						this.setDismissedNotifications([...this.getDismissedNotifications(), computedNotificiations[0].key]);
						this.updateExtensionsNotificaiton();
					},
				};
			}
		}
		this.setDismissedNotifications(dismissedNotifications);

		if (this.extensionsNotification?.key !== extensionsNotification?.key) {
			this.extensionsNotification = extensionsNotification;
			this._onDidChangeExtensionsNotification.fire(this.extensionsNotification);
		}
	}

	private computeExtensionsNotifications(): Array<Omit<IExtensionsNotification, 'dismiss'> & { key: string }> {
		const computedNotificiations: Array<Omit<IExtensionsNotification, 'dismiss'> & { key: string }> = [];

		const disallowedExtensions = this.local.filter(e => e.enablementState === EnablementState.DisabledByAllowlist);
		if (disallowedExtensions.length) {
			computedNotificiations.push({
				message: this.configurationService.inspect(AllowedExtensionsConfigKey).policy
					? nls.localize('disallowed extensions by policy', "Some extensions are disabled because they are not allowed by your system administrator.")
					: nls.localize('disallowed extensions', "Some extensions are disabled because they are configured not to be allowed."),
				severity: Severity.Warning,
				extensions: disallowedExtensions,
				key: 'disallowedExtensions:' + disallowedExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map(e => e.identifier.id.toLowerCase()).join('-'),
			});
		}

		const invalidExtensions = this.local.filter(e => e.enablementState === EnablementState.DisabledByInvalidExtension && !e.isWorkspaceScoped);
		if (invalidExtensions.length) {
			if (invalidExtensions.some(e => e.local && e.local.manifest.engines?.vscode &&
				(!isEngineValid(e.local.manifest.engines.vscode, this.productService.version, this.productService.date) || areApiProposalsCompatible([...e.local.manifest.enabledApiProposals ?? []]))
			)) {
				computedNotificiations.push({
					message: nls.localize('incompatibleExtensions', "Some extensions are disabled due to version incompatibility. Review and update them."),
					severity: Severity.Warning,
					extensions: invalidExtensions,
					key: 'incompatibleExtensions:' + invalidExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map(e => `${e.identifier.id.toLowerCase()}@${e.local?.manifest.version}`).join('-'),
				});
			} else {
				computedNotificiations.push({
					message: nls.localize('invalidExtensions', "Invalid extensions detected. Review them."),
					severity: Severity.Warning,
					extensions: invalidExtensions,
					key: 'invalidExtensions:' + invalidExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map(e => `${e.identifier.id.toLowerCase()}@${e.local?.manifest.version}`).join('-'),
				});
			}
		}

		const deprecatedExtensions = this.local.filter(e => !!e.deprecationInfo && e.local && this.extensionEnablementService.isEnabled(e.local));
		if (deprecatedExtensions.length) {
			computedNotificiations.push({
				message: nls.localize('deprecated extensions', "Deprecated extensions detected. Review them and migrate to alternatives."),
				severity: Severity.Warning,
				extensions: deprecatedExtensions,
				key: 'deprecatedExtensions:' + deprecatedExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map(e => e.identifier.id.toLowerCase()).join('-'),
			});
		}

		return computedNotificiations;
	}

	getExtensionsNotification(): IExtensionsNotification | undefined {
		return this.extensionsNotification;
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
			extension = this.instantiationService.createInstance(Extension, ext => this.getExtensionState(ext), ext => this.getRuntimeState(ext), undefined, undefined, gallery, undefined);
			(<Extension>extension).setExtensionsControlManifest(extensionsControlManifest);
		}
		return extension;
	}

	private getInstalledExtensionMatchingGallery(gallery: IGalleryExtension): IExtension | null {
		for (const installed of this.local) {
			if (installed.identifier.uuid) { // Installed from Gallery
				if (installed.identifier.uuid === gallery.identifier.uuid) {
					return installed;
				}
			} else if (installed.local?.source !== 'resource') {
				if (areSameExtensions(installed.identifier, gallery.identifier)) { // Installed from other sources
					return installed;
				}
			}
		}
		return null;
	}

	private getInstalledExtensionMatchingLocation(location: URI): IExtension | null {
		return this.local.find(e => e.local && this.uriIdentityService.extUri.isEqualOrParent(location, e.local?.location)) ?? null;
	}

	async open(extension: IExtension | string, options?: IExtensionEditorOptions): Promise<void> {
		if (typeof extension === 'string') {
			const id = extension;
			extension = this.installed.find(e => areSameExtensions(e.identifier, { id })) ?? (await this.getExtensions([{ id: extension }], CancellationToken.None))[0];
		}
		if (!extension) {
			throw new Error(`Extension not found. ${extension}`);
		}
		await this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension), options, options?.sideByside ? SIDE_GROUP : ACTIVE_GROUP);
	}

	async openSearch(searchValue: string, preserveFoucs?: boolean): Promise<void> {
		const viewPaneContainer = (await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		viewPaneContainer.search(searchValue);
		if (!preserveFoucs) {
			viewPaneContainer.focus();
		}
	}

	getExtensionRuntimeStatus(extension: IExtension): IExtensionRuntimeStatus | undefined {
		const extensionsStatus = this.extensionService.getExtensionsStatus();
		for (const id of Object.keys(extensionsStatus)) {
			if (areSameExtensions({ id }, extension.identifier)) {
				return extensionsStatus[id];
			}
		}
		return undefined;
	}

	async updateRunningExtensions(message = nls.localize('restart', "Changing extension enablement"), auto: boolean = false): Promise<void> {
		const toAdd: ILocalExtension[] = [];
		const toRemove: string[] = [];

		const extensionsToCheck = [...this.local];
		for (const extension of extensionsToCheck) {
			const runtimeState = extension.runtimeState;
			if (!runtimeState || runtimeState.action !== ExtensionRuntimeActionType.RestartExtensions) {
				continue;
			}
			if (extension.state === ExtensionState.Uninstalled) {
				toRemove.push(extension.identifier.id);
				continue;
			}
			if (!extension.local) {
				continue;
			}
			const isEnabled = this.extensionEnablementService.isEnabled(extension.local);
			if (isEnabled) {
				const runningExtension = this.extensionService.extensions.find(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, extension.identifier));
				if (runningExtension) {
					toRemove.push(runningExtension.identifier.value);
				}
				toAdd.push(extension.local);
			} else {
				toRemove.push(extension.identifier.id);
			}
		}

		for (const extension of this.extensionService.extensions) {
			if (extension.isUnderDevelopment) {
				continue;
			}
			if (extensionsToCheck.some(e => areSameExtensions({ id: extension.identifier.value, uuid: extension.uuid }, e.local?.identifier ?? e.identifier))) {
				continue;
			}
			// Extension is running but doesn't exist locally. Remove it from running extensions.
			toRemove.push(extension.identifier.value);
		}

		if (toAdd.length || toRemove.length) {
			if (await this.extensionService.stopExtensionHosts(message, auto)) {
				await this.extensionService.startExtensionHosts({ toAdd, toRemove });
				if (auto) {
					this.notificationService.notify({
						severity: Severity.Info,
						message: nls.localize('extensionsAutoRestart', "Extensions were auto restarted to enable updates."),
						priority: NotificationPriority.SILENT
					});
				}
				type ExtensionsAutoRestartClassification = {
					owner: 'sandy081';
					comment: 'Report when extensions are auto restarted';
					count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of extensions auto restarted' };
					auto: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the restart was triggered automatically' };
				};
				type ExtensionsAutoRestartEvent = {
					count: number;
					auto: boolean;
				};
				this.telemetryService.publicLog2<ExtensionsAutoRestartEvent, ExtensionsAutoRestartClassification>('extensions:autorestart', { count: toAdd.length + toRemove.length, auto });
			}
		}
	}

	private getRuntimeState(extension: IExtension): ExtensionRuntimeState | undefined {
		const isUninstalled = extension.state === ExtensionState.Uninstalled;
		const runningExtension = this.extensionService.extensions.find(e => areSameExtensions({ id: e.identifier.value }, extension.identifier));
		const reloadAction = this.extensionManagementServerService.remoteExtensionManagementServer ? ExtensionRuntimeActionType.ReloadWindow : ExtensionRuntimeActionType.RestartExtensions;
		const reloadActionLabel = reloadAction === ExtensionRuntimeActionType.ReloadWindow ? nls.localize('reload', "reload window") : nls.localize('restart extensions', "restart extensions");

		if (isUninstalled) {
			const canRemoveRunningExtension = runningExtension && this.extensionService.canRemoveExtension(runningExtension);
			const isSameExtensionRunning = runningExtension
				&& (!extension.server || extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension)))
				&& (!extension.resourceExtension || this.uriIdentityService.extUri.isEqual(extension.resourceExtension.location, runningExtension.extensionLocation));
			if (!canRemoveRunningExtension && isSameExtensionRunning && !runningExtension.isUnderDevelopment) {
				return { action: reloadAction, reason: nls.localize('postUninstallTooltip', "Please {0} to complete the uninstallation of this extension.", reloadActionLabel) };
			}
			return undefined;
		}
		if (extension.local) {
			const isSameExtensionRunning = runningExtension && extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension));
			const isEnabled = this.extensionEnablementService.isEnabled(extension.local);

			// Extension is running
			if (runningExtension) {
				if (isEnabled) {
					// No Reload is required if extension can run without reload
					if (this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
						return undefined;
					}
					const runningExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension));

					if (isSameExtensionRunning) {
						// Different version or target platform of same extension is running. Requires reload to run the current version
						if (!runningExtension.isUnderDevelopment && (extension.version !== runningExtension.version || extension.local.targetPlatform !== runningExtension.targetPlatform)) {
							const productCurrentVersion = this.getProductCurrentVersion();
							const productUpdateVersion = this.getProductUpdateVersion();
							if (productUpdateVersion
								&& !isEngineValid(extension.local.manifest.engines.vscode, productCurrentVersion.version, productCurrentVersion.date)
								&& isEngineValid(extension.local.manifest.engines.vscode, productUpdateVersion.version, productUpdateVersion.date)
							) {
								const state = this.updateService.state;
								if (state.type === StateType.AvailableForDownload) {
									return { action: ExtensionRuntimeActionType.DownloadUpdate, reason: nls.localize('postUpdateDownloadTooltip', "Please update {0} to enable the updated extension.", this.productService.nameLong) };
								}
								if (state.type === StateType.Downloaded) {
									return { action: ExtensionRuntimeActionType.ApplyUpdate, reason: nls.localize('postUpdateUpdateTooltip', "Please update {0} to enable the updated extension.", this.productService.nameLong) };
								}
								if (state.type === StateType.Ready) {
									return { action: ExtensionRuntimeActionType.QuitAndInstall, reason: nls.localize('postUpdateRestartTooltip', "Please restart {0} to enable the updated extension.", this.productService.nameLong) };
								}
								return undefined;
							}
							return { action: reloadAction, reason: nls.localize('postUpdateTooltip', "Please {0} to enable the updated extension.", reloadActionLabel) };
						}

						if (this.extensionsServers.length > 1) {
							const extensionInOtherServer = this.installed.filter(e => areSameExtensions(e.identifier, extension.identifier) && e.server !== extension.server)[0];
							if (extensionInOtherServer) {
								// This extension prefers to run on UI/Local side but is running in remote
								if (runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnUI(extension.local.manifest) && extensionInOtherServer.server === this.extensionManagementServerService.localExtensionManagementServer) {
									return { action: reloadAction, reason: nls.localize('enable locally', "Please {0} to enable this extension locally.", reloadActionLabel) };
								}

								// This extension prefers to run on Workspace/Remote side but is running in local
								if (runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(extension.local.manifest) && extensionInOtherServer.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
									return { action: reloadAction, reason: nls.localize('enable remote', "Please {0} to enable this extension in {1}.", reloadActionLabel, this.extensionManagementServerService.remoteExtensionManagementServer?.label) };
								}
							}
						}

					} else {

						if (extension.server === this.extensionManagementServerService.localExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer) {
							// This extension prefers to run on UI/Local side but is running in remote
							if (this.extensionManifestPropertiesService.prefersExecuteOnUI(extension.local.manifest)) {
								return { action: reloadAction, reason: nls.localize('postEnableTooltip', "Please {0} to enable this extension.", reloadActionLabel) };
							}
						}
						if (extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
							// This extension prefers to run on Workspace/Remote side but is running in local
							if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(extension.local.manifest)) {
								return { action: reloadAction, reason: nls.localize('postEnableTooltip', "Please {0} to enable this extension.", reloadActionLabel) };
							}
						}
					}
					return undefined;
				} else {
					if (isSameExtensionRunning) {
						return { action: reloadAction, reason: nls.localize('postDisableTooltip', "Please {0} to disable this extension.", reloadActionLabel) };
					}
				}
				return undefined;
			}

			// Extension is not running
			else {
				if (isEnabled && !this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
					return { action: reloadAction, reason: nls.localize('postEnableTooltip', "Please {0} to enable this extension.", reloadActionLabel) };
				}

				const otherServer = extension.server ? extension.server === this.extensionManagementServerService.localExtensionManagementServer ? this.extensionManagementServerService.remoteExtensionManagementServer : this.extensionManagementServerService.localExtensionManagementServer : null;
				if (otherServer && extension.enablementState === EnablementState.DisabledByExtensionKind) {
					const extensionInOtherServer = this.local.filter(e => areSameExtensions(e.identifier, extension.identifier) && e.server === otherServer)[0];
					// Same extension in other server exists and
					if (extensionInOtherServer && extensionInOtherServer.local && this.extensionEnablementService.isEnabled(extensionInOtherServer.local)) {
						return { action: reloadAction, reason: nls.localize('postEnableTooltip', "Please {0} to enable this extension.", reloadActionLabel) };
					}
				}
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
		if (this.installing.some(i => areSameExtensions(i.identifier, extension.identifier) && (!extension.server || i.server === extension.server))) {
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

	async checkForUpdates(reason?: string, onlyBuiltin?: boolean): Promise<void> {
		if (reason) {
			this.logService.trace(`[Extensions]: Checking for updates. Reason: ${reason}`);
		} else {
			this.logService.trace(`[Extensions]: Checking for updates`);
		}
		if (!this.galleryService.isEnabled()) {
			return;
		}
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
			if (installed.isBuiltin && !installed.local?.pinned && (installed.type === ExtensionType.System || !installed.local?.identifier.uuid)) {
				// Skip checking updates for a builtin extension if it is a system extension or if it does not has Marketplace identifier
				continue;
			}
			if (installed.local?.source === 'resource') {
				continue;
			}
			infos.push({ ...installed.identifier, preRelease: !!installed.local?.preRelease });
		}
		if (infos.length) {
			const targetPlatform = await extensions[0].server.extensionManagementService.getTargetPlatform();
			type GalleryServiceUpdatesCheckClassification = {
				owner: 'sandy081';
				comment: 'Report when a request is made to check for updates of extensions';
				count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of extensions to check update' };
			};
			type GalleryServiceUpdatesCheckEvent = {
				count: number;
			};
			this.telemetryService.publicLog2<GalleryServiceUpdatesCheckEvent, GalleryServiceUpdatesCheckClassification>('galleryService:checkingForUpdates', {
				count: infos.length,
			});
			this.logService.trace(`Checking updates for extensions`, infos.map(e => e.id).join(', '));
			const galleryExtensions = await this.galleryService.getExtensions(infos, { targetPlatform, compatible: true, productVersion: this.getProductVersion() }, CancellationToken.None);
			if (galleryExtensions.length) {
				await this.syncInstalledExtensionsWithGallery(galleryExtensions, infos);
			}
		}
	}

	async updateAll(): Promise<InstallExtensionResult[]> {
		const toUpdate: InstallExtensionInfo[] = [];
		this.outdated.forEach((extension) => {
			if (extension.gallery) {
				toUpdate.push({
					extension: extension.gallery,
					options: {
						operation: InstallOperation.Update,
						installPreReleaseVersion: extension.local?.isPreReleaseVersion,
						profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
						isApplicationScoped: extension.local?.isApplicationScoped,
						context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
					}
				});
			}
		});
		return this.extensionManagementService.installGalleryExtensions(toUpdate);
	}

	async downloadVSIX(extensionId: string, versionKind: 'prerelease' | 'release' | 'any'): Promise<void> {
		let version: IGalleryExtensionVersion | undefined;
		if (versionKind === 'any') {
			version = await this.pickVersionToDownload(extensionId);
			if (!version) {
				return;
			}
		}

		const extensionInfo = version ? { id: extensionId, version: version.version } : { id: extensionId, preRelease: versionKind === 'prerelease' };
		const queryOptions: IExtensionQueryOptions = version ? {} : { compatible: true };

		let [galleryExtension] = await this.galleryService.getExtensions([extensionInfo], queryOptions, CancellationToken.None);
		if (!galleryExtension) {
			throw new Error(nls.localize('extension not found', "Extension '{0}' not found.", extensionId));
		}

		let targetPlatform = galleryExtension.properties.targetPlatform;
		const options = [];
		for (const targetPlatform of version?.targetPlatforms ?? galleryExtension.allTargetPlatforms) {
			if (targetPlatform !== TargetPlatform.UNKNOWN && targetPlatform !== TargetPlatform.UNIVERSAL) {
				options.push({
					label: targetPlatform === TargetPlatform.UNDEFINED ? nls.localize('allplatforms', "All Platforms") : TargetPlatformToString(targetPlatform),
					id: targetPlatform
				});
			}
		}
		if (options.length > 1) {
			const message = nls.localize('platform placeholder', "Please select the platform for which you want to download the VSIX");
			const option = await this.quickInputService.pick(options.sort((a, b) => a.label.localeCompare(b.label)), { placeHolder: message });
			if (!option) {
				return;
			}
			targetPlatform = option.id;
		}

		if (targetPlatform !== galleryExtension.properties.targetPlatform) {
			[galleryExtension] = await this.galleryService.getExtensions([extensionInfo], { ...queryOptions, targetPlatform }, CancellationToken.None);
		}

		const result = await this.fileDialogService.showOpenDialog({
			title: nls.localize('download title', "Select folder to download the VSIX"),
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: nls.localize('download', "Download"),
		});

		if (!result?.[0]) {
			return;
		}

		this.progressService.withProgress({ location: ProgressLocation.Notification }, async progress => {
			try {
				progress.report({ message: nls.localize('downloading...', "Downloading VSIX...") });
				const name = `${galleryExtension.identifier.id}-${galleryExtension.version}${targetPlatform !== TargetPlatform.UNDEFINED && targetPlatform !== TargetPlatform.UNIVERSAL && targetPlatform !== TargetPlatform.UNKNOWN ? `-${targetPlatform}` : ''}.vsix`;
				await this.galleryService.download(galleryExtension, this.uriIdentityService.extUri.joinPath(result[0], name), InstallOperation.None);
				this.notificationService.info(nls.localize('download.completed', "Successfully downloaded the VSIX"));
			} catch (error) {
				this.notificationService.error(nls.localize('download.failed', "Error while downloading the VSIX: {0}", getErrorMessage(error)));
			}
		});
	}

	private async pickVersionToDownload(extensionId: string): Promise<IGalleryExtensionVersion | undefined> {
		const allVersions = await this.galleryService.getAllVersions({ id: extensionId });
		if (!allVersions.length) {
			await this.dialogService.info(nls.localize('no versions', "This extension has no other versions."));
			return;
		}

		const picks = allVersions.map((v, i) => {
			return {
				id: v.version,
				label: v.version,
				description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${nls.localize('pre-release', "pre-release")})` : ''}`,
				ariaLabel: `${v.isPreReleaseVersion ? 'Pre-Release version' : 'Release version'} ${v.version}`,
				data: v,
			};
		});
		const pick = await this.quickInputService.pick(picks,
			{
				placeHolder: nls.localize('selectVersion', "Select Version to Download"),
				matchOnDetail: true
			});
		return pick?.data;
	}

	private async syncInstalledExtensionsWithGallery(gallery: IGalleryExtension[], flagExtensionsMissingFromGallery?: IExtensionInfo[]): Promise<void> {
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
		await Promise.allSettled(extensions.map(extensions => extensions.syncInstalledExtensionsWithGallery(gallery, this.getProductVersion(), flagExtensionsMissingFromGallery)));
		if (this.outdated.length) {
			this.logService.info(`Auto updating outdated extensions.`, this.outdated.map(e => e.identifier.id).join(', '));
			this.eventuallyAutoUpdateExtensions();
		}
	}

	private isAutoCheckUpdatesEnabled(): boolean {
		return this.configurationService.getValue(AutoCheckUpdatesConfigurationKey);
	}

	private eventuallyCheckForUpdates(immediate = false): void {
		this.updatesCheckDelayer.cancel();
		this.updatesCheckDelayer.trigger(async () => {
			if (this.isAutoCheckUpdatesEnabled()) {
				await this.checkForUpdates();
			}
			this.eventuallyCheckForUpdates();
		}, immediate ? 0 : this.getUpdatesCheckInterval()).then(undefined, err => null);
	}

	private getUpdatesCheckInterval(): number {
		if (this.productService.quality === 'insider' && this.getProductUpdateVersion()) {
			return 1000 * 60 * 60 * 1; // 1 hour
		}
		return ExtensionsWorkbenchService.UpdatesCheckInterval;
	}

	private eventuallyAutoUpdateExtensions(): void {
		this.autoUpdateDelayer.trigger(() => this.autoUpdateExtensions())
			.then(undefined, err => null);
	}

	private async autoUpdateBuiltinExtensions(): Promise<void> {
		await this.checkForUpdates(undefined, true);
		const toUpdate = this.outdated.filter(e => e.isBuiltin);
		await Promises.settled(toUpdate.map(e => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true } : undefined)));
	}

	private async syncPinnedBuiltinExtensions(): Promise<void> {
		const infos: IExtensionInfo[] = [];
		for (const installed of this.local) {
			if (installed.isBuiltin && installed.local?.pinned && installed.local?.identifier.uuid) {
				infos.push({ ...installed.identifier, version: installed.version });
			}
		}
		if (infos.length) {
			const galleryExtensions = await this.galleryService.getExtensions(infos, CancellationToken.None);
			if (galleryExtensions.length) {
				await this.syncInstalledExtensionsWithGallery(galleryExtensions);
			}
		}
	}

	private async autoUpdateExtensions(): Promise<void> {
		const toUpdate: IExtension[] = [];
		const disabledAutoUpdate = [];
		const consentRequired = [];
		for (const extension of this.outdated) {
			if (!this.shouldAutoUpdateExtension(extension)) {
				disabledAutoUpdate.push(extension.identifier.id);
				continue;
			}
			if (await this.shouldRequireConsentToUpdate(extension)) {
				consentRequired.push(extension.identifier.id);
				continue;
			}
			toUpdate.push(extension);
		}

		if (disabledAutoUpdate.length) {
			this.logService.trace('Auto update disabled for extensions', disabledAutoUpdate.join(', '));
		}

		if (consentRequired.length) {
			this.logService.info('Auto update consent required for extensions', consentRequired.join(', '));
		}

		if (!toUpdate.length) {
			return;
		}

		const productVersion = this.getProductVersion();
		await Promises.settled(toUpdate.map(e => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true, productVersion } : { productVersion })));
	}

	private getProductVersion(): IProductVersion {
		return this.getProductUpdateVersion() ?? this.getProductCurrentVersion();
	}

	private getProductCurrentVersion(): IProductVersion {
		return { version: this.productService.version, date: this.productService.date };
	}

	private getProductUpdateVersion(): IProductVersion | undefined {
		switch (this.updateService.state.type) {
			case StateType.AvailableForDownload:
			case StateType.Downloaded:
			case StateType.Updating:
			case StateType.Ready: {
				const version = this.updateService.state.update.productVersion;
				if (version && semver.valid(version)) {
					return { version, date: this.updateService.state.update.timestamp ? new Date(this.updateService.state.update.timestamp).toISOString() : undefined };
				}
			}
		}
		return undefined;
	}

	private shouldAutoUpdateExtension(extension: IExtension): boolean {
		if (extension.deprecationInfo?.disallowInstall) {
			return false;
		}

		const autoUpdateValue = this.getAutoUpdateValue();

		if (autoUpdateValue === false) {
			const extensionsToAutoUpdate = this.getEnabledAutoUpdateExtensions();
			const extensionId = extension.identifier.id.toLowerCase();
			if (extensionsToAutoUpdate.includes(extensionId)) {
				return true;
			}
			if (this.isAutoUpdateEnabledForPublisher(extension.publisher) && !extensionsToAutoUpdate.includes(`-${extensionId}`)) {
				return true;
			}
			return false;
		}

		if (extension.pinned) {
			return false;
		}

		const disabledAutoUpdateExtensions = this.getDisabledAutoUpdateExtensions();
		if (disabledAutoUpdateExtensions.includes(extension.identifier.id.toLowerCase())) {
			return false;
		}

		if (autoUpdateValue === true) {
			return true;
		}

		if (autoUpdateValue === 'onlyEnabledExtensions') {
			return extension.enablementState !== EnablementState.DisabledGlobally && extension.enablementState !== EnablementState.DisabledWorkspace;
		}

		return false;
	}

	async shouldRequireConsentToUpdate(extension: IExtension): Promise<string | undefined> {
		if (!extension.outdated) {
			return;
		}

		if (!extension.gallery || !extension.local) {
			return;
		}

		if (extension.local.identifier.uuid && extension.local.identifier.uuid !== extension.gallery.identifier.uuid) {
			return nls.localize('consentRequiredToUpdateRepublishedExtension', "The marketplace metadata of this extension changed, likely due to a re-publish.");
		}

		if (!extension.local.manifest.engines.vscode || extension.local.manifest.main || extension.local.manifest.browser) {
			return;
		}

		if (isDefined(extension.gallery.properties?.executesCode)) {
			if (!extension.gallery.properties.executesCode) {
				return;
			}
		} else {
			const manifest = extension instanceof Extension
				? await extension.getGalleryManifest()
				: await this.galleryService.getManifest(extension.gallery, CancellationToken.None);
			if (!manifest?.main && !manifest?.browser) {
				return;
			}
		}

		return nls.localize('consentRequiredToUpdate', "The update for {0} extension introduces executable code, which is not present in the currently installed version.", extension.displayName);
	}

	isAutoUpdateEnabledFor(extensionOrPublisher: IExtension | string): boolean {
		if (isString(extensionOrPublisher)) {
			if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
				throw new Error('Expected publisher string, found extension identifier');
			}
			if (this.isAutoUpdateEnabled()) {
				return true;
			}
			return this.isAutoUpdateEnabledForPublisher(extensionOrPublisher);
		}
		return this.shouldAutoUpdateExtension(extensionOrPublisher);
	}

	private isAutoUpdateEnabledForPublisher(publisher: string): boolean {
		const publishersToAutoUpdate = this.getPublishersToAutoUpdate();
		return publishersToAutoUpdate.includes(publisher.toLowerCase());
	}

	async updateAutoUpdateEnablementFor(extensionOrPublisher: IExtension | string, enable: boolean): Promise<void> {
		if (this.isAutoUpdateEnabled()) {
			if (isString(extensionOrPublisher)) {
				throw new Error('Expected extension, found publisher string');
			}
			const disabledAutoUpdateExtensions = this.getDisabledAutoUpdateExtensions();
			const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
			const extensionIndex = disabledAutoUpdateExtensions.indexOf(extensionId);
			if (enable) {
				if (extensionIndex !== -1) {
					disabledAutoUpdateExtensions.splice(extensionIndex, 1);
				}
			}
			else {
				if (extensionIndex === -1) {
					disabledAutoUpdateExtensions.push(extensionId);
				}
			}
			this.setDisabledAutoUpdateExtensions(disabledAutoUpdateExtensions);
			if (enable && extensionOrPublisher.local && extensionOrPublisher.pinned) {
				await this.extensionManagementService.updateMetadata(extensionOrPublisher.local, { pinned: false });
			}
			this._onChange.fire(extensionOrPublisher);
		}

		else {
			const enabledAutoUpdateExtensions = this.getEnabledAutoUpdateExtensions();
			if (isString(extensionOrPublisher)) {
				if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
					throw new Error('Expected publisher string, found extension identifier');
				}
				extensionOrPublisher = extensionOrPublisher.toLowerCase();
				if (this.isAutoUpdateEnabledFor(extensionOrPublisher) !== enable) {
					if (enable) {
						enabledAutoUpdateExtensions.push(extensionOrPublisher);
					} else {
						if (enabledAutoUpdateExtensions.includes(extensionOrPublisher)) {
							enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionOrPublisher), 1);
						}
					}
				}
				this.setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions);
				for (const e of this.installed) {
					if (e.publisher.toLowerCase() === extensionOrPublisher) {
						this._onChange.fire(e);
					}
				}
			} else {
				const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
				const enableAutoUpdatesForPublisher = this.isAutoUpdateEnabledFor(extensionOrPublisher.publisher.toLowerCase());
				const enableAutoUpdatesForExtension = enabledAutoUpdateExtensions.includes(extensionId);
				const disableAutoUpdatesForExtension = enabledAutoUpdateExtensions.includes(`-${extensionId}`);

				if (enable) {
					if (disableAutoUpdatesForExtension) {
						enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(`-${extensionId}`), 1);
					}
					if (enableAutoUpdatesForPublisher) {
						if (enableAutoUpdatesForExtension) {
							enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionId), 1);
						}
					} else {
						if (!enableAutoUpdatesForExtension) {
							enabledAutoUpdateExtensions.push(extensionId);
						}
					}
				}
				// Disable Auto Updates
				else {
					if (enableAutoUpdatesForExtension) {
						enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionId), 1);
					}
					if (enableAutoUpdatesForPublisher) {
						if (!disableAutoUpdatesForExtension) {
							enabledAutoUpdateExtensions.push(`-${extensionId}`);
						}
					} else {
						if (disableAutoUpdatesForExtension) {
							enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(`-${extensionId}`), 1);
						}
					}
				}
				this.setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions);
				this._onChange.fire(extensionOrPublisher);
			}
		}

		if (enable) {
			this.autoUpdateExtensions();
		}
	}

	private onDidSelectedExtensionToAutoUpdateValueChange(): void {
		if (
			this.enabledAuotUpdateExtensionsValue !== this.getEnabledAutoUpdateExtensionsValue() /* This checks if current window changed the value or not */
			|| this.disabledAutoUpdateExtensionsValue !== this.getDisabledAutoUpdateExtensionsValue() /* This checks if current window changed the value or not */
		) {
			const userExtensions = this.installed.filter(e => !e.isBuiltin);
			const groupBy = (extensions: IExtension[]): IExtension[][] => {
				const shouldAutoUpdate: IExtension[] = [];
				const shouldNotAutoUpdate: IExtension[] = [];
				for (const extension of extensions) {
					if (this.shouldAutoUpdateExtension(extension)) {
						shouldAutoUpdate.push(extension);
					} else {
						shouldNotAutoUpdate.push(extension);
					}
				}
				return [shouldAutoUpdate, shouldNotAutoUpdate];
			};

			const [wasShouldAutoUpdate, wasShouldNotAutoUpdate] = groupBy(userExtensions);
			this._enabledAutoUpdateExtensionsValue = undefined;
			this._disabledAutoUpdateExtensionsValue = undefined;
			const [shouldAutoUpdate, shouldNotAutoUpdate] = groupBy(userExtensions);

			for (const e of wasShouldAutoUpdate ?? []) {
				if (shouldNotAutoUpdate?.includes(e)) {
					this._onChange.fire(e);
				}
			}
			for (const e of wasShouldNotAutoUpdate ?? []) {
				if (shouldAutoUpdate?.includes(e)) {
					this._onChange.fire(e);
				}
			}
		}
	}

	async canInstall(extension: IExtension): Promise<true | IMarkdownString> {
		if (!(extension instanceof Extension)) {
			return new MarkdownString().appendText(nls.localize('not an extension', "The provided object is not an extension."));
		}

		if (extension.isMalicious) {
			return new MarkdownString().appendText(nls.localize('malicious', "This extension is reported to be problematic."));
		}

		if (extension.deprecationInfo?.disallowInstall) {
			return new MarkdownString().appendText(nls.localize('disallowed', "This extension is disallowed to be installed."));
		}

		if (extension.gallery) {
			if (!extension.gallery.isSigned && shouldRequireRepositorySignatureFor(extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
				return new MarkdownString().appendText(nls.localize('not signed', "This extension is not signed."));
			}

			const localResult = this.localExtensions ? await this.localExtensions.canInstall(extension.gallery) : undefined;
			if (localResult === true) {
				return true;
			}

			const remoteResult = this.remoteExtensions ? await this.remoteExtensions.canInstall(extension.gallery) : undefined;
			if (remoteResult === true) {
				return true;
			}

			const webResult = this.webExtensions ? await this.webExtensions.canInstall(extension.gallery) : undefined;
			if (webResult === true) {
				return true;
			}

			return localResult ?? remoteResult ?? webResult ?? new MarkdownString().appendText(nls.localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", extension.displayName ?? extension.identifier.id));
		}

		if (extension.resourceExtension && await this.extensionManagementService.canInstall(extension.resourceExtension) === true) {
			return true;
		}

		return new MarkdownString().appendText(nls.localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", extension.displayName ?? extension.identifier.id));
	}

	async install(arg: string | URI | IExtension, installOptions: InstallExtensionOptions = {}, progressLocation?: ProgressLocation | string): Promise<IExtension> {
		let installable: URI | IGalleryExtension | IResourceExtension | undefined;
		let extension: IExtension | undefined;
		let servers: IExtensionManagementServer[] | undefined;

		if (arg instanceof URI) {
			installable = arg;
		} else {
			let installableInfo: IExtensionInfo | undefined;
			let gallery: IGalleryExtension | undefined;

			// Install by id
			if (isString(arg)) {
				extension = this.local.find(e => areSameExtensions(e.identifier, { id: arg }));
				if (!extension?.isBuiltin) {
					installableInfo = { id: arg, version: installOptions.version, preRelease: installOptions.installPreReleaseVersion ?? this.extensionManagementService.preferPreReleases };
				}
			}
			// Install by gallery
			else if (arg.gallery) {
				extension = arg;
				gallery = arg.gallery;
				if (installOptions.version && installOptions.version !== gallery?.version) {
					installableInfo = { id: extension.identifier.id, version: installOptions.version };
				}
			}
			// Install by resource
			else if (arg.resourceExtension) {
				extension = arg;
				installable = arg.resourceExtension;
			}

			if (installableInfo) {
				const targetPlatform = extension?.server ? await extension.server.extensionManagementService.getTargetPlatform() : undefined;
				gallery = (await this.galleryService.getExtensions([installableInfo], { targetPlatform }, CancellationToken.None)).at(0);
			}

			if (!extension && gallery) {
				extension = this.instantiationService.createInstance(Extension, ext => this.getExtensionState(ext), ext => this.getRuntimeState(ext), undefined, undefined, gallery, undefined);
				(<Extension>extension).setExtensionsControlManifest(await this.extensionManagementService.getExtensionsControlManifest());
			}

			if (extension?.isMalicious) {
				throw new Error(nls.localize('malicious', "This extension is reported to be problematic."));
			}

			if (gallery) {
				// If requested to install everywhere
				// then install the extension in all the servers where it is not installed
				if (installOptions.installEverywhere) {
					servers = [];
					const installableServers = await this.extensionManagementService.getInstallableServers(gallery);
					for (const extensionsServer of this.extensionsServers) {
						if (installableServers.includes(extensionsServer.server) && !extensionsServer.local.find(e => areSameExtensions(e.identifier, gallery.identifier))) {
							servers.push(extensionsServer.server);
						}
					}
				}
				// If requested to enable and extension is already installed
				// Check if the extension is disabled because of extension kind
				// If so, install the extension in the server that is compatible.
				else if (installOptions.enable && extension?.local) {
					servers = [];
					if (extension.enablementState === EnablementState.DisabledByExtensionKind) {
						const [installableServer] = await this.extensionManagementService.getInstallableServers(gallery);
						if (installableServer) {
							servers.push(installableServer);
						}
					}
				}
			}

			if (!servers || servers.length) {
				if (!installable) {
					if (!gallery) {
						const id = isString(arg) ? arg : (<IExtension>arg).identifier.id;
						const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
						const reportIssueUri = manifest ? getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ContactSupportUri) : undefined;
						const reportIssueMessage = reportIssueUri ? nls.localize('report issue', "If this issue persists, please report it at {0}", reportIssueUri.toString()) : '';
						if (installOptions.version) {
							const message = nls.localize('not found version', "The extension '{0}' cannot be installed because the requested version '{1}' was not found.", id, installOptions.version);
							throw new ExtensionManagementError(reportIssueMessage ? `${message} ${reportIssueMessage}` : message, ExtensionManagementErrorCode.NotFound);
						} else {
							const message = nls.localize('not found', "The extension '{0}' cannot be installed because it was not found.", id);
							throw new ExtensionManagementError(reportIssueMessage ? `${message} ${reportIssueMessage}` : message, ExtensionManagementErrorCode.NotFound);
						}
					}
					installable = gallery;
				}
				if (installOptions.version) {
					installOptions.installGivenVersion = true;
				}
				if (extension?.isWorkspaceScoped) {
					installOptions.isWorkspaceScoped = true;
				}
			}
		}

		if (installable) {
			if (installOptions.justification) {
				const syncCheck = isUndefined(installOptions.isMachineScoped) && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions);
				const buttons: IPromptButton<boolean>[] = [];
				buttons.push({
					label: isString(installOptions.justification) || !installOptions.justification.action
						? nls.localize({ key: 'installButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Install Extension")
						: nls.localize({ key: 'installButtonLabelWithAction', comment: ['&& denotes a mnemonic'] }, "&&Install Extension and {0}", installOptions.justification.action), run: () => true
				});
				if (!extension) {
					buttons.push({ label: nls.localize('open', "Open Extension"), run: () => { this.open(extension!); return false; } });
				}
				const result = await this.dialogService.prompt<boolean>({
					title: nls.localize('installExtensionTitle', "Install Extension"),
					message: extension ? nls.localize('installExtensionMessage', "Would you like to install '{0}' extension from '{1}'?", extension.displayName, extension.publisherDisplayName) : nls.localize('installVSIXMessage', "Would you like to install the extension?"),
					detail: isString(installOptions.justification) ? installOptions.justification : installOptions.justification.reason,
					cancelButton: true,
					buttons,
					checkbox: syncCheck ? {
						label: nls.localize('sync extension', "Sync this extension"),
						checked: true,
					} : undefined,
				});
				if (!result.result) {
					throw new CancellationError();
				}
				if (syncCheck) {
					installOptions.isMachineScoped = !result.checkboxChecked;
				}
			}
			if (installable instanceof URI) {
				extension = await this.doInstall(undefined, () => this.installFromVSIX(installable, installOptions), progressLocation);
			} else if (extension) {
				if (extension.resourceExtension) {
					extension = await this.doInstall(extension, () => this.extensionManagementService.installResourceExtension(installable as IResourceExtension, installOptions), progressLocation);
				} else {
					extension = await this.doInstall(extension, () => this.installFromGallery(extension!, installable as IGalleryExtension, installOptions, servers), progressLocation);
				}
			}
		}

		if (!extension) {
			throw new Error(nls.localize('unknown', "Unable to install extension"));
		}

		if (installOptions.enable) {
			if (extension.enablementState === EnablementState.DisabledWorkspace || extension.enablementState === EnablementState.DisabledGlobally) {
				if (installOptions.justification) {
					const result = await this.dialogService.confirm({
						title: nls.localize('enableExtensionTitle', "Enable Extension"),
						message: nls.localize('enableExtensionMessage', "Would you like to enable '{0}' extension?", extension.displayName),
						detail: isString(installOptions.justification) ? installOptions.justification : installOptions.justification.reason,
						primaryButton: isString(installOptions.justification) ? nls.localize({ key: 'enableButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Enable Extension") : nls.localize({ key: 'enableButtonLabelWithAction', comment: ['&& denotes a mnemonic'] }, "&&Enable Extension and {0}", installOptions.justification.action),
					});
					if (!result.confirmed) {
						throw new CancellationError();
					}
				}
				await this.setEnablement(extension, extension.enablementState === EnablementState.DisabledWorkspace ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
			}
			await this.waitUntilExtensionIsEnabled(extension);
		}

		return extension;
	}

	async installInServer(extension: IExtension, server: IExtensionManagementServer, installOptions?: InstallOptions): Promise<void> {
		await this.doInstall(extension, async () => {
			const local = extension.local;
			if (!local) {
				throw new Error('Extension not found');
			}
			if (!extension.gallery) {
				extension = (await this.getExtensions([{ ...extension.identifier, preRelease: local.preRelease }], CancellationToken.None))[0] ?? extension;
			}
			if (extension.gallery) {
				return server.extensionManagementService.installFromGallery(extension.gallery, { installPreReleaseVersion: local.preRelease, ...installOptions });
			}

			const targetPlatform = await server.extensionManagementService.getTargetPlatform();
			if (!isTargetPlatformCompatible(local.targetPlatform, [local.targetPlatform], targetPlatform)) {
				throw new Error(nls.localize('incompatible', "Can't install '{0}' extension because it is not compatible.", extension.identifier.id));
			}

			const vsix = await this.extensionManagementService.zip(local);
			try {
				return await server.extensionManagementService.install(vsix);
			} finally {
				try {
					await this.fileService.del(vsix);
				} catch (error) {
					this.logService.error(error);
				}
			}
		});
	}

	canSetLanguage(extension: IExtension): boolean {
		if (!isWeb) {
			return false;
		}

		if (!extension.gallery) {
			return false;
		}

		const locale = getLocale(extension.gallery);
		if (!locale) {
			return false;
		}

		return true;
	}

	async setLanguage(extension: IExtension): Promise<void> {
		if (!this.canSetLanguage(extension)) {
			throw new Error('Can not set language');
		}
		const locale = getLocale(extension.gallery!);
		if (locale === language) {
			return;
		}
		const localizedLanguageName = extension.gallery?.properties?.localizedLanguages?.[0];
		return this.localeService.setLocale({ id: locale, galleryExtension: extension.gallery, extensionId: extension.identifier.id, label: localizedLanguageName ?? extension.displayName });
	}

	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void> {
		extensions = Array.isArray(extensions) ? extensions : [extensions];
		return this.promptAndSetEnablement(extensions, enablementState);
	}

	async uninstall(e: IExtension): Promise<void> {
		const extension = e.local ? e : this.local.find(local => areSameExtensions(local.identifier, e.identifier));
		if (!extension?.local) {
			throw new Error('Missing local');
		}

		if (extension.local.isApplicationScoped && this.userDataProfilesService.profiles.length > 1) {
			const { confirmed } = await this.dialogService.confirm({
				title: nls.localize('uninstallApplicationScoped', "Uninstall Extension"),
				type: Severity.Info,
				message: nls.localize('uninstallApplicationScopedMessage', "Would you like to Uninstall {0} from all profiles?", extension.displayName),
				primaryButton: nls.localize('uninstallAllProfiles', "Uninstall (All Profiles)")
			});
			if (!confirmed) {
				throw new CancellationError();
			}
		}

		const extensionsToUninstall: UninstallExtensionInfo[] = [{ extension: extension.local }];
		for (const packExtension of this.getAllPackedExtensions(extension, this.local)) {
			if (packExtension.local && !extensionsToUninstall.some(e => areSameExtensions(e.extension.identifier, packExtension.identifier))) {
				extensionsToUninstall.push({ extension: packExtension.local });
			}
		}

		const dependents: ILocalExtension[] = [];
		let extensionsFromAllProfiles: [ILocalExtension, URI][] | undefined;
		for (const { extension } of extensionsToUninstall) {
			const installedExtensions: [ILocalExtension, URI | undefined][] = [];
			if (extension.isApplicationScoped && this.userDataProfilesService.profiles.length > 1) {
				if (!extensionsFromAllProfiles) {
					extensionsFromAllProfiles = [];
					await Promise.allSettled(this.userDataProfilesService.profiles.map(async profile => {
						const installed = await this.extensionManagementService.getInstalled(ExtensionType.User, profile.extensionsResource);
						for (const local of installed) {
							extensionsFromAllProfiles?.push([local, profile.extensionsResource]);
						}
					}));
				}
				installedExtensions.push(...extensionsFromAllProfiles);
			} else {
				for (const { local } of this.local) {
					if (local) {
						installedExtensions.push([local, undefined]);
					}
				}
			}
			for (const [local, profileLocation] of installedExtensions) {
				if (areSameExtensions(local.identifier, extension.identifier)) {
					continue;
				}
				if (!local.manifest.extensionDependencies || local.manifest.extensionDependencies.length === 0) {
					continue;
				}
				if (extension.manifest.extensionPack?.some(id => areSameExtensions({ id }, local.identifier))) {
					continue;
				}
				if (dependents.some(d => d.manifest.extensionPack?.some(id => areSameExtensions({ id }, local.identifier)))) {
					continue;
				}
				if (local.manifest.extensionDependencies.some(dep => areSameExtensions(extension.identifier, { id: dep }))) {
					dependents.push(local);
					extensionsToUninstall.push({ extension: local, options: { profileLocation } });
				}
			}
		}

		if (dependents.length) {
			const { result } = await this.dialogService.prompt({
				title: nls.localize('uninstallDependents', "Uninstall Extension with Dependents"),
				type: Severity.Warning,
				message: this.getErrorMessageForUninstallingAnExtensionWithDependents(extension, dependents),
				buttons: [{
					label: nls.localize('uninstallAll', "Uninstall All"),
					run: () => true
				}],
				cancelButton: {
					run: () => false
				}
			});
			if (!result) {
				throw new CancellationError();
			}
		}

		return this.withProgress({
			location: ProgressLocation.Extensions,
			title: nls.localize('uninstallingExtension', 'Uninstalling extension...'),
			source: `${extension.identifier.id}`
		}, () => this.extensionManagementService.uninstallExtensions(extensionsToUninstall).then(() => undefined));
	}

	private getAllPackedExtensions(extension: IExtension, installed: IExtension[], checked: IExtension[] = []): IExtension[] {
		if (checked.some(e => areSameExtensions(e.identifier, extension.identifier))) {
			return [];
		}
		checked.push(extension);
		const extensionsPack = extension.extensionPack ?? [];
		if (extensionsPack.length) {
			const packedExtensions: IExtension[] = [];
			for (const i of installed) {
				if (!i.isBuiltin && extensionsPack.some(id => areSameExtensions({ id }, i.identifier))) {
					packedExtensions.push(i);
				}
			}
			const packOfPackedExtensions: IExtension[] = [];
			for (const packedExtension of packedExtensions) {
				packOfPackedExtensions.push(...this.getAllPackedExtensions(packedExtension, installed, checked));
			}
			return [...packedExtensions, ...packOfPackedExtensions];
		}
		return [];
	}

	private getErrorMessageForUninstallingAnExtensionWithDependents(extension: IExtension, dependents: ILocalExtension[]): string {
		if (dependents.length === 1) {
			return nls.localize('singleDependentUninstallError', "Cannot uninstall '{0}' extension alone. '{1}' extension depends on this. Do you want to uninstall all these extensions?", extension.displayName, dependents[0].manifest.displayName);
		}
		if (dependents.length === 2) {
			return nls.localize('twoDependentsUninstallError', "Cannot uninstall '{0}' extension alone. '{1}' and '{2}' extensions depend on this. Do you want to uninstall all these extensions?",
				extension.displayName, dependents[0].manifest.displayName, dependents[1].manifest.displayName);
		}
		return nls.localize('multipleDependentsUninstallError', "Cannot uninstall '{0}' extension alone. '{1}', '{2}' and other extensions depend on this. Do you want to uninstall all these extensions?",
			extension.displayName, dependents[0].manifest.displayName, dependents[1].manifest.displayName);
	}

	isExtensionIgnoredToSync(extension: IExtension): boolean {
		return extension.local ? !this.isInstalledExtensionSynced(extension.local)
			: this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
	}

	async togglePreRelease(extension: IExtension): Promise<void> {
		if (!extension.local) {
			return;
		}
		if (extension.preRelease !== extension.isPreReleaseVersion) {
			await this.extensionManagementService.updateMetadata(extension.local, { preRelease: !extension.preRelease });
			return;
		}
		await this.install(extension, { installPreReleaseVersion: !extension.preRelease, preRelease: !extension.preRelease });
	}

	async toggleExtensionIgnoredToSync(extension: IExtension): Promise<void> {
		const extensionsIncludingPackedExtensions = [extension, ...this.getAllPackedExtensions(extension, this.local)];
		// Updated in sync to prevent race conditions
		for (const e of extensionsIncludingPackedExtensions) {
			const isIgnored = this.isExtensionIgnoredToSync(e);
			if (e.local && isIgnored && e.local.isMachineScoped) {
				await this.extensionManagementService.updateMetadata(e.local, { isMachineScoped: false });
			} else {
				await this.extensionsSyncManagementService.updateIgnoredExtensions(e.identifier.id, !isIgnored);
			}
		}
		await this.userDataAutoSyncService.triggerSync(['IgnoredExtensionsUpdated']);
	}

	async toggleApplyExtensionToAllProfiles(extension: IExtension): Promise<void> {
		const extensionsIncludingPackedExtensions = [extension, ...this.getAllPackedExtensions(extension, this.local)];
		const allExtensionServers = this.getAllExtensionServers();
		await Promise.allSettled(extensionsIncludingPackedExtensions.map(async e => {
			if (!e.local || isApplicationScopedExtension(e.local.manifest) || e.isBuiltin) {
				return;
			}
			const isApplicationScoped = e.local.isApplicationScoped;
			await Promise.all(allExtensionServers.map(async extensionServer => {
				const local = extensionServer.local.find(local => areSameExtensions(e.identifier, local.identifier))?.local;
				if (local && local.isApplicationScoped === isApplicationScoped) {
					await this.extensionManagementService.toggleApplicationScope(local, this.userDataProfileService.currentProfile.extensionsResource);
				}
			}));
		}));
	}

	private getAllExtensionServers(): Extensions[] {
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
		return extensions;
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

	private doInstall(extension: IExtension | undefined, installTask: () => Promise<ILocalExtension>, progressLocation?: ProgressLocation | string): Promise<IExtension> {
		const title = extension ? nls.localize('installing named extension', "Installing '{0}' extension...", extension.displayName) : nls.localize('installing extension', 'Installing extension...');
		return this.withProgress({
			location: progressLocation ?? ProgressLocation.Extensions,
			title
		}, async () => {
			try {
				if (extension) {
					this.installing.push(extension);
					this._onChange.fire(extension);
				}
				const local = await installTask();
				return await this.waitAndGetInstalledExtension(local.identifier);
			} finally {
				if (extension) {
					this.installing = this.installing.filter(e => e !== extension);
					// Trigger the change without passing the extension because it is replaced by a new instance.
					this._onChange.fire(undefined);
				}
			}
		});
	}

	private async installFromVSIX(vsix: URI, installOptions: InstallOptions): Promise<ILocalExtension> {
		const manifest = await this.extensionManagementService.getManifest(vsix);
		const existingExtension = this.local.find(local => areSameExtensions(local.identifier, { id: getGalleryExtensionId(manifest.publisher, manifest.name) }));
		if (existingExtension) {
			installOptions = installOptions || {};
			if (existingExtension.latestVersion === manifest.version) {
				installOptions.pinned = installOptions.pinned ?? (existingExtension.local?.pinned || !this.shouldAutoUpdateExtension(existingExtension));
			} else {
				installOptions.installGivenVersion = true;
			}
		}
		return this.extensionManagementService.installVSIX(vsix, manifest, installOptions);
	}

	private installFromGallery(extension: IExtension, gallery: IGalleryExtension, installOptions: InstallExtensionOptions, servers: IExtensionManagementServer[] | undefined): Promise<ILocalExtension> {
		installOptions = installOptions ?? {};
		installOptions.pinned = installOptions.pinned ?? (extension.local?.pinned || !this.shouldAutoUpdateExtension(extension));
		if (extension.local && !servers) {
			installOptions.productVersion = this.getProductVersion();
			installOptions.operation = InstallOperation.Update;
			return this.extensionManagementService.updateFromGallery(gallery, extension.local, installOptions);
		} else {
			return this.extensionManagementService.installFromGallery(gallery, installOptions, servers);
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

	private async waitUntilExtensionIsEnabled(extension: IExtension): Promise<void> {
		if (this.extensionService.extensions.find(e => ExtensionIdentifier.equals(e.identifier, extension.identifier.id))) {
			return;
		}
		if (!extension.local || !this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
			return;
		}
		await new Promise<void>((c, e) => {
			const disposable = this.extensionService.onDidChangeExtensions(() => {
				try {
					if (this.extensionService.extensions.find(e => ExtensionIdentifier.equals(e.identifier, extension.identifier.id))) {
						disposable.dispose();
						c();
					}
				} catch (error) {
					e(error);
				}
			});
		});
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

	private async checkAndSetEnablement(extensions: IExtension[], otherExtensions: IExtension[], enablementState: EnablementState): Promise<any> {
		const allExtensions = [...extensions, ...otherExtensions];
		const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
		if (!enable) {
			for (const extension of extensions) {
				const dependents = this.getDependentsAfterDisablement(extension, allExtensions, this.local);
				if (dependents.length) {
					const { result } = await this.dialogService.prompt({
						title: nls.localize('disableDependents', "Disable Extension with Dependents"),
						type: Severity.Warning,
						message: this.getDependentsErrorMessageForDisablement(extension, allExtensions, dependents),
						buttons: [{
							label: nls.localize('disable all', 'Disable All'),
							run: () => true
						}],
						cancelButton: {
							run: () => false
						}
					});
					if (!result) {
						throw new CancellationError();
					}
					await this.checkAndSetEnablement(dependents, [extension], enablementState);
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
			const extensionsToEanbleOrDisable = installed.filter(i => {
				if (checked.indexOf(i) !== -1) {
					return false;
				}
				const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
				const isExtensionEnabled = i.enablementState === EnablementState.EnabledGlobally || i.enablementState === EnablementState.EnabledWorkspace;
				if (enable === isExtensionEnabled) {
					return false;
				}
				return (enable || !i.isBuiltin) // Include all Extensions for enablement and only non builtin extensions for disablement
					&& (options.dependencies || options.pack)
					&& extensions.some(extension =>
						(options.dependencies && extension.dependencies.some(id => areSameExtensions({ id }, i.identifier)))
						|| (options.pack && extension.extensionPack.some(id => areSameExtensions({ id }, i.identifier)))
					);
			});
			if (extensionsToEanbleOrDisable.length) {
				extensionsToEanbleOrDisable.push(...this.getExtensionsRecursively(extensionsToEanbleOrDisable, installed, enablementState, options, checked));
			}
			return extensionsToEanbleOrDisable;
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

	private getDependentsErrorMessageForDisablement(extension: IExtension, allDisabledExtensions: IExtension[], dependents: IExtension[]): string {
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
		return await this.extensionEnablementService.setEnablement(extensions.map(e => e.local!), enablementState);
	}

	// Current service reports progress when installing/uninstalling extensions
	// This is to report progress for other sources of extension install/uninstall changes
	// Since we cannot differentiate between the two, we report progress for all extension install/uninstall changes
	private _activityCallBack: ((value: void) => void) | undefined;
	private reportProgressFromOtherSources(): void {
		if (this.installed.some(e => e.state === ExtensionState.Installing || e.state === ExtensionState.Uninstalling)) {
			if (!this._activityCallBack) {
				this.withProgress({ location: ProgressLocation.Extensions }, () => new Promise(resolve => this._activityCallBack = resolve));
			}
		} else {
			this._activityCallBack?.();
			this._activityCallBack = undefined;
		}
	}

	private withProgress<T>(options: IProgressOptions, task: () => Promise<T>): Promise<T> {
		return this.progressService.withProgress(options, async () => {
			const cancelableTask = createCancelablePromise(() => task());
			this.tasksInProgress.push(cancelableTask);
			try {
				return await cancelableTask;
			} finally {
				const index = this.tasksInProgress.indexOf(cancelableTask);
				if (index !== -1) {
					this.tasksInProgress.splice(index, 1);
				}
			}
		});
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
				await this.hostService.focus(mainWindow);
				await this.open(extension);
			}
		}).then(undefined, error => this.onError(error));
	}

	private getPublishersToAutoUpdate(): string[] {
		return this.getEnabledAutoUpdateExtensions().filter(id => !EXTENSION_IDENTIFIER_REGEX.test(id));
	}

	getEnabledAutoUpdateExtensions(): string[] {
		try {
			const parsedValue = JSON.parse(this.enabledAuotUpdateExtensionsValue);
			if (Array.isArray(parsedValue)) {
				return parsedValue;
			}
		} catch (e) { /* Ignore */ }
		return [];
	}

	private setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions: string[]): void {
		this.enabledAuotUpdateExtensionsValue = JSON.stringify(enabledAutoUpdateExtensions);
	}

	private _enabledAutoUpdateExtensionsValue: string | undefined;
	private get enabledAuotUpdateExtensionsValue(): string {
		if (!this._enabledAutoUpdateExtensionsValue) {
			this._enabledAutoUpdateExtensionsValue = this.getEnabledAutoUpdateExtensionsValue();
		}

		return this._enabledAutoUpdateExtensionsValue;
	}

	private set enabledAuotUpdateExtensionsValue(enabledAuotUpdateExtensionsValue: string) {
		if (this.enabledAuotUpdateExtensionsValue !== enabledAuotUpdateExtensionsValue) {
			this._enabledAutoUpdateExtensionsValue = enabledAuotUpdateExtensionsValue;
			this.setEnabledAutoUpdateExtensionsValue(enabledAuotUpdateExtensionsValue);
		}
	}

	private getEnabledAutoUpdateExtensionsValue(): string {
		return this.storageService.get(EXTENSIONS_AUTO_UPDATE_KEY, StorageScope.APPLICATION, '[]');
	}

	private setEnabledAutoUpdateExtensionsValue(value: string): void {
		this.storageService.store(EXTENSIONS_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
	}

	getDisabledAutoUpdateExtensions(): string[] {
		try {
			const parsedValue = JSON.parse(this.disabledAutoUpdateExtensionsValue);
			if (Array.isArray(parsedValue)) {
				return parsedValue;
			}
		} catch (e) { /* Ignore */ }
		return [];
	}

	private setDisabledAutoUpdateExtensions(disabledAutoUpdateExtensions: string[]): void {
		this.disabledAutoUpdateExtensionsValue = JSON.stringify(disabledAutoUpdateExtensions);
	}

	private _disabledAutoUpdateExtensionsValue: string | undefined;
	private get disabledAutoUpdateExtensionsValue(): string {
		if (!this._disabledAutoUpdateExtensionsValue) {
			this._disabledAutoUpdateExtensionsValue = this.getDisabledAutoUpdateExtensionsValue();
		}

		return this._disabledAutoUpdateExtensionsValue;
	}

	private set disabledAutoUpdateExtensionsValue(disabledAutoUpdateExtensionsValue: string) {
		if (this.disabledAutoUpdateExtensionsValue !== disabledAutoUpdateExtensionsValue) {
			this._disabledAutoUpdateExtensionsValue = disabledAutoUpdateExtensionsValue;
			this.setDisabledAutoUpdateExtensionsValue(disabledAutoUpdateExtensionsValue);
		}
	}

	private getDisabledAutoUpdateExtensionsValue(): string {
		return this.storageService.get(EXTENSIONS_DONOT_AUTO_UPDATE_KEY, StorageScope.APPLICATION, '[]');
	}

	private setDisabledAutoUpdateExtensionsValue(value: string): void {
		this.storageService.store(EXTENSIONS_DONOT_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
	}

	private getDismissedNotifications(): string[] {
		try {
			const parsedValue = JSON.parse(this.dismissedNotificationsValue);
			if (Array.isArray(parsedValue)) {
				return parsedValue;
			}
		} catch (e) { /* Ignore */ }
		return [];
	}

	private setDismissedNotifications(dismissedNotifications: string[]): void {
		this.dismissedNotificationsValue = JSON.stringify(dismissedNotifications);
	}

	private _dismissedNotificationsValue: string | undefined;
	private get dismissedNotificationsValue(): string {
		if (!this._dismissedNotificationsValue) {
			this._dismissedNotificationsValue = this.getDismissedNotificationsValue();
		}

		return this._dismissedNotificationsValue;
	}

	private set dismissedNotificationsValue(dismissedNotificationsValue: string) {
		if (this.dismissedNotificationsValue !== dismissedNotificationsValue) {
			this._dismissedNotificationsValue = dismissedNotificationsValue;
			this.setDismissedNotificationsValue(dismissedNotificationsValue);
		}
	}

	private getDismissedNotificationsValue(): string {
		return this.storageService.get(EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, StorageScope.PROFILE, '[]');
	}

	private setDismissedNotificationsValue(value: string): void {
		this.storageService.store(EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
	}

}
