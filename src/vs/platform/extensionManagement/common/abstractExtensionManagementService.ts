/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Barrier, CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { canceled, getErrorMessage } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import {
	DidUninstallExtensionEvent, ExtensionManagementError, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementParticipant, IExtensionManagementService, IGalleryExtension, IGalleryMetadata, ILocalExtension, InstallExtensionEvent, InstallExtensionResult, InstallOperation, InstallOptions,
	InstallVSIXOptions, INSTALL_ERROR_INCOMPATIBLE, INSTALL_ERROR_MALICIOUS, IReportedExtension, StatisticType, CURRENT_TARGET_PLATFORM, UninstallOptions
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, ExtensionIdentifierWithVersion, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, getMaliciousExtensionsSet } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const INSTALL_ERROR_VALIDATING = 'validating';
export const ERROR_UNKNOWN = 'unknown';
export const INSTALL_ERROR_LOCAL = 'local';

export interface IInstallExtensionTask {
	readonly identifier: IExtensionIdentifier;
	readonly source: IGalleryExtension | URI;
	readonly operation: InstallOperation;
	run(): Promise<ILocalExtension>;
	waitUntilTaskIsFinished(): Promise<ILocalExtension>;
	cancel(): void;
}

export type UninstallExtensionTaskOptions = { readonly remove?: boolean; readonly versionOnly?: boolean };

export interface IUninstallExtensionTask {
	readonly extension: ILocalExtension;
	run(): Promise<void>;
	waitUntilTaskIsFinished(): Promise<void>;
	cancel(): void;
}

