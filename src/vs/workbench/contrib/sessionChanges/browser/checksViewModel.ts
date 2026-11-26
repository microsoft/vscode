/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ArtifactIntegrationsSettingId } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IGitHubService } from '../../sessions/browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../sessions/browser/github/models/githubPullRequestCIModel.js';

/**
 * The CI model whose checks the Changes view shows: that of the pull request of the main window's session, unless
 * artifact integrations are enabled, in which case the pull request artifact shows the checks instead.
 */
export function getChangesViewChecksObs(gitHubService: IGitHubService, configurationService: IConfigurationService): IObservable<GitHubPullRequestCIModel | undefined> {
	const artifactIntegrationsEnabled = observableConfigValue(ArtifactIntegrationsSettingId, false, configurationService);
	return derived(reader => artifactIntegrationsEnabled.read(reader) === true
		? undefined
		: gitHubService.activeSessionPullRequestCIObs.read(reader));
}

export class ChecksViewModel extends Disposable {
	readonly checksObs: IObservable<GitHubPullRequestCIModel | undefined>;

	constructor(
		@IGitHubService gitHubService: IGitHubService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this.checksObs = getChangesViewChecksObs(gitHubService, configurationService);
	}
}
