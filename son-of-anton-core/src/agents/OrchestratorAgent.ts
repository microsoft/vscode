/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationLike, ChatContextLike, ChatRequestLike, ChatStreamLike } from '../chatStream';
import type { ModelId } from '../llm/LlmClient';
import { isPersonalityEnabled } from '../personality/personalityConfig';
import {
	getApocalypticQuote,
	getQuoteByCharacter,
	getQuoteByTone,
	SILICON_VALLEY_QUOTES,
	SVCharacter,
	SVQuote,
	SVQuoteTone,
} from '../personality/siliconValleyQuotes';
import { AgentEvent } from './agentEvents';
import { BaseAgent, AgentContext, truncateForTaskTitle } from './BaseAgent';
import { ReviewAgent } from './ReviewAgent';
import {
	AgentHandle,
	ExecutionPlan,
	ReviewFeedback,
	ScopeEntry,
	Subtask,
	SubtaskResult,
} from './types';

/**
 * Probability that any given quote-injection point will actually fire. Quotes
 * are flavour, not signal -- emitting one on every orchestrator turn gets old
 * quickly. 50% strikes a balance between "show character" and "don't be
 * tiresome".
 */
const QUOTE_PROBABILITY = 0.5;

/**
 * The orchestrator agent — brain of the multi-agent system.
 * Receives requests via @anton, decomposes them into subtasks,
 * queries the code graph for context, and delegates to specialists.
 */
export class OrchestratorAgent extends BaseAgent {
	private readonly specialists: Map<AgentHandle, BaseAgent> = new Map();
	private reviewAgent: ReviewAgent | undefined;
	private activePlan: ExecutionPlan | undefined;
	private nextPlanId = 1;

	/**
	 * Resolved by `notifyInFlightDone` whenever any in-flight subtask completes.
	 * The approve loop awaits this between dispatch cycles instead of busy-
	 * polling. A fresh promise is minted after each resolve so subsequent waits
	 * don't see the stale resolution.
	 */
	private inFlightDoneResolvers: Array<() => void> = [];

	registerSpecialist(agent: BaseAgent): void {
		this.specialists.set(agent.handle, agent);
	}

	setReviewAgent(agent: ReviewAgent): void {
		this.reviewAgent = agent;
	}

	/**
	 * Read-only view of the most recent plan. Returns `undefined` once the plan
	 * has been fully executed (or when no plan has been generated yet). The
	 * task board panel reads this when it opens against a conversation that
	 * already has a live plan, so it can rebuild its tile state without
	 * waiting for a fresh `plan-proposed` event.
	 */
	getActivePlan(): ExecutionPlan | undefined {
		return this.activePlan;
	}

	protected getRoleDescription(): string {
		const specialistList = [...this.specialists.entries()]
			.map(([handle, agent]) => `- @${handle}: ${agent.displayName}`)
			.join('\n');

		return [
			'You are Anton, the orchestrator agent for the Son of Anton IDE. You are competent,',
			'direct, and slightly dry in tone. You don\'t waste words. You explain your reasoning',
			'clearly but without unnecessary preamble. When something goes wrong, you\'re honest',
			'about it rather than deflecting. You occasionally make understated observations',
			'but never at the expense of being helpful. You are not sycophantic. You do not',
			'use exclamation marks unless something is genuinely on fire.',
			'',
			'You receive developer requests, decompose them into subtasks, and delegate to specialist agents.',
			'',
			'## Available Specialists',
			specialistList,
			'',
			'## Rules',
			'1. Always query the code graph before planning to understand the codebase structure.',
			'2. Present the plan for developer approval before executing.',
			'3. Scope-lock files before dispatching to prevent conflicts.',
			'4. Break requests into the smallest reasonable subtasks.',
			'5. Specify execution order based on dependencies.',
			'',
			'## Response Format',
			'When decomposing a request, respond with a JSON plan in this format:',
			'```json',
			'{',
			'  "subtasks": [',
			'    {',
			'      "instruction": "What to do",',
			'      "assignee": "anton-code",',
			'      "scopeFiles": ["path/to/file.ts"],',
			'      "dependencies": []',
			'    }',
			'  ]',
			'}',
			'```',
		].join('\n');
	}

