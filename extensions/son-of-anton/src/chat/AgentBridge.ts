/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentStack } from 'son-of-anton-core/agents/AgentStackFactory';
import { AgentHandle } from 'son-of-anton-core/agents/types';
import type { ModelId } from 'son-of-anton-core/llm/LlmClient';
import { AgentEvent } from './agentEvents';
import { ChatMode } from 'son-of-anton-core/agents/agentEvents';
import { TrustedFolders } from '../security/TrustedFolders';

/**
 * Optional knobs passed to {@link AgentBridge.runOrchestrator}. The Cline-
 * style chat mode is the only one today: in `'plan'` mode the bridge sets
 * `request.command = 'plan'` so the orchestrator's existing plan branch
 * fires (no subtask dispatch); in `'act'` mode (default) the orchestrator
 * follows the normal plan-then-execute path.
 */
export interface RunOrchestratorOptions {
	readonly mode?: ChatMode;
	/**
	 * Active conversation id. Forwarded into `onDidEmitEvent` so non-chat
	 * consumers (e.g. the task board) can scope received events to the
	 * right conversation. Optional — orchestrator runs without a chat
	 * surface (e.g. tests) leave this `undefined`.
	 */
	readonly conversationId?: string;
	/**
	 * Per-turn model override from the chat composer's picker. Forwarded
	 * onto the orchestrator's `ChatRequestLike.model` so the orchestrator's
	 * own LLM call (planning) routes through the user's chosen provider.
	 * Specialists invoked downstream still use their hardcoded
	 * `defaultModel` from `AgentStackFactory.ts` — see
	 * `runOrchestrator`/`OrchestratorAgent.handlePlanCommand`.
	 */
	readonly model?: ModelId;
	/**
	 * Per-turn workspace context snapshot (active editor, open files, git
	 * status, problems, terminal capture). Forwarded onto
	 * `ChatRequestLike.workspaceContextSnapshot` so the orchestrator injects
	 * it as a system-prompt section rather than treating it as user text.
	 */
	readonly workspaceContextSnapshot?: string;
}

/**
 * Event payload published on `AgentBridge.onDidEmitEvent`. Decorates the
 * raw `AgentEvent` with the conversation id the run was associated with so
 * non-chat consumers (the task board) can route events into per-
 * conversation state without inventing their own correlation channel.
 */
export interface BridgeEventEnvelope {
	readonly conversationId: string | undefined;
	readonly event: AgentEvent;
}

/**
 * Bridges the multi-agent stack into a streaming, event-based API the WebView
 * chat consumes. Wraps the long-lived AgentStack — never instantiates agents
 * itself — so chat-participant and webview surfaces share state.
 */
export class AgentBridge {
	private readonly _onDidEmitEvent = new vscode.EventEmitter<BridgeEventEnvelope>();
	/**
	 * Fires for every event the bridge produces, regardless of which surface
	 * (chat panel, sidebar view, command-palette) initiated the run. Wired
	 * for the task board panel — it lets the board observe live plan
	 * progress without sitting in the per-call emit chain.
	 */
	readonly onDidEmitEvent: vscode.Event<BridgeEventEnvelope> = this._onDidEmitEvent.event;

	/**
	 * Folders the user has trusted only for the current window session
	 * ("Trust This Workspace"). Cleared on dispose; not persisted. Kept
	 * separate from {@link TrustedFolders} so that "Trust Forever" and
	 * "Trust This Workspace" remain distinct decisions.
	 */
	private readonly sessionTrustedFolders = new Set<string>();

	constructor(
		private readonly stack: AgentStack,
		private readonly trustedFolders?: TrustedFolders,
	) { }

	dispose(): void {
		this._onDidEmitEvent.dispose();
		this.sessionTrustedFolders.clear();
	}

