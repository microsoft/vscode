/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { FragmentState, PullRequestCore, PullRequestSnapshot, PullRequestSubscriptionOptions } from '../../github/common/githubPullRequestService.js';
import { GitHubRepositoryRef } from '../../github/common/githubQueryService.js';
import { IGitHubService } from '../../github/common/githubService.js';
import { GitHubRequestError } from '../../github/common/githubTransport.js';
import { IWorkflowCheckRegistry, WorkflowCheckContext, WorkflowCheckResult, WorkflowObject, WorkflowRun } from './workflow.js';
import { parseWorkflowTimestamp, registerWorkflowCalendarCheck } from './workflowCalendar.js';

export interface IBuiltinWorkflowCheckDependencies {
	readonly fileService: IFileService;
	readonly githubService: IGitHubService;
	readonly allowedResourceRoots: (run: WorkflowRun) => readonly URI[] | Promise<readonly URI[]>;
}

const retryAfterMs = 300_000;
const successfulConclusions = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const fileSchemes = new Set<string>([Schemas.file, Schemas.vscodeRemote, Schemas.vscodeUserData]);
const fullCommitPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;

interface RepositoryIdentity {
	readonly owner: string;
	readonly repo: string;
	readonly uri: string;
	readonly origin: string;
}

class CheckInputError extends Error {
	constructor(readonly kind: 'blocked' | 'rejected', message: string) {
		super(message);
	}
}

type CheckEvaluator = (context: WorkflowCheckContext, token: CancellationToken, signal: AbortSignal) => Promise<WorkflowCheckResult>;

export function registerBuiltinWorkflowChecks(registry: IWorkflowCheckRegistry, dependencies: IBuiltinWorkflowCheckDependencies): IDisposable {
	const registrations = new DisposableStore();
	const register = (id: string, evaluate: CheckEvaluator) => registrations.add(registry.register({
		id,
		evaluate: async (context, token) => {
			throwIfCancelled(token);
			const controller = new AbortController();
			const operation = new DisposableStore();
			operation.add(token.onCancellationRequested(() => controller.abort(new CancellationError())));
			try {
				const result = await evaluate(context, token, controller.signal);
				throwIfCancelled(token);
				return result;
			} catch (error) {
				throwIfCancelled(token);
				if (error instanceof CheckInputError) {
					return { kind: error.kind, reason: error.message };
				}
				if (error instanceof GitHubRequestError) {
					return gitHubFailure(context, error);
				}
				return { kind: 'blocked', reason: localize('workflowChecks.unknownError', "The checkpoint check failed without an authoritative result. Resolve the resource or service failure and retry.") };
			} finally {
				operation.dispose();
				controller.abort();
			}
		},
	}));
	try {
		register('vscode.workspace/file-exists@1', (context, token) => checkFile(context, dependencies, token));
		register('vscode.github/pull-request-draft@1', (context, token, signal) => checkPullRequest('draft', context, dependencies.githubService, token, signal));
		register('vscode.github/pull-request-ready@1', (context, token, signal) => checkPullRequest('ready', context, dependencies.githubService, token, signal));
		register('vscode.github/pull-request-open@1', (context, token, signal) => checkPullRequest('open', context, dependencies.githubService, token, signal));
		register('vscode.github/pull-request-merged@1', (context, token, signal) => checkPullRequest('merged', context, dependencies.githubService, token, signal));
		register('vscode.github/pull-request-merged@2', (context, token, signal) => checkPullRequest('merged', context, dependencies.githubService, token, signal, true));
		register('vscode.github/issue-exists@1', (context, token, signal) => checkIssue(context, dependencies.githubService, token, signal));
		register('vscode.github/commit-in-release@1', (context, _token, signal) => checkRelease(context, dependencies.githubService, signal));
		registrations.add(registerWorkflowCalendarCheck(registry));
		return registrations;
	} catch (error) {
		registrations.dispose();
		throw error;
	}
}

