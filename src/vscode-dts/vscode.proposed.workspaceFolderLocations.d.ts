/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A location of a {@link WorkspaceFolder}. A workspace folder keeps its identity
	 * while it is shown at one of its locations, for example a git worktree of the
	 * same repository.
	 */
	export interface WorkspaceFolderLocation {

		/**
		 * The uri of this location.
		 */
		readonly uri: Uri;

		/**
		 * A human readable label of this location.
		 */
		readonly label: string;

		/**
		 * An optional human readable description of this location.
		 */
		readonly description?: string;

		/**
		 * Whether this is the primary location of the workspace folder.
		 */
		readonly isPrimary: boolean;

		/**
		 * Whether this is the location the workspace folder is currently shown at,
		 * which is the location whose {@link WorkspaceFolderLocation.uri uri} is
		 * the {@link WorkspaceFolder.uri uri} of the workspace folder.
		 */
		readonly isCurrent: boolean;
	}

	export interface WorkspaceFolder {

		/**
		 * All known locations of this workspace folder, the primary location first.
		 * Never empty. Before the locations are resolved, it contains the primary
		 * location and, if the folder is at an alternate location, that current location.
		 *
		 * Alternate locations are currently only discovered for a folder that is the
		 * only folder of a local workspace.
		 *
		 * The value is replaced on the same {@link WorkspaceFolder} object when the
		 * locations change, see {@link workspace.onDidChangeWorkspaceFolderLocations}.
		 */
		readonly locations: readonly WorkspaceFolderLocation[];
	}

	/**
	 * An event describing a change to the locations of workspace folders.
	 */
	export interface WorkspaceFolderLocationsChangeEvent {

		/**
		 * The workspace folders whose {@link WorkspaceFolder.locations locations} changed,
		 * either because the set of locations changed or because another location became
		 * the current one.
		 */
		readonly workspaceFolders: readonly WorkspaceFolder[];
	}

	export namespace workspace {

		/**
		 * An event that is emitted when the {@link WorkspaceFolder.locations locations}
		 * of workspace folders change.
		 */
		export const onDidChangeWorkspaceFolderLocations: Event<WorkspaceFolderLocationsChangeEvent>;
	}
}
