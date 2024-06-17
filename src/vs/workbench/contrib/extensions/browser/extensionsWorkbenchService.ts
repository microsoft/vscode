/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { Event, Emitter } from 'vs/base/common/event';
import { firstOrDefault } from 'vs/base/common/
';
import { CancelablePromise, Promises, ThrottledDelayer, createCancelablePromise } from 'vs/base/common/async';
import { CancellationError, isCancellationError } from 'vs/base/common/errors';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IPager, singlePagePager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import {
	IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions,
	InstallOperation, WEB_EXTENSION_TAG, InstallExtensionResult,
	IExtensionsControlManifest, IExtensionInfo, IExtensionQueryOptions, isTargetPlatformCompatible, InstallExtensionInfo, EXTENSION_IDENTIFIER_REGEX,
	InstallOptions, IProductVersion
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IWorkbenchExtensionManagementService, IResourceExtension, extensionsConfigurationNodeBase } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { areSameExtensions, groupByExtension, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { URI } from 'vs/base/common/uri';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, AutoUpdateConfigurationKey, AutoCheckUpdatesConfigurationKey, HasOutdatedExtensionsContext, AutoUpdateConfigurationValue, InstallExtensionOptions, ExtensionRuntimeState, ExtensionRuntimeActionType, AutoRestartConfigurationKey } from 'vs/workbench/contrib/extensions/common/extensions';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IURLService, IURLHandler, IOpenURLOptions } from 'vs/platform/url/common/url';
import { ExtensionsInput, IExtensionEditorOptions } from 'vs/workbench/contrib/extensions/common/extensionsInput';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressOptions, IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IFileService } from 'vs/platform/files/common/files';
import { ExtensionType, ExtensionIdentifier, IExtensionIdentifier, IExtensionDescription, isApplicationScopedExtension } from 'vs/platform/extensions/common/extensions';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IProductService } from 'vs/platform/product/common/productService';
import { IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { IUserDataAutoSyncService, IUserDataSyncEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { isBoolean, isString, isUndefined } from 'vs/base/common/types';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IExtensionService, IExtensionsStatus, toExtension, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { isWeb, language } from 'vs/base/common/platform';
import { getLocale } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/services/localization/common/locale';
import { TelemetryTrustedValue } from 'vs/platform/telemetry/common/telemetryUtils';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { mainWindow } from 'vs/base/browser/window';
import { IDialogService, IPromptButton } from 'vs/platform/dialogs/common/dialogs';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import { isEngineValid } from 'vs/platform/extensions/common/extensionValidator';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Extension } from './abstractRuntimeExtensionsEditor';
import { Extensions } from './abstractRuntimeExtensionsEditor';

export interface IExtensionStateProvider<T> {
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

const EXTENSIONS_AUTO_UPDATE_KEY = 'extensions.autoUpdate';

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

	private readonly _onChange: Emitter<IExtension | undefined> = new Emitter<IExtension | undefined>();
	get onChange(): Event<IExtension | undefined> { return this._onChange.event; }

	private readonly _onReset = new Emitter<void>();
	get onReset() { return this._onReset.event; }

	readonly preferPreReleases = this.productService.quality !== 'stable';

	private installing: IExtension[] = [];
	private tasksInProgress: CancelablePromise<any>[] = [];

	readonly whenInitialized: Promise<void>;

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
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
		const preferPreReleasesValue = configurationService.getValue('_extensions.preferPreReleases');
		if (!isUndefined(preferPreReleasesValue)) {
			this.preferPreReleases = !!preferPreReleasesValue;
		}
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
		this.registerConfigurations();

		this.whenInitialized = this.initialize();
	}

	private registerConfigurations(): void {
		Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
			.registerConfiguration({
				...extensionsConfigurationNodeBase,
				properties: {
					[AutoRestartConfigurationKey]: {
						type: 'boolean',
						description: nls.localize('autoRestart', "If activated, extensions will automatically restart following an update if the window is not in focus."),
						default: this.productService.quality !== 'stable',
					}
				}
			});
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
		this.reportInstalledExtensionsTelemetry();
		this._register(Event.debounce(this.onChange, () => undefined, 100)(() => this.reportProgressFromOtherSources()));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_AUTO_UPDATE_KEY, this._store)(e => this.onDidSelectedExtensionToAutoUpdateValueChange(false)));
	}

	private initializeAutoUpdate(): void {
		// Register listeners for auto updates
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
				this.onDidAutoUpdateConfigurationChange();
			}
			if (e.affectsConfiguration(AutoCheckUpdatesConfigurationKey)) {
				if (this.isAutoCheckUpdatesEnabled()) {
					this.checkForUpdates();
				}
			}
		}));
		this._register(this.extensionEnablementService.onEnablementChanged(platformExtensions => {
			if (this.getAutoUpdateValue() === 'onlyEnabledExtensions' && platformExtensions.some(e => this.extensionEnablementService.isEnabled(e))) {
				this.checkForUpdates();
			}
		}));
		this._register(Event.debounce(this.onChange, () => undefined, 100)(() => this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0)));
		this._register(this.updateService.onStateChange(e => {
			if (!this.isAutoUpdateEnabled()) {
				return;
			}
			if ((e.type === StateType.CheckingForUpdates && e.explicit) || e.type === StateType.AvailableForDownload || e.type === StateType.Downloaded) {
				this.eventuallyCheckForUpdates(true);
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

	private readonly autoRestartListenerDisposable = this._register(new MutableDisposable());
	private registerAutoRestartListener(): void {
		this.autoRestartListenerDisposable.value = undefined;
		if (this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
			this.autoRestartListenerDisposable.value = this.hostService.onDidChangeFocus(focus => {
				if (!focus && this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
					this.updateRunningExtensions(true);
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
		options.includePreRelease = isUndefined(options.includePreRelease) ? this.preferPreReleases : options.includePreRelease;

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

		extensionInfos.forEach(e => e.preRelease = e.preRelease ?? this.preferPreReleases);
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

	getExtensionStatus(extension: IExtension): IExtensionsStatus | undefined {
		const extensionsStatus = this.extensionService.getExtensionsStatus();
		for (const id of Object.keys(extensionsStatus)) {
			if (areSameExtensions({ id }, extension.identifier)) {
				return extensionsStatus[id];
			}
		}
		return undefined;
	}

	async updateRunningExtensions(auto: boolean = false): Promise<void> {
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
			if (extensionsToCheck.some(e => areSameExtensions({ id: extension.identifier.value, uuid: extension.uuid }, e.identifier))) {
				continue;
			}
			// Extension is running but doesn't exist locally. Remove it from running extensions.
			toRemove.push(extension.identifier.value);
		}

		if (toAdd.length || toRemove.length) {
			if (await this.extensionService.stopExtensionHosts(nls.localize('restart', "Enable or Disable extensions"), auto)) {
				await this.extensionService.startExtensionHosts({ toAdd, toRemove });
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

	private async onDidAutoUpdateConfigurationChange(): Promise<void> {
		await this.updateExtensionsPinnedState();
		if (this.isAutoUpdateEnabled()) {
			this.checkForUpdates();
		} else {
			this.setSelectedExtensionsToAutoUpdate([]);
		}
	}

	async checkForUpdates(onlyBuiltin?: boolean): Promise<void> {
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
			const galleryExtensions = await this.galleryService.getExtensions(infos, { targetPlatform, compatible: true, productVersion: this.getProductVersion() }, CancellationToken.None);
			if (galleryExtensions.length) {
				await this.syncInstalledExtensionsWithGallery(galleryExtensions);
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
					}
				});
			}
		});
		return this.extensionManagementService.installGalleryExtensions(toUpdate);
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
		await Promise.allSettled(extensions.map(extensions => extensions.syncInstalledExtensionsWithGallery(gallery, this.getProductVersion())));
		if (this.isAutoUpdateEnabled()) {
			this.eventuallyAutoUpdateExtensions();
		}
	}

	getAutoUpdateValue(): AutoUpdateConfigurationValue {
		const autoUpdate = this.configurationService.getValue<AutoUpdateConfigurationValue>(AutoUpdateConfigurationKey);
		return isBoolean(autoUpdate) || autoUpdate === 'onlyEnabledExtensions' || autoUpdate === 'onlySelectedExtensions' ? autoUpdate : true;
	}

	isAutoUpdateEnabled(): boolean {
		return this.getAutoUpdateValue() !== false;
	}

	private isAutoCheckUpdatesEnabled(): boolean {
		return this.configurationService.getValue(AutoCheckUpdatesConfigurationKey);
	}

	private eventuallyCheckForUpdates(immediate = false): void {
		this.updatesCheckDelayer.cancel();
		this.updatesCheckDelayer.trigger(async () => {
			if (this.isAutoUpdateEnabled() || this.isAutoCheckUpdatesEnabled()) {
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
		await this.checkForUpdates(true);
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
		if (!this.isAutoUpdateEnabled()) {
			return;
		}

		const toUpdate = this.outdated.filter(e => !e.local?.pinned && this.shouldAutoUpdateExtension(e));
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

	private async updateExtensionsPinnedState(): Promise<void> {
		await Promise.all(this.installed.map(async e => {
			if (e.isBuiltin) {
				return;
			}
			const shouldBePinned = !this.shouldAutoUpdateExtension(e);
			if (e.local && e.local.pinned !== shouldBePinned) {
				await this.extensionManagementService.updateMetadata(e.local, { pinned: shouldBePinned });
			}
		}));
	}

	private shouldAutoUpdateExtension(extension: IExtension): boolean {
		const autoUpdate = this.getAutoUpdateValue();
		if (isBoolean(autoUpdate)) {
			return autoUpdate;
		}

		if (autoUpdate === 'onlyEnabledExtensions') {
			return this.extensionEnablementService.isEnabledEnablementState(extension.enablementState);
		}

		const extensionsToAutoUpdate = this.getSelectedExtensionsToAutoUpdate();
		const extensionId = extension.identifier.id.toLowerCase();
		return extensionsToAutoUpdate.includes(extensionId) ||
			(!extensionsToAutoUpdate.includes(`-${extensionId}`) && this.isAutoUpdateEnabledForPublisher(extension.publisher));
	}

	isAutoUpdateEnabledFor(extensionOrPublisher: IExtension | string): boolean {
		if (isString(extensionOrPublisher)) {
			if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
				throw new Error('Expected publisher string, found extension identifier');
			}
			const autoUpdate = this.getAutoUpdateValue();
			if (isBoolean(autoUpdate)) {
				return autoUpdate;
			}
			if (autoUpdate === 'onlyEnabledExtensions') {
				return false;
			}
			return this.isAutoUpdateEnabledForPublisher(extensionOrPublisher);
		}
		return !extensionOrPublisher.local?.pinned && this.shouldAutoUpdateExtension(extensionOrPublisher);
	}

	private isAutoUpdateEnabledForPublisher(publisher: string): boolean {
		const publishersToAutoUpdate = this.getPublishersToAutoUpdate();
		return publishersToAutoUpdate.includes(publisher.toLowerCase());
	}

	async updateAutoUpdateEnablementFor(extensionOrPublisher: IExtension | string, enable: boolean): Promise<void> {
		const autoUpdateValue = this.getAutoUpdateValue();

		if (autoUpdateValue === true || autoUpdateValue === 'onlyEnabledExtensions') {
			if (isString(extensionOrPublisher)) {
				throw new Error('Expected extension, found publisher string');
			}
			if (!extensionOrPublisher.local) {
				throw new Error('Only installed extensions can be pinned');
			}
			await this.extensionManagementService.updateMetadata(extensionOrPublisher.local, { pinned: !enable });
			if (enable) {
				this.eventuallyAutoUpdateExtensions();
			}
			return;
		}

		if (autoUpdateValue === false && enable) {
			await this.configurationService.updateValue(AutoUpdateConfigurationKey, 'onlySelectedExtensions');
		}

		let update = false;
		const autoUpdateExtensions = this.getSelectedExtensionsToAutoUpdate();
		if (isString(extensionOrPublisher)) {
			if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
				throw new Error('Expected publisher string, found extension identifier');
			}
			extensionOrPublisher = extensionOrPublisher.toLowerCase();
			if (this.isAutoUpdateEnabledFor(extensionOrPublisher) !== enable) {
				update = true;
				if (enable) {
					autoUpdateExtensions.push(extensionOrPublisher);
				} else {
					if (autoUpdateExtensions.includes(extensionOrPublisher)) {
						autoUpdateExtensions.splice(autoUpdateExtensions.indexOf(extensionOrPublisher), 1);
					}
				}
			}
		} else {
			const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
			const enableAutoUpdatesForPublisher = this.isAutoUpdateEnabledFor(extensionOrPublisher.publisher.toLowerCase());
			const enableAutoUpdatesForExtension = autoUpdateExtensions.includes(extensionId);
			const disableAutoUpdatesForExtension = autoUpdateExtensions.includes(`-${extensionId}`);

			if (enable) {
				if (disableAutoUpdatesForExtension) {
					autoUpdateExtensions.splice(autoUpdateExtensions.indexOf(`-${extensionId}`), 1);
					update = true;
				}
				if (enableAutoUpdatesForPublisher) {
					if (enableAutoUpdatesForExtension) {
						autoUpdateExtensions.splice(autoUpdateExtensions.indexOf(extensionId), 1);
						update = true;
					}
				} else {
					if (!enableAutoUpdatesForExtension) {
						autoUpdateExtensions.push(extensionId);
						update = true;
					}
				}
				if (extensionOrPublisher.local?.pinned) {
					await this.extensionManagementService.updateMetadata(extensionOrPublisher.local, { pinned: false });
				}
			}
			// Disable Auto Updates
			else {
				if (enableAutoUpdatesForExtension) {
					autoUpdateExtensions.splice(autoUpdateExtensions.indexOf(extensionId), 1);
					update = true;
				}
				if (enableAutoUpdatesForPublisher) {
					if (!disableAutoUpdatesForExtension) {
						autoUpdateExtensions.push(`-${extensionId}`);
						update = true;
					}
				} else {
					if (disableAutoUpdatesForExtension) {
						autoUpdateExtensions.splice(autoUpdateExtensions.indexOf(`-${extensionId}`), 1);
						update = true;
					}
				}
			}
		}
		if (update) {
			this.setSelectedExtensionsToAutoUpdate(autoUpdateExtensions);
			await this.onDidSelectedExtensionToAutoUpdateValueChange(true);
			if (autoUpdateValue === 'onlySelectedExtensions' && autoUpdateExtensions.length === 0) {
				await this.configurationService.updateValue(AutoUpdateConfigurationKey, false);
			}
		}
	}

	private async onDidSelectedExtensionToAutoUpdateValueChange(forceUpdate: boolean): Promise<void> {
		if (forceUpdate || this.selectedExtensionsToAutoUpdateValue !== this.getSelectedExtensionsToAutoUpdateValue() /* This checks if current window changed the value or not */) {
			await this.updateExtensionsPinnedState();
			this.eventuallyAutoUpdateExtensions();
		}
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

		if (extension.gallery) {
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

		if (extension.resourceExtension && await this.extensionManagementService.canInstall(extension.resourceExtension)) {
			return true;
		}

		return false;
	}

	async install(arg: string | URI | IExtension, installOptions: InstallExtensionOptions = {}, progressLocation?: ProgressLocation): Promise<IExtension> {
		let installable: URI | IGalleryExtension | IResourceExtension | undefined;
		let extension: IExtension | undefined;

		if (arg instanceof URI) {
			installable = arg;
		} else {
			let installableInfo: IExtensionInfo | undefined;
			let gallery: IGalleryExtension | undefined;
			if (isString(arg)) {
				extension = this.local.find(e => areSameExtensions(e.identifier, { id: arg }));
				if (!extension?.isBuiltin) {
					installableInfo = { id: arg, version: installOptions.version, preRelease: installOptions.installPreReleaseVersion ?? this.preferPreReleases };
				}
			} else if (arg.gallery) {
				extension = arg;
				gallery = arg.gallery;
				if (installOptions.version && installOptions.version !== gallery?.version) {
					installableInfo = { id: extension.identifier.id, version: installOptions.version };
				}
			} else if (arg.resourceExtension) {
				extension = arg;
				installable = arg.resourceExtension;
			}
			if (installableInfo) {
				const targetPlatform = extension?.server ? await extension.server.extensionManagementService.getTargetPlatform() : undefined;
				gallery = firstOrDefault(await this.galleryService.getExtensions([installableInfo], { targetPlatform }, CancellationToken.None));
			}
			if (!extension && gallery) {
				extension = this.instantiationService.createInstance(Extension, ext => this.getExtensionState(ext), ext => this.getRuntimeState(ext), undefined, undefined, gallery, undefined);
				Extensions.updateExtensionFromControlManifest(extension as Extension, await this.extensionManagementService.getExtensionsControlManifest());
			}
			if (extension?.isMalicious) {
				throw new Error(nls.localize('malicious', "This extension is reported to be problematic."));
			}
			// Do not install if requested to enable and extension is already installed
			if (!(installOptions.enable && extension?.local)) {
				if (!installable) {
					if (!gallery) {
						const id = isString(arg) ? arg : (<IExtension>arg).identifier.id;
						if (installOptions.version) {
							throw new Error(nls.localize('not found version', "Unable to install extension '{0}' because the requested version '{1}' is not found.", id, installOptions.version));
						} else {
							throw new Error(nls.localize('not found', "Unable to install extension '{0}' because it is not found.", id));
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
					extension = await this.doInstall(extension, () => this.installFromGallery(extension!, installable as IGalleryExtension, installOptions), progressLocation);
				}
			}
		}

		if (!extension) {
			throw new Error(nls.localize('unknown', "Unable to install extension"));
		}

		if (installOptions.version) {
			await this.updateAutoUpdateEnablementFor(extension, false);
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

	async installInServer(extension: IExtension, server: IExtensionManagementServer): Promise<void> {
		await this.doInstall(extension, async () => {
			const local = extension.local;
			if (!local) {
				throw new Error('Extension not found');
			}
			if (!extension.gallery) {
				extension = (await this.getExtensions([{ ...extension.identifier, preRelease: local.preRelease }], CancellationToken.None))[0] ?? extension;
			}
			if (extension.gallery) {
				return server.extensionManagementService.installFromGallery(extension.gallery, { installPreReleaseVersion: local.preRelease });
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

	uninstall(extension: IExtension): Promise<void> {
		const ext = extension.local ? extension : this.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0];
		const toUninstall: ILocalExtension | null = ext && ext.local ? ext.local : null;

		if (!toUninstall) {
			return Promise.reject(new Error('Missing local'));
		}
		return this.withProgress({
			location: ProgressLocation.Extensions,
			title: nls.localize('uninstallingExtension', 'Uninstalling extension....'),
			source: `${toUninstall.identifier.id}`
		}, () => this.extensionManagementService.uninstall(toUninstall).then(() => undefined));
	}

	reinstall(extension: IExtension): Promise<IExtension> {
		return this.doInstall(extension, () => {
			const ext = extension.local ? extension : this.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0];
			const toReinstall: ILocalExtension | null = ext && ext.local ? ext.local : null;
			if (!toReinstall) {
				throw new Error('Missing local');
			}
			return this.extensionManagementService.reinstallFromGallery(toReinstall);
		});
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
		const isIgnored = this.isExtensionIgnoredToSync(extension);
		if (extension.local && isIgnored) {
			(<Extension>extension).local = await this.updateSynchronizingInstalledExtension(extension.local, true);
			this._onChange.fire(extension);
		} else {
			this.extensionsSyncManagementService.updateIgnoredExtensions(extension.identifier.id, !isIgnored);
		}
		await this.userDataAutoSyncService.triggerSync(['IgnoredExtensionsUpdated'], false, false);
	}

	async toggleApplyExtensionToAllProfiles(extension: IExtension): Promise<void> {
		if (!extension.local || isApplicationScopedExtension(extension.local.manifest) || extension.isBuiltin) {
			return;
		}
		const isApplicationScoped = extension.local.isApplicationScoped;
		await Promise.all(this.getAllExtensions().map(async extensions => {
			const local = extensions.local.find(e => areSameExtensions(e.identifier, extension.identifier))?.local;
			if (local && local.isApplicationScoped === isApplicationScoped) {
				await this.extensionManagementService.toggleAppliationScope(local, this.userDataProfileService.currentProfile.extensionsResource);
			}
		}));
	}

	private getAllExtensions(): Extensions[] {
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

	async updateSynchronizingInstalledExtension(extension: ILocalExtension, sync: boolean): Promise<ILocalExtension> {
		const isMachineScoped = !sync;
		if (extension.isMachineScoped !== isMachineScoped) {
			extension = await this.extensionManagementService.updateMetadata(extension, { isMachineScoped });
		}
		if (sync) {
			this.extensionsSyncManagementService.updateIgnoredExtensions(extension.identifier.id, false);
		}
		return extension;
	}

	private doInstall(extension: IExtension | undefined, installTask: () => Promise<ILocalExtension>, progressLocation?: ProgressLocation): Promise<IExtension> {
		const title = extension ? nls.localize('installing named extension', "Installing '{0}' extension....", extension.displayName) : nls.localize('installing extension', 'Installing extension....');
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
				installOptions.pinned = existingExtension.local?.pinned || !this.shouldAutoUpdateExtension(existingExtension);
			} else {
				installOptions.installGivenVersion = true;
			}
		}
		return this.extensionManagementService.installVSIX(vsix, manifest, installOptions);
	}

	private installFromGallery(extension: IExtension, gallery: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		installOptions = installOptions ?? {};
		installOptions.pinned = extension.local?.pinned || !this.shouldAutoUpdateExtension(extension);
		if (extension.local) {
			installOptions.productVersion = this.getProductVersion();
			return this.extensionManagementService.updateFromGallery(gallery, extension.local, installOptions);
		} else {
			return this.extensionManagementService.installFromGallery(gallery, installOptions);
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
		return this.getSelectedExtensionsToAutoUpdate().filter(id => !EXTENSION_IDENTIFIER_REGEX.test(id));
	}

	getSelectedExtensionsToAutoUpdate(): string[] {
		try {
			const parsedValue = JSON.parse(this.selectedExtensionsToAutoUpdateValue);
			if (Array.isArray(parsedValue)) {
				return parsedValue;
			}
		} catch (e) { /* Ignore */ }
		return [];
	}

	private setSelectedExtensionsToAutoUpdate(selectedExtensionsToAutoUpdate: string[]): void {
		this.selectedExtensionsToAutoUpdateValue = JSON.stringify(selectedExtensionsToAutoUpdate);
	}

	private _selectedExtensionsToAutoUpdateValue: string | undefined;
	private get selectedExtensionsToAutoUpdateValue(): string {
		if (!this._selectedExtensionsToAutoUpdateValue) {
			this._selectedExtensionsToAutoUpdateValue = this.getSelectedExtensionsToAutoUpdateValue();
		}

		return this._selectedExtensionsToAutoUpdateValue;
	}

	private set selectedExtensionsToAutoUpdateValue(placeholderViewContainesValue: string) {
		if (this.selectedExtensionsToAutoUpdateValue !== placeholderViewContainesValue) {
			this._selectedExtensionsToAutoUpdateValue = placeholderViewContainesValue;
			this.setSelectedExtensionsToAutoUpdateValue(placeholderViewContainesValue);
		}
	}

	private getSelectedExtensionsToAutoUpdateValue(): string {
		return this.storageService.get(EXTENSIONS_AUTO_UPDATE_KEY, StorageScope.APPLICATION, '[]');
	}

	private setSelectedExtensionsToAutoUpdateValue(value: string): void {
		this.storageService.store(EXTENSIONS_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
	}

}
