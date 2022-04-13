/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { Promises, Queue } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { getErrorMessage } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import * as path from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import { extract, ExtractError } from 'vs/base/node/zip';
import { localize } from 'vs/nls';
import { ExtensionManagementError, ExtensionManagementErrorCode, Metadata, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionKey, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionsScannerService, IScannedExtension, ScanOptions } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';

export class ExtensionsScanner extends Disposable {

	private readonly uninstalledPath: string;
	private readonly uninstalledFileLimiter: Queue<any>;

	constructor(
		private readonly beforeRemovingExtension: (e: ILocalExtension) => Promise<void>,
		@IFileService private readonly fileService: IFileService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.uninstalledPath = joinPath(this.extensionsScannerService.userExtensionsLocation, '.obsolete').fsPath;
		this.uninstalledFileLimiter = new Queue();
	}

	async cleanUp(): Promise<void> {
		await this.removeUninstalledExtensions();
		await this.removeOutdatedExtensions();
	}

	async scanExtensions(type: ExtensionType | null): Promise<ILocalExtension[]> {
		const scannedOptions: ScanOptions = { includeInvalid: true };
		let scannedExtensions: IScannedExtension[] = [];
		if (type === null || type === ExtensionType.System) {
			scannedExtensions.push(...await this.extensionsScannerService.scanAllExtensions(scannedOptions));
		} else if (type === ExtensionType.User) {
			scannedExtensions.push(...await this.extensionsScannerService.scanUserExtensions(scannedOptions));
		}
		scannedExtensions = type !== null ? scannedExtensions.filter(r => r.type === type) : scannedExtensions;
		return Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
	}

