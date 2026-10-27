/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, IObservable, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { AGENT_HOST_PULL_REQUEST_OPERATION_IDS } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { DesktopChangesEditorTransitionContext, SessionHasOpenPullRequestContext, SessionPrimaryPullRequestOperationContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService, IGitHubSessionPullRequestObservables } from '../../github/browser/githubService.js';
import { IChangesSessionObservables, IChangesViewService } from '../common/changesViewService.js';
import { SessionChangesReviewedFilesContext } from './changesMultiDiffSourceResolver.js';
import { bindSessionCIChecksContextKeys } from './checksActions.js';

/** The session the session action context keys are derived from. */
export interface ISessionActionContextKeysSource {
	readonly session: IObservable<IActiveSession | undefined>;
	readonly changes: Pick<IChangesSessionObservables, 'changesObs' | 'changesetsLoadingObs' | 'loadingObs' | 'changesetObs' | 'stateObs'>;
	readonly pullRequest: Pick<IGitHubSessionPullRequestObservables, 'pullRequestCIObs'>;
}

/**
 * Binds additional session action context keys, e.g. contributed by providers
 * which shared Sessions code must not import.
 */
export type SessionActionContextKeyBinder = (accessor: ServicesAccessor, source: ISessionActionContextKeysSource, contextKeyService: IContextKeyService) => IDisposable;

const sessionActionContextKeyBinders: SessionActionContextKeyBinder[] = [];

export function registerSessionActionContextKeyBinder(binder: SessionActionContextKeyBinder): IDisposable {
	sessionActionContextKeyBinders.push(binder);
	return {
		dispose: () => {
			const index = sessionActionContextKeyBinders.indexOf(binder);
			if (index >= 0) {
				sessionActionContextKeyBinders.splice(index, 1);
			}
		}
	};
}

/**
 * Binds the context keys the session actions (Create Pull Request, commit,
 * sync, Agent Merge, checks) depend on, for the session of `source`, on the
 * given context key service. The title bar actions of a window evaluate these
 * on their own scoped context key service, so every window sees its session.
 */
export function bindSessionActionContextKeys(instantiationService: IInstantiationService, source: ISessionActionContextKeysSource, contextKeyService: IContextKeyService): IDisposable {
	const store = new DisposableStore();
	store.add(instantiationService.invokeFunction(accessor => bindChangesetOperationContextKeys(source, contextKeyService, accessor.get(ILogService))));
	store.add(bindSessionCIChecksContextKeys(source.pullRequest, contextKeyService));
	for (const binder of sessionActionContextKeyBinders) {
		store.add(instantiationService.invokeFunction(accessor => binder(accessor, source, contextKeyService)));
	}
	return store;
}

function bindChangesetOperationContextKeys(source: ISessionActionContextKeysSource, contextKeyService: IContextKeyService, logService: ILogService): IDisposable {
	const store = new DisposableStore();
	const { changes } = source;

	// Use to optimistically update the toolbars until the server confirms
	// the state. As soon as the server confirms the state, the client array
	// will be reset to `undefined` so that the server state takes precedence.
	const clientReviewedFilesObs = observableValue<string[] | undefined>('clientReviewedFiles', undefined);

	// Authoritative source of reviewed files. This will be updated
	// when the state is saved on the server and confirmed back to
	// the client
	const agentHostReviewedFilesObs = observableValue<string[]>('agentHostReviewedFiles', []);

	store.add(autorun(reader => {
		const reviewedFiles = changes.changesObs.read(reader)
			.filter(change => change.reviewed)
			.map(change => change.modifiedUri?.toString() ?? change.originalUri?.toString())
			.filter((uri: string | undefined) => uri !== undefined);

		transaction(tx => {
			clientReviewedFilesObs.set(undefined, tx);
			agentHostReviewedFilesObs.set(reviewedFiles, tx);
		});
	}));

	store.add(bindContextKey<string[]>(SessionChangesReviewedFilesContext, contextKeyService, reader => {
		return clientReviewedFilesObs.read(reader) ?? agentHostReviewedFilesObs.read(reader);
	}));

	// Publish the Agent Merge title-menu inputs together after the incoming changes state resolves.
	const primaryPullRequestOperationKey = SessionPrimaryPullRequestOperationContext.bindTo(contextKeyService);
	const hasOpenPullRequestKey = SessionHasOpenPullRequestContext.bindTo(contextKeyService);
	const changesEditorTransitionObs = observableFromEvent(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([DesktopChangesEditorTransitionContext.key]))), () =>
		DesktopChangesEditorTransitionContext.getValue(contextKeyService) === true);
	let lastPullRequestOperation: string | undefined;
	store.add(autorun(reader => {
		if (changesEditorTransitionObs.read(reader)
			|| changes.changesetsLoadingObs.read(reader)
			|| changes.loadingObs.read(reader)) {
			return;
		}
		const operations = changes.changesetObs.read(reader)?.operations.read(reader) ?? [];
		const primary = operations.find(op => AGENT_HOST_PULL_REQUEST_OPERATION_IDS.has(op.id))?.id ?? '';
		const hasOpenPullRequest = changes.stateObs.read(reader)?.hasOpenPullRequest === true;
		contextKeyService.bufferChangeEvents(() => {
			primaryPullRequestOperationKey.set(primary);
			hasOpenPullRequestKey.set(hasOpenPullRequest);
		});
		if (lastPullRequestOperation !== primary) {
			lastPullRequestOperation = primary;
			// Gates which Agent Merge entries the dropdown offers, so it is
			// logged alongside the button bar itself.
			logService.info(`[ChangesetOperationsActionController] Primary pull request operation: ${primary || 'none'}`);
		}
	}));

	return store;
}

/** Binds the session action context keys of the active session on the global context key service. */
class ActiveSessionActionContextKeysContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.activeSessionActionContextKeys';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService sessionsService: ISessionsService,
		@IChangesViewService changesViewService: IChangesViewService,
		@IGitHubService gitHubService: IGitHubService,
	) {
		super();
		this._register(bindSessionActionContextKeys(instantiationService, {
			session: sessionsService.mainWindowActiveSession,
			changes: {
				changesObs: changesViewService.activeSessionChangesObs,
				changesetsLoadingObs: changesViewService.activeSessionChangesetsLoadingObs,
				loadingObs: changesViewService.activeSessionLoadingObs,
				changesetObs: changesViewService.activeSessionChangesetObs,
				stateObs: changesViewService.activeSessionStateObs,
			},
			pullRequest: { pullRequestCIObs: gitHubService.activeSessionPullRequestCIObs },
		}, contextKeyService));
	}
}

registerWorkbenchContribution2(ActiveSessionActionContextKeysContribution.ID, ActiveSessionActionContextKeysContribution, WorkbenchPhase.AfterRestored);
