/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequestLike, ChatContextLike, ChatStreamLike, CancellationLike } from '../chatStream';
import type { ConfigStore, ProjectContextProvider } from '../host';
import { getVoice } from '../chat/personas';
import { LlmClient, ModelId, type LlmContentPart, type LlmMessage, type SystemPromptPart } from '../llm/LlmClient';
import { detectUncertainty, UNCERTAINTY_ESCALATION_THRESHOLD } from '../llm/confidence';
import { ModelRouter } from '../llm/ModelRouter';
import { McpClient, McpToolResult } from '../mcp/McpClient';
import { isPersonalityEnabled } from '../personality/personalityConfig';
import { formatSignOff, pickSignOffQuote } from '../personality/specialistQuotes';
import { buildTodoTools } from '../tools/todoTools';
import type { TodoEntry, Tool, ToolDefinition, ToolExecutionContext } from '../tools/types';
import { AgentEvent } from './agentEvents';
import { AgentManager } from './AgentManager';
import { MetricsTracker } from './MetricsTracker';
import { ProjectMemory } from './ProjectMemory';
import { COMPACTION_THRESHOLD, SpecialistMemory } from './SpecialistMemory';
import {
	AgentConfig,
	AgentHandle,
	FileChange,
	SubtaskResult,
	TokenUsage,
} from './types';

/**
 * Probability that a natural turn-end emits a curated sign-off quote (Phase
 * 78). Sign-offs are flavour, not signal -- firing on every turn would get
 * tiresome quickly. 25% lands them often enough to feel like character,
 * rarely enough to stay charming.
 *
 * Math.random() is intentional: cryptographic randomness is not required for
 * a UX gimmick, and `crypto.getRandomValues` would force a host capability
 * the CLI doesn't currently expose.
 */
const SIGN_OFF_PROBABILITY = 0.25;

/**
 * H4 — system-prompt section that teaches the model to emit a structured
 * follow-up suggestion block at the end of its reply when the host has
 * opted in. The CLI TUI already parses + strips this sentinel; the IDE
 * chat panel leaves the flag off (until a follow-up wires sentinel
 * stripping into chat-webview.js).
 *
 * The chosen sentinel form (`<<sota:suggestions>>[...]<<sota:end>>`) is
 * deliberately noisy so it survives round-tripping through markdown
 * renderers — generic markdown processors can't accidentally interpret
 * `<<` or `>>` as anything meaningful.
 */
const SUGGESTIONS_SENTINEL_INSTRUCTION = [
	'## Follow-up suggestions',
	'',
	'After your main reply, append a sentinel block listing 2-4 short follow-up',
	'prompts the user might want to send next. The TUI uses this to show',
	'tab-cyclable next-step buttons. Keep each suggestion under 60 characters,',
	'phrased as something the *user* would type ("Run the tests", not "I will',
	'run the tests"). Skip the block entirely when no useful follow-ups exist.',
	'',
	'Format (verbatim — sentinels matter for parsing):',
	'',
	'```',
	'<<sota:suggestions>>',
	'["Run the tests", "Show me the diff", "Explain that further"]',
	'<<sota:end>>',
	'```',
].join('\n');

/**
 * Context provided to specialist agents for each subtask.
 */
export interface AgentContext {
	instruction: string;
	scopeFiles: string[];
	graphContext: string;
	parentTaskId: string;
	/**
	 * Optional per-token callback. When provided, the specialist should
	 * forward LLM tokens through this callback so the chat surface can
	 * render live streaming inside the active subtask card.
	 */
	onToken?: (token: string) => void;
}

/**
 * Optional per-turn flags shared between `runChatTurn` and
 * `runAgenticTurn`. Most fields default to undefined; only
 * `modelOverride` is regularly supplied (from the chat composer's
 * model picker). The shape is structural rather than positional so
 * adding a new field doesn't cascade through every call site.
 */
export interface ChatTurnOptions {
	/** Per-turn model override from the chat composer's picker. */
	readonly modelOverride?: ModelId;
	/** Per-turn workspace snapshot block injected into the system prompt. */
	readonly workspaceContextSnapshot?: string;
	/**
	 * Whether the agent should emit a `<<sota:suggestions>>` follow-up
	 * sentinel at the end of its reply. The CLI TUI strips + renders
	 * the sentinel; surfaces that don't (orchestrator path today)
	 * leave this false to avoid the protocol leaking into rendered
	 * text.
	 */
	readonly emitFollowupSuggestions?: boolean;
	/**
	 * Host-supplied opaque id used to scope per-conversation
	 * specialist memory + post-turn compaction. When omitted, the
	 * legacy global view is used.
	 */
	readonly conversationId?: string;
}

/**
 * Base class for all specialist agents.
 * Provides shared infrastructure: LLM calls, MCP tool access, tracing, and metrics.
 */
export abstract class BaseAgent {
	protected readonly config: AgentConfig;
	protected readonly llmClient: LlmClient;
	protected readonly mcpClient: McpClient;
	protected readonly agentManager: AgentManager;
	protected readonly metricsTracker: MetricsTracker;
	protected readonly projectMemory: ProjectMemory;
	protected readonly specialistMemory?: SpecialistMemory;
	protected readonly configStore?: ConfigStore;
	protected readonly projectContext?: ProjectContextProvider;
	/**
	 * Host-supplied tool execution context. When set, specialists that opt in
	 * (currently `CodeGeneratorAgent`) drive the H1 native tool-use loop
	 * (`runToolLoop`) against this context for read_file / edit_file /
	 * write_file / run_command / search_workspace / glob calls. When unset,
	 * specialists fall back to the legacy text-extraction path
	 * (`parseFileChanges`) so installations that don't supply a context
	 * still get a usable result.
	 */
	protected readonly toolExecutionContext?: ToolExecutionContext;
	/**
	 * Host-supplied shared `ModelRouter`. When set, callers reuse this
	 * instance for escalation lookups (and any future routing/A-B-trial
	 * decisions) so trial state stays consistent across the session
	 * instead of re-initialising on every callLlm. Falls back to an
	 * ad-hoc instance when `undefined` — `selectEscalationModel` is
	 * stateless so the lookup result doesn't change.
	 */
	protected readonly modelRouter?: ModelRouter;

