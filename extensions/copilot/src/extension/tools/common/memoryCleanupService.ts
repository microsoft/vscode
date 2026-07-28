/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Service that manages cleanup of stale memory files.
 * Tracks access times and periodically removes files older than the retention period.
 */
export interface IMemoryCleanupService {
	readonly _serviceBrand: undefined;

	/** Marks a memory resource as recently accessed. */
	markAccessed(uri: URI): void;

	/** Starts the cleanup scheduler if not already running. */
	start(): void;

	/** Checks if a URI is within the memory storage directory. */
	isMemoryUri(uri: URI): boolean;
}

export const IMemoryCleanupService = createServiceIdentifier<IMemoryCleanupService>('IMemoryCleanupService');

/**
 * Retention period in milliseconds (14 days).
 */
const RETENTION_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Base directory for memory storage.
 */
const MEMORY_BASE_DIR = 'memory-tool/memories';

export class MemoryCleanupService extends Disposable implements IMemoryCleanupService {
	declare readonly _serviceBrand: undefined;

	private readonly baseStorageUri: URI | undefined;
	private readonly globalBaseStorageUri: URI | undefined;
	private readonly accessTimestamps = new ResourceMap<number>();
	private started = false;

	constructor(
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.baseStorageUri = this.extensionContext.storageUri
			? URI.joinPath(this.extensionContext.storageUri, MEMORY_BASE_DIR)
			: undefined;

		this.globalBaseStorageUri = this.extensionContext.globalStorageUri
			? URI.joinPath(this.extensionContext.globalStorageUri, MEMORY_BASE_DIR)
			: undefined;
	}

	override dispose(): void {
		super.dispose();
	}

	markAccessed(uri: URI): void {
		this.accessTimestamps.set(uri, Date.now());
	}

	isMemoryUri(uri: URI): boolean {
		if (this.baseStorageUri) {
			const basePath = this.baseStorageUri.path.toLowerCase();
			const uriPath = uri.path.toLowerCase();
			if (uri.scheme === this.baseStorageUri.scheme && uriPath.startsWith(basePath)) {
				return true;
			}
		}
		if (this.globalBaseStorageUri) {
			const basePath = this.globalBaseStorageUri.path.toLowerCase();
			const uriPath = uri.path.toLowerCase();
			if (uri.scheme === this.globalBaseStorageUri.scheme && uriPath.startsWith(basePath)) {
				return true;
			}
		}
		return false;
	}

	start(): void {
		if (this.started) {
			return;
		}
		this.started = true;

		// Run cleanup on startup (in background)
		this.cleanupStaleResources().catch(err => {
			this.logService.warn(`[MemoryCleanupService] Cleanup error: ${err}`);
		});
	}

	private async cleanupStaleResources(): Promise<void> {
		if (!this.baseStorageUri) {
			return;
		}

		try {
			// Check if base directory exists
			try {
				const stat = await this.fileSystem.stat(this.baseStorageUri);
				if (stat.type !== FileType.Directory) {
					return;
				}
			} catch {
				// Directory doesn't exist, nothing to clean up
				return;
			}

			const now = Date.now();
			const cutoffTime = now - RETENTION_PERIOD_MS;

			// Read all session directories (exclude 'repo' which is managed separately)
			const entries = await this.fileSystem.readDirectory(this.baseStorageUri);
			const sessionDirs = entries.filter(([name, type]) => type === FileType.Directory && name !== 'repo');

			for (const [sessionName] of sessionDirs) {
				const sessionUri = URI.joinPath(this.baseStorageUri, sessionName);
				await this.cleanupSessionDirectory(sessionUri, cutoffTime);
			}

			// Clean up empty session directories
			for (const [sessionName] of sessionDirs) {
				const sessionUri = URI.joinPath(this.baseStorageUri, sessionName);
				try {
					const sessionEntries = await this.fileSystem.readDirectory(sessionUri);
					if (sessionEntries.length === 0) {
						await this.fileSystem.delete(sessionUri, { recursive: true });
						this.logService.debug(`[MemoryCleanupService] Deleted empty session directory: ${sessionUri.fsPath}`);
					}
				} catch {
					// Ignore errors when checking/deleting empty directories
				}
			}
		} catch (error) {
			this.logService.warn(`[MemoryCleanupService] Error during cleanup: ${error}`);
		}
	}

	private async cleanupSessionDirectory(sessionUri: URI, cutoffTime: number): Promise<void> {
		try {
			const entries = await this.fileSystem.readDirectory(sessionUri);

			for (const [name, type] of entries) {
				const entryUri = URI.joinPath(sessionUri, name);

				// Check in-memory timestamp first
				const accessTime = this.accessTimestamps.get(entryUri);
				if (accessTime && accessTime >= cutoffTime) {
					continue; // Still fresh
				}

				// Fall back to file system mtime
				try {
					const stat = await this.fileSystem.stat(entryUri);
					if (stat.mtime >= cutoffTime) {
						this.accessTimestamps.set(entryUri, stat.mtime);
						continue; // Still fresh
					}
				} catch {
					// If we can't stat, assume it's stale
				}

				// Delete stale entry
				try {
					await this.fileSystem.delete(entryUri, { recursive: type === FileType.Directory });
					this.accessTimestamps.delete(entryUri);
					this.logService.debug(`[MemoryCleanupService] Deleted stale memory file: ${entryUri.fsPath}`);
				} catch (error) {
					this.logService.warn(`[MemoryCleanupService] Failed to delete ${entryUri.fsPath}: ${error}`);
				}
			}
		} catch (error) {
			this.logService.debug(`[MemoryCleanupService] Error cleaning session directory ${sessionUri.fsPath}: ${error}`);
		}
	}
}