async function checkFile(context: WorkflowCheckContext, dependencies: IBuiltinWorkflowCheckDependencies, token: CancellationToken): Promise<WorkflowCheckResult> {
	const uri = requiredString(context.proof, 'uri', 'rejected');
	let resource: URI;
	try {
		resource = URI.parse(uri, true);
	} catch {
		return { kind: 'rejected', reason: localize('workflowChecks.fileUri', "Submit an absolute URI for the saved plan file.") };
	}
	if (!fileSchemes.has(resource.scheme) || resource.query || resource.fragment
		|| resource.path.split(/[\\/]/).includes('..')) {
		return { kind: 'rejected', reason: localize('workflowChecks.fileScheme', "The plan must be a file resource inside an allowed workspace or session root.") };
	}
	const roots = await raceCancellationError(Promise.resolve(dependencies.allowedResourceRoots(context.run)), token);
	const matchingRoots = roots.filter(root => fileSchemes.has(root.scheme) && extUriBiasedIgnorePathCase.isEqualOrParent(resource, root));
	if (matchingRoots.length === 0) {
		return { kind: 'rejected', reason: localize('workflowChecks.fileScope', "The plan URI is outside the resource roots allowed for this workflow.") };
	}
	try {
		const [resolvedResource, resolvedRoots] = await raceCancellationError(Promise.all([
			dependencies.fileService.realpath(resource),
			Promise.all(matchingRoots.map(async root => await dependencies.fileService.realpath(root) ?? root)),
		]), token);
		const canonical = resolvedResource ?? resource;
		if (!resolvedRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(canonical, root))) {
			return { kind: 'rejected', reason: localize('workflowChecks.fileSymlinkScope', "The plan resolves outside the allowed resource roots.") };
		}
		const stat = await raceCancellationError(dependencies.fileService.stat(canonical), token);
		if (!stat.isFile || stat.isSymbolicLink) {
			return { kind: 'rejected', reason: localize('workflowChecks.notFile', "The plan URI must resolve to an existing regular file.") };
		}
		return {
			kind: 'satisfied',
			output: { uri: canonical.toString() },
			evidence: [{ kind: 'file', uri: canonical.toString(), label: localize('workflowChecks.planEvidence', "Saved plan (existence checked)") }],
		};
	} catch (error) {
		if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			return { kind: 'rejected', reason: localize('workflowChecks.fileMissing', "The plan file does not exist. Save it before submitting proof.") };
		}
		throw error;
	}
}