	/**
	 * H12 — re-entry guard for `maybeCompactMemory`. Compaction is fired
	 * after every turn so multiple in-flight turns on the same agent
	 * could otherwise stack overlapping Haiku calls + map writes. Set
	 * while a compaction is running, cleared in the `finally`.
	 */
	private compactionInProgress = false;

	constructor(
		config: AgentConfig,
		llmClient: LlmClient,
		mcpClient: McpClient,
		agentManager: AgentManager,
		metricsTracker: MetricsTracker,
		projectMemory: ProjectMemory,
		specialistMemory?: SpecialistMemory,
		configStore?: ConfigStore,
		projectContext?: ProjectContextProvider,
		toolExecutionContext?: ToolExecutionContext,
		modelRouter?: ModelRouter,
	) {
		this.config = config;
		this.llmClient = llmClient;
		this.mcpClient = mcpClient;
		this.agentManager = agentManager;
		this.metricsTracker = metricsTracker;
		this.projectMemory = projectMemory;
		this.specialistMemory = specialistMemory;
		this.configStore = configStore;
		this.projectContext = projectContext;
		this.toolExecutionContext = toolExecutionContext;
		this.modelRouter = modelRouter;
	}

	get handle(): AgentHandle {
		return this.config.handle;
	}

	get displayName(): string {
		return this.config.displayName;
	}

	get defaultModel(): ModelId {
		return this.config.defaultModel;
	}

	/**
	 * Build the system prompt for this agent.
	 *
	 * Section order is chosen for prompt-cache friendliness and specificity:
	 * 1. Voice (Phase 78 — character paragraph from `personas.ts`, sets HOW
	 *    before the role description sets WHAT)
	 * 2. Role description (most static — defined per agent class)
	 * 3. Project context (Phase 67 — `AGENTS.md` / `CLAUDE.md` from the
	 *    workspace, supplied by `host.projectContext`)
	 * 4. Project memory (semi-static — `.son-of-anton/memory/` entries plus
	 *    the legacy CLAUDE.md path inside `ProjectMemory`)
	 * 5. Specialist memory (most dynamic — per-handle KV store)
	 *
	 * Specialist memory sits last so it's closest to the user message and
	 * exerts the strongest influence on the model's response. Project context
	 * sits between the role and the memory blocks so the agent reads the
	 * project's invariants right after learning what it is, before any
	 * accumulated session memory.
	 */
	protected buildSystemPrompt(
		roleDescription: string,
		workspaceContextSnapshotOrOptions?: string | { workspaceContextSnapshot?: string; emitFollowupSuggestions?: boolean; conversationId?: string },
	): string {
		// Backwards-compatibility: callers used to pass `workspaceContextSnapshot`
		// as a positional string. New callers can pass an options bag to opt in
		// to additional system-prompt sections (e.g. the H4 follow-up
		// suggestions sentinel) or scope specialist memory to a conversation
		// (H6 — `conversationId`).
		const opts = typeof workspaceContextSnapshotOrOptions === 'string'
			? { workspaceContextSnapshot: workspaceContextSnapshotOrOptions }
			: (workspaceContextSnapshotOrOptions ?? {});
		const workspaceContextSnapshot = opts.workspaceContextSnapshot;
		const emitFollowupSuggestions = !!opts.emitFollowupSuggestions;
		const conversationId = opts.conversationId;

		const voice = getVoice(this.handle);
		const projectCtx = this.projectContext?.get();
		const memoryContext = this.projectMemory.getSystemContext();
		const specialistMem = this.specialistMemory?.formatForSystemPrompt(this.handle, conversationId);
		const sections: string[] = [];

		if (voice) {
			sections.push(`## Voice\n${voice}`);
		}

		sections.push(roleDescription);

		if (projectCtx && projectCtx.trim()) {
			sections.push(`## Project Context (from AGENTS.md)\n\n${projectCtx}`);
		}

		if (workspaceContextSnapshot && workspaceContextSnapshot.trim()) {
			sections.push(workspaceContextSnapshot);
		}

		if (memoryContext) {
			sections.push(memoryContext);
		}

		if (specialistMem) {
			sections.push(specialistMem);
		}

		if (emitFollowupSuggestions) {
			sections.push(SUGGESTIONS_SENTINEL_INSTRUCTION);
		}

		return sections.join('\n\n---\n\n');
	}

