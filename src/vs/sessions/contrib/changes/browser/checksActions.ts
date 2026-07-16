/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubCheckConclusion, GitHubCheckStatus, IGitHubCICheck } from '../../github/common/types.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
export const hasActiveSessionFailedCIChecks = new RawContextKey<boolean>('sessions.hasActiveSessionFailedCIChecks', false);

/**
 * True when the user has already requested a CI fix for the active session's
 * current PR head commit. Used to hide the "Fix Checks" action until a new
 * commit lands on the PR.
 */
export const activeSessionCIFixRequested = new RawContextKey<boolean>('sessions.activeSessionCIFixRequested', false);

/** Command that sends the `fix-ci` prompt for the active session's failed checks. */
export const FIX_CI_CHECKS_COMMAND_ID = 'sessions.action.fixCIChecks';

/** Command that opens the Changes view and reveals (expands + focuses) the CI checks section. */
export const REVEAL_CI_CHECKS_COMMAND_ID = 'sessions.action.revealCIChecks';

/** Slash command that invokes the built-in `fix-ci` skill. */
const FIX_CI_QUERY = '/fix-ci';

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

/** Builds the GitHub pull request URL for a CI model's coordinates. */
export function getPullRequestUrl(coords: { owner: string; repo: string; prNumber: number }): string {
	return `https://github.com/${coords.owner}/${coords.repo}/pull/${coords.prNumber}`;
}

export function buildFixChecksPrompt(failedChecks: ReadonlyArray<{ check: IGitHubCICheck; annotations: string }>, prUrl?: string): string {
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

	const lines = [FIX_CI_QUERY];
	if (prUrl) {
		lines.push(`Pull request: ${prUrl}`);
	}
	lines.push(
		'Failed CI checks:',
		'',
		sections.join('\n\n---\n\n'),
	);

	return lines.join('\n');
}

/**
 * Builds the `fix-ci` prompt for a CI model's failing checks: fetches each
 * failed check's annotations and assembles the prompt text. Returns `undefined`
 * when there are no failing checks. Shared by the widget-based active-session
 * action and the blocked-sessions list's background fix.
 */
export async function buildFixCIPrompt(ciModel: GitHubPullRequestCIModel): Promise<string | undefined> {
	const checks = ciModel.checks.get();
	const failedChecks = getFailedChecks(checks);
	if (failedChecks.length === 0) {
		return undefined;
	}

	const failedCheckDetails = await Promise.all(failedChecks.map(async check => {
		const annotations = await ciModel.getCheckRunAnnotations(check.id);
		return { check, annotations };
	}));

	return buildFixChecksPrompt(failedCheckDetails, getPullRequestUrl(ciModel));
}

/**
 * Submits the `fix-ci` prompt for a session's failing CI checks: builds the
 * prompt, sends it to the given chat widget, and marks the fix as requested so
 * the "Fix Checks" affordances hide until a new commit lands. Used by the
 * active-session action; the blocked-sessions list sends in the background via
 * {@link buildFixCIPrompt} instead.
 */
export async function submitFixCIChecks(ciModel: GitHubPullRequestCIModel, chatWidget: IChatWidget): Promise<void> {
	const prompt = await buildFixCIPrompt(ciModel);
	if (!prompt) {
		return;
	}

	const response = await chatWidget.acceptInput(prompt);
	if (response) {
		ciModel.markFixRequested();
	}
}

/**
 * Sets the `hasActiveSessionFailedCIChecks` context key to true when the
 * active session has a PR with CI checks and at least one has failed.
 */
class ActiveSessionFailedCIChecksContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.activeSessionFailedCIChecksContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IGitHubService gitHubService: IGitHubService,
	) {
		super();

		this._register(bindContextKey(hasActiveSessionFailedCIChecks, contextKeyService, reader => {
			const ciModel = gitHubService.activeSessionPullRequestCIObs.read(reader);
			if (!ciModel) {
				return false;
			}
			const checks = ciModel.checks.read(reader);
			return getFailedChecks(checks).length > 0;
		}));

		this._register(bindContextKey(activeSessionCIFixRequested, contextKeyService, reader => {
			const ciModel = gitHubService.activeSessionPullRequestCIObs.read(reader);
			if (!ciModel) {
				return false;
			}
			return ciModel.fixRequested.read(reader);
		}));
	}
}

class FixCIChecksAction extends Action2 {

	static readonly ID = FIX_CI_CHECKS_COMMAND_ID;

	constructor() {
		super({
			id: FixCIChecksAction.ID,
			title: localize2('fixChecks', 'Fix Checks'),
			icon: Codicon.lightbulbAutofix,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasActiveSessionFailedCIChecks, activeSessionCIFixRequested.negate()),
			menu: [{
				id: MenuId.AgentsChangesPrimaryActionSubMenu,
				group: '5_checks',
				order: 4,
				when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionFailedCIChecks, activeSessionCIFixRequested.negate()),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const gitHubService = accessor.get(IGitHubService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const logService = accessor.get(ILogService);

		const activeSession = sessionsService.activeSession.get();
		if (!activeSession) {
			return;
		}

		const ciModel = gitHubService.activeSessionPullRequestCIObs.get();
		if (!ciModel) {
			return;
		}

		const sessionResource = activeSession.resource;
		const chatWidget = chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!chatWidget) {
			logService.error('[FixCIChecks] Cannot fix CI checks: no chat widget found for session', sessionResource.toString());
			return;
		}

		await submitFixCIChecks(ciModel, chatWidget);
	}
}

registerWorkbenchContribution2(ActiveSessionFailedCIChecksContextContribution.ID, ActiveSessionFailedCIChecksContextContribution, WorkbenchPhase.AfterRestored);
registerAction2(FixCIChecksAction);