async function checkPullRequest(kind: 'draft' | 'ready' | 'open' | 'merged', context: WorkflowCheckContext, service: IGitHubService, token: CancellationToken, signal: AbortSignal, includeMergeTime = false): Promise<WorkflowCheckResult> {
	const repository = parseRepository(requiredString(context.inputs, 'repository'), service);
	const proofNumber = resourceNumber(requiredString(context.proof, 'uri', 'rejected'), 'pull', repository, service, 'rejected');
	if (kind !== 'draft') {
		const boundNumber = resourceNumber(requiredString(context.inputs, 'pullRequest'), 'pull', repository, service, 'blocked');
		if (proofNumber !== boundNumber) {
			return { kind: 'rejected', reason: localize('workflowChecks.differentPr', "Submit the pull request bound by the previous checked checkpoint, not a different pull request.") };
		}
	}
	const ref = { ...await repositoryRef(repository, service, signal), number: proofNumber };
	const options: PullRequestSubscriptionOptions = kind === 'ready'
		? { priority: 'background', core: true, checks: { required: true, includeOptional: true }, conversation: { reviewThreads: true }, mergeability: true }
		: { priority: 'background', core: true };
	const store = new DisposableStore();
	try {
		const subscription = store.add(service.pullRequests.subscribePullRequest(ref, options));
		await subscription.refresh(undefined, token);
		if (kind === 'ready') {
			await subscription.refresh('core', token);
		}
		const snapshot = subscription.resource.snapshot.get();
		const incomplete = incompleteFragment(snapshot.core);
		if (incomplete) {
			return incomplete;
		}
		const core = snapshot.core.value!;
		if (core.number !== proofNumber || !fullCommitPattern.test(core.headSha)) {
			return { kind: 'blocked', reason: localize('workflowChecks.prIdentity', "GitHub did not return the requested pull request and a complete head commit identity.") };
		}
		const canonical = canonicalPullRequest(core, service);
		const output: WorkflowObject = { repository: canonical.repository, pullRequest: canonical.pullRequest, headSha: core.headSha.toLowerCase() };
		if (kind === 'merged') {
			if (core.state === 'open') {
				return waiting(localize('workflowChecks.notMerged', "The bound pull request has not merged yet."));
			}
			if (core.state !== 'merged') {
				return { kind: 'rejected', reason: localize('workflowChecks.closedUnmerged', "The bound pull request was closed without merging.") };
			}
			if (!core.mergeCommitSha || !fullCommitPattern.test(core.mergeCommitSha)) {
				return { kind: 'blocked', reason: localize('workflowChecks.integratedCommitUnknown', "GitHub reports the merge but has not provided its integrated commit. A pull request head or a guessed squash/rebase SHA cannot be used.") };
			}
			if (includeMergeTime) {
				const mergedAt = parseWorkflowTimestamp(core.mergedAt);
				if (mergedAt === undefined) {
					return { kind: 'blocked', reason: localize('workflowChecks.mergeTimeUnknown', "GitHub reports the merge but has not provided a valid merge timestamp. A reported date or the current time cannot be substituted.") };
				}
				return pullRequestSatisfied({ ...output, integratedCommit: core.mergeCommitSha.toLowerCase(), mergedAt: new Date(mergedAt).toISOString() }, canonical.pullRequest, core);
			}
			return pullRequestSatisfied({ ...output, integratedCommit: core.mergeCommitSha.toLowerCase() }, canonical.pullRequest, core);
		}
		if (core.state !== 'open' || (kind === 'open' ? core.draft : !core.draft)) {
			return {
				kind: 'rejected',
				reason: kind === 'open'
					? localize('workflowChecks.prNotOpen', "The bound pull request must be open and no longer a draft.")
					: localize('workflowChecks.prNotDraft', "The pull request must be open and still a draft."),
			};
		}
		if (kind === 'ready') {
			const readiness = pullRequestReadiness(snapshot);
			if (readiness) {
				return readiness;
			}
		}
		return pullRequestSatisfied(output, canonical.pullRequest, core);
	} finally {
		store.dispose();
	}
}

function pullRequestReadiness(snapshot: PullRequestSnapshot): WorkflowCheckResult | undefined {
	const core = snapshot.core.value!;
	for (const fragment of [snapshot.checks, snapshot.reviewThreads, snapshot.mergeability]) {
		const incomplete = incompleteFragment(fragment, core.headSha);
		if (incomplete) {
			return incomplete;
		}
	}
	const checks = snapshot.checks.value!;
	const mergeability = snapshot.mergeability.value!;
	if (checks.headSha !== core.headSha || mergeability.headSha !== core.headSha || mergeability.baseSha !== core.baseSha) {
		return waiting(localize('workflowChecks.headChanged', "The pull request head or base changed while checking readiness. Current-head facts must be observed again."));
	}
	if (!checks.requirednessComplete || !checks.expectedSuitesComplete || checks.checks.some(check => check.required === undefined)) {
		return waiting(localize('workflowChecks.requiredChecksIncomplete', "GitHub has not provided complete required-check and expected-suite information for this head."));
	}
	if (checks.expectedSuites.some(suite => !suite.checkRunsReported && (suite.status?.toUpperCase() !== 'COMPLETED' || !successfulConclusions.has(suite.conclusion?.toUpperCase() ?? '')))) {
		return waiting(localize('workflowChecks.suitesPending', "An expected CI suite has not reported its checks yet. Readiness is not established."));
	}
	for (const check of checks.checks.filter(check => check.required)) {
		const status = check.status?.toUpperCase();
		if (check.type === 'statusContext') {
			if (!status || status === 'PENDING' || status === 'EXPECTED') {
				return waiting(localize('workflowChecks.statusPending', "A required status check is pending for the current pull request head."));
			}
			if (status === 'SUCCESS') {
				continue;
			}
		} else {
			if (status !== 'COMPLETED') {
				return waiting(localize('workflowChecks.ciPending', "A required CI check has not completed for the current pull request head."));
			}
			if (successfulConclusions.has(check.conclusion?.toUpperCase() ?? '')) {
				continue;
			}
		}
		return { kind: 'rejected', reason: localize('workflowChecks.ciFailed', "A required CI check failed for the current pull request head. Repair the failure and submit proof again.") };
	}
	if (snapshot.reviewThreads.value!.some(thread => !thread.isResolved)) {
		return { kind: 'rejected', reason: localize('workflowChecks.unresolvedThreads', "The pull request has unresolved review threads. Resolve them before submitting proof again.") };
	}
	if (mergeability.mergeable === 'CONFLICTING') {
		return { kind: 'rejected', reason: localize('workflowChecks.conflicts', "The pull request has merge conflicts. Resolve them before submitting proof again.") };
	}
	if (mergeability.mergeable !== 'MERGEABLE') {
		return waiting(localize('workflowChecks.mergeabilityUnknown', "GitHub has not yet established whether the current pull request head can merge without conflicts."));
	}
	return undefined;
}

