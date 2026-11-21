/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Promises } from '../../../base/common/async.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { joinPath } from '../../../base/common/resources.js';
import * as semver from '../../../base/common/semver/semver.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid, isUUID } from '../../../base/common/uuid.js';
import { Promises as FSPromises, RimRafMode } from '../../../base/node/pfs.js';
import { buffer, CorruptZipMessage } from '../../../base/node/zip.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { toExtensionManagementError } from '../common/abstractExtensionManagementService.js';
import { ExtensionManagementError, ExtensionManagementErrorCode, ExtensionSignatureVerificationCode, IExtensionGalleryService, IGalleryExtension, InstallOperation } from '../common/extensionManagement.js';
import { ExtensionKey, groupByExtension } from '../common/extensionManagementUtil.js';
import { fromExtractError } from './extensionManagementUtil.js';
import { IExtensionSignatureVerificationService } from './extensionSignatureVerificationService.js';
import { TargetPlatform } from '../../extensions/common/extensions.js';
import { FileOperationResult, IFileService, IFileStat, IFileStatWithMetadata, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';

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

const DOWNLOAD_METADATA_POSTFIX = '.vscdownload';
type DownloadMetadata = { pid: number; hostname: string; platform: string; readyToDelete?: boolean };

export class ExtensionsDownloader extends Disposable {

	private static readonly SignatureArchiveExtension = '.sigzip';

	readonly extensionsDownloadDir: URI;
	private readonly extensionsTrashDir: URI;
	private readonly cache: number;
	private readonly cleanUpPromise: Promise<void>;
	private readonly downloadsPendingCleanup = new Set<string>();

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionSignatureVerificationService private readonly extensionSignatureVerificationService: IExtensionSignatureVerificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.extensionsDownloadDir = environmentService.extensionsDownloadLocation;
		this.extensionsTrashDir = uriIdentityService.extUri.joinPath(environmentService.extensionsDownloadLocation, `.trash`);
		this.cache = 20; // Cache 20 downloaded VSIX files
		this.cleanUpPromise = this.cleanUp();
	}

	async download(extension: IGalleryExtension, operation: InstallOperation, verifySignature: boolean, clientTargetPlatform?: TargetPlatform): Promise<{ readonly location: URI; readonly verificationStatus: ExtensionSignatureVerificationCode | undefined }> {
		await this.cleanUpPromise;

		const location = await this.downloadVSIX(extension, operation);

		if (!verifySignature) {
			return { location, verificationStatus: undefined };
		}

		if (!extension.isSigned) {
			return { location, verificationStatus: ExtensionSignatureVerificationCode.NotSigned };
		}

		let signatureArchiveLocation;
		try {
			signatureArchiveLocation = await this.downloadSignatureArchive(extension);
			const verificationStatus = (await this.extensionSignatureVerificationService.verify(extension.identifier.id, extension.version, location.fsPath, signatureArchiveLocation.fsPath, clientTargetPlatform))?.code;
			if (verificationStatus === ExtensionSignatureVerificationCode.PackageIsInvalidZip || verificationStatus === ExtensionSignatureVerificationCode.SignatureArchiveIsInvalidZip) {
				try {
					// Delete the downloaded vsix if VSIX or signature archive is invalid
					await this.delete(location);
				} catch (error) {
					this.logService.error(error);
				}
				throw new ExtensionManagementError(CorruptZipMessage, ExtensionManagementErrorCode.CorruptZip);
			}
			return { location, verificationStatus };
		} catch (error) {
			try {
				// Delete the downloaded VSIX if signature archive download fails
				await this.delete(location);
			} catch (error) {
				this.logService.error(error);
			}
			throw error;
		} finally {
			if (signatureArchiveLocation) {
				try {
					// Delete signature archive always
					await this.delete(signatureArchiveLocation);
				} catch (error) {
					this.logService.error(error);
				}
			}
		}
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
			const location = joinPath(this.extensionsDownloadDir, `${this.getName(extension)}${ExtensionsDownloader.SignatureArchiveExtension}`);
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
		await this.cleanUpTemporaryDownloads();

		// Do not download if exists
		if (await this.fileService.exists(location)) {
			return;
		}

		// Download directly if locaiton is not file scheme
		if (location.scheme !== Schemas.file) {
			await downloadFn(location);
			return;
		}

		// Record ownership before any download data is written.
		const tempLocation = joinPath(this.extensionsDownloadDir, `.${generateUuid()}`);
		const metadata = tempLocation.with({ path: `${tempLocation.path}${DOWNLOAD_METADATA_POSTFIX}` });
		const owner: DownloadMetadata = { pid: process.pid, hostname: os.hostname(), platform: process.platform };
		try {
			await this.fileService.writeFile(metadata, VSBuffer.fromString(JSON.stringify(owner)));
			try {
				await downloadFn(tempLocation);
			} catch (error) {
				await this.finishFailedDownload(tempLocation, metadata, owner);
				throw error;
			}

			try {
				// Keep ownership until renaming, including its existing retries, has finished.
				await this.rename(tempLocation, location);
			} catch (error) {
				await this.finishFailedDownload(tempLocation, metadata, owner);
				let exists = false;
				try { exists = await this.fileService.exists(location); } catch (e) { /* ignore */ }
				if (exists) {
					this.logService.info(`Rename failed because the file was downloaded by another source. So ignoring renaming.`, extension.identifier.id, location.path);
				} else {
					this.logService.info(`Rename failed because of ${getErrorMessage(error)}.`, tempLocation.path);
					throw error;
				}
			}
		} finally {
			try {
				await this.fileService.stat(tempLocation);
			} catch (error) {
				if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
					try { await this.fileService.del(metadata); } catch (e) { /* ignore */ }
				}
			}
		}
	}

	protected async rename(source: URI, target: URI): Promise<void> {
		await FSPromises.rename(source.fsPath, target.fsPath, 2 * 60 * 1000 /* Retry for 2 minutes */);
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
		await this.moveToTrash(location);
	}

	private async moveToTrash(location: URI): Promise<void> {
		const trashRelativePath = this.uriIdentityService.extUri.relativePath(this.extensionsDownloadDir, location);
		if (trashRelativePath) {
			try {
				await this.fileService.move(location, this.uriIdentityService.extUri.joinPath(this.extensionsTrashDir, trashRelativePath), true);
			} catch (error) {
				// Another cleanup can remove the trash entry before move() resolves its final stat.
				if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
					try {
						await this.fileService.stat(location);
					} catch (sourceError) {
						if (toFileOperationResult(sourceError) === FileOperationResult.FILE_NOT_FOUND) {
							return;
						}
					}
				}
				throw error;
			}
		} else {
			await this.fileService.del(location);
		}
	}

	async cleanUpTemporaryDownloads(): Promise<void> {
		await this.cleanUpPromise;
		await this.removeAbandonedDownloads();
		await this.emptyTrash();
	}

	private async finishFailedDownload(location: URI, metadata: URI, owner: DownloadMetadata): Promise<void> {
		if (!(await this.deleteTemporaryDownload(location))) {
			// The actual download and rename operation has stopped, even if its process remains alive.
			try {
				await this.fileService.writeFile(metadata, VSBuffer.fromString(JSON.stringify({ ...owner, readyToDelete: true })), { atomic: { postfix: '.tmp' } });
			} catch (error) {
				this.downloadsPendingCleanup.add(location.toString());
				this.logService.warn('Could not record failed download cleanup', metadata.toString(), getErrorMessage(error));
			}
		}
	}

	private async removeAbandonedDownloads(): Promise<void> {
		try {
			const stat = await this.fileService.resolve(this.extensionsDownloadDir);
			const records = stat.children?.filter(child => child.isFile && !child.isSymbolicLink && child.name.endsWith(DOWNLOAD_METADATA_POSTFIX)) ?? [];
			await Promises.settled(records.map(record => this.removeAbandonedDownload(record)));
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.warn('Could not recover temporary extension downloads', getErrorMessage(error));
			}
		}
	}

	private async removeAbandonedDownload(metadata: IFileStat): Promise<void> {
		const filename = metadata.name.slice(0, -DOWNLOAD_METADATA_POSTFIX.length);
		if (!filename.startsWith('.') || !isUUID(filename.slice(1))) {
			return;
		}
		const location = joinPath(this.extensionsDownloadDir, filename);
		try {
			const owner: DownloadMetadata = JSON.parse((await this.fileService.readFile(metadata.resource)).value.toString());
			if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || owner.hostname !== os.hostname() || owner.platform !== process.platform) {
				return;
			}
			if (owner.readyToDelete !== true && !(owner.pid === process.pid && this.downloadsPendingCleanup.has(location.toString()))) {
				try {
					process.kill(owner.pid, 0);
					return;
				} catch (error) {
					// Permission errors and unknown owners are not proof that a download has stopped.
					if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
						return;
					}
				}
			}
			if (await this.deleteTemporaryDownload(location)) {
				await this.fileService.del(metadata.resource);
			}
		} catch (error) {
			this.logService.trace('Could not recover temporary extension download', metadata.resource.toString(), getErrorMessage(error));
		}
	}

	private async deleteTemporaryDownload(location: URI): Promise<boolean> {
		try {
			await this.fileService.del(location);
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				try {
					await this.moveToTrash(location);
				} catch (trashError) {
					this.logService.warn('Could not delete temporary extension download', location.toString(), getErrorMessage(trashError));
					return false;
				}
			}
		}
		this.downloadsPendingCleanup.delete(location.toString());
		return true;
	}

	private async emptyTrash(): Promise<void> {
		try {
			const trash = await this.fileService.resolve(this.extensionsTrashDir);
			// Keep a real container for concurrent moves, but remove a link without following its target.
			const entries = trash.isSymbolicLink ? [trash] : trash.children ?? [];
			await Promises.settled(entries.map(async entry => {
				if (entry.resource.scheme === Schemas.file) {
					// Keep failed deletions in the cache trash so the next cleanup can retry.
					await FSPromises.rm(entry.resource.fsPath, RimRafMode.UNLINK);
				} else {
					await this.fileService.del(entry.resource, { recursive: true });
				}
			}));
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}

	private async cleanUp(): Promise<void> {
		try {
			if (!(await this.fileService.exists(this.extensionsDownloadDir))) {
				this.logService.trace('Extension VSIX downloads cache dir does not exist');
				return;
			}

			await this.removeAbandonedDownloads();
			await this.emptyTrash();

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
		return ExtensionKey.create(extension).toString().toLowerCase();
	}

}
