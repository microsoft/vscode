/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { appendEscapedMarkdownInlineCode } from '../../../base/common/htmlContent.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { GitHubActor, PullRequestCheck, PullRequestChecks, PullRequestSnapshot } from '../../github/common/githubPullRequestService.js';
import { SessionConfigKey } from './sessionConfigKeys.js';

export const AgentMergeConfigKey = {
	Enabled: 'agentMerge.enabled',
	AddressReviews: 'agentMerge.addressReviews',
	FixCI: 'agentMerge.fixCI',
	ResolveConflicts: 'agentMerge.resolveConflicts',
	MergePullRequest: 'agentMerge.mergePullRequest',
	MergeMethod: 'agentMerge.mergeMethod',
	ReplyAttribution: 'agentMerge.replyAttribution',
} as const;

export const AgentMergeSettingId = {
	Enabled: 'chat.agentMerge.enabled',
	AddressReviews: 'chat.agentMerge.addressReviews',
	FixCI: 'chat.agentMerge.fixCI',
	ResolveConflicts: 'chat.agentMerge.resolveConflicts',
	MergePullRequest: 'chat.agentMerge.mergePullRequest',
	MergeMethod: 'chat.agentMerge.mergeMethod',
	ReplyAttribution: 'chat.agentMerge.replyAttribution',
} as const;

/**
 * Settings-editor tag carried by every Agent Merge setting, so the UI can open
 * settings filtered to exactly this group with `@tag:agentMerge`.
 */
export const AGENT_MERGE_SETTING_TAG = 'agentMerge';

/**
 * Work the agent itself can be asked to perform. Merging is deliberately absent:
 * it is executed by the host, never delegated to a model.
 */
export type AgentMergeRepairAction = 'addressReviews' | 'fixCI' | 'resolveConflicts';

/** A user-authorizable Agent Merge action, including the host-executed merge. */
export type AgentMergeAction = AgentMergeRepairAction | 'mergePullRequest';
export type AgentMergeMethod = 'auto' | 'squash' | 'merge' | 'rebase';

/**
 * When Agent Merge may merge the pull request once it is ready.
 *
 * `ifUnchanged` is self-demoting rather than evaluated at merge time: the
 * moment a repair turn lands a commit the session's value is rewritten to
 * `never`, so the chosen value always reflects what will actually happen.
 * Re-selecting `ifUnchanged` starts a fresh baseline from that point.
 */
export type AgentMergeMergePullRequest = 'always' | 'ifUnchanged' | 'never';

export const agentMergeMergePullRequestValues: readonly AgentMergeMergePullRequest[] = ['always', 'ifUnchanged', 'never'];

export interface AgentMergeActions {
	readonly addressReviews: boolean;
	readonly fixCI: boolean;
	readonly resolveConflicts: boolean;
	readonly mergePullRequest: AgentMergeMergePullRequest;
}

export interface AgentMergeConfiguration extends AgentMergeActions {
	readonly mergeMethod: AgentMergeMethod;
	readonly replyAttribution: boolean;
}

export interface AgentMergeSessionOverrides {
	readonly addressReviews?: boolean;
	readonly fixCI?: boolean;
	readonly resolveConflicts?: boolean;
	readonly mergePullRequest?: AgentMergeMergePullRequest;
}

export interface AgentMergeTarget {
	readonly branchName: string;
	readonly pullRequestUrl?: string;
	readonly enabledAt: string;
	readonly commentWatermark: string;
}

export interface AgentMergeReviewThreadContext {
	readonly id: string;
	readonly path?: string;
	readonly line?: number;
	/** Authorized comments in the thread, oldest first, so later follow-ups are visible. */
	readonly comments: readonly AgentMergeFeedbackComment[];
}

export interface AgentMergeFeedbackComment {
	readonly author?: string;
	readonly body: string;
}

export interface AgentMergeInjectedConfiguration {
	readonly previous: Readonly<Record<string, unknown>>;
	readonly applied: Readonly<Record<string, unknown>>;
}

