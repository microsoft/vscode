/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';

export const GITHUB_REMOTE_FILE_SCHEME = 'github-remote-file';

/**
 * Represents a project (folder or repository) for a session.
 * The project type (folder vs repo) is derived from the URI scheme.
 */
export class SessionProject {

	readonly uri: URI;
	readonly repository: IGitRepository | undefined;

	constructor(uri: URI, repository?: IGitRepository) {
		this.uri = uri;
		this.repository = repository;
	}

	/** Whether this is a local folder project. */
	get isFolder(): boolean {
		return this.uri.scheme !== GITHUB_REMOTE_FILE_SCHEME;
	}

	/** Whether this is a remote repository project. */
	get isRepo(): boolean {
		return this.uri.scheme === GITHUB_REMOTE_FILE_SCHEME;
	}

	/** Returns a new SessionProject with the repository updated. */
	withRepository(repository: IGitRepository | undefined): SessionProject {
		return new SessionProject(this.uri, repository);
	}
}
