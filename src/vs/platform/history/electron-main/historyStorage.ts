/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { UriComponents, URI } from 'vs/base/common/uri';
import { IRecentlyOpened, isRecentFolder } from 'vs/platform/history/common/history';

interface ISerializedRecentlyOpened {
	workspaces3: Array<ISerializedWorkspace | string>; // workspace or URI.toString()
	workspaceLabels: Array<string | null>;
	files2: string[]; // files as URI.toString()
	fileLabels: Array<string | null>;
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
			for (let i = 0; i < storedRecents.workspaces3.length; i++) {
				const workspace = storedRecents.workspaces3[i];
				const label: string | undefined = (Array.isArray(storedRecents.workspaceLabels) && storedRecents.workspaceLabels[i]) || undefined;
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configURIPath === 'string') {
					result.workspaces.push({ label, workspace: { id: workspace.id, configPath: URI.parse(workspace.configURIPath) } });
				} else if (typeof workspace === 'string') {
					result.workspaces.push({ label, folderUri: URI.parse(workspace) });
				}
			}
		} else if (Array.isArray(storedRecents.workspaces2)) {
			for (const workspace of storedRecents.workspaces2) {
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configPath === 'string') {
					result.workspaces.push({ workspace: { id: workspace.id, configPath: URI.file(workspace.configPath) } });
				} else if (typeof workspace === 'string') {
					result.workspaces.push({ folderUri: URI.parse(workspace) });
				}
			}
		} else if (Array.isArray(storedRecents.workspaces)) {
			// TODO@martin legacy support can be removed at some point (6 month?)
			// format of 1.25 and before
			for (const workspace of storedRecents.workspaces) {
				if (typeof workspace === 'string') {
					result.workspaces.push({ folderUri: URI.file(workspace) });
				} else if (typeof workspace === 'object' && typeof workspace['id'] === 'string' && typeof workspace['configPath'] === 'string') {
					result.workspaces.push({ workspace: { id: workspace['id'], configPath: URI.file(workspace['configPath']) } });
				} else if (workspace && typeof workspace['path'] === 'string' && typeof workspace['scheme'] === 'string') {
					// added by 1.26-insiders
					result.workspaces.push({ folderUri: URI.revive(workspace) });
				}
			}
		}

		if (Array.isArray(storedRecents.files2)) {
			for (let i = 0; i < storedRecents.files2.length; i++) {
				const file = storedRecents.files2[i];
				const label: string | undefined = (Array.isArray(storedRecents.fileLabels) && storedRecents.fileLabels[i]) || undefined;
				if (typeof file === 'string') {
					result.files.push({ label, fileUri: URI.parse(file) });
				}
			}
		} else if (Array.isArray(storedRecents.files)) {
			for (const file of storedRecents.files) {
				if (typeof file === 'string') {
					result.files.push({ fileUri: URI.file(file) });
				}
			}
		}
	}

	return result;
}

export function toStoreData(recents: IRecentlyOpened): RecentlyOpenedStorageData {
	const serialized: ISerializedRecentlyOpened = { workspaces3: [], files2: [], workspaceLabels: [], fileLabels: [] };

	for (const recent of recents.workspaces) {
		if (isRecentFolder(recent)) {
			serialized.workspaces3.push(recent.folderUri.toString());
		} else {
			serialized.workspaces3.push({ id: recent.workspace.id, configURIPath: recent.workspace.configPath.toString() });
		}
		serialized.workspaceLabels.push(recent.label || null);
	}

	for (const recent of recents.files) {
		serialized.files2.push(recent.fileUri.toString());
		serialized.fileLabels.push(recent.label || null);
	}

	return serialized;
}
