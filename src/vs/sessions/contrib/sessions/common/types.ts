/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';

/**
 * Represents a project (folder or repository) for a session.
 */
export interface ISessionProject {
	/** Whether this is a local folder or a remote repository. */
	readonly kind: 'folder' | 'repo';
	/** The project URI — a file URI for folders, or a github-remote-file URI for repos. */
	readonly uri?: URI;
	/** The resolved git repository, if the project is a folder with a git repo. */
	readonly repository?: IGitRepository;
}