export interface AgentMergeSessionState {
	readonly enabled: boolean;
	readonly overrides?: AgentMergeSessionOverrides;
	readonly target?: AgentMergeTarget;
	readonly injectedConfiguration?: AgentMergeInjectedConfiguration;
	readonly lastPromptFingerprint?: string;
	readonly lastPromptAt?: string;
	readonly repeatedPromptCount?: number;
	readonly totalPromptCount?: number;
	/**
	 * Local worktree commit observed when the most recent repair turn started.
	 * A different local commit afterwards means that turn produced work, which
	 * is what demotes an `ifUnchanged` session to `never`.
	 *
	 * Deliberately the local commit rather than the pull request's published
	 * head: GitHub reports a push only after some replication delay, and a turn
	 * ends by evaluating immediately, so a published comparison would routinely
	 * read a stale head and merge changes it should have held back.
	 */
	readonly repairBaseCommit?: string;
}

export interface AgentMergeControllerState {
	readonly target?: AgentMergeTarget;
	readonly injectedConfiguration?: AgentMergeInjectedConfiguration;
	readonly lastPromptFingerprint?: string;
	readonly lastPromptAt?: string;
	readonly repeatedPromptCount?: number;
	readonly totalPromptCount?: number;
	readonly repairBaseCommit?: string;
}

export type AgentMergeRequiredChecks =
	| { readonly kind: 'ready'; readonly failed: readonly PullRequestCheck[]; readonly pending: boolean }
	| { readonly kind: 'indeterminate'; readonly reason: string };

export const agentMergeRootConfigSchema = createSchema({
	[AgentMergeConfigKey.Enabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentMerge.config.enabled', "Agent Merge"),
		default: false,
	}),
	[AgentMergeConfigKey.AddressReviews]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentMerge.config.addressReviews', "Address Reviews"),
		default: true,
	}),
	[AgentMergeConfigKey.FixCI]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentMerge.config.fixCI', "Fix CI Failures"),
		default: true,
	}),
	[AgentMergeConfigKey.ResolveConflicts]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentMerge.config.resolveConflicts', "Resolve Conflicts"),
		default: true,
	}),
	[AgentMergeConfigKey.MergePullRequest]: schemaProperty<AgentMergeMergePullRequest>({
		type: 'string',
		title: localize('agentMerge.config.mergePullRequest', "Merge Pull Request"),
		enum: ['always', 'ifUnchanged', 'never'],
		default: 'never',
	}),
	[AgentMergeConfigKey.MergeMethod]: schemaProperty<AgentMergeMethod>({
		type: 'string',
		title: localize('agentMerge.config.mergeMethod', "Merge Method"),
		enum: ['auto', 'squash', 'merge', 'rebase'],
		default: 'auto',
	}),
	[AgentMergeConfigKey.ReplyAttribution]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentMerge.config.replyAttribution', "Reply Attribution"),
		default: true,
	}),
});

export const defaultAgentMergeConfiguration: AgentMergeConfiguration = {
	addressReviews: true,
	fixCI: true,
	resolveConflicts: true,
	mergePullRequest: 'never',
	mergeMethod: 'auto',
	replyAttribution: true,
};

export type AgentMergeGateResult =
	| { readonly kind: 'indeterminate'; readonly reason: string; readonly cause: string }
	| { readonly kind: 'terminal' }
	| { readonly kind: 'noWork'; readonly waitingOnChecks: boolean; readonly fingerprint: string }
	| { readonly kind: 'prompt'; readonly actions: readonly AgentMergeRepairAction[]; readonly fingerprint: string; readonly context: AgentMergePromptContext }
	| { readonly kind: 'merge'; readonly fingerprint: string };

export interface AgentMergePromptContext {
	readonly pullRequestUrl: string;
	readonly title: string;
	readonly headSha: string;
	readonly baseRef: string;
	readonly headRef: string;
	readonly reviewThreads: readonly AgentMergeReviewThreadContext[];
	readonly reviewSummaries: readonly AgentMergeFeedbackComment[];
	readonly newComments: readonly AgentMergeFeedbackComment[];
	readonly failedChecks: readonly string[];
	readonly behind: boolean;
	readonly conflicting: boolean;
	readonly commentWatermark: string;
}

