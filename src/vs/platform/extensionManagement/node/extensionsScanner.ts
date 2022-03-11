/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { Limiter, Promises, Queue } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { getErrorMessage } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { basename } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import { extract, ExtractError } from 'vs/base/node/zip';
import { localize } from 'vs/nls';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionManagementError, ExtensionManagementErrorCode, Metadata, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, ExtensionKey, getGalleryExtensionId, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { ExtensionType, IExtensionIdentifier, IExtensionManifest, TargetPlatform, UNDEFINED_PUBLISHER } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';


export type ILocalExtensionManifest = IExtensionManifest & { __metadata?: Metadata };
type IRelaxedLocalExtension = Omit<ILocalExtension, 'isBuiltin'> & { isBuiltin: boolean; targetPlatform: TargetPlatform };

export class ExtensionsScanner extends Disposable {

	private readonly systemExtensionsPath: string;
	private readonly extensionsPath: string;
	private readonly uninstalledPath: string;
	private readonly uninstalledFileLimiter: Queue<any>;

	constructor(
		private readonly beforeRemovingExtension: (e: ILocalExtension) => Promise<void>,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this.systemExtensionsPath = environmentService.builtinExtensionsPath;
		this.extensionsPath = environmentService.extensionsPath;
		this.uninstalledPath = path.join(this.extensionsPath, '.obsolete');
		this.uninstalledFileLimiter = new Queue();
	}

	async cleanUp(): Promise<void> {
		await this.removeUninstalledExtensions();
		await this.removeOutdatedExtensions();
	}

	async scanExtensions(type: ExtensionType | null): Promise<ILocalExtension[]> {
		const promises: Promise<ILocalExtension[]>[] = [];

		if (type === null || type === ExtensionType.System) {
			promises.push(this.scanSystemExtensions().then(null, e => Promise.reject(new ExtensionManagementError(this.joinErrors(e).message, ExtensionManagementErrorCode.Internal))));
		}

		if (type === null || type === ExtensionType.User) {
			promises.push(this.scanUserExtensions(true).then(null, e => Promise.reject(new ExtensionManagementError(this.joinErrors(e).message, ExtensionManagementErrorCode.Internal))));
		}

		try {
			const result = await Promise.all(promises);
			return flatten(result);
		} catch (error) {
			throw this.joinErrors(error);
		}
	}

