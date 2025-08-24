/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { CommonUtils } from '../utils/commonUtils.js';

export interface BrowseResult {
	success: boolean;
	directory?: string;
	file?: string;
	error?: string;
}

export interface FileSystemItem {
	path: string;
	name: string;
	isDirectory: boolean;
	size?: number;
	lastModified?: number;
}

/**
 * File browser for Erdos AI to provide file/directory selection
 */
export class FileBrowser extends Disposable {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService
	) {
		super();
	}

	/**
	 */
	async browseDirectory(): Promise<BrowseResult> {
		try {
			// Use Erdos's dialog service to show directory picker
			const result = await this.fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: 'Select Working Directory',
				openLabel: 'Browse'
			});

			if (result && result.length > 0) {
				const selectedPath = result[0].fsPath;
				
				// Verify the directory exists and is accessible
				try {
					const stat = await this.fileService.stat(result[0]);
					if (stat.isDirectory) {
						return {
							success: true,
							directory: selectedPath
						};
					} else {
						return {
							success: false,
							error: 'Selected path is not a directory'
						};
					}
				} catch (error) {
					return {
						success: false,
						error: `Cannot access directory: ${error instanceof Error ? error.message : 'Unknown error'}`
					};
				}
			} else {
				return {
					success: false,
					error: 'No directory selected'
				};
			}
		} catch (error) {
			return {
				success: false,
				error: `Error opening directory browser: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 */
	async browseForFile(): Promise<FileSystemItem | null> {
		try {
			// Use Erdos's dialog service to show file picker
			const result = await this.fileDialogService.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: true,
				canSelectMany: false,
				title: 'Select File or Directory',
				openLabel: 'Select'
			});

			if (result && result.length > 0) {
				const selectedUri = result[0];
				const selectedPath = selectedUri.fsPath;
				
				try {
					const stat = await this.fileService.stat(selectedUri);
					
					return {
						path: selectedPath,
						name: CommonUtils.getBasename(selectedUri.path) || selectedPath,
						isDirectory: stat.isDirectory,
						size: stat.size,
						lastModified: stat.mtime
					};
				} catch (error) {
					// Even if we can't stat the file, return the basic info
					// This allows for remote files that might be accessible in other contexts
					return {
						path: selectedPath,
						name: CommonUtils.getBasename(selectedUri.path) || selectedPath,
						isDirectory: false
					};
				}
			}

			return null;
		} catch (error) {
			console.error('Error browsing for file:', error);
			return null;
		}
	}

	/**
	 * List files in a directory
	 */
	async listDirectory(directoryPath: string): Promise<FileSystemItem[]> {
		try {
			const uri = URI.file(directoryPath);
			const stat = await this.fileService.resolve(uri);
			
			const items: FileSystemItem[] = [];
			
			if (stat.children) {
				for (const child of stat.children) {
					const childUri = child.resource;
					try {
					const childStat = await this.fileService.stat(childUri);
					items.push({
						path: childUri.fsPath,
						name: child.name,
						isDirectory: childStat.isDirectory,
						size: childStat.size,
						lastModified: childStat.mtime
					});
				} catch {
					// If we can't stat the item, include it with basic info
					items.push({
						path: childUri.fsPath,
						name: child.name,
						isDirectory: child.isDirectory // FileType.Directory
					});
				}
			}
			}

			return items.sort((a, b) => {
				// Sort directories first, then files, alphabetically
				if (a.isDirectory !== b.isDirectory) {
					return a.isDirectory ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
		} catch (error) {
			console.error('Error listing directory:', error);
			return [];
		}
	}

	/**
	 * Get current workspace root directory
	 */
	getCurrentWorkspaceDirectory(): string | null {
		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.folders.length > 0) {
			return workspace.folders[0].uri.fsPath;
		}
		return null;
	}

	/**
	 * Check if a path exists and is accessible
	 */
	async pathExists(path: string): Promise<boolean> {
		try {
			const uri = URI.file(path);
			await this.fileService.stat(uri);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Resolve a path to absolute form, expanding ~
	 */
	resolvePath(path: string): string {
		const workspaceRoot = this.getCurrentWorkspaceDirectory() || undefined;
		return CommonUtils.resolvePath(path, workspaceRoot);
	}

	/**
	 * Get file/directory information
	 */
	async getFileInfo(path: string): Promise<FileSystemItem | null> {
		try {
			const resolvedPath = this.resolvePath(path);
			const uri = URI.file(resolvedPath);
			const stat = await this.fileService.stat(uri);
			
			return {
				path: resolvedPath,
				name: CommonUtils.getBasename(uri.path) || resolvedPath,
				isDirectory: stat.isDirectory,
				size: stat.size,
				lastModified: stat.mtime
			};
		} catch {
			return null;
		}
	}
}