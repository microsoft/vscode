/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
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
	Enabled: 'chat.agentHost.agentMerge.enabled',
	AddressReviews: 'chat.agentHost.agentMerge.addressReviews',
	FixCI: 'chat.agentHost.agentMerge.fixCI',
	ResolveConflicts: 'chat.agentHost.agentMerge.resolveConflicts',
	MergePullRequest: 'chat.agentHost.agentMerge.mergePullRequest',
	MergeMethod: 'chat.agentHost.agentMerge.mergeMethod',
	ReplyAttribution: 'chat.agentHost.agentMerge.replyAttribution',
} as const;

export type AgentMergeAction = 'addressReviews' | 'fixCI' | 'resolveConflicts' | 'mergePullRequest';
export type AgentMergeMethod = 'auto' | 'squash' | 'merge' | 'rebase';

export interface AgentMergeActions {
	readonly addressReviews: boolean;
	readonly fixCI: boolean;
	readonly resolveConflicts: boolean;
	readonly mergePullRequest: boolean;
}

export interface AgentMergeConfiguration extends AgentMergeActions {
	readonly mergeMethod: AgentMergeMethod;
	readonly replyAttribution: boolean;
}

export interface AgentMergeSessionOverrides {
	readonly addressReviews?: boolean;
	readonly fixCI?: boolean;
	readonly resolveConflicts?: boolean;
	readonly mergePullRequest?: boolean;
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
}

export interface AgentMergeControllerState {
	readonly target?: AgentMergeTarget;
	readonly injectedConfiguration?: AgentMergeInjectedConfiguration;
	readonly lastPromptFingerprint?: string;
	readonly lastPromptAt?: string;
	readonly repeatedPromptCount?: number;
	readonly totalPromptCount?: number;
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
	[AgentMergeConfigKey.MergePullRequest]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentMerge.config.mergePullRequest', "Merge Pull Request"),
		default: false,
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
	mergePullRequest: false,
	mergeMethod: 'auto',
	replyAttribution: true,
};

export type AgentMergeGateResult =
	| { readonly kind: 'indeterminate'; readonly reason: string }
	| { readonly kind: 'terminal' }
	| { readonly kind: 'noWork'; readonly waitingOnChecks: boolean; readonly fingerprint: string }
	| { readonly kind: 'prompt'; readonly actions: readonly AgentMergeAction[]; readonly fingerprint: string; readonly context: AgentMergePromptContext }
	| { readonly kind: 'merge'; readonly fingerprint: string };

export interface AgentMergePromptContext {
	readonly pullRequestUrl: string;
	readonly title: string;
	readonly headSha: string;
	readonly baseRef: string;
	readonly headRef: string;
	readonly reviewThreads: readonly AgentMergeReviewThreadContext[];
	readonly reviewSummaries: readonly string[];
	readonly newComments: readonly string[];
	readonly failedChecks: readonly string[];
	readonly behind: boolean;
	readonly conflicting: boolean;
	readonly commentWatermark: string;
}

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
	};
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
	const result: Record<string, boolean> = {};
	for (const action of ['addressReviews', 'fixCI', 'resolveConflicts', 'mergePullRequest'] as const) {
		if (typeof value[action] === 'boolean') {
			result[action] = value[action];
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
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

export function evaluateAgentMerge(snapshot: PullRequestSnapshot, configuration: AgentMergeConfiguration, commentWatermark: string): AgentMergeGateResult {
	const core = snapshot.core;
	if (core.status !== 'ready' || !core.complete || !core.value) {
		return { kind: 'indeterminate', reason: 'Pull request core state is incomplete' };
	}
	if (core.value.state !== 'open') {
		return { kind: 'terminal' };
	}
	if (!isCompleteFragment(snapshot, 'topLevelComments')
		|| !isCompleteFragment(snapshot, 'submittedReviews')
		|| !isCompleteFragment(snapshot, 'reviewThreads')
		|| !isCompleteHeadFragment(snapshot, 'checks', core.value.headSha)
		|| !isCompleteHeadFragment(snapshot, 'mergeability', core.value.headSha)) {
		return { kind: 'indeterminate', reason: 'Pull request state is incomplete or stale' };
	}

	const checks = classifyAgentMergeRequiredChecks(snapshot.checks.value!);
	if (checks.kind === 'indeterminate') {
		return { kind: 'indeterminate', reason: checks.reason };
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
	const actions: AgentMergeAction[] = [];
	if (configuration.addressReviews && (reviewThreads.length > 0 || changesRequested.length > 0 || newComments.length > 0)) {
		actions.push('addressReviews');
	}
	if (configuration.fixCI && checks.failed.length > 0) {
		actions.push('fixCI');
	}
	if (configuration.resolveConflicts && (behind || conflicting)) {
		actions.push('resolveConflicts');
	}

	const context: AgentMergePromptContext = {
		pullRequestUrl: core.value.url,
		title: core.value.title,
		headSha: core.value.headSha,
		baseRef: core.value.baseRef,
		headRef: core.value.headRef,
		reviewThreads: reviewThreads.slice(0, 20).map(thread => {
			const comment = thread.comments.find(candidate => isAgentMergeFeedbackAuthor(candidate.author));
			return {
				id: thread.id,
				...(thread.path ? { path: thread.path } : {}),
				...(thread.line !== undefined ? { line: thread.line } : {}),
				...(comment?.author?.login ? { author: comment.author.login } : {}),
				body: (comment?.body ?? '').slice(0, 1_000),
			};
		}),
		reviewSummaries: changesRequested.map(review => review.body ?? `Changes requested by ${review.author?.login ?? 'reviewer'}`),
		newComments: newComments.map(comment => comment.body ?? `Comment by ${comment.author?.login ?? 'reviewer'}`),
		failedChecks: checks.failed.map(check => check.name),
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
	if (configuration.mergePullRequest && mergeReady) {
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
