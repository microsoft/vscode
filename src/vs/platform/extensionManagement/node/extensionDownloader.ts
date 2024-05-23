/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { getErrorMessage } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import { isBoolean } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { Promises as FSPromises } from 'vs/base/node/pfs';
import { buffer, CorruptZipMessage } from 'vs/base/node/zip';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionVerificationStatus, toExtensionManagementError } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import { ExtensionManagementError, ExtensionManagementErrorCode, IExtensionGalleryService, IGalleryExtension, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionKey, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { fromExtractError } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ExtensionSignatureVerificationError, ExtensionSignatureVerificationCode, IExtensionSignatureVerificationService } from 'vs/platform/extensionManagement/node/extensionSignatureVerificationService';
import { TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type RetryDownloadClassification = {
	owner: 'sandy081';
	comment: 'Event reporting the retry of downloading';
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extension Id' };
	attempts: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of Attempts' };
};
type RetryDownloadEvent = {
	extensionId: string;
	attempts: number;
};

export class ExtensionsDownloader extends Disposable {

	private static readonly SignatureArchiveExtension = '.sigzip';

	readonly extensionsDownloadDir: URI;
	private readonly cache: number;
	private readonly cleanUpPromise: Promise<void>;

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionSignatureVerificationService private readonly extensionSignatureVerificationService: IExtensionSignatureVerificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.extensionsDownloadDir = environmentService.extensionsDownloadLocation;
		this.cache = 20; // Cache 20 downloaded VSIX files
		this.cleanUpPromise = this.cleanUp();
	}

	async download(extension: IGalleryExtension, operation: InstallOperation, verifySignature: boolean, clientTargetPlatform?: TargetPlatform): Promise<{ readonly location: URI; readonly verificationStatus: ExtensionVerificationStatus }> {
		await this.cleanUpPromise;

		const location = await this.downloadVSIX(extension, operation);

		let verificationStatus: ExtensionVerificationStatus = false;

		if (verifySignature && this.shouldVerifySignature(extension)) {

			let signatureArchiveLocation;
			try {
				signatureArchiveLocation = await this.downloadSignatureArchive(extension);
			} catch (error) {
				try {
					// Delete the downloaded VSIX if signature archive download fails
					await this.delete(location);
				} catch (error) {
					this.logService.error(error);
				}
				throw error;
			}

			try {
				verificationStatus = await this.extensionSignatureVerificationService.verify(extension, location.fsPath, signatureArchiveLocation.fsPath, clientTargetPlatform);
			} catch (error) {
				verificationStatus = (error as ExtensionSignatureVerificationError).code;
				if (verificationStatus === ExtensionSignatureVerificationCode.PackageIsInvalidZip || verificationStatus === ExtensionSignatureVerificationCode.SignatureArchiveIsInvalidZip) {
					try {
						// Delete the downloaded vsix if VSIX or signature archive is invalid
						await this.delete(location);
					} catch (error) {
						this.logService.error(error);
					}
					throw new ExtensionManagementError(CorruptZipMessage, ExtensionManagementErrorCode.CorruptZip);
				}
			} finally {
				try {
					// Delete signature archive always
					await this.delete(signatureArchiveLocation);
				} catch (error) {
					this.logService.error(error);
				}
			}
		}

		return { location, verificationStatus };
	}

	private shouldVerifySignature(extension: IGalleryExtension): boolean {
		if (!extension.isSigned) {
			this.logService.info(`Extension is not signed: ${extension.identifier.id}`);
			return false;
		}

		const value = this.configurationService.getValue('extensions.verifySignature');
		return isBoolean(value) ? value : true;
	}

	private async downloadVSIX(extension: IGalleryExtension, operation: InstallOperation): Promise<URI> {
		try {
			const location = joinPath(this.extensionsDownloadDir, this.getName(extension));
			const attempts = await this.doDownload(extension, 'vsix', async () => {
				await this.downloadFile(extension, location, location => this.extensionGalleryService.download(extension, location, operation));
				try {
					await this.validate(location.fsPath, 'extension/package.json');
				} catch (error) {
					try {
						await this.fileService.del(location);
					} catch (e) {
						this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
					}
					throw error;
				}
			}, 2);

			if (attempts > 1) {
				this.telemetryService.publicLog2<RetryDownloadEvent, RetryDownloadClassification>('extensiongallery:downloadvsix:retry', {
					extensionId: extension.identifier.id,
					attempts
				});
			}

			return location;
		} catch (e) {
			throw toExtensionManagementError(e, ExtensionManagementErrorCode.Download);
		}
	}

	private async downloadSignatureArchive(extension: IGalleryExtension): Promise<URI> {
		try {
			const location = joinPath(this.extensionsDownloadDir, `.${generateUuid()}`);
			const attempts = await this.doDownload(extension, 'sigzip', async () => {
				await this.extensionGalleryService.downloadSignatureArchive(extension, location);
				try {
					await this.validate(location.fsPath, '.signature.p7s');
				} catch (error) {
					try {
						await this.fileService.del(location);
					} catch (e) {
						this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
					}
					throw error;
				}
			}, 2);

			if (attempts > 1) {
				this.telemetryService.publicLog2<RetryDownloadEvent, RetryDownloadClassification>('extensiongallery:downloadsigzip:retry', {
					extensionId: extension.identifier.id,
					attempts
				});
			}

			return location;
		} catch (e) {
			throw toExtensionManagementError(e, ExtensionManagementErrorCode.DownloadSignature);
		}
	}

	private async downloadFile(extension: IGalleryExtension, location: URI, downloadFn: (location: URI) => Promise<void>): Promise<void> {
		// Do not download if exists
		if (await this.fileService.exists(location)) {
			return;
		}

		// Download directly if locaiton is not file scheme
		if (location.scheme !== Schemas.file) {
			await downloadFn(location);
			return;
		}

		// Download to temporary location first only if file does not exist
		const tempLocation = joinPath(this.extensionsDownloadDir, `.${generateUuid()}`);
		try {
			await downloadFn(tempLocation);
		} catch (error) {
			try {
				await this.fileService.del(tempLocation);
			} catch (e) { /* ignore */ }
			throw error;
		}

		try {
			// Rename temp location to original
			await FSPromises.rename(tempLocation.fsPath, location.fsPath, 2 * 60 * 1000 /* Retry for 2 minutes */);
		} catch (error) {
			try { await this.fileService.del(tempLocation); } catch (e) { /* ignore */ }
			let exists = false;
			try { exists = await this.fileService.exists(location); } catch (e) { /* ignore */ }
			if (exists) {
				this.logService.info(`Rename failed because the file was downloaded by another source. So ignoring renaming.`, extension.identifier.id, location.path);
			} else {
				this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted the file from downloaded location`, tempLocation.path);
				throw error;
			}
		}
	}

	private async doDownload(extension: IGalleryExtension, name: string, downloadFn: () => Promise<void>, retries: number): Promise<number> {
		let attempts = 1;
		while (true) {
			try {
				await downloadFn();
				return attempts;
			} catch (e) {
				if (attempts++ > retries) {
					throw e;
				}
				this.logService.warn(`Failed downloading ${name}. ${getErrorMessage(e)}. Retry again...`, extension.identifier.id);
			}
		}
	}

	protected async validate(zipPath: string, filePath: string): Promise<void> {
		try {
			await buffer(zipPath, filePath);
		} catch (e) {
			throw fromExtractError(e);
		}
	}

	async delete(location: URI): Promise<void> {
		await this.cleanUpPromise;
		await this.fileService.del(location);
	}

	private async cleanUp(): Promise<void> {
		try {
			if (!(await this.fileService.exists(this.extensionsDownloadDir))) {
				this.logService.trace('Extension VSIX downloads cache dir does not exist');
				return;
			}
			const folderStat = await this.fileService.resolve(this.extensionsDownloadDir, { resolveMetadata: true });
			if (folderStat.children) {
				const toDelete: URI[] = [];
				const vsixs: [ExtensionKey, IFileStatWithMetadata][] = [];
				const signatureArchives: URI[] = [];

				for (const stat of folderStat.children) {
					if (stat.name.endsWith(ExtensionsDownloader.SignatureArchiveExtension)) {
						signatureArchives.push(stat.resource);
					} else {
						const extension = ExtensionKey.parse(stat.name);
						if (extension) {
							vsixs.push([extension, stat]);
						}
					}
				}

				const byExtension = groupByExtension(vsixs, ([extension]) => extension);
				const distinct: IFileStatWithMetadata[] = [];
				for (const p of byExtension) {
					p.sort((a, b) => semver.rcompare(a[0].version, b[0].version));
					toDelete.push(...p.slice(1).map(e => e[1].resource)); // Delete outdated extensions
					distinct.push(p[0][1]);
				}
				distinct.sort((a, b) => a.mtime - b.mtime); // sort by modified time
				toDelete.push(...distinct.slice(0, Math.max(0, distinct.length - this.cache)).map(s => s.resource)); // Retain minimum cacheSize and delete the rest
				toDelete.push(...signatureArchives); // Delete all signature archives

				await Promises.settled(toDelete.map(resource => {
					this.logService.trace('Deleting from cache', resource.path);
					return this.fileService.del(resource);
				}));
			}
		} catch (e) {
			this.logService.error(e);
		}
	}

	private getName(extension: IGalleryExtension): string {
		return this.cache ? ExtensionKey.create(extension).toString().toLowerCase() : generateUuid();
	}

}