	/**
	 * H5 — split-system-prompt variant of `buildSystemPrompt`. Returns up to
	 * three `SystemPromptPart`s that Anthropic-compatible providers map onto
	 * separate cache_control blocks:
	 *
	 *   Part 1 — voice + role + project context (~static across many turns)
	 *   Part 2 — workspace snapshot + project memory (~stable mid-session)
	 *   Part 3 — specialist memory + sentinel instructions (changes per turn)
	 *
	 * The first two parts are marked `cache: 'ephemeral'` so the prefix
	 * stays cached even when the third part churns. Empty parts are pruned
	 * so a workspace without a snapshot doesn't pay the breakpoint cost
	 * for nothing. Specialists that opt in (CodeGeneratorAgent today) pass
	 * these to `LlmRequestOptions.systemPromptParts`; legacy callers stay
	 * on `buildSystemPrompt` and pay the single-block cache cost they
	 * always paid.
	 */
	protected buildSystemPromptParts(
		roleDescription: string,
		options?: { workspaceContextSnapshot?: string; emitFollowupSuggestions?: boolean; conversationId?: string },
	): ReadonlyArray<{ text: string; cache?: 'ephemeral' }> {
		const opts = options ?? {};
		const voice = getVoice(this.handle);
		const projectCtx = this.projectContext?.get();
		const memoryContext = this.projectMemory.getSystemContext();
		const specialistMem = this.specialistMemory?.formatForSystemPrompt(this.handle, opts.conversationId);

		// Part 1 — most static. Voice + role + project context (AGENTS.md /
		// CLAUDE.md). These don't change inside a session, so caching them
		// gives the highest hit rate.
		const staticSections: string[] = [];
		if (voice) {
			staticSections.push(`## Voice\n${voice}`);
		}
		staticSections.push(roleDescription);
		if (projectCtx && projectCtx.trim()) {
			staticSections.push(`## Project Context (from AGENTS.md)\n\n${projectCtx}`);
		}

		// Part 2 — semi-static. Workspace snapshot + project memory.
		// Workspace snapshot updates when the user changes editors / opens
		// new files; project memory updates when `.son-of-anton/memory/`
		// changes. Both shift slowly enough that a separate breakpoint
		// here is still worth caching.
		const semiStaticSections: string[] = [];
		if (opts.workspaceContextSnapshot && opts.workspaceContextSnapshot.trim()) {
			semiStaticSections.push(opts.workspaceContextSnapshot);
		}
		if (memoryContext) {
			semiStaticSections.push(memoryContext);
		}

		// Part 3 — most dynamic. Specialist memory updates after every turn
		// and the suggestion sentinel instruction is per-turn opt-in. No
		// breakpoint here — the dynamic suffix shouldn't carry a cache marker.
		const dynamicSections: string[] = [];
		if (specialistMem) {
			dynamicSections.push(specialistMem);
		}
		if (opts.emitFollowupSuggestions) {
			dynamicSections.push(SUGGESTIONS_SENTINEL_INSTRUCTION);
		}

		const parts: Array<{ text: string; cache?: 'ephemeral' }> = [];
		if (staticSections.length > 0) {
			parts.push({ text: staticSections.join('\n\n---\n\n'), cache: 'ephemeral' });
		}
		if (semiStaticSections.length > 0) {
			parts.push({ text: semiStaticSections.join('\n\n---\n\n'), cache: 'ephemeral' });
		}
		if (dynamicSections.length > 0) {
			parts.push({ text: dynamicSections.join('\n\n---\n\n') });
		}
		return parts;
	}

	/**
	 * Call an MCP tool and record a trace span.
	 */
	protected async callMcpTool(
		taskId: string,
		server: string,
		tool: string,
		inputs: Record<string, unknown>,
	): Promise<McpToolResult> {
		const span = this.agentManager.addSpan({
			taskId,
			name: `${server}/${tool}`,
			type: 'mcp_tool',
			startTime: Date.now(),
			attributes: { server, tool, inputs: JSON.stringify(inputs) },
		});

		const result = await this.mcpClient.callTool({ server, tool, inputs });

		span.endTime = Date.now();
		span.attributes['latencyMs'] = result.latencyMs;
		span.attributes['isError'] = result.isError;

		return result;
	}

	/**
	 * Make an LLM request and record a trace span.
	 *
	 * When `onToken` is provided, the request is routed through the streaming
	 * client so the caller can surface live tokens (e.g. into a subtask card).
	 * Without `onToken`, the cheaper non-streaming path is used to avoid the
	 * SSE overhead.
	 *
	 * H7 — When `options.escalateOnUncertainty` is true, the response is run
	 * through `detectUncertainty` and, if it scores at or above
	 * `UNCERTAINTY_ESCALATION_THRESHOLD` and the model has a defined
	 * escalation target (see `ModelRouter.selectEscalationModel`), the call
	 * is retried *once* on the stronger model. The escalated call records a
	 * separate span tagged `escalation: true` so the trace pane can show
	 * both attempts, and the returned `tokenUsage` aggregates both legs so
	 * cost accounting stays honest. Default is OFF — specialists must opt
	 * in. Tool-loop turns (`runToolLoop`) deliberately don't use this path;
	 * per-turn uncertainty detection across a multi-step loop is too
	 * coarse to be useful.
	 */
	protected async callLlm(
		taskId: string,
		model: ModelId,
		systemPrompt: string,
		userMessage: string,
		onToken?: (token: string) => void,
		options?: { escalateOnUncertainty?: boolean },
	): Promise<{ text: string; tokenUsage: TokenUsage }> {
		const escalateOnUncertainty = !!options?.escalateOnUncertainty;
		const initial = await this.callLlmOnce(taskId, model, systemPrompt, userMessage, onToken, false);

		if (!escalateOnUncertainty) {
			return initial;
		}

		// Use the host-supplied shared ModelRouter when available (so trial
		// state + future per-task routing decisions stay consistent across
		// the session). Fall back to a fresh instance for tests / non-stack
		// invocations — `selectEscalationModel` is stateless so the result
		// is identical either way.
		const router = this.modelRouter ?? new ModelRouter();
		const escalationTarget = router.selectEscalationModel(model);
		if (!escalationTarget) {
			return initial;
		}

		const signals = detectUncertainty(initial.text);
		if (signals.score < UNCERTAINTY_ESCALATION_THRESHOLD) {
			return initial;
		}

		// Retry once on the stronger model. We don't recurse into a chain of
		// escalations — sonnet → opus is the second hop and that's where the
		// ladder ends.
		const escalated = await this.callLlmOnce(taskId, escalationTarget, systemPrompt, userMessage, onToken, true);

		const tokenUsage: TokenUsage = {
			inputTokens: initial.tokenUsage.inputTokens + escalated.tokenUsage.inputTokens,
			outputTokens: initial.tokenUsage.outputTokens + escalated.tokenUsage.outputTokens,
			cachedTokens: initial.tokenUsage.cachedTokens + escalated.tokenUsage.cachedTokens,
			naiveInputTokens: initial.tokenUsage.naiveInputTokens + escalated.tokenUsage.naiveInputTokens,
		};
		return { text: escalated.text, tokenUsage };
	}

