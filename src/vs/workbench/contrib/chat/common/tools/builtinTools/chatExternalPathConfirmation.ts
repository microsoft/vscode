/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ObservableMemento, observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ConfirmedReason, ToolConfirmKind } from '../../chatService/chatService.js';
import {
	ILanguageModelToolConfirmationActions,
	ILanguageModelToolConfirmationContribution,
	ILanguageModelToolConfirmationContributionQuickTreeItem,
	ILanguageModelToolConfirmationRef
} from '../languageModelToolsConfirmationService.js';

const workspaceAllowlistMemento = observableMemento<readonly string[]>({
	key: 'chat.externalPath.workspaceAllowlist',
	defaultValue: [],
	toStorage: value => JSON.stringify(value),
	fromStorage: value => {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	},
});

export interface IExternalPathInfo {
	path: string;
	isDirectory: boolean;
}

/**
 * Confirmation contribution for read_file and list_dir tools that allows users to approve
 * accessing paths outside the workspace, with an option to allow all access
 * from a containing folder for the current chat session.
 */
export class ChatExternalPathConfirmationContribution implements ILanguageModelToolConfirmationContribution, IDisposable {
	readonly canUseDefaultApprovals = false;

	private readonly _sessionFolderAllowlist = new ResourceMap<ResourceSet>();
	/** Cache of path URI -> resolved git root URI (or null if not in a repo) */
	private readonly _gitRootCache = new ResourceMap<URI | null>();
	private readonly _workspaceAllowlist?: ObservableMemento<readonly string[]>;