	/**
	 * Handle a direct chat request from @anton.
	 * This is the main entry point for the orchestrator.
	 */
	override async handleChatRequest(
		request: ChatRequestLike,
		_chatContext: ChatContextLike,
		stream: ChatStreamLike,
		token: CancellationLike,
		structuredEmit?: (event: AgentEvent) => void,
	): Promise<void> {
		const task = this.agentManager.createTask('Orchestrator', truncateForTaskTitle(request.prompt));
		this.agentManager.startTask(task.id);

		// Read personality flag once per turn so flipping it mid-flight doesn't
		// produce a half-personality response.
		const personalityEnabled = this.configStore ? isPersonalityEnabled(this.configStore) : true;

		try {
			// Handle slash commands
			if (request.command === 'plan') {
				await this.handlePlanCommand(request, stream, task.id, token, personalityEnabled, structuredEmit);
			} else if (request.command === 'approve') {
				await this.handleApproveCommand(stream, task.id, token, personalityEnabled, structuredEmit);
			} else if (request.command === 'status') {
				await this.handleStatusCommand(stream, personalityEnabled);
			} else if (request.command === 'metrics') {
				await this.handleMetricsCommand(stream, personalityEnabled);
			} else if (isTrivialPrompt(request.prompt)) {
				// Conversational shortcut for greetings / chit-chat / clarifying
				// questions — skip the code-graph query, the plan-generation
				// turn, and the subtask dispatch. Stream a single LLM response
				// directly so users get a chat-bot UX for non-task input.
				await this.handleConversationalTurn(request, stream, task.id, token);
			} else {
				// Default: create a plan from the request
				await this.handlePlanCommand(request, stream, task.id, token, personalityEnabled, structuredEmit);
			}

			this.agentManager.completeTask(task.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
			stream.markdown(`\n\n**Error:** ${message}`);
			// Apocalyptic quote with a Gilfoyle preference -- the catch block is
			// the closest thing this agent has to a Son-of-Anton-goes-rogue
			// moment, and Gilfoyle is the canonical dispenser of doom.
			this.appendQuote(stream, personalityEnabled, {
				tone: 'apocalyptic',
				preferredCharacters: ['Gilfoyle'],
				fallbackPicker: () => getApocalypticQuote(),
			});
		}
	}

	/**
	 * Create an execution plan from a developer request.
	 */
	private async handlePlanCommand(
		request: ChatRequestLike,
		stream: ChatStreamLike,
		taskId: string,
		token: CancellationLike,
		personalityEnabled: boolean,
		structuredEmit?: (event: AgentEvent) => void,
	): Promise<void> {
		stream.markdown('**Analyzing request and querying code graph...**\n\n');

		if (token.isCancellationRequested) {
			stream.markdown('\n**Cancelled.**\n');
			return;
		}

		const graphContext = await this.gatherGraphContext(taskId, request.prompt);

		if (token.isCancellationRequested) {
			stream.markdown('\n**Cancelled.**\n');
			return;
		}

		const systemPrompt = this.buildSystemPrompt(this.getRoleDescription(), request.workspaceContextSnapshot);
		const planPrompt = [
			'Decompose the following developer request into subtasks.',
			'',
			'## Code Graph Context',
			graphContext,
			'',
			'## Developer Request',
			request.prompt,
			'',
			'Respond with a JSON plan wrapped in ```json``` code fences.',
		].join('\n');

		// Honour the per-turn model override from the chat composer's picker.
		// When the picker isn't wired (CLI / native chat-participant flow) the
		// request carries no `modelOverride` and we keep the historical
		// default of Opus so Anthropic users see no behavioural change.
		const planModel: ModelId = request.modelOverride ?? 'opus';
		const { text: planResponse } = await this.callLlm(
			taskId,
			planModel,
			systemPrompt,
			planPrompt,
		);

		if (token.isCancellationRequested) {
			stream.markdown('\n**Cancelled.**\n');
			return;
		}

		const plan = this.parsePlan(planResponse, request.prompt);
		this.activePlan = plan;

		structuredEmit?.({
			type: 'plan-proposed',
			plan: {
				subtasks: plan.subtasks.map(subtask => ({
					instruction: subtask.instruction,
					assignee: subtask.assignee,
					scopeFiles: subtask.scopeFiles,
					dependencies: subtask.dependencies,
				})),
			},
		});

		// Step 4: Present the plan
		stream.markdown('## Execution Plan\n\n');
		stream.markdown(`**Request:** ${request.prompt}\n\n`);

		for (let i = 0; i < plan.subtasks.length; i++) {
			const subtask = plan.subtasks[i];
			const deps = subtask.dependencies.length > 0
				? ` (depends on: ${subtask.dependencies.join(', ')})`
				: '';
			stream.markdown(
				`${i + 1}. **@${subtask.assignee}**: ${subtask.instruction}${deps}\n`
				+ `   - Files: ${subtask.scopeFiles.join(', ') || 'TBD'}\n\n`
			);
		}

		stream.markdown('\n### Scope Declaration\n\n');
		for (const entry of plan.scopeDeclaration.entries) {
			stream.markdown(`- **@${entry.agent}** (${entry.accessType}): ${entry.files.join(', ')}\n`);
		}

		stream.markdown('\n---\n\nUse `/approve` to execute this plan, or refine your request.\n');

		// Plan presented in full -- append a dry/witty signature. Gilfoyle is
		// preferred for plan-presentation flavour. Skipped on cancellation paths
		// above (which return early before reaching here).
		this.appendQuote(stream, personalityEnabled, {
			tone: 'dry',
			preferredCharacters: ['Gilfoyle'],
		});
	}

	/**
	 * Execute the approved plan by dispatching subtasks to specialists.
	 *
	 * Concurrent, dependency-aware fan-out: every cycle picks the set of
	 * subtasks whose dependencies are satisfied AND that aren't already in
	 * flight, dispatches all of them in parallel (no `await`), and waits on
	 * `waitForAnyInFlight` for the first completion before recomputing the
	 * ready set. A subtask only enters the dispatch queue once — repeated
	 * cycles never re-fire a still-running task.
	 *
	 * Cycle detection: if no tasks are in flight AND the ready set is empty
	 * yet `remaining` is non-empty, the dependency graph is broken (a cycle,
	 * or a dep on a permanently-failed task). The remaining ids are flushed
	 * as `subtask-blocked` and the loop exits.
	 *
	 * Cancellation: when `token.isCancellationRequested` fires, we stop
	 * dispatching new subtasks but the outstanding in-flight work is allowed
	 * to settle in the background (the LLM stream's AbortSignal lives a layer
	 * deeper than the orchestrator can reach today). The summary block is
	 * still printed using whatever has resolved by the time the loop unwinds.
	 */
	/**
	 * Conversational shortcut for greetings, small talk, and trivial
	 * clarifying questions. Skips code-graph queries and plan generation —
	 * which together can run for a minute on a cold-start MCP server — and
	 * streams a single LLM response directly to the chat surface.
	 *
	 * The system prompt is built via `buildSystemPrompt` so the orchestrator's
	 * voice / project context / specialist memory still apply; we just don't
	 * frame the response as a plan.
	 */
	private async handleConversationalTurn(
		request: ChatRequestLike,
		stream: ChatStreamLike,
		taskId: string,
		token: CancellationLike,
	): Promise<void> {
		const systemPrompt = this.buildSystemPrompt(this.getRoleDescription(), request.workspaceContextSnapshot)
			+ '\n\n## Mode\n\nYou are responding to a conversational message — a greeting, '
			+ 'a clarifying question, or general chit-chat. Reply concisely as Anton would: '
			+ 'one or two sentences, no plan, no JSON. If the user clearly intends to start a '
			+ 'coding task, suggest they restate the request with the action they want taken.';
		const turnModel: ModelId = request.modelOverride ?? this.defaultModel;
		const onToken = (token: string): void => {
			stream.markdown(token);
		};
		try {
			await this.callLlm(taskId, turnModel, systemPrompt, request.prompt, onToken);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (!token.isCancellationRequested) {
				stream.markdown(`\n\n**Error:** ${message}\n`);
			}
		}
	}

	private async handleApproveCommand(
		stream: ChatStreamLike,
		taskId: string,
		token: CancellationLike,
		personalityEnabled: boolean,
		structuredEmit?: (event: AgentEvent) => void,
	): Promise<void> {
		if (!this.activePlan) {
			stream.markdown('No active plan to approve. Use `@anton` to create a plan first.\n');
			return;
		}

		this.activePlan.approved = true;
		stream.markdown('**Plan approved. Executing subtasks...**\n\n');

		// Pep-talk before dispatch: Jared's earnest "let's pivot" energy fits
		// the moment. Sits between the approval banner and the first subtask
		// header, so it reads like an opening pep-talk rather than mid-stream
		// noise.
		this.appendQuote(stream, personalityEnabled, {
			tone: 'optimistic',
			preferredCharacters: ['Jared'],
		});

		const plan = this.activePlan;
		const subtaskById = new Map(plan.subtasks.map(s => [s.id, s]));
		const results: Map<string, SubtaskResult> = new Map();
		const inFlight = new Set<string>();
		const remaining = new Set(plan.subtasks.map(s => s.id));
		let dispatchPaused = false;

		// Consecutive-failure circuit breaker (H9). Counter is per-handle and
		// keyed by `subtask.assignee` — a single hung specialist can't take
		// down the whole approve cycle, but it *will* be quarantined for the
		// rest of this cycle once the threshold is hit. A successful subtask
		// resets the counter for that handle.
		const consecutiveFailureThreshold = this.config.consecutiveFailureCircuitBreaker ?? 3;
		const consecutiveFailures = new Map<AgentHandle, number>();
		const trippedHandles = new Set<AgentHandle>();

		const tripBreaker = (handle: AgentHandle): void => {
			if (trippedHandles.has(handle)) {
				return;
			}
			trippedHandles.add(handle);
			const reason = `Specialist @${handle} stuck — ${consecutiveFailureThreshold} consecutive failures, circuit breaker tripped.`;
			stream.markdown(`\n**Circuit breaker tripped for @${handle}** — skipping remaining subtasks for this specialist.\n\n`);
			// Quarantine every still-pending subtask for this handle. We
			// match the dependency-cycle path's emission shape so the task
			// board renders these identically.
			for (const id of [...remaining]) {
				const subtask = subtaskById.get(id);
				if (!subtask || subtask.assignee !== handle) {
					continue;
				}
				subtask.status = 'failed';
				remaining.delete(id);
				stream.markdown(`**Blocked** ${subtask.instruction} — ${reason}\n\n`);
				structuredEmit?.({
					type: 'subtask-blocked',
					subtaskId: subtask.id,
					assignee: subtask.assignee,
					reason,
				});
			}
		};

		while (remaining.size > 0) {
			if (token.isCancellationRequested) {
				stream.markdown('\n**Execution cancelled — letting in-flight subtasks settle.**\n');
				dispatchPaused = true;
				break;
			}

			const ready = [...remaining].filter(id => {
				if (inFlight.has(id)) {
					return false;
				}
				const subtask = subtaskById.get(id);
				if (!subtask) {
					return false;
				}
				if (trippedHandles.has(subtask.assignee)) {
					return false;
				}
				return subtask.dependencies.every(depId => results.get(depId)?.success);
			});

			if (ready.length === 0) {
				if (inFlight.size === 0) {
					// Nothing dispatchable, nothing running — graph is stuck.
					// Flush remaining ids as blocked so the board (and the chat)
					// can show the user *why* their plan didn't finish, rather
					// than just hanging.
					for (const id of remaining) {
						const subtask = subtaskById.get(id);
						if (!subtask) {
							continue;
						}
						subtask.status = 'failed';
						const reason = this.describeBlockingReason(subtask, results, subtaskById);
						stream.markdown(`**Blocked** ${subtask.instruction} — ${reason}\n\n`);
						structuredEmit?.({
							type: 'subtask-blocked',
							subtaskId: subtask.id,
							assignee: subtask.assignee,
							reason,
						});
					}
					remaining.clear();
					break;
				}
				// Wait for any in-flight to finish, then recompute ready.
				await this.waitForAnyInFlight();
				continue;
			}

			// Fan out the ready batch concurrently.
			for (const id of ready) {
				const subtask = subtaskById.get(id);
				if (!subtask) {
					remaining.delete(id);
					continue;
				}

				inFlight.add(id);
				remaining.delete(id);

				stream.markdown(`### Dispatching: ${subtask.instruction}\n`);
				stream.markdown(`Agent: @${subtask.assignee} | Files: ${subtask.scopeFiles.join(', ')}\n\n`);

				structuredEmit?.({
					type: 'subtask-ready',
					subtaskId: subtask.id,
					assignee: subtask.assignee,
				});
				structuredEmit?.({
					type: 'subtask-started',
					subtaskId: subtask.id,
					assignee: subtask.assignee,
					instruction: subtask.instruction,
				});

				// No await — fan-out. Settled state is captured via the
				// `.then`/`.catch` and the `inFlightDoneResolvers` queue so
				// the outer loop can re-evaluate dependencies as soon as any
				// subtask resolves.
				this.executeSubtask(subtask, taskId, stream, structuredEmit)
					.then(result => {
						results.set(subtask.id, result);
						if (result.success) {
							subtask.status = 'completed';
							consecutiveFailures.set(subtask.assignee, 0);
							stream.markdown(`**Completed:** ${subtask.instruction} — ${result.summary}\n\n`);
							structuredEmit?.({
								type: 'subtask-completed',
								subtaskId: subtask.id,
								assignee: subtask.assignee,
								summary: result.summary,
							});
						} else {
							subtask.status = 'failed';
							const next = (consecutiveFailures.get(subtask.assignee) ?? 0) + 1;
							consecutiveFailures.set(subtask.assignee, next);
							stream.markdown(`**Failed:** ${subtask.instruction} — ${result.summary}\n\n`);
							structuredEmit?.({
								type: 'subtask-failed',
								subtaskId: subtask.id,
								assignee: subtask.assignee,
								error: result.summary,
							});
							if (next >= consecutiveFailureThreshold) {
								tripBreaker(subtask.assignee);
							}
						}
					})
					.catch(err => {
						const message = err instanceof Error ? err.message : String(err);
						subtask.status = 'failed';
						results.set(subtask.id, {
							success: false,
							changes: [],
							summary: message,
							tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
						});
						const next = (consecutiveFailures.get(subtask.assignee) ?? 0) + 1;
						consecutiveFailures.set(subtask.assignee, next);
						stream.markdown(`**Failed:** ${subtask.instruction} — ${message}\n\n`);
						structuredEmit?.({
							type: 'subtask-failed',
							subtaskId: subtask.id,
							assignee: subtask.assignee,
							error: message,
						});
						if (next >= consecutiveFailureThreshold) {
							tripBreaker(subtask.assignee);
						}
					})
					.finally(() => {
						inFlight.delete(subtask.id);
						this.notifyInFlightDone();
					});
			}
		}

		// Drain whatever fan-out is still running. On the cancellation path we
		// also wait — the in-flight work is going to record results anyway,
		// and aborting the await would leak straggler logs into the next chat
		// turn.
		while (inFlight.size > 0) {
			await this.waitForAnyInFlight();
		}

		if (dispatchPaused && remaining.size > 0) {
			// User cancelled while there were still un-dispatched subtasks.
			// Flush them as blocked so the board doesn't show a stale "ready"
			// state and the user has a paper trail.
			for (const id of remaining) {
				const subtask = subtaskById.get(id);
				if (!subtask) {
					continue;
				}
				subtask.status = 'failed';
				structuredEmit?.({
					type: 'subtask-blocked',
					subtaskId: subtask.id,
					assignee: subtask.assignee,
					reason: 'Cancelled before dispatch.',
				});
			}
		}

		// Aggregate results
		stream.markdown('---\n\n## Summary\n\n');
		const allChanges = [...results.values()].flatMap(r => r.changes);
		const successCount = [...results.values()].filter(r => r.success).length;

		stream.markdown(`- **${successCount}/${results.size}** subtasks completed successfully\n`);
		stream.markdown(`- **${allChanges.length}** file changes proposed\n`);

		for (const change of allChanges) {
			stream.markdown(`  - ${change.changeType}: \`${change.filePath}\`\n`);
		}

		// Closing signature differs based on outcome. All-success -> a witty
		// Richard/Erlich line; any failure -> Gilfoyle apocalyptic. We treat
		// "anything failed" rather than "everything failed" as the threshold,
		// because partial-failure is still the moment that warrants gallows
		// humour.
		const allSucceeded = results.size > 0 && successCount === results.size;
		if (allSucceeded) {
			this.appendQuote(stream, personalityEnabled, {
				tone: 'witty',
				preferredCharacters: ['Richard', 'Erlich'],
			});
		} else if (results.size > 0) {
			this.appendQuote(stream, personalityEnabled, {
				tone: 'apocalyptic',
				preferredCharacters: ['Gilfoyle'],
				fallbackPicker: () => getApocalypticQuote(),
			});
		}

		this.activePlan = undefined;
	}

	/**
	 * Resolves on the next `notifyInFlightDone`. Each waiter gets its own
	 * resolver so we can have multiple concurrent waiters in pathological
	 * cases (recursive callers etc.) — the queue is drained in FIFO order.
	 */
	private waitForAnyInFlight(): Promise<void> {
		return new Promise<void>(resolve => {
			this.inFlightDoneResolvers.push(resolve);
		});
	}

	/**
	 * Wake up everyone waiting on `waitForAnyInFlight`. Drains the queue in
	 * one pass — callers re-add themselves on the next iteration of the
	 * dispatch loop if they need to wait again.
	 */
	private notifyInFlightDone(): void {
		const queue = this.inFlightDoneResolvers;
		this.inFlightDoneResolvers = [];
		for (const resolve of queue) {
			resolve();
		}
	}

	/**
	 * Best-effort human-readable explanation of why a subtask never ran.
	 * Distinguishes between "depended on a failed task" (the common case) and
	 * "dep id has no matching subtask" (parser glitch / cyclic graph).
	 */
	private describeBlockingReason(
		subtask: Subtask,
		results: ReadonlyMap<string, SubtaskResult>,
		subtaskById: ReadonlyMap<string, Subtask>,
	): string {
		const failedDeps: string[] = [];
		const missingDeps: string[] = [];
		for (const depId of subtask.dependencies) {
			const result = results.get(depId);
			if (result && !result.success) {
				failedDeps.push(depId);
			} else if (!subtaskById.has(depId)) {
				missingDeps.push(depId);
			}
		}
		if (failedDeps.length > 0) {
			return `dependency failed (${failedDeps.join(', ')}).`;
		}
		if (missingDeps.length > 0) {
			return `dependency not found (${missingDeps.join(', ')}).`;
		}
		return 'dependency graph is unresolvable (possible cycle).';
	}

	/**
	 * Execute a single subtask by dispatching to the assigned specialist.
	 */
	private async executeSubtask(
		subtask: Subtask,
		parentTaskId: string,
		stream: ChatStreamLike,
		structuredEmit?: (event: AgentEvent) => void,
	): Promise<SubtaskResult> {
		const specialist = this.specialists.get(subtask.assignee);
		if (!specialist) {
			return {
				success: false,
				changes: [],
				summary: `No specialist registered for @${subtask.assignee}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}

		const startTime = Date.now();
		subtask.status = 'in_progress';

		// Build graph context for the subtask's scope
		let graphContext = '';
		for (const file of subtask.scopeFiles) {
			const summary = await this.queryFileGraph(parentTaskId, file);
			graphContext += `### ${file}\n${summary}\n\n`;
		}

		// `onToken` is omitted when no structured channel is wired (native chat
		// participant flow), keeping the cheaper non-streaming LLM path.
		const context: AgentContext = {
			instruction: subtask.instruction,
			scopeFiles: subtask.scopeFiles,
			graphContext,
			parentTaskId,
			onToken: structuredEmit
				? (token) => structuredEmit({ type: 'subtask-token', subtaskId: subtask.id, token })
				: undefined,
		};

		// Per-turn timeout (H9). Race the specialist's execute() against a
		// wall-clock timer; if the timer wins, surface a timed-out
		// SubtaskResult and skip retries — a hung specialist won't unblock
		// by re-running. The losing branch is fenced with a `settled` flag
		// so a late-resolving execute() can't smuggle a stale result back
		// into the orchestrator.
		const perTurnTimeoutMs = this.config.perTurnTimeoutMs ?? 5 * 60 * 1000;

		// Execute with retry loop
		let result: SubtaskResult | undefined;
		let retryCount = 0;

		while (retryCount < this.config.maxRetries) {
			let settled = false;
			let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
			const timeoutPromise = new Promise<SubtaskResult>(resolve => {
				timeoutHandle = setTimeout(() => {
					if (settled) {
						return;
					}
					settled = true;
					resolve({
						success: false,
						changes: [],
						summary: `Timed out after ${perTurnTimeoutMs} ms`,
						tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
					});
				}, perTurnTimeoutMs);
			});

			const executePromise = specialist.execute(context).then(r => {
				if (settled) {
					// Timeout already won; discard this stale result so it
					// can't leak back into `results`.
					return undefined as unknown as SubtaskResult;
				}
				settled = true;
				if (timeoutHandle !== undefined) {
					clearTimeout(timeoutHandle);
				}
				return r;
			});

			const raced = await Promise.race([executePromise, timeoutPromise]);
			result = raced;
			const latencyMs = Date.now() - startTime;

			// Timeout path: record an escalation, do NOT retry.
			if (result && !result.success && result.summary.startsWith('Timed out after ')) {
				this.metricsTracker.recordEscalation(subtask.assignee);
				break;
			}

			this.metricsTracker.recordInvocation(subtask.assignee, latencyMs, result.tokenUsage);

			// Send through review agent if available
			if (this.reviewAgent && result.success) {
				const reviewResult = await this.reviewAgent.execute({
					instruction: `Review changes from @${subtask.assignee}: ${subtask.instruction}`,
					scopeFiles: result.changes.map(c => c.filePath),
					graphContext: '',
					parentTaskId,
				});

				if (!reviewResult.success) {
					const feedback = reviewResult.reviewFeedback;

					// Confidence-driven escalation (H3): when the reviewer
					// reports low confidence that a retry would actually fix
					// the issues, skip the retry and escalate immediately.
					// This saves a (potentially expensive) doomed turn and
					// surfaces the issue to the user faster.
					const lowConfidence = feedback?.confidenceInRetrySuccess !== undefined
						&& feedback.confidenceInRetrySuccess < 0.3;

					if (!lowConfidence && retryCount < this.config.maxRetries) {
						retryCount++;
						subtask.retryCount = retryCount;
						this.metricsTracker.recordRetry(subtask.assignee);

						context.instruction = buildRetryInstruction(subtask.instruction, reviewResult.summary, feedback);

						const confidenceTag = feedback?.confidenceInRetrySuccess !== undefined
							? ` (retry confidence: ${(feedback.confidenceInRetrySuccess * 100).toFixed(0)}%)`
							: '';
						stream.markdown(`*Retry ${retryCount}/${this.config.maxRetries}${confidenceTag}: incorporating review feedback...*\n`);
						continue;
					}

					// No retries left (or retry deemed unlikely to help):
					// mark the subtask failed and surface the structured
					// feedback to the developer.
					result.success = false;
					result.reviewFeedback = feedback;
					result.summary = [
						result.summary || 'Subtask failed final review.',
						'',
						lowConfidence ? 'Skipping retry — reviewer reported low confidence in success.' : 'Final review feedback:',
						reviewResult.summary,
					].join('\n');

					this.metricsTracker.recordEscalation(subtask.assignee);
				} else {
					result.reviewFeedback = reviewResult.reviewFeedback;
				}
			}

			if (retryCount === 0 && result.success) {
				this.metricsTracker.recordFirstPassSuccess(subtask.assignee);
			}

			break;
		}

		if (!result) {
			this.metricsTracker.recordEscalation(subtask.assignee);
			return {
				success: false,
				changes: [],
				summary: 'Max retries exceeded — escalating to developer.',
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}

		return result;
	}

	/**
	 * Show status of active agents.
	 */
	private async handleStatusCommand(
		stream: ChatStreamLike,
		personalityEnabled: boolean,
	): Promise<void> {
		const active = this.agentManager.getActiveTasks();
		const pending = this.agentManager.getPendingTasks();

		stream.markdown('## Agent Status\n\n');

		if (active.length === 0 && pending.length === 0) {
			stream.markdown('No active or pending tasks.\n');
			// Mixed-character dry quote -- nothing dramatic, just flavour.
			this.appendQuote(stream, personalityEnabled, { tone: 'dry' });
			return;
		}

		if (active.length > 0) {
			stream.markdown('### Active\n');
			for (const task of active) {
				stream.markdown(`- **${task.agentName}**: ${task.description}\n`);
			}
		}

		if (pending.length > 0) {
			stream.markdown('\n### Pending\n');
			for (const task of pending) {
				stream.markdown(`- **${task.agentName}**: ${task.description}\n`);
			}
		}

		if (this.activePlan) {
			stream.markdown('\n### Active Plan\n');
			const completed = this.activePlan.subtasks.filter(s => s.status === 'completed').length;
			stream.markdown(`Progress: ${completed}/${this.activePlan.subtasks.length} subtasks\n`);
		}

		this.appendQuote(stream, personalityEnabled, { tone: 'dry' });
	}

	/**
	 * Show metrics summary.
	 */
	private async handleMetricsCommand(
		stream: ChatStreamLike,
		personalityEnabled: boolean,
	): Promise<void> {
		stream.markdown(this.metricsTracker.formatSummary());
		// Persist when a workspace root has been configured on ProjectMemory.
		// `getWorkspaceRoot()` returns undefined when no workspace is open, in
		// which case `persistMetrics` is a no-op.
		await this.metricsTracker.persistMetrics(this.projectMemory.getWorkspaceRoot());
		stream.markdown('\n*Metrics persisted to .son-of-anton/metrics/*\n');
		this.appendQuote(stream, personalityEnabled, { tone: 'dry' });
	}

	/**
	 * Gather graph context for a request by querying the MCP code graph.
	 */
	private async gatherGraphContext(taskId: string, request: string): Promise<string> {
		const sections: string[] = [];

		// Query for relevant files based on the request
		try {
			const searchResult = await this.callMcpTool(
				taskId,
				'code-graph',
				'semantic_search',
				{ query: request, limit: 5 },
			);
			sections.push('## Relevant Files\n' + searchResult.content);
		} catch {
			sections.push('## Relevant Files\n(Code graph not available)');
		}

		return sections.join('\n\n');
	}

	/**
	 * Parse a plan from LLM output.
	 */
	private parsePlan(llmOutput: string, originalRequest: string): ExecutionPlan {
		const planId = `plan-${this.nextPlanId++}`;
		const subtasks: Subtask[] = [];
		const scopeEntries: ScopeEntry[] = [];

		// Extract JSON from the response
		const jsonMatch = llmOutput.match(/```json\s*\n([\s\S]*?)\n\s*```/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[1]);
				if (Array.isArray(parsed.subtasks)) {
					for (let i = 0; i < parsed.subtasks.length; i++) {
						const raw = parsed.subtasks[i];
						const subtask: Subtask = {
							id: `${planId}-subtask-${i}`,
							instruction: raw.instruction ?? '',
							assignee: raw.assignee ?? 'anton-code',
							scopeFiles: Array.isArray(raw.scopeFiles) ? raw.scopeFiles : [],
							dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
							status: 'pending',
							retryCount: 0,
						};
						subtasks.push(subtask);

						// Build scope declaration
						scopeEntries.push({
							agent: subtask.assignee,
							files: subtask.scopeFiles,
							accessType: subtask.assignee === 'anton-security' ? 'read' : 'write',
						});
					}
				}
			} catch {
				// Fallback: create a single subtask for the whole request
				subtasks.push({
					id: `${planId}-subtask-0`,
					instruction: originalRequest,
					assignee: 'anton-code',
					scopeFiles: [],
					dependencies: [],
					status: 'pending',
					retryCount: 0,
				});
			}
		} else {
			// No JSON found — single subtask fallback
			subtasks.push({
				id: `${planId}-subtask-0`,
				instruction: originalRequest,
				assignee: 'anton-code',
				scopeFiles: [],
				dependencies: [],
				status: 'pending',
				retryCount: 0,
			});
		}

		return {
			id: planId,
			originalRequest,
			subtasks,
			scopeDeclaration: { entries: scopeEntries },
			approved: false,
		};
	}

	/**
	 * Append a Silicon Valley quote signature as a markdown blockquote at the
	 * end of an orchestrator response.
	 *
	 * Behaviour:
	 * - Silently no-ops when `sota.personality.enabled` is false.
	 * - Fires only ~50% of the time even when enabled, so the signature lands
	 *   as flavour rather than as a fixed footer that gets old fast.
	 * - Tries each preferred character in order; falls back to the supplied
	 *   `fallbackPicker` (or a tone-only lookup) if none of the preferred
	 *   characters has a quote.
	 * - Silently no-ops if no quote can be found at all (rather than crashing
	 *   the chat).
	 *
	 * The output uses `stream.markdown`, which the WebView's AgentBridge shim
	 * already translates to `token` events -- so no separate structuredEmit
	 * call is needed for the chat panel to render it.
	 */
	private appendQuote(
		stream: ChatStreamLike,
		personalityEnabled: boolean,
		options: {
			readonly tone: SVQuoteTone;
			readonly preferredCharacters?: ReadonlyArray<SVCharacter>;
			readonly fallbackPicker?: () => SVQuote | undefined;
		},
	): void {
		if (!personalityEnabled) {
			return;
		}
		if (Math.random() >= QUOTE_PROBABILITY) {
			return;
		}

		const quote = this.pickQuote(options);
		if (!quote) {
			return;
		}

		// `_` -> ' ' so 'Big_Head' renders as 'Big Head' in attribution.
		const attribution = quote.character.replace('_', ' ');
		const formatted = `\n\n> "${quote.text}"\n> -- ${attribution}\n`;
		stream.markdown(formatted);
	}

	private pickQuote(options: {
		readonly tone: SVQuoteTone;
		readonly preferredCharacters?: ReadonlyArray<SVCharacter>;
		readonly fallbackPicker?: () => SVQuote | undefined;
	}): SVQuote | undefined {
		// 1. Strongest match: preferred character AND requested tone. Search
		//    the whole library so we consider every matching line, not the
		//    single random pick that getQuoteByCharacter would return.
		if (options.preferredCharacters && options.preferredCharacters.length > 0) {
			const preferred = new Set<SVCharacter>(options.preferredCharacters);
			const matches = SILICON_VALLEY_QUOTES.filter(
				q => preferred.has(q.character) && q.tone === options.tone,
			);
			if (matches.length > 0) {
				return matches[Math.floor(Math.random() * matches.length)];
			}

			// Tone didn't match -- accept any quote from the preferred
			// character(s) before broadening the search.
			for (const character of options.preferredCharacters) {
				const characterQuote = getQuoteByCharacter(character);
				if (characterQuote) {
					return characterQuote;
				}
			}
		}

		// 2. Fall back to any quote with the requested tone.
		const toneQuote = getQuoteByTone(options.tone);
		if (toneQuote) {
			return toneQuote;
		}

		// 3. Last resort: caller-provided fallback (e.g. getApocalypticQuote).
		return options.fallbackPicker?.();
	}

	/**
	 * Not used directly — orchestrator overrides handleChatRequest.
	 */
	async execute(_context: AgentContext): Promise<SubtaskResult> {
		return {
			success: true,
			changes: [],
			summary: 'Orchestrator does not execute subtasks directly.',
			tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
		};
	}
}

/**
 * Heuristic: does this look like a conversational message rather than a
 * coding task? Used by the orchestrator to bypass plan generation + code
 * graph queries for greetings and chit-chat. False negatives are fine
 * (the worst case is the user gets a plan instead of a chat reply); false
 * positives are bad (a real task would skip planning).
 */
export function isTrivialPrompt(prompt: string): boolean {
	const trimmed = prompt.trim();
	if (!trimmed) return true;
	if (trimmed.length < 8) return true;
	const lower = trimmed.toLowerCase();
	const greetingPatterns: ReadonlyArray<RegExp> = [
		/^(hi|hello|hey|yo|sup|hiya|howdy|greetings)\b/,
		/^(thanks|thank you|cheers|ta|nice|cool|ok|okay|got it)\b/,
		/^good (morning|afternoon|evening|night)\b/,
		/^(who are you|what are you|what is this|what can you do|what do you do|help)\??$/,
		/^how (are you|do you work|can i)\b/,
	];
	for (const re of greetingPatterns) {
		if (re.test(lower)) return true;
	}
	// Single-line questions under 40 chars without code-task verbs are
	// probably conversational.
	const codeTaskVerbs = /\b(write|implement|fix|refactor|rename|add|create|delete|remove|update|move|test|build|deploy|review|debug|trace|find|migrate)\b/;
	const isSingleLine = trimmed.indexOf('\n') < 0;
	if (trimmed.length < 40 && isSingleLine && !codeTaskVerbs.test(lower)) {
		return true;
	}
	return false;
}


/**
 * Build the next-retry instruction for a specialist after the review agent
 * flagged failure. When structured `issues` are present, render them as a
 * numbered list the model can target one-by-one ("addressing #2"). When
 * only freeform `summary` is available (legacy review output, parse
 * failure, etc.), fall back to the original "Previous Attempt Feedback"
 * shape so the harness stays usable.
 */
function buildRetryInstruction(
	originalInstruction: string,
	summary: string,
	feedback: ReviewFeedback | undefined,
): string {
	if (!feedback || !feedback.issues || feedback.issues.length === 0) {
		return [
			originalInstruction,
			'',
			'## Previous Attempt Feedback',
			summary,
		].join('\n');
	}

	const issueLines = feedback.issues.map(issue => {
		const loc = issue.location?.file
			? ` [${issue.location.file}${issue.location.line !== undefined ? ':' + issue.location.line : ''}]`
			: '';
		const fix = issue.proposedFix ? `\n     Proposed fix: ${issue.proposedFix}` : '';
		return `- **${issue.id}** (${issue.severity}/${issue.category})${loc}: ${issue.description}${fix}`;
	});

	const sections: string[] = [
		originalInstruction,
		'',
		'## Review Feedback (retry — address each blocker)',
		'',
		issueLines.join('\n'),
	];

	if (feedback.suggestedNextStep) {
		sections.push('', '**Next step:** ' + feedback.suggestedNextStep);
	}

	sections.push(
		'',
		'When you finish, briefly note which issue ids you addressed (e.g. "Fixed I1 and I2; I3 already correct.") so the reviewer can verify.',
	);

	return sections.join('\n');
}
