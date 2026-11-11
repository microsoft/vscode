/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostPullRequestOperationId } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { ArtifactIntegrationsSettingId } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { DesktopChangesEditorTransitionContext, SessionArtifactIntegrationsEnabledContext, SessionHasOpenPullRequestContext, SessionPrimaryPullRequestOperationContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISessionChangeset, ISessionChangesetOperation } from '../../../../../workbench/services/sessions/common/session.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { GitHubCheckConclusion, GitHubCheckStatus, IGitHubCICheck } from '../../../../../workbench/contrib/sessions/common/github/types.js';
import { GitHubPullRequestCIModel } from '../../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { PullRequestCheck } from '../../../../../platform/github/common/githubPullRequestService.js';
import { RequiredPullRequestChecks } from '../../../../../platform/github/common/pullRequestRequiredChecks.js';
import { ActiveSessionState } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { registerSessionActionContextKeyBinder, bindSessionActionContextKeys, ISessionActionContextKeysSource } from '../../../../../workbench/contrib/sessionChanges/browser/sessionActionContextKeys.js';
import { activeSessionCIFixRequested, hasActiveSessionFailedCIChecks } from '../../../../../workbench/contrib/sessions/browser/fixCIChecks.js';
import { SessionChangesReviewedFilesContext } from '../../../../../workbench/contrib/sessionChanges/browser/changesMultiDiffSourceResolver.js';

suite('Session Action Context Keys', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSource(overrides: { prOperation?: string; hasOpenPullRequest?: boolean; failedCheck?: boolean; failedCheckCounts?: boolean; reviewed?: boolean }): ISessionActionContextKeysSource {
		const changeset = upcastPartial<ISessionChangeset>({
			operations: constObservable(overrides.prOperation ? [upcastPartial<ISessionChangesetOperation>({ id: overrides.prOperation, scopes: [] })] : []),
		});
		const checks: IGitHubCICheck[] = overrides.failedCheck
			? [{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: undefined, completedAt: undefined, detailsUrl: undefined }]
			: [];
		// Which of them count is the pull request's required checks; by default, the failed check does.
		const failed = overrides.failedCheck && (overrides.failedCheckCounts ?? true) ? [upcastPartial<PullRequestCheck>({ name: 'build', type: 'checkRun' })] : [];
		const requiredChecks: RequiredPullRequestChecks = { everyCheck: false, checks: failed, failed, missing: [], pending: false };
		return {
			session: constObservable(undefined),
			chat: constObservable(undefined),
			changes: {
				changesObs: constObservable([{ uri: undefined!, modifiedUri: undefined, originalUri: undefined, insertions: 0, deletions: 0, reviewed: overrides.reviewed }] as never),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				changesetObs: constObservable(changeset),
				changesetOperationsObs: constObservable([]),
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

	test('the artifact integrations key holds only while the setting is enabled and the session supports artifact integrations', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configuration = new TestConfigurationService({ [ArtifactIntegrationsSettingId]: false });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		// Binders registered by other contributions, such as Agent Merge's, look up the session's provider.
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ onDidChangeProviders: Event.None, getProvider: () => undefined }));
		const supportsArtifactIntegrations = observableValue('supportsArtifactIntegrations', true);
		const session = Object.assign(createTestActiveSession('session'), { capabilities: derived(reader => ({ supportsMultipleChats: false, supportsArtifactIntegrations: supportsArtifactIntegrations.read(reader) })) });
		const scoped = disposables.add(new ContextKeyService(new TestConfigurationService()));
		disposables.add(bindSessionActionContextKeys(instantiationService, { ...createSource({}), session: constObservable(session) }, scoped));

		const states = [SessionArtifactIntegrationsEnabledContext.getValue(scoped)];
		await configuration.setUserConfiguration(ArtifactIntegrationsSettingId, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: setting => setting === ArtifactIntegrationsSettingId }));
		states.push(SessionArtifactIntegrationsEnabledContext.getValue(scoped));
		supportsArtifactIntegrations.set(false, undefined);
		states.push(SessionArtifactIntegrationsEnabledContext.getValue(scoped));

		assert.deepStrictEqual(states, [false, true, false]);
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
