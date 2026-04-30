/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubCheckConclusion, GitHubCheckStatus, IGitHubCICheck } from '../../github/common/types.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const hasActiveSessionFailedCIChecks = new RawContextKey<boolean>('sessions.hasActiveSessionFailedCIChecks', false);

// --- Shared CI check utilities ------------------------------------------------

export const enum CICheckGroup {
	Running,
	Pending,
	Failed,
	Successful,
}

export function isFailedConclusion(conclusion: GitHubCheckConclusion | undefined): boolean {
	return conclusion === GitHubCheckConclusion.Failure
		|| conclusion === GitHubCheckConclusion.TimedOut
		|| conclusion === GitHubCheckConclusion.ActionRequired;
}

export function getCheckGroup(check: IGitHubCICheck): CICheckGroup {
	switch (check.status) {
		case GitHubCheckStatus.InProgress:
			return CICheckGroup.Running;
		case GitHubCheckStatus.Queued:
			return CICheckGroup.Pending;
		case GitHubCheckStatus.Completed:
			return isFailedConclusion(check.conclusion) ? CICheckGroup.Failed : CICheckGroup.Successful;
	}
}

export function getCheckStateLabel(check: IGitHubCICheck): string {
	switch (getCheckGroup(check)) {
		case CICheckGroup.Running:
			return localize('ci.runningState', "running");
		case CICheckGroup.Pending:
			return localize('ci.pendingState', "pending");
		case CICheckGroup.Failed:
			return localize('ci.failedState', "failed");
		case CICheckGroup.Successful:
			return localize('ci.successfulState', "successful");
	}
}

export function getFailedChecks(checks: readonly IGitHubCICheck[]): readonly IGitHubCICheck[] {
	return checks.filter(check => getCheckGroup(check) === CICheckGroup.Failed);
}

export function buildFixChecksPrompt(failedChecks: ReadonlyArray<{ check: IGitHubCICheck; annotations: string }>): string {
	const sections = failedChecks.map(({ check, annotations }) => {
		const parts = [
			`Check: ${check.name}`,
			`Status: ${getCheckStateLabel(check)}`,
			`Conclusion: ${check.conclusion ?? 'unknown'}`,
		];

		if (check.detailsUrl) {
			parts.push(`Details: ${check.detailsUrl}`);
		}

		parts.push('', 'Annotations and output:', annotations || 'No output available for this check run.');
		return parts.join('\n');
	});

	return [
		'Please fix the failed CI checks for this session immediately.',
		'Use the failed check information below, including annotations and check output, to identify the root causes and make the necessary code changes.',
		'Focus on resolving these CI failures. Avoid unrelated changes unless they are required to fix the checks.',
		'',
		'Failed CI checks:',
		'',
		sections.join('\n\n---\n\n'),
	].join('\n');
}

/**
 * Sets the `hasActiveSessionFailedCIChecks` context key to true when the
 * active session has a PR with CI checks and at least one has failed.
 */
class ActiveSessionFailedCIChecksContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.activeSessionFailedCIChecksContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
		@IGitHubService gitHubService: IGitHubService,
	) {
		super();

		const ciModelObs = derived(this, reader => {
			const session = sessionManagementService.activeSession.read(reader);
			if (!session) {
				return undefined;
			}
			const gitHubInfo = session.gitHubInfo.read(reader);
			if (!gitHubInfo?.pullRequest) {
				return undefined;
			}
			const prModel = gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			const pr = prModel.pullRequest.read(reader);
			if (!pr) {
				return undefined;
			}
			return gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number, pr.headSha);
		});

		this._register(bindContextKey(hasActiveSessionFailedCIChecks, contextKeyService, reader => {
			const ciModel = ciModelObs.read(reader);
			if (!ciModel) {
				return false;
			}
			const checks = ciModel.checks.read(reader);
			return getFailedChecks(checks).length > 0;
		}));
	}
}

class FixCIChecksAction extends Action2 {

	static readonly ID = 'sessions.action.fixCIChecks';

	constructor() {
		super({
			id: FixCIChecksAction.ID,
			title: localize2('fixCIChecks', 'Fix CI Checks'),
			icon: Codicon.lightbulbAutofix,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasActiveSessionFailedCIChecks),
			menu: [{
				id: MenuId.ChatEditingSessionApplySubmenu,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionFailedCIChecks),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionManagementService = accessor.get(ISessionsManagementService);
		const gitHubService = accessor.get(IGitHubService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const logService = accessor.get(ILogService);

		const activeSession = sessionManagementService.activeSession.get();
		if (!activeSession) {
			return;
		}

		const gitHubInfo = activeSession.gitHubInfo.get();
		if (!gitHubInfo?.pullRequest) {
			return;
		}

		const prModel = gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
		const pr = prModel.pullRequest.get();
		if (!pr) {
			return;
		}

		const ciModel = gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number, pr.headSha);
		const checks = ciModel.checks.get();
		const failedChecks = getFailedChecks(checks);
		if (failedChecks.length === 0) {
			return;
		}

		const failedCheckDetails = await Promise.all(failedChecks.map(async check => {
			const annotations = await ciModel.getCheckRunAnnotations(check.id);
			return { check, annotations };
		}));

		const prompt = buildFixChecksPrompt(failedCheckDetails);
		const sessionResource = activeSession.resource;
		const chatWidget = chatWidgetService.getWidgetBySessionResource(sessionResource)
			?? await chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		if (!chatWidget) {
			logService.error('[FixCIChecks] Cannot fix CI checks: no chat widget found for session', sessionResource.toString());
			return;
		}

		await chatWidget.acceptInput(prompt, { noCommandDetection: true });
	}
}

registerWorkbenchContribution2(ActiveSessionFailedCIChecksContextContribution.ID, ActiveSessionFailedCIChecksContextContribution, WorkbenchPhase.AfterRestored);
registerAction2(FixCIChecksAction);