async function checkIssue(context: WorkflowCheckContext, service: IGitHubService, token: CancellationToken, signal: AbortSignal): Promise<WorkflowCheckResult> {
	const repository = parseRepository(requiredString(context.inputs, 'repository'), service);
	const number = resourceNumber(requiredString(context.proof, 'uri', 'rejected'), 'issues', repository, service, 'rejected');
	const ref = { ...await repositoryRef(repository, service, signal), number };
	const store = new DisposableStore();
	try {
		const subscription = store.add(service.query.subscribeIssue(ref, { priority: 'background' }));
		await subscription.refresh(token);
		const state = subscription.resource.state.get();
		const incomplete = incompleteFragment(state);
		if (incomplete) {
			return incomplete;
		}
		const issue = state.value!;
		if (issue.number !== number) {
			return { kind: 'blocked', reason: localize('workflowChecks.issueIdentity', "GitHub did not return the issue identified by the proof.") };
		}
		const url = githubUrl(issue.url, service);
		const canonicalRepository = parseRepository(`${url.origin}/${url.pathname.split('/')[1]}/${url.pathname.split('/')[2]}`, service);
		if (resourceNumber(issue.url, 'issues', canonicalRepository, service, 'blocked') !== number) {
			return { kind: 'blocked', reason: localize('workflowChecks.canonicalIssue', "GitHub returned inconsistent canonical issue information.") };
		}
		return {
			kind: 'satisfied',
			output: { repository: canonicalRepository.uri, issue: url.href },
			evidence: [{ kind: 'issue', uri: url.href, label: issue.title, state: issue.state, ...(issue.stateReason ? { stateReason: issue.stateReason } : {}) }],
		};
	} finally {
		store.dispose();
	}
}