	/**
	 * Single-shot LLM call helper used by `callLlm`. Records a trace span
	 * tagged with the model id and (when applicable) `escalation: true` so
	 * H7's two-leg escalation shows up cleanly in the trace pane.
	 */
	private async callLlmOnce(
		taskId: string,
		model: ModelId,
		systemPrompt: string,
		userMessage: string,
		onToken: ((token: string) => void) | undefined,
		isEscalation: boolean,
	): Promise<{ text: string; tokenUsage: TokenUsage }> {
		const span = this.agentManager.addSpan({
			taskId,
			name: `llm-${model}${isEscalation ? '-escalated' : ''}`,
			type: 'llm_call',
			startTime: Date.now(),
			attributes: isEscalation ? { model, escalation: true } : { model },
		});

		if (onToken) {
			let text = '';
			for await (const event of this.llmClient.streamRequest({
				model,
				systemPrompt,
				messages: [{ role: 'user', content: userMessage }],
			})) {
				if (event.type === 'token') {
					text += event.token;
					onToken(event.token);
				} else if (event.type === 'error') {
					throw new Error(event.error);
				}
			}

			span.endTime = Date.now();

			const usage = this.llmClient.getTokenUsage();
			const tokenUsage: TokenUsage = {
				inputTokens: usage.input,
				outputTokens: usage.output,
				cachedTokens: usage.cached,
				naiveInputTokens: 0,
			};

			span.attributes['inputTokens'] = tokenUsage.inputTokens;
			span.attributes['outputTokens'] = tokenUsage.outputTokens;

			return { text, tokenUsage };
		}

		const text = await this.llmClient.request({
			model,
			systemPrompt,
			messages: [{ role: 'user', content: userMessage }],
		});

		span.endTime = Date.now();

		const usage = this.llmClient.getTokenUsage();
		const tokenUsage: TokenUsage = {
			inputTokens: usage.input,
			outputTokens: usage.output,
			cachedTokens: usage.cached,
			naiveInputTokens: 0,
		};

		span.attributes['inputTokens'] = tokenUsage.inputTokens;
		span.attributes['outputTokens'] = tokenUsage.outputTokens;

		return { text, tokenUsage };
	}

	/**
	 * Stream an LLM response to a VS Code chat response stream.
	 */
	protected async streamToChat(
		stream: ChatStreamLike,
		model: ModelId,
		systemPrompt: string,
		userMessage: string,
	): Promise<string> {
		let fullText = '';

		for await (const event of this.llmClient.streamRequest({
			model,
			systemPrompt,
			messages: [{ role: 'user', content: userMessage }],
		})) {
			if (event.type === 'token') {
				stream.markdown(event.token);
				fullText += event.token;
			} else if (event.type === 'error') {
				stream.markdown(`\n\n**Error:** ${event.error}`);
				throw new Error(event.error);
			}
		}

		return fullText;
	}

