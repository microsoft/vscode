/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { isEqual } from '../../../../base/common/resources.js';

export class ChecksViewModel extends Disposable {
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly checksObs: IObservable<GitHubPullRequestCIModel | undefined>;

	constructor(
		@IGitHubService gitHubService: IGitHubService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		this.activeSessionResourceObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const session = sessionManagementService.activeSession.read(reader);
			return session?.resource;
		});

		this.checksObs = derived(this, reader => {
			return gitHubService.activeSessionPullRequestCIObs.read(reader);
		});
	}
}