async function checkRelease(context: WorkflowCheckContext, service: IGitHubService, signal: AbortSignal): Promise<WorkflowCheckResult> {
	if (context.options.release !== 'published-stable') {
		return { kind: 'blocked', reason: localize('workflowChecks.releaseOption', "The release condition requires the explicit published-stable release option.") };
	}
	const repository = parseRepository(requiredString(context.inputs, 'repository'), service);
	const commit = requiredString(context.inputs, 'commit').toLowerCase();
	if (!fullCommitPattern.test(commit)) {
		return { kind: 'blocked', reason: localize('workflowChecks.commitIdentity', "The release condition needs the full integrated commit from the checked merge receipt.") };
	}
	const ref = await repositoryRef(repository, service, signal);
	const previous = context.previousState;
	const resumePage = previous?.repository === repository.uri && previous.commit === commit
		&& typeof previous.nextPage === 'number' && Number.isSafeInteger(previous.nextPage) && previous.nextPage > 1
		? previous.nextPage : 2;
	let page = 1;
	let nextPage: number | undefined;
	for (let batch = 0; batch < 2; batch++) {
		const releases = await service.query.listReleases(ref, page, signal);
		for (const release of releases.releases) {
			if (release.draft || release.prerelease || !release.publishedAt) {
				continue;
			}
			const tag = await service.query.resolveTag(ref, release.tagName, signal);
			const ancestry = await service.query.compareCommitAncestry(ref, commit, tag.commitSha, signal);
			if (ancestry.baseSha !== commit || ancestry.headSha !== tag.commitSha) {
				return { kind: 'blocked', reason: localize('workflowChecks.ancestryIdentity', "The release ancestry result did not match the bound integrated commit and release tag.") };
			}
			if (!ancestry.isAncestor) {
				continue;
			}
			const [currentPage, currentTag] = await Promise.all([
				service.query.listReleases(ref, page, signal),
				service.query.resolveTag(ref, release.tagName, signal),
			]);
			const currentRelease = currentPage.releases.find(candidate => candidate.id === release.id);
			if (!currentRelease || currentRelease.draft || currentRelease.prerelease || !currentRelease.publishedAt
				|| currentRelease.tagName !== release.tagName || currentTag.tagSha !== tag.tagSha || currentTag.commitSha !== tag.commitSha) {
				return waiting(localize('workflowChecks.releaseChanged', "The release or its tag changed during observation. The published release relationship must be checked again."));
			}
			const releaseUri = githubUrl(currentRelease.url, service).href;
			return {
				kind: 'satisfied',
				output: {
					repository: repository.uri,
					integratedCommit: commit,
					release: releaseUri,
					releaseId: currentRelease.id,
					releaseTag: currentRelease.tagName,
					releaseCommit: tag.commitSha,
					tagSha: tag.tagSha,
					publishedAt: currentRelease.publishedAt,
				},
				evidence: [{ kind: 'link', uri: releaseUri, label: localize('workflowChecks.releaseEvidence', "Published stable release containing the integrated commit") }],
			};
		}
		nextPage = releases.nextPage;
		if (!nextPage) {
			break;
		}
		page = batch === 0 ? resumePage : nextPage;
	}
	return waiting(
		nextPage
			? localize('workflowChecks.releaseSearchIncomplete', "The bounded release search is incomplete. No published stable release containing the integrated commit has been proven; older pages will be checked next.")
			: localize('workflowChecks.releasePending', "No observed published stable release contains the integrated commit. A cherry-picked or otherwise unproven equivalent cannot satisfy this condition."),
		{ repository: repository.uri, commit, nextPage: nextPage ?? 2 },
	);
}

function incompleteFragment(fragment: FragmentState<object>, headSha?: string): WorkflowCheckResult | undefined {
	if (fragment.error) {
		throw new GitHubRequestError(fragment.error.message, fragment.error.kind, fragment.error.statusCode);
	}
	if (fragment.status !== 'ready' || !fragment.complete || fragment.value === undefined || headSha !== undefined && fragment.headSha !== headSha) {
		return waiting(localize('workflowChecks.fragmentIncomplete', "GitHub facts are missing, incomplete, stale, or for an older head. A complete current snapshot is required."));
	}
	return undefined;
}

function gitHubFailure(context: WorkflowCheckContext, error: GitHubRequestError): WorkflowCheckResult {
	if (error.kind === 'rateLimit') {
		return waiting(localize('workflowChecks.rateLimit', "GitHub rate limiting prevented this check. No successful result was recorded; it will be retried with shared backoff."), context.previousState, 900_000);
	}
	if (error.kind === 'network' || error.kind === 'server' || error.kind === 'unknown') {
		const previous = context.previousState;
		const failures = previous?.transientFailureKind === error.kind && typeof previous.transientFailureCount === 'number'
			&& Number.isSafeInteger(previous.transientFailureCount) && previous.transientFailureCount > 0
			? previous.transientFailureCount + 1 : 1;
		if (failures < 3) {
			return waiting(
				localize('workflowChecks.transientFailure', "GitHub has not established the required facts ({0}). The check will retry with backoff; no successful result was recorded.", error.kind),
				{ ...previous, transientFailureKind: error.kind, transientFailureCount: failures },
				retryAfterMs * failures,
			);
		}
	}
	return {
		kind: 'blocked',
		reason: localize('workflowChecks.githubError', "GitHub could not establish this checkpoint ({0}). Check authentication, repository access, and service availability before retrying.", error.kind),
	};
}

