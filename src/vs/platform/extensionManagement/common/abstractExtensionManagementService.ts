/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, isNonEmptyArray } from 'vs/base/common/arrays';
import { Barrier, CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError, getErrorMessage } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import {
	ExtensionManagementError, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementParticipant, IGalleryExtension, ILocalExtension, InstallOperation,
	IExtensionsControlManifest, StatisticType, isTargetPlatformCompatible, TargetPlatformToString, ExtensionManagementErrorCode,
	InstallOptions, InstallVSIXOptions, UninstallOptions, Metadata, InstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent, IExtensionManagementService, InstallExtensionInfo, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, ExtensionKey, getGalleryExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, IExtensionManifest, isApplicationScopedExtension, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export type ExtensionVerificationStatus = boolean | string;
export type InstallableExtension = { readonly manifest: IExtensionManifest; extension: IGalleryExtension | URI; options: InstallOptions & InstallVSIXOptions };

export type InstallExtensionTaskOptions = InstallOptions & InstallVSIXOptions & { readonly profileLocation: URI };
export interface IInstallExtensionTask {
	readonly identifier: IExtensionIdentifier;
	readonly source: IGalleryExtension | URI;
	readonly operation: InstallOperation;
	readonly profileLocation: URI;
	readonly verificationStatus?: ExtensionVerificationStatus;
	run(): Promise<ILocalExtension>;
	waitUntilTaskIsFinished(): Promise<ILocalExtension>;
	cancel(): void;
}

export type UninstallExtensionTaskOptions = UninstallOptions & { readonly profileLocation: URI };
export interface IUninstallExtensionTask {
	readonly extension: ILocalExtension;
	run(): Promise<void>;
	waitUntilTaskIsFinished(): Promise<void>;
	cancel(): void;
}

export abstract class AbstractExtensionManagementService extends Disposable implements IExtensionManagementService {

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

	protected readonly _onDidUpdateExtensionMetadata = this._register(new Emitter<ILocalExtension>());
	get onDidUpdateExtensionMetadata() { return this._onDidUpdateExtensionMetadata.event; }

	private readonly participants: IExtensionManagementParticipant[] = [];

	constructor(
		@IExtensionGalleryService protected readonly galleryService: IExtensionGalleryService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@ILogService protected readonly logService: ILogService,
		@IProductService protected readonly productService: IProductService,
		@IUserDataProfilesService protected readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();
		this._register(toDisposable(() => {
			this.installingExtensions.forEach(({ task }) => task.cancel());
			this.uninstallingExtensions.forEach(promise => promise.cancel());
			this.installingExtensions.clear();
			this.uninstallingExtensions.clear();
		}));
	}

	async canInstall(extension: IGalleryExtension): Promise<boolean> {
		const currentTargetPlatform = await this.getTargetPlatform();
		return extension.allTargetPlatforms.some(targetPlatform => isTargetPlatformCompatible(targetPlatform, extension.allTargetPlatforms, currentTargetPlatform));
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
			throw toExtensionManagementError(new Error(`Unknown error while installing extension ${extension.identifier.id}`));
		} catch (error) {
			throw toExtensionManagementError(error);
		}
	}

	async installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]> {
		if (!this.galleryService.isEnabled()) {
			throw new ExtensionManagementError(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"), ExtensionManagementErrorCode.Internal);
		}

		const results: InstallExtensionResult[] = [];
		const installableExtensions: InstallableExtension[] = [];

		await Promise.allSettled(extensions.map(async ({ extension, options }) => {
			try {
				const compatible = await this.checkAndGetCompatibleVersion(extension, !!options?.installGivenVersion, !!options?.installPreReleaseVersion);
				installableExtensions.push({ ...compatible, options });
			} catch (error) {
				results.push({ identifier: extension.identifier, operation: InstallOperation.Install, source: extension, error });
			}
		}));

		if (installableExtensions.length) {
			results.push(...await this.installExtensions(installableExtensions));
		}

		for (const result of results) {
			if (result.error) {
				this.logService.error(`Failed to install extension.`, result.identifier.id);
				this.logService.error(result.error);
				if (result.source && !URI.isUri(result.source)) {
					reportTelemetry(this.telemetryService, 'extensionGallery:install', { extensionData: getGalleryExtensionTelemetryData(result.source), error: result.error });
				}
			}
		}

		return results;
	}

	async uninstall(extension: ILocalExtension, options: UninstallOptions = {}): Promise<void> {
		this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
		return this.uninstallExtension(extension, options);
	}

	async toggleAppliationScope(extension: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension> {
		if (isApplicationScopedExtension(extension.manifest)) {
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
					this._onDidUpdateExtensionMetadata.fire(existing);
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

	protected async installExtensions(extensions: InstallableExtension[]): Promise<InstallExtensionResult[]> {
		const results: InstallExtensionResult[] = [];
		await Promise.allSettled(extensions.map(async e => {
			try {
				const result = await this.installExtension(e);
				results.push(...result);
			} catch (error) {
				results.push({ identifier: { id: getGalleryExtensionId(e.manifest.publisher, e.manifest.name) }, operation: InstallOperation.Install, source: e.extension, error });
			}
		}));
		this._onDidInstallExtensions.fire(results);
		return results;
	}

	private async installExtension({ manifest, extension, options }: InstallableExtension): Promise<InstallExtensionResult[]> {

		const isApplicationScoped = options.isApplicationScoped || options.isBuiltin || isApplicationScopedExtension(manifest);
		const installExtensionTaskOptions: InstallExtensionTaskOptions = {
			...options,
			installOnlyNewlyAddedFromExtensionPack: URI.isUri(extension) ? options.installOnlyNewlyAddedFromExtensionPack : true, /* always true for gallery extensions */
			isApplicationScoped,
			profileLocation: isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options.profileLocation ?? this.getCurrentExtensionsManifestLocation()
		};
		const getInstallExtensionTaskKey = (extension: IGalleryExtension) => `${ExtensionKey.create(extension).toString()}${installExtensionTaskOptions.profileLocation ? `-${installExtensionTaskOptions.profileLocation.toString()}` : ''}`;

		// only cache gallery extensions tasks
		if (!URI.isUri(extension)) {
			const installingExtension = this.installingExtensions.get(getInstallExtensionTaskKey(extension));
			if (installingExtension) {
				this.logService.info('Extensions is already requested to install', extension.identifier.id);
				await installingExtension.task.waitUntilTaskIsFinished();
				return [];
			}
		}

		const allInstallExtensionTasks: { task: IInstallExtensionTask; manifest: IExtensionManifest }[] = [];
		const alreadyRequestedInstallations: Promise<void>[] = [];
		const installResults: (InstallExtensionResult & { local: ILocalExtension })[] = [];
		const installExtensionTask = this.createInstallExtensionTask(manifest, extension, installExtensionTaskOptions);
		if (!URI.isUri(extension)) {
			this.installingExtensions.set(getInstallExtensionTaskKey(extension), { task: installExtensionTask, waitingTasks: [] });
		}
		this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension, profileLocation: installExtensionTaskOptions.profileLocation });
		this.logService.info('Installing extension:', installExtensionTask.identifier.id);
		allInstallExtensionTasks.push({ task: installExtensionTask, manifest });
		let installExtensionHasDependents: boolean = false;

		const hasPackExtensions = manifest.extensionPack && manifest.extensionPack.length > 0;
		try {
			if (installExtensionTaskOptions.donotIncludePackAndDependencies) {
				this.logService.info('Installing the extension without checking dependencies and pack', installExtensionTask.identifier.id);
			} else {
				try {
					const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensions(installExtensionTask.identifier, manifest, !!installExtensionTaskOptions.installOnlyNewlyAddedFromExtensionPack, !!installExtensionTaskOptions.installPreReleaseVersion, installExtensionTaskOptions.profileLocation);
					const installed = await this.getInstalled(undefined, installExtensionTaskOptions.profileLocation);
					for (const { gallery, manifest } of distinct(allDepsAndPackExtensionsToInstall, ({ gallery }) => gallery.identifier.id)) {
						installExtensionHasDependents = installExtensionHasDependents || !!manifest.extensionDependencies?.some(id => areSameExtensions({ id }, installExtensionTask.identifier));
						const key = getInstallExtensionTaskKey(gallery);
						const existingInstallingExtension = this.installingExtensions.get(key);
						if (existingInstallingExtension) {
							if (this.canWaitForTask(installExtensionTask, existingInstallingExtension.task)) {
								const identifier = existingInstallingExtension.task.identifier;
								this.logService.info('Waiting for already requested installing extension', identifier.id, installExtensionTask.identifier.id);
								existingInstallingExtension.waitingTasks.push(installExtensionTask);
								// add promise that waits until the extension is completely installed, ie., onDidInstallExtensions event is triggered for this extension
								alreadyRequestedInstallations.push(
									Event.toPromise(
										Event.filter(this.onDidInstallExtensions, results => results.some(result => areSameExtensions(result.identifier, identifier)))
									).then(results => {
										this.logService.info('Finished waiting for already requested installing extension', identifier.id, installExtensionTask.identifier.id);
										const result = results.find(result => areSameExtensions(result.identifier, identifier));
										if (!result?.local) {
											// Extension failed to install
											throw new Error(`Extension ${identifier.id} is not installed`);
										}
									}));
							}
						} else if (!installed.some(({ identifier }) => areSameExtensions(identifier, gallery.identifier))) {
							const task = this.createInstallExtensionTask(manifest, gallery, { ...installExtensionTaskOptions, donotIncludePackAndDependencies: true });
							this.installingExtensions.set(key, { task, waitingTasks: [installExtensionTask] });
							this._onInstallExtension.fire({ identifier: task.identifier, source: gallery, profileLocation: installExtensionTaskOptions.profileLocation });
							this.logService.info('Installing extension:', task.identifier.id, installExtensionTask.identifier.id);
							allInstallExtensionTasks.push({ task, manifest });
						}
					}
				} catch (error) {
					// Installing through VSIX
					if (URI.isUri(installExtensionTask.source)) {
						// Ignore installing dependencies and packs
						if (isNonEmptyArray(manifest.extensionDependencies)) {
							this.logService.warn(`Cannot install dependencies of extension:`, installExtensionTask.identifier.id, error.message);
						}
						if (isNonEmptyArray(manifest.extensionPack)) {
							this.logService.warn(`Cannot install packed extensions of extension:`, installExtensionTask.identifier.id, error.message);
						}
					} else {
						this.logService.error('Error while preparing to install dependencies and extension packs of the extension:', installExtensionTask.identifier.id);
						throw error;
					}
				}
			}

			const extensionsToInstallMap = allInstallExtensionTasks.reduce((result, { task, manifest }) => {
				result.set(task.identifier.id.toLowerCase(), { task, manifest });
				return result;
			}, new Map<string, { task: IInstallExtensionTask; manifest: IExtensionManifest }>());

			while (extensionsToInstallMap.size) {
				let extensionsToInstall;
				const extensionsWithoutDepsToInstall = [...extensionsToInstallMap.values()].filter(({ manifest }) => !manifest.extensionDependencies?.some(id => extensionsToInstallMap.has(id.toLowerCase())));
				if (extensionsWithoutDepsToInstall.length) {
					extensionsToInstall = extensionsToInstallMap.size === 1 ? extensionsWithoutDepsToInstall
						/* If the main extension has no dependents remove it and install it at the end */
						: extensionsWithoutDepsToInstall.filter(({ task }) => !(task === installExtensionTask && !installExtensionHasDependents));
				} else {
					this.logService.info('Found extensions with circular dependencies', extensionsWithoutDepsToInstall.map(({ task }) => task.identifier.id));
					extensionsToInstall = [...extensionsToInstallMap.values()];
				}

				// Install extensions in parallel and wait until all extensions are installed / failed
				await this.joinAllSettled(extensionsToInstall.map(async ({ task }) => {
					const startTime = new Date().getTime();
					try {
						const local = await task.run();
						await this.joinAllSettled(this.participants.map(participant => participant.postInstall(local, task.source, installExtensionTaskOptions, CancellationToken.None)));
						if (!URI.isUri(task.source)) {
							const isUpdate = task.operation === InstallOperation.Update;
							const durationSinceUpdate = isUpdate ? undefined : (new Date().getTime() - task.source.lastUpdated) / 1000;
							reportTelemetry(this.telemetryService, isUpdate ? 'extensionGallery:update' : 'extensionGallery:install', {
								extensionData: getGalleryExtensionTelemetryData(task.source),
								verificationStatus: task.verificationStatus,
								duration: new Date().getTime() - startTime,
								durationSinceUpdate
							});
							// In web, report extension install statistics explicitly. In Desktop, statistics are automatically updated while downloading the VSIX.
							if (isWeb && task.operation !== InstallOperation.Update) {
								try {
									await this.galleryService.reportStatistic(local.manifest.publisher, local.manifest.name, local.manifest.version, StatisticType.Install);
								} catch (error) { /* ignore */ }
							}
						}

						const context = installExtensionTaskOptions.context ?? {};
						if (hasPackExtensions && task.identifier.id !== installExtensionTask.identifier.id) {
							context[EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT] = true;
						}

						installResults.push({ local, identifier: task.identifier, operation: task.operation, source: task.source, context: context, profileLocation: task.profileLocation, applicationScoped: local.isApplicationScoped });
					} catch (error) {
						if (!URI.isUri(task.source)) {
							reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install', {
								extensionData: getGalleryExtensionTelemetryData(task.source),
								verificationStatus: task.verificationStatus,
								duration: new Date().getTime() - startTime,
								error
							});
						}
						this.logService.error('Error while installing the extension:', task.identifier.id);
						throw error;
					} finally { extensionsToInstallMap.delete(task.identifier.id.toLowerCase()); }
				}));
			}

			if (alreadyRequestedInstallations.length) {
				await this.joinAllSettled(alreadyRequestedInstallations);
			}

			installResults.forEach(({ identifier }) => this.logService.info(`Extension installed successfully:`, identifier.id));
			return installResults;

		} catch (error) {

			// cancel all tasks
			allInstallExtensionTasks.forEach(({ task }) => task.cancel());

			// rollback installed extensions
			if (installResults.length) {
				try {
					const result = await Promise.allSettled(installResults.map(({ local }) => this.createUninstallExtensionTask(local, { versionOnly: true, profileLocation: installExtensionTaskOptions.profileLocation }).run()));
					for (let index = 0; index < result.length; index++) {
						const r = result[index];
						const { identifier } = installResults[index];
						if (r.status === 'fulfilled') {
							this.logService.info('Rollback: Uninstalled extension', identifier.id);
						} else {
							this.logService.warn('Rollback: Error while uninstalling extension', identifier.id, getErrorMessage(r.reason));
						}
					}
				} catch (error) {
					// ignore error
					this.logService.warn('Error while rolling back extensions', getErrorMessage(error), installResults.map(({ identifier }) => identifier.id));
				}
			}

			return allInstallExtensionTasks.map(({ task }) => ({ identifier: task.identifier, operation: InstallOperation.Install, source: task.source, context: installExtensionTaskOptions.context, profileLocation: installExtensionTaskOptions.profileLocation, error }));
		} finally {
			// Finally, remove all the tasks from the cache
			for (const { task } of allInstallExtensionTasks) {
				if (task.source && !URI.isUri(task.source)) {
					this.installingExtensions.delete(getInstallExtensionTaskKey(task.source));
				}
			}
		}
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

	private async joinAllSettled<T>(promises: Promise<T>[]): Promise<T[]> {
		const results: T[] = [];
		const errors: any[] = [];
		const promiseResults = await Promise.allSettled(promises);
		for (const r of promiseResults) {
			if (r.status === 'fulfilled') {
				results.push(r.value);
			} else {
				errors.push(r.reason);
			}
		}
		// If there are errors, throw the error.
		if (errors.length) { throw joinErrors(errors); }
		return results;
	}

	private async getAllDepsAndPackExtensions(extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest, getOnlyNewlyAddedFromExtensionPack: boolean, installPreRelease: boolean, profile: URI | undefined): Promise<{ gallery: IGalleryExtension; manifest: IExtensionManifest }[]> {
		if (!this.galleryService.isEnabled()) {
			return [];
		}

		const installed = await this.getInstalled(undefined, profile);
		const knownIdentifiers: IExtensionIdentifier[] = [];

		const allDependenciesAndPacks: { gallery: IGalleryExtension; manifest: IExtensionManifest }[] = [];
		const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest): Promise<void> => {
			knownIdentifiers.push(extensionIdentifier);
			const dependecies: string[] = manifest.extensionDependencies || [];
			const dependenciesAndPackExtensions = [...dependecies];
			if (manifest.extensionPack) {
				const existing = getOnlyNewlyAddedFromExtensionPack ? installed.find(e => areSameExtensions(e.identifier, extensionIdentifier)) : undefined;
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
					const galleryExtensions = await this.galleryService.getExtensions(ids.map(id => ({ id, preRelease: installPreRelease })), CancellationToken.None);
					for (const galleryExtension of galleryExtensions) {
						if (knownIdentifiers.find(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
							continue;
						}
						const isDependency = dependecies.some(id => areSameExtensions({ id }, galleryExtension.identifier));
						let compatible;
						try {
							compatible = await this.checkAndGetCompatibleVersion(galleryExtension, false, installPreRelease);
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

	private async checkAndGetCompatibleVersion(extension: IGalleryExtension, sameVersion: boolean, installPreRelease: boolean): Promise<{ extension: IGalleryExtension; manifest: IExtensionManifest }> {
		let compatibleExtension: IGalleryExtension | null;

		const extensionsControlManifest = await this.getExtensionsControlManifest();
		if (extensionsControlManifest.malicious.some(identifier => areSameExtensions(extension.identifier, identifier))) {
			throw new ExtensionManagementError(nls.localize('malicious extension', "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), ExtensionManagementErrorCode.Malicious);
		}

		const deprecationInfo = extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()];
		if (deprecationInfo?.extension?.autoMigrate) {
			this.logService.info(`The '${extension.identifier.id}' extension is deprecated, fetching the compatible '${deprecationInfo.extension.id}' extension instead.`);
			compatibleExtension = (await this.galleryService.getExtensions([{ id: deprecationInfo.extension.id, preRelease: deprecationInfo.extension.preRelease }], { targetPlatform: await this.getTargetPlatform(), compatible: true }, CancellationToken.None))[0];
			if (!compatibleExtension) {
				throw new ExtensionManagementError(nls.localize('notFoundDeprecatedReplacementExtension', "Can't install '{0}' extension since it was deprecated and the replacement extension '{1}' can't be found.", extension.identifier.id, deprecationInfo.extension.id), ExtensionManagementErrorCode.Deprecated);
			}
		}

		else {
			if (!await this.canInstall(extension)) {
				const targetPlatform = await this.getTargetPlatform();
				throw new ExtensionManagementError(nls.localize('incompatible platform', "The '{0}' extension is not available in {1} for {2}.", extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform)), ExtensionManagementErrorCode.IncompatibleTargetPlatform);
			}

			compatibleExtension = await this.getCompatibleVersion(extension, sameVersion, installPreRelease);
			if (!compatibleExtension) {
				/** If no compatible release version is found, check if the extension has a release version or not and throw relevant error */
				if (!installPreRelease && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
					throw new ExtensionManagementError(nls.localize('notFoundReleaseExtension', "Can't install release version of '{0}' extension because it has no release version.", extension.identifier.id), ExtensionManagementErrorCode.ReleaseVersionNotFound);
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

	protected async getCompatibleVersion(extension: IGalleryExtension, sameVersion: boolean, includePreRelease: boolean): Promise<IGalleryExtension | null> {
		const targetPlatform = await this.getTargetPlatform();
		let compatibleExtension: IGalleryExtension | null = null;

		if (!sameVersion && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion !== includePreRelease) {
			compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: includePreRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0] || null;
		}

		if (!compatibleExtension && await this.galleryService.isExtensionCompatible(extension, includePreRelease, targetPlatform)) {
			compatibleExtension = extension;
		}

		if (!compatibleExtension) {
			if (sameVersion) {
				compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, version: extension.version }], { targetPlatform, compatible: true }, CancellationToken.None))[0] || null;
			} else {
				compatibleExtension = await this.galleryService.getCompatibleExtension(extension, includePreRelease, targetPlatform);
			}
		}

		return compatibleExtension;
	}

	private async uninstallExtension(extension: ILocalExtension, options: UninstallOptions): Promise<void> {
		const uninstallOptions: UninstallExtensionTaskOptions = {
			...options,
			profileLocation: extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options.profileLocation ?? this.getCurrentExtensionsManifestLocation()
		};
		const getUninstallExtensionTaskKey = (identifier: IExtensionIdentifier) => `${identifier.id.toLowerCase()}${uninstallOptions.versionOnly ? `-${extension.manifest.version}` : ''}${uninstallOptions.profileLocation ? `@${uninstallOptions.profileLocation.toString()}` : ''}`;
		const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(extension.identifier));
		if (uninstallExtensionTask) {
			this.logService.info('Extensions is already requested to uninstall', extension.identifier.id);
			return uninstallExtensionTask.waitUntilTaskIsFinished();
		}

		const createUninstallExtensionTask = (extension: ILocalExtension): IUninstallExtensionTask => {
			const uninstallExtensionTask = this.createUninstallExtensionTask(extension, uninstallOptions);
			this.uninstallingExtensions.set(getUninstallExtensionTaskKey(uninstallExtensionTask.extension.identifier), uninstallExtensionTask);
			if (uninstallOptions.profileLocation) {
				this.logService.info('Uninstalling extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
			} else {
				this.logService.info('Uninstalling extension:', `${extension.identifier.id}@${extension.manifest.version}`);
			}
			this._onUninstallExtension.fire({ identifier: extension.identifier, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
			return uninstallExtensionTask;
		};

		const postUninstallExtension = (extension: ILocalExtension, error?: ExtensionManagementError): void => {
			if (error) {
				if (uninstallOptions.profileLocation) {
					this.logService.error('Failed to uninstall extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString(), error.message);
				} else {
					this.logService.error('Failed to uninstall extension:', `${extension.identifier.id}@${extension.manifest.version}`, error.message);
				}
			} else {
				if (uninstallOptions.profileLocation) {
					this.logService.info('Successfully uninstalled extension from the profile', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
				} else {
					this.logService.info('Successfully uninstalled extension:', `${extension.identifier.id}@${extension.manifest.version}`);
				}
			}
			reportTelemetry(this.telemetryService, 'extensionGallery:uninstall', { extensionData: getLocalExtensionTelemetryData(extension), error });
			this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: error?.code, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
		};

		const allTasks: IUninstallExtensionTask[] = [];
		const processedTasks: IUninstallExtensionTask[] = [];

		try {
			allTasks.push(createUninstallExtensionTask(extension));
			const installed = await this.getInstalled(ExtensionType.User, uninstallOptions.profileLocation);
			if (uninstallOptions.donotIncludePack) {
				this.logService.info('Uninstalling the extension without including packed extension', `${extension.identifier.id}@${extension.manifest.version}`);
			} else {
				const packedExtensions = this.getAllPackExtensionsToUninstall(extension, installed);
				for (const packedExtension of packedExtensions) {
					if (this.uninstallingExtensions.has(getUninstallExtensionTaskKey(packedExtension.identifier))) {
						this.logService.info('Extensions is already requested to uninstall', packedExtension.identifier.id);
					} else {
						allTasks.push(createUninstallExtensionTask(packedExtension));
					}
				}
			}

			if (uninstallOptions.donotCheckDependents) {
				this.logService.info('Uninstalling the extension without checking dependents', `${extension.identifier.id}@${extension.manifest.version}`);
			} else {
				this.checkForDependents(allTasks.map(task => task.extension), installed, extension);
			}

			// Uninstall extensions in parallel and wait until all extensions are uninstalled / failed
			await this.joinAllSettled(allTasks.map(async task => {
				try {
					await task.run();
					await this.joinAllSettled(this.participants.map(participant => participant.postUninstall(task.extension, uninstallOptions, CancellationToken.None)));
					// only report if extension has a mapped gallery extension. UUID identifies the gallery extension.
					if (task.extension.identifier.uuid) {
						try {
							await this.galleryService.reportStatistic(task.extension.manifest.publisher, task.extension.manifest.name, task.extension.manifest.version, StatisticType.Uninstall);
						} catch (error) { /* ignore */ }
					}
					postUninstallExtension(task.extension);
				} catch (e) {
					const error = e instanceof ExtensionManagementError ? e : new ExtensionManagementError(getErrorMessage(e), ExtensionManagementErrorCode.Internal);
					postUninstallExtension(task.extension, error);
					throw error;
				} finally {
					processedTasks.push(task);
				}
			}));

		} catch (e) {
			const error = e instanceof ExtensionManagementError ? e : new ExtensionManagementError(getErrorMessage(e), ExtensionManagementErrorCode.Internal);
			for (const task of allTasks) {
				// cancel the tasks
				try { task.cancel(); } catch (error) { /* ignore */ }
				if (!processedTasks.includes(task)) {
					postUninstallExtension(task.extension, error);
				}
			}
			throw error;
		} finally {
			// Remove tasks from cache
			for (const task of allTasks) {
				if (!this.uninstallingExtensions.delete(getUninstallExtensionTaskKey(task.extension.identifier))) {
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
			this.logService.trace('ExtensionManagementService.refreshReportedCache');
			const manifest = await this.galleryService.getExtensionsControlManifest();
			this.logService.trace(`ExtensionManagementService.refreshControlCache`, manifest);
			return manifest;
		} catch (err) {
			this.logService.trace('ExtensionManagementService.refreshControlCache - failed to get extension control manifest');
			return { malicious: [], deprecated: {}, search: [] };
		}
	}

	abstract getTargetPlatform(): Promise<TargetPlatform>;
	abstract zip(extension: ILocalExtension): Promise<URI>;
	abstract unzip(zipLocation: URI): Promise<IExtensionIdentifier>;
	abstract getManifest(vsix: URI): Promise<IExtensionManifest>;
	abstract install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension>;
	abstract installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension>;
	abstract installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]>;
	abstract getInstalled(type?: ExtensionType, profileLocation?: URI): Promise<ILocalExtension[]>;
	abstract copyExtensions(fromProfileLocation: URI, toProfileLocation: URI): Promise<void>;
	abstract download(extension: IGalleryExtension, operation: InstallOperation, donotVerifySignature: boolean): Promise<URI>;
	abstract reinstallFromGallery(extension: ILocalExtension): Promise<ILocalExtension>;
	abstract cleanUp(): Promise<void>;

	abstract updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, profileLocation?: URI): Promise<ILocalExtension>;

	protected abstract getCurrentExtensionsManifestLocation(): URI;
	protected abstract createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallExtensionTaskOptions): IInstallExtensionTask;
	protected abstract createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask;
	protected abstract copyExtension(extension: ILocalExtension, fromProfileLocation: URI, toProfileLocation: URI, metadata?: Partial<Metadata>): Promise<ILocalExtension>;
}

export function joinErrors(errorOrErrors: (Error | string) | (Array<Error | string>)): Error {
	const errors = Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors];
	if (errors.length === 1) {
		return errors[0] instanceof Error ? <Error>errors[0] : new Error(<string>errors[0]);
	}
	return errors.reduce<Error>((previousValue: Error, currentValue: Error | string) => {
		return new Error(`${previousValue.message}${previousValue.message ? ',' : ''}${currentValue instanceof Error ? currentValue.message : currentValue}`);
	}, new Error(''));
}

export function toExtensionManagementError(error: Error): ExtensionManagementError {
	if (error instanceof ExtensionManagementError) {
		return error;
	}
	const e = new ExtensionManagementError(error.message, ExtensionManagementErrorCode.Internal);
	e.stack = error.stack;
	return e;
}

function reportTelemetry(telemetryService: ITelemetryService, eventName: string, { extensionData, verificationStatus, duration, error, durationSinceUpdate }: { extensionData: any; verificationStatus?: ExtensionVerificationStatus; duration?: number; durationSinceUpdate?: number; error?: Error }): void {
	let errorcode: ExtensionManagementErrorCode | undefined;
	let errorcodeDetail: string | undefined;

	if (isDefined(verificationStatus)) {
		if (verificationStatus === true) {
			verificationStatus = 'Verified';
		} else if (verificationStatus === false) {
			verificationStatus = 'Unverified';
		} else {
			errorcode = ExtensionManagementErrorCode.Signature;
			errorcodeDetail = verificationStatus;
			verificationStatus = 'Unverified';
		}
	}

	if (error) {
		if (error instanceof ExtensionManagementError) {
			errorcode = error.code;
			if (error.code === ExtensionManagementErrorCode.Signature) {
				errorcodeDetail = error.message;
			}
		} else {
			errorcode = ExtensionManagementErrorCode.Internal;
		}
	}

	/* __GDPR__
		"extensionGallery:install" : {
			"owner": "sandy081",
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"durationSinceUpdate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"errorcodeDetail": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"recommendationReason": { "retiredFromVersion": "1.23.0", "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"verificationStatus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
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
			"errorcodeDetail": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"verificationStatus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	telemetryService.publicLog(eventName, { ...extensionData, verificationStatus, success: !error, duration, errorcode, errorcodeDetail, durationSinceUpdate });
}

export abstract class AbstractExtensionTask<T> {

	private readonly barrier = new Barrier();
	private cancellablePromise: CancelablePromise<T> | undefined;

	async waitUntilTaskIsFinished(): Promise<T> {
		await this.barrier.wait();
		return this.cancellablePromise!;
	}

	async run(): Promise<T> {
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
