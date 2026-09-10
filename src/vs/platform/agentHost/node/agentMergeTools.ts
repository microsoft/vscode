/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubService } from '../../github/common/githubService.js';
import { GitHubWorkflowRerunOptions } from '../../github/common/githubPullRequestMutationService.js';
import { PullRequestCheck, PullRequestRef, PullRequestSnapshot } from '../../github/common/githubPullRequestService.js';
import { ILogService } from '../../log/common/log.js';
import { AgentMergeAction, AgentMergeConfiguration, classifyAgentMergeRequiredChecks, isAgentMergeFeedbackAuthor } from '../common/agentMerge.js';
import { IAgentMergeToolAccessor } from './shared/agentMergeServerTools.js';

export interface IAgentMergeTurnContext {
	readonly session: string;
	readonly turnId: string;
	readonly ref: PullRequestRef;
	readonly headSha: string;
	readonly actions: readonly AgentMergeAction[];
	readonly configuration: AgentMergeConfiguration;
	readonly snapshot: PullRequestSnapshot;
	readonly signal: AbortSignal;
	readonly commentWatermark: string;
	readonly deferredCheckIds: ReadonlySet<string>;
	/** Keeps rerun authorization stable when diagnostics are suppressed mid-turn. */
	readonly initialDeferredCheckIds: ReadonlySet<string>;
	/** Defers a busy workflow or coalesces with a rerun the host is already handling. */
	readonly deferWorkflowRerun: (options: GitHubWorkflowRerunOptions, checkIds: readonly string[], running: boolean) => boolean;
}

export class AgentMergeTools implements IAgentMergeToolAccessor {

	constructor(
		private readonly _isFeatureEnabled: () => boolean,
		private readonly _getTurnContext: (session: string) => IAgentMergeTurnContext | undefined,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ILogService private readonly _logService: ILogService,
	) { }

	isEnabled(): boolean {
		return this._isFeatureEnabled();
	}

	async readFailedCI(session: string): Promise<string> {
		const context = this._requireTurnAction(session, 'fixCI');
		const failedChecks = failedRequiredChecks(context);
		const runIds = new Set(failedChecks.map(workflowRunId).filter(id => id !== undefined));
		this._logService.info(`[AgentMergeTools] Reading failed required CI: session=${session}, turn=${context.turnId}, failedChecks=${failedChecks.length}, workflowRuns=${runIds.size}`);
		const sections: string[] = [];
		for (const check of failedChecks) {
			const annotations = check.type === 'checkRun'
				? await this._gitHubService.mutations.listCheckAnnotations(context.ref, check.id, context.signal)
				: [];
			sections.push(JSON.stringify({
				check: {
					id: check.id,
					name: check.name,
					status: check.status,
					conclusion: check.conclusion,
					detailsUrl: check.detailsUrl,
					workflowName: check.workflowName,
				},
				annotations,
			}));
		}
		for (const runId of runIds) {
			const jobs = await this._gitHubService.mutations.listWorkflowJobs(context.ref, runId, context.signal);
			for (const job of jobs.filter(job => isFailedConclusion(job.conclusion) && !context.deferredCheckIds.has(job.checkRunId ?? job.id))) {
				const log = await this._gitHubService.mutations.downloadWorkflowJobLog(context.ref, job.id, context.signal);
				sections.push(JSON.stringify({
					runId,
					job,
					log: log.text.slice(0, 100_000),
					logTruncated: log.truncated || log.text.length > 100_000,
				}));
			}
		}
		this._logService.info(`[AgentMergeTools] Finished reading failed required CI: session=${session}, turn=${context.turnId}, resultSections=${sections.length}`);
		return sections.length > 0 ? sections.join('\n\n') : 'No failed required CI details are available.';
	}