/** Caps that keep an autonomous prompt bounded regardless of pull request size. */
const maximumReviewThreads = 10;
const maximumCommentsPerThread = 5;
const maximumReviewSummaries = 5;
const maximumNewComments = 5;
const maximumFailedChecks = 20;
const maximumFeedbackBodyLength = 1_000;
const maximumFeedbackBudget = 20_000;

const maintainerAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const copilotPullRequestReviewerId = '175728472';
const copilotPullRequestReviewerLogins = new Set(['copilot', 'copilot-pull-request-reviewer[bot]']);
const successfulCheckConclusions = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const mergeableStates = new Set(['CLEAN', 'HAS_HOOKS', 'UNSTABLE']);

export function resolveAgentMergeConfiguration(defaults: AgentMergeConfiguration, overrides: AgentMergeSessionOverrides | undefined): AgentMergeConfiguration {
	return {
		...defaults,
		...overrides,
	};
}

/**
 * Maps the configured merge method onto a method the repository actually
 * allows. `auto` prefers squash, then a merge commit, then rebase; an
 * explicitly configured method is only used when the repository permits it.
 */
export function resolveMergeMethod(configured: AgentMergeMethod, allowed: readonly ('MERGE' | 'SQUASH' | 'REBASE')[]): 'MERGE' | 'SQUASH' | 'REBASE' | undefined {
	if (configured !== 'auto') {
		const method = configured.toUpperCase() as 'MERGE' | 'SQUASH' | 'REBASE';
		return allowed.includes(method) ? method : undefined;
	}
	return (['SQUASH', 'MERGE', 'REBASE'] as const).find(method => allowed.includes(method));
}

/**
 * Why Agent Merge stopped monitoring a session. Keeping both strings together
 * lets the controller log a stable English detail while the transcript shows a
 * localized sentence, without either drifting from the other.
 */
export interface AgentMergeDisableReason {
	/** Stable English detail appended to the host log line. */
	readonly log: string;
	/** Localized sentence shown to the user in the session transcript. */
	readonly notice: string;
}

/** Every reason the Agent Merge controller can stop monitoring a session on its own. */
export const agentMergeDisableReasons = {
	sessionArchived: (): AgentMergeDisableReason => ({
		log: 'the session was archived',
		notice: localize('agentMerge.disabled.sessionArchived', "Agent Merge was turned off because this session was archived."),
	}),
	branchChanged: (from: string, to: string): AgentMergeDisableReason => ({
		log: `branch changed from ${from} to ${to}`,
		notice: localize(
			'agentMerge.disabled.branchChanged',
			"Agent Merge was turned off because the checked-out branch changed from {0} to {1}.",
			appendEscapedMarkdownInlineCode(from),
			appendEscapedMarkdownInlineCode(to)
		),
	}),
	branchChangedWhileRefreshing: (): AgentMergeDisableReason => ({
		log: 'the checked-out branch changed while pull request state was refreshing',
		notice: localize('agentMerge.disabled.branchChangedWhileRefreshing', "Agent Merge was turned off because the checked-out branch changed while its pull request state was refreshing."),
	}),
	differentPullRequest: (): AgentMergeDisableReason => ({
		log: 'the session became associated with a different pull request',
		notice: localize('agentMerge.disabled.differentPullRequest', "Agent Merge was turned off because this session became associated with a different pull request."),
	}),
	invalidPullRequestUrl: (): AgentMergeDisableReason => ({
		log: 'the associated pull request URL is invalid',
		notice: localize('agentMerge.disabled.invalidPullRequestUrl', "Agent Merge was turned off because the associated pull request URL is invalid."),
	}),
	differentGitHubHost: (): AgentMergeDisableReason => ({
		log: 'the bound pull request belongs to a different GitHub host than the signed-in account',
		notice: localize('agentMerge.disabled.differentGitHubHost', "Agent Merge was turned off because its pull request belongs to a different GitHub host than the signed-in account."),
	}),
	indeterminate: (minutes: number, reason: string): AgentMergeDisableReason => ({
		log: `the pull request state could not be evaluated for ${minutes} minutes: ${reason}`,
		notice: localize('agentMerge.disabled.indeterminate', "Agent Merge was turned off because its pull request state could not be evaluated for {0} minutes.", minutes),
	}),
	pullRequestClosed: (): AgentMergeDisableReason => ({
		log: 'the pull request is closed or merged',
		notice: localize('agentMerge.disabled.pullRequestClosed', "Agent Merge was turned off because its pull request is closed or merged."),
	}),
	repairBudgetExhausted: (): AgentMergeDisableReason => ({
		log: 'the same pull request blockers remained after repeated repair attempts',
		notice: localize('agentMerge.disabled.repairBudgetExhausted', "Agent Merge was turned off because the same pull request blockers remained after repeated repair attempts."),
	}),
	pullRequestMerged: (): AgentMergeDisableReason => ({
		log: 'the pull request was merged',
		notice: localize('agentMerge.disabled.pullRequestMerged', "Agent Merge merged its pull request and turned itself off."),
	}),
} as const;