	async scanUserExtensions(excludeOutdated: boolean): Promise<ILocalExtension[]> {
		this.logService.trace('Started scanning user extensions');
		let [uninstalled, extensions] = await Promise.all([this.getUninstalledExtensions(), this.scanAllUserExtensions()]);
		extensions = extensions.filter(e => !uninstalled[ExtensionKey.create(e).toString()]);
		if (excludeOutdated) {
			const byExtension: ILocalExtension[][] = groupByExtension(extensions, e => e.identifier);
			extensions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0]);
		}
		this.logService.trace('Scanned user extensions:', extensions.length);
		return extensions;
	}

	async scanAllUserExtensions(): Promise<ILocalExtension[]> {
		return this.scanExtensionsInDir(this.extensionsPath, ExtensionType.User);
	}

	async extractUserExtension(extensionKey: ExtensionKey, zipPath: string, metadata: Metadata | undefined, token: CancellationToken): Promise<ILocalExtension> {
		const folderName = extensionKey.toString();
		const tempPath = path.join(this.extensionsPath, `.${generateUuid()}`);
		const extensionPath = path.join(this.extensionsPath, folderName);

		try {
			await pfs.Promises.rm(extensionPath);
		} catch (error) {
			throw new ExtensionManagementError(localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionPath, extensionKey.id), ExtensionManagementErrorCode.Delete);
		}

		await this.extractAtLocation(extensionKey, zipPath, tempPath, token);
		let local = await this.scanExtension(URI.file(tempPath), ExtensionType.User);
		if (!local) {
			throw new Error(localize('cannot read', "Cannot read the extension from {0}", tempPath));
		}
		await this.storeMetadata(local, { ...metadata, installedTimestamp: Date.now() });

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

		try {
			local = await this.scanExtension(URI.file(extensionPath), ExtensionType.User);
		} catch (e) { /*ignore */ }

		if (local) {
			return local;
		}
		throw new Error(localize('cannot read', "Cannot read the extension from {0}", this.extensionsPath));
	}

	async saveMetadataForLocalExtension(local: ILocalExtension, metadata: Metadata): Promise<ILocalExtension> {
		this.setMetadata(local, metadata);
		await this.storeMetadata(local, { ...metadata, installedTimestamp: local.installedTimestamp });
		return local;
	}

	private async storeMetadata(local: ILocalExtension, metaData: Metadata): Promise<ILocalExtension> {
		// unset if false
		metaData.isMachineScoped = metaData.isMachineScoped || undefined;
		metaData.isBuiltin = metaData.isBuiltin || undefined;
		metaData.installedTimestamp = metaData.installedTimestamp || undefined;
		const manifestPath = path.join(local.location.fsPath, 'package.json');
		const raw = await pfs.Promises.readFile(manifestPath, 'utf8');
		const { manifest } = await this.parseManifest(raw);
		(manifest as ILocalExtensionManifest).__metadata = metaData;
		await pfs.Promises.writeFile(manifestPath, JSON.stringify(manifest, null, '\t'));
		return local;
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
		const installed = await this.scanExtensions(ExtensionType.User);
		const localExtension = installed.find(i => ExtensionKey.create(i).equals(extensionKey)) || null;
		if (!localExtension) {
			return null;
		}
		await this.storeMetadata(localExtension, { installedTimestamp: Date.now() });
		return this.scanExtension(localExtension.location, ExtensionType.User);
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

	async removeExtension(extension: ILocalExtension, type: string): Promise<void> {
		this.logService.trace(`Deleting ${type} extension from disk`, extension.identifier.id, extension.location.fsPath);
		await pfs.Promises.rm(extension.location.fsPath);
		this.logService.info('Deleted from disk', extension.identifier.id, extension.location.fsPath);
	}

	async removeUninstalledExtension(extension: ILocalExtension): Promise<void> {
		await this.removeExtension(extension, 'uninstalled');
		await this.withUninstalledExtensions(uninstalled => delete uninstalled[ExtensionKey.create(extension).toString()]);
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

	private async scanSystemExtensions(): Promise<ILocalExtension[]> {
		this.logService.trace('Started scanning system extensions');
		const systemExtensionsPromise = this.scanDefaultSystemExtensions();
		if (this.environmentService.isBuilt) {
			return systemExtensionsPromise;
		}

		// Scan other system extensions during development
		const devSystemExtensionsPromise = this.scanDevSystemExtensions();
		const [systemExtensions, devSystemExtensions] = await Promise.all([systemExtensionsPromise, devSystemExtensionsPromise]);
		return [...systemExtensions, ...devSystemExtensions];
	}

	private async scanExtensionsInDir(dir: string, type: ExtensionType): Promise<ILocalExtension[]> {
		const limiter = new Limiter<any>(10);
		const stat = await this.fileService.resolve(URI.file(dir));
		if (stat.children) {
			const extensions = await Promise.all<ILocalExtension>(stat.children.filter(c => c.isDirectory)
				.map(c => limiter.queue(async () => {
					if (type === ExtensionType.User && basename(c.resource).indexOf('.') === 0) { // Do not consider user extension folder starting with `.`
						return null;
					}
					return this.scanExtension(c.resource, type);
				})));
			return extensions.filter(e => e && e.identifier);
		}
		return [];
	}

	private async scanExtension(extensionLocation: URI, type: ExtensionType): Promise<ILocalExtension | null> {
		try {
			const stat = await this.fileService.resolve(extensionLocation);
			if (stat.children) {
				const { manifest, metadata } = await this.readManifest(extensionLocation.fsPath);
				const readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
				const changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
				const identifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
				const local = <ILocalExtension>{ type, identifier, manifest, location: extensionLocation, readmeUrl, changelogUrl, publisherDisplayName: null, publisherId: null, isMachineScoped: false, isBuiltin: type === ExtensionType.System };
				this.setMetadata(local, metadata);
				return local;
			}
		} catch (e) {
			if (type !== ExtensionType.System) {
				this.logService.trace(e);
			}
		}
		return null;
	}

	private async scanDefaultSystemExtensions(): Promise<ILocalExtension[]> {
		const result = await this.scanExtensionsInDir(this.systemExtensionsPath, ExtensionType.System);
		this.logService.trace('Scanned system extensions:', result.length);
		return result;
	}

	private async scanDevSystemExtensions(): Promise<ILocalExtension[]> {
		const devSystemExtensionsList = this.getDevSystemExtensionsList();
		if (devSystemExtensionsList.length) {
			const result = await this.scanExtensionsInDir(this.devSystemExtensionsPath, ExtensionType.System);
			this.logService.trace('Scanned dev system extensions:', result.length);
			return result.filter(r => devSystemExtensionsList.some(id => areSameExtensions(r.identifier, { id })));
		} else {
			return [];
		}
	}

	private setMetadata(local: IRelaxedLocalExtension, metadata: Metadata | null): void {
		local.publisherDisplayName = metadata?.publisherDisplayName || null;
		local.publisherId = metadata?.publisherId || null;
		local.identifier.uuid = metadata?.id;
		local.isMachineScoped = !!metadata?.isMachineScoped;
		local.isPreReleaseVersion = !!metadata?.isPreReleaseVersion;
		local.preRelease = !!metadata?.preRelease;
		local.isBuiltin = local.type === ExtensionType.System || !!metadata?.isBuiltin;
		local.installedTimestamp = metadata?.installedTimestamp;
		local.targetPlatform = metadata?.targetPlatform ?? TargetPlatform.UNDEFINED;
	}

	private async removeUninstalledExtensions(): Promise<void> {
		const uninstalled = await this.getUninstalledExtensions();
		const extensions = await this.scanAllUserExtensions(); // All user extensions
		const installed: Set<string> = new Set<string>();
		for (const e of extensions) {
			if (!uninstalled[ExtensionKey.create(e).toString()]) {
				installed.add(e.identifier.id.toLowerCase());
			}
		}
		const byExtension: ILocalExtension[][] = groupByExtension(extensions, e => e.identifier);
		await Promises.settled(byExtension.map(async e => {
			const latest = e.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0];
			if (!installed.has(latest.identifier.id.toLowerCase())) {
				await this.beforeRemovingExtension(latest);
			}
		}));
		const toRemove: ILocalExtension[] = extensions.filter(e => uninstalled[ExtensionKey.create(e).toString()]);
		await Promises.settled(toRemove.map(e => this.removeUninstalledExtension(e)));
	}

	private async removeOutdatedExtensions(): Promise<void> {
		const extensions = await this.scanAllUserExtensions();
		const toRemove: ILocalExtension[] = [];

		// Outdated extensions
		const byExtension: ILocalExtension[][] = groupByExtension(extensions, e => e.identifier);
		toRemove.push(...flatten(byExtension.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version)).slice(1))));

		await Promises.settled(toRemove.map(extension => this.removeExtension(extension, 'outdated')));
	}

	private getDevSystemExtensionsList(): string[] {
		return (this.productService.builtInExtensions || []).map(e => e.name);
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

	private _devSystemExtensionsPath: string | null = null;
	private get devSystemExtensionsPath(): string {
		if (!this._devSystemExtensionsPath) {
			this._devSystemExtensionsPath = path.normalize(path.join(FileAccess.asFileUri('', require).fsPath, '..', '.build', 'builtInExtensions'));
		}
		return this._devSystemExtensionsPath;
	}

	private async readManifest(extensionPath: string): Promise<{ manifest: IExtensionManifest; metadata: Metadata | null }> {
		const promises = [
			pfs.Promises.readFile(path.join(extensionPath, 'package.json'), 'utf8')
				.then(raw => this.parseManifest(raw)),
			pfs.Promises.readFile(path.join(extensionPath, 'package.nls.json'), 'utf8')
				.then(undefined, err => err.code !== 'ENOENT' ? Promise.reject<string>(err) : '{}')
				.then(raw => JSON.parse(raw))
		];

		const [{ manifest, metadata }, translations] = await Promise.all(promises);
		return {
			manifest: localizeManifest(manifest, translations),
			metadata
		};
	}

	private parseManifest(raw: string): Promise<{ manifest: IExtensionManifest; metadata: Metadata | null }> {
		return new Promise((c, e) => {
			try {
				const manifest = <ILocalExtensionManifest & { publisher: string }>JSON.parse(raw);
				// allow publisher to be undefined to make the initial extension authoring experience smoother
				if (!manifest.publisher) {
					manifest.publisher = UNDEFINED_PUBLISHER;
				}
				const metadata = manifest.__metadata || null;
				c({ manifest, metadata });
			} catch (err) {
				e(new Error(localize('invalidManifest', "Extension invalid: package.json is not a JSON file.")));
			}
		});
	}
}
