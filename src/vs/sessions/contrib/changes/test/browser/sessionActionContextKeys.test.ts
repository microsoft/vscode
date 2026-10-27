/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostPullRequestOperationId } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { DesktopChangesEditorTransitionContext, SessionHasOpenPullRequestContext, SessionPrimaryPullRequestOperationContext } from '../../../../common/contextkeys.js';
import { ISessionChangeset, ISessionChangesetOperation } from '../../../../services/sessions/common/session.js';
import { GitHubCheckConclusion, GitHubCheckStatus, IGitHubCICheck } from '../../../github/common/types.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { PullRequestCheck } from '../../../../../platform/github/common/githubPullRequestService.js';
import { RequiredPullRequestChecks } from '../../../../../platform/github/common/pullRequestRequiredChecks.js';
import { ActiveSessionState } from '../../common/changesViewService.js';
import { registerSessionActionContextKeyBinder, bindSessionActionContextKeys, ISessionActionContextKeysSource } from '../../browser/sessionActionContextKeys.js';
import { activeSessionCIFixRequested, hasActiveSessionFailedCIChecks } from '../../browser/checksActions.js';
import { SessionChangesReviewedFilesContext } from '../../browser/changesMultiDiffSourceResolver.js';

suite('Session Action Context Keys', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSource(overrides: { prOperation?: string; hasOpenPullRequest?: boolean; failedCheck?: boolean; failedCheckCounts?: boolean; reviewed?: boolean }): ISessionActionContextKeysSource {
		const changeset = upcastPartial<ISessionChangeset>({
			operations: constObservable(overrides.prOperation ? [upcastPartial<ISessionChangesetOperation>({ id: overrides.prOperation })] : []),
		});
		const checks: IGitHubCICheck[] = overrides.failedCheck
			? [{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: undefined, completedAt: undefined, detailsUrl: undefined }]
			: [];
		// Which of them count is the pull request's required checks; by default, the failed check does.
		const failed = overrides.failedCheck && (overrides.failedCheckCounts ?? true) ? [upcastPartial<PullRequestCheck>({ name: 'build', type: 'checkRun' })] : [];
		const requiredChecks: RequiredPullRequestChecks = { everyCheck: false, checks: failed, failed, missing: [], pending: false };
		return {
			session: constObservable(undefined),
			changes: {
				changesObs: constObservable([{ uri: undefined!, modifiedUri: undefined, originalUri: undefined, insertions: 0, deletions: 0, reviewed: overrides.reviewed }] as never),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				changesetObs: constObservable(changeset),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({ hasOpenPullRequest: overrides.hasOpenPullRequest })),
			},
			pullRequest: {
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable(checks), requiredChecks: constObservable(requiredChecks), fixRequested: observableValue('fixRequested', false) })),
			},
		};
	}

	test('binds the keys of the given session on the given context key service only', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const globalService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const scoped = disposables.add(globalService.createScoped(document.createElement('div')));

		disposables.add(bindSessionActionContextKeys(instantiationService, createSource({
			prOperation: AgentHostPullRequestOperationId.Merge,
			hasOpenPullRequest: true,
			failedCheck: true,
		}), scoped));

		const read = (service: IContextKeyService) => ({
			primary: SessionPrimaryPullRequestOperationContext.getValue(service),
			open: SessionHasOpenPullRequestContext.getValue(service),
			failed: hasActiveSessionFailedCIChecks.getValue(service),
			fixRequested: activeSessionCIFixRequested.getValue(service),
			reviewed: SessionChangesReviewedFilesContext.getValue(service),
		});
		assert.deepStrictEqual({ scoped: read(scoped), global: read(globalService) }, {
			scoped: { primary: AgentHostPullRequestOperationId.Merge, open: true, failed: true, fixRequested: false, reviewed: [] },
			global: { primary: undefined, open: undefined, failed: undefined, fixRequested: undefined, reviewed: undefined },
		});
	});

	test('a failed check that does not count leaves the failed checks key of the session unset', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const globalService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const scoped = disposables.add(globalService.createScoped(document.createElement('div')));
		const counted = disposables.add(globalService.createScoped(document.createElement('div')));

		disposables.add(bindSessionActionContextKeys(instantiationService, createSource({ failedCheck: true, failedCheckCounts: false }), scoped));
		disposables.add(bindSessionActionContextKeys(instantiationService, createSource({ failedCheck: true }), counted));

		assert.deepStrictEqual({ notCounting: hasActiveSessionFailedCIChecks.getValue(scoped), counting: hasActiveSessionFailedCIChecks.getValue(counted) }, { notCounting: false, counting: true });
	});

	test('does not re-read the editor transition key for unrelated context changes', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const scoped = disposables.add(new ContextKeyService(new TestConfigurationService()));
		let reads = 0;
		const getContextKeyValue = scoped.getContextKeyValue.bind(scoped);
		scoped.getContextKeyValue = <T>(key: string) => {
			if (key === DesktopChangesEditorTransitionContext.key) {
				reads++;
			}
			return getContextKeyValue<T>(key);
		};
		disposables.add(bindSessionActionContextKeys(instantiationService, createSource({}), scoped));

		const unrelated = scoped.createKey<number>('unrelatedKey', 0);
		const afterBind = reads;
		unrelated.set(1);
		unrelated.set(2);
		const afterUnrelated = reads;
		DesktopChangesEditorTransitionContext.bindTo(scoped).set(true);
		assert.deepStrictEqual({ unrelatedReads: afterUnrelated - afterBind, relatedTriggersRead: reads > afterUnrelated }, { unrelatedReads: 0, relatedTriggersRead: true });
	});

	test('runs registered binders for each bound source', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const globalService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const scoped = disposables.add(globalService.createScoped(document.createElement('div')));
		const bound: IContextKeyService[] = [];
		disposables.add(registerSessionActionContextKeyBinder((_accessor, _source, contextKeyService) => {
			bound.push(contextKeyService);
			return { dispose: () => bound.pop() };
		}));

		const binding = bindSessionActionContextKeys(instantiationService, createSource({}), scoped);
		const boundWhileActive = bound.length;
		binding.dispose();

		assert.deepStrictEqual({ boundWhileActive, boundAfterDispose: bound.length }, { boundWhileActive: 1, boundAfterDispose: 0 });
	});
});
