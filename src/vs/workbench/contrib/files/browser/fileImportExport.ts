/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getFileNamesMessage, IConfirmation, IDialogService, IFileDialogService, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { ByteSize, FileSystemProviderCapabilities, IFileService, IFileStatWithMetadata } from '../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IExplorerService } from './files.js';
import { IFilesConfiguration, UndoConfirmLevel, VIEW_ID } from '../common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Limiter, Promises, RunOnceWorker } from '../../../../base/common/async.js';
import { newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { ResourceFileEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { ExplorerItem } from '../common/explorerModel.js';
import { URI } from '../../../../base/common/uri.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { extractEditorsAndFilesDropData } from '../../../../platform/dnd/browser/dnd.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';
import { isWeb } from '../../../../base/common/platform.js';
import { getActiveWindow, isDragEvent, triggerDownload } from '../../../../base/browser/dom.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { listenStream } from '../../../../base/common/stream.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { canceled, isCancellationError } from '../../../../base/common/errors.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { WebFileSystemAccess } from '../../../../platform/files/browser/webFileSystemAccess.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

//#region Transfer Progress

export interface ITransferProgressMessages {

	/**
	 * Message for when multiple small files are being transferred.
	 */
	manySmallFiles(filesTransferred: number, filesTotal: number, rate: string): string;

	/**
	 * Message for when a large file is being transferred.
	 */
	largeFile(name: string, bytesTransferred: string, size: string, rate: string): string;
}

/**
 * Helper to report progress for file transfers (upload, download, import) in a
 * unified way: the number of files transferred, byte progress for large files
 * and the average transfer rate. When the total number of bytes to transfer is
 * known, overall progress is additionally reported as percentage increments.
 *
 * Reports are throttled to update at most once per second.
 */
export class TransferProgressReporter implements IDisposable {

	private static readonly REPORT_INTERVAL = 1000;

	private readonly progressScheduler: RunOnceWorker<IProgressStep>;
	private readonly startTime: number;

	private filesTotal: number;
	private filesTransferred = 0;

	private totalBytesTransferred = 0;

	private percent = 0;
	private lastReportedPercent = 0;

	constructor(
		filesTotal: number,
		private readonly totalBytes: number | undefined,
		private readonly messages: ITransferProgressMessages,
		progress: IProgress<IProgressStep>,
		private readonly now: () => number = () => Date.now()
	) {
		this.filesTotal = filesTotal;
		this.startTime = this.now();

		this.progressScheduler = new RunOnceWorker<IProgressStep>(steps => {
			const step = steps[steps.length - 1];

			if (typeof this.totalBytes === 'number' && this.totalBytes > 0) {
				step.increment = this.percent - this.lastReportedPercent;
				step.total = 100;

				this.lastReportedPercent = this.percent;
			}

			progress.report(step);
		}, TransferProgressReporter.REPORT_INTERVAL);
	}

	/**
	 * Adds to the total number of files being transferred. Used when
	 * the contents of folders are only discovered during the transfer.
	 */
	addFiles(count: number): void {
		this.filesTotal += count;
	}

	/**
	 * Signals that the transfer of another file has started.
	 */
	startFile(): void {
		this.filesTransferred++;
	}

	/**
	 * Reports byte progress for the file that is currently being transferred.
	 */
	report(name: string, fileSize: number, fileBytesTransferred: number, bytesTransferredDelta: number): void {
		this.totalBytesTransferred += bytesTransferredDelta;

		if (typeof this.totalBytes === 'number' && this.totalBytes > 0) {
			this.percent = Math.min(100, Math.round(this.totalBytesTransferred * 100 / this.totalBytes));
		}

		const elapsedMillis = Math.max(1, this.now() - this.startTime);
		const rate = ByteSize.formatSize(this.totalBytesTransferred / (elapsedMillis / 1000));

		// Small file
		let message: string;
		if (fileSize < ByteSize.MB) {
			if (this.filesTotal === 1) {
				message = name;
			} else {
				message = this.messages.manySmallFiles(this.filesTransferred, this.filesTotal, rate);
			}
		}

		// Large file
		else {
			message = this.messages.largeFile(name, ByteSize.formatSize(fileBytesTransferred), ByteSize.formatSize(fileSize), rate);
		}

		// Report progress but limit to update only once per second
		this.progressScheduler.work({ message });
	}

	/**
	 * Reports any pending progress immediately.
	 */
	flush(): void {
		this.progressScheduler.flush();
	}

	dispose(): void {
		this.progressScheduler.dispose();
	}
}

//#endregion

//#region Browser File Upload (drag and drop, input element)

const uploadProgressMessages: ITransferProgressMessages = {
	manySmallFiles: (filesTransferred, filesTotal, rate) => localize('uploadProgressSmallMany', "{0} of {1} files ({2}/s)", filesTransferred, filesTotal, rate),
	largeFile: (name, bytesTransferred, size, rate) => localize('uploadProgressLarge', "{0} ({1} of {2}, {3}/s)", name, bytesTransferred, size, rate)
};

interface IWebkitDataTransfer {
	items: IWebkitDataTransferItem[];
}

interface IWebkitDataTransferItem {
	webkitGetAsEntry(): IWebkitDataTransferItemEntry | null;
}

interface IWebkitDataTransferItemEntry {
	name: string | undefined;
	isFile: boolean;
	isDirectory: boolean;

	file(resolve: (file: File) => void, reject: () => void): void;
	createReader(): IWebkitDataTransferItemEntryReader;
}

interface IWebkitDataTransferItemEntryReader {
	readEntries(resolve: (file: IWebkitDataTransferItemEntry[]) => void, reject: () => void): void;
}

export class BrowserFileUpload {

	private static readonly MAX_PARALLEL_UPLOADS = 20;

	constructor(
		@IProgressService private readonly progressService: IProgressService,
		@IDialogService private readonly dialogService: IDialogService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService
	) {
	}

	upload(target: ExplorerItem, source: DragEvent | FileList): Promise<void> {
		const cts = new CancellationTokenSource();

		// Indicate progress globally
		const uploadPromise = this.progressService.withProgress(
			{
				location: ProgressLocation.Window,
				delay: 800,
				cancellable: true,
				title: localize('uploadingFiles', "Uploading")
			},
			async progress => this.doUpload(target, this.toTransfer(source), progress, cts.token),
			() => cts.dispose(true)
		);

		// Also indicate progress in the files view
		this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => uploadPromise);

		return uploadPromise;
	}

	private toTransfer(source: DragEvent | FileList): IWebkitDataTransfer {
		if (isDragEvent(source)) {
			return source.dataTransfer as unknown as IWebkitDataTransfer;
		}

		const transfer: IWebkitDataTransfer = { items: [] };

		// We want to reuse the same code for uploading from
		// Drag & Drop as well as input element based upload
		// so we convert into webkit data transfer when the
		// input element approach is used (simplified).
		for (const file of source) {
			transfer.items.push({
				webkitGetAsEntry: () => {
					return {
						name: file.name,
						isDirectory: false,
						isFile: true,
						createReader: () => { throw new Error('Unsupported for files'); },
						file: resolve => resolve(file)
					};
				}
			});
		}

		return transfer;
	}

	private async doUpload(target: ExplorerItem, source: IWebkitDataTransfer, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		const items = source.items;

		// Somehow the items thing is being modified at random, maybe as a security
		// measure since this is a DND operation. As such, we copy the items into
		// an array we own as early as possible before using it.
		const entries: IWebkitDataTransferItemEntry[] = [];
		for (const item of items) {
			// `webkitGetAsEntry()` returns `null` for data transfer items that
			// do not represent a file system entry (e.g. dragged text/URLs).
			// Skip those so we never operate on a `null` entry later on.
			const entry = item.webkitGetAsEntry();
			if (entry) {
				entries.push(entry);
			}
		}

		const results: { isFile: boolean; resource: URI }[] = [];
		const reporter = new TransferProgressReporter(entries.length, undefined, uploadProgressMessages, progress);

		try {

			// Upload all entries in parallel up to a
			// certain maximum leveraging the `Limiter`
			const uploadLimiter = new Limiter(BrowserFileUpload.MAX_PARALLEL_UPLOADS);
			await Promises.settled(entries.map(entry => {
				return uploadLimiter.queue(async () => {
					if (token.isCancellationRequested) {
						return;
					}

					// Confirm overwrite as needed
					if (target && entry.name && target.getChild(entry.name)) {
						const { confirmed } = await this.dialogService.confirm(getFileOverwriteConfirm(entry.name));
						if (!confirmed) {
							return;
						}

						await this.explorerService.applyBulkEdit([new ResourceFileEdit(joinPath(target.resource, entry.name), undefined, { recursive: true, folder: target.getChild(entry.name)?.isDirectory })], {
							undoLabel: localize('overwrite', "Overwrite {0}", entry.name),
							progressLabel: localize('overwriting', "Overwriting {0}", entry.name),
						});

						if (token.isCancellationRequested) {
							return;
						}
					}

					// Upload entry
					const result = await this.doUploadEntry(entry, target.resource, target, reporter, token);
					if (result) {
						results.push(result);
					}
				});
			}));
		} finally {
			reporter.dispose();
		}

		// Open uploaded file in editor only if we upload just one
		const firstUploadedFile = results[0];
		if (!token.isCancellationRequested && firstUploadedFile?.isFile) {
			await this.editorService.openEditor({ resource: firstUploadedFile.resource, options: { pinned: true } });
		}
	}

	private async doUploadEntry(entry: IWebkitDataTransferItemEntry, parentResource: URI, target: ExplorerItem | undefined, reporter: TransferProgressReporter, token: CancellationToken): Promise<{ isFile: boolean; resource: URI } | undefined> {
		const entryName = entry.name;
		if (token.isCancellationRequested || !entryName || (!entry.isFile && !entry.isDirectory)) {
			return undefined;
		}

		// Report progress
		let fileBytesUploaded = 0;
		const reportProgress = (fileSize: number, bytesUploaded: number): void => {
			fileBytesUploaded += bytesUploaded;

			reporter.report(entryName, fileSize, fileBytesUploaded, bytesUploaded);
		};
		reporter.startFile();
		reportProgress(0, 0);

		// Handle file upload
		const resource = joinPath(parentResource, entryName);
		if (entry.isFile) {
			const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));

			if (token.isCancellationRequested) {
				return undefined;
			}

			// Chrome/Edge/Firefox support stream method, but only use it for
			// larger files to reduce the overhead of the streaming approach
			if (typeof file.stream === 'function' && file.size > ByteSize.MB) {
				await this.doUploadFileBuffered(resource, file, reportProgress, token);
			}

			// Fallback to unbuffered upload for other browsers or small files
			else {
				await this.doUploadFileUnbuffered(resource, file, reportProgress);
			}

			return { isFile: true, resource };
		}

		// Handle folder upload
		else {

			// Create target folder
			await this.fileService.createFolder(resource);

			if (token.isCancellationRequested) {
				return undefined;
			}

			// Recursive upload files in this directory
			const dirReader = entry.createReader();
			const childEntries: IWebkitDataTransferItemEntry[] = [];
			let done = false;
			do {
				const childEntriesChunk = await new Promise<IWebkitDataTransferItemEntry[]>((resolve, reject) => dirReader.readEntries(resolve, reject));
				if (childEntriesChunk.length > 0) {
					childEntries.push(...childEntriesChunk);
				} else {
					done = true; // an empty array is a signal that all entries have been read
				}
			} while (!done && !token.isCancellationRequested);

			// Update operation total based on new counts
			reporter.addFiles(childEntries.length);

			// Split up files from folders to upload
			const folderTarget = target?.getChild(entryName) || undefined;
			const fileChildEntries: IWebkitDataTransferItemEntry[] = [];
			const folderChildEntries: IWebkitDataTransferItemEntry[] = [];
			for (const childEntry of childEntries) {
				if (childEntry.isFile) {
					fileChildEntries.push(childEntry);
				} else if (childEntry.isDirectory) {
					folderChildEntries.push(childEntry);
				}
			}

			// Upload files (up to `MAX_PARALLEL_UPLOADS` in parallel)
			const fileUploadQueue = new Limiter(BrowserFileUpload.MAX_PARALLEL_UPLOADS);
			await Promises.settled(fileChildEntries.map(fileChildEntry => {
				return fileUploadQueue.queue(() => this.doUploadEntry(fileChildEntry, resource, folderTarget, reporter, token));
			}));

			// Upload folders (sequentially give we don't know their sizes)
			for (const folderChildEntry of folderChildEntries) {
				await this.doUploadEntry(folderChildEntry, resource, folderTarget, reporter, token);
			}

			return { isFile: false, resource };
		}
	}

	private async doUploadFileBuffered(resource: URI, file: File, progressReporter: (fileSize: number, bytesUploaded: number) => void, token: CancellationToken): Promise<void> {
		const writeableStream = newWriteableBufferStream({
			// Set a highWaterMark to prevent the stream
			// for file upload to produce large buffers
			// in-memory
			highWaterMark: 10
		});
		const writeFilePromise = this.fileService.writeFile(resource, writeableStream);

		// Read the file in chunks using File.stream() web APIs
		try {
			const reader: ReadableStreamDefaultReader<Uint8Array> = file.stream().getReader();

			let res = await reader.read();
			while (!res.done) {
				if (token.isCancellationRequested) {
					break;
				}

				// Write buffer into stream but make sure to wait
				// in case the `highWaterMark` is reached
				const buffer = VSBuffer.wrap(res.value);
				await writeableStream.write(buffer);

				if (token.isCancellationRequested) {
					break;
				}

				// Report progress
				progressReporter(file.size, buffer.byteLength);

				res = await reader.read();
			}
			writeableStream.end(undefined);
		} catch (error) {
			writeableStream.error(error);
			writeableStream.end();
		}

		if (token.isCancellationRequested) {
			return undefined;
		}

		// Wait for file being written to target
		await writeFilePromise;
	}

	private doUploadFileUnbuffered(resource: URI, file: File, progressReporter: (fileSize: number, bytesUploaded: number) => void): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = async event => {
				try {
					if (event.target?.result instanceof ArrayBuffer) {
						const buffer = VSBuffer.wrap(new Uint8Array(event.target.result));
						await this.fileService.writeFile(resource, buffer);

						// Report progress
						progressReporter(file.size, buffer.byteLength);
					} else {
						throw new Error('Could not read from dropped file.');
					}

					resolve();
				} catch (error) {
					reject(error);
				}
			};

			// Start reading the file to trigger `onload`
			reader.readAsArrayBuffer(file);
		});
	}
}

