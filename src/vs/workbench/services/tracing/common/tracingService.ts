/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ITracingService } from './tracing.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js'; // Adjust path as needed
import { URI } from '../../../../base/common/uri.js'; // Adjust path as needed
import {
	IFileService,
	FileSystemProviderErrorCode,
	IFileContent,
	toFileSystemProviderErrorCode,
	FileOperationError,
	FileOperationResult,
	FileChangeType
} from '../../../../platform/files/common/files.js'; // Adjust path as needed
import { CancellationToken } from '../../../../base/common/cancellation.js'; // Adjust path as needed


export class TracingService extends Disposable implements ITracingService {

	declare readonly _serviceBrand: undefined;

	private readonly logPath: URI;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkspacesService private readonly workspaceService: IWorkspacesService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.logPath = URI.joinPath(this.environmentService.workspaceStorageHome, this.contextService?.getWorkspace()?.id, 'datacurve-trace.log');
		// Create the log file if it doesn't exist
		this._register(this.fileService.onDidFilesChange(async e => {
			// Check if our log file was deleted and recreate it if needed
			if (e.contains(this.logPath, FileChangeType.DELETED)) {
				await this.ensureLogFileExists();
			}
		}));

		// Ensure log file exists on initialization
		this.ensureLogFileExists().catch(err => {
			console.error('Failed to create initial trace log file:', err);
		});
	}

	async ensureLogFileExists(): Promise<void> {
		try {
			// Check if the file exists
			const fileExists = await this.fileService.exists(this.logPath);

			if (!fileExists) {
				// Create the file if it doesn't exist
				await this.fileService.createFile(this.logPath, VSBuffer.fromString(''));
			}
		} catch (err) {
			console.error('Failed to ensure trace log file exists:', err);
			throw err;
		}
	}

	async recordTrace(trace: object): Promise<void> {
		console.log('Tracing workspace storage home:', this.contextService?.getWorkspace()?.id);
		console.log('Tracing storageService home:', this.storageService.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE));
		console.log('Tracing environment service:', this.environmentService.workspaceStorageHome);
		console.log('Tracing storage service:', this.storageService);
		console.log('Tracing context service:', this.contextService);
		console.log('Tracing workspace service:', this.workspaceService);

		const logEntry = `${JSON.stringify(trace)}\n`;
		console.log('Tracing log path:', this.logPath);
		try {
			await this.appendToFileWithCheck(this.fileService, this.logPath, VSBuffer.fromString(logEntry));
			console.log(`Successfully appended to ${this.logPath}`);
		} catch (err) {
			console.error(`Append operation failed:`, err);
			// Handle the failure appropriately in your application
		}
	}


	/**
	 * Appends content to a file using IFileService, with ETag/MTime checking
	 * to detect potential concurrent modifications.
	 *
	 * @param fileService The IFileService instance.
	 * @param resource The URI of the file to append to.
	 * @param newContent The content to append.
	 * @param token Optional cancellation token.
	 * @returns Promise<void> that resolves when append is complete or rejects on error.
	 * @throws {FileOperationError} if the write fails due to modification conflict or other file errors.
	 */
	async appendToFileWithCheck(
		fileService: IFileService,
		resource: URI,
		newContent: VSBuffer,
		token?: CancellationToken
	): Promise<void> {

		let etag: string | undefined = undefined;
		let mtime: number | undefined = undefined;
		let existingContent = VSBuffer.alloc(0);

		// 1. Attempt to read the existing file and get its state (ETag/MTime)
		try {
			const fileContent: IFileContent = await fileService.readFile(resource, { etag: etag }, token);
			existingContent = fileContent.value;
			etag = fileContent.etag; // Store etag for write check
			mtime = fileContent.mtime; // Store mtime for write check (some providers might use one or the other)

		} catch (error: any) {
			// Handle case where file doesn't exist yet - we can proceed to create it
			if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
				// Re-throw unexpected errors (permissions, etc.)
				console.error(`Error reading file ${resource.toString()} before append:`, error);
				throw error;
			}
			// If file not found, existingContent is empty, etag/mtime remain undefined.
			// The writeFile call below will handle creation.
		}

		if (token?.isCancellationRequested) {
			console.log(`Append operation cancelled for ${resource.toString()} before writing.`);
			return; // Or throw a CancellationError
		}

		// 2. Concatenate existing content with new content
		const combinedContent = VSBuffer.concat([existingContent, newContent]);

		// 3. Attempt to write the combined content, providing the ETag/MTime
		try {
			await fileService.writeFile(resource, combinedContent, {
				etag: etag,        // Pass the etag from the read operation
				mtime: mtime,      // Pass the mtime from the read operation (optional, but good practice)
				unlock: false,     // Optional: set to true if you need to handle locked files
			});
			// Write successful
		} catch (error: any) {
			// Handle potential modification conflict
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
				// The file was changed between our read and write attempt
				console.warn(`File ${resource.toString()} was modified concurrently during append operation. Append failed.`);
				// Strategy here could be to retry the whole append process (read again, concat, write),
				// or simply fail and inform the user/caller.
				throw new FileOperationError(`Concurrent modification detected for ${resource.toString()}. Append aborted.`, FileOperationResult.FILE_MODIFIED_SINCE);
			} else {
				// Handle other potential write errors
				console.error(`Error writing appended content to ${resource.toString()}:`, error);
				throw error; // Re-throw other errors
			}
		}
	}
}
