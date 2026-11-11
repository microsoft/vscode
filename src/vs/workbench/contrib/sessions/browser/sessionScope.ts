/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet } from '../../../../base/common/map.js';
import { IReader } from '../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ISession } from '../../../services/sessions/common/session.js';

/** The sessions of a scope, such as the folders of an editor window's workspace. */
export interface ISessionScope {
	includes(session: ISession): boolean;
}

/**
 * The sessions of the given scope folders, such as the folders of an editor window's workspace: the sessions with a
 * folder that is, or is inside, a scope folder, and the sessions of the same git repositories, such as its worktrees.
 * Only the metadata the providers already report is read, comparing whole URIs, so a session of another host never
 * matches a local folder. A repository is known only from a scope folder itself or from a session working in the
 * scope, so the main checkout of an opened worktree without sessions does not match. With a `reader`, the result
 * follows the sessions' workspaces.
 */
export function getSessionsInScopeFolders(sessions: readonly ISession[], scopeFolders: readonly URI[], reader?: IReader): ISessionScope {
	const extUri = extUriBiasedIgnorePathCase;
	const isInScope = (uri: URI | undefined) => !!uri && scopeFolders.some(folder => extUri.isEqualOrParent(uri, folder));
	const repositories = new ResourceSet(scopeFolders, uri => extUri.getComparisonKey(uri));
	const included = new Set<ISession>();
	for (const session of sessions) {
		for (const folder of session.workspace.read(reader)?.folders ?? []) {
			if (isInScope(folder.workingDirectory) || isInScope(folder.root) || isInScope(folder.gitRepository?.workTreeUri)) {
				included.add(session);
				if (folder.gitRepository) {
					repositories.add(folder.gitRepository.uri);
				}
			}
		}
	}
	for (const session of sessions) {
		if (!included.has(session) && session.workspace.read(reader)?.folders.some(folder => repositories.has(folder.root) || (!!folder.gitRepository && repositories.has(folder.gitRepository.uri)))) {
			included.add(session);
		}
	}
	return { includes: session => included.has(session) };
}