	async scanUserExtensions(excludeOutdated: boolean): Promise<ILocalExtension[]> {
		const scannedExtensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: !excludeOutdated, includeInvalid: true });
		return Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
	}

	async extractUserExtension(extensionKey: ExtensionKey, zipPath: string, metadata: Metadata | undefined, token: CancellationToken): Promise<ILocalExtension> {
		const folderName = extensionKey.toString();
		const tempPath = path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, `.${generateUuid()}`);
		const extensionPath = path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, folderName);

		try {
			await pfs.Promises.rm(extensionPath);
		} catch (error) {
			throw new ExtensionManagementError(localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionPath, extensionKey.id), ExtensionManagementErrorCode.Delete);
		}

		await this.extractAtLocation(extensionKey, zipPath, tempPath, token);
		await this.extensionsScannerService.updateMetadata(URI.file(tempPath), { ...metadata, installedTimestamp: Date.now() });

		try {
			await this.rename(extensionKey, tempPath, extensionPath, Date.now() + (2 * 60 * 1000) /* Retry for 2 minutes */);
			this.logService.info('Renamed to', extensionPath);
		} catch (error) {
			try {
				await pfs.Promises.rm(tempPath);
			} catch (e) { /* ignore */ }
			if (error.code === 'ENOTEMPTY') {
				this.logService.info(`Rename failed because extension was installed by another source. So ignoring renaming.`, extensionKey.id);
			} else {
				this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted from extracted location`, tempPath);
				throw error;
			}
		}

		return this.scanLocalExtension(URI.file(extensionPath), ExtensionType.User);
	}

	async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>): Promise<ILocalExtension> {
		await this.extensionsScannerService.updateMetadata(local.location, metadata);
		return this.scanLocalExtension(local.location, local.type);
	}

	getUninstalledExtensions(): Promise<IStringDictionary<boolean>> {
		return this.withUninstalledExtensions();
	}

	async setUninstalled(...extensions: ILocalExtension[]): Promise<void> {
		const extensionKeys: ExtensionKey[] = extensions.map(e => ExtensionKey.create(e));
		await this.withUninstalledExtensions(uninstalled => {
			extensionKeys.forEach(extensionKey => uninstalled[extensionKey.toString()] = true);
		});
	}

	async setInstalled(extensionKey: ExtensionKey): Promise<ILocalExtension | null> {
		await this.withUninstalledExtensions(uninstalled => delete uninstalled[extensionKey.toString()]);
		const userExtensions = await this.scanUserExtensions(true);
		const localExtension = userExtensions.find(i => ExtensionKey.create(i).equals(extensionKey)) || null;
		if (!localExtension) {
			return null;
		}
		return this.updateMetadata(localExtension, { installedTimestamp: Date.now() });
	}

	async removeExtension(extension: ILocalExtension | IScannedExtension, type: string): Promise<void> {
		this.logService.trace(`Deleting ${type} extension from disk`, extension.identifier.id, extension.location.fsPath);
		await pfs.Promises.rm(extension.location.fsPath);
		this.logService.info('Deleted from disk', extension.identifier.id, extension.location.fsPath);
	}

	async removeUninstalledExtension(extension: ILocalExtension | IScannedExtension): Promise<void> {
		await this.removeExtension(extension, 'uninstalled');
		await this.withUninstalledExtensions(uninstalled => delete uninstalled[ExtensionKey.create(extension).toString()]);
	}

	private async withUninstalledExtensions(updateFn?: (uninstalled: IStringDictionary<boolean>) => void): Promise<IStringDictionary<boolean>> {
		return this.uninstalledFileLimiter.queue(async () => {
			let raw: string | undefined;
			try {
				raw = await pfs.Promises.readFile(this.uninstalledPath, 'utf8');
			} catch (err) {
				if (err.code !== 'ENOENT') {
					throw err;
				}
			}

			let uninstalled = {};
			if (raw) {
				try {
					uninstalled = JSON.parse(raw);
				} catch (e) { /* ignore */ }
			}

			if (updateFn) {
				updateFn(uninstalled);
				if (Object.keys(uninstalled).length) {
					await pfs.Promises.writeFile(this.uninstalledPath, JSON.stringify(uninstalled));
				} else {
					await pfs.Promises.rm(this.uninstalledPath);
				}
			}

			return uninstalled;
		});
	}

	private async extractAtLocation(identifier: IExtensionIdentifier, zipPath: string, location: string, token: CancellationToken): Promise<void> {
		this.logService.trace(`Started extracting the extension from ${zipPath} to ${location}`);

		// Clean the location
		try {
			await pfs.Promises.rm(location);
		} catch (e) {
			throw new ExtensionManagementError(this.joinErrors(e).message, ExtensionManagementErrorCode.Delete);
		}

		try {
			await extract(zipPath, location, { sourcePath: 'extension', overwrite: true }, token);
			this.logService.info(`Extracted extension to ${location}:`, identifier.id);
		} catch (e) {
			try { await pfs.Promises.rm(location); } catch (e) { /* Ignore */ }
			let errorCode = ExtensionManagementErrorCode.Extract;
			if (e instanceof ExtractError) {
				if (e.type === 'CorruptZip') {
					errorCode = ExtensionManagementErrorCode.CorruptZip;
				} else if (e.type === 'Incomplete') {
					errorCode = ExtensionManagementErrorCode.IncompleteZip;
				}
			}
			throw new ExtensionManagementError(e.message, errorCode);
		}
	}

	private async rename(identifier: IExtensionIdentifier, extractPath: string, renamePath: string, retryUntil: number): Promise<void> {
		try {
			await pfs.Promises.rename(extractPath, renamePath);
		} catch (error) {
			if (isWindows && error && error.code === 'EPERM' && Date.now() < retryUntil) {
				this.logService.info(`Failed renaming ${extractPath} to ${renamePath} with 'EPERM' error. Trying again...`, identifier.id);
				return this.rename(identifier, extractPath, renamePath, retryUntil);
			}
			throw new ExtensionManagementError(error.message || localize('renameError', "Unknown error while renaming {0} to {1}", extractPath, renamePath), error.code || ExtensionManagementErrorCode.Rename);
		}
	}

	private async scanLocalExtension(location: URI, type: ExtensionType): Promise<ILocalExtension> {
		const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, type, { includeInvalid: true });
		if (scannedExtension) {
			return this.toLocalExtension(scannedExtension);
		}
		throw new Error(localize('cannot read', "Cannot read the extension from {0}", location.path));
	}

	private async toLocalExtension(extension: IScannedExtension): Promise<ILocalExtension> {
		const stat = await this.fileService.resolve(extension.location);
		let readmeUrl: URI | undefined;
		let changelogUrl: URI | undefined;
		if (stat.children) {
			readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
			changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
		}
		return {
			identifier: extension.identifier,
			type: extension.type,
			isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
			location: extension.location,
			manifest: extension.manifest,
			targetPlatform: extension.targetPlatform,
			validations: extension.validations,
			isValid: extension.isValid,
			readmeUrl,
			changelogUrl,
			publisherDisplayName: extension.metadata?.publisherDisplayName || null,
			publisherId: extension.metadata?.publisherId || null,
			isMachineScoped: !!extension.metadata?.isMachineScoped,
			isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
			preRelease: !!extension.metadata?.preRelease,
			installedTimestamp: extension.metadata?.installedTimestamp,
			updated: !!extension.metadata?.updated,
		};
	}
	private async removeUninstalledExtensions(): Promise<void> {
		const uninstalled = await this.getUninstalledExtensions();
		const extensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: true, includeUninstalled: true, includeInvalid: true }); // All user extensions
		const installed: Set<string> = new Set<string>();
		for (const e of extensions) {
			if (!uninstalled[ExtensionKey.create(e).toString()]) {
				installed.add(e.identifier.id.toLowerCase());
			}
		}
		const byExtension = groupByExtension(extensions, e => e.identifier);
		await Promises.settled(byExtension.map(async e => {
			const latest = e.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0];
			if (!installed.has(latest.identifier.id.toLowerCase())) {
				await this.beforeRemovingExtension(await this.toLocalExtension(latest));
			}
		}));
		const toRemove = extensions.filter(e => uninstalled[ExtensionKey.create(e).toString()]);
		await Promises.settled(toRemove.map(e => this.removeUninstalledExtension(e)));
	}

	private async removeOutdatedExtensions(): Promise<void> {
		const extensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: true, includeUninstalled: true, includeInvalid: true }); // All user extensions
		const toRemove: IScannedExtension[] = [];

		// Outdated extensions
		const targetPlatform = await this.extensionsScannerService.getTargetPlatform();
		const byExtension = groupByExtension(extensions, e => e.identifier);
		toRemove.push(...flatten(byExtension.map(p => p.sort((a, b) => {
			const vcompare = semver.rcompare(a.manifest.version, b.manifest.version);
			if (vcompare !== 0) {
				return vcompare;
			}
			if (a.targetPlatform === targetPlatform) {
				return -1;
			}
			return 1;
		}).slice(1))));

		await Promises.settled(toRemove.map(extension => this.removeExtension(extension, 'outdated')));
	}

	private joinErrors(errorOrErrors: (Error | string) | (Array<Error | string>)): Error {
		const errors = Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors];
		if (errors.length === 1) {
			return errors[0] instanceof Error ? <Error>errors[0] : new Error(<string>errors[0]);
		}
		return errors.reduce<Error>((previousValue: Error, currentValue: Error | string) => {
			return new Error(`${previousValue.message}${previousValue.message ? ',' : ''}${currentValue instanceof Error ? currentValue.message : currentValue}`);
		}, new Error(''));
	}

}