	constructor(
		private readonly _getPathInfo: (ref: ILanguageModelToolConfirmationRef) => IExternalPathInfo | undefined,
		private readonly _labelService: ILabelService,
		private readonly _findGitRoot?: (pathUri: URI) => Promise<URI | undefined>,
		storageService?: IStorageService,
		private readonly _pickFolder?: () => Promise<URI | undefined>,
	) {
		if (storageService) {
			this._workspaceAllowlist = workspaceAllowlistMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService);
		}
	}

	dispose(): void {
		this._workspaceAllowlist?.dispose();
	}

	private _getWorkspaceFolders(): ResourceSet {
		if (!this._workspaceAllowlist) {
			return new ResourceSet();
		}
		const set = new ResourceSet();
		for (const s of this._workspaceAllowlist.get()) {
			try {
				set.add(URI.parse(s));
			} catch {
				// ignore malformed URIs
			}
		}
		return set;
	}

	private _setWorkspaceFolders(folders: ResourceSet): void {
		if (!this._workspaceAllowlist) {
			return;
		}
		const uriStrings: string[] = [];
		for (const uri of folders) {
			uriStrings.push(uri.toString());
		}
		this._workspaceAllowlist.set(uriStrings, undefined);
	}

	getPreConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined {
		const pathInfo = this._getPathInfo(ref);
		if (!pathInfo) {
			return undefined;
		}

		// Parse the file path to a URI
		let pathUri: URI;
		try {
			pathUri = URI.file(pathInfo.path);
		} catch {
			return undefined;
		}

		// Check workspace-level allowlist
		const workspaceFolders = this._getWorkspaceFolders();
		for (const folderUri of workspaceFolders) {
			if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
				return { type: ToolConfirmKind.UserAction };
			}
		}

		// Check session-level allowlist
		if (ref.chatSessionResource) {
			const sessionFolders = this._sessionFolderAllowlist.get(ref.chatSessionResource);
			if (sessionFolders) {
				for (const folderUri of sessionFolders) {
					if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
						return { type: ToolConfirmKind.UserAction };
					}
				}
			}
		}

		return undefined;
	}

	getPreConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[] {
		const pathInfo = this._getPathInfo(ref);
		if (!pathInfo || !ref.chatSessionResource) {
			return [];
		}

		// Parse the path to a URI
		let pathUri: URI;
		try {
			pathUri = URI.file(pathInfo.path);
		} catch {
			return [];
		}

		// For directories, use the path itself; for files, use the parent directory
		const folderUri = pathInfo.isDirectory ? pathUri : dirname(pathUri);
		const sessionResource = ref.chatSessionResource;

		const actions: ILanguageModelToolConfirmationActions[] = [
			{
				label: localize('allowFolderSession', 'Allow this folder in this session'),
				detail: localize('allowFolderSessionDetail', 'Allow reading files from this folder without further confirmation in this chat session'),
				select: async () => {
					let folders = this._sessionFolderAllowlist.get(sessionResource);
					if (!folders) {
						folders = new ResourceSet();
						this._sessionFolderAllowlist.set(sessionResource, folders);
					}
					folders.add(folderUri);
					return true;
				}
			}
		];

		// If a git root finder is available, offer to allow the entire repository
		if (this._findGitRoot) {
			const findGitRoot = this._findGitRoot;
			const gitRootCache = this._gitRootCache;
			const allowlist = this._sessionFolderAllowlist;

			// Check if we already know the git root for this path (or that there is none)
			const cached = gitRootCache.get(pathUri);
			if (cached === null) {
				// Previously resolved: not in a git repository, don't show the option
			} else if (cached) {
				// Previously resolved: show with the known repo path
				actions.push({
					label: localize('allowRepoSession', 'Allow all files in this repository for this session'),
					detail: localize('allowRepoSessionDetail', 'Allow reading files from {0}', cached.fsPath),
					select: async () => {
						let folders = allowlist.get(sessionResource);
						if (!folders) {
							folders = new ResourceSet();
							allowlist.set(sessionResource, folders);
						}
						folders.add(cached);
						return true;
					}
				});
			} else {
				// Not yet resolved: show the option and resolve on selection
				actions.push({
					label: localize('allowRepoSession', 'Allow all files in this repository for this session'),
					detail: localize('allowRepoSessionDetailLookup', 'Looks up the containing git repository for this path'),
					select: async () => {
						const gitRootUri = await findGitRoot(pathUri);
						gitRootCache.set(pathUri, gitRootUri ?? null);
						let folders = allowlist.get(sessionResource);
						if (!folders) {
							folders = new ResourceSet();
							allowlist.set(sessionResource, folders);
						}
						// If we found the git root, allow the entire repo; otherwise fall back to just this folder
						folders.add(gitRootUri ?? folderUri);
						return true;
					}
				});
			}
		}

		return actions;
	}

	getManageActions(): ILanguageModelToolConfirmationContributionQuickTreeItem[] {
		const items: ILanguageModelToolConfirmationContributionQuickTreeItem[] = [];

		// Workspace-level entries (persisted)
		const workspaceFolders = this._getWorkspaceFolders();
		for (const folderUri of workspaceFolders) {
			items.push({
				label: this._labelService.getUriLabel(folderUri),
				description: localize('workspaceScope', "Workspace"),
				checked: true,
				onDidChangeChecked: (checked) => {
					if (!checked) {
						workspaceFolders.delete(folderUri);
						this._setWorkspaceFolders(workspaceFolders);
					} else {
						workspaceFolders.add(folderUri);
						this._setWorkspaceFolders(workspaceFolders);
					}
				},
			});
		}

		// Session-level entries (ephemeral)
		const allSessionFolders = new ResourceSet();
		for (const [, folders] of this._sessionFolderAllowlist) {
			for (const folder of folders) {
				allSessionFolders.add(folder);
			}
		}
		for (const folderUri of allSessionFolders) {
			const wasInSessions = [...this._sessionFolderAllowlist].filter(([, folders]) => folders.has(folderUri));
			items.push({
				label: this._labelService.getUriLabel(folderUri),
				description: localize('sessionScope', "Session"),
				checked: true,
				onDidChangeChecked: (checked) => {
					if (!checked) {
						for (const [, folders] of wasInSessions) {
							folders.delete(folderUri);
						}
					} else {
						for (const [, folders] of wasInSessions) {
							folders.add(folderUri);
						}
					}
				},
			});
		}

		// "Add Path..." option to add a new workspace-level folder
		if (this._pickFolder) {
			const pickFolder = this._pickFolder;
			items.push({
				pickable: false,
				label: localize('addPath', "Add Path..."),
				description: localize('addPathDescription', "Allow a folder in this workspace"),
				onDidOpen: async () => {
					const uri = await pickFolder();
					if (uri) {
						const folders = this._getWorkspaceFolders();
						folders.add(uri);
						this._setWorkspaceFolders(folders);
					}
				}
			});
		}

		return items;
	}

	reset(): void {
		this._sessionFolderAllowlist.clear();
		this._gitRootCache.clear();
		if (this._workspaceAllowlist) {
			this._workspaceAllowlist.set([], undefined);
		}
	}
}
