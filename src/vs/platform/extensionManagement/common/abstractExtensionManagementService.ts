/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, isNonEmptyArray } from '../../../base/common/arrays.js';
import { Barrier, CancelablePromise, createCancelablePromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { isWeb } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import * as nls from '../../../nls.js';
import {
	ExtensionManagementError, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementParticipant, IGalleryExtension, ILocalExtension, InstallOperation,
	IExtensionsControlManifest, StatisticType, isTargetPlatformCompatible, TargetPlatformToString, ExtensionManagementErrorCode,
	InstallOptions, UninstallOptions, Metadata, InstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent, IExtensionManagementService, InstallExtensionInfo, EXTENSION_INSTALL_DEP_PACK_CONTEXT, ExtensionGalleryError,
	IProductVersion, ExtensionGalleryErrorCode,
	EXTENSION_INSTALL_SOURCE_CONTEXT,
	DidUpdateExtensionMetadata,
	UninstallExtensionInfo,
	ExtensionSignatureVerificationCode,
	IAllowedExtensionsService
} from './extensionManagement.js';
import { areSameExtensions, ExtensionKey, getGalleryExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, isMalicious } from './extensionManagementUtil.js';
import { ExtensionType, IExtensionManifest, isApplicationScopedExtension, TargetPlatform } from '../../extensions/common/extensions.js';
import { areApiProposalsCompatible } from '../../extensions/common/extensionValidator.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';

export type InstallableExtension = { readonly manifest: IExtensionManifest; extension: IGalleryExtension | URI; options: InstallOptions };

export type InstallExtensionTaskOptions = InstallOptions & { readonly profileLocation: URI; readonly productVersion: IProductVersion };
export interface IInstallExtensionTask {
	readonly manifest: IExtensionManifest;
	readonly identifier: IExtensionIdentifier;
	readonly source: IGalleryExtension | URI;
	readonly operation: InstallOperation;
	readonly options: InstallExtensionTaskOptions;
	readonly verificationStatus?: ExtensionSignatureVerificationCode;
	run(): Promise<ILocalExtension>;
	waitUntilTaskIsFinished(): Promise<ILocalExtension>;
	cancel(): void;
}

export type UninstallExtensionTaskOptions = UninstallOptions & { readonly profileLocation: URI };
export interface IUninstallExtensionTask {
	readonly options: UninstallExtensionTaskOptions;
	readonly extension: ILocalExtension;
	run(): Promise<void>;
	waitUntilTaskIsFinished(): Promise<void>;
	cancel(): void;
}

export abstract class CommontExtensionManagementService extends Disposable implements IExtensionManagementService {

	_serviceBrand: undefined;

	readonly preferPreReleases: boolean;

	constructor(
		@IProductService protected readonly productService: IProductService,
		@IAllowedExtensionsService protected readonly allowedExtensionsService: IAllowedExtensionsService,
	) {
		super();
		this.preferPreReleases = this.productService.quality !== 'stable';
	}

	async canInstall(extension: IGalleryExtension): Promise<true | IMarkdownString> {
		const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName });
		if (allowedToInstall !== true) {
			return new MarkdownString(nls.localize('not allowed to install', "This extension cannot be installed because {0}", allowedToInstall.value));
		}

		if (!(await this.isExtensionPlatformCompatible(extension))) {
			const learnLink = isWeb ? 'https://aka.ms/vscode-web-extensions-guide' : 'https://aka.ms/vscode-platform-specific-extensions';
			return new MarkdownString(`${nls.localize('incompatible platform', "The '{0}' extension is not available in {1} for the {2}.",
				extension.displayName ?? extension.identifier.id, this.productService.nameLong, TargetPlatformToString(await this.getTargetPlatform()))} [${nls.localize('learn why', "Learn Why")}](${learnLink})`);
		}

		return true;
	}

	protected async isExtensionPlatformCompatible(extension: IGalleryExtension): Promise<boolean> {
		const currentTargetPlatform = await this.getTargetPlatform();
		return extension.allTargetPlatforms.some(targetPlatform => isTargetPlatformCompatible(targetPlatform, extension.allTargetPlatforms, currentTargetPlatform));
	}

	abstract readonly onInstallExtension: Event<InstallExtensionEvent>;
	abstract readonly onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;
	abstract readonly onUninstallExtension: Event<UninstallExtensionEvent>;
	abstract readonly onDidUninstallExtension: Event<DidUninstallExtensionEvent>;
	abstract readonly onDidUpdateExtensionMetadata: Event<DidUpdateExtensionMetadata>;
	abstract installFromGallery(extension: IGalleryExtension, options?: InstallOptions): Promise<ILocalExtension>;
	abstract installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]>;
	abstract uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void>;
	abstract uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void>;
	abstract toggleApplicationScope(extension: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension>;
	abstract getExtensionsControlManifest(): Promise<IExtensionsControlManifest>;
	abstract resetPinnedStateForAllUserExtensions(pinned: boolean): Promise<void>;
	abstract registerParticipant(pariticipant: IExtensionManagementParticipant): void;
	abstract getTargetPlatform(): Promise<TargetPlatform>;
	abstract zip(extension: ILocalExtension): Promise<URI>;
	abstract getManifest(vsix: URI): Promise<IExtensionManifest>;
	abstract install(vsix: URI, options?: InstallOptions): Promise<ILocalExtension>;
	abstract installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension>;
	abstract installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]>;
	abstract getInstalled(type?: ExtensionType, profileLocation?: URI, productVersion?: IProductVersion): Promise<ILocalExtension[]>;
	abstract copyExtensions(fromProfileLocation: URI, toProfileLocation: URI): Promise<void>;
	abstract download(extension: IGalleryExtension, operation: InstallOperation, donotVerifySignature: boolean): Promise<URI>;
	abstract cleanUp(): Promise<void>;
	abstract updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, profileLocation: URI): Promise<ILocalExtension>;
}

