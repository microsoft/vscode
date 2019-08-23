/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { UriComponents, URI } from 'vs/base/common/uri';
import { IRecentlyOpened, isRecentFolder } from 'vs/platform/history/common/history';
import { ILogService } from 'vs/platform/log/common/log';

interface ISerializedRecentlyOpened {
	workspaces3: Array<ISerializedWorkspace | string>; // workspace or URI.toString() // added in 1.32
	workspaceLabels?: Array<string | null>; // added in 1.33
	files2: string[]; // files as URI.toString() // added in 1.32
	fileLabels?: Array<string | null>; // added in 1.33
}

interface ILegacySerializedRecentlyOpened {
	workspaces2: Array<ILegacySerializedWorkspace | string>; // legacy, configPath as file path
	workspaces: Array<ILegacySerializedWorkspace | string | UriComponents>; // legacy (UriComponents was also supported for a few insider builds)
	files: string[]; // files as paths
}

interface ISerializedWorkspace { id: string; configURIPath: string; }
interface ILegacySerializedWorkspace { id: string; configPath: string; }

function isLegacySerializedWorkspace(curr: any): curr is ILegacySerializedWorkspace {
	return typeof curr === 'object' && typeof curr['id'] === 'string' && typeof curr['configPath'] === 'string';
}

function isUriComponents(curr: any): curr is UriComponents {
	return curr && typeof curr['path'] === 'string' && typeof curr['scheme'] === 'string';
}

export type RecentlyOpenedStorageData = object;

export function restoreRecentlyOpened(data: RecentlyOpenedStorageData | undefined, logService: ILogService): IRecentlyOpened {
	const result: IRecentlyOpened = { workspaces: [], files: [] };
	if (data) {
		const restoreGracefully = function <T>(entries: T[], func: (entry: T, index: number) => void) {
			for (let i = 0; i < entries.length; i++) {
				try {
					func(entries[i], i);
				} catch (e) {
					logService.warn(`Error restoring recent entry ${JSON.stringify(entries[i])}: ${e.toString()}. Skip entry.`);
				}
			}
		};

		const storedRecents = data as ISerializedRecentlyOpened & ILegacySerializedRecentlyOpened;
		if (Array.isArray(storedRecents.workspaces3)) {
			restoreGracefully(storedRecents.workspaces3, (workspace, i) => {
				const label: string | undefined = (Array.isArray(storedRecents.workspaceLabels) && storedRecents.workspaceLabels[i]) || undefined;
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configURIPath === 'string') {
					result.workspaces.push({ label, workspace: { id: workspace.id, configPath: URI.parse(workspace.configURIPath) } });
				} else if (typeof workspace === 'string') {
					result.workspaces.push({ label, folderUri: URI.parse(workspace) });
				}
			});
		} else if (Array.isArray(storedRecents.workspaces2)) {
			restoreGracefully(storedRecents.workspaces2, workspace => {
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configPath === 'string') {
					result.workspaces.push({ workspace: { id: workspace.id, configPath: URI.file(workspace.configPath) } });
				} else if (typeof workspace === 'string') {
					result.workspaces.push({ folderUri: URI.parse(workspace) });
				}
			});
		} else if (Array.isArray(storedRecents.workspaces)) {
			// TODO@martin legacy support can be removed at some point (6 month?)
			// format of 1.25 and before
			restoreGracefully(storedRecents.workspaces, workspace => {
				if (typeof workspace === 'string') {
					result.workspaces.push({ folderUri: URI.file(workspace) });
				} else if (isLegacySerializedWorkspace(workspace)) {
					result.workspaces.push({ workspace: { id: workspace.id, configPath: URI.file(workspace.configPath) } });
				} else if (isUriComponents(window)) {
					// added by 1.26-insiders
					result.workspaces.push({ folderUri: URI.revive(<UriComponents>workspace) });
				}
			});
		}
		if (Array.isArray(storedRecents.files2)) {
			restoreGracefully(storedRecents.files2, (file, i) => {
				const label: string | undefined = (Array.isArray(storedRecents.fileLabels) && storedRecents.fileLabels[i]) || undefined;
				if (typeof file === 'string') {
					result.files.push({ label, fileUri: URI.parse(file) });
				}
			});
		} else if (Array.isArray(storedRecents.files)) {
			restoreGracefully(storedRecents.files, file => {
				if (typeof file === 'string') {
					result.files.push({ fileUri: URI.file(file) });
				}
			});
		}
	}

	return result;
}

export function toStoreData(recents: IRecentlyOpened): RecentlyOpenedStorageData {
	const serialized: ISerializedRecentlyOpened = { workspaces3: [], files2: [] };

	let hasLabel = false;
	const workspaceLabels: (string | null)[] = [];
	for (const recent of recents.workspaces) {
		if (isRecentFolder(recent)) {
			serialized.workspaces3.push(recent.folderUri.toString());
		} else {
			serialized.workspaces3.push({ id: recent.workspace.id, configURIPath: recent.workspace.configPath.toString() });
		}
		workspaceLabels.push(recent.label || null);
		hasLabel = hasLabel || !!recent.label;
	}
	if (hasLabel) {
		serialized.workspaceLabels = workspaceLabels;
	}

	hasLabel = false;
	const fileLabels: (string | null)[] = [];
	for (const recent of recents.files) {
		serialized.files2.push(recent.fileUri.toString());
		fileLabels.push(recent.label || null);
		hasLabel = hasLabel || !!recent.label;
	}
	if (hasLabel) {
		serialized.fileLabels = fileLabels;
	}

	return serialized;
}
