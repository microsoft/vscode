/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ImmortalReference } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { IPullRequestIconCache } from '../../browser/pullRequestIconCache.js';
import { computePullRequestRefPresentation, SessionPullRequestPresentationModel } from '../../browser/pullRequestIconStatus.js';

suite('Pull request presentation origin isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const enterpriseHost of [undefined, 'ghe.example.com']) {
		for (const host of ['github.com', 'ghe.example.com']) {
			test(`service ${enterpriseHost ?? 'github.com'} presenting ${host}`, () => {
				let lookups = 0;
				const service = new class extends mock<IGitHubService>() {
					override readonly enterpriseHost = enterpriseHost;
					override createPullRequestModelReference = () => {
						lookups++;
						return new ImmortalReference(new class extends mock<GitHubPullRequestModel>() {
							override readonly pullRequest = constObservable(undefined);
						}());
					};
				}();
				const cache = new class extends mock<IPullRequestIconCache>() {
					override get = () => undefined;
				}();
				const ref = {
					owner: 'owner', repo: 'repo', number: 42, title: 'Host draft',
					uri: URI.parse(`https://${host}/owner/repo/pull/42`), icon: Codicon.gitPullRequestDraft,
				};
				const presentation = store.add(new SessionPullRequestPresentationModel(constObservable([ref]), service));
				const pill = presentation.pullRequests.get()[0];
				const provider = derived(reader => computePullRequestRefPresentation(reader, service, cache, ref)).get();
				assert.deepStrictEqual({
					lookups, pillTitle: pill.ref.title, pillIcon: pill.icon?.id,
					pullRequest: pill.pullRequest, provider,
				}, {
					lookups: host === (enterpriseHost ?? 'github.com') ? 2 : 0,
					pillTitle: 'Host draft', pillIcon: Codicon.gitPullRequestDraft.id,
					pullRequest: undefined,
					provider: { title: 'Host draft', icon: Codicon.gitPullRequestDraft, liveState: undefined },
				});
			});
		}
	}
});
