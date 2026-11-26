/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IObservable } from '../../../../base/common/observable.js';
import type { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/** A workspace known to the Agents window. File-backed names and folders come from the workspace file, never from session metadata. */
export interface IRecentSessionWorkspace {
	/** The workspace file, or the folder URI for a standalone folder. */
	readonly uri: URI;
	readonly name: string;
	/** The default folder is first. */
	readonly folders: readonly URI[];
	/** Whether the Agents window owns the workspace file. */
	readonly owned: boolean;
	/** Whether the workspace file could not be read; any displayed name and folders are from its last successful read. */
	readonly missing?: boolean;
	/** Earlier workspace-file URIs that existing sessions may still reference. */
	readonly previousUris?: readonly URI[];
	readonly icon?: string;
	readonly color?: string;
}

/** Appearance saved in a workspace file, or in profile storage for a standalone folder. */
export interface ISessionWorkspaceAppearance {
	/** The ID of a registered icon. */
	readonly icon?: string;
	/** A theme color ID or an RGB hex color. */
	readonly color?: string;
}

/** Omitted fields are unchanged. */
export interface ISessionWorkspaceUpdate {
	readonly name?: string;
	/** The new ordered set of folders, with the default folder first. */
	readonly folders?: readonly URI[];
	/** Pass `null` to clear the custom icon. */
	readonly icon?: string | null;
	/** Pass `null` to clear the custom color. */
	readonly color?: string | null;
}

/** Controls whether removal also disposes of the workspace file. */
export interface ISessionWorkspaceRemoveOptions {
	/** Also move the `.code-workspace` file to the trash. */
	readonly deleteFile?: boolean;
}

export const ISessionWorkspacesService = createDecorator<ISessionWorkspacesService>('sessionWorkspacesService');

/** Owns the workspace catalogue and edits to workspace files, independently of the sessions that use them. */
export interface ISessionWorkspacesService {
	readonly _serviceBrand: undefined;

	/** Whether workspace support is enabled. */
	readonly enabled: IObservable<boolean>;
	/** Workspaces created or explicitly opened in the Agents window, most recently used first. */
	readonly managedWorkspaces: IObservable<readonly IRecentSessionWorkspace[]>;
	/** Eligible, unmanaged `.code-workspace` files from VS Code history, most recently opened first. */
	readonly recentWorkspaceFiles: IObservable<readonly IRecentSessionWorkspace[]>;
	/** The managed workspaces followed by the eligible recent workspace files. */
	readonly workspaces: IObservable<readonly IRecentSessionWorkspace[]>;

	/** Looks up a catalogue entry by its current or previous URI. */
	getWorkspace(uri: URI): IRecentSessionWorkspace | undefined;

	/** Reads the current workspace file without adding it to the catalogue. */
	resolveWorkspaceFile(workspaceFile: URI): Promise<IRecentSessionWorkspace>;

	/** Creates a workspace with at least one folder; a standalone folder does not need a workspace file. */
	createWorkspace(name: string, folders: readonly URI[], appearance?: ISessionWorkspaceAppearance): Promise<IRecentSessionWorkspace>;

	/** Applies edits while preserving unrelated workspace-file content. The result may have a different URI. */
	updateWorkspace(uri: URI, update: ISessionWorkspaceUpdate): Promise<IRecentSessionWorkspace>;

	/** Removes a workspace from the Agents window catalogue without changing VS Code history. */
	removeWorkspace(uri: URI, options?: ISessionWorkspaceRemoveOptions): Promise<void>;

	/** Reads an existing workspace file and adds it to the managed catalogue. */
	openWorkspace(workspaceFile: URI): Promise<IRecentSessionWorkspace>;

	/** Marks a managed workspace as the most recently used. */
	touchWorkspace(uri: URI): void;

	/** Reloads workspace files so that edits made outside the Agents window are reflected in the catalogue. */
	refresh(): Promise<void>;
}