/** The transcript notice shown once Agent Merge starts watching a branch. */
export function agentMergeEnabledNotice(branchName: string): string {
	return localize('agentMerge.notice.enabled', "Agent Merge is on and watching {0}.", appendEscapedMarkdownInlineCode(branchName));
}

/** The transcript notice shown when the user, rather than the controller, turns Agent Merge off. */
export function agentMergeDisabledNotice(): string {
	return localize('agentMerge.notice.disabled', "Agent Merge was turned off for this session.");
}

/**
 * The transcript notice shown when Agent Merge stops merging automatically
 * because its own repair work changed the pull request.
 */
export function agentMergeMergePullRequestDemotedNotice(): string {
	return localize('agentMerge.notice.mergeDemoted', "Agent Merge changed this pull request, so automatic merging was turned off for this session. Review the changes, then turn it back on if you want it merged automatically.");
}

export function readAgentMergeSessionState(values: Record<string, unknown> | undefined): AgentMergeSessionState | undefined {
	const value = values?.[SessionConfigKey.AgentMerge];
	if (!isRecord(value) || typeof value.enabled !== 'boolean') {
		return undefined;
	}
	const controller = isRecord(values?.[SessionConfigKey.AgentMergeController]) ? values[SessionConfigKey.AgentMergeController] : {};
	const overrides = readOverrides(value.overrides);
	const target = readTarget(controller.target);
	const injectedConfiguration = readInjectedConfiguration(controller.injectedConfiguration);
	return {
		enabled: value.enabled,
		...(overrides ? { overrides } : {}),
		...(target ? { target } : {}),
		...(injectedConfiguration ? { injectedConfiguration } : {}),
		...(typeof controller.lastPromptFingerprint === 'string' ? { lastPromptFingerprint: controller.lastPromptFingerprint } : {}),
		...(typeof controller.lastPromptAt === 'string' ? { lastPromptAt: controller.lastPromptAt } : {}),
		...(typeof controller.repeatedPromptCount === 'number' && Number.isInteger(controller.repeatedPromptCount) && controller.repeatedPromptCount >= 0 ? { repeatedPromptCount: controller.repeatedPromptCount } : {}),
		...(typeof controller.totalPromptCount === 'number' && Number.isInteger(controller.totalPromptCount) && controller.totalPromptCount >= 0 ? { totalPromptCount: controller.totalPromptCount } : {}),
		...(typeof controller.repairBaseCommit === 'string' ? { repairBaseCommit: controller.repairBaseCommit } : {}),
	};
}

/**
 * Returns session config values with Agent Merge injected overrides removed,
 * so callers can read the user's own picker selections while merge is active.
 */
export function getNonMergeSessionConfigValues(values: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
	if (!values) {
		return {};
	}
	const agentMerge = readAgentMergeSessionState(values as Record<string, unknown>);
	const injected = agentMerge?.injectedConfiguration;
	if (!agentMerge?.enabled || !injected) {
		return values;
	}
	const restored = { ...values };
	for (const [key, appliedValue] of Object.entries(injected.applied)) {
		if (!structuralEquals(restored[key], appliedValue)) {
			continue;
		}
		if (Object.hasOwn(injected.previous, key)) {
			const previousValue = injected.previous[key];
			if (previousValue === undefined) {
				delete restored[key];
			} else {
				restored[key] = previousValue;
			}
		} else {
			delete restored[key];
		}
	}
	return restored;
}

