/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Barrier, CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError, getErrorMessage } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import {
	ExtensionManagementError, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementParticipant, IGalleryExtension, IGalleryMetadata, ILocalExtension, InstallOperation,
	IExtensionsControlManifest, StatisticType, isTargetPlatformCompatible, TargetPlatformToString, ExtensionManagementErrorCode,
	InstallOptions, InstallVSIXOptions, UninstallOptions, Metadata, InstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent, IExtensionManagementService
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, ExtensionKey, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, IExtensionManifest, isApplicationScopedExtension, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export interface IInstallExtensionTask {
	readonly identifier: IExtensionIdentifier;
	readonly source: IGalleryExtension | URI;
	readonly operation: InstallOperation;
	readonly wasVerified?: boolean;
	run(): Promise<{ local: ILocalExtension; metadata: Metadata }>;
	waitUntilTaskIsFinished(): Promise<{ local: ILocalExtension; metadata: Metadata }>;
	cancel(): void;
}

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

	private readonly participants: IExtensionManagementParticipant[] = [];

	constructor(
		@IExtensionGalleryService protected readonly galleryService: IExtensionGalleryService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
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
			if (!this.galleryService.isEnabled()) {
				throw new ExtensionManagementError(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"), ExtensionManagementErrorCode.Internal);
			}
			const compatible = await this.checkAndGetCompatibleVersion(extension, !!options.installGivenVersion, !!options.installPreReleaseVersion);
			return await this.installExtension(compatible.manifest, compatible.extension, options);
		} catch (error) {
			reportTelemetry(this.telemetryService, 'extensionGallery:install', { extensionData: getGalleryExtensionTelemetryData(extension), error });
			this.logService.error(`Failed to install extension.`, extension.identifier.id);
			this.logService.error(error);
			throw toExtensionManagementError(error);
		}
	}

	async uninstall(extension: ILocalExtension, options: UninstallOptions = {}): Promise<void> {
		this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
		return this.uninstallExtension(extension, options);
	}

	async reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		this.logService.trace('ExtensionManagementService#reinstallFromGallery', extension.identifier.id);
		if (!this.galleryService.isEnabled()) {
			throw new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"));
		}

		const targetPlatform = await this.getTargetPlatform();
		const [galleryExtension] = await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: extension.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None);
		if (!galleryExtension) {
			throw new Error(nls.localize('Not a Marketplace extension', "Only Marketplace Extensions can be reinstalled"));
		}

		await this.createUninstallExtensionTask(extension, { remove: true, versionOnly: true }).run();
		await this.installFromGallery(galleryExtension);
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

	protected async installExtension(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions & InstallVSIXOptions): Promise<ILocalExtension> {

		const getInstallExtensionTaskKey = (extension: IGalleryExtension) => `${ExtensionKey.create(extension).toString()}${options.profileLocation ? `-${options.profileLocation.toString()}` : ''}`;

		// only cache gallery extensions tasks
		if (!URI.isUri(extension)) {
			const installingExtension = this.installingExtensions.get(getInstallExtensionTaskKey(extension));
			if (installingExtension) {
				this.logService.info('Extensions is already requested to install', extension.identifier.id);
				const { local } = await installingExtension.task.waitUntilTaskIsFinished();
				return local;
			}
			options = { ...options, installOnlyNewlyAddedFromExtensionPack: true /* always true for gallery extensions */ };
		}

		const allInstallExtensionTasks: { task: IInstallExtensionTask; manifest: IExtensionManifest }[] = [];
		const alreadyRequestedInstallations: Promise<void>[] = [];
		const installResults: (InstallExtensionResult & { local: ILocalExtension })[] = [];
		const installExtensionTask = this.createInstallExtensionTask(manifest, extension, options);
		if (!URI.isUri(extension)) {
			this.installingExtensions.set(getInstallExtensionTaskKey(extension), { task: installExtensionTask, waitingTasks: [] });
		}
		this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension, profileLocation: options.profileLocation });
		this.logService.info('Installing extension:', installExtensionTask.identifier.id);
		allInstallExtensionTasks.push({ task: installExtensionTask, manifest });
		let installExtensionHasDependents: boolean = false;

		try {
			if (options.donotIncludePackAndDependencies) {
				this.logService.info('Installing the extension without checking dependencies and pack', installExtensionTask.identifier.id);
			} else {
				try {
					const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensions(installExtensionTask.identifier, manifest, !!options.installOnlyNewlyAddedFromExtensionPack, !!options.installPreReleaseVersion, options.profileLocation);
					const installed = await this.getInstalled(undefined, options.profileLocation);
					for (const { gallery, manifest } of allDepsAndPackExtensionsToInstall) {
						installExtensionHasDependents = installExtensionHasDependents || !!manifest.extensionDependencies?.some(id => areSameExtensions({ id }, installExtensionTask.identifier));
						const key = getInstallExtensionTaskKey(gallery);
						const existingInstallingExtension = this.installingExtensions.get(key);
						if (existingInstallingExtension) {
							if (this.canWaitForTask(installExtensionTask, existingInstallingExtension.task)) {
								this.logService.info('Waiting for already requested installing extension', gallery.identifier.id, installExtensionTask.identifier.id);
								existingInstallingExtension.waitingTasks.push(installExtensionTask);
								const identifier = existingInstallingExtension.task.identifier;
								// add promise that waits until the extension is completely installed, ie., onDidInstallExtensions event is triggered for this extension
								alreadyRequestedInstallations.push(
									Event.toPromise(
										Event.filter(this.onDidInstallExtensions, results => results.some(result => areSameExtensions(result.identifier, identifier)))
									).then(results => {
										const result = results.find(result => areSameExtensions(result.identifier, identifier));
										if (!result?.local) {
											// Extension failed to install
											throw new Error(`Extension ${identifier.id} is not installed`);
										}
									}));
							}
						} else if (!installed.some(({ identifier }) => areSameExtensions(identifier, gallery.identifier))) {
							const task = this.createInstallExtensionTask(manifest, gallery, { ...options, donotIncludePackAndDependencies: true });
							this.installingExtensions.set(key, { task, waitingTasks: [installExtensionTask] });
							this._onInstallExtension.fire({ identifier: task.identifier, source: gallery, profileLocation: options.profileLocation });
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
						const { local } = await task.run();
						await this.joinAllSettled(this.participants.map(participant => participant.postInstall(local, task.source, options, CancellationToken.None)));
						if (!URI.isUri(task.source)) {
							const isUpdate = task.operation === InstallOperation.Update;
							const durationSinceUpdate = isUpdate ? undefined : (new Date().getTime() - task.source.lastUpdated) / 1000;
							reportTelemetry(this.telemetryService, isUpdate ? 'extensionGallery:update' : 'extensionGallery:install', {
								extensionData: getGalleryExtensionTelemetryData(task.source),
								wasVerified: task.wasVerified,
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
						installResults.push({ local, identifier: task.identifier, operation: task.operation, source: task.source, context: options.context, profileLocation: options.profileLocation, applicationScoped: local.isApplicationScoped });
					} catch (error) {
						if (!URI.isUri(task.source)) {
							reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install', {
								extensionData: getGalleryExtensionTelemetryData(task.source),
								wasVerified: task.wasVerified,
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
			this._onDidInstallExtensions.fire(installResults);
			return installResults.filter(({ identifier }) => areSameExtensions(identifier, installExtensionTask.identifier))[0].local;

		} catch (error) {

			// cancel all tasks
			allInstallExtensionTasks.forEach(({ task }) => task.cancel());

			// rollback installed extensions
			if (installResults.length) {
				try {
					const result = await Promise.allSettled(installResults.map(({ local }) => this.createUninstallExtensionTask(local, { versionOnly: true, profileLocation: options.profileLocation }).run()));
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

			this._onDidInstallExtensions.fire(allInstallExtensionTasks.map(({ task }) => ({ identifier: task.identifier, operation: InstallOperation.Install, source: task.source, context: options.context, profileLocation: options.profileLocation })));
			throw error;
		} finally {
			for (const [key, { task, waitingTasks }] of this.installingExtensions.entries()) {
				const index = waitingTasks.indexOf(installExtensionTask);
				if (index !== -1) {
					/* Current task was waiting for this task */
					waitingTasks.splice(index, 1);
				}
				if (waitingTasks.length === 0 // No tasks are waiting for this task
					&& (task === installExtensionTask || index !== -1)) {
					this.installingExtensions.delete(key);
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
		const knownIdentifiers = [extensionIdentifier];

		const allDependenciesAndPacks: { gallery: IGalleryExtension; manifest: IExtensionManifest }[] = [];
		const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest): Promise<void> => {
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
				const identifiers = [...knownIdentifiers, ...allDependenciesAndPacks.map(r => r.gallery.identifier)];
				const ids = dependenciesAndPackExtensions.filter(id => identifiers.every(galleryIdentifier => !areSameExtensions(galleryIdentifier, { id })));
				if (ids.length) {
					const galleryExtensions = await this.galleryService.getExtensions(ids.map(id => ({ id, preRelease: installPreRelease })), CancellationToken.None);
					for (const galleryExtension of galleryExtensions) {
						if (identifiers.find(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
							continue;
						}
						const isDependency = dependecies.some(id => areSameExtensions({ id }, galleryExtension.identifier));
						let compatible;
						try {
							compatible = await this.checkAndGetCompatibleVersion(galleryExtension, false, installPreRelease);
						} catch (error) {
							if (error instanceof ExtensionManagementError && error.code === ExtensionManagementErrorCode.IncompatibleTargetPlatform && !isDependency) {
								this.logService.info('Skipping the packed extension as it cannot be installed', galleryExtension.identifier.id);
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
		const extensionsControlManifest = await this.getExtensionsControlManifest();
		if (extensionsControlManifest.malicious.some(identifier => areSameExtensions(extension.identifier, identifier))) {
			throw new ExtensionManagementError(nls.localize('malicious extension', "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), ExtensionManagementErrorCode.Malicious);
		}

		if (!await this.canInstall(extension)) {
			const targetPlatform = await this.getTargetPlatform();
			throw new ExtensionManagementError(nls.localize('incompatible platform', "The '{0}' extension is not available in {1} for {2}.", extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform)), ExtensionManagementErrorCode.IncompatibleTargetPlatform);
		}

		const compatibleExtension = await this.getCompatibleVersion(extension, sameVersion, installPreRelease);
		if (compatibleExtension) {
			if (installPreRelease && !sameVersion && extension.hasPreReleaseVersion && !compatibleExtension.properties.isPreReleaseVersion) {
				throw new ExtensionManagementError(nls.localize('notFoundCompatiblePrereleaseDependency', "Can't install pre-release version of '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), ExtensionManagementErrorCode.IncompatiblePreRelease);
			}
		} else {
			/** If no compatible release version is found, check if the extension has a release version or not and throw relevant error */
			if (!installPreRelease && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
				throw new ExtensionManagementError(nls.localize('notFoundReleaseExtension', "Can't install release version of '{0}' extension because it has no release version.", extension.identifier.id), ExtensionManagementErrorCode.ReleaseVersionNotFound);
			}
			throw new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), ExtensionManagementErrorCode.Incompatible);
		}

		this.logService.info('Getting Manifest...', compatibleExtension.identifier.id);
		const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
		if (manifest === null) {
			throw new ExtensionManagementError(`Missing manifest for extension ${extension.identifier.id}`, ExtensionManagementErrorCode.Invalid);
		}

		if (manifest.version !== compatibleExtension.version) {
			throw new ExtensionManagementError(`Cannot install '${extension.identifier.id}' extension because of version mismatch in Marketplace`, ExtensionManagementErrorCode.Invalid);
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
		const getUninstallExtensionTaskKey = (identifier: IExtensionIdentifier) => `${identifier.id.toLowerCase()}${options.versionOnly ? `-${extension.manifest.version}` : ''}${options.profileLocation ? `@${options.profileLocation.toString()}` : ''}`;
		const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(extension.identifier));
		if (uninstallExtensionTask) {
			this.logService.info('Extensions is already requested to uninstall', extension.identifier.id);
			return uninstallExtensionTask.waitUntilTaskIsFinished();
		}

		const createUninstallExtensionTask = (extension: ILocalExtension, uninstallOptions: UninstallOptions): IUninstallExtensionTask => {
			const uninstallExtensionTask = this.createUninstallExtensionTask(extension, uninstallOptions);
			this.uninstallingExtensions.set(getUninstallExtensionTaskKey(uninstallExtensionTask.extension.identifier), uninstallExtensionTask);
			if (options.profileLocation) {
				this.logService.info('Uninstalling extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, options.profileLocation.toString());
			} else {
				this.logService.info('Uninstalling extension:', `${extension.identifier.id}@${extension.manifest.version}`);
			}
			this._onUninstallExtension.fire({ identifier: extension.identifier, profileLocation: options.profileLocation, applicationScoped: extension.isApplicationScoped });
			return uninstallExtensionTask;
		};

		const postUninstallExtension = (extension: ILocalExtension, error?: ExtensionManagementError): void => {
			if (error) {
				if (options.profileLocation) {
					this.logService.error('Failed to uninstall extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, options.profileLocation.toString(), error.message);
				} else {
					this.logService.error('Failed to uninstall extension:', `${extension.identifier.id}@${extension.manifest.version}`, error.message);
				}
			} else {
				if (options.profileLocation) {
					this.logService.info('Successfully uninstalled extension from the profile', `${extension.identifier.id}@${extension.manifest.version}`, options.profileLocation.toString());
				} else {
					this.logService.info('Successfully uninstalled extension:', `${extension.identifier.id}@${extension.manifest.version}`);
				}
			}
			reportTelemetry(this.telemetryService, 'extensionGallery:uninstall', { extensionData: getLocalExtensionTelemetryData(extension), error });
			this._onDidUninstallExtension.fire({ identifier: extension.identifier, version: extension.manifest.version, error: error?.code, profileLocation: options.profileLocation, applicationScoped: extension.isApplicationScoped });
		};

		const allTasks: IUninstallExtensionTask[] = [];
		const processedTasks: IUninstallExtensionTask[] = [];

		try {
			allTasks.push(createUninstallExtensionTask(extension, options));
			const installed = await this.getInstalled(ExtensionType.User, options.profileLocation);
			if (options.donotIncludePack) {
				this.logService.info('Uninstalling the extension without including packed extension', `${extension.identifier.id}@${extension.manifest.version}`);
			} else {
				const packedExtensions = this.getAllPackExtensionsToUninstall(extension, installed);
				for (const packedExtension of packedExtensions) {
					if (this.uninstallingExtensions.has(getUninstallExtensionTaskKey(packedExtension.identifier))) {
						this.logService.info('Extensions is already requested to uninstall', packedExtension.identifier.id);
					} else {
						allTasks.push(createUninstallExtensionTask(packedExtension, options));
					}
				}
			}

			if (options.donotCheckDependents) {
				this.logService.info('Uninstalling the extension without checking dependents', `${extension.identifier.id}@${extension.manifest.version}`);
			} else {
				this.checkForDependents(allTasks.map(task => task.extension), installed, extension);
			}

			// Uninstall extensions in parallel and wait until all extensions are uninstalled / failed
			await this.joinAllSettled(allTasks.map(async task => {
				try {
					await task.run();
					await this.joinAllSettled(this.participants.map(participant => participant.postUninstall(task.extension, options, CancellationToken.None)));
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
			return { malicious: [], deprecated: {} };
		}
	}

	private createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions & InstallVSIXOptions): IInstallExtensionTask {
		if (options.profileLocation && isApplicationScopedExtension(manifest)) {
			options = { ...options, profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource };
		}
		return this.doCreateInstallExtensionTask(manifest, extension, options);
	}

	private createUninstallExtensionTask(extension: ILocalExtension, options: UninstallOptions): IUninstallExtensionTask {
		if (options.profileLocation && extension.isApplicationScoped) {
			options = { ...options, profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource };
		}
		return this.doCreateUninstallExtensionTask(extension, options);
	}

	abstract getTargetPlatform(): Promise<TargetPlatform>;
	abstract zip(extension: ILocalExtension): Promise<URI>;
	abstract unzip(zipLocation: URI): Promise<IExtensionIdentifier>;
	abstract getManifest(vsix: URI): Promise<IExtensionManifest>;
	abstract install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension>;
	abstract getInstalled(type?: ExtensionType, profileLocation?: URI): Promise<ILocalExtension[]>;
	abstract download(extension: IGalleryExtension, operation: InstallOperation): Promise<URI>;

	abstract getMetadata(extension: ILocalExtension): Promise<Metadata | undefined>;
	abstract updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension>;
	abstract updateExtensionScope(local: ILocalExtension, isMachineScoped: boolean): Promise<ILocalExtension>;

	protected abstract doCreateInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions & InstallVSIXOptions): IInstallExtensionTask;
	protected abstract doCreateUninstallExtensionTask(extension: ILocalExtension, options: UninstallOptions): IUninstallExtensionTask;
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

function toExtensionManagementError(error: Error): ExtensionManagementError {
	if (error instanceof ExtensionManagementError) {
		return error;
	}
	const e = new ExtensionManagementError(error.message, ExtensionManagementErrorCode.Internal);
	e.stack = error.stack;
	return e;
}

export function reportTelemetry(telemetryService: ITelemetryService, eventName: string, { extensionData, wasVerified, duration, error, durationSinceUpdate }: { extensionData: any; wasVerified?: boolean; duration?: number; durationSinceUpdate?: number; error?: Error }): void {
	let errorcode: ExtensionManagementErrorCode | undefined;
	let errorcodeDetail: string | undefined;

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
			"wasVerified" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
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
			"wasVerified" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	telemetryService.publicLog(eventName, { ...extensionData, wasVerified, success: !error, duration, errorcode, errorcodeDetail, durationSinceUpdate });
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
