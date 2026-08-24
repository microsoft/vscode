/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';

export class ChecksViewModel extends Disposable {
	readonly checksObs: IObservable<GitHubPullRequestCIModel | undefined>;

	constructor(
		@IGitHubService gitHubService: IGitHubService,
	) {
		super();

		this.checksObs = derived(this, reader => {
			return gitHubService.activeSessionPullRequestCIObs.read(reader);
		});
	}
}