export function isAgentMergeFeedbackAuthor(actor: GitHubActor | undefined): boolean {
	if (!actor) {
		return false;
	}
	return maintainerAssociations.has(actor.association?.toUpperCase() ?? '')
		|| actor.id === copilotPullRequestReviewerId
		|| copilotPullRequestReviewerLogins.has(actor.login.toLowerCase());
}

function readOverrides(value: unknown): AgentMergeSessionOverrides | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const result: Record<string, unknown> = {};
	for (const action of ['addressReviews', 'fixCI', 'resolveConflicts'] as const) {
		if (typeof value[action] === 'boolean') {
			result[action] = value[action];
		}
	}
	// Migrates sessions written before this was an enum, so an explicit opt-in
	// is not silently downgraded to the more conservative default.
	const mergePullRequest = value.mergePullRequest;
	if (typeof mergePullRequest === 'boolean') {
		result.mergePullRequest = mergePullRequest ? 'always' : 'never';
	} else if (isAgentMergeMergePullRequest(mergePullRequest)) {
		result.mergePullRequest = mergePullRequest;
	}
	return Object.keys(result).length > 0 ? result as AgentMergeSessionOverrides : undefined;
}

/**
 * Recorded as the repair baseline when the session worktree cannot be read.
 * No git object id can equal it, so a session that reached this state always
 * counts as changed — see {@link shouldStopMergingAfterAgentChanges}.
 */
export const AGENT_MERGE_UNKNOWN_COMMIT = 'unknown';

/**
 * Whether a session that only authorized merging while the pull request is
 * unchanged must stop merging automatically, because a repair turn produced
 * work since it started.
 *
 * Compares local worktree commits, not the pull request's published head: the
 * commit exists locally the moment the agent makes it, whereas GitHub reports
 * it only after a replication delay that a turn-completion check would race.
 *
 * Fails closed. Once a repair turn has run, a commit that cannot be resolved
 * counts as a change: a missed automatic merge is cheap, whereas merging
 * agent-written changes the user wanted to review first is not.
 *
 * Callers rewrite the chosen value to `never` rather than gating on this, so
 * the value always reflects what will actually happen. Clearing
 * {@link AgentMergeSessionState.repairBaseCommit} at the same time is what lets
 * a later re-selection start from a fresh baseline.
 */
export function shouldStopMergingAfterAgentChanges(
	configuration: AgentMergeConfiguration,
	agentMerge: AgentMergeSessionState,
	currentCommit: string | undefined,
): boolean {
	if (configuration.mergePullRequest !== 'ifUnchanged' || agentMerge.repairBaseCommit === undefined) {
		return false;
	}
	return agentMerge.repairBaseCommit !== currentCommit;
}

export function isAgentMergeMergePullRequest(value: unknown): value is AgentMergeMergePullRequest {
	return typeof value === 'string' && (agentMergeMergePullRequestValues as readonly string[]).includes(value);
}

function readTarget(value: unknown): AgentMergeTarget | undefined {
	if (!isRecord(value)
		|| typeof value.branchName !== 'string'
		|| typeof value.enabledAt !== 'string'
		|| typeof value.commentWatermark !== 'string'
		|| (value.pullRequestUrl !== undefined && typeof value.pullRequestUrl !== 'string')) {
		return undefined;
	}
	return {
		branchName: value.branchName,
		enabledAt: value.enabledAt,
		commentWatermark: value.commentWatermark,
		...(typeof value.pullRequestUrl === 'string' ? { pullRequestUrl: value.pullRequestUrl } : {}),
	};
}