	/**
	 * One-time gate: before any tool-bearing run, ask the user whether Son of
	 * Anton may operate in the active workspace. Three-way prompt:
	 *
	 *  - **Trust This Workspace** — session-scoped grant, not persisted.
	 *  - **Trust Forever** — persists via {@link TrustedFolders.grant}.
	 *  - **Cancel** — declines; the caller surfaces an `error` event.
	 *
	 * Pre-conditions short-circuit the prompt:
	 *
	 *  - VS Code's platform trust must be granted first; if it is not, we
	 *    refuse outright (the user must clear that gate via the platform UI).
	 *  - If `trustedFolders` was not supplied (legacy callers / tests), the
	 *    gate is bypassed — the bridge stays compatible with surfaces that
	 *    don't know about the per-workspace consent yet.
	 *  - With no workspace folder open, agents can chat but cannot reach a
	 *    file system; we permit the run and let downstream tool calls fail
	 *    on their own merits ("chat-only mode").
	 *  - Once granted (session or persisted), subsequent calls in the same
	 *    window are no-ops.
	 */
	async ensureWorkspaceTrust(): Promise<boolean> {
		if (!this.trustedFolders) {
			return true;
		}

		// Platform-level trust ALWAYS wins. We never override a "restricted
		// mode" workspace.
		if (!vscode.workspace.isTrusted) {
			return false;
		}

		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			// No workspace folder — chat-only mode. Tools that target the
			// workspace will fail when invoked, but plain chat is harmless.
			return true;
		}

		const folderPath = folder.uri.fsPath;
		if (this.sessionTrustedFolders.has(folderPath) || this.trustedFolders.isTrusted(folderPath)) {
			return true;
		}

		const choice = await vscode.window.showWarningMessage(
			`Trust Son of Anton in '${folder.name}'?\n\nSon of Anton agents can read your files, run shell commands, and modify code. Grant trust only if you trust this workspace.`,
			{ modal: true },
			'Trust This Workspace',
			'Trust Forever',
			'Cancel',
		);

