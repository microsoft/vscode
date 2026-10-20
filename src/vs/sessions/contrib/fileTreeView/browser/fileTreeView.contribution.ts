/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { FileSystemFileSearchProvider } from '../../../../workbench/services/search/common/fileSystemFileSearchProvider.js';
import { ISearchService, SearchProviderType } from '../../../../workbench/services/search/common/search.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../services/sessions/common/session.js';
import { GitHubFileSystemProvider } from './githubFileSystemProvider.js';

// --- View registration is currently disabled in favor of the "Add Context" picker.
// The Files view will be re-enabled once we finalize the sessions auxiliary bar layout.

// --- Session Repo FileSystem Provider Registration

class GitHubFileSystemProviderContribution extends Disposable {

	static readonly ID = 'workbench.contrib.githubFileSystemProvider';

	constructor(
		@IFileService fileService: IFileService,
		@ISearchService searchService: ISearchService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const provider = this._register(instantiationService.createInstance(GitHubFileSystemProvider));
		this._register(fileService.registerProvider(GITHUB_REMOTE_FILE_SCHEME, provider));
		// Without a provider, file searches (Go to File, Add Context, `#file:`) wait forever on this scheme.
		const searchProvider = this._register(instantiationService.createInstance(FileSystemFileSearchProvider));
		this._register(searchService.registerSearchResultProvider(GITHUB_REMOTE_FILE_SCHEME, SearchProviderType.file, searchProvider));
	}
}

registerWorkbenchContribution2(
	GitHubFileSystemProviderContribution.ID,
	GitHubFileSystemProviderContribution,
	WorkbenchPhase.AfterRestored
);