function readInjectedConfiguration(value: unknown): AgentMergeInjectedConfiguration | undefined {
	if (!isRecord(value) || !isRecord(value.previous) || !isRecord(value.applied)) {
		return undefined;
	}
	return { previous: value.previous, applied: value.applied };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Truncates feedback bodies against one shared character budget so a
 * comment-heavy pull request cannot grow the autonomous prompt without bound.
 */
class FeedbackBudget {

	private _remaining: number;

	constructor(budget: number) {
		this._remaining = budget;
	}

	take(author: string | undefined, body: string | undefined): AgentMergeFeedbackComment {
		const text = (body ?? '').slice(0, Math.max(0, Math.min(maximumFeedbackBodyLength, this._remaining)));
		this._remaining -= text.length;
		return {
			...(author ? { author } : {}),
			body: text,
		};
	}
}

export function evaluateAgentMerge(snapshot: PullRequestSnapshot, configuration: AgentMergeConfiguration, commentWatermark: string): AgentMergeGateResult {
	const core = snapshot.core;
	if (core.status !== 'ready' || !core.complete || !core.value) {
		return { kind: 'indeterminate', reason: 'Pull request core state is incomplete', cause: 'core:incomplete' };
	}
	if (core.value.state !== 'open') {
		return { kind: 'terminal' };
	}
	const incomplete = firstIncompleteFragment(snapshot, core.value.headSha);
	if (incomplete) {
		return { kind: 'indeterminate', ...describeIncompleteFragment(snapshot, incomplete) };
	}

	const checks = classifyAgentMergeRequiredChecks(snapshot.checks.value!);
	if (checks.kind === 'indeterminate') {
		return { kind: 'indeterminate', reason: checks.reason, cause: `checks:${checks.reason}` };
	}

	const reviewThreads = snapshot.reviewThreads.value!
		.filter(thread => !thread.isResolved && thread.comments.some(comment => isAgentMergeFeedbackAuthor(comment.author)));
	const latestReviews = latestReviewsByAuthor(snapshot.submittedReviews.value!);
	const changesRequested = latestReviews.filter(review => review.state.toUpperCase() === 'CHANGES_REQUESTED' && isAgentMergeFeedbackAuthor(review.author));
	const watermark = Date.parse(commentWatermark);
	const newComments = snapshot.topLevelComments.value!.filter(comment =>
		isAgentMergeFeedbackAuthor(comment.author)
		&& comment.createdAt !== undefined
		&& Date.parse(comment.createdAt) > watermark
	);
	const mergeability = snapshot.mergeability.value!;
	const behind = mergeability.mergeStateStatus?.toUpperCase() === 'BEHIND';
	const conflicting = mergeability.mergeable === 'CONFLICTING';
	const actions: AgentMergeRepairAction[] = [];
	if (configuration.addressReviews && (reviewThreads.length > 0 || changesRequested.length > 0 || newComments.length > 0)) {
		actions.push('addressReviews');
	}
	if (configuration.fixCI && checks.failed.length > 0) {
		actions.push('fixCI');
	}
	if (configuration.resolveConflicts && (behind || conflicting)) {
		actions.push('resolveConflicts');
	}

	const budget = new FeedbackBudget(maximumFeedbackBudget);
	const context: AgentMergePromptContext = {
		pullRequestUrl: core.value.url,
		title: core.value.title,
		headSha: core.value.headSha,
		baseRef: core.value.baseRef,
		headRef: core.value.headRef,
		reviewThreads: reviewThreads.slice(0, maximumReviewThreads).map(thread => ({
			id: thread.id,
			...(thread.path ? { path: thread.path } : {}),
			...(thread.line !== undefined ? { line: thread.line } : {}),
			comments: thread.comments
				.filter(comment => isAgentMergeFeedbackAuthor(comment.author))
				.slice(-maximumCommentsPerThread)
				.map(comment => budget.take(comment.author?.login, comment.body)),
		})),
		reviewSummaries: changesRequested
			.slice(-maximumReviewSummaries)
			.map(review => budget.take(review.author?.login, review.body)),
		newComments: newComments
			.slice(-maximumNewComments)
			.map(comment => budget.take(comment.author?.login, comment.body)),
		failedChecks: checks.failed.slice(0, maximumFailedChecks).map(check => check.name),
		behind,
		conflicting,
		commentWatermark: newComments.reduce((latest, comment) => comment.createdAt && comment.createdAt > latest ? comment.createdAt : latest, commentWatermark),
	};
	const fingerprint = JSON.stringify({ actions, context });
	if (actions.length > 0) {
		return { kind: 'prompt', actions, fingerprint, context };
	}

	const reviewsReady = !configuration.addressReviews || (reviewThreads.length === 0 && changesRequested.length === 0 && newComments.length === 0);
	const mergeReady = !core.value.draft
		&& reviewsReady
		&& checks.failed.length === 0
		&& !checks.pending
		&& !behind
		&& !conflicting
		&& mergeability.mergeable === 'MERGEABLE'
		&& mergeability.viewerCanMerge
		&& mergeableStates.has(mergeability.mergeStateStatus?.toUpperCase() ?? 'CLEAN');
	if (configuration.mergePullRequest !== 'never' && mergeReady) {
		return { kind: 'merge', fingerprint };
	}
	return { kind: 'noWork', waitingOnChecks: checks.pending, fingerprint };
}

function isCompleteFragment(snapshot: PullRequestSnapshot, fragment: 'topLevelComments' | 'submittedReviews' | 'reviewThreads'): boolean {
	const state = snapshot[fragment];
	return state.status === 'ready' && state.complete && state.value !== undefined;
}

function isCompleteHeadFragment(snapshot: PullRequestSnapshot, fragment: 'checks' | 'mergeability', headSha: string): boolean {
	const state = snapshot[fragment];
	return state.status === 'ready' && state.complete && state.value !== undefined && state.headSha === headSha;
}

const conversationFragments = ['topLevelComments', 'submittedReviews', 'reviewThreads'] as const;
const headFragments = ['checks', 'mergeability'] as const;

type EvaluatedFragment = typeof conversationFragments[number] | typeof headFragments[number];

/** Fragments the gate must be able to read before it can decide anything. */
export const agentMergeGateFragments = ['core', ...conversationFragments, ...headFragments] as const;

function firstIncompleteFragment(snapshot: PullRequestSnapshot, headSha: string): EvaluatedFragment | undefined {
	for (const fragment of conversationFragments) {
		if (!isCompleteFragment(snapshot, fragment)) {
			return fragment;
		}
	}
	for (const fragment of headFragments) {
		if (!isCompleteHeadFragment(snapshot, fragment, headSha)) {
			return fragment;
		}
	}
	return undefined;
}

/** Describes why a fragment blocks evaluation, with a `cause` that stays stable while the condition lasts. */
function describeIncompleteFragment(snapshot: PullRequestSnapshot, fragment: EvaluatedFragment): { readonly reason: string; readonly cause: string } {
	const state = snapshot[fragment];
	if (state.error) {
		return {
			reason: `Pull request ${fragment} could not be loaded (${state.error.kind}): ${state.error.message}`,
			cause: `${fragment}:${state.error.kind}`,
		};
	}
	return {
		reason: `Pull request ${fragment} state is incomplete or stale (status=${state.status}, complete=${state.complete})`,
		cause: `${fragment}:incomplete`,
	};
}

function latestReviewsByAuthor(reviews: PullRequestSnapshot['submittedReviews']['value']): NonNullable<typeof reviews> {
	const latest = new Map<string, NonNullable<typeof reviews>[number]>();
	for (const review of reviews ?? []) {
		if (review.state.toUpperCase() === 'COMMENTED' || review.state.toUpperCase() === 'PENDING') {
			continue;
		}
		const key = review.author?.id ?? review.author?.login.toLowerCase() ?? review.id;
		const current = latest.get(key);
		if (!current || (review.submittedAt ?? '') >= (current.submittedAt ?? '')) {
			latest.set(key, review);
		}
	}
	return [...latest.values()];
}

export function classifyAgentMergeRequiredChecks(checks: PullRequestChecks): AgentMergeRequiredChecks {
	if (!checks.requirednessComplete) {
		return { kind: 'indeterminate', reason: 'Required check classification is incomplete' };
	}
	const required = checks.checks.filter(check => check.required === true);
	if (checks.checks.some(check => check.required === undefined)) {
		return { kind: 'indeterminate', reason: 'A check has unknown requiredness' };
	}
	const failed: PullRequestCheck[] = [];
	let pending = false;
	for (const check of required) {
		const status = check.status?.toUpperCase();
		if (check.type === 'statusContext') {
			if (status === 'PENDING' || !status) {
				pending = true;
			} else if (status !== 'SUCCESS') {
				failed.push(check);
			}
			continue;
		}
		if (status !== 'COMPLETED') {
			pending = true;
		} else if (!successfulCheckConclusions.has(check.conclusion?.toUpperCase() ?? '')) {
			failed.push(check);
		}
	}
	return { kind: 'ready', failed, pending };
}