export abstract class AbstractExtensionManagementService extends CommontExtensionManagementService implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private extensionsControlManifest: Promise<IExtensionsControlManifest> | undefined;
	private lastReportTimestamp = 0;
	private readonly installingExtensions = new Map<string, { task: IInstallExtensionTask; waitingTasks: IInstallExtensionTask[] }>();
	private readonly uninstallingExtensions = new Map<string, IUninstallExtensionTask>();

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionEvent>());
	get onInstallExtension() { return this._onInstallExtension.event; }

	protected readonly _onDidInstallExtensions = this._register(new Emitter<InstallExtensionResult[]>());
	get onDidInstallExtensions() { return this._onDidInstallExtensions.event; }

	protected readonly _onUninstallExtension = this._register(new Emitter<UninstallExtensionEvent>());
	get onUninstallExtension() { return this._onUninstallExtension.event; }

	protected _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	get onDidUninstallExtension() { return this._onDidUninstallExtension.event; }

	protected readonly _onDidUpdateExtensionMetadata = this._register(new Emitter<DidUpdateExtensionMetadata>());
	get onDidUpdateExtensionMetadata() { return this._onDidUpdateExtensionMetadata.event; }

	private readonly participants: IExtensionManagementParticipant[] = [];

	constructor(
		@IExtensionGalleryService protected readonly galleryService: IExtensionGalleryService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@ILogService protected readonly logService: ILogService,
		@IProductService productService: IProductService,
		@IAllowedExtensionsService allowedExtensionsService: IAllowedExtensionsService,
		@IUserDataProfilesService protected readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super(productService, allowedExtensionsService);
		this._register(toDisposable(() => {
			this.installingExtensions.forEach(({ task }) => task.cancel());
			this.uninstallingExtensions.forEach(promise => promise.cancel());
			this.installingExtensions.clear();
			this.uninstallingExtensions.clear();
		}));
	}

	async installFromGallery(extension: IGalleryExtension, options: InstallOptions = {}): Promise<ILocalExtension> {
		try {
			const results = await this.installGalleryExtensions([{ extension, options }]);
			const result = results.find(({ identifier }) => areSameExtensions(identifier, extension.identifier));
			if (result?.local) {
				return result?.local;
			}
			if (result?.error) {
				throw result.error;
			}
			throw new ExtensionManagementError(`Unknown error while installing extension ${extension.identifier.id}`, ExtensionManagementErrorCode.Unknown);
		} catch (error) {
			throw toExtensionManagementError(error);
		}
	}

	async installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]> {
		if (!this.galleryService.isEnabled()) {
			throw new ExtensionManagementError(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"), ExtensionManagementErrorCode.NotAllowed);
		}

		const results: InstallExtensionResult[] = [];
		const installableExtensions: InstallableExtension[] = [];

		await Promise.allSettled(extensions.map(async ({ extension, options }) => {
			try {
				const compatible = await this.checkAndGetCompatibleVersion(extension, !!options?.installGivenVersion, !!options?.installPreReleaseVersion, options.productVersion ?? { version: this.productService.version, date: this.productService.date });
				installableExtensions.push({ ...compatible, options });
			} catch (error) {
				results.push({ identifier: extension.identifier, operation: InstallOperation.Install, source: extension, error, profileLocation: options.profileLocation ?? this.getCurrentExtensionsManifestLocation() });
			}
		}));

		if (installableExtensions.length) {
			results.push(...await this.installExtensions(installableExtensions));
		}

		return results;
	}

	async uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
		return this.uninstallExtensions([{ extension, options }]);
	}

	async toggleApplicationScope(extension: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension> {
		if (isApplicationScopedExtension(extension.manifest) || extension.isBuiltin) {
			return extension;
		}

		if (extension.isApplicationScoped) {
			let local = await this.updateMetadata(extension, { isApplicationScoped: false }, this.userDataProfilesService.defaultProfile.extensionsResource);
			if (!this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
				local = await this.copyExtension(extension, this.userDataProfilesService.defaultProfile.extensionsResource, fromProfileLocation);
			}

			for (const profile of this.userDataProfilesService.profiles) {
				const existing = (await this.getInstalled(ExtensionType.User, profile.extensionsResource))
					.find(e => areSameExtensions(e.identifier, extension.identifier));
				if (existing) {
					this._onDidUpdateExtensionMetadata.fire({ local: existing, profileLocation: profile.extensionsResource });
				} else {
					this._onDidUninstallExtension.fire({ identifier: extension.identifier, profileLocation: profile.extensionsResource });
				}
			}
			return local;
		}

		else {
			const local = this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)
				? await this.updateMetadata(extension, { isApplicationScoped: true }, this.userDataProfilesService.defaultProfile.extensionsResource)
				: await this.copyExtension(extension, fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource, { isApplicationScoped: true });

			this._onDidInstallExtensions.fire([{ identifier: local.identifier, operation: InstallOperation.Install, local, profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource, applicationScoped: true }]);
			return local;
		}

	}

	getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
		const now = new Date().getTime();

		if (!this.extensionsControlManifest || now - this.lastReportTimestamp > 1000 * 60 * 5) { // 5 minute cache freshness
			this.extensionsControlManifest = this.updateControlCache();
			this.lastReportTimestamp = now;
		}

		return this.extensionsControlManifest;
	}

	registerParticipant(participant: IExtensionManagementParticipant): void {
		this.participants.push(participant);
	}

	async resetPinnedStateForAllUserExtensions(pinned: boolean): Promise<void> {
		try {
			await this.joinAllSettled(this.userDataProfilesService.profiles.map(
				async profile => {
					const extensions = await this.getInstalled(ExtensionType.User, profile.extensionsResource);
					await this.joinAllSettled(extensions.map(
						async extension => {
							if (extension.pinned !== pinned) {
								await this.updateMetadata(extension, { pinned }, profile.extensionsResource);
							}
						}));
				}));
		} catch (error) {
			this.logService.error('Error while resetting pinned state for all user extensions', getErrorMessage(error));
			throw error;
		}
	}

	protected async installExtensions(extensions: InstallableExtension[]): Promise<InstallExtensionResult[]> {
		const installExtensionResultsMap = new Map<string, InstallExtensionResult & { profileLocation: URI }>();
		const installingExtensionsMap = new Map<string, { task: IInstallExtensionTask; root: IInstallExtensionTask | undefined; uninstallTaskToWaitFor?: IUninstallExtensionTask }>();
		const alreadyRequestedInstallations: Promise<any>[] = [];

		const getInstallExtensionTaskKey = (extension: IGalleryExtension, profileLocation: URI) => `${ExtensionKey.create(extension).toString()}-${profileLocation.toString()}`;
		const createInstallExtensionTask = (manifest: IExtensionManifest, extension: IGalleryExtension | URI, options: InstallExtensionTaskOptions, root: IInstallExtensionTask | undefined): void => {
			let uninstallTaskToWaitFor;
			if (!URI.isUri(extension)) {
				if (installingExtensionsMap.has(`${extension.identifier.id.toLowerCase()}-${options.profileLocation.toString()}`)) {
					return;
				}
				const existingInstallingExtension = this.installingExtensions.get(getInstallExtensionTaskKey(extension, options.profileLocation));
				if (existingInstallingExtension) {
					if (root && this.canWaitForTask(root, existingInstallingExtension.task)) {
						const identifier = existingInstallingExtension.task.identifier;
						this.logService.info('Waiting for already requested installing extension', identifier.id, root.identifier.id, options.profileLocation.toString());
						existingInstallingExtension.waitingTasks.push(root);
						// add promise that waits until the extension is completely installed, ie., onDidInstallExtensions event is triggered for this extension
						alreadyRequestedInstallations.push(
							Event.toPromise(
								Event.filter(this.onDidInstallExtensions, results => results.some(result => areSameExtensions(result.identifier, identifier)))
							).then(results => {
								this.logService.info('Finished waiting for already requested installing extension', identifier.id, root.identifier.id, options.profileLocation.toString());
								const result = results.find(result => areSameExtensions(result.identifier, identifier));
								if (!result?.local) {
									// Extension failed to install
									throw new Error(`Extension ${identifier.id} is not installed`);
								}
							}));
					}
					return;
				}
				uninstallTaskToWaitFor = this.uninstallingExtensions.get(this.getUninstallExtensionTaskKey(extension.identifier, options.profileLocation));
			}
			const installExtensionTask = this.createInstallExtensionTask(manifest, extension, options);
			const key = `${getGalleryExtensionId(manifest.publisher, manifest.name)}-${options.profileLocation.toString()}`;
			installingExtensionsMap.set(key, { task: installExtensionTask, root, uninstallTaskToWaitFor });
			this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension, profileLocation: options.profileLocation });
			this.logService.info('Installing extension:', installExtensionTask.identifier.id, options);
			// only cache gallery extensions tasks
			if (!URI.isUri(extension)) {
				this.installingExtensions.set(getInstallExtensionTaskKey(extension, options.profileLocation), { task: installExtensionTask, waitingTasks: [] });
			}
		};

		try {
			// Start installing extensions
			for (const { manifest, extension, options } of extensions) {
				const isApplicationScoped = options.isApplicationScoped || options.isBuiltin || isApplicationScopedExtension(manifest);
				const installExtensionTaskOptions: InstallExtensionTaskOptions = {
					...options,
					isApplicationScoped,
					profileLocation: isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options.profileLocation ?? this.getCurrentExtensionsManifestLocation(),
					productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date }
				};

				const existingInstallExtensionTask = !URI.isUri(extension) ? this.installingExtensions.get(getInstallExtensionTaskKey(extension, installExtensionTaskOptions.profileLocation)) : undefined;
				if (existingInstallExtensionTask) {
					this.logService.info('Extension is already requested to install', existingInstallExtensionTask.task.identifier.id, installExtensionTaskOptions.profileLocation.toString());
					alreadyRequestedInstallations.push(existingInstallExtensionTask.task.waitUntilTaskIsFinished());
				} else {
					createInstallExtensionTask(manifest, extension, installExtensionTaskOptions, undefined);
				}
			}

			// collect and start installing all dependencies and pack extensions
			await Promise.all([...installingExtensionsMap.values()].map(async ({ task }) => {
				if (task.options.donotIncludePackAndDependencies) {
					this.logService.info('Installing the extension without checking dependencies and pack', task.identifier.id);
				} else {
					try {
						let preferPreRelease = this.preferPreReleases;
						if (task.options.installPreReleaseVersion) {
							preferPreRelease = true;
						} else if (!URI.isUri(task.source) && task.source.hasPreReleaseVersion) {
							// Explicitly asked to install the release version
							preferPreRelease = false;
						}
						const installed = await this.getInstalled(undefined, task.options.profileLocation, task.options.productVersion);
						const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensions(task.identifier, task.manifest, preferPreRelease, task.options.productVersion, installed);
						const options: InstallExtensionTaskOptions = { ...task.options, pinned: false, installGivenVersion: false, context: { ...task.options.context, [EXTENSION_INSTALL_DEP_PACK_CONTEXT]: true } };
						for (const { gallery, manifest } of distinct(allDepsAndPackExtensionsToInstall, ({ gallery }) => gallery.identifier.id)) {
							const existing = installed.find(e => areSameExtensions(e.identifier, gallery.identifier));
							// Skip if the extension is already installed and has the same application scope
							if (existing && existing.isApplicationScoped === !!options.isApplicationScoped) {
								continue;
							}
							createInstallExtensionTask(manifest, gallery, options, task);
						}
					} catch (error) {
						// Installing through VSIX
						if (URI.isUri(task.source)) {
							// Ignore installing dependencies and packs
							if (isNonEmptyArray(task.manifest.extensionDependencies)) {
								this.logService.warn(`Cannot install dependencies of extension:`, task.identifier.id, error.message);
							}
							if (isNonEmptyArray(task.manifest.extensionPack)) {
								this.logService.warn(`Cannot install packed extensions of extension:`, task.identifier.id, error.message);
							}
						} else {
							this.logService.error('Error while preparing to install dependencies and extension packs of the extension:', task.identifier.id);
							throw error;
						}
					}
				}
			}));

			const otherProfilesToUpdate = await this.getOtherProfilesToUpdateExtension([...installingExtensionsMap.values()].map(({ task }) => task));
			for (const [profileLocation, task] of otherProfilesToUpdate) {
				createInstallExtensionTask(task.manifest, task.source, { ...task.options, profileLocation }, undefined);
			}

			// Install extensions in parallel and wait until all extensions are installed / failed
			await this.joinAllSettled([...installingExtensionsMap.entries()].map(async ([key, { task, uninstallTaskToWaitFor }]) => {
				const startTime = new Date().getTime();
				let local: ILocalExtension;
				try {
					if (uninstallTaskToWaitFor) {
						this.logService.info('Waiting for existing uninstall task to complete before installing', task.identifier.id);
						try {
							await uninstallTaskToWaitFor.waitUntilTaskIsFinished();
							this.logService.info('Finished waiting for uninstall task, proceeding with install', task.identifier.id);
						} catch (error) {
							this.logService.info('Uninstall task failed, proceeding with install anyway', task.identifier.id, getErrorMessage(error));
						}
					}

					local = await task.run();
					await this.joinAllSettled(this.participants.map(participant => participant.postInstall(local, task.source, task.options, CancellationToken.None)), ExtensionManagementErrorCode.PostInstall);
				} catch (e) {
					const error = toExtensionManagementError(e);
					if (!URI.isUri(task.source)) {
						reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install', {
							extensionData: getGalleryExtensionTelemetryData(task.source),
							error,
							source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
						});
					}
					installExtensionResultsMap.set(key, { error, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: task.options.isApplicationScoped });
					this.logService.error('Error while installing the extension', task.identifier.id, getErrorMessage(error), task.options.profileLocation.toString());
					throw error;
				}
				if (!URI.isUri(task.source)) {
					const isUpdate = task.operation === InstallOperation.Update;
					const durationSinceUpdate = isUpdate ? undefined : (new Date().getTime() - task.source.lastUpdated) / 1000;
					reportTelemetry(this.telemetryService, isUpdate ? 'extensionGallery:update' : 'extensionGallery:install', {
						extensionData: getGalleryExtensionTelemetryData(task.source),
						verificationStatus: task.verificationStatus,
						duration: new Date().getTime() - startTime,
						durationSinceUpdate,
						source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
					});
					// In web, report extension install statistics explicitly. In Desktop, statistics are automatically updated while downloading the VSIX.
					if (isWeb && task.operation !== InstallOperation.Update) {
						try {
							await this.galleryService.reportStatistic(local.manifest.publisher, local.manifest.name, local.manifest.version, StatisticType.Install);
						} catch (error) { /* ignore */ }
					}
				}
				installExtensionResultsMap.set(key, { local, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: local.isApplicationScoped });
			}));

			if (alreadyRequestedInstallations.length) {
				await this.joinAllSettled(alreadyRequestedInstallations);
			}
		} catch (error) {
			const getAllDepsAndPacks = (extension: ILocalExtension, profileLocation: URI, allDepsOrPacks: string[]) => {
				const depsOrPacks = [];
				if (extension.manifest.extensionDependencies?.length) {
					depsOrPacks.push(...extension.manifest.extensionDependencies);
				}
				if (extension.manifest.extensionPack?.length) {
					depsOrPacks.push(...extension.manifest.extensionPack);
				}
				for (const id of depsOrPacks) {
					if (allDepsOrPacks.includes(id.toLowerCase())) {
						continue;
					}
					allDepsOrPacks.push(id.toLowerCase());
					const installed = installExtensionResultsMap.get(`${id.toLowerCase()}-${profileLocation.toString()}`);
					if (installed?.local) {
						allDepsOrPacks = getAllDepsAndPacks(installed.local, profileLocation, allDepsOrPacks);
					}
				}
				return allDepsOrPacks;
			};
			const getErrorResult = (task: IInstallExtensionTask) => ({ identifier: task.identifier, operation: InstallOperation.Install, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, error });

			const rollbackTasks: IUninstallExtensionTask[] = [];
			for (const [key, { task, root }] of installingExtensionsMap) {
				const result = installExtensionResultsMap.get(key);
				if (!result) {
					task.cancel();
					installExtensionResultsMap.set(key, getErrorResult(task));
				}
				// If the extension is installed by a root task and the root task is failed, then uninstall the extension
				else if (result.local && root && !installExtensionResultsMap.get(`${root.identifier.id.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local) {
					rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
					installExtensionResultsMap.set(key, getErrorResult(task));
				}
			}
			for (const [key, { task }] of installingExtensionsMap) {
				const result = installExtensionResultsMap.get(key);
				if (!result?.local) {
					continue;
				}
				if (task.options.donotIncludePackAndDependencies) {
					continue;
				}
				const depsOrPacks = getAllDepsAndPacks(result.local, task.options.profileLocation, [result.local.identifier.id.toLowerCase()]).slice(1);
				if (depsOrPacks.some(depOrPack => installingExtensionsMap.has(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`) && !installExtensionResultsMap.get(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local)) {
					rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
					installExtensionResultsMap.set(key, getErrorResult(task));
				}
			}

			if (rollbackTasks.length) {
				await Promise.allSettled(rollbackTasks.map(async rollbackTask => {
					try {
						await rollbackTask.run();
						this.logService.info('Rollback: Uninstalled extension', rollbackTask.extension.identifier.id);
					} catch (error) {
						this.logService.warn('Rollback: Error while uninstalling extension', rollbackTask.extension.identifier.id, getErrorMessage(error));
					}
				}));
			}
		} finally {
			// Finally, remove all the tasks from the cache
			for (const { task } of installingExtensionsMap.values()) {
				if (task.source && !URI.isUri(task.source)) {
					this.installingExtensions.delete(getInstallExtensionTaskKey(task.source, task.options.profileLocation));
				}
			}
		}
		const results = [...installExtensionResultsMap.values()];
		for (const result of results) {
			if (result.local) {
				this.logService.info(`Extension installed successfully:`, result.identifier.id, result.profileLocation.toString());
			}
		}
		this._onDidInstallExtensions.fire(results);
		return results;
	}

	private async getOtherProfilesToUpdateExtension(tasks: IInstallExtensionTask[]): Promise<[URI, IInstallExtensionTask][]> {
		const otherProfilesToUpdate: [URI, IInstallExtensionTask][] = [];
		const profileExtensionsCache = new ResourceMap<ILocalExtension[]>();
		for (const task of tasks) {
			if (task.operation !== InstallOperation.Update
				|| task.options.isApplicationScoped
				|| task.options.pinned
				|| task.options.installGivenVersion
				|| URI.isUri(task.source)
			) {
				continue;
			}
			for (const profile of this.userDataProfilesService.profiles) {
				if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, task.options.profileLocation)) {
					continue;
				}
				let installedExtensions = profileExtensionsCache.get(profile.extensionsResource);
				if (!installedExtensions) {
					installedExtensions = await this.getInstalled(ExtensionType.User, profile.extensionsResource);
					profileExtensionsCache.set(profile.extensionsResource, installedExtensions);
				}
				const installedExtension = installedExtensions.find(e => areSameExtensions(e.identifier, task.identifier));
				if (installedExtension && !installedExtension.pinned) {
					otherProfilesToUpdate.push([profile.extensionsResource, task]);
				}
			}
		}
		return otherProfilesToUpdate;
	}

	private canWaitForTask(taskToWait: IInstallExtensionTask, taskToWaitFor: IInstallExtensionTask): boolean {
		for (const [, { task, waitingTasks }] of this.installingExtensions.entries()) {
			if (task === taskToWait) {
				// Cannot be waited, If taskToWaitFor is waiting for taskToWait
				if (waitingTasks.includes(taskToWaitFor)) {
					return false;
				}
				// Cannot be waited, If taskToWaitFor is waiting for tasks waiting for taskToWait
				if (waitingTasks.some(waitingTask => this.canWaitForTask(waitingTask, taskToWaitFor))) {
					return false;
				}
			}
			// Cannot be waited, if the taskToWait cannot be waited for the task created the taskToWaitFor
			// Because, the task waits for the tasks it created
			if (task === taskToWaitFor && waitingTasks[0] && !this.canWaitForTask(taskToWait, waitingTasks[0])) {
				return false;
			}
		}
		return true;
	}

	private async joinAllSettled<T>(promises: Promise<T>[], errorCode?: ExtensionManagementErrorCode): Promise<T[]> {
		const results: T[] = [];
		const errors: ExtensionManagementError[] = [];
		const promiseResults = await Promise.allSettled(promises);
		for (const r of promiseResults) {
			if (r.status === 'fulfilled') {
				results.push(r.value);
			} else {
				errors.push(toExtensionManagementError(r.reason, errorCode));
			}
		}

		if (!errors.length) {
			return results;
		}

		// Throw if there are errors
		if (errors.length === 1) {
			throw errors[0];
		}

		let error = new ExtensionManagementError('', ExtensionManagementErrorCode.Unknown);
		for (const current of errors) {
			error = new ExtensionManagementError(
				error.message ? `${error.message}, ${current.message}` : current.message,
				current.code !== ExtensionManagementErrorCode.Unknown && current.code !== ExtensionManagementErrorCode.Internal ? current.code : error.code
			);
		}
		throw error;
	}

	private async getAllDepsAndPackExtensions(extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest, preferPreRelease: boolean, productVersion: IProductVersion, installed: ILocalExtension[]): Promise<{ gallery: IGalleryExtension; manifest: IExtensionManifest }[]> {
		if (!this.galleryService.isEnabled()) {
			return [];
		}

		const knownIdentifiers: IExtensionIdentifier[] = [];

		const allDependenciesAndPacks: { gallery: IGalleryExtension; manifest: IExtensionManifest }[] = [];
		const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest): Promise<void> => {
			knownIdentifiers.push(extensionIdentifier);
			const dependecies: string[] = manifest.extensionDependencies || [];
			const dependenciesAndPackExtensions = [...dependecies];
			if (manifest.extensionPack) {
				const existing = installed.find(e => areSameExtensions(e.identifier, extensionIdentifier));
				for (const extension of manifest.extensionPack) {
					// add only those extensions which are new in currently installed extension
					if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some(old => areSameExtensions({ id: old }, { id: extension })))) {
						if (dependenciesAndPackExtensions.every(e => !areSameExtensions({ id: e }, { id: extension }))) {
							dependenciesAndPackExtensions.push(extension);
						}
					}
				}
			}

			if (dependenciesAndPackExtensions.length) {
				// filter out known extensions
				const ids = dependenciesAndPackExtensions.filter(id => knownIdentifiers.every(galleryIdentifier => !areSameExtensions(galleryIdentifier, { id })));
				if (ids.length) {
					const galleryExtensions = await this.galleryService.getExtensions(ids.map(id => ({ id, preRelease: preferPreRelease })), CancellationToken.None);
					for (const galleryExtension of galleryExtensions) {
						if (knownIdentifiers.find(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
							continue;
						}
						const isDependency = dependecies.some(id => areSameExtensions({ id }, galleryExtension.identifier));
						let compatible;
						try {
							compatible = await this.checkAndGetCompatibleVersion(galleryExtension, false, preferPreRelease, productVersion);
						} catch (error) {
							if (!isDependency) {
								this.logService.info('Skipping the packed extension as it cannot be installed', galleryExtension.identifier.id, getErrorMessage(error));
								continue;
							} else {
								throw error;
							}
						}
						allDependenciesAndPacks.push({ gallery: compatible.extension, manifest: compatible.manifest });
						await collectDependenciesAndPackExtensionsToInstall(compatible.extension.identifier, compatible.manifest);
					}
				}
			}
		};

		await collectDependenciesAndPackExtensionsToInstall(extensionIdentifier, manifest);
		return allDependenciesAndPacks;
	}

	private async checkAndGetCompatibleVersion(extension: IGalleryExtension, sameVersion: boolean, installPreRelease: boolean, productVersion: IProductVersion): Promise<{ extension: IGalleryExtension; manifest: IExtensionManifest }> {
		let compatibleExtension: IGalleryExtension | null;

		const extensionsControlManifest = await this.getExtensionsControlManifest();
		if (isMalicious(extension.identifier, extensionsControlManifest.malicious)) {
			throw new ExtensionManagementError(nls.localize('malicious extension', "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), ExtensionManagementErrorCode.Malicious);
		}

		const deprecationInfo = extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()];
		if (deprecationInfo?.extension?.autoMigrate) {
			this.logService.info(`The '${extension.identifier.id}' extension is deprecated, fetching the compatible '${deprecationInfo.extension.id}' extension instead.`);
			compatibleExtension = (await this.galleryService.getExtensions([{ id: deprecationInfo.extension.id, preRelease: deprecationInfo.extension.preRelease }], { targetPlatform: await this.getTargetPlatform(), compatible: true, productVersion }, CancellationToken.None))[0];
			if (!compatibleExtension) {
				throw new ExtensionManagementError(nls.localize('notFoundDeprecatedReplacementExtension', "Can't install '{0}' extension since it was deprecated and the replacement extension '{1}' can't be found.", extension.identifier.id, deprecationInfo.extension.id), ExtensionManagementErrorCode.Deprecated);
			}
		}

		else {
			if (await this.canInstall(extension) !== true) {
				const targetPlatform = await this.getTargetPlatform();
				throw new ExtensionManagementError(nls.localize('incompatible platform', "The '{0}' extension is not available in {1} for the {2}.", extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform)), ExtensionManagementErrorCode.IncompatibleTargetPlatform);
			}

			compatibleExtension = await this.getCompatibleVersion(extension, sameVersion, installPreRelease, productVersion);
			if (!compatibleExtension) {
				const incompatibleApiProposalsMessages: string[] = [];
				if (!areApiProposalsCompatible(extension.properties.enabledApiProposals ?? [], incompatibleApiProposalsMessages)) {
					throw new ExtensionManagementError(nls.localize('incompatibleAPI', "Can't install '{0}' extension. {1}", extension.displayName ?? extension.identifier.id, incompatibleApiProposalsMessages[0]), ExtensionManagementErrorCode.IncompatibleApi);
				}
				/** If no compatible release version is found, check if the extension has a release version or not and throw relevant error */
				if (!installPreRelease && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
					throw new ExtensionManagementError(nls.localize('notFoundReleaseExtension', "Can't install release version of '{0}' extension because it has no release version.", extension.displayName ?? extension.identifier.id), ExtensionManagementErrorCode.ReleaseVersionNotFound);
				}
				throw new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), ExtensionManagementErrorCode.Incompatible);
			}
		}

		this.logService.info('Getting Manifest...', compatibleExtension.identifier.id);
		const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
		if (manifest === null) {
			throw new ExtensionManagementError(`Missing manifest for extension ${compatibleExtension.identifier.id}`, ExtensionManagementErrorCode.Invalid);
		}

		if (manifest.version !== compatibleExtension.version) {
			throw new ExtensionManagementError(`Cannot install '${compatibleExtension.identifier.id}' extension because of version mismatch in Marketplace`, ExtensionManagementErrorCode.Invalid);
		}

		return { extension: compatibleExtension, manifest };
	}

	protected async getCompatibleVersion(extension: IGalleryExtension, sameVersion: boolean, includePreRelease: boolean, productVersion: IProductVersion): Promise<IGalleryExtension | null> {
		const targetPlatform = await this.getTargetPlatform();
		let compatibleExtension: IGalleryExtension | null = null;

		if (!sameVersion && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion !== includePreRelease) {
			compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: includePreRelease }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
		}

		if (!compatibleExtension && await this.galleryService.isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion)) {
			compatibleExtension = extension;
		}

		if (!compatibleExtension) {
			if (sameVersion) {
				compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, version: extension.version }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
			} else {
				compatibleExtension = await this.galleryService.getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion);
			}
		}

		return compatibleExtension;
	}

	private getUninstallExtensionTaskKey(identifier: IExtensionIdentifier, profileLocation: URI, version?: string): string {
		return `${identifier.id.toLowerCase()}${version ? `-${version}` : ''}@${profileLocation.toString()}`;
	}

	async uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void> {

		const getUninstallExtensionTaskKey = (extension: ILocalExtension, uninstallOptions: UninstallExtensionTaskOptions) => this.getUninstallExtensionTaskKey(extension.identifier, uninstallOptions.profileLocation, uninstallOptions.versionOnly ? extension.manifest.version : undefined);

		const createUninstallExtensionTask = (extension: ILocalExtension, uninstallOptions: UninstallExtensionTaskOptions): void => {
			let installTaskToWaitFor: IInstallExtensionTask | undefined;
			for (const { task } of this.installingExtensions.values()) {
				if (!(task.source instanceof URI) && areSameExtensions(task.identifier, extension.identifier) && this.uriIdentityService.extUri.isEqual(task.options.profileLocation, uninstallOptions.profileLocation)) {
					installTaskToWaitFor = task;
					break;
				}
			}
			const task = this.createUninstallExtensionTask(extension, uninstallOptions);
			this.uninstallingExtensions.set(getUninstallExtensionTaskKey(task.extension, uninstallOptions), task);
			this.logService.info('Uninstalling extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
			this._onUninstallExtension.fire({ identifier: extension.identifier, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
			allTasks.push({ task, installTaskToWaitFor });
		};

		const postUninstallExtension = (extension: ILocalExtension, uninstallOptions: UninstallExtensionTaskOptions, error?: ExtensionManagementError): void => {
			if (error) {
				this.logService.error('Failed to uninstall extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString(), error.message);
			} else {
				this.logService.info('Successfully uninstalled extension from the profile', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
			}
			reportTelemetry(this.telemetryService, 'extensionGallery:uninstall', { extensionData: getLocalExtensionTelemetryData(extension), error });
			this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: error?.code, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
		};

		const allTasks: { task: IUninstallExtensionTask; installTaskToWaitFor?: IInstallExtensionTask }[] = [];
		const processedTasks: IUninstallExtensionTask[] = [];
		const alreadyRequestedUninstalls: Promise<any>[] = [];
		const extensionsToRemove: ILocalExtension[] = [];

		const installedExtensionsMap = new ResourceMap<ILocalExtension[]>();
		const getInstalledExtensions = async (profileLocation: URI) => {
			let installed = installedExtensionsMap.get(profileLocation);
			if (!installed) {
				installedExtensionsMap.set(profileLocation, installed = await this.getInstalled(ExtensionType.User, profileLocation));
			}
			return installed;
		};

		for (const { extension, options } of extensions) {
			const uninstallOptions: UninstallExtensionTaskOptions = {
				...options,
				profileLocation: extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options?.profileLocation ?? this.getCurrentExtensionsManifestLocation()
			};
			const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(extension, uninstallOptions));
			if (uninstallExtensionTask) {
				this.logService.info('Extensions is already requested to uninstall', extension.identifier.id);
				alreadyRequestedUninstalls.push(uninstallExtensionTask.waitUntilTaskIsFinished());
			} else {
				createUninstallExtensionTask(extension, uninstallOptions);
			}

			if (uninstallOptions.remove || extension.isApplicationScoped) {
				if (uninstallOptions.remove) {
					extensionsToRemove.push(extension);
				}
				for (const profile of this.userDataProfilesService.profiles) {
					if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, uninstallOptions.profileLocation)) {
						continue;
					}
					const installed = await getInstalledExtensions(profile.extensionsResource);
					const profileExtension = installed.find(e => areSameExtensions(e.identifier, extension.identifier));
					if (profileExtension) {
						const uninstallOptionsWithProfile = { ...uninstallOptions, profileLocation: profile.extensionsResource };
						const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(profileExtension, uninstallOptionsWithProfile));
						if (uninstallExtensionTask) {
							this.logService.info('Extensions is already requested to uninstall', profileExtension.identifier.id);
							alreadyRequestedUninstalls.push(uninstallExtensionTask.waitUntilTaskIsFinished());
						} else {
							createUninstallExtensionTask(profileExtension, uninstallOptionsWithProfile);
						}
					}
				}
			}
		}

		try {
			for (const { task } of allTasks.slice(0)) {
				const installed = await getInstalledExtensions(task.options.profileLocation);

				if (task.options.donotIncludePack) {
					this.logService.info('Uninstalling the extension without including packed extension', `${task.extension.identifier.id}@${task.extension.manifest.version}`);
				} else {
					const packedExtensions = this.getAllPackExtensionsToUninstall(task.extension, installed);
					for (const packedExtension of packedExtensions) {
						if (this.uninstallingExtensions.has(getUninstallExtensionTaskKey(packedExtension, task.options))) {
							this.logService.info('Extensions is already requested to uninstall', packedExtension.identifier.id);
						} else {
							createUninstallExtensionTask(packedExtension, task.options);
						}
					}
				}
				if (task.options.donotCheckDependents) {
					this.logService.info('Uninstalling the extension without checking dependents', `${task.extension.identifier.id}@${task.extension.manifest.version}`);
				} else {
					this.checkForDependents(allTasks.map(({ task }) => task.extension), installed, task.extension);
				}
			}

			// Uninstall extensions in parallel and wait until all extensions are uninstalled / failed
			await this.joinAllSettled(allTasks.map(async ({ task, installTaskToWaitFor }) => {
				try {
					// Wait for opposite task if it exists
					if (installTaskToWaitFor) {
						this.logService.info('Waiting for existing install task to complete before uninstalling', task.extension.identifier.id);
						try {
							await installTaskToWaitFor.waitUntilTaskIsFinished();
							this.logService.info('Finished waiting for install task, proceeding with uninstall', task.extension.identifier.id);
						} catch (error) {
							this.logService.info('Install task failed, proceeding with uninstall anyway', task.extension.identifier.id, getErrorMessage(error));
						}
					}

					await task.run();
					await this.joinAllSettled(this.participants.map(participant => participant.postUninstall(task.extension, task.options, CancellationToken.None)));
					// only report if extension has a mapped gallery extension. UUID identifies the gallery extension.
					if (task.extension.identifier.uuid) {
						try {
							await this.galleryService.reportStatistic(task.extension.manifest.publisher, task.extension.manifest.name, task.extension.manifest.version, StatisticType.Uninstall);
						} catch (error) { /* ignore */ }
					}
				} catch (e) {
					const error = toExtensionManagementError(e);
					postUninstallExtension(task.extension, task.options, error);
					throw error;
				} finally {
					processedTasks.push(task);
				}
			}));

			if (alreadyRequestedUninstalls.length) {
				await this.joinAllSettled(alreadyRequestedUninstalls);
			}

			for (const { task } of allTasks) {
				postUninstallExtension(task.extension, task.options);
			}

			if (extensionsToRemove.length) {
				await this.joinAllSettled(extensionsToRemove.map(extension => this.deleteExtension(extension)));
			}
		} catch (e) {
			const error = toExtensionManagementError(e);
			for (const { task } of allTasks) {
				// cancel the tasks
				try { task.cancel(); } catch (error) { /* ignore */ }
				if (!processedTasks.includes(task)) {
					postUninstallExtension(task.extension, task.options, error);
				}
			}
			throw error;
		} finally {
			// Remove tasks from cache
			for (const { task } of allTasks) {
				if (!this.uninstallingExtensions.delete(getUninstallExtensionTaskKey(task.extension, task.options))) {
					this.logService.warn('Uninstallation task is not found in the cache', task.extension.identifier.id);
				}
			}
		}
	}

	private checkForDependents(extensionsToUninstall: ILocalExtension[], installed: ILocalExtension[], extensionToUninstall: ILocalExtension): void {
		for (const extension of extensionsToUninstall) {
			const dependents = this.getDependents(extension, installed);
			if (dependents.length) {
				const remainingDependents = dependents.filter(dependent => !extensionsToUninstall.some(e => areSameExtensions(e.identifier, dependent.identifier)));
				if (remainingDependents.length) {
					throw new Error(this.getDependentsErrorMessage(extension, remainingDependents, extensionToUninstall));
				}
			}
		}
	}

	private getDependentsErrorMessage(dependingExtension: ILocalExtension, dependents: ILocalExtension[], extensionToUninstall: ILocalExtension): string {
		if (extensionToUninstall === dependingExtension) {
			if (dependents.length === 1) {
				return nls.localize('singleDependentError', "Cannot uninstall '{0}' extension. '{1}' extension depends on this.",
					extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
			}
			if (dependents.length === 2) {
				return nls.localize('twoDependentsError', "Cannot uninstall '{0}' extension. '{1}' and '{2}' extensions depend on this.",
					extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
			}
			return nls.localize('multipleDependentsError', "Cannot uninstall '{0}' extension. '{1}', '{2}' and other extension depend on this.",
				extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
		}
		if (dependents.length === 1) {
			return nls.localize('singleIndirectDependentError', "Cannot uninstall '{0}' extension . It includes uninstalling '{1}' extension and '{2}' extension depends on this.",
				extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
			|| dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
		}
		if (dependents.length === 2) {
			return nls.localize('twoIndirectDependentsError', "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}' and '{3}' extensions depend on this.",
				extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
			|| dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
		}
		return nls.localize('multipleIndirectDependentsError', "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}', '{3}' and other extensions depend on this.",
			extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
		|| dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);

	}

	private getAllPackExtensionsToUninstall(extension: ILocalExtension, installed: ILocalExtension[], checked: ILocalExtension[] = []): ILocalExtension[] {
		if (checked.indexOf(extension) !== -1) {
			return [];
		}
		checked.push(extension);
		const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
		if (extensionsPack.length) {
			const packedExtensions = installed.filter(i => !i.isBuiltin && extensionsPack.some(id => areSameExtensions({ id }, i.identifier)));
			const packOfPackedExtensions: ILocalExtension[] = [];
			for (const packedExtension of packedExtensions) {
				packOfPackedExtensions.push(...this.getAllPackExtensionsToUninstall(packedExtension, installed, checked));
			}
			return [...packedExtensions, ...packOfPackedExtensions];
		}
		return [];
	}

	private getDependents(extension: ILocalExtension, installed: ILocalExtension[]): ILocalExtension[] {
		return installed.filter(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
	}

	private async updateControlCache(): Promise<IExtensionsControlManifest> {
		try {
			this.logService.trace('ExtensionManagementService.updateControlCache');
			return await this.galleryService.getExtensionsControlManifest();
		} catch (err) {
			this.logService.trace('ExtensionManagementService.refreshControlCache - failed to get extension control manifest', getErrorMessage(err));
			return { malicious: [], deprecated: {}, search: [] };
		}
	}

	protected abstract getCurrentExtensionsManifestLocation(): URI;
	protected abstract createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallExtensionTaskOptions): IInstallExtensionTask;
	protected abstract createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask;
	protected abstract copyExtension(extension: ILocalExtension, fromProfileLocation: URI, toProfileLocation: URI, metadata?: Partial<Metadata>): Promise<ILocalExtension>;
	protected abstract moveExtension(extension: ILocalExtension, fromProfileLocation: URI, toProfileLocation: URI, metadata?: Partial<Metadata>): Promise<ILocalExtension>;
	protected abstract removeExtension(extension: ILocalExtension, fromProfileLocation: URI): Promise<void>;
	protected abstract deleteExtension(extension: ILocalExtension): Promise<void>;
}

export function toExtensionManagementError(error: Error, code?: ExtensionManagementErrorCode): ExtensionManagementError {
	if (error instanceof ExtensionManagementError) {
		return error;
	}
	let extensionManagementError: ExtensionManagementError;
	if (error instanceof ExtensionGalleryError) {
		extensionManagementError = new ExtensionManagementError(error.message, error.code === ExtensionGalleryErrorCode.DownloadFailedWriting ? ExtensionManagementErrorCode.DownloadFailedWriting : ExtensionManagementErrorCode.Gallery);
	} else {
		extensionManagementError = new ExtensionManagementError(error.message, isCancellationError(error) ? ExtensionManagementErrorCode.Cancelled : (code ?? ExtensionManagementErrorCode.Internal));
	}
	extensionManagementError.stack = error.stack;
	return extensionManagementError;
}

function reportTelemetry(telemetryService: ITelemetryService, eventName: string,
	{
		extensionData,
		verificationStatus,
		duration,
		error,
		source,
		durationSinceUpdate
	}: {
		extensionData: any;
		verificationStatus?: ExtensionSignatureVerificationCode;
		duration?: number;
		durationSinceUpdate?: number;
		source?: string;
		error?: ExtensionManagementError | ExtensionGalleryError;
	}): void {

	/* __GDPR__
		"extensionGallery:install" : {
			"owner": "sandy081",
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"durationSinceUpdate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"recommendationReason": { "retiredFromVersion": "1.23.0", "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"verificationStatus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	/* __GDPR__
		"extensionGallery:uninstall" : {
			"owner": "sandy081",
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	/* __GDPR__
		"extensionGallery:update" : {
			"owner": "sandy081",
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"verificationStatus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	telemetryService.publicLog(eventName, {
		...extensionData,
		source,
		duration,
		durationSinceUpdate,
		success: !error,
		errorcode: error?.code,
		verificationStatus: verificationStatus === ExtensionSignatureVerificationCode.Success ? 'Verified' : (verificationStatus ?? 'Unverified')
	});
}

export abstract class AbstractExtensionTask<T> {

	private readonly barrier = new Barrier();
	private cancellablePromise: CancelablePromise<T> | undefined;

	async waitUntilTaskIsFinished(): Promise<T> {
		await this.barrier.wait();
		return this.cancellablePromise!;
	}

	run(): Promise<T> {
		if (!this.cancellablePromise) {
			this.cancellablePromise = createCancelablePromise(token => this.doRun(token));
		}
		this.barrier.open();
		return this.cancellablePromise;
	}

	cancel(): void {
		if (!this.cancellablePromise) {
			this.cancellablePromise = createCancelablePromise(token => {
				return new Promise((c, e) => {
					const disposable = token.onCancellationRequested(() => {
						disposable.dispose();
						e(new CancellationError());
					});
				});
			});
			this.barrier.open();
		}
		this.cancellablePromise.cancel();
	}

	protected abstract doRun(token: CancellationToken): Promise<T>;
}
