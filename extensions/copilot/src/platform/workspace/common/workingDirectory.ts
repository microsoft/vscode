/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IWorkspaceService } from './workspaceService';

/**
 * Encapsulates workspace folder resolution with an optional working directory override.
 *
 * When a working directory is set (agents window), it takes priority over
 * workspace folders for all folder-related operations. Otherwise, the class
 * delegates to the underlying {@link IWorkspaceService}.
 */
export class WorkingDirectory {

	constructor(
		private readonly _uri: URI | undefined,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) { }

	/** The explicit working directory URI, if set. */
	get uri(): URI | undefined {
		return this._uri;
	}

	/** Whether an explicit working directory is set. */
	get hasExplicitWorkingDirectory(): boolean {
		return !!this._uri;
	}

	/**
	 * Returns the workspace folder containing the given resource.
	 * When a working directory is set, only checks against it.
	 * Otherwise falls back to workspace service.
	 */
	getFolder(resource: URI): URI | undefined {
		if (this._uri) {
			return extUriBiasedIgnorePathCase.isEqualOrParent(resource, this._uri)
				? this._uri
				: undefined;
		}
		return this._workspaceService.getWorkspaceFolder(resource);
	}

	/**
	 * Returns all workspace folders.
	 * When a working directory is set, returns only that directory.
	 */
	getFolders(): URI[] {
		if (this._uri) {
			return [this._uri];
		}
		return this._workspaceService.getWorkspaceFolders();
	}

	/**
	 * Returns the display name for a workspace folder.
	 * When a working directory is set, returns its basename.
	 */
	getFolderName(folder: URI): string {
		if (this._uri) {
			return basename(folder);
		}
		return this._workspaceService.getWorkspaceFolderName(folder);
	}
}
