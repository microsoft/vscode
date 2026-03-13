/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { GitHubFileSystemProvider, GITHUB_REMOTE_FILE_SCHEME } from './githubFileSystemProvider.js';

// --- View registration is currently disabled in favor of the "Add Context" picker.
// The Files view will be re-enabled once we finalize the sessions auxiliary bar layout.

// --- Session Repo FileSystem Provider Registration

class GitHubFileSystemProviderContribution extends Disposable {

	static readonly ID = 'workbench.contrib.githubFileSystemProvider';

	constructor(
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const provider = this._register(instantiationService.createInstance(GitHubFileSystemProvider));
		this._register(fileService.registerProvider(GITHUB_REMOTE_FILE_SCHEME, provider));
	}
}

registerWorkbenchContribution2(
	GitHubFileSystemProviderContribution.ID,
	GitHubFileSystemProviderContribution,
	WorkbenchPhase.AfterRestored
);