function canonicalPullRequest(core: PullRequestCore, service: IGitHubService): { readonly repository: string; readonly pullRequest: string } {
	const url = githubUrl(core.url, service);
	const repository = parseRepository(`${url.origin}/${core.repositoryNameWithOwner}`, service);
	if (resourceNumber(core.url, 'pull', repository, service, 'blocked') !== core.number) {
		throw new CheckInputError('blocked', localize('workflowChecks.canonicalPr', "GitHub returned inconsistent canonical pull request information."));
	}
	return { repository: repository.uri, pullRequest: url.href };
}

function pullRequestSatisfied(output: WorkflowObject, uri: string, core: PullRequestCore): WorkflowCheckResult {
	return { kind: 'satisfied', output, evidence: [{ kind: 'pullRequest', uri, label: core.title, state: core.state === 'open' && core.draft ? 'draft' : core.state }] };
}

function waiting(reason: string, state?: WorkflowObject, delay = retryAfterMs): WorkflowCheckResult {
	return { kind: 'waiting', reason, retryAfterMs: delay, ...(state ? { state } : {}) };
}

function requiredString(value: WorkflowObject | undefined, key: string, kind: 'blocked' | 'rejected' = 'blocked'): string {
	const result = value?.[key];
	if (typeof result !== 'string' || !result.trim() || result.length > 2_048) {
		throw new CheckInputError(kind, localize('workflowChecks.requiredString', "The workflow field '{0}' must be a nonempty, bounded string.", key));
	}
	return result;
}

function githubUrl(value: string, service: IGitHubService, kind: 'blocked' | 'rejected' = 'blocked'): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new CheckInputError(kind, localize('workflowChecks.githubUri', "Supply an absolute GitHub resource URI."));
	}
	if (url.protocol !== 'https:' || url.origin !== githubOrigin(service) || url.username || url.password || url.search || url.hash) {
		throw new CheckInputError(kind, localize('workflowChecks.githubScope', "The resource must be an HTTPS URI on the configured GitHub host, without credentials, a query, or a fragment."));
	}
	return url;
}

function githubOrigin(service: IGitHubService): string {
	const endpoint = new URL(service.endpoint.getApiBaseUri());
	return `https://${endpoint.host.toLowerCase() === 'api.github.com' ? 'github.com' : endpoint.host.toLowerCase()}`;
}

function parseRepository(value: string, service: IGitHubService): RepositoryIdentity {
	const url = githubUrl(value, service);
	const parts = /^\/(?<owner>[a-z\d_.-]+)\/(?<repo>[a-z\d_.-]+)\/?$/i.exec(url.pathname)?.groups;
	if (!parts || parts.owner === '.' || parts.owner === '..' || parts.repo === '.' || parts.repo === '..') {
		throw new CheckInputError('blocked', localize('workflowChecks.repositoryUri', "The bound repository must be a GitHub repository URI, not an issue, pull request, or arbitrary URL."));
	}
	return { owner: parts.owner, repo: parts.repo, uri: `${url.origin}/${parts.owner}/${parts.repo}`, origin: url.origin };
}

function resourceNumber(value: string, resource: 'pull' | 'issues', repository: RepositoryIdentity, service: IGitHubService, kind: 'blocked' | 'rejected'): number {
	const url = githubUrl(value, service, kind);
	const parts = url.pathname.split('/');
	const number = Number(parts[4]);
	if (parts.length !== 5 || parts[1].toLowerCase() !== repository.owner.toLowerCase() || parts[2].toLowerCase() !== repository.repo.toLowerCase()
		|| parts[3] !== resource || !/^[1-9]\d*$/.test(parts[4]) || !Number.isSafeInteger(number)) {
		throw new CheckInputError(kind, localize('workflowChecks.resourceIdentity', "The proof must identify the expected resource in the bound GitHub repository."));
	}
	return number;
}

async function repositoryRef(repository: RepositoryIdentity, service: IGitHubService, signal: AbortSignal): Promise<GitHubRepositoryRef> {
	const credential = await service.credentials.getCredential(signal);
	if (repository.origin !== githubOrigin(service) || credential.account.host.toLowerCase() !== new URL(service.endpoint.getApiBaseUri()).host.toLowerCase()) {
		throw new GitHubRequestError('GitHub endpoint or account changed during the workflow check', 'authentication');
	}
	return { ...credential.account, owner: repository.owner, repo: repository.repo };
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