		if (choice === 'Trust This Workspace') {
			this.sessionTrustedFolders.add(folderPath);
			return true;
		}
		if (choice === 'Trust Forever') {
			this.trustedFolders.grant(folderPath);
			return true;
		}
		return false;
	}

	/**
	 * True if the supplied specialist id maps to an agent we can drive end-to-end.
	 * Used by the chat surface to decide between the agent path and the legacy
	 * direct-LLM fallback (e.g. for specialists not yet promoted into the stack).
	 */
	hasAgent(specialistId: string): boolean {
		if (specialistId === 'anton') {
			return true;
		}
		return this.stack.specialists.has(specialistId as AgentHandle);
	}

	/**
	 * Run the orchestrator end-to-end for `userMessage`. Streams orchestrator
	 * progress as `token` events (the markdown shim) and structured
	 * plan/subtask events through the dedicated `structuredEmit` channel.
	 * Concludes with a `final` event carrying the accumulated text.
	 */
	async runOrchestrator(
		userMessage: string,
		emit: (event: AgentEvent) => void,
		cancellation: vscode.CancellationToken,
		opts?: RunOrchestratorOptions,
	): Promise<void> {
		const conversationId = opts?.conversationId;
		const tappedEmit = (event: AgentEvent): void => {
			emit(event);
			this._onDidEmitEvent.fire({ conversationId, event });
		};
		if (!await this.ensureWorkspaceTrust()) {
			tappedEmit({ type: 'error', message: 'Trust required to run agents in this workspace.' });
			return;
		}
		const stream = createShimResponseStream(tappedEmit);
		// Plan mode pins the orchestrator into its existing `'plan'` slash
		// command branch — handlePlanCommand drafts and presents a plan but
		// never dispatches subtasks. Act mode (default) leaves the command
		// undefined so the orchestrator falls into its normal
		// "plan-then-await-/approve" flow.
		const command = opts?.mode === 'plan' ? 'plan' : undefined;
		const request = createShimChatRequest(
			userMessage,
			command,
			opts?.model,
			opts?.workspaceContextSnapshot,
			opts?.conversationId,
			true, // emit follow-up suggestions for IDE — the webview strips the sentinel
		);
		const chatContext = createShimChatContext();

		try {
			await this.stack.orchestrator.handleChatRequest(
				request,
				chatContext,
				stream,
				cancellation,
				tappedEmit,
			);
			tappedEmit({ type: 'final', text: stream.getBuffer() });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			tappedEmit({ type: 'error', message });
		}
	}

	/**
	 * Drive a one-off `/approve` cycle against the orchestrator's most
	 * recently-proposed plan, without going through `runOrchestrator`. Used
	 * by the task board's "drag from Ready -> In Progress" affordance — the
	 * board is just a UI layer over the existing approval flow, but
	 * dispatching from the board shouldn't replay the user's natural-
	 * language prompt. Emits the same event stream as a normal approve.
	 */
	async approveActivePlan(
		conversationId: string | undefined,
		emit: (event: AgentEvent) => void,
		cancellation: vscode.CancellationToken,
	): Promise<void> {
		const tappedEmit = (event: AgentEvent): void => {
			emit(event);
			this._onDidEmitEvent.fire({ conversationId, event });
		};
		if (!await this.ensureWorkspaceTrust()) {
			tappedEmit({ type: 'error', message: 'Trust required to run agents in this workspace.' });
			return;
		}
		const stream = createShimResponseStream(tappedEmit);
		const request = createShimChatRequest('', 'approve');
		const chatContext = createShimChatContext();
		try {
			await this.stack.orchestrator.handleChatRequest(
				request,
				chatContext,
				stream,
				cancellation,
				tappedEmit,
			);
			tappedEmit({ type: 'final', text: stream.getBuffer() });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			tappedEmit({ type: 'error', message });
		}
	}

	/**
	 * Read-only access to the orchestrator's current plan (if any). Lets the
	 * task board panel re-hydrate when it opens against a conversation that
	 * already has a live plan, without waiting for a fresh `plan-proposed`
	 * to fire.
	 */
	getActivePlan() {
		return this.stack.orchestrator.getActivePlan();
	}

	/**
	 * Drive a single specialist agent against `userMessage`. Streams the
	 * specialist's LLM output as `token` events and finishes with `final`.
	 * Throws if the supplied handle has no registered agent.
	 */
	async runSpecialist(
		handle: AgentHandle,
		userMessage: string,
		emit: (event: AgentEvent) => void,
		cancellation: vscode.CancellationToken,
		model?: ModelId,
		workspaceContextSnapshot?: string,
		conversationId?: string,
	): Promise<void> {
		const agent = this.stack.specialists.get(handle);
		if (!agent) {
			throw new Error(`No agent registered for specialist "${handle}"`);
		}

		if (!await this.ensureWorkspaceTrust()) {
			emit({ type: 'error', message: 'Trust required to run agents in this workspace.' });
			return;
		}

		try {
			// `emitFollowupSuggestions = true` opts the IDE chat into receiving
			// the H4 sentinel block; the chat-webview strips it before render
			// and surfaces the suggestions as quick-pick buttons.
			const text = await agent.runChatTurn(
				userMessage,
				token => emit({ type: 'token', token }),
				cancellation,
				model,
				workspaceContextSnapshot,
				true,
				conversationId,
			);
			emit({ type: 'final', text });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			emit({ type: 'error', message });
		}
	}
}

/**
 * Minimal in-memory shim for `vscode.ChatResponseStream`. The orchestrator
 * was authored against the chat-participant API and calls `markdown` /
 * `progress` heavily; we route each call into a `token` event so the
 * webview gets the same prose live.
 *
 * The cast to `vscode.ChatResponseStream` is unavoidable: the real interface
 * exposes a wide surface (anchor, button, filetree, push, etc.) that the
 * orchestrator does not currently exercise. We provide enough for current
 * usage; new method calls would surface as runtime TypeError, which is
 * acceptable because compilation is the unit test for "have we covered
 * the surface" today.
 */