	async replyToReviewThread(session: string, threadId: string, body: string, resolve: boolean): Promise<string> {
		const context = this._requireTurnAction(session, 'addressReviews');
		const thread = context.snapshot.reviewThreads.value?.find(candidate => candidate.id === threadId);
		if (!thread || thread.isResolved || !thread.comments.some(comment => isAgentMergeFeedbackAuthor(comment.author))) {
			throw new Error('The review thread is not an unresolved thread authorized for this Agent Merge turn.');
		}
		const attributedBody = context.configuration.replyAttribution
			? `${body}\n\n> [!NOTE]\n> Automated reply by VS Code Agent Merge.`
			: body;
		this._logService.info(`[AgentMergeTools] Replying to authorized review thread: session=${session}, turn=${context.turnId}, resolve=${resolve}, attribution=${context.configuration.replyAttribution}`);
		const result = await this._gitHubService.mutations.replyAndResolveThread(context.ref, {
			operationId: `agent-merge:${context.turnId}:${threadId}`,
			threadId,
			body: attributedBody,
			resolve,
		}, context.signal);
		this._logService.info(`[AgentMergeTools] Review thread reply completed: session=${session}, turn=${context.turnId}, replyOutcome=${result.reply.outcome}, resolved=${result.resolved}`);
		return JSON.stringify({ reply: result.reply.outcome, resolved: result.resolved, resolveError: result.resolveError });
	}

	async rerunFailedWorkflow(session: string, runId: string, failedJobsOnly: boolean): Promise<string> {
		const context = this._requireTurnAction(session, 'fixCI');
		const failedChecks = failedRequiredChecks(context, context.initialDeferredCheckIds).filter(check => workflowRunId(check) === runId);
		if (failedChecks.length === 0) {
			throw new Error('The workflow run is not associated with a failed required check in this Agent Merge turn.');
		}
		const runs = await this._gitHubService.mutations.listWorkflowRuns(context.ref, context.headSha, context.signal);
		const run = runs.find(candidate => candidate.id === runId && candidate.headSha === context.headSha);
		if (!run) {
			throw new Error('The workflow run is no longer available for this pull request head.');
		}
		const options: GitHubWorkflowRerunOptions = {
			operationId: `agent-merge:${context.turnId}:rerun:${runId}`,
			runId,
			expectedRunAttempt: run.runAttempt,
			failedJobsOnly,
		};
		if (!run.status) {
			throw new Error('The workflow run status is unavailable.');
		}
		const running = run.status.toUpperCase() !== 'COMPLETED';
		if (!running && !isFailedConclusion(run.conclusion)) {
			throw new Error('The workflow run no longer has a failed conclusion.');
		}
		if (context.deferWorkflowRerun(options, failedChecks.map(check => check.id), running)) {
			this._logService.info(`[AgentMergeTools] Deferred workflow rerun: session=${session}, turn=${context.turnId}, run=${runId}, status=${run.status}, currentAttempt=${run.runAttempt}`);
			return JSON.stringify({
				outcome: 'deferred',
				run,
				message: 'Agent Merge is handling this rerun after the current workflow attempt completes, if CI repair remains enabled and the pull request head is unchanged. Continue other actionable work without polling or requesting this rerun again.',
			});
		}
		this._logService.info(`[AgentMergeTools] Rerunning failed workflow: session=${session}, turn=${context.turnId}, failedJobsOnly=${failedJobsOnly}, currentAttempt=${run.runAttempt}`);
		const result = await this._gitHubService.mutations.rerunWorkflow(context.ref, options, context.signal);
		this._logService.info(`[AgentMergeTools] Workflow rerun requested: session=${session}, turn=${context.turnId}, outcome=${result.outcome}`);
		return JSON.stringify({ outcome: result.outcome, run: result.value });
	}

	private _requireTurnAction(session: string, action: AgentMergeAction): IAgentMergeTurnContext {
		const context = this._getTurnContext(session);
		if (!context || !context.actions.includes(action)) {
			this._logService.warn(`[AgentMergeTools] Rejected unauthorized tool call: session=${session}, action=${action}, hasActiveAgentMergeTurn=${context !== undefined}`);
			throw new Error(`Agent Merge action '${action}' is not authorized for the active turn.`);
		}
		return context;
	}
}

function failedRequiredChecks(context: IAgentMergeTurnContext, deferredCheckIds = context.deferredCheckIds): readonly PullRequestCheck[] {
	const checks = context.snapshot.checks.value ? classifyAgentMergeRequiredChecks(context.snapshot.checks.value) : undefined;
	return checks?.kind === 'ready' ? checks.failed.filter(check => !deferredCheckIds.has(check.id)) : [];
}

function workflowRunId(check: PullRequestCheck): string | undefined {
	return /\/actions\/runs\/(?<runId>\d+)/.exec(check.detailsUrl ?? '')?.groups?.runId;
}

export function isFailedConclusion(conclusion: string | undefined): boolean {
	return !!conclusion && !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion.toUpperCase());
}