export abstract class AbstractExtensionManagementService extends Disposable implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private reportedExtensions: Promise<IReportedExtension[]> | undefined;
	private lastReportTimestamp = 0;
	private readonly installingExtensions = new Map<string, IInstallExtensionTask>();
	private readonly uninstallingExtensions = new Map<string, IUninstallExtensionTask>();

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionEvent>());
	readonly onInstallExtension: Event<InstallExtensionEvent> = this._onInstallExtension.event;

	protected readonly _onDidInstallExtensions = this._register(new Emitter<InstallExtensionResult[]>());
	readonly onDidInstallExtensions = this._onDidInstallExtensions.event;

	protected readonly _onUninstallExtension = this._register(new Emitter<IExtensionIdentifier>());
	readonly onUninstallExtension: Event<IExtensionIdentifier> = this._onUninstallExtension.event;

	protected _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = this._onDidUninstallExtension.event;

	private readonly participants: IExtensionManagementParticipant[] = [];

	constructor(
		@IExtensionGalleryService protected readonly galleryService: IExtensionGalleryService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@ILogService protected readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			this.installingExtensions.forEach(task => task.cancel());
			this.uninstallingExtensions.forEach(promise => promise.cancel());
			this.installingExtensions.clear();
			this.uninstallingExtensions.clear();
		}));
	}

	async installFromGallery(extension: IGalleryExtension, options: InstallOptions = {}): Promise<ILocalExtension> {
		if (!this.galleryService.isEnabled()) {
			throw new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"));
		}

		try {
			extension = await this.checkAndGetCompatibleVersion(extension, !options.installGivenVersion);
		} catch (error) {
			this.logService.error(getErrorMessage(error));
			reportTelemetry(this.telemetryService, 'extensionGallery:install', getGalleryExtensionTelemetryData(extension), undefined, error);
			throw error;
		}

		if (!await this.canInstall(extension)) {
			const error = new ExtensionManagementError(`Not supported`, INSTALL_ERROR_VALIDATING);
			this.logService.error(`Cannot install extension as it is not supported.`, extension.identifier.id, error.message);
			reportTelemetry(this.telemetryService, 'extensionGallery:install', getGalleryExtensionTelemetryData(extension), undefined, error);
			throw error;
		}

		const manifest = await this.galleryService.getManifest(extension, CancellationToken.None);
		if (manifest === null) {
			const error = new ExtensionManagementError(`Missing manifest for extension ${extension.identifier.id}`, INSTALL_ERROR_VALIDATING);
			this.logService.error(`Failed to install extension:`, extension.identifier.id, error.message);
			reportTelemetry(this.telemetryService, 'extensionGallery:install', getGalleryExtensionTelemetryData(extension), undefined, error);
			throw error;
		}

		if (manifest.version !== extension.version) {
			const error = new ExtensionManagementError(`Cannot install '${extension.identifier.id}' extension because of version mismatch in Marketplace`, INSTALL_ERROR_VALIDATING);
			this.logService.error(error.message);
			reportTelemetry(this.telemetryService, 'extensionGallery:install', getGalleryExtensionTelemetryData(extension), undefined, error);
			throw error;
		}

		return this.installExtension(manifest, extension, options);
	}

	async uninstall(extension: ILocalExtension, options: UninstallOptions = {}): Promise<void> {
		this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
		return this.unininstallExtension(extension, options);
	}

	async reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		this.logService.trace('ExtensionManagementService#reinstallFromGallery', extension.identifier.id);
		if (!this.galleryService.isEnabled()) {
			throw new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"));
		}

		const galleryExtension = await this.findGalleryExtension(extension);
		if (!galleryExtension) {
			throw new Error(nls.localize('Not a Marketplace extension', "Only Marketplace Extensions can be reinstalled"));
		}

		await this.createUninstallExtensionTask(extension, { remove: true, versionOnly: true }).run();
		await this.installFromGallery(galleryExtension);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		const now = new Date().getTime();

		if (!this.reportedExtensions || now - this.lastReportTimestamp > 1000 * 60 * 5) { // 5 minute cache freshness
			this.reportedExtensions = this.updateReportCache();
			this.lastReportTimestamp = now;
		}

		return this.reportedExtensions;
	}

	registerParticipant(participant: IExtensionManagementParticipant): void {
		this.participants.push(participant);
	}

	protected async installExtension(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions & InstallVSIXOptions): Promise<ILocalExtension> {
		// only cache gallery extensions tasks
		if (!URI.isUri(extension)) {
			let installExtensionTask = this.installingExtensions.get(new ExtensionIdentifierWithVersion(extension.identifier, extension.version).key());
			if (installExtensionTask) {
				this.logService.info('Extensions is already requested to install', extension.identifier.id);
				return installExtensionTask.waitUntilTaskIsFinished();
			}
			options = { ...options, installOnlyNewlyAddedFromExtensionPack: true /* always true for gallery extensions */ };
		}

		const allInstallExtensionTasks: { task: IInstallExtensionTask, manifest: IExtensionManifest }[] = [];
		const installResults: (InstallExtensionResult & { local: ILocalExtension })[] = [];
		const installExtensionTask = this.createInstallExtensionTask(manifest, extension, options);
		if (!URI.isUri(extension)) {
			this.installingExtensions.set(new ExtensionIdentifierWithVersion(installExtensionTask.identifier, manifest.version).key(), installExtensionTask);
		}
		this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension });
		this.logService.info('Installing extension:', installExtensionTask.identifier.id);
		allInstallExtensionTasks.push({ task: installExtensionTask, manifest });
		let installExtensionHasDependents: boolean = false;

		try {
			if (options.donotIncludePackAndDependencies) {
				this.logService.info('Installing the extension without checking dependencies and pack', installExtensionTask.identifier.id);
			} else {
				try {
					const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensionsToInstall(installExtensionTask.identifier, manifest, !!options.installOnlyNewlyAddedFromExtensionPack);
					for (const { gallery, manifest } of allDepsAndPackExtensionsToInstall) {
						installExtensionHasDependents = installExtensionHasDependents || !!manifest.extensionDependencies?.some(id => areSameExtensions({ id }, installExtensionTask.identifier));
						if (this.installingExtensions.has(new ExtensionIdentifierWithVersion(gallery.identifier, gallery.version).key())) {
							this.logService.info('Extension is already requested to install', gallery.identifier.id);
						} else {
							const task = this.createInstallExtensionTask(manifest, gallery, { ...options, donotIncludePackAndDependencies: true });
							this.installingExtensions.set(new ExtensionIdentifierWithVersion(task.identifier, manifest.version).key(), task);
							this._onInstallExtension.fire({ identifier: task.identifier, source: gallery });
							this.logService.info('Installing extension:', task.identifier.id);
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
						this.logService.error(error);
						throw error;
					}
				}
			}

			const extensionsToInstallMap = allInstallExtensionTasks.reduce((result, { task, manifest }) => {
				result.set(task.identifier.id.toLowerCase(), { task, manifest });
				return result;
			}, new Map<string, { task: IInstallExtensionTask, manifest: IExtensionManifest }>());

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
						await this.joinAllSettled(this.participants.map(participant => participant.postInstall(local, task.source, options, CancellationToken.None)));
						if (!URI.isUri(task.source)) {
							reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install', getGalleryExtensionTelemetryData(task.source), new Date().getTime() - startTime, undefined);
							// In web, report extension install statistics explicitly. In Desktop, statistics are automatically updated while downloading the VSIX.
							if (isWeb && task.operation === InstallOperation.Install) {
								try {
									await this.galleryService.reportStatistic(local.manifest.publisher, local.manifest.name, local.manifest.version, StatisticType.Install);
								} catch (error) { /* ignore */ }
							}
						}
						installResults.push({ local, identifier: task.identifier, operation: task.operation, source: task.source });
					} catch (error) {
						if (!URI.isUri(task.source)) {
							reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install', getGalleryExtensionTelemetryData(task.source), new Date().getTime() - startTime, error);
						}
						this.logService.error('Error while installing the extension:', task.identifier.id);
						this.logService.error(error);
						throw error;
					} finally { extensionsToInstallMap.delete(task.identifier.id.toLowerCase()); }
				}));
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
					const result = await Promise.allSettled(installResults.map(({ local }) => this.createUninstallExtensionTask(local, { versionOnly: true }).run()));
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

			this.logService.error(`Failed to install extension:`, installExtensionTask.identifier.id, getErrorMessage(error));
			this._onDidInstallExtensions.fire(allInstallExtensionTasks.map(({ task }) => ({ identifier: task.identifier, operation: InstallOperation.Install, source: task.source })));

			if (error instanceof Error) {
				error.name = error && (<ExtensionManagementError>error).code ? (<ExtensionManagementError>error).code : ERROR_UNKNOWN;
			}
			throw error;
		} finally {
			/* Remove the gallery tasks from the cache */
			for (const { task, manifest } of allInstallExtensionTasks) {
				if (!URI.isUri(task.source)) {
					const key = new ExtensionIdentifierWithVersion(task.identifier, manifest.version).key();
					if (!this.installingExtensions.delete(key)) {
						this.logService.warn('Installation task is not found in the cache', key);
					}
				}
			}
		}
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

	private async getAllDepsAndPackExtensionsToInstall(extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest, getOnlyNewlyAddedFromExtensionPack: boolean): Promise<{ gallery: IGalleryExtension, manifest: IExtensionManifest }[]> {
		if (!this.galleryService.isEnabled()) {
			return [];
		}

		let installed = await this.getInstalled();
		const knownIdentifiers = [extensionIdentifier, ...(installed).map(i => i.identifier)];

		const allDependenciesAndPacks: { gallery: IGalleryExtension, manifest: IExtensionManifest }[] = [];
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
				// filter out installed and known extensions
				const identifiers = [...knownIdentifiers, ...allDependenciesAndPacks.map(r => r.gallery.identifier)];
				const names = dependenciesAndPackExtensions.filter(id => identifiers.every(galleryIdentifier => !areSameExtensions(galleryIdentifier, { id })));
				if (names.length) {
					const galleryResult = await this.galleryService.query({ names, pageSize: dependenciesAndPackExtensions.length }, CancellationToken.None);
					for (const galleryExtension of galleryResult.firstPage) {
						if (identifiers.find(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
							continue;
						}
						const isDependency = dependecies.some(id => areSameExtensions({ id }, galleryExtension.identifier));
						if (!isDependency && !await this.canInstall(galleryExtension)) {
							this.logService.info('Skipping the packed extension as it cannot be installed', galleryExtension.identifier.id);
							continue;
						}
						const compatibleExtension = await this.checkAndGetCompatibleVersion(galleryExtension, true);
						const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
						if (manifest === null) {
							throw new ExtensionManagementError(`Missing manifest for extension ${compatibleExtension.identifier.id}`, INSTALL_ERROR_VALIDATING);
						}
						allDependenciesAndPacks.push({ gallery: compatibleExtension, manifest });
						await collectDependenciesAndPackExtensionsToInstall(compatibleExtension.identifier, manifest);
					}
				}
			}
		};

		await collectDependenciesAndPackExtensionsToInstall(extensionIdentifier, manifest);
		installed = await this.getInstalled();
		return allDependenciesAndPacks.filter(e => !installed.some(i => areSameExtensions(i.identifier, e.gallery.identifier)));
	}

	private async checkAndGetCompatibleVersion(extension: IGalleryExtension, fetchCompatibleVersion: boolean): Promise<IGalleryExtension> {
		if (await this.isMalicious(extension)) {
			throw new ExtensionManagementError(nls.localize('malicious extension', "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), INSTALL_ERROR_MALICIOUS);
		}

		let compatibleExtension: IGalleryExtension | null = null;
		if (await this.galleryService.isExtensionCompatible(extension, CURRENT_TARGET_PLATFORM)) {
			compatibleExtension = extension;
		}

		if (!compatibleExtension && fetchCompatibleVersion) {
			compatibleExtension = await this.galleryService.getCompatibleExtension(extension, CURRENT_TARGET_PLATFORM);
		}

		if (!compatibleExtension) {
			throw new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Can't install '{0}' extension because it is not compatible with the current version of VS Code (version {1}).", extension.identifier.id, product.version), INSTALL_ERROR_INCOMPATIBLE);
		}

		return compatibleExtension;
	}

	private async isMalicious(extension: IGalleryExtension): Promise<boolean> {
		const report = await this.getExtensionsReport();
		return getMaliciousExtensionsSet(report).has(extension.identifier.id);
	}

	private async unininstallExtension(extension: ILocalExtension, options: UninstallOptions): Promise<void> {
		const uninstallExtensionTask = this.uninstallingExtensions.get(extension.identifier.id.toLowerCase());
		if (uninstallExtensionTask) {
			this.logService.info('Extensions is already requested to uninstall', extension.identifier.id);
			return uninstallExtensionTask.waitUntilTaskIsFinished();
		}

		const createUninstallExtensionTask = (extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask => {
			const uninstallExtensionTask = this.createUninstallExtensionTask(extension, options);
			this.uninstallingExtensions.set(uninstallExtensionTask.extension.identifier.id.toLowerCase(), uninstallExtensionTask);
			this.logService.info('Uninstalling extension:', extension.identifier.id);
			this._onUninstallExtension.fire(extension.identifier);
			return uninstallExtensionTask;
		};

		const postUninstallExtension = (extension: ILocalExtension, error?: ExtensionManagementError): void => {
			if (error) {
				this.logService.error('Failed to uninstall extension:', extension.identifier.id, error.message);
			} else {
				this.logService.info('Successfully uninstalled extension:', extension.identifier.id);
			}
			reportTelemetry(this.telemetryService, 'extensionGallery:uninstall', getLocalExtensionTelemetryData(extension), undefined, error);
			this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: error?.code });
		};

		const allTasks: IUninstallExtensionTask[] = [];
		const processedTasks: IUninstallExtensionTask[] = [];

		try {
			allTasks.push(createUninstallExtensionTask(extension, {}));
			const installed = await this.getInstalled(ExtensionType.User);

			if (options.donotIncludePack) {
				this.logService.info('Uninstalling the extension without including packed extension', extension.identifier.id);
			} else {
				const packedExtensions = this.getAllPackExtensionsToUninstall(extension, installed);
				for (const packedExtension of packedExtensions) {
					if (this.uninstallingExtensions.has(packedExtension.identifier.id.toLowerCase())) {
						this.logService.info('Extensions is already requested to uninstall', packedExtension.identifier.id);
					} else {
						allTasks.push(createUninstallExtensionTask(packedExtension, {}));
					}
				}
			}

			if (options.donotCheckDependents) {
				this.logService.info('Uninstalling the extension without checking dependents', extension.identifier.id);
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
					const error = e instanceof ExtensionManagementError ? e : new ExtensionManagementError(getErrorMessage(e), ERROR_UNKNOWN);
					postUninstallExtension(task.extension, error);
					throw error;
				} finally {
					processedTasks.push(task);
				}
			}));

		} catch (e) {
			const error = e instanceof ExtensionManagementError ? e : new ExtensionManagementError(getErrorMessage(e), ERROR_UNKNOWN);
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
				if (!this.uninstallingExtensions.delete(task.extension.identifier.id.toLowerCase())) {
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

	private async findGalleryExtension(local: ILocalExtension): Promise<IGalleryExtension> {
		if (local.identifier.uuid) {
			const galleryExtension = await this.findGalleryExtensionById(local.identifier.uuid);
			return galleryExtension ? galleryExtension : this.findGalleryExtensionByName(local.identifier.id);
		}
		return this.findGalleryExtensionByName(local.identifier.id);
	}

	private async findGalleryExtensionById(uuid: string): Promise<IGalleryExtension> {
		const galleryResult = await this.galleryService.query({ ids: [uuid], pageSize: 1 }, CancellationToken.None);
		return galleryResult.firstPage[0];
	}

	private async findGalleryExtensionByName(name: string): Promise<IGalleryExtension> {
		const galleryResult = await this.galleryService.query({ names: [name], pageSize: 1 }, CancellationToken.None);
		return galleryResult.firstPage[0];
	}

	private async updateReportCache(): Promise<IReportedExtension[]> {
		try {
			this.logService.trace('ExtensionManagementService.refreshReportedCache');
			const result = await this.galleryService.getExtensionsReport();
			this.logService.trace(`ExtensionManagementService.refreshReportedCache - got ${result.length} reported extensions from service`);
			return result;
		} catch (err) {
			this.logService.trace('ExtensionManagementService.refreshReportedCache - failed to get extension report');
			return [];
		}
	}

	abstract zip(extension: ILocalExtension): Promise<URI>;
	abstract unzip(zipLocation: URI): Promise<IExtensionIdentifier>;
	abstract getManifest(vsix: URI): Promise<IExtensionManifest>;
	abstract install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension>;
	abstract canInstall(extension: IGalleryExtension): Promise<boolean>;
	abstract getInstalled(type?: ExtensionType): Promise<ILocalExtension[]>;

	abstract updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension>;
	abstract updateExtensionScope(local: ILocalExtension, isMachineScoped: boolean): Promise<ILocalExtension>;

	protected abstract createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions & InstallVSIXOptions): IInstallExtensionTask;
	protected abstract createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask;
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

export function reportTelemetry(telemetryService: ITelemetryService, eventName: string, extensionData: any, duration?: number, error?: Error): void {
	const errorcode = error ? error instanceof ExtensionManagementError ? error.code : ERROR_UNKNOWN : undefined;
	/* __GDPR__
		"extensionGallery:install" : {
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"recommendationReason": { "retiredFromVersion": "1.23.0", "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	/* __GDPR__
		"extensionGallery:uninstall" : {
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
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	telemetryService.publicLogError(eventName, { ...extensionData, success: !error, duration, errorcode });
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
						e(canceled());
					});
				});
			});
			this.barrier.open();
		}
		this.cancellablePromise.cancel();
	}

	protected abstract doRun(token: CancellationToken): Promise<T>;
}
