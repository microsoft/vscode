/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IContentClient } from '../content/content.js';
import { ISearchClient } from '../core/search.js';
import { IGistsClient } from '../gists/gists.js';

/** A disposable client for public GitHub data. Cancelling acquisition does not dispose an acquired client. */
export interface IGitHubAnonymousClient extends IDisposable {
	/** Read access to repository files, directories, and Git objects. */
	readonly content: IContentClient;
	/** Retrieval of gists. */
	readonly gist: Pick<IGistsClient, 'get'>;
	/** Issue search, excluding pull requests. */
	readonly search: Pick<ISearchClient, 'issues'>;
}
