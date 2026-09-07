/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

/**
 * Encapsulates workspace folder resolution with an optional working directory override.
 *
 * When a working directory is set (agents window), it takes priority over
 * workspace folders for all folder-related operations. Otherwise, the class
 * delegates to the underlying {@link IWorkspaceContextService}.
 */
export class WorkingDirectory {

	constructor(
		private readonly _workspaceContextService: IWorkspaceContextService,
		private readonly _uri?: URI,
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
	 * Otherwise falls back to workspace context service.
	 */
	getFolder(resource: URI): URI | undefined {
		if (this._uri) {
			return extUriBiasedIgnorePathCase.isEqualOrParent(resource, this._uri)
				? this._uri
				: undefined;
		}
		return this._workspaceContextService.getWorkspaceFolder(resource)?.uri;
	}

	/**
	 * Resolves a workspace-relative file path to a URI.
	 * When a working directory is set, resolves against it.
	 * Otherwise resolves against the first workspace folder.
	 *
	 * The resolved URI is guaranteed to stay within the base directory: a
	 * `filePath` containing parent-directory segments (e.g. `../outside.ts`)
	 * that escapes the base directory is rejected and `undefined` is returned.
	 * This prevents path traversal out of the working directory boundary.
	 */
	resolveRelativePath(filePath: string): URI | undefined {
		const base = this._uri ?? this._workspaceContextService.getWorkspace().folders.at(0)?.uri;
		if (!base) {
			return undefined;
		}
		const resolved = joinPath(base, filePath);
		if (!extUriBiasedIgnorePathCase.isEqualOrParent(resolved, base)) {
			return undefined;
		}
		return resolved;
	}
}