	/**
	 * Query the code graph for file summary information.
	 */
	protected async queryFileGraph(taskId: string, filePath: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'file_summary', { filePath });
		return result.content;
	}

	/**
	 * Query the code graph for symbol lookup.
	 */
	protected async querySymbol(taskId: string, symbolName: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'symbol_lookup', { symbolName });
		return result.content;
	}

	/**
	 * Query the code graph for dependencies of a file.
	 */
	protected async queryDependencies(taskId: string, filePath: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'dependency_traversal', { filePath });
		return result.content;
	}

	/**
	 * Query the code graph for impact analysis.
	 */
	protected async queryImpact(taskId: string, filePath: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'impact_analysis', { filePath });
		return result.content;
	}

	/**
	 * Query references to a symbol.
	 */
	protected async queryReferences(taskId: string, symbolName: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'find_references', { symbolName });
		return result.content;
	}

	/**
	 * Parse file changes from an LLM response.
	 * Expects the LLM to output changes in a structured format.
	 */
	protected parseFileChanges(llmOutput: string): FileChange[] {
		const changes: FileChange[] = [];
		const fileBlockRegex = /```(?:diff|patch)?\s*\n([\s\S]*?)```/g;

		let match;
		while ((match = fileBlockRegex.exec(llmOutput)) !== null) {
			const block = match[1] ?? '';
			const lines = block.split('\n');

			let filePath = '';
			let startIndex = 0;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// Prefer +++ b/<path> when available
				const plusMatch = line.match(/^\+\+\+\s+b\/(.+)\s*$/);
				if (plusMatch) {
					filePath = plusMatch[1];
					startIndex = i + 1;
					break;
				}

				// Support diff --git a/... b/... headers
				const gitMatch = line.match(/^diff --git a\/.+ b\/(.+)\s*$/);
				if (gitMatch) {
					filePath = gitMatch[1];
					startIndex = i + 1;
					// Don't break yet; there may still be a +++ line later
				}

				// Fallback: use --- a/<path> if nothing else is found
				if (!filePath) {
					const minusMatch = line.match(/^---\s+a\/(.+)\s*$/);
					if (minusMatch) {
						filePath = minusMatch[1];
						startIndex = i + 1;
					}
				}
			}

			// If we couldn't determine a file path, skip this block
			if (!filePath) {
				continue;
			}

			const diff = lines.slice(startIndex).join('\n');

			if (diff.trim()) {
				changes.push({
					filePath,
					changeType: 'modify',
					diff: diff.trim(),
				});
			}
		}

		// Also look for full file outputs
		const createRegex = /<!-- CREATE: (.+?) -->\n```\w*\n([\s\S]*?)```/g;
		while ((match = createRegex.exec(llmOutput)) !== null) {
			changes.push({
				filePath: match[1],
				changeType: 'create',
				content: match[2].trim(),
			});
		}

		return changes;
	}

	/**
	 * Execute the agent's task. Implemented by each specialist.
	 */
	abstract execute(context: AgentContext): Promise<SubtaskResult>;

	/**
	 * Drive the model through a native tool-use loop until it stops calling
	 * tools (or `maxIterations` is reached). This is the harness's H1
	 * primitive — specialists used to single-shot-call the model and
	 * regex-parse diff blocks out of the response (see `parseFileChanges`).
	 * `runToolLoop` flips that to the cycle frontier models are actually
	 * trained on:
	 *
	 *   model_call → [tool_use blocks] → execute tools → [tool_result blocks] → model_call → …
	 *
	 * Caller responsibilities:
	 *   - Provide an `executeTool` callback that runs each tool against the
	 *     host's `ToolExecutionContext` (and gates calls through the
	 *     auto-approval policy / workspace trust).
	 *   - Pre-build the initial conversation messages (system prompt is
	 *     passed separately so caching breakpoints stay clean).
	 *
	 * Provider note: only Anthropic-compatible providers serialise
	 * `tool_use` / `tool_result` content blocks today (see
	 * `serialiseAnthropicContent`). Routing this method to OpenAI / Gemini
	 * / Foundry will throw at the serialiser boundary; specialists should
	 * pin their `model` to an Anthropic-compatible id when using the loop.
	 *
	 * Returns the final assistant text (last iteration's text), aggregate
	 * token usage across all iterations, the list of tool calls executed,
	 * and the full message history (useful for transcript rendering).
	 */
	protected async runToolLoop(args: {
		taskId: string;
		model: ModelId;
		systemPrompt: string;
		/**
		 * Optional. When supplied, takes precedence over `systemPrompt` and
		 * is forwarded to `LlmRequestOptions.systemPromptParts` for
		 * cache-aware delivery (H5). Anthropic-compatible providers map
		 * each part onto its own `cache_control` block; non-Anthropic
		 * providers concatenate the parts back into a single string.
		 */
		systemPromptParts?: ReadonlyArray<SystemPromptPart>;
		initialMessages: LlmMessage[];
		tools: ReadonlyArray<ToolDefinition>;
		maxIterations?: number;
		signal?: AbortSignal;
		onToken?: (token: string) => void;
		executeTool: (call: { name: string; input: Record<string, unknown>; id: string }) => Promise<{ result: string; isError?: boolean }>;
		/**
		 * H13 — opt the agent into the focus-chain `todo_write` / `todo_read`
		 * tools. State is per-loop: each `runToolLoop` call gets a fresh
		 * empty list, the agent populates it, the final list is returned in
		 * the result. Useful for multi-step work where the agent benefits
		 * from planning + checking off items as it progresses.
		 */
		includeTodoTools?: boolean;
	}): Promise<{
		text: string;
		iterations: number;
		messages: LlmMessage[];
		toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string; result: string; isError: boolean }>;
		tokenUsage: TokenUsage;
		/** Final state of the per-loop todo list (empty when not opted in). */
		todos: ReadonlyArray<TodoEntry>;
	}> {
		const maxIterations = args.maxIterations ?? 10;
		const messages: LlmMessage[] = [...args.initialMessages];

		// H13 — wire in the todo focus-chain tools when requested. The
		// factory returns both the executable tools (so the local
		// `executeTool` shim below can route todo calls into their
		// closure-bound state) and a `getTodos()` accessor so the loop
		// can surface the final list once the agent stops iterating.
		const todoBundle = args.includeTodoTools ? buildTodoTools() : undefined;
		const todoToolMap = new Map<string, Tool>();
		if (todoBundle) {
			for (const t of todoBundle.tools) {
				todoToolMap.set(t.definition.name, t);
			}
		}
		const exposedToolDefinitions: ReadonlyArray<ToolDefinition> = todoBundle
			? [...args.tools, ...todoBundle.tools.map(t => t.definition)]
			: args.tools;
		const executedCalls: Array<{ name: string; input: Record<string, unknown>; id: string; result: string; isError: boolean }> = [];
		const aggregateUsage: TokenUsage = {
			inputTokens: 0,
			outputTokens: 0,
			cachedTokens: 0,
			naiveInputTokens: 0,
		};
		let lastText = '';

		for (let iteration = 1; iteration <= maxIterations; iteration++) {
			const span = this.agentManager.addSpan({
				taskId: args.taskId,
				name: `tool-loop-${iteration}`,
				type: 'llm_call',
				startTime: Date.now(),
				attributes: { model: args.model, iteration },
			});

			let text = '';
			const pendingCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

			for await (const event of this.llmClient.streamRequest({
				model: args.model,
				systemPrompt: args.systemPrompt,
				systemPromptParts: args.systemPromptParts,
				messages,
				tools: exposedToolDefinitions.map(t => ({
					name: t.name,
					description: t.description,
					inputSchema: t.inputSchema as { type: 'object'; properties: Record<string, unknown>; required?: ReadonlyArray<string> },
				})),
				agentHandle: this.handle,
				enableCaching: true,
				signal: args.signal,
			})) {
				if (event.type === 'token') {
					text += event.token;
					args.onToken?.(event.token);
				} else if (event.type === 'tool-call') {
					pendingCalls.push({ id: event.id, name: event.name, input: event.input });
				} else if (event.type === 'error') {
					span.endTime = Date.now();
					throw new Error(event.error);
				}
			}

			span.endTime = Date.now();
			lastText = text;

			const usage = this.llmClient.getTokenUsage();
			aggregateUsage.inputTokens += usage.input;
			aggregateUsage.outputTokens += usage.output;
			aggregateUsage.cachedTokens += usage.cached;

			if (pendingCalls.length === 0) {
				// Natural turn-end: model is done with tools. Return.
				return {
					text: lastText,
					iterations: iteration,
					messages,
					toolCalls: executedCalls,
					tokenUsage: aggregateUsage,
					todos: todoBundle ? todoBundle.getTodos() : [],
				};
			}

			// Append the assistant turn (text + tool_use blocks) to the
			// conversation. Anthropic requires tool_use blocks alongside
			// any text the model emitted in the same assistant message.
			const assistantContent: LlmContentPart[] = [];
			if (text.trim()) {
				assistantContent.push({ type: 'text', text });
			}
			for (const call of pendingCalls) {
				assistantContent.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
			}
			messages.push({ role: 'assistant', content: assistantContent });

			// Execute each tool and append the results as a single user turn.
			const resultParts: LlmContentPart[] = [];
			for (const call of pendingCalls) {
				let result: { result: string; isError?: boolean };
				try {
					// H13 — todo_write / todo_read are bound to the in-loop
					// state inside `todoBundle` and execute here (not via the
					// caller's executeTool). Other tools route through the
					// caller-supplied executeTool as before.
					const todoTool = todoToolMap.get(call.name);
					if (todoTool) {
						const r = await todoTool.execute(call.input, {} as ToolExecutionContext);
						result = { result: r.content, isError: !!r.isError };
					} else {
						result = await args.executeTool(call);
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					result = { result: `Tool execution threw: ${message}`, isError: true };
				}
				executedCalls.push({
					name: call.name,
					input: call.input,
					id: call.id,
					result: result.result,
					isError: !!result.isError,
				});
				resultParts.push({
					type: 'tool_result',
					tool_use_id: call.id,
					content: result.result,
					...(result.isError ? { is_error: true } : {}),
				});
			}
			messages.push({ role: 'user', content: resultParts });
		}

		// Exhausted maxIterations without the model settling. Surface that
		// distinctly from a tool-error so the caller can record the right
		// kind of failure in metrics.
		throw new Error(`Tool loop exceeded ${maxIterations} iterations without reaching end_turn — check whether a tool keeps returning errors or the model is stuck in a loop.`);
	}

	/**
	 * Stream a single chat turn against this agent's role prompt. Used by
	 * non-chat-participant surfaces (e.g. the WebView sidebar) that need the
	 * same behaviour as `handleChatRequest` but with a callback-based emit
	 * channel and an `AbortSignal`-friendly cancellation hook. Returns the
	 * full assistant text once the stream completes.
	 *
	 * Optional per-turn flags (`modelOverride`, `workspaceContextSnapshot`,
	 * `emitFollowupSuggestions`, `conversationId`) are bundled into a single
	 * `ChatTurnOptions` bag so adding a new flag doesn't ripple through
	 * every call site — only callers that supply the new field touch their
	 * invocation.
	 */
	async runChatTurn(
		userMessage: string,
		emit: (token: string) => void,
		cancellation: CancellationLike,
		options?: ChatTurnOptions,
	): Promise<string> {
		const {
			modelOverride,
			workspaceContextSnapshot,
			emitFollowupSuggestions,
			conversationId,
		} = options ?? {};
		// Task descriptions surface in the trace pane and the task list, so we
		// keep the title short. The full prompt — which may include a multi-page
		// workspace context block — stays in the LLM call but never leaks into
		// the tracing UI as a wall of escaped markdown.
		const task = this.agentManager.createTask(this.displayName, truncateForTaskTitle(userMessage));
		this.agentManager.startTask(task.id);

		const controller = new AbortController();
		const cancelSubscription = cancellation.onCancellationRequested(() => controller.abort());

		try {
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription(), {
				workspaceContextSnapshot,
				emitFollowupSuggestions,
				conversationId,
			});
			let fullText = '';
			// Per-turn model override (from the chat composer's picker). Without
			// an override we fall back to this specialist's `defaultModel`,
			// keeping historical Anthropic-by-default behaviour intact for
			// callers that don't surface the picker (CLI / tests).
			const turnModel: ModelId = modelOverride ?? this.defaultModel;
			for await (const event of this.llmClient.streamRequest({
				model: turnModel,
				systemPrompt,
				messages: [{ role: 'user', content: userMessage }],
				signal: controller.signal,
				agentHandle: this.handle,
			})) {
				if (event.type === 'token') {
					emit(event.token);
					fullText += event.token;
				} else if (event.type === 'error') {
					throw new Error(event.error);
				}
			}
			// Sign-off (Phase 78): only after a natural turn-end -- not error,
			// not cancel, and only when the assistant actually emitted text.
			const signOff = this.maybeSignOff(fullText, cancellation.isCancellationRequested);
			if (signOff) {
				emit(signOff);
				fullText += signOff;
			}
			this.agentManager.completeTask(task.id);
			// H12 — fire-and-forget post-turn compaction check. Doesn't block
			// the return; failures are swallowed inside maybeCompactMemory.
			// Threading the active `conversationId` through scopes the
			// compaction to the current conversation's slice (globals +
			// matching conversation entries) — a turn in conversation A
			// never trims a memory written under conversation B.
			void this.maybeCompactMemory(conversationId);
			return fullText;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
			throw err;
		} finally {
			cancelSubscription.dispose();
		}
	}

	/**
	 * Decide whether to emit a curated sign-off quote at the end of a chat
	 * turn (Phase 78). Returns the formatted footer string, or `undefined`
	 * when the sign-off should be skipped.
	 *
	 * Conditions for firing:
	 * - `sota.personality.enabled` is true
	 * - the turn was not cancelled
	 * - the assistant produced at least some non-whitespace text
	 * - a 25% probability gate passes
	 * - the specialist has a curated quote list (some handles -- e.g.
	 *   `anton-pentest` -- intentionally don't, and fall back to the
	 *   orchestrator's tone-based system instead)
	 */
	protected maybeSignOff(assistantText: string, cancelled: boolean): string | undefined {
		if (cancelled) {
			return undefined;
		}
		if (!assistantText.trim()) {
			return undefined;
		}
		if (!this.configStore || !isPersonalityEnabled(this.configStore)) {
			return undefined;
		}
		if (Math.random() >= SIGN_OFF_PROBABILITY) {
			return undefined;
		}
		const quote = pickSignOffQuote(this.handle);
		if (!quote) {
			return undefined;
		}
		return formatSignOff(quote);
	}

	/**
	 * H12 — fire-and-forget post-turn check that asks the specialist
	 * memory store to consolidate itself when the per-handle list has
	 * grown past `COMPACTION_THRESHOLD`. The actual LLM call (Haiku) is
	 * fast and cheap but still a network round-trip; the caller should
	 * `void` this method so the user-visible turn completes immediately.
	 *
	 * Errors are swallowed by design: compaction is a background tax,
	 * not a hot-path operation, and a compaction failure must never
	 * propagate up into the chat turn that just succeeded.
	 *
	 * The `compactionInProgress` flag prevents two concurrent turns on
	 * the same agent from racing the LLM call + map write. A second
	 * trigger while one is already running is silently dropped — the
	 * next turn will pick it up.
	 */
	protected async maybeCompactMemory(conversationId?: string): Promise<void> {
		if (this.compactionInProgress || !this.specialistMemory) {
			return;
		}
		// Scope the size check to whatever slice the active turn could see.
		// Without a conversationId, this matches the legacy global view.
		// With one, only globals + this conversation's entries are counted —
		// crossing 25 in conversation A doesn't trigger a compaction that
		// touches conversation B's slice.
		const entries = this.specialistMemory.list(this.handle, conversationId);
		if (entries.length < COMPACTION_THRESHOLD) {
			return;
		}
		this.compactionInProgress = true;
		try {
			const result = await this.specialistMemory.compact(this.handle, this.llmClient, conversationId);
			if (result.compacted) {
				const scopeTag = result.scope === 'conversation' ? ` [conv ${conversationId?.slice(0, 8)}…]` : '';
				console.info(`[SpecialistMemory] Compacted @${this.handle}${scopeTag}: ${result.before} → ${result.after}`);
			}
		} catch (err) {
			console.warn(`[SpecialistMemory] Compaction failed for @${this.handle}:`, err);
		} finally {
			this.compactionInProgress = false;
		}
	}

	/**
	 * Single source of truth for "which builtin tools should this agent
	 * expose to the model by default" — used both by the agentic chat-turn
	 * path (`runAgenticTurn`) and by specialist `execute` implementations
	 * that drive the native tool-use loop (e.g. `CodeGeneratorAgent`).
	 *
	 * Defaults to the full builtin set minus `emit_ui_block` (which is
	 * more useful from within an orchestrator-dispatched specialist
	 * subtask than from a direct user-to-specialist conversation).
	 * Subclasses can override to narrow or widen the surface — but the
	 * base default already matches what every current specialist needs.
	 */
	protected getAgenticToolDefinitions(): ReadonlyArray<ToolDefinition> {
		// Lazily imported to avoid pulling tool definitions into modules that
		// don't need them. The const re-export from son-of-anton-core's
		// `tools/registry` is a stable surface.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { BUILTIN_TOOLS } = require('../tools/registry') as typeof import('../tools/registry');
		return BUILTIN_TOOLS
			.filter((t: Tool) => t.definition.name !== 'emit_ui_block')
			.map((t: Tool) => t.definition);
	}

	/**
	 * Agentic chat-turn entry point. Mirrors `runChatTurn` but drives the
	 * native tool-use loop instead of single-shot streaming. The chat
	 * surface (IDE webview, CLI TUI) sees the same `token` stream PLUS
	 * `tool-call` AgentEvents for each tool the model invokes — so direct
	 * `@anton-code "fix this"`-style invocations become genuinely agentic
	 * (read files, edit, run tests) instead of single-shot prose.
	 *
	 * Falls back to `runChatTurn` when no `ToolExecutionContext` has been
	 * wired into this agent, so installations that don't supply one still
	 * get a usable single-shot result.
	 *
	 * Optional per-turn flags (`modelOverride`, `workspaceContextSnapshot`,
	 * `emitFollowupSuggestions`, `conversationId`) are bundled into a single
	 * `ChatTurnOptions` bag — see the matching note on `runChatTurn`.
	 */
	async runAgenticTurn(
		userMessage: string,
		emit: (event: { type: 'token'; token: string } | { type: 'tool-call'; id: string; name: string; input: Record<string, unknown>; status: 'running' | 'done' | 'error'; output?: string }) => void,
		cancellation: CancellationLike,
		options?: ChatTurnOptions,
	): Promise<string> {
		const {
			modelOverride,
			workspaceContextSnapshot,
			emitFollowupSuggestions,
			conversationId,
		} = options ?? {};
		const toolExecutionContext = this.toolExecutionContext;
		if (!toolExecutionContext) {
			// No tool context — fall back to single-shot streaming.
			return this.runChatTurn(
				userMessage,
				token => emit({ type: 'token', token }),
				cancellation,
				{
					modelOverride,
					workspaceContextSnapshot,
					emitFollowupSuggestions,
					conversationId,
				},
			);
		}

		const task = this.agentManager.createTask(this.displayName, truncateForTaskTitle(userMessage));
		this.agentManager.startTask(task.id);

		const controller = new AbortController();
		const cancelSubscription = cancellation.onCancellationRequested(() => controller.abort());

		try {
			const turnModel: ModelId = modelOverride ?? this.defaultModel;
			const systemPromptParts = this.buildSystemPromptParts(this.getRoleDescription(), {
				workspaceContextSnapshot,
				emitFollowupSuggestions,
				conversationId,
			});
			const systemPrompt = systemPromptParts.map(p => p.text).join('\n\n---\n\n');
			const tools = this.getAgenticToolDefinitions();

			let fullText = '';
			const result = await this.runToolLoop({
				taskId: task.id,
				model: turnModel,
				systemPrompt,
				systemPromptParts,
				initialMessages: [{ role: 'user', content: userMessage }],
				tools,
				maxIterations: 10,
				signal: controller.signal,
				includeTodoTools: true,
				onToken: (tok) => {
					fullText += tok;
					emit({ type: 'token', token: tok });
				},
				executeTool: async (call) => {
					emit({ type: 'tool-call', id: call.id, name: call.name, input: call.input, status: 'running' });
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					const { BUILTIN_TOOLS } = require('../tools/registry') as typeof import('../tools/registry');
					const tool = BUILTIN_TOOLS.find(t => t.definition.name === call.name);
					if (!tool) {
						const message = `Unknown tool: ${call.name}`;
						emit({ type: 'tool-call', id: call.id, name: call.name, input: call.input, status: 'error', output: message });
						return { result: message, isError: true };
					}
					try {
						const r = await tool.execute(call.input, toolExecutionContext);
						const status = r.isError ? 'error' : 'done';
						emit({ type: 'tool-call', id: call.id, name: call.name, input: call.input, status, output: r.content });
						return { result: r.content, isError: !!r.isError };
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						emit({ type: 'tool-call', id: call.id, name: call.name, input: call.input, status: 'error', output: message });
						return { result: `Tool '${call.name}' threw: ${message}`, isError: true };
					}
				},
			});

			// Sign-off (Phase 78) — same gate as runChatTurn.
			const signOff = this.maybeSignOff(result.text || fullText, cancellation.isCancellationRequested);
			if (signOff) {
				emit({ type: 'token', token: signOff });
			}
			this.agentManager.completeTask(task.id);
			// H12 — fire-and-forget post-turn compaction check. Doesn't block
			// the return; failures are swallowed inside maybeCompactMemory.
			// Threading the active `conversationId` through scopes the
			// compaction to the current conversation's slice (globals +
			// matching conversation entries) — a turn in conversation A
			// never trims a memory written under conversation B.
			void this.maybeCompactMemory(conversationId);
			return result.text || fullText;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
			throw err;
		} finally {
			cancelSubscription.dispose();
		}
	}

	/**
	 * Handle a VS Code chat request. Default implementation delegates to execute().
	 *
	 * `structuredEmit` is an optional out-of-band channel used by the WebView
	 * surface (via AgentBridge) to receive structured AgentEvents in addition
	 * to the markdown stream. Native chat-participant call sites omit it; the
	 * default implementation here ignores it because non-orchestrator agents
	 * don't currently emit structured plan/subtask events.
	 */
	async handleChatRequest(
		request: ChatRequestLike,
		_chatContext: ChatContextLike,
		stream: ChatStreamLike,
		token: CancellationLike,
		_structuredEmit?: (event: AgentEvent) => void,
	): Promise<void> {
		const task = this.agentManager.createTask(this.displayName, truncateForTaskTitle(request.prompt));
		this.agentManager.startTask(task.id);

		try {
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription(), {
				workspaceContextSnapshot: request.workspaceContextSnapshot,
				emitFollowupSuggestions: request.emitFollowupSuggestions,
				conversationId: request.conversationId,
			});
			// Per-turn model override from the chat composer's picker. Falls
			// back to this specialist's `defaultModel` when no override is
			// supplied, preserving historical Anthropic-by-default behaviour
			// for the native chat-participant + CLI surfaces.
			const turnModel: ModelId = request.modelOverride ?? this.defaultModel;
			const fullText = await this.streamToChat(stream, turnModel, systemPrompt, request.prompt);
			const signOff = this.maybeSignOff(fullText, token.isCancellationRequested);
			if (signOff) {
				stream.markdown(signOff);
			}
			this.agentManager.completeTask(task.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
		}
	}

	/**
	 * Get the role description for this agent's system prompt.
	 */
	protected abstract getRoleDescription(): string;
}

/** Maximum characters retained for the task list / trace UI title. */
const TASK_TITLE_MAX_CHARS = 100;

/**
 * Trim a long prompt for use as a task title. The full prompt is preserved
 * for the LLM call; this helper keeps the trace pane and task list readable
 * when a turn carries the workspace-context block (which can be many KB of
 * markdown). Strips leading/trailing whitespace and collapses runs of
 * whitespace to a single space so multi-line inputs render on one line.
 */
export function truncateForTaskTitle(input: string): string {
	const flat = (input ?? '').replace(/\s+/g, ' ').trim();
	if (flat.length <= TASK_TITLE_MAX_CHARS) {
		return flat;
	}
	return flat.slice(0, TASK_TITLE_MAX_CHARS - 1) + '…';
}
