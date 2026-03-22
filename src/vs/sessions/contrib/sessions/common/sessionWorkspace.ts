/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';

export const GITHUB_REMOTE_FILE_SCHEME = 'github-remote-file';

/**
 * URI scheme for agent host remote filesystems.
 * Must match {@link AGENT_HOST_FS_SCHEME} in `agentHostFileSystemProvider.ts`
 * (which lives in the `browser` layer and cannot be imported here).
 */
export const AGENT_HOST_SCHEME = 'agenthost';

/**
 * Represents a workspace (folder or repository) for a session.
 * The workspace type (folder vs repo vs remote agent host) is derived from the URI scheme.
 */
export class SessionWorkspace {

	readonly uri: URI;
	readonly repository: IGitRepository | undefined;

	constructor(uri: URI, repository?: IGitRepository) {
		this.uri = uri;
		this.repository = repository;
	}

	/** Whether this is a local folder workspace. */
	get isFolder(): boolean {
		return this.uri.scheme !== GITHUB_REMOTE_FILE_SCHEME && this.uri.scheme !== AGENT_HOST_SCHEME;
	}

	/** Whether this is a remote repository workspace. */
	get isRepo(): boolean {
		return this.uri.scheme === GITHUB_REMOTE_FILE_SCHEME;
	}

	/** Whether this is a remote agent host workspace. */
	get isRemoteAgentHost(): boolean {
		return this.uri.scheme === AGENT_HOST_SCHEME;
	}

	/** Returns a new SessionWorkspace with the repository updated. */
	withRepository(repository: IGitRepository | undefined): SessionWorkspace {
		return new SessionWorkspace(this.uri, repository);
	}
}
