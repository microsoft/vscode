/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import {
	CreatedPullRequest,
	CreatePullRequestOptions,
	EnablePullRequestAutoMergeOptions,
	GitHubCheckAnnotation,
	GitHubWorkflowJob,
	GitHubWorkflowLog,
	GitHubWorkflowRerunOptions,
	GitHubWorkflowRun,
	PullRequestBranchUpdateOptions,
	PullRequestCommentOptions,
	PullRequestEnqueueResult,
	PullRequestMergeAuthorization,
	PullRequestMergeOptions,
	PullRequestMergePreparation,
	PullRequestMergeResult,
	PullRequestMutationApi,
	PullRequestMutationResult,
	PullRequestReplyAndResolveOptions,
	PullRequestReplyAndResolveResult,
	PullRequestReplyOptions,
} from './githubPullRequestMutationService.js';
import { GitHubRepositoryRef } from './githubQueryService.js';
import {
	PullRequestComment,
	GitHubFragmentError,
	PullRequestInlineComment,
	PullRequestRef,
	PullRequestResource,
	PullRequestSnapshot,
	PullRequestSubscription,
} from './githubPullRequestService.js';
import { IGitHubEndpointProvider } from './githubTypes.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from './githubCredentialService.js';
import { IGitHubScheduler, systemGitHubScheduler } from './githubScheduler.js';
import { GitHubGraphQLError, GitHubRequestError, IGitHubTransport } from './githubTransport.js';
import { IPullRequestResources } from './pullRequestResourceService.js';
import { PullRequestScheduler } from './pullRequestScheduler.js';

export interface IPullRequestMutations extends PullRequestMutationApi {
}

interface IPreparationState {
	readonly value: PullRequestMergePreparation;
	readonly resource: PullRequestResource;
	readonly subscription: PullRequestSubscription;
}

interface IUnconfirmedRerun {
	readonly operationId: string;
	readonly expectedRunAttempt: number;
}

const operationMarkerPrefix = '<!-- vscode-agent-host-operation:';
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maximumPaginationPages = 100;
const maximumWorkflowLogBytes = 2 * 1024 * 1024;
const workflowLogTimeout = 30_000;
const mergePreparationLifetime = 5 * 60_000;

// GitHub exposes `rateLimit` on the `Query` root only, so mutations must not select it. Mutation rate
// limits are still tracked from the `x-ratelimit-*` response headers by the transport.
const addReviewThreadReplyMutation = `mutation AgentHostAddPullRequestReviewThreadReply($threadId: ID!, $body: String!) {
	addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
		comment { id databaseId body url createdAt updatedAt author { login ... on User { databaseId } } }
	}
}`;

const resolveReviewThreadMutation = `mutation AgentHostResolvePullRequestReviewThread($threadId: ID!) {
	resolveReviewThread(input: { threadId: $threadId }) {
		thread { id isResolved }
	}
}`;

const enqueuePullRequestMutation = `mutation AgentHostEnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
	enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) {
		mergeQueueEntry { id }
	}
}`;

const enableAutoMergeMutation = `mutation AgentHostEnablePullRequestAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
	enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
		pullRequest { id }
	}
}`;

export class PullRequestMutationService extends Disposable implements IPullRequestMutations {

	private readonly _mutationTails = new Map<string, Promise<void>>();
	private readonly _preparations = new Map<string, IPreparationState>();
	private readonly _unconfirmedReruns = new Map<string, IUnconfirmedRerun>();
	private readonly _preparationScheduler: PullRequestScheduler;

	constructor(
		scheduler: IGitHubScheduler | undefined,
		private readonly _credentials: IGitHubCredentials,
		private readonly _transport: IGitHubTransport,
		private readonly _resources: IPullRequestResources,
		private readonly _endpoint: IGitHubEndpointProvider,
		private readonly _logService?: ILogService,
	) {
		super();
		this._clock = scheduler ?? systemGitHubScheduler;
		this._preparationScheduler = this._register(new PullRequestScheduler(this._clock));
		this._register(this._credentials.onDidInvalidate(event => this._handleCredentialInvalidation(event)));
	}

	private readonly _clock: IGitHubScheduler;

	createPullRequest(
		ref: GitHubRepositoryRef,
		options: CreatePullRequestOptions,
		signal: AbortSignal,
	): Promise<CreatedPullRequest> {
		return this._serializeRepository(ref, 'createPullRequest', async () => {
			const created = await this._withCredential(ref, signal, async (credential, combinedSignal) => {
				const response = await this._transport.rest<unknown>(credential.account, credential.token, {
					method: 'POST',
					url: this._restUrl(ref, 'pulls'),
					body: {
						title: options.title,
						body: options.body,
						head: options.head,
						base: options.base,
						draft: options.draft,
					},
					priority: 'mutation',
				}, combinedSignal);
				const value = asObject(response.data, 'GitHub create pull request response was malformed');
				const number = requiredNumber(value, 'number');
				return {
					ref: { ...ref, number },
					id: idProperty(value, 'node_id'),
					url: requiredString(value, 'html_url'),
					createdAt: stringProperty(value, 'created_at'),
				};
			});
			return created;
		});
	}