//#endregion

//#region External File Import (drag and drop)

export class ExternalFileImport {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IEditorService private readonly editorService: IEditorService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	async import(target: ExplorerItem, source: DragEvent, targetWindow: Window): Promise<void> {
		const cts = new CancellationTokenSource();

		// Indicate progress globally
		const importPromise = this.progressService.withProgress(
			{
				location: ProgressLocation.Window,
				delay: 800,
				cancellable: true,
				title: localize('copyingFiles', "Copying...")
			},
			async () => await this.doImport(target, source, targetWindow, cts.token),
			() => cts.dispose(true)
		);

		// Also indicate progress in the files view
		this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => importPromise);

		return importPromise;
	}

	private async doImport(target: ExplorerItem, source: DragEvent, targetWindow: Window, token: CancellationToken): Promise<void> {

		// Activate all providers for the resources dropped
		const candidateFiles = coalesce((await this.instantiationService.invokeFunction(accessor => extractEditorsAndFilesDropData(accessor, source))).map(editor => editor.resource));
		await Promise.all(candidateFiles.map(resource => this.fileService.activateProvider(resource.scheme)));

		// Check for dropped external files to be folders
		const files = coalesce(candidateFiles.filter(resource => this.fileService.hasProvider(resource)));
		const resolvedFiles = await this.fileService.resolveAll(files.map(file => ({ resource: file })));

		if (token.isCancellationRequested) {
			return;
		}

		// Pass focus to window
		this.hostService.focus(targetWindow);

		// Handle folders by adding to workspace if we are in workspace context and if dropped on top
		const folders = resolvedFiles.filter(resolvedFile => resolvedFile.success && resolvedFile.stat?.isDirectory).map(resolvedFile => ({ uri: resolvedFile.stat!.resource }));
		if (folders.length > 0 && target.isRoot) {
			enum ImportChoice {
				Copy = 1,
				Add = 2
			}

			const buttons: IPromptButton<ImportChoice | undefined>[] = [
				{
					label: folders.length > 1 ?
						localize('copyFolders', "&&Copy Folders") :
						localize('copyFolder', "&&Copy Folder"),
					run: () => ImportChoice.Copy
				}
			];

			let message: string;

			// We only allow to add a folder to the workspace if there is already a workspace folder with that scheme
			const workspaceFolderSchemas = this.contextService.getWorkspace().folders.map(folder => folder.uri.scheme);
			if (folders.some(folder => workspaceFolderSchemas.indexOf(folder.uri.scheme) >= 0)) {
				buttons.unshift({
					label: folders.length > 1 ?
						localize('addFolders', "&&Add Folders to Workspace") :
						localize('addFolder', "&&Add Folder to Workspace"),
					run: () => ImportChoice.Add
				});
				message = folders.length > 1 ?
					localize('dropFolders', "Do you want to copy the folders or add the folders to the workspace?") :
					localize('dropFolder', "Do you want to copy '{0}' or add '{0}' as a folder to the workspace?", basename(folders[0].uri));
			} else {
				message = folders.length > 1 ?
					localize('copyfolders', "Are you sure to want to copy folders?") :
					localize('copyfolder', "Are you sure to want to copy '{0}'?", basename(folders[0].uri));
			}

			const { result } = await this.dialogService.prompt({
				type: Severity.Info,
				message,
				buttons,
				cancelButton: true
			});

			// Add folders
			if (result === ImportChoice.Add) {
				return this.workspaceEditingService.addFolders(folders);
			}

			// Copy resources
			if (result === ImportChoice.Copy) {
				return this.importResources(target, files, token);
			}
		}

		// Handle dropped files (only support FileStat as target)
		else if (target instanceof ExplorerItem) {
			return this.importResources(target, files, token);
		}
	}

	private async importResources(target: ExplorerItem, resources: URI[], token: CancellationToken): Promise<void> {
		if (resources && resources.length > 0) {

			// Resolve target to check for name collisions and ask user
			const targetStat = await this.fileService.resolve(target.resource);

			if (token.isCancellationRequested) {
				return;
			}

			// Check for name collisions
			const targetNames = new Set<string>();
			const caseSensitive = this.fileService.hasCapability(target.resource, FileSystemProviderCapabilities.PathCaseSensitive);
			if (targetStat.children) {
				targetStat.children.forEach(child => {
					targetNames.add(caseSensitive ? child.name : child.name.toLowerCase());
				});
			}


			let inaccessibleFileCount = 0;
			const resourcesFiltered = coalesce((await Promises.settled(resources.map(async resource => {
				const fileDoesNotExist = !(await this.fileService.exists(resource));
				if (fileDoesNotExist) {
					inaccessibleFileCount++;
					return undefined;
				}

				if (targetNames.has(caseSensitive ? basename(resource) : basename(resource).toLowerCase())) {
					const confirmationResult = await this.dialogService.confirm(getFileOverwriteConfirm(basename(resource)));
					if (!confirmationResult.confirmed) {
						return undefined;
					}
				}

				return resource;
			}))));

			if (inaccessibleFileCount > 0) {
				this.notificationService.error(inaccessibleFileCount > 1 ? localize('filesInaccessible', "Some or all of the dropped files could not be accessed for import.") : localize('fileInaccessible', "The dropped file could not be accessed for import."));
			}

			// Copy resources through bulk edit API
			const resourceFileEdits = resourcesFiltered.map(resource => {
				const sourceFileName = basename(resource);
				const targetFile = joinPath(target.resource, sourceFileName);

				return new ResourceFileEdit(resource, targetFile, { overwrite: true, copy: true });
			});

			const undoLevel = this.configurationService.getValue<IFilesConfiguration>().explorer.confirmUndo;
			await this.explorerService.applyBulkEdit(resourceFileEdits, {
				undoLabel: resourcesFiltered.length === 1 ?
					localize({ comment: ['substitution will be the name of the file that was imported'], key: 'importFile' }, "Import {0}", basename(resourcesFiltered[0])) :
					localize({ comment: ['substitution will be the number of files that were imported'], key: 'importnFile' }, "Import {0} resources", resourcesFiltered.length),
				progressLabel: resourcesFiltered.length === 1 ?
					localize({ comment: ['substitution will be the name of the file that was copied'], key: 'copyingFile' }, "Copying {0}", basename(resourcesFiltered[0])) :
					localize({ comment: ['substitution will be the number of files that were copied'], key: 'copyingnFile' }, "Copying {0} resources", resourcesFiltered.length),
				progressLocation: ProgressLocation.Window,
				confirmBeforeUndo: undoLevel === UndoConfirmLevel.Verbose || undoLevel === UndoConfirmLevel.Default,
			});

			// if we only add one file, just open it directly
			const autoOpen = this.configurationService.getValue<IFilesConfiguration>().explorer.autoOpenDroppedFile;
			if (autoOpen && resourceFileEdits.length === 1) {
				const item = this.explorerService.findClosest(resourceFileEdits[0].newResource!);
				if (item && !item.isDirectory) {
					this.editorService.openEditor({ resource: item.resource, options: { pinned: true } });
				}
			}
		}
	}
}

