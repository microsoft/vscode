/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISessionChangesetFolderFailure, ISessionGitRepository, SessionRepositoryKind } from '../../../services/sessions/common/session.js';

/** A repository the Changes of a session of several repositories are grouped by, or a folder that is in none. */
export interface IChangesRepository {
	/** The repository's root, or the folder's working directory for a folder in no repository. */
	readonly root: URI;
	/** The working directory of the session folder the repository is in. */
	readonly folder: URI;
	readonly name: string;
	/** Where a repository found in a folder is, relative to that folder. */
	readonly description: string | undefined;
	/** `undefined` for a folder in no repository. */
	readonly kind: SessionRepositoryKind | undefined;
	readonly gitRepository: ISessionGitRepository | undefined;
}

/** The items of one repository, or of no repository (`undefined`): those outside every repository. */
export interface IChangesRepositoryGroup<T> {
	readonly repository: IChangesRepository | undefined;
	readonly items: readonly T[];
	/** Why the repository's changes could not be computed, which leaves them out. */
	readonly failure: ISessionChangesetFolderFailure | undefined;
}