	enableAutoMerge(
		ref: GitHubRepositoryRef,
		options: EnablePullRequestAutoMergeOptions,
		signal: AbortSignal,
	): Promise<void> {
		return this._serializeRepository(ref, 'enableAutoMerge', async () => {
			await this._withCredential(ref, signal, async (credential, combinedSignal) => {
				const response = await this._transport.graphql(
					credential.account,
					credential.token,
					this._endpoint.getGraphQlUri(),
					enableAutoMergeMutation,
					{ pullRequestId: options.pullRequestId, mergeMethod: options.method },
					combinedSignal,
					'mutation',
				);
				throwGraphQLErrors(response.errors);
			});
		});
	}

	addComment(
		ref: PullRequestRef,
		options: PullRequestCommentOptions,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<PullRequestComment>> {
		return this._serialize(ref, 'addComment', () => this._addComment(ref, options, signal));
	}

	replyToThread(
		ref: PullRequestRef,
		options: PullRequestReplyOptions,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<PullRequestInlineComment>> {
		return this._serialize(ref, 'replyToThread', () => this._replyToThread(ref, options, signal));
	}

	resolveThread(ref: PullRequestRef, threadId: string, signal: AbortSignal): Promise<void> {
		return this._serialize(ref, 'resolveThread', async () => {
			await this._resolveThread(ref, threadId, signal);
			this._resources.invalidatePullRequest(ref, ['reviewThreads']);
		});
	}

	replyAndResolveThread(
		ref: PullRequestRef,
		options: PullRequestReplyAndResolveOptions,
		signal: AbortSignal,
	): Promise<PullRequestReplyAndResolveResult> {
		return this._serialize(ref, 'replyAndResolveThread', async () => {
			const reply = await this._replyToThread(ref, options, signal);
			if (reply.outcome === 'indeterminate' || !options.resolve) {
				return { reply, resolved: false };
			}
			try {
				await this._resolveThread(ref, options.threadId, signal);
				this._resources.invalidatePullRequest(ref, ['reviewThreads']);
				return { reply, resolved: true };
			} catch (error) {
				return { reply, resolved: false, resolveError: toFragmentError(error) };
			}
		});
	}

	listWorkflowRuns(ref: PullRequestRef, headSha: string, signal: AbortSignal): Promise<readonly GitHubWorkflowRun[]> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const values = await this._fetchRestArray(
				ref,
				credential,
				`actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
				combinedSignal,
				'workflow_runs',
			);
			return values.map(toWorkflowRun);
		});
	}

	listWorkflowJobs(ref: PullRequestRef, runId: string, signal: AbortSignal): Promise<readonly GitHubWorkflowJob[]> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const values = await this._fetchRestArray(
				ref,
				credential,
				`actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`,
				combinedSignal,
				'jobs',
			);
			return values.map(value => toWorkflowJob(value, runId));
		});
	}

	listCheckAnnotations(ref: PullRequestRef, checkRunId: string, signal: AbortSignal): Promise<readonly GitHubCheckAnnotation[]> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const values = await this._fetchRestArray(
				ref,
				credential,
				`check-runs/${encodeURIComponent(checkRunId)}/annotations?per_page=100`,
				combinedSignal,
			);
			return values.map(toCheckAnnotation);
		});
	}

	downloadWorkflowJobLog(ref: PullRequestRef, jobId: string, signal: AbortSignal): Promise<GitHubWorkflowLog> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const response = await this._transport.download(credential.account, credential.token, {
				url: this._restUrl(ref, `actions/jobs/${encodeURIComponent(jobId)}/logs`),
				maximumBytes: maximumWorkflowLogBytes,
				timeout: workflowLogTimeout,
				priority: 'interactive',
			}, combinedSignal);
			return {
				text: redactWorkflowLog(response.text),
				truncated: response.truncated,
			};
		});
	}

	rerunWorkflow(
		ref: PullRequestRef,
		options: GitHubWorkflowRerunOptions,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<GitHubWorkflowRun>> {
		return this._serialize(ref, 'rerunWorkflow', async () => {
			validateOperationId(options.operationId);
			const rerunKey = `${pullRequestMutationKey(ref)}\x00${options.runId}`;
			const unconfirmed = this._unconfirmedReruns.get(rerunKey);
			if (unconfirmed) {
				const run = await this._getWorkflowRun(ref, options.runId, signal);
				if (rerunConfirmed(run, unconfirmed.expectedRunAttempt)) {
					this._unconfirmedReruns.delete(rerunKey);
					this._resources.invalidatePullRequest(ref, ['checks']);
					return { outcome: 'reconciled', value: run };
				}
				if (!rerunProvenAbsent(run, unconfirmed.expectedRunAttempt)) {
					return { outcome: 'indeterminate', value: run };
				}
				this._unconfirmedReruns.delete(rerunKey);
			}

			try {
				await this._withCredential(ref, signal, async (credential, combinedSignal) => {
					await this._transport.rest(credential.account, credential.token, {
						method: 'POST',
						url: this._restUrl(
							ref,
							`actions/runs/${encodeURIComponent(options.runId)}/${options.failedJobsOnly ? 'rerun-failed-jobs' : 'rerun'}`,
						),
						priority: 'mutation',
					}, combinedSignal);
				});
				this._resources.invalidatePullRequest(ref, ['checks']);
				return { outcome: 'succeeded' };
			} catch (error) {
				if (!isAmbiguousMutationError(error)) {
					throw error;
				}
				this._unconfirmedReruns.set(rerunKey, {
					operationId: options.operationId,
					expectedRunAttempt: options.expectedRunAttempt,
				});
				const run = await this._tryGetWorkflowRun(ref, options.runId, signal);
				if (run && rerunConfirmed(run, options.expectedRunAttempt)) {
					this._unconfirmedReruns.delete(rerunKey);
					this._resources.invalidatePullRequest(ref, ['checks']);
					return { outcome: 'reconciled', value: run };
				}
				return { outcome: 'indeterminate', value: run };
			}
		});
	}

	updateBranch(ref: PullRequestRef, options: PullRequestBranchUpdateOptions, signal: AbortSignal): Promise<void> {
		return this._serialize(ref, 'updateBranch', async () => {
			if (!options.expectedHeadSha) {
				throw new Error('A branch update requires the expected head SHA');
			}
			await this._withCredential(ref, signal, async (credential, combinedSignal) => {
				await this._transport.rest(credential.account, credential.token, {
					method: 'PUT',
					url: this._restUrl(ref, `pulls/${ref.number}/update-branch`),
					body: { expected_head_sha: options.expectedHeadSha },
					priority: 'mutation',
				}, combinedSignal);
			});
			this._resources.invalidatePullRequest(ref, ['core', 'checks', 'mergeability']);
		});
	}

	prepareMerge(ref: PullRequestRef, expectedHeadSha: string, signal: AbortSignal): Promise<PullRequestMergePreparation> {
		return this._serialize(ref, 'prepareMerge', async () => {
			if (!expectedHeadSha) {
				throw new Error('Merge preparation requires an expected head SHA');
			}
			const subscription = this._resources.subscribePullRequest(ref, {
				priority: 'interactive',
				conversation: { topLevelComments: true, submittedReviews: true, reviewThreads: true },
				checks: { required: true, includeOptional: true },
				mergeability: true,
			});
			const cancellation = cancellationTokenFromSignal(signal);
			try {
				await subscription.refresh('core', cancellation.tokenSource.token, { authoritative: true });
				await Promise.all([
					subscription.refresh('checks', cancellation.tokenSource.token, { authoritative: true }),
					subscription.refresh('submittedReviews', cancellation.tokenSource.token, { authoritative: true }),
					subscription.refresh('reviewThreads', cancellation.tokenSource.token, { authoritative: true }),
					subscription.refresh('mergeability', cancellation.tokenSource.token, { authoritative: true }),
				]);
				// Refreshed last so that a comment posted while the fragments above were
				// in flight is still part of the captured snapshot. Callers gate merges on
				// new maintainer comments, and a comment that lands after this point bumps
				// the resource generation, which invalidates the preparation.
				await subscription.refresh('topLevelComments', cancellation.tokenSource.token, { authoritative: true });
				if (signal.aborted) {
					throw signal.reason ?? new Error('Merge preparation was cancelled');
				}
				const snapshot = subscription.resource.snapshot.get();
				validateMergeGateSnapshot(snapshot, expectedHeadSha);
				const token = generateUuid();
				const value: PullRequestMergePreparation = {
					token,
					ref: snapshot.ref,
					expectedHeadSha,
					resourceGeneration: snapshot.generation,
					headGeneration: snapshot.headGeneration,
					snapshot,
				};
				this._preparations.set(token, { value, resource: subscription.resource, subscription });
				this._preparationScheduler.schedule(token, this._clock.now() + mergePreparationLifetime, () => {
					const expired = this._preparations.get(token);
					if (expired) {
						expired.subscription.dispose();
						this._preparations.delete(token);
					}
				});
				return value;
			} catch (error) {
				subscription.dispose();
				if (signal.aborted) {
					throw signal.reason ?? error;
				}
				throw error;
			} finally {
				cancellation.dispose();
			}
		});
	}

	merge(
		preparation: PullRequestMergePreparation,
		options: PullRequestMergeOptions,
		signal: AbortSignal,
	): Promise<PullRequestMergeResult> {
		return this._serialize(preparation.ref, 'merge', async () => {
			const state = this._takePreparation(preparation);
			try {
				validateAuthorization(options.authorization);
				const snapshot = state.resource.snapshot.get();
				validatePreparationState(preparation, snapshot);
				validateMergeGateSnapshot(snapshot, preparation.expectedHeadSha);
				const mergeability = snapshot.mergeability.value!;
				if (!mergeability.queueRequirementKnown || mergeability.mergeQueueRequired) {
					throw new GitHubRequestError('Direct merge is unavailable because merge-queue requirements do not permit it', 'validation');
				}
				if (!mergeability.allowedMergeMethods.includes(options.method)) {
					throw new GitHubRequestError(`Merge method ${options.method} is not allowed`, 'validation');
				}
				try {
					const result = await this._withCredential(preparation.ref, signal, async (credential, combinedSignal) => {
						const response = await this._transport.rest<unknown>(credential.account, credential.token, {
							method: 'PUT',
							url: this._restUrl(preparation.ref, `pulls/${preparation.ref.number}/merge`),
							body: {
								sha: preparation.expectedHeadSha,
								merge_method: options.method.toLowerCase(),
								commit_title: options.title,
								commit_message: options.message,
							},
							priority: 'mutation',
						}, combinedSignal);
						return toMergeResult(response.data);
					});
					this._resources.invalidatePullRequest(preparation.ref, ['core', 'checks', 'mergeability']);
					return { outcome: 'succeeded', sha: result.sha, message: result.message };
				} catch (error) {
					if (!isAmbiguousMutationError(error)) {
						throw error;
					}
					this._resources.invalidatePullRequest(preparation.ref, ['core']);
					await state.subscription.refresh('core', undefined, { authoritative: true });
					const reconciled = state.resource.snapshot.get().core.value;
					if (reconciled?.state === 'merged') {
						return { outcome: 'reconciled', message: 'Pull request was merged' };
					}
					throw error;
				}
			} finally {
				state.subscription.dispose();
			}
		});
	}

	enqueue(
		preparation: PullRequestMergePreparation,
		authorization: PullRequestMergeAuthorization,
		signal: AbortSignal,
	): Promise<PullRequestEnqueueResult> {
		return this._serialize(preparation.ref, 'enqueue', async () => {
			const state = this._takePreparation(preparation);
			try {
				validateAuthorization(authorization);
				const snapshot = state.resource.snapshot.get();
				validatePreparationState(preparation, snapshot);
				validateMergeGateSnapshot(snapshot, preparation.expectedHeadSha);
				const mergeability = snapshot.mergeability.value!;
				if (!mergeability.queueRequirementKnown || !mergeability.mergeQueueRequired) {
					throw new GitHubRequestError('Merge queue is not authoritatively required for this pull request', 'validation');
				}
				if (mergeability.mergeQueueEntryId) {
					return { outcome: 'alreadyQueued', mergeQueueEntryId: mergeability.mergeQueueEntryId };
				}
				const pullRequestId = snapshot.core.value?.id;
				if (!pullRequestId) {
					throw new GitHubRequestError('Pull request node ID is required for merge queue enrollment', 'malformedResponse');
				}
				try {
					const entryId = await this._enqueuePullRequest(
						preparation.ref,
						pullRequestId,
						preparation.expectedHeadSha,
						signal,
					);
					this._resources.invalidatePullRequest(preparation.ref, ['core', 'mergeability']);
					return { outcome: 'succeeded', mergeQueueEntryId: entryId };
				} catch (error) {
					if (!isAmbiguousMutationError(error)) {
						throw error;
					}
					this._resources.invalidatePullRequest(preparation.ref, ['mergeability']);
					await state.subscription.refresh('mergeability', undefined, { authoritative: true });
					const entryId = state.resource.snapshot.get().mergeability.value?.mergeQueueEntryId;
					if (entryId) {
						return { outcome: 'reconciled', mergeQueueEntryId: entryId };
					}
					throw error;
				}
			} finally {
				state.subscription.dispose();
			}
		});
	}

	override dispose(): void {
		this._clearPreparations();
		this._mutationTails.clear();
		this._unconfirmedReruns.clear();
		super.dispose();
	}

	private async _addComment(
		ref: PullRequestRef,
		options: PullRequestCommentOptions,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<PullRequestComment>> {
		const body = withOperationMarker(options.body, options.operationId);
		try {
			const value = await this._postComment(ref, body, signal);
			this._resources.invalidatePullRequest(ref, ['topLevelComments']);
			return { outcome: 'succeeded', value };
		} catch (error) {
			if (!isAmbiguousMutationError(error)) {
				throw error;
			}
			const reconciled = await this._reconcileComment(ref, 'topLevelComments', options.operationId, signal);
			if (reconciled.proven) {
				return reconciled.value
					? { outcome: 'reconciled', value: reconciled.value as PullRequestComment }
					: this._retryComment(ref, body, signal);
			}
			return { outcome: 'indeterminate' };
		}
	}

	private async _replyToThread(
		ref: PullRequestRef,
		options: PullRequestReplyOptions,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<PullRequestInlineComment>> {
		const body = withOperationMarker(options.body, options.operationId);
		try {
			const value = await this._postThreadReply(ref, options.threadId, body, signal);
			this._resources.invalidatePullRequest(ref, ['reviewThreads', 'inlineComments']);
			return { outcome: 'succeeded', value };
		} catch (error) {
			if (!isAmbiguousMutationError(error)) {
				throw error;
			}
			const reconciled = await this._reconcileComment(ref, 'reviewThreads', options.operationId, signal);
			if (reconciled.proven) {
				if (reconciled.value) {
					this._resources.invalidatePullRequest(ref, ['inlineComments']);
					return { outcome: 'reconciled', value: reconciled.value as PullRequestInlineComment };
				}
				return this._retryThreadReply(ref, options.threadId, body, signal);
			}
			return { outcome: 'indeterminate' };
		}
	}

	private async _retryComment(
		ref: PullRequestRef,
		body: string,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<PullRequestComment>> {
		try {
			const value = await this._postComment(ref, body, signal);
			this._resources.invalidatePullRequest(ref, ['topLevelComments']);
			return { outcome: 'succeeded', value };
		} catch (error) {
			if (isAmbiguousMutationError(error)) {
				return { outcome: 'indeterminate' };
			}
			throw error;
		}
	}

	private async _retryThreadReply(
		ref: PullRequestRef,
		threadId: string,
		body: string,
		signal: AbortSignal,
	): Promise<PullRequestMutationResult<PullRequestInlineComment>> {
		try {
			const value = await this._postThreadReply(ref, threadId, body, signal);
			this._resources.invalidatePullRequest(ref, ['reviewThreads', 'inlineComments']);
			return { outcome: 'succeeded', value };
		} catch (error) {
			if (isAmbiguousMutationError(error)) {
				return { outcome: 'indeterminate' };
			}
			throw error;
		}
	}

	private _postComment(ref: PullRequestRef, body: string, signal: AbortSignal): Promise<PullRequestComment> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				method: 'POST',
				url: this._restUrl(ref, `issues/${ref.number}/comments`),
				body: { body },
				priority: 'mutation',
			}, combinedSignal);
			return toComment(response.data);
		});
	}

	private _postThreadReply(ref: PullRequestRef, threadId: string, body: string, signal: AbortSignal): Promise<PullRequestInlineComment> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				addReviewThreadReplyMutation,
				{ threadId, body },
				combinedSignal,
				'mutation',
			);
			throwGraphQLErrors(response.errors);
			return toGraphQLComment(objectAt(response.data, 'addPullRequestReviewThreadReply', 'comment'));
		});
	}

	private _resolveThread(ref: PullRequestRef, threadId: string, signal: AbortSignal): Promise<void> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				resolveReviewThreadMutation,
				{ threadId },
				combinedSignal,
				'mutation',
			);
			throwGraphQLErrors(response.errors);
			const thread = objectAt(response.data, 'resolveReviewThread', 'thread');
			if (booleanProperty(thread, 'isResolved') !== true) {
				throw new GitHubRequestError('GitHub did not confirm review-thread resolution', 'malformedResponse');
			}
		});
	}

	private async _reconcileComment(
		ref: PullRequestRef,
		fragment: 'topLevelComments' | 'reviewThreads',
		operationId: string,
		signal: AbortSignal,
	): Promise<{ readonly proven: boolean; readonly value?: PullRequestComment | PullRequestInlineComment }> {
		const subscription = this._resources.subscribePullRequest(ref, {
			priority: 'interactive',
			conversation: fragment === 'topLevelComments'
				? { topLevelComments: true, includeBodies: true }
				: { reviewThreads: true, includeBodies: true },
		});
		try {
			try {
				await subscription.refresh(fragment, undefined, { authoritative: true });
			} catch {
				return { proven: false };
			}
			const marker = operationMarker(operationId);
			if (fragment === 'topLevelComments') {
				const state = subscription.resource.snapshot.get().topLevelComments;
				if (state.status !== 'ready' || !state.complete || !state.value) {
					return { proven: false };
				}
				return { proven: true, value: state.value.find(comment => comment.body?.includes(marker)) };
			}
			const state = subscription.resource.snapshot.get().reviewThreads;
			if (state.status !== 'ready' || !state.complete || !state.value) {
				return { proven: false };
			}
			for (const thread of state.value) {
				const comment = thread.comments.find(candidate => candidate.body?.includes(marker));
				if (comment) {
					return { proven: true, value: comment };
				}
			}
			return { proven: true };
		} finally {
			subscription.dispose();
		}
	}

	private async _getWorkflowRun(ref: PullRequestRef, runId: string, signal: AbortSignal): Promise<GitHubWorkflowRun> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				method: 'GET',
				url: this._restUrl(ref, `actions/runs/${encodeURIComponent(runId)}`),
				etag: false,
				unconditional: true,
				priority: 'mutationReconciliation',
			}, combinedSignal);
			return toWorkflowRun(response.data);
		});
	}

	private async _tryGetWorkflowRun(ref: PullRequestRef, runId: string, signal: AbortSignal): Promise<GitHubWorkflowRun | undefined> {
		try {
			return await this._getWorkflowRun(ref, runId, signal);
		} catch {
			return undefined;
		}
	}

	private async _enqueuePullRequest(
		ref: PullRequestRef,
		pullRequestId: string,
		expectedHeadOid: string,
		signal: AbortSignal,
	): Promise<string> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				enqueuePullRequestMutation,
				{ pullRequestId, expectedHeadOid },
				combinedSignal,
				'mutation',
			);
			throwGraphQLErrors(response.errors);
			return requiredString(objectAt(response.data, 'enqueuePullRequest', 'mergeQueueEntry'), 'id');
		});
	}

	private async _fetchRestArray(
		ref: PullRequestRef,
		credential: GitHubCredential,
		route: string,
		signal: AbortSignal,
		arrayPropertyName?: string,
	): Promise<readonly unknown[]> {
		const values: unknown[] = [];
		let url: string | undefined = this._restUrl(ref, route);
		for (let page = 0; url && page < maximumPaginationPages; page++) {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				method: 'GET',
				url,
				etag: true,
				priority: 'interactive',
			}, signal);
			const pageValues = arrayPropertyName
				? arrayProperty(asObject(response.data, 'GitHub paginated response was malformed'), arrayPropertyName)
				: asArray(response.data, 'GitHub paginated response was not an array');
			values.push(...pageValues);
			url = nextLink(response.link);
		}
		if (url) {
			throw new GitHubRequestError('GitHub pagination exceeded its page limit', 'malformedResponse');
		}
		return values;
	}

	private async _withCredential<T>(
		ref: GitHubRepositoryRef,
		signal: AbortSignal,
		task: (credential: GitHubCredential, combinedSignal: AbortSignal) => Promise<T>,
	): Promise<T> {
		const credential = await this._credentials.getCredential(signal);
		if (!sameAccount(ref, credential)) {
			throw new GitHubRequestError('Pull request account does not match the current GitHub credential', 'authentication');
		}
		try {
			return await task(credential, AbortSignal.any([signal, credential.signal]));
		} catch (error) {
			this._credentials.handleRequestError(credential, error);
			throw error;
		}
	}

	private _takePreparation(preparation: PullRequestMergePreparation): IPreparationState {
		const state = this._preparations.get(preparation.token);
		if (!state || state.value !== preparation) {
			throw new GitHubRequestError('Merge preparation is invalid or has already been consumed', 'validation');
		}
		this._preparations.delete(preparation.token);
		this._preparationScheduler.cancel(preparation.token);
		return state;
	}

	private _serialize<T>(ref: PullRequestRef, operation: string, task: () => Promise<T>): Promise<T> {
		const key = pullRequestMutationKey(ref);
		const previous = this._mutationTails.get(key) ?? Promise.resolve();
		const run = () => this._runMutation(operation, `${ref.owner}/${ref.repo}#${ref.number}`, task);
		const result = previous.then(run, run);
		const tail = result.then(() => undefined, () => undefined);
		this._mutationTails.set(key, tail);
		void tail.then(() => {
			if (this._mutationTails.get(key) === tail) {
				this._mutationTails.delete(key);
			}
		});
		return result;
	}

	private _serializeRepository<T>(ref: GitHubRepositoryRef, operation: string, task: () => Promise<T>): Promise<T> {
		const key = [
			ref.host.toLowerCase(),
			ref.accountId,
			ref.owner.toLowerCase(),
			ref.repo.toLowerCase(),
		].join('\x00');
		const previous = this._mutationTails.get(key) ?? Promise.resolve();
		const run = () => this._runMutation(operation, `${ref.owner}/${ref.repo}`, task);
		const result = previous.then(run, run);
		const tail = result.then(() => undefined, () => undefined);
		this._mutationTails.set(key, tail);
		void tail.then(() => {
			if (this._mutationTails.get(key) === tail) {
				this._mutationTails.delete(key);
			}
		});
		return result;
	}

	private async _runMutation<T>(operation: string, target: string, task: () => Promise<T>): Promise<T> {
		const startedAt = this._clock.now();
		this._logService?.debug(`[PullRequestMutationService] ${operation} started for ${target}`);
		try {
			const result = await task();
			this._logService?.debug(`[PullRequestMutationService] ${operation} completed for ${target} in ${this._clock.now() - startedAt}ms`);
			return result;
		} catch (error) {
			this._logService?.debug(`[PullRequestMutationService] ${operation} failed for ${target} after ${this._clock.now() - startedAt}ms (${mutationErrorKind(error)})`);
			throw error;
		}
	}

	private _handleCredentialInvalidation(event: GitHubCredentialInvalidation): void {
		if (this._preparations.size > 0 || this._unconfirmedReruns.size > 0) {
			this._logService?.debug(`[PullRequestMutationService] Clearing mutation reconciliation state after credential invalidation (${event.reason})`);
		}
		for (const [token, preparation] of this._preparations) {
			if (!event.credential || sameAccount(preparation.value.ref, event.credential)) {
				preparation.subscription.dispose();
				this._preparations.delete(token);
				this._preparationScheduler.cancel(token);
			}
		}
		this._unconfirmedReruns.clear();
	}

	private _clearPreparations(): void {
		for (const preparation of this._preparations.values()) {
			preparation.subscription.dispose();
		}
		this._preparations.clear();
		this._preparationScheduler.clear();
	}

	private _restUrl(ref: GitHubRepositoryRef, route: string): string {
		return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${route}`;
	}
}

function mutationErrorKind(error: unknown): string {
	if (error instanceof GitHubRequestError) {
		return `${error.kind}${error.statusCode === undefined ? '' : `:${error.statusCode}`}`;
	}
	return error instanceof Error ? error.name : typeof error;
}

function withOperationMarker(body: string, operationId: string): string {
	validateOperationId(operationId);
	return `${body}\n\n${operationMarker(operationId)}`;
}

function operationMarker(operationId: string): string {
	return `${operationMarkerPrefix}${operationId} -->`;
}

function validateOperationId(operationId: string): void {
	if (!operationIdPattern.test(operationId)) {
		throw new Error('GitHub mutation operation ID must be a stable identifier of at most 128 characters');
	}
}

function validateAuthorization(authorization: PullRequestMergeAuthorization): void {
	if (authorization.confirmed !== true || !authorization.authorizationId) {
		throw new GitHubRequestError('Persisted merge authorization has not been confirmed', 'authorization');
	}
}

function validatePreparationState(preparation: PullRequestMergePreparation, snapshot: PullRequestSnapshot): void {
	if (snapshot.generation !== preparation.resourceGeneration
		|| snapshot.headGeneration !== preparation.headGeneration
		|| snapshot.core.value?.headSha !== preparation.expectedHeadSha) {
		throw new GitHubRequestError('Merge preparation was invalidated by newer pull request state', 'validation');
	}
}

function validateMergeGateSnapshot(snapshot: PullRequestSnapshot, expectedHeadSha: string): void {
	const core = snapshot.core;
	if (core.status !== 'ready' || !core.complete || !core.value) {
		throw new GitHubRequestError('Pull request core state is incomplete', 'validation');
	}
	if (core.value.state !== 'open' || core.value.draft) {
		throw new GitHubRequestError('Pull request must be open and non-draft', 'validation');
	}
	if (core.value.headSha !== expectedHeadSha) {
		throw new GitHubRequestError('Pull request head changed during merge preparation', 'validation');
	}
	requireCompleteHeadFragment(snapshot, 'checks', expectedHeadSha);
	requireCompleteFragment(snapshot, 'submittedReviews');
	requireCompleteFragment(snapshot, 'reviewThreads');
	requireCompleteHeadFragment(snapshot, 'mergeability', expectedHeadSha);
}

function requireCompleteFragment(snapshot: PullRequestSnapshot, fragment: 'submittedReviews' | 'reviewThreads'): void {
	const state = snapshot[fragment];
	if (state.status !== 'ready' || !state.complete || !state.value) {
		throw new GitHubRequestError(`Pull request ${fragment} state is incomplete`, 'validation');
	}
}

function requireCompleteHeadFragment(snapshot: PullRequestSnapshot, fragment: 'checks' | 'mergeability', expectedHeadSha: string): void {
	const state = snapshot[fragment];
	if (state.status !== 'ready' || !state.complete || !state.value || state.headSha !== expectedHeadSha) {
		throw new GitHubRequestError(`Pull request ${fragment} state is incomplete or stale`, 'validation');
	}
}

function rerunConfirmed(run: GitHubWorkflowRun, expectedRunAttempt: number): boolean {
	return run.runAttempt > expectedRunAttempt || (run.runAttempt === expectedRunAttempt + 1 && (run.status === 'QUEUED' || run.status === 'IN_PROGRESS'));
}

function rerunProvenAbsent(run: GitHubWorkflowRun, expectedRunAttempt: number): boolean {
	return run.runAttempt === expectedRunAttempt && run.status === 'COMPLETED';
}

function isAmbiguousMutationError(error: unknown): boolean {
	return error instanceof GitHubRequestError && (error.kind === 'network' || error.kind === 'server');
}

function sameAccount(
	ref: { readonly host: string; readonly accountId: string },
	credential: { readonly account: { readonly host: string; readonly accountId: string } },
): boolean {
	return ref.host.toLowerCase() === credential.account.host.toLowerCase() && ref.accountId === credential.account.accountId;
}

function pullRequestMutationKey(ref: PullRequestRef): string {
	return [
		ref.host.toLowerCase(),
		ref.accountId,
		ref.owner.toLowerCase(),
		ref.repo.toLowerCase(),
		ref.number,
	].join('\x00');
}

function toComment(value: unknown): PullRequestComment {
	const item = asObject(value, 'GitHub comment response was malformed');
	return {
		id: requiredId(item, 'id'),
		nodeId: idProperty(item, 'node_id'),
		body: nullableStringProperty(item, 'body'),
		url: stringProperty(item, 'html_url'),
		createdAt: stringProperty(item, 'created_at'),
		updatedAt: stringProperty(item, 'updated_at'),
		author: toActor(optionalObjectProperty(item, 'user')),
	};
}

function toGraphQLComment(value: unknown): PullRequestInlineComment {
	const item = asObject(value, 'GitHub reply response was malformed');
	return {
		id: requiredId(item, 'databaseId', 'id'),
		nodeId: idProperty(item, 'id'),
		body: nullableStringProperty(item, 'body'),
		url: stringProperty(item, 'url'),
		createdAt: stringProperty(item, 'createdAt'),
		updatedAt: stringProperty(item, 'updatedAt'),
		author: toActor(optionalObjectProperty(item, 'author')),
	};
}

function toWorkflowRun(value: unknown): GitHubWorkflowRun {
	const item = asObject(value, 'GitHub workflow run was malformed');
	return {
		id: requiredId(item, 'id'),
		name: requiredString(item, 'name'),
		event: stringProperty(item, 'event'),
		status: normalizedEnumProperty(item, 'status'),
		conclusion: normalizedEnumProperty(item, 'conclusion'),
		headSha: requiredString(item, 'head_sha'),
		runAttempt: numberProperty(item, 'run_attempt') ?? 1,
		url: stringProperty(item, 'html_url'),
		createdAt: stringProperty(item, 'created_at'),
		updatedAt: stringProperty(item, 'updated_at'),
	};
}

function toWorkflowJob(value: unknown, runId: string): GitHubWorkflowJob {
	const item = asObject(value, 'GitHub workflow job was malformed');
	return {
		id: requiredId(item, 'id'),
		runId,
		name: requiredString(item, 'name'),
		status: normalizedEnumProperty(item, 'status'),
		conclusion: normalizedEnumProperty(item, 'conclusion'),
		checkRunId: idProperty(item, 'check_run_id'),
		url: stringProperty(item, 'html_url'),
		startedAt: stringProperty(item, 'started_at'),
		completedAt: stringProperty(item, 'completed_at'),
	};
}

function toCheckAnnotation(value: unknown): GitHubCheckAnnotation {
	const item = asObject(value, 'GitHub check annotation was malformed');
	return {
		path: requiredString(item, 'path'),
		startLine: numberProperty(item, 'start_line') ?? 0,
		endLine: numberProperty(item, 'end_line') ?? numberProperty(item, 'start_line') ?? 0,
		level: requiredString(item, 'annotation_level'),
		message: requiredString(item, 'message'),
		title: nullableStringProperty(item, 'title'),
		rawDetails: nullableStringProperty(item, 'raw_details'),
	};
}

function toMergeResult(value: unknown): { readonly sha?: string; readonly message?: string } {
	const item = asObject(value, 'GitHub merge response was malformed');
	if (booleanProperty(item, 'merged') !== true) {
		throw new GitHubRequestError(stringProperty(item, 'message') ?? 'GitHub rejected the merge', 'validation');
	}
	return {
		sha: stringProperty(item, 'sha'),
		message: stringProperty(item, 'message'),
	};
}

function redactWorkflowLog(value: string): string {
	const masks = [...value.matchAll(/::add-mask::(?<secret>[^\r\n]+)/g)]
		.map(match => match.groups?.secret)
		.filter((secret): secret is string => Boolean(secret));
	let redacted = value.replace(/::add-mask::[^\r\n]+/g, '::add-mask::***');
	for (const secret of masks) {
		redacted = redacted.split(secret).join('***');
	}
	return redacted
		.replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,}\b/g, '***')
		.replace(/(?<prefix>\b(?:authorization|token|secret|password)\s*[:=]\s*)(?<value>[^\s,;]+)/gi, '$<prefix>***');
}

function throwGraphQLErrors(errors: readonly GitHubGraphQLError[]): void {
	if (errors.length === 0) {
		return;
	}
	const types = errors.map(error => error.type?.toUpperCase());
	const kind = types.includes('RATE_LIMITED')
		? 'rateLimit'
		: types.some(type => type === 'FORBIDDEN' || type === 'UNAUTHORIZED')
			? 'authorization'
			: types.some(type => type?.includes('NOT_FOUND'))
				? 'notFound'
				: types.some(type => type?.includes('VALIDATION') || type?.includes('UNPROCESSABLE'))
					? 'validation'
					: types.every(type => type === undefined)
						? 'schema'
						: 'unknown';
	throw new GitHubRequestError(
		`GitHub GraphQL mutation failed: ${errors.map(error => error.message ?? error.type ?? 'unknown error').join('; ')}`,
		kind,
		200,
		undefined,
		errors,
	);
}

function cancellationTokenFromSignal(signal: AbortSignal): { readonly tokenSource: CancellationTokenSource; readonly dispose: () => void } {
	const tokenSource = new CancellationTokenSource();
	if (signal.aborted) {
		tokenSource.cancel();
		return { tokenSource, dispose: () => tokenSource.dispose() };
	}
	const onAbort = () => tokenSource.cancel();
	const listener = toDisposable(() => signal.removeEventListener('abort', onAbort));
	signal.addEventListener('abort', onAbort, { once: true });
	return {
		tokenSource,
		dispose: () => {
			listener.dispose();
			tokenSource.dispose();
		},
	};
}

function toFragmentError(error: unknown): GitHubFragmentError {
	if (error instanceof GitHubRequestError) {
		return { message: error.message, kind: error.kind, statusCode: error.statusCode };
	}
	return { message: error instanceof Error ? error.message : String(error), kind: 'unknown' };
}

function nextLink(link: string | undefined): string | undefined {
	if (!link) {
		return undefined;
	}
	for (const part of link.split(',')) {
		const match = /^\s*<(?<url>[^>]+)>\s*;\s*rel="(?<rel>[^"]+)"/.exec(part);
		if (match?.groups?.rel.split(/\s+/).includes('next')) {
			return match.groups.url;
		}
	}
	return undefined;
}

function objectAt(value: unknown, ...path: readonly string[]): object {
	let current = asObject(value, 'GitHub response was malformed');
	for (const part of path) {
		current = asObject(Reflect.get(current, part), `GitHub response property ${part} was malformed`);
	}
	return current;
}

function asObject(value: unknown, message: string): object {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return value;
}

function asArray(value: unknown, message: string): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return value;
}

function arrayProperty(value: object, key: string): readonly unknown[] {
	return asArray(Reflect.get(value, key), `GitHub response property ${key} was not an array`);
}

function optionalObjectProperty(value: object, key: string): object | undefined {
	const property = Reflect.get(value, key);
	return property === null || property === undefined ? undefined : asObject(property, `GitHub response property ${key} was malformed`);
}

function requiredString(value: object, key: string): string {
	const property = stringProperty(value, key);
	if (property === undefined) {
		throw new GitHubRequestError(`GitHub response property ${key} was not a string`, 'malformedResponse');
	}
	return property;
}

function stringProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' ? property : undefined;
}

function nullableStringProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return property === null ? undefined : typeof property === 'string' ? property : undefined;
}

function normalizedEnumProperty(value: object, key: string): string | undefined {
	return nullableStringProperty(value, key)?.toUpperCase();
}

function numberProperty(value: object, key: string): number | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'number' && Number.isFinite(property) ? property : undefined;
}

function booleanProperty(value: object, key: string): boolean | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'boolean' ? property : undefined;
}

function idProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' || typeof property === 'number' ? String(property) : undefined;
}

function requiredId(value: object, ...keys: readonly string[]): string {
	for (const key of keys) {
		const id = idProperty(value, key);
		if (id) {
			return id;
		}
	}
	throw new GitHubRequestError(`GitHub response did not contain ${keys.join(' or ')}`, 'malformedResponse');
}

function requiredNumber(value: object, key: string): number {
	const property = numberProperty(value, key);
	if (property === undefined) {
		throw new GitHubRequestError(`GitHub response property ${key} was not a number`, 'malformedResponse');
	}
	return property;
}

function toActor(value: object | undefined): { readonly id?: string; readonly login: string } | undefined {
	if (!value) {
		return undefined;
	}
	const login = stringProperty(value, 'login');
	if (!login) {
		return undefined;
	}
	const id = idProperty(value, 'databaseId') ?? idProperty(value, 'id');
	return id ? { id, login } : { login };
}