//#endregion

//#region Download (web, native)

const downloadProgressMessages: ITransferProgressMessages = {
	manySmallFiles: (filesTransferred, filesTotal, rate) => localize('downloadProgressSmallMany', "{0} of {1} files ({2}/s)", filesTransferred, filesTotal, rate),
	largeFile: (name, bytesTransferred, size, rate) => localize('downloadProgressLarge', "{0} ({1} of {2}, {3}/s)", name, bytesTransferred, size, rate)
};

interface IDownloadOperation {
	reporter: TransferProgressReporter;

	fileBytesDownloaded: number;
}

interface IDownloadSource {
	readonly resource: URI;
	readonly name: string;
	readonly isDirectory: boolean;
}

export class FileDownload {

	private static readonly LAST_USED_DOWNLOAD_PATH_STORAGE_KEY = 'workbench.explorer.downloadPath';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IProgressService private readonly progressService: IProgressService,
		@ILogService private readonly logService: ILogService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IStorageService private readonly storageService: IStorageService
	) {
	}

	download(source: readonly IDownloadSource[]): Promise<void> {
		const cts = new CancellationTokenSource();

		// Indicate progress globally
		const downloadPromise = this.progressService.withProgress(
			{
				location: ProgressLocation.Window,
				delay: 800,
				cancellable: true,
				title: localize('downloadingFiles', "Downloading")
			},
			async progress => this.doDownload(source, progress, cts),
			() => cts.dispose(true)
		);

		// Also indicate progress in the files view
		this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => downloadPromise);

		return downloadPromise;
	}

	private async doDownload(sources: readonly IDownloadSource[], progress: IProgress<IProgressStep>, cts: CancellationTokenSource): Promise<void> {

		// Web: use DOM APIs to download files with optional support
		// for folders and large files
		if (isWeb) {
			for (const source of sources) {
				if (cts.token.isCancellationRequested) {
					return;
				}

				await this.doDownloadBrowser(source.resource, progress, cts);
			}

			return;
		}

		// Native: use the file service to get at the contents. Resolve the
		// number of files and the total number of bytes across the entire
		// selection upfront, so that a single reporter can report accurate
		// determinate progress over all sources.
		const fileSizes = new ResourceMap<number>();
		let filesTotal = 0;
		let totalBytes = 0;
		for (const source of sources) {
			const sizes = await this.resolveDownloadSize(source.resource, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}

			filesTotal += sizes.filesTotal;
			totalBytes += sizes.totalBytes;
			sizes.fileSizes.forEach((size, resource) => fileSizes.set(resource, size));
		}

		const reporter = new TransferProgressReporter(filesTotal, totalBytes, downloadProgressMessages, progress);
		try {
			for (const source of sources) {
				if (cts.token.isCancellationRequested) {
					return;
				}

				await this.doDownloadNative(source, reporter, fileSizes, progress, cts);
			}
		} finally {
			reporter.dispose();
		}
	}

	private async doDownloadBrowser(resource: URI, progress: IProgress<IProgressStep>, cts: CancellationTokenSource): Promise<void> {
		const stat = await this.fileService.resolve(resource, { resolveMetadata: true });

		if (cts.token.isCancellationRequested) {
			return;
		}

		const maxBlobDownloadSize = 32 * ByteSize.MB; // avoid to download via blob-trick >32MB to avoid memory pressure
		const preferFileSystemAccessWebApis = stat.isDirectory || stat.size > maxBlobDownloadSize;

		// Folder: use FS APIs to download files and folders if available and preferred
		const activeWindow = getActiveWindow();
		if (preferFileSystemAccessWebApis && WebFileSystemAccess.supported(activeWindow)) {
			const operation: IDownloadOperation = {
				reporter: new TransferProgressReporter(stat.isDirectory ? 0 : 1 /* folders increment filesTotal within downloadFolder method */, undefined, downloadProgressMessages, progress),

				fileBytesDownloaded: 0
			};

			try {
				const parentFolder: FileSystemDirectoryHandle = await activeWindow.showDirectoryPicker();

				if (stat.isDirectory) {
					const targetFolder = await parentFolder.getDirectoryHandle(stat.name, { create: true });
					await this.downloadFolderBrowser(stat, targetFolder, operation, cts.token);
				} else {
					await this.downloadFileBrowser(parentFolder, stat, operation, cts.token);
				}
			} catch (error) {
				this.logService.warn(error);
				cts.cancel(); // `showDirectoryPicker` will throw an error when the user cancels
			} finally {
				operation.reporter.dispose();
			}
		}

		// File: use traditional download to circumvent browser limitations
		else if (stat.isFile) {
			let bufferOrUri: Uint8Array | URI;
			try {
				bufferOrUri = (await this.fileService.readFile(stat.resource, { limits: { size: maxBlobDownloadSize } }, cts.token)).value.buffer;
			} catch (error) {
				bufferOrUri = FileAccess.uriToBrowserUri(stat.resource);
			}

			if (!cts.token.isCancellationRequested) {
				triggerDownload(bufferOrUri, stat.name);
			}
		}
	}

	private async downloadFileBufferedBrowser(resource: URI, target: FileSystemWritableFileStream, operation: IDownloadOperation, token: CancellationToken): Promise<void> {
		const contents = await this.fileService.readFileStream(resource, undefined, token);
		if (token.isCancellationRequested) {
			target.close();
			return;
		}

		return new Promise<void>((resolve, reject) => {
			const sourceStream = contents.value;

			const disposables = new DisposableStore();
			disposables.add(toDisposable(() => target.close()));

			disposables.add(createSingleCallFunction(token.onCancellationRequested)(() => {
				disposables.dispose();
				reject(canceled());
			}));

			listenStream(sourceStream, {
				onData: data => {
					target.write(data.buffer as Uint8Array<ArrayBuffer>);
					this.reportProgress(contents.name, contents.size, data.byteLength, operation);
				},
				onError: error => {
					disposables.dispose();
					reject(error);
				},
				onEnd: () => {
					disposables.dispose();
					resolve();
				}
			}, token);
		});
	}

	private async downloadFileUnbufferedBrowser(resource: URI, target: FileSystemWritableFileStream, operation: IDownloadOperation, token: CancellationToken): Promise<void> {
		const contents = await this.fileService.readFile(resource, undefined, token);
		if (!token.isCancellationRequested) {
			target.write(contents.value.buffer as Uint8Array<ArrayBuffer>);
			this.reportProgress(contents.name, contents.size, contents.value.byteLength, operation);
		}

		target.close();
	}

	private async downloadFileBrowser(targetFolder: FileSystemDirectoryHandle, file: IFileStatWithMetadata, operation: IDownloadOperation, token: CancellationToken): Promise<void> {

		// Report progress
		operation.reporter.startFile();
		operation.fileBytesDownloaded = 0; // reset for this file
		this.reportProgress(file.name, 0, 0, operation);

		// Start to download
		const targetFile = await targetFolder.getFileHandle(file.name, { create: true });
		const targetFileWriter = await targetFile.createWritable();

		// For large files, write buffered using streams
		if (file.size > ByteSize.MB) {
			return this.downloadFileBufferedBrowser(file.resource, targetFileWriter, operation, token);
		}

		// For small files prefer to write unbuffered to reduce overhead
		return this.downloadFileUnbufferedBrowser(file.resource, targetFileWriter, operation, token);
	}

	private async downloadFolderBrowser(folder: IFileStatWithMetadata, targetFolder: FileSystemDirectoryHandle, operation: IDownloadOperation, token: CancellationToken): Promise<void> {
		if (folder.children) {
			operation.reporter.addFiles(folder.children.filter(child => child.isFile).length);

			for (const child of folder.children) {
				if (token.isCancellationRequested) {
					return;
				}

				if (child.isFile) {
					await this.downloadFileBrowser(targetFolder, child, operation, token);
				} else {
					const childFolder = await targetFolder.getDirectoryHandle(child.name, { create: true });
					const resolvedChildFolder = await this.fileService.resolve(child.resource, { resolveMetadata: true });

					await this.downloadFolderBrowser(resolvedChildFolder, childFolder, operation, token);
				}
			}
		}
	}

	private reportProgress(name: string, fileSize: number, bytesDownloaded: number, operation: IDownloadOperation): void {
		operation.fileBytesDownloaded += bytesDownloaded;

		operation.reporter.report(name, fileSize, operation.fileBytesDownloaded, bytesDownloaded);
	}

	private async doDownloadNative(explorerItem: IDownloadSource, reporter: TransferProgressReporter, fileSizes: ResourceMap<number>, progress: IProgress<IProgressStep>, cts: CancellationTokenSource): Promise<void> {
		progress.report({ message: explorerItem.name });

		let defaultUri: URI;
		const lastUsedDownloadPath = this.storageService.get(FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY, StorageScope.APPLICATION);
		if (lastUsedDownloadPath) {
			defaultUri = joinPath(URI.file(lastUsedDownloadPath), explorerItem.name);
		} else {
			defaultUri = joinPath(
				explorerItem.isDirectory ?
					await this.fileDialogService.defaultFolderPath(Schemas.file) :
					await this.fileDialogService.defaultFilePath(Schemas.file),
				explorerItem.name
			);
		}

		const destination = await this.fileDialogService.showSaveDialog({
			availableFileSystems: [Schemas.file],
			saveLabel: localize('downloadButton', "Download"),
			title: localize('chooseWhereToDownload', "Choose Where to Download"),
			defaultUri
		});

		if (destination) {

			// Remember as last used download folder
			this.storageService.store(FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY, dirname(destination).fsPath, StorageScope.APPLICATION, StorageTarget.MACHINE);

			// Remember whether the destination existed upfront: when the
			// download is cancelled before any content was transferred, a
			// pre-existing destination must not be deleted by the cleanup
			const destinationExisted = await this.fileService.exists(destination);

			// Perform download, reporting progress as bytes are being copied.
			// The file service reports the total number of bytes copied per
			// file, so we keep track of the last reported value per file to
			// compute the delta.
			const lastBytesCopied = new ResourceMap<number>();
			let downloadStarted = false;
			try {
				await this.fileService.copy(explorerItem.resource, destination, true, ({ resource, bytesCopied }) => {
					downloadStarted = true;

					let last = lastBytesCopied.get(resource);
					if (last === undefined) {
						reporter.startFile();
						last = 0;
					}
					lastBytesCopied.set(resource, bytesCopied);

					reporter.report(basename(resource), fileSizes.get(resource) ?? 0, bytesCopied, bytesCopied - last);
				}, cts.token);
			} catch (error) {
				if (!isCancellationError(error)) {
					throw error;
				}

				// Best effort cleanup of partially downloaded files and
				// folders when the user canceled, unless the destination
				// existed before and the copy never got to transfer any
				// content to it
				if (!destinationExisted || downloadStarted) {
					try {
						await this.fileService.del(destination, { recursive: true });
					} catch (error) {
						this.logService.warn(error);
					}
				}
			} finally {
				reporter.flush();
			}
		} else {
			cts.cancel(); // User canceled a download. In case there were multiple files selected we should cancel the remainder of the prompts #86100
		}
	}

	private async resolveDownloadSize(resource: URI, token: CancellationToken): Promise<{ filesTotal: number; totalBytes: number; fileSizes: ResourceMap<number> }> {
		const fileSizes = new ResourceMap<number>();

		let filesTotal = 0;
		let totalBytes = 0;

		const addFile = (resource: URI, size: number): void => {
			fileSizes.set(resource, size);
			filesTotal++;
			totalBytes += size;
		};

		const resolveFolder = async (stat: IFileStatWithMetadata): Promise<void> => {
			if (token.isCancellationRequested || !stat.children) {
				return;
			}

			await Promises.settled(stat.children.map(async child => {
				if (child.isDirectory) {
					await resolveFolder(await this.fileService.resolve(child.resource, { resolveMetadata: true }));
				} else {
					addFile(child.resource, child.size);
				}
			}));
		};

		const stat = await this.fileService.resolve(resource, { resolveMetadata: true });
		if (stat.isDirectory) {
			await resolveFolder(stat);
		} else {
			addFile(stat.resource, stat.size);
		}

		return { filesTotal, totalBytes, fileSizes };
	}
}

//#endregion

//#region Helpers

export function getFileOverwriteConfirm(name: string): IConfirmation {
	return {
		message: localize('confirmOverwrite', "A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?", name),
		detail: localize('irreversible', "This action is irreversible!"),
		primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
		type: 'warning'
	};
}

export function getMultipleFilesOverwriteConfirm(files: URI[]): IConfirmation {
	if (files.length > 1) {
		return {
			message: localize('confirmManyOverwrites', "The following {0} files and/or folders already exist in the destination folder. Do you want to replace them?", files.length),
			detail: getFileNamesMessage(files) + '\n' + localize('irreversible', "This action is irreversible!"),
			primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
			type: 'warning'
		};
	}

	return getFileOverwriteConfirm(basename(files[0]));
}

//#endregion