interface ShimResponseStream extends vscode.ChatResponseStream {
	getBuffer(): string;
}

function createShimResponseStream(emit: (event: AgentEvent) => void): ShimResponseStream {
	let buffer = '';
	const emitToken = (text: string): void => {
		if (!text) {
			return;
		}
		buffer += text;
		emit({ type: 'token', token: text });
	};

	const stream = {
		markdown(value: string | vscode.MarkdownString): void {
			const text = typeof value === 'string' ? value : value.value;
			emitToken(text);
		},
		anchor(_uri: vscode.Uri | vscode.Location, title?: string): void {
			if (title) {
				emitToken(title);
			}
		},
		button(_command: vscode.Command): void {
			// No-op: command buttons aren't wired through to the webview yet.
		},
		filetree(_value: vscode.ChatResponseFileTree[], _baseUri: vscode.Uri): void {
			// No-op for now — file trees can be surfaced via a follow-up event.
		},
		progress(value: string): void {
			emitToken(value);
		},
		reference(_value: vscode.Uri | vscode.Location): void {
			// No-op: references would attach to the message in the native chat
			// view but the webview tracks attachments separately.
		},
		push(_part: vscode.ChatResponsePart): void {
			// No-op: structured parts aren't surfaced through the webview.
		},
		getBuffer(): string {
			return buffer;
		},
	};

	// Cast widens the shim to the full vscode.ChatResponseStream interface.
	// WHY: ChatResponseStream's full surface is large and partially proposed-API;
	// providing every method would couple us to upstream churn for no benefit
	// while the orchestrator only exercises markdown/progress today.
	return stream as unknown as ShimResponseStream;
}

/**
 * Build the smallest `vscode.ChatRequest` shape the orchestrator reads.
 * The orchestrator consults `prompt`, `command`, and the optional
 * `modelOverride` (the user-picked Son of Anton {@link ModelId} forwarded
 * from the chat composer's picker via {@link RunOrchestratorOptions}).
 * `references` and `toolReferences` are placeholders.
 *
 * `modelOverride` is a Son-of-Anton-specific field that does NOT exist on
 * `vscode.ChatRequest`. We set it here for the orchestrator's
 * `ChatRequestLike` reader; the cast at the end of this function widens
 * the shim to the full `vscode.ChatRequest` interface for callers that
 * accept that type. The native VS Code `model` field is left undefined
 * because the agent stack does not consume `vscode.LanguageModelChat`.
 */
function createShimChatRequest(
	userMessage: string,
	command?: string,
	model?: ModelId,
	workspaceContextSnapshot?: string,
	conversationId?: string,
	emitFollowupSuggestions?: boolean,
): vscode.ChatRequest {
	const request = {
		prompt: userMessage,
		command,
		references: [] as readonly vscode.ChatPromptReference[],
		toolReferences: [] as readonly vscode.ChatLanguageModelToolReference[],
		toolInvocationToken: undefined,
		// `model` stays undefined to match `vscode.ChatRequest`'s native
		// shape; `modelOverride` is the Son of Anton picker value the
		// agents actually consume via `ChatRequestLike`.
		model: undefined,
		modelOverride: model,
		workspaceContextSnapshot,
		// H6 — scopes specialist memory to this conversation so memory
		// from one chat doesn't leak into another for the same handle.
		conversationId,
		// H4 — opts the agent into emitting a `<<sota:suggestions>>` block
		// that the chat surface strips before render and renders as a row
		// of quick-pick suggestion buttons.
		emitFollowupSuggestions,
	};
	return request as unknown as vscode.ChatRequest;
}

function createShimChatContext(): vscode.ChatContext {
	const context = {
		history: [] as readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[],
	};
	return context as unknown as vscode.ChatContext;
}
