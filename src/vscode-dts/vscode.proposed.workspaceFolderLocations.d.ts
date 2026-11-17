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
	}

	export interface WorkspaceFolder {

		/**
		 * All known locations of this workspace folder, the primary location first.
		 * Never empty. This is only the set of known locations: it does not change when
		 * the folder is switched to another location. A switch is reported as the folder
		 * being removed and added again in {@link workspace.onDidChangeWorkspaceFolders}
		 * and does not fire {@link workspace.onDidChangeWorkspaceFolderLocations}. The location the folder is currently
		 * at is {@link WorkspaceFolder.uri}.
		 *
		 * Resolution is lazy: it starts when this property is first read or when
		 * {@link workspace.onDidChangeWorkspaceFolderLocations} is subscribed to.
		 * The first read returns a synchronous value holding only the primary
		 * location. The full set arrives later through the event, so prefer
		 * subscribing to the event. The property is not enumerable, so spreading
		 * or serializing a folder does not trigger resolution.
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
		 * The workspace folders whose set of known {@link WorkspaceFolder.locations locations}
		 * changed. Switching a folder to another location does not fire this event.
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
