/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IChatWidget } from '../../chat/browser/chat.js';
import { GitHubPullRequestCIModel } from './github/models/githubPullRequestCIModel.js';
import { GitHubCheckStatus, IGitHubCICheck } from '../common/github/types.js';
import { PullRequestCheck } from '../../../../platform/github/common/githubPullRequestService.js';
import { getPullRequestCheckState, isUnreportedCheckSuite, RequiredPullRequestChecks } from '../../../../platform/github/common/pullRequestRequiredChecks.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IGitHubSessionPullRequestObservables } from './github/githubService.js';

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

/** Groups a check run by how it stands (see {@link getPullRequestCheckState}), telling running checks from queued ones. */
export function getCheckGroup(check: IGitHubCICheck): CICheckGroup {
	switch (getPullRequestCheckState({ type: 'checkRun', status: check.status, conclusion: check.conclusion })) {
		case 'failed':
			return CICheckGroup.Failed;
		case 'passed':
			return CICheckGroup.Successful;
		case 'pending':
			return check.status === GitHubCheckStatus.InProgress ? CICheckGroup.Running : CICheckGroup.Pending;
	}
}

/**
 * Counts the checks that count (see {@link GitHubPullRequestCIModel.requiredChecks}):
 * those that failed, those that finished, and those yet to finish, including
 * required checks that have not reported yet.
 */
export function countRequiredChecks(required: RequiredPullRequestChecks): { readonly failed: number; readonly completed: number; readonly pending: number } {
	const running = required.checks.filter(check => getPullRequestCheckState(check) === 'pending').length;
	return { failed: required.failed.length, completed: required.checks.length - running, pending: running + required.missing.length };
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

/** Builds the GitHub pull request URL for a CI model's coordinates. */
export function getPullRequestUrl(coords: { owner: string; repo: string; prNumber: number }): string {
	return `https://github.com/${coords.owner}/${coords.repo}/pull/${coords.prNumber}`;
}

export function buildFixChecksPrompt(failedChecks: ReadonlyArray<{ check: PullRequestCheck; annotations: string }>, prUrl?: string, query: string = FIX_CI_QUERY): string {
	const sections = failedChecks.map(({ check, annotations }) => {
		const parts = [
			`Check: ${check.name}`,
			`Status: ${check.status ?? 'unknown'}`,
			`Conclusion: ${check.conclusion ?? 'unknown'}`,
		];

		if (check.detailsUrl) {
			parts.push(`Details: ${check.detailsUrl}`);
		}

		parts.push('', 'Annotations and output:', annotations || 'No output available for this check run.');
		return parts.join('\n');
	});

	const lines = [query];
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
 * Builds the `fix-ci` prompt for the failed checks that count (see
 * {@link GitHubPullRequestCIModel.requiredChecks}): fetches the annotations of
 * each failed check run and assembles the prompt text. Returns `undefined` when
 * no check that counts failed, including while that is still loading. Shared by
 * the widget-based active-session action and the blocked-sessions list's
 * background fix.
 */
export async function buildFixCIPrompt(ciModel: GitHubPullRequestCIModel, query?: string): Promise<string | undefined> {
	const failedChecks = ciModel.requiredChecks.get()?.failed ?? [];
	if (failedChecks.length === 0) {
		return undefined;
	}

	const failedCheckDetails = await Promise.all(failedChecks.map(async check => {
		// A commit status, or a check suite that reported no check run, has no annotations to read.
		const annotations = check.type === 'checkRun' && !isUnreportedCheckSuite(check) ? await ciModel.getCheckRunAnnotations(Number(check.id)) : '';
		return { check, annotations };
	}));

	return buildFixChecksPrompt(failedCheckDetails, getPullRequestUrl(ciModel), query);
}

/**
 * Submits the `fix-ci` prompt for a session's failing CI checks: builds the
 * prompt, sends it to the given chat widget, and marks the fix as requested so
 * the "Fix Checks" affordances hide until a new commit lands. Used by the
 * active-session action; the blocked-sessions list sends in the background via
 * {@link buildFixCIPrompt} instead.
 */
export async function submitFixCIChecks(ciModel: GitHubPullRequestCIModel, chatWidget: IChatWidget, query?: string): Promise<void> {
	const prompt = await buildFixCIPrompt(ciModel, query);
	if (!prompt) {
		return;
	}

	const response = await chatWidget.acceptInput(prompt);
	if (response) {
		ciModel.markFixRequested();
	}
}

export const hasActiveSessionFailedCIChecks = new RawContextKey<boolean>('sessions.hasActiveSessionFailedCIChecks', false);

/**
 * True when the user has already requested a CI fix for the active session's
 * current PR head commit. Used to hide the "Fix Checks" action until a new
 * commit lands on the PR.
 */
export const activeSessionCIFixRequested = new RawContextKey<boolean>('sessions.activeSessionCIFixRequested', false);

/**
 * Binds `hasActiveSessionFailedCIChecks` (a failed check that counts on the pull
 * request of the session; see {@link GitHubPullRequestCIModel.requiredChecks}) and
 * `activeSessionCIFixRequested` on the given context key service.
 */
export function bindSessionCIChecksContextKeys(pullRequest: Pick<IGitHubSessionPullRequestObservables, 'pullRequestCIObs'>, contextKeyService: IContextKeyService): IDisposable {
	const store = new DisposableStore();
	store.add(bindContextKey(hasActiveSessionFailedCIChecks, contextKeyService, reader => {
		const ciModel = pullRequest.pullRequestCIObs.read(reader);
		if (!ciModel) {
			return false;
		}
		return (ciModel.requiredChecks.read(reader)?.failed.length ?? 0) > 0;
	}));
	store.add(bindContextKey(activeSessionCIFixRequested, contextKeyService, reader => {
		const ciModel = pullRequest.pullRequestCIObs.read(reader);
		if (!ciModel) {
			return false;
		}
		return ciModel.fixRequested.read(reader);
	}));
	return store;
}
