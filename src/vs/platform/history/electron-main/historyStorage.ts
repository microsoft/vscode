/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { UriComponents, URI } from 'vs/base/common/uri';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

interface ISerializedRecentlyOpened {
	workspaces3: Array<ISerializedWorkspace | string>; // workspace or URI.toString()
	files2: string[]; // files as URI.toString()
}

interface ILegacySerializedRecentlyOpened {
	workspaces2: Array<ILegacySerializedWorkspace | string>; // legacy, configPath as file path
	workspaces: Array<ILegacySerializedWorkspace | string | UriComponents>; // legacy (UriComponents was also supported for a few insider builds)
	files: string[]; // files as paths
}

interface ISerializedWorkspace { id: string; configURIPath: string; }
interface ILegacySerializedWorkspace { id: string; configPath: string; }

export type RecentlyOpenedStorageData = object;

export function restoreRecentlyOpened(data: RecentlyOpenedStorageData | undefined): IRecentlyOpened {
	const result: IRecentlyOpened = { workspaces: [], files: [] };
	if (data) {
		const storedRecents = data as ISerializedRecentlyOpened & ILegacySerializedRecentlyOpened;
		if (Array.isArray(storedRecents.workspaces3)) {
			for (const workspace of storedRecents.workspaces3) {
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configURIPath === 'string') {
					result.workspaces.push({ id: workspace.id, configPath: URI.parse(workspace.configURIPath) });
				} else if (typeof workspace === 'string') {
					result.workspaces.push(URI.parse(workspace));
				}
			}
		} else if (Array.isArray(storedRecents.workspaces2)) {
			for (const workspace of storedRecents.workspaces2) {
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configPath === 'string') {
					result.workspaces.push({ id: workspace.id, configPath: URI.file(workspace.configPath) });
				} else if (typeof workspace === 'string') {
					result.workspaces.push(URI.parse(workspace));
				}
			}
		} else if (Array.isArray(storedRecents.workspaces)) {
			// TODO@martin legacy support can be removed at some point (6 month?)
			// format of 1.25 and before
			for (const workspace of storedRecents.workspaces) {
				if (typeof workspace === 'string') {
					result.workspaces.push(URI.file(workspace));
				} else if (typeof workspace === 'object' && typeof workspace['id'] === 'string' && typeof workspace['configPath'] === 'string') {
					result.workspaces.push({ id: workspace['id'], configPath: URI.file(workspace['configPath']) });
				} else if (workspace && typeof workspace['path'] === 'string' && typeof workspace['scheme'] === 'string') {
					// added by 1.26-insiders
					result.workspaces.push(URI.revive(workspace));
				}
			}
		}

		if (Array.isArray(storedRecents.files2)) {
			for (const file of storedRecents.files2) {
				if (typeof file === 'string') {
					result.files.push(URI.parse(file));
				}
			}
		} else if (Array.isArray(storedRecents.files)) {
			for (const file of storedRecents.files) {
				if (typeof file === 'string') {
					result.files.push(URI.file(file));
				}
			}
		}
	}

	return result;
}

export function toStoreData(recent: IRecentlyOpened): RecentlyOpenedStorageData {
	const serialized: ISerializedRecentlyOpened = { workspaces3: [], files2: [] };

	for (const workspace of recent.workspaces) {
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			serialized.workspaces3.push(workspace.toString());
		} else {
			serialized.workspaces3.push({ id: workspace.id, configURIPath: workspace.configPath.toString() });
		}
	}

	for (const file of recent.files) {
		serialized.files2.push(file.toString());
	}

	return serialized;
}
