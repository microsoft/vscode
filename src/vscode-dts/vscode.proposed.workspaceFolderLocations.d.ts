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
		 * The name of this location.
		 */
		readonly name: string;
	}

	export interface WorkspaceFolder {

		/**
		 * The locations of this workspace folder, the primary location first, or
		 * `undefined` until they are known or when they are not supported.
		 *
		 * Resolution starts when {@link workspace.onDidChangeWorkspaceFolderLocations}
		 * is subscribed to; the value is set on the same {@link WorkspaceFolder} object
		 * and the event fires. Switching a folder to another location is reported as the
		 * folder being removed and added in {@link workspace.onDidChangeWorkspaceFolders};
		 * the new folder object starts with `undefined` locations.
		 */
		readonly locations?: readonly WorkspaceFolderLocation[];
	}

	/**
	 * An event describing a change to the locations of workspace folders.
	 */
	export interface WorkspaceFolderLocationsChangeEvent {

		/**
		 * The workspace folders whose set of known {@link WorkspaceFolder.locations locations}
		 * changed.
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
