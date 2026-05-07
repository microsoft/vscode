/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LlmClient, LlmMessage, ModelId, ToolDefinition as LlmToolDefinition } from '../llm/LlmClient';
import { ToolRegistry, createWorkspaceToolContext } from '../tools/registry';
import { SPECIALIST_ROLES, getSpecialist, buildSystemPrompt } from './specialistRegistry';
import { AgentBridge } from './AgentBridge';
import { AgentEvent, AgentPlan } from './agentEvents';
import { AgentHandle } from '../agents/types';
import { parseAndDispatch, SlashCommandContext } from './ChatSlashCommands';
import { WorkspaceContextProvider } from './WorkspaceContextProvider';

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	model?: ModelId;
	timestamp: number;
}

interface WebviewMessage {
	type: string;
	text?: string;
	model?: ModelId;
	attachments?: string[];
	diffId?: string;
	specialistId?: string;
	command?: string;
	arg?: string;
	code?: string;
	language?: string;
	relPath?: string;
	diff?: string;
}

const CONVERSATION_STORAGE_KEY = 'sota.chatHistory';
const ACTIVE_SESSIONS = new Set<ChatSession>();

/**
 * Core chat session bound to a `vscode.Webview`. Hosted either by a
 * `WebviewPanel` (`ChatPanel.createOrShow`) or a `WebviewView`
 * (`ChatViewProvider`). The two host types share this implementation so the
 * chat experience stays consistent regardless of placement.
 */
export class ChatSession {
	private conversation: ChatMessage[] = [];
	private abortController: AbortController | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private disposed = false;
	private currentSpecialistId: string = 'anton';
	// Tracked at the session level so `/model` can mutate it from the slash
	// command pipeline. The webview is the authoritative source for normal
	// per-message picks via the model chip; we sync this field whenever a
	// message arrives so the two stay aligned.
	private currentModel: ModelId = 'sonnet';

	constructor(
		private readonly webview: vscode.Webview,
		private readonly extensionUri: vscode.Uri,
		private readonly memento: vscode.Memento,
		private readonly llmClient: LlmClient,
		private readonly toolRegistry: ToolRegistry,
		private readonly agentBridge?: AgentBridge,
		private readonly workspaceContext?: WorkspaceContextProvider,
	) {
		this.loadConversation();
		this.webview.html = this.getHtmlContent();
		this.setupMessageHandler();

		// React to setting changes that affect available auth so the empty
		// state CTA disappears the moment a user pastes an API key in
		// Settings (instead of waiting for the 30s heartbeat).
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration('sota.apiKey') ||
					e.affectsConfiguration('sota.openaiApiKey') ||
					e.affectsConfiguration('sotaAuth.anthropic-oauth.clientId') ||
					e.affectsConfiguration('sotaAuth.chatgpt-oauth.clientId')
				) {
					void this.refreshConnectionState();
				}
			}),
		);

		if (this.conversation.length > 0) {
			this.webview.postMessage({
				type: 'loadConversation',
				messages: this.conversation,
			});
		}

		ACTIVE_SESSIONS.add(this);

		// Kick off an initial connection-state refresh and a 30s poll.
		void this.refreshConnectionState();
		const intervalHandle = setInterval(() => {
			void this.refreshConnectionState();
		}, 30000);
		this.disposables.push(new vscode.Disposable(() => clearInterval(intervalHandle)));
	}

	dispose(): void {
		this.disposed = true;
		ACTIVE_SESSIONS.delete(this);
		this.abortController?.abort();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}

	/**
	 * Query the auth broker (via a registered command) and forward the result
	 * to the webview so the header indicator can render. Defensive: if the
	 * command isn't registered or throws, we silently leave the indicator
	 * hidden rather than surfacing errors to the user.
	 */
	private async refreshConnectionState(): Promise<void> {
		if (this.disposed) {
			return;
		}
		// Detect API-key fallbacks alongside the OAuth broker query so the
		// webview can decide whether to show the auth gate. We tolerate failures
		// from each source independently — a missing config or a thrown command
		// must not prevent the rest of the status from being reported.
		const apiKeySetting = vscode.workspace.getConfiguration('sota').get<string>('apiKey');
		const openaiApiKeySetting = vscode.workspace.getConfiguration('sota').get<string>('openaiApiKey');
		const anthropicEnv = process.env.ANTHROPIC_API_KEY;
		const openaiEnv = process.env.OPENAI_API_KEY;
		const apiKeys = {
			anthropic: Boolean((apiKeySetting && apiKeySetting.trim()) || (anthropicEnv && anthropicEnv.trim())),
			openai: Boolean((openaiApiKeySetting && openaiApiKeySetting.trim()) || (openaiEnv && openaiEnv.trim())),
		};

		let providers: Array<{ id: string; displayName: string; connected: boolean }> = [];
		try {
			const result = await vscode.commands.executeCommand<{ providers?: Array<{ id: string; displayName: string; connected: boolean }> }>('sotaAuth.status');
			if (this.disposed) {
				return;
			}
			providers = result && Array.isArray(result.providers) ? result.providers : [];
		} catch {
			// Command not registered or threw — fall through with empty providers.
		}

		if (this.disposed) {
			return;
		}
		this.webview.postMessage({
			type: 'connectionState',
			status: { providers, apiKeys },
		});
	}

	clearConversation(): void {
		this.conversation = [];
		this.memento.update(CONVERSATION_STORAGE_KEY, []);
		this.webview.postMessage({ type: 'conversationCleared' });
	}

	/**
	 * Build the dependency surface the slash-command dispatcher needs. Closures
	 * over the session so command handlers can mutate state (specialist, model)
	 * and trigger side effects (clear, status) without leaking implementation
	 * details into the pure parsing module.
	 */
	private buildSlashCommandContext(): SlashCommandContext {
		return {
			getSpecialistId: () => this.currentSpecialistId,
			setSpecialistId: (id: string) => {
				this.currentSpecialistId = id;
				// Reflect the change in the toolbar chip immediately so the
				// next user message inherits the new selection without
				// requiring the user to also click the chip.
				this.webview.postMessage({ type: 'specialistChange', specialistId: id });
			},
			getModel: () => this.currentModel,
			setModel: (id: ModelId) => {
				this.currentModel = id;
				this.webview.postMessage({ type: 'modelChange', model: id });
			},
			clearConversation: async () => {
				this.clearConversation();
			},
			getProviderStatus: async () => {
				try {
					const result = await vscode.commands.executeCommand<{ providers?: Array<{ id: string; displayName: string; connected: boolean }> }>('sotaAuth.status');
					const providers = result && Array.isArray(result.providers) ? result.providers : [];
					return providers.map(p => ({ name: p.displayName || p.id, connected: Boolean(p.connected) }));
				} catch {
					return [];
				}
			},
		};
	}

	/**
	 * Post a "system" message (slash-command output) to the webview AND
	 * persist it under the new `'system'` role so a session reload restores
	 * the same scrollback. Visually distinct from assistant messages — the
	 * webview applies the `.msg-system` class for styling.
	 */
	private postSystemMessage(markdown: string): void {
		const entry: ChatMessage = {
			role: 'system',
			content: markdown,
			timestamp: Date.now(),
		};
		this.conversation.push(entry);
		this.saveConversation();
		this.webview.postMessage({ type: 'systemMessage', content: markdown });
	}

	private loadConversation(): void {
		const saved = this.memento.get<ChatMessage[]>(CONVERSATION_STORAGE_KEY);
		if (saved) {
			this.conversation = saved;
		}
	}

	private saveConversation(): void {
		this.memento.update(CONVERSATION_STORAGE_KEY, this.conversation);
	}

	private setupMessageHandler(): void {
		this.webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case 'sendMessage':
						// Refresh connection state opportunistically so the user
						// sees fresh auth status if they just signed in via a popup.
						void this.refreshConnectionState();
						await this.handleSendMessage(message);
						break;
					case 'cancelRequest':
						this.abortController?.abort();
						break;
					case 'clearConversation':
						this.clearConversation();
						break;
					case 'acceptDiff':
						await this.handleAcceptDiff(message.diffId);
						break;
					case 'rejectDiff':
						// No action needed — diff is simply dismissed
						break;
					case 'copyCode':
						if (message.text) {
							await vscode.env.clipboard.writeText(message.text);
						}
						break;
					case 'runCommand':
						if (typeof message.command === 'string') {
							if (typeof message.arg === 'string') {
								await vscode.commands.executeCommand(message.command, message.arg);
							} else {
								await vscode.commands.executeCommand(message.command);
							}
							// Trigger an immediate refresh after command completes so the
							// empty-state CTA disappears as soon as the user signs in.
							void this.refreshConnectionState();
						}
						break;
					case 'openCodeInEditor': {
						if (typeof message.code !== 'string') {
							break;
						}
						// Defensive: a malformed language tag from the fenced code
						// block (too long or non [a-z0-9-] chars) would cause VS Code
						// to fall back to plaintext anyway, so we normalise it up
						// front to avoid surprising users with cryptic errors.
						const rawLanguage = typeof message.language === 'string' ? message.language : '';
						const language = rawLanguage && rawLanguage.length <= 32 && /^[A-Za-z0-9_-]+$/.test(rawLanguage)
							? rawLanguage
							: 'plaintext';
						const doc = await vscode.workspace.openTextDocument({ content: message.code, language });
						await vscode.window.showTextDocument(doc, { preview: false });
						break;
					}
					case 'saveCodeToFile': {
						await this.handleSaveCodeToFile(message);
						break;
					}
					case 'previewDiff': {
						if (typeof message.diff !== 'string' || !message.diff) {
							break;
						}
						await this.handlePreviewDiff(message.diff);
						break;
					}
				}
			},
			null,
			this.disposables,
		);
	}

	private async handleSendMessage(message: WebviewMessage): Promise<void> {
		// Allow attachment-only messages: when the user types nothing but has
		// attached context (e.g. just the current file), we still want to send.
		if (!message.text && (!message.attachments || message.attachments.length === 0)) {
			return;
		}

		const model: ModelId = message.model ?? this.currentModel;
		this.currentModel = model;
		// Resolve the specialist for this turn, falling back to the orchestrator
		// if the webview sent an unknown id (e.g. specialist was removed).
		const requestedSpecialistId = message.specialistId ?? this.currentSpecialistId;
		const specialistId = getSpecialist(requestedSpecialistId) ? requestedSpecialistId : 'anton';
		this.currentSpecialistId = specialistId;

		// Slash-command interception: when the user's message starts with `/`,
		// parse it locally first. Recognised commands are handled in-process
		// (no LLM call); unrecognised slashy text falls through so users can
		// still ask questions like "/loop never resolves on this branch".
		const rawText = message.text ?? '';
		if (rawText.trimStart().startsWith('/')) {
			const result = await parseAndDispatch(rawText, this.buildSlashCommandContext());
			if (result.handled) {
				if (result.output) {
					this.postSystemMessage(result.output);
				}
				return;
			}
			// Unknown command — fall through to normal dispatch.
		}

		const baseSystemPrompt = buildSystemPrompt(specialistId);

		// Workspace context is collected lazily per-turn so the markdown
		// reflects the user's CURRENT editor/selection at send time. Slash
		// commands short-circuit before this point, so they never pay this
		// cost. The cost itself is dominated by a single README read; the
		// rest is in-memory state.
		const workspaceCtx = this.workspaceContext
			? await this.workspaceContext.collect()
			: { markdown: '', estimatedTokens: 0 };
		const systemPrompt = workspaceCtx.markdown
			? `${baseSystemPrompt}\n\n---\n\n${workspaceCtx.markdown}`
			: baseSystemPrompt;

		// The LLM receives the full prompt — typed text plus any resolved
		// attachment bodies. The persisted scrollback only keeps a short
		// summary so reloading a session doesn't repeatedly pay for stale
		// attachment payloads.
		const fullPrompt = this.buildUserPrompt(message.text ?? '', message.attachments);
		const visibleSummary = (message.text && message.text.trim())
			? message.text
			: `_Attached: ${message.attachments?.join(', ') ?? 'context'}_`;

		const userMessage: ChatMessage = {
			role: 'user',
			content: visibleSummary,
			model,
			timestamp: Date.now(),
		};
		this.conversation.push(userMessage);
		this.saveConversation();

		this.abortController = new AbortController();

		// Agent stack route: if the active specialist maps to a registered agent,
		// drive the agent backend instead of the direct-LLM path. The legacy path
		// remains as a fallback for specialists that aren't in the agent stack
		// yet (e.g. anton-spec) and for sessions where no bridge was supplied.
		if (this.agentBridge && this.agentBridge.hasAgent(specialistId)) {
			// Agents build their own system prompts inside the stack, so we have
			// no clean lever to inject context system-side here. Prepending the
			// markdown to the user prompt keeps the agent path on equal footing
			// with the direct LLM path. The persisted scrollback still records
			// only `visibleSummary`, so the user's typed text stays clean.
			const agentPrompt = workspaceCtx.markdown
				? `${workspaceCtx.markdown}\n\n---\n\n${fullPrompt}`
				: fullPrompt;
			await this.runViaAgentBridge(specialistId, agentPrompt, model);
			return;
		}

		// Tool-call orchestration: loop until the model stops asking for tools or
		// we hit the cap. The tools-module ToolDefinition shape is structurally
		// compatible with LlmClient's local ToolDefinition (the latter is a
		// looser superset), so a runtime-safe cast is used at the boundary.
		const tools = this.toolRegistry.definitions() as unknown as ReadonlyArray<LlmToolDefinition>;
		// Single execution context per send — tool calls reuse the same handles.
		const ctx = createWorkspaceToolContext();
		const MAX_TOOL_TURNS = 5;

		// Build the initial LLM message list. The latest user turn carries the
		// full prompt (including attachment bodies) so the model sees the actual
		// content rather than just the label kept in the persisted scrollback.
		// `system`-role entries are local UI artefacts (slash-command output)
		// and must NOT be sent to the LLM, so we filter them out here.
		const lastUserIndex = this.conversation.length - 1;
		let llmMessages: LlmMessage[] = this.conversation.flatMap((m, i) => {
			if (m.role !== 'user' && m.role !== 'assistant') {
				return [];
			}
			return [{
				role: m.role,
				content: i === lastUserIndex && m.role === 'user' ? fullPrompt : m.content,
			}];
		});

		// Anthropic's content-block tool_result form is the canonical way to
		// round-trip results, but our LlmMessage.content is plain text. Rather
		// than refactor the whole message shape, we serialise tool results into
		// a single synthetic user message. The model loses the structured
		// tool_use_id correlation but still receives the data — a pragmatic
		// shortcut for non-content-block-aware clients. Tracked for future
		// upgrade once LlmMessage gains content-block support.
		// `assistantBuffer` is what we feed BACK to the model as the assistant's
		// last turn (per-loop reset). `fullAssistantText` is what we persist —
		// the user-visible accumulation across all loop turns, including
		// structured tool-call summaries so reloading shows what happened.
		let assistantBuffer = '';
		let fullAssistantText = '';
		let aborted = false;
		let turn = 0;

		try {
			while (turn < MAX_TOOL_TURNS) {
				turn++;
				const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
				let stopReason: string | undefined;

				try {
					for await (const event of this.llmClient.streamRequest({
						model,
						messages: llmMessages,
						systemPrompt,
						signal: this.abortController.signal,
						tools,
					})) {
						if (event.type === 'token') {
							assistantBuffer += event.token;
							fullAssistantText += event.token;
							this.webview.postMessage({ type: 'streamToken', token: event.token });
						} else if (event.type === 'tool-call') {
							pendingToolCalls.push({ id: event.id, name: event.name, input: event.input });
							// Render a structured tool-call card in the webview
							// instead of the previous italic markdown marker. The
							// host doesn't append anything to the visible token
							// stream — the card lives outside the markdown body.
							this.webview.postMessage({
								type: 'toolCall',
								id: event.id,
								name: event.name,
								status: 'running',
								input: event.input,
							});
						} else if (event.type === 'complete') {
							stopReason = event.stopReason;
							const willLoop = stopReason === 'tool_use' && pendingToolCalls.length > 0 && turn < MAX_TOOL_TURNS;
							// Only emit messageComplete on the FINAL turn so the
							// webview doesn't flip out of streaming state mid-loop.
							if (!willLoop) {
								const usage = this.llmClient.getTokenUsage();
								const cost = this.llmClient.estimateCost();
								this.webview.postMessage({
									type: 'messageComplete',
									inputTokens: event.inputTokens,
									outputTokens: event.outputTokens,
									totalTokens: usage.input + usage.output,
									estimatedCost: cost.toFixed(4),
								});
							}
						} else if (event.type === 'error') {
							this.webview.postMessage({ type: 'streamError', error: event.error });
							stopReason = 'error';
						}
					}
				} catch (err) {
					// Treat AbortError-shaped exceptions as a clean cancel; bail
					// out of the loop without surfacing a misleading error to UI.
					const isAbort = this.abortController?.signal.aborted
						|| (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message)));
					if (isAbort) {
						aborted = true;
						break;
					}
					throw err;
				}

				if (aborted) {
					break;
				}

				if (stopReason !== 'tool_use' || pendingToolCalls.length === 0) {
					break; // model is done
				}

				if (turn >= MAX_TOOL_TURNS) {
					this.webview.postMessage({
						type: 'streamError',
						error: `Tool call loop exceeded ${MAX_TOOL_TURNS} turns. Aborting.`,
					});
					break;
				}

				// Execute pending tool calls and assemble a synthetic user
				// follow-up. The execution context is shared across calls in the
				// same send (per Phase 19 spec) so we don't pay per-call setup.
				const resultLines: string[] = ['[Tool results]'];
				for (const call of pendingToolCalls) {
					const result = await this.toolRegistry.execute(call.name, call.input, ctx);
					const inputJson = JSON.stringify(call.input);
					const status = result.isError ? 'error' : 'ok';
					resultLines.push(`${call.name}(${inputJson}) → ${status}`);
					resultLines.push('```');
					resultLines.push(result.content);
					resultLines.push('```');

					// Update the existing card by id with the final state so
					// the webview can flip the spinner glyph and reveal the
					// collapsible output. The webview is defensive about
					// missing prior cards (e.g. session reload mid-run).
					this.webview.postMessage({
						type: 'toolCall',
						id: call.id,
						name: call.name,
						status: result.isError ? 'error' : 'ok',
						input: call.input,
						output: result.content,
					});

					// Persist a base64-encoded payload inside a unique sentinel so
					// reloading shows what tools were called and what they returned.
					// The sentinel survives any tool-output content (including
					// triple backticks or HTML comments that would break a fence).
					const headerLine = `${call.name}(${inputJson}) → ${status}`;
					const body = `${headerLine}\n${result.content}`;
					const encoded = Buffer.from(body, 'utf-8').toString('base64');
					fullAssistantText += `\n\n<<<sota:tool data="${encoded}">>>\n\n`;
				}
				const followUp = resultLines.join('\n');

				// Append the assistant turn so far and a synthetic user message
				// carrying the tool results. Don't push these into
				// `this.conversation` — they're transient inputs for the model,
				// not user-typed messages worth persisting.
				llmMessages = [
					...llmMessages,
					{ role: 'assistant', content: assistantBuffer },
					{ role: 'user', content: followUp },
				];
				assistantBuffer = '';
			}
		} finally {
			this.abortController = undefined;
		}

		// Persist the visible assistant output (concatenation of token streams
		// AND structured tool-call summaries) so reloading the session shows a
		// readable trace of what happened — instead of the old `<see chat
		// history>` placeholder.
		if (fullAssistantText) {
			this.conversation.push({
				role: 'assistant',
				content: fullAssistantText,
				model,
				timestamp: Date.now(),
			});
			this.saveConversation();
		}
	}

	/**
	 * Drive the active specialist (or orchestrator) through the agent stack.
	 * Translates AgentEvents into webview messages, persists the assembled
	 * assistant text, and fans cancellation/abort through to the bridge.
	 */
	private async runViaAgentBridge(specialistId: string, fullPrompt: string, model: ModelId): Promise<void> {
		if (!this.agentBridge) {
			return;
		}
		const cancellationSource = new vscode.CancellationTokenSource();
		// Bridge AbortController -> CancellationToken so the existing Cancel
		// button (which aborts the controller) still cancels in-flight LLM work.
		this.abortController?.signal.addEventListener('abort', () => {
			cancellationSource.cancel();
		});

		let assembled = '';
		let finalText: string | undefined;
		let errorText: string | undefined;
		const emit = (event: AgentEvent): void => {
			this.handleAgentEvent(event);
			if (event.type === 'token') {
				assembled += event.token;
			} else if (event.type === 'subtask-token') {
				assembled += event.token;
			} else if (event.type === 'final') {
				finalText = event.text;
			} else if (event.type === 'error') {
				errorText = event.message;
			}
		};

		try {
			if (specialistId === 'anton') {
				await this.agentBridge.runOrchestrator(fullPrompt, emit, cancellationSource.token);
			} else {
				await this.agentBridge.runSpecialist(specialistId as AgentHandle, fullPrompt, emit, cancellationSource.token);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.webview.postMessage({ type: 'streamError', error: message });
		} finally {
			cancellationSource.dispose();
			this.abortController = undefined;
		}

		if (errorText) {
			this.webview.postMessage({ type: 'streamError', error: errorText });
			return;
		}

		// Token usage telemetry is currently captured per-LLM-call inside the
		// agent stack; we publish the cumulative LlmClient counters here so the
		// status bar at the bottom of the chat reflects the full session.
		const usage = this.llmClient.getTokenUsage();
		const cost = this.llmClient.estimateCost();
		this.webview.postMessage({
			type: 'messageComplete',
			inputTokens: usage.input,
			outputTokens: usage.output,
			totalTokens: usage.input + usage.output,
			estimatedCost: cost.toFixed(4),
		});

		const persisted = (finalText && finalText.length > 0) ? finalText : assembled;
		if (persisted) {
			this.conversation.push({
				role: 'assistant',
				content: persisted,
				model,
				timestamp: Date.now(),
			});
			this.saveConversation();
		}
	}

	/**
	 * Translate an AgentEvent into the webview-side messages the chat UI
	 * already understands (for `token`) plus new structured cards for the
	 * orchestrator's plan/subtask events.
	 */
	private handleAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case 'token':
				this.webview.postMessage({ type: 'streamToken', token: event.token });
				break;
			case 'plan-proposed':
				this.webview.postMessage({ type: 'agentPlan', plan: serialisePlan(event.plan) });
				break;
			case 'subtask-started':
				this.webview.postMessage({
					type: 'subtaskStart',
					subtaskId: event.subtaskId,
					assignee: event.assignee,
					instruction: event.instruction,
				});
				break;
			case 'subtask-token':
				this.webview.postMessage({
					type: 'subtaskToken',
					subtaskId: event.subtaskId,
					token: event.token,
				});
				break;
			case 'subtask-completed':
				this.webview.postMessage({
					type: 'subtaskComplete',
					subtaskId: event.subtaskId,
					assignee: event.assignee,
					summary: event.summary,
				});
				break;
			case 'subtask-failed':
				this.webview.postMessage({
					type: 'subtaskFail',
					subtaskId: event.subtaskId,
					assignee: event.assignee,
					error: event.error,
				});
				break;
			case 'final':
			case 'error':
				// Handled by the runViaAgentBridge caller (which has access to the
				// finalisation/error-emission machinery so it can also dispatch
				// messageComplete or streamError consistently).
				break;
		}
	}

	private buildUserPrompt(text: string, attachments?: string[]): string {
		if (!attachments || attachments.length === 0) {
			return text;
		}
		const sections: string[] = [];
		const trimmed = text.trim();
		if (trimmed) {
			sections.push(trimmed);
		}
		for (const id of attachments) {
			const block = this.resolveAttachment(id);
			if (block) {
				sections.push(block);
			}
		}
		return sections.join('\n\n');
	}

	/**
	 * Translate an attachment id from the composer chip into a markdown block
	 * containing the actual content (file body, selection, etc.). Returns
	 * `undefined` for unknown ids so callers can skip them silently.
	 */
	private resolveAttachment(id: string): string | undefined {
		const editor = vscode.window.activeTextEditor;
		switch (id) {
			case 'current-file': {
				if (!editor) {
					return '_(no active file to attach)_';
				}
				const filename = vscode.workspace.asRelativePath(editor.document.uri);
				const language = editor.document.languageId || '';
				const content = editor.document.getText();
				// Truncate very large files to ~20k chars to avoid blowing the
				// context window. Selections are sent verbatim (see below).
				const MAX = 20_000;
				const truncated = content.length > MAX
					? content.slice(0, MAX) + `\n\n…(${content.length - MAX} more characters truncated)`
					: content;
				return `**Attached file:** \`${filename}\`\n\n\`\`\`${language}\n${truncated}\n\`\`\``;
			}
			case 'current-selection': {
				if (!editor) {
					return '_(no active editor for selection)_';
				}
				if (editor.selection.isEmpty) {
					return '_(no text selected)_';
				}
				const filename = vscode.workspace.asRelativePath(editor.document.uri);
				const language = editor.document.languageId || '';
				const startLine = editor.selection.start.line + 1;
				const endLine = editor.selection.end.line + 1;
				const content = editor.document.getText(editor.selection);
				return `**Attached selection** (\`${filename}\` lines ${startLine}-${endLine}):\n\n\`\`\`${language}\n${content}\n\`\`\``;
			}
			case 'terminal-output': {
				// VS Code's stable API doesn't expose terminal scrollback to
				// extensions, so we surface a graceful hint rather than a
				// silent no-op. The user can paste the relevant lines manually.
				return '_(Terminal output capture is not yet supported. Please paste any relevant terminal output into the message manually.)_';
			}
			default:
				return undefined;
		}
	}

	private async handleAcceptDiff(diffId?: string): Promise<void> {
		if (!diffId) {
			return;
		}
		// Diff application will be implemented when MCP integration is ready.
		// For now, show a notification.
		vscode.window.showInformationMessage('Diff accepted. Apply logic pending MCP integration.');
	}

	/**
	 * Persist a code block emitted by the assistant to a workspace-relative
	 * path supplied by the model via a path hint comment on the first line.
	 *
	 * Defence-in-depth: even though the webview also validates the path, we
	 * re-check on the host because the postMessage channel is a security
	 * boundary and the webview is sandboxed but not authoritative.
	 */
	private async handleSaveCodeToFile(message: WebviewMessage): Promise<void> {
		const code = message.code;
		const relPath = message.relPath;
		if (typeof code !== 'string' || code.length === 0 || typeof relPath !== 'string' || relPath.length === 0) {
			vscode.window.showErrorMessage('Refusing to save: invalid relative path.');
			return;
		}
		// Reject path traversal, absolute paths, backslash abuse, and null bytes.
		if (
			relPath.includes('..') ||
			relPath.startsWith('/') ||
			relPath.startsWith('\\') ||
			relPath.includes('\0')
		) {
			vscode.window.showErrorMessage('Refusing to save: invalid relative path.');
			return;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a folder/workspace before saving generated code.');
			return;
		}

		const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, relPath);

		try {
			let exists = false;
			try {
				await vscode.workspace.fs.stat(targetUri);
				exists = true;
			} catch {
				// stat throws when the file doesn't exist — that's the happy path
				// for a new file. Any other error surfaces from the writeFile call.
			}

			if (exists) {
				const choice = await vscode.window.showWarningMessage(
					`File ${relPath} already exists. Overwrite?`,
					{ modal: true },
					'Overwrite',
					'Cancel',
				);
				if (choice !== 'Overwrite') {
					return;
				}
			}

			await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(code));
			await vscode.window.showTextDocument(targetUri, { preview: false });
			vscode.window.showInformationMessage(`Saved to ${relPath}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Failed to save ${relPath}: ${message}`);
		}
	}

	/**
	 * Open a side-by-side diff editor showing the workspace file (left) against
	 * an in-memory document carrying the proposed content (right). The proposed
	 * content is produced by applying the supplied unified-diff text to the
	 * current file contents — the assistant's diff is treated as a *proposal*
	 * the user can review and save through VS Code's standard flow.
	 *
	 * Defence-in-depth: even though the webview validates the path before
	 * rendering the Preview button, we re-validate here because the
	 * postMessage channel is a security boundary.
	 */
	private async handlePreviewDiff(diff: string): Promise<void> {
		const pathMatch =
			/^\+\+\+\s+b\/(.+)$/m.exec(diff)
			?? /^\+\+\+\s+(.+)$/m.exec(diff)
			?? /^---\s+a\/(.+)$/m.exec(diff)
			?? /^---\s+(.+)$/m.exec(diff);
		const relPath = pathMatch ? pathMatch[1].trim() : '';
		if (
			!relPath ||
			relPath.includes('..') ||
			relPath.startsWith('/') ||
			relPath.startsWith('\\') ||
			relPath.includes(' ') ||
			relPath.includes('\0')
		) {
			vscode.window.showErrorMessage('Refusing to preview diff: invalid path in diff header.');
			return;
		}

		const root = vscode.workspace.workspaceFolders?.[0]?.uri;
		if (!root) {
			vscode.window.showErrorMessage('Open a folder/workspace before previewing a diff.');
			return;
		}

		const targetUri = vscode.Uri.joinPath(root, relPath);

		let currentContent = '';
		try {
			const bytes = await vscode.workspace.fs.readFile(targetUri);
			currentContent = new TextDecoder('utf-8').decode(bytes);
		} catch {
			currentContent = '';
		}

		let proposedContent: string;
		try {
			proposedContent = applyUnifiedDiff(currentContent, diff);
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Could not apply diff: ${errMessage}`);
			return;
		}

		const proposedDoc = await vscode.workspace.openTextDocument({
			content: proposedContent,
			language: this.guessLanguageFromPath(relPath),
		});

		const title = `${relPath} (Son of Anton proposal)`;
		await vscode.commands.executeCommand('vscode.diff', targetUri, proposedDoc.uri, title);
	}

	/**
	 * Best-effort language id from a relative path's extension. Falls back to
	 * `plaintext` so the proposal doc always has *some* language and never
	 * breaks document creation.
	 */
	private guessLanguageFromPath(relPath: string): string {
		const ext = relPath.toLowerCase().split('.').pop() ?? '';
		const map: Record<string, string> = {
			ts: 'typescript', tsx: 'typescriptreact',
			js: 'javascript', jsx: 'javascriptreact',
			py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
			java: 'java', kt: 'kotlin', swift: 'swift',
			json: 'json', yaml: 'yaml', yml: 'yaml',
			md: 'markdown', html: 'html', css: 'css', scss: 'scss',
			sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript',
		};
		return map[ext] ?? 'plaintext';
	}

	private getHtmlContent(): string {
		const cssUri = this.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css')
		);

		const defaultModel = vscode.workspace.getConfiguration('sota').get<string>('defaultModel', 'sonnet');
		// Serialise the registry into the page so the webview JS can render the
		// agent menu without an extra round-trip. JSON.stringify produces JSON
		// that's safe to embed inside a <script type="application/json"> block.
		const specialistRolesJson = JSON.stringify(SPECIALIST_ROLES);

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.webview.cspSource}; script-src 'nonce-YourNonceHere';">
	<link href="${cssUri}" rel="stylesheet">
	<title>Son of Anton Chat</title>
</head>
<body data-default-model="${defaultModel}">
	<div class="chat">
		<div class="chat-header">
			<div class="hdr-title">Son of Anton</div>
			<div class="hdr-conn" id="hdrConn" hidden>
				<span class="hdr-conn-dot"></span>
				<span class="hdr-conn-label" id="hdrConnLabel"></span>
			</div>
			<button class="hdr-btn" id="newChatBtn" title="New chat" aria-label="New chat">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
			</button>
		</div>

		<div class="message-list" id="messageList">
			<div class="empty-state" id="emptyState">
				<!-- Visible when ANY auth is available -->
				<div id="emptyStateReady" hidden>
					<div class="empty-title">How can I help?</div>
					<div class="empty-subtitle">Ask anything about your code or the current workspace.</div>
					<div class="empty-prompts">
						<button class="prompt-card" data-prompt="Explain what the current file does and how it fits in the codebase.">Explain the current file</button>
						<button class="prompt-card" data-prompt="Suggest tests for the selected code, covering happy path and edge cases.">Suggest tests for the selection</button>
						<button class="prompt-card" data-prompt="Review the recent changes for bugs, missing edge cases, and unclear code.">Review recent changes</button>
					</div>
				</div>
				<!-- Visible when NO auth available -->
				<div id="emptyStateAuth" hidden>
					<div class="empty-title">Connect to get started</div>
					<div class="empty-subtitle">Son of Anton needs an LLM provider to chat. Pick one:</div>
					<div class="empty-prompts">
						<button class="auth-cta" data-cmd="sota.signInClaude">
							<span class="auth-cta-title">Sign in to Claude</span>
							<span class="auth-cta-sub">Use your Anthropic OAuth (requires a configured client ID).</span>
						</button>
						<button class="auth-cta" data-cmd="sota.signInOpenAI">
							<span class="auth-cta-title">Sign in to ChatGPT / Codex</span>
							<span class="auth-cta-sub">Use your OpenAI OAuth (requires a configured client ID).</span>
						</button>
						<button class="auth-cta" data-cmd="workbench.action.openSettings" data-cmd-arg="@id:sota.apiKey">
							<span class="auth-cta-title">Use an API key instead</span>
							<span class="auth-cta-sub">Paste an Anthropic or OpenAI key into settings — fastest path.</span>
						</button>
					</div>
				</div>
			</div>
		</div>

		<div class="composer">
			<div class="context-chips" id="contextChips"></div>
			<div class="composer-shell">
				<textarea class="composer-input" id="messageInput" placeholder="Ask anything…" rows="1"></textarea>
				<div class="composer-toolbar">
					<button class="toolbar-chip" id="attachBtn" title="Add context" aria-label="Add context">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
						<span>Add context</span>
					</button>
					<button class="toolbar-chip" id="agentChip" aria-haspopup="true">
						<span id="agentLabel">Anton</span>
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
					</button>
					<button class="toolbar-chip" id="modelChip" aria-haspopup="true">
						<span id="modelLabel">Sonnet</span>
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
					</button>
					<div class="toolbar-spacer"></div>
					<button class="send-button" id="sendBtn" title="Send (Enter)" aria-label="Send">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3 8l5-5 5 5"/></svg>
					</button>
				</div>
			</div>
		</div>

		<div class="status-bar">
			<span id="tokenCount">0 tokens</span>
			<span id="costEstimate">$0.00</span>
		</div>

		<div class="popover" id="modelMenu" hidden role="menu">
			<div class="popover-section-label">Claude</div>
			<button class="popover-item" role="menuitem" data-model="opus"><span class="item-check"></span>Opus<span class="item-key">complex</span></button>
			<button class="popover-item" role="menuitem" data-model="sonnet"><span class="item-check"></span>Sonnet<span class="item-key">balanced</span></button>
			<button class="popover-item" role="menuitem" data-model="haiku"><span class="item-check"></span>Haiku<span class="item-key">fast</span></button>
			<div class="popover-section-label">OpenAI</div>
			<button class="popover-item" role="menuitem" data-model="gpt-4o"><span class="item-check"></span>GPT-4o<span class="item-key">capable</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4o-mini"><span class="item-check"></span>GPT-4o mini<span class="item-key">fast</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-5-codex"><span class="item-check"></span>GPT-5 Codex<span class="item-key">code</span></button>
			<div class="popover-section-label">Microsoft Foundry</div>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4o"><span class="item-check"></span>Foundry GPT-4o<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4o-mini"><span class="item-check"></span>Foundry GPT-4o mini<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-claude-sonnet"><span class="item-check"></span>Foundry Claude Sonnet<span class="item-key">azure</span></button>
			<div class="popover-section-label">Amazon Bedrock</div>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-sonnet"><span class="item-check"></span>Bedrock Claude Sonnet<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-haiku"><span class="item-check"></span>Bedrock Claude Haiku<span class="item-key">aws</span></button>
			<div class="popover-section-label">Google Gemini</div>
			<button class="popover-item" role="menuitem" data-model="gemini-1-5-pro"><span class="item-check"></span>Gemini 1.5 Pro<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-1-5-flash"><span class="item-check"></span>Gemini 1.5 Flash<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-2-0-flash"><span class="item-check"></span>Gemini 2.0 Flash<span class="item-key">google</span></button>
		</div>

		<div class="popover" id="agentMenu" hidden role="menu">
			<!-- populated by JS from SPECIALIST_ROLES -->
		</div>

		<div class="popover" id="attachMenu" hidden role="menu">
			<button class="popover-item" role="menuitem" data-attach="current-file" data-label="Current file">Current file</button>
			<button class="popover-item" role="menuitem" data-attach="current-selection" data-label="Selection">Selection</button>
			<button class="popover-item" role="menuitem" data-attach="terminal-output" data-label="Terminal output">Terminal output</button>
		</div>
	</div>

	<script type="application/json" id="specialistRolesData">${specialistRolesJson}</script>

	<script>
		const vscode = acquireVsCodeApi();
		const messageList = document.getElementById('messageList');
		const emptyState = document.getElementById('emptyState');
		const messageInput = document.getElementById('messageInput');
		const sendBtn = document.getElementById('sendBtn');
		const newChatBtn = document.getElementById('newChatBtn');
		const tokenCount = document.getElementById('tokenCount');
		const costEstimate = document.getElementById('costEstimate');
		const attachBtn = document.getElementById('attachBtn');
		const attachMenu = document.getElementById('attachMenu');
		const modelChip = document.getElementById('modelChip');
		const modelMenu = document.getElementById('modelMenu');
		const modelLabel = document.getElementById('modelLabel');
		const agentChip = document.getElementById('agentChip');
		const agentMenu = document.getElementById('agentMenu');
		const agentLabel = document.getElementById('agentLabel');
		const contextChips = document.getElementById('contextChips');
		const hdrConn = document.getElementById('hdrConn');
		const hdrConnLabel = document.getElementById('hdrConnLabel');
		const emptyStateReady = document.getElementById('emptyStateReady');
		const emptyStateAuth = document.getElementById('emptyStateAuth');

		const MODEL_LABELS = {
			opus: 'Opus',
			sonnet: 'Sonnet',
			haiku: 'Haiku',
			'gpt-4o': 'GPT-4o',
			'gpt-4o-mini': 'GPT-4o mini',
			'gpt-5-codex': 'GPT-5 Codex',
			'foundry-gpt-4o': 'Foundry GPT-4o',
			'foundry-gpt-4o-mini': 'Foundry GPT-4o mini',
			'foundry-claude-sonnet': 'Foundry Claude Sonnet',
			'bedrock-claude-sonnet': 'Bedrock Claude Sonnet',
			'bedrock-claude-haiku': 'Bedrock Claude Haiku',
			'gemini-1-5-pro': 'Gemini 1.5 Pro',
			'gemini-1-5-flash': 'Gemini 1.5 Flash',
			'gemini-2-0-flash': 'Gemini 2.0 Flash',
		};
		const ATTACH_LABELS = { 'current-file': 'Current file', 'current-selection': 'Selection', 'terminal-output': 'Terminal output' };

		// Specialist roles are injected as JSON by the host so we don't need a
		// round-trip to populate the menu. Defensive: an empty/invalid blob
		// falls back to a single 'anton' entry so the chip still works.
		let SPECIALISTS = [];
		try {
			const raw = document.getElementById('specialistRolesData');
			SPECIALISTS = raw ? JSON.parse(raw.textContent) : [];
		} catch (e) {
			SPECIALISTS = [];
		}
		if (!Array.isArray(SPECIALISTS) || SPECIALISTS.length === 0) {
			SPECIALISTS = [{ id: 'anton', displayName: 'Anton', description: '', roleDescription: '' }];
		}

		let isStreaming = false;
		let currentAssistantDiv = null;
		let currentAssistantHeader = null;
		// The text span that streamed tokens write into. Lives as a sibling
		// of any tool-call cards inside the message body so finalising the
		// markdown render doesn't replace the cards' DOM nodes.
		let currentAssistantTextSpan = null;
		let attachments = [];
		let currentModel = document.body.dataset.defaultModel || 'sonnet';
		let currentAgent = 'anton';

		renderAgentMenu();
		updateAgentLabel();
		updateAgentMenuChecks();
		updateModelLabel();
		updateModelMenuChecks();
		updateEmptyState();
		// Default the auth gate to "ready" until the host reports otherwise so
		// we never paint a blank empty-state during the brief startup window
		// before the first connectionState message arrives.
		updateAuthGate(null);

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		/**
		 * Convert a small subset of Markdown to safe HTML. All input is
		 * escaped before tag insertion; only the markdown shapes we recognise
		 * become HTML, which keeps the surface narrow and predictable for
		 * a webview that renders LLM output.
		 */
		function renderMarkdown(text) {
			// 0. Hold sota:tool sentinels aside. The persisted form is
			//    <<<sota:tool data="<base64>">>> and is robust against any
			//    tool-output content (triple backticks, HTML, etc.).
			const toolBlocks = [];
			let toolIndex = 0;
			const sansTool = text.replace(/<<<sota:tool data="([A-Za-z0-9+/=]+)">>>/g, (_, b64) => {
				toolBlocks[toolIndex] = b64;
				return '@@TB' + (toolIndex++) + '@@';
			});

			// 1. Hold fenced code blocks aside so block/inline rules below don't touch their contents.
			const codeBlocks = [];
			let codeIndex = 0;
			const sansCode = sansTool.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
				codeBlocks[codeIndex] = { lang, code };
				return '@@CB' + (codeIndex++) + '@@';
			});

			// 2. Escape everything else.
			let html = escapeHtml(sansCode);

			// 3. Block-level (anchored to line start).
			html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
			html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
			html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
			html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

			// 4. Bullet lists — collapse runs of "- " lines into a <ul>.
			html = html.replace(/(?:^- .+\\n?)+/gm, (run) => {
				const items = run.split('\\n').filter(Boolean).map(l => '<li>' + l.replace(/^- /, '') + '</li>').join('');
				return '<ul>' + items + '</ul>';
			});

			// 5. Inline.
			html = html.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
			html = html.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
			html = html.replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>');
			html = html.replace(/(^|[^*])\\*([^*\\n]+)\\*/g, '$1<em>$2</em>');

			// 6. Remaining newlines become hard breaks, but not directly after a closing block tag.
			html = html.replace(/\\n/g, '<br>');
			html = html.replace(/(<\\/(h1|h2|h3|blockquote|ul|li)>)<br>/g, '$1');

			// 7. Restore code blocks (escaping their bodies).
			html = html.replace(/@@CB(\\d+)@@/g, (_, idxStr) => {
				const block = codeBlocks[parseInt(idxStr, 10)];
				if (!block) {
					return '';
				}
				const lang = (block.lang || 'text').slice(0, 32);
				// 'tool' fences are how persisted assistant messages encode a
				// prior tool-call summary. Render them as static tool-card
				// markup so reloaded conversations show the same expandable
				// card UI as live streaming.
				if (lang === 'tool') {
					return renderToolFenceAsCard(block.code);
				}
				const escapedCode = escapeHtml(block.code.replace(/\\n+$/, ''));
				const detectedPath = detectPathHint(block.code);
				const saveBtn = detectedPath
					? '<button class="code-save" data-path="' + escapeHtml(detectedPath) + '" onclick="saveCodeToFile(this)" title="Save to ' + escapeHtml(detectedPath) + '">Save</button>'
					: '';
				// If this is a diff/patch fence with a recognisable target path,
				// emit a Preview button that ships the full diff payload as
				// base64 so HTML attribute encoding can't lose characters.
				const langLower = (block.lang || '').toLowerCase();
				const isDiff = langLower === 'diff' || langLower === 'patch';
				const diffPath = isDiff ? detectDiffTargetPath(block.code) : '';
				let diffBtn = '';
				if (isDiff && diffPath) {
					try {
						const encodedDiff = btoa(unescape(encodeURIComponent(block.code)));
						diffBtn = '<button class="code-diff" data-diff="' + escapeHtml(encodedDiff) + '" onclick="previewDiff(this)" title="Preview as diff">Preview</button>';
					} catch (e) {
						diffBtn = '';
					}
				}
				return '<div class="code-block">' +
					'<div class="code-header">' +
						'<span class="code-lang">' + escapeHtml(lang) + '</span>' +
						'<div class="code-actions">' +
							diffBtn +
							saveBtn +
							'<button class="code-open" onclick="openCodeInEditor(this)" title="Open in new editor tab">Open</button>' +
							'<button class="code-copy" onclick="copyCode(this)">Copy</button>' +
						'</div>' +
					'</div>' +
					'<pre><code class="language-' + escapeHtml(lang) + '">' + escapedCode + '</code></pre>' +
				'</div>';
			});

			// 8. Restore sota:tool sentinels — decode base64 body and route through the existing card renderer.
			html = html.replace(/@@TB(\\d+)@@/g, (_, idxStr) => {
				const b64 = toolBlocks[parseInt(idxStr, 10)];
				if (!b64) {
					return '';
				}
				try {
					const decoded = decodeURIComponent(escape(atob(b64)));
					return renderToolFenceAsCard(decoded);
				} catch (e) {
					return '';
				}
			});

			return html;
		}

		/**
		 * Inspect the first non-empty line of a fenced code body for a
		 * "path:" hint comment in any of the supported comment syntaxes.
		 * Returns the workspace-relative path string, or '' if no valid
		 * hint is found. Rejects absolute paths and traversal sequences
		 * so a malicious model can't trick the webview into rendering a
		 * Save button that targets the host filesystem.
		 */
		function detectPathHint(code) {
			if (typeof code !== 'string' || !code) {
				return '';
			}
			// First non-empty line — leading whitespace tolerated, but blank
			// lines at the top are skipped to handle assistants that add a
			// preamble newline after the opening fence.
			const lines = code.split('\\n');
			let firstLine = '';
			for (const line of lines) {
				if (line.trim().length > 0) {
					firstLine = line;
					break;
				}
			}
			if (!firstLine) {
				return '';
			}
			const patterns = [
				/^\\s*\\/\\/\\s*path:\\s*(\\S.*?)\\s*$/i,
				/^\\s*#\\s*path:\\s*(\\S.*?)\\s*$/i,
				/^\\s*<!--\\s*path:\\s*(\\S.*?)\\s*-->\\s*$/i,
			];
			let candidate = '';
			for (const pat of patterns) {
				const m = firstLine.match(pat);
				if (m && m[1]) {
					candidate = m[1].trim();
					break;
				}
			}
			if (!candidate) {
				return '';
			}
			// Reject anything that could escape the workspace root or smuggle
			// in an absolute/Windows path.
			if (
				candidate.indexOf('..') !== -1 ||
				candidate.charAt(0) === '/' ||
				candidate.charAt(0) === '\\\\' ||
				candidate.indexOf('\\0') !== -1
			) {
				return '';
			}
			return candidate;
		}

		/**
		 * Inspect a unified-diff body for the target file path. Prefers the
		 * post-image header (\`+++ b/<path>\`) and falls through to plausible
		 * variants. Returns '' when no safe workspace-relative path is found
		 * so the webview can suppress the Preview button defensively — the
		 * host re-validates the same constraints.
		 */
		function detectDiffTargetPath(diff) {
			if (typeof diff !== 'string' || !diff) {
				return '';
			}
			const patterns = [
				/^\\+\\+\\+\\s+b\\/(.+)$/m,
				/^\\+\\+\\+\\s+(.+)$/m,
				/^---\\s+a\\/(.+)$/m,
				/^---\\s+(.+)$/m,
			];
			let candidate = '';
			for (const pat of patterns) {
				const m = diff.match(pat);
				if (m && m[1]) {
					candidate = m[1].trim();
					break;
				}
			}
			if (!candidate) {
				return '';
			}
			if (
				candidate.indexOf('..') !== -1 ||
				candidate.charAt(0) === '/' ||
				candidate.charAt(0) === '\\\\' ||
				candidate.indexOf(' ') !== -1 ||
				candidate.indexOf('\\0') !== -1 ||
				candidate === '/dev/null'
			) {
				return '';
			}
			return candidate;
		}

		/**
		 * Render a persisted \`\`\`tool fenced block back into static tool-card
		 * markup. The first line is the header (\`name(args-json) → status\`)
		 * and the remaining lines are the captured output. We never have a
		 * persisted 'running' card — it would mean a session was reloaded
		 * mid-tool-call, which the host doesn't persist anyway.
		 */
		function renderToolFenceAsCard(body) {
			const text = typeof body === 'string' ? body.replace(/^\\n+|\\n+$/g, '') : '';
			const lines = text.split('\\n');
			const header = lines[0] || '';
			const output = lines.slice(1).join('\\n');
			// Header form: '<name>(<json>) → <ok|error>'. Be defensive — if it
			// doesn't match, fall back to rendering the raw text in the card.
			const m = /^([^()\\s]+)\\((.*)\\)\\s*\\u2192\\s*(ok|error)\\s*$/.exec(header);
			let name = 'tool';
			let argsRaw = '';
			let status = 'ok';
			if (m) {
				name = m[1];
				argsRaw = m[2];
				status = m[3] === 'error' ? 'error' : 'ok';
			} else {
				name = header || 'tool';
			}
			const argsTrunc = argsRaw.length > 120 ? argsRaw.slice(0, 119) + '\\u2026' : argsRaw;
			const icon = status === 'error' ? '\\u2717' : '\\u2713';
			const escapedName = escapeHtml(name);
			const escapedArgs = escapeHtml(argsTrunc);
			const escapedOutput = escapeHtml(output);
			return '<div class="tool-card" data-tool-status="' + status + '">' +
				'<div class="tool-card-header">' +
					'<span class="tool-card-icon">' + icon + '</span>' +
					'<span class="tool-card-name">' + escapedName + '</span>' +
					'<span class="tool-card-args">' + escapedArgs + '</span>' +
				'</div>' +
				'<details class="tool-card-output">' +
					'<summary>View output</summary>' +
					'<pre>' + escapedOutput + '</pre>' +
				'</details>' +
			'</div>';
		}

		function buildMessageHeader(role, displayName) {
			const meta = document.createElement('div');
			meta.className = 'msg-meta';

			const avatar = document.createElement('span');
			avatar.className = 'msg-avatar';
			avatar.textContent = role === 'user' ? 'You' : 'A';
			meta.appendChild(avatar);

			const name = document.createElement('span');
			name.className = 'msg-name';
			name.textContent = role === 'user' ? 'You' : (displayName || 'Anton');
			meta.appendChild(name);

			return meta;
		}

		function addMessage(role, content) {
			const wrapper = document.createElement('div');
			wrapper.className = 'msg msg-' + role;
			// System messages (slash-command output) get a plain body without
			// a header — the visual treatment in CSS makes the role obvious.
			if (role !== 'system') {
				wrapper.appendChild(buildMessageHeader(role));
			}

			const body = document.createElement('div');
			body.className = 'msg-body';
			body.innerHTML = renderMarkdown(content);
			wrapper.appendChild(body);

			messageList.appendChild(wrapper);
			messageList.scrollTop = messageList.scrollHeight;
			updateEmptyState();
			return wrapper;
		}

		function startStreamingMessage(displayName) {
			const wrapper = document.createElement('div');
			wrapper.className = 'msg msg-assistant';

			const meta = buildMessageHeader('assistant', displayName);
			const dots = document.createElement('span');
			dots.className = 'streaming-dots';
			dots.innerHTML = '<span></span><span></span><span></span>';
			meta.appendChild(dots);
			wrapper.appendChild(meta);
			currentAssistantHeader = meta;

			const body = document.createElement('div');
			body.className = 'msg-body';
			wrapper.appendChild(body);

			messageList.appendChild(wrapper);
			messageList.scrollTop = messageList.scrollHeight;
			currentAssistantDiv = body;
			updateEmptyState();
			return wrapper;
		}

		function clearStreamingIndicator() {
			if (currentAssistantHeader) {
				const dots = currentAssistantHeader.querySelector('.streaming-dots');
				if (dots) dots.remove();
				currentAssistantHeader = null;
			}
		}

		function setStreamingState(streaming) {
			isStreaming = streaming;
			sendBtn.classList.toggle('is-streaming', streaming);
			sendBtn.title = streaming ? 'Stop generating' : 'Send (Enter)';
			sendBtn.setAttribute('aria-label', streaming ? 'Stop' : 'Send');
			sendBtn.innerHTML = streaming
				? '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>'
				: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3 8l5-5 5 5"/></svg>';
		}

		function sendMessage() {
			if (isStreaming) {
				vscode.postMessage({ type: 'cancelRequest' });
				return;
			}
			const text = messageInput.value.trim();
			if (!text) return;

			addMessage('user', text);
			messageInput.value = '';
			messageInput.style.height = 'auto';
			setStreamingState(true);
			// Capture the agent display name at send time so subsequent
			// specialist switches don't relabel this message's header.
			startStreamingMessage(getCurrentAgentDisplayName());

			vscode.postMessage({
				type: 'sendMessage',
				text: text,
				model: currentModel,
				attachments: [...attachments],
				specialistId: currentAgent,
			});

			attachments = [];
			renderContextChips();
		}

		// Use closest('.code-block') so the lookup keeps working regardless
		// of how deeply nested the action button is inside the header
		// (we wrap the buttons in a .code-actions container).
		function findCodeElForButton(btn) {
			const block = btn.closest ? btn.closest('.code-block') : null;
			return block ? block.querySelector('code') : null;
		}

		window.copyCode = function (btn) {
			const codeEl = findCodeElForButton(btn);
			const code = codeEl ? codeEl.textContent : '';
			vscode.postMessage({ type: 'copyCode', text: code });
			btn.textContent = 'Copied';
			setTimeout(() => btn.textContent = 'Copy', 1500);
		};

		window.openCodeInEditor = function (btn) {
			const codeEl = findCodeElForButton(btn);
			const code = codeEl ? codeEl.textContent : '';
			// Pull language from class="language-<lang>"
			let language = '';
			if (codeEl) {
				const cls = (codeEl.className || '').match(/language-([\\w-]+)/);
				if (cls && cls[1]) {
					language = cls[1];
				}
			}
			vscode.postMessage({ type: 'openCodeInEditor', code: code, language: language });
			btn.textContent = 'Opened';
			setTimeout(() => btn.textContent = 'Open', 1500);
		};

		window.saveCodeToFile = function (btn) {
			const codeEl = findCodeElForButton(btn);
			const code = codeEl ? codeEl.textContent : '';
			const relPath = btn.dataset.path || '';
			if (!relPath || !code) return;
			vscode.postMessage({ type: 'saveCodeToFile', code: code, relPath: relPath });
			btn.textContent = 'Saving\\u2026';
			setTimeout(() => btn.textContent = 'Save', 2000);
		};

		window.previewDiff = function (btn) {
			const encoded = btn.dataset.diff || '';
			try {
				const diffText = decodeURIComponent(escape(atob(encoded)));
				vscode.postMessage({ type: 'previewDiff', diff: diffText });
				btn.textContent = 'Opening\\u2026';
				setTimeout(() => btn.textContent = 'Preview', 2000);
			} catch (err) {
				console.warn('Failed to decode diff payload', err);
			}
		};

		function updateEmptyState() {
			const hasMessages = messageList.querySelector('.msg') !== null;
			emptyState.style.display = hasMessages ? 'none' : '';
		}

		function renderContextChips() {
			contextChips.textContent = '';
			attachments.forEach((id, i) => {
				const chip = document.createElement('span');
				chip.className = 'context-chip';
				chip.textContent = ATTACH_LABELS[id] || id;
				const remove = document.createElement('button');
				remove.className = 'context-chip-remove';
				remove.title = 'Remove';
				remove.setAttribute('aria-label', 'Remove ' + (ATTACH_LABELS[id] || id));
				remove.textContent = '\\u00D7';
				remove.addEventListener('click', () => {
					attachments.splice(i, 1);
					renderContextChips();
				});
				chip.appendChild(remove);
				contextChips.appendChild(chip);
			});
		}

		function updateModelLabel() {
			modelLabel.textContent = MODEL_LABELS[currentModel] || currentModel;
		}

		function updateModelMenuChecks() {
			modelMenu.querySelectorAll('.popover-item').forEach((item) => {
				const check = item.querySelector('.item-check');
				if (!check) return;
				check.textContent = item.dataset.model === currentModel ? '\\u2713' : '';
			});
		}

		function getCurrentAgentDisplayName() {
			const match = SPECIALISTS.find(s => s && s.id === currentAgent);
			return match ? match.displayName : 'Anton';
		}

		function renderAgentMenu() {
			agentMenu.textContent = '';
			SPECIALISTS.forEach((spec) => {
				if (!spec || !spec.id) return;
				const item = document.createElement('button');
				item.className = 'popover-item';
				item.setAttribute('role', 'menuitem');
				item.dataset.agent = spec.id;

				const check = document.createElement('span');
				check.className = 'item-check';
				item.appendChild(check);

				item.appendChild(document.createTextNode(spec.displayName || spec.id));

				if (spec.description) {
					const desc = document.createElement('span');
					desc.className = 'item-key';
					desc.textContent = spec.description;
					item.appendChild(desc);
				}
				agentMenu.appendChild(item);
			});
		}

		function updateAgentLabel() {
			agentLabel.textContent = getCurrentAgentDisplayName();
		}

		function updateAgentMenuChecks() {
			agentMenu.querySelectorAll('.popover-item').forEach((item) => {
				const check = item.querySelector('.item-check');
				if (!check) return;
				check.textContent = item.dataset.agent === currentAgent ? '\\u2713' : '';
			});
		}

		function toggleMenu(menu, anchor) {
			const isHidden = menu.hasAttribute('hidden');
			document.querySelectorAll('.popover').forEach(m => m.setAttribute('hidden', ''));
			if (!isHidden) return;
			menu.removeAttribute('hidden');
			const rect = anchor.getBoundingClientRect();
			menu.style.left = rect.left + 'px';
			menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
		}

		function closeMenus() {
			document.querySelectorAll('.popover').forEach(m => m.setAttribute('hidden', ''));
		}

		// --- Event wiring ---

		sendBtn.addEventListener('click', sendMessage);

		newChatBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'clearConversation' });
		});

		messageInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		});

		messageInput.addEventListener('input', () => {
			messageInput.style.height = 'auto';
			messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
		});

		attachBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleMenu(attachMenu, attachBtn);
		});

		modelChip.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleMenu(modelMenu, modelChip);
		});

		modelMenu.addEventListener('click', (e) => {
			const target = e.target.closest('.popover-item');
			if (!target) return;
			currentModel = target.dataset.model;
			updateModelLabel();
			updateModelMenuChecks();
			closeMenus();
		});

		agentChip.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleMenu(agentMenu, agentChip);
		});

		agentMenu.addEventListener('click', (e) => {
			const target = e.target.closest('.popover-item');
			if (!target) return;
			currentAgent = target.dataset.agent || 'anton';
			updateAgentLabel();
			updateAgentMenuChecks();
			closeMenus();
		});

		attachMenu.addEventListener('click', (e) => {
			const target = e.target.closest('.popover-item');
			if (!target) return;
			const id = target.dataset.attach;
			if (id && !attachments.includes(id)) {
				attachments.push(id);
				renderContextChips();
			}
			closeMenus();
		});

		document.addEventListener('click', (e) => {
			if (e.target.closest('.popover') || e.target.closest('#modelChip') || e.target.closest('#attachBtn') || e.target.closest('#agentChip')) return;
			closeMenus();
		});

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') closeMenus();
		});

		document.querySelectorAll('.prompt-card').forEach((card) => {
			card.addEventListener('click', () => {
				messageInput.value = card.dataset.prompt || card.textContent;
				messageInput.focus();
				messageInput.dispatchEvent(new Event('input'));
			});
		});

		// --- Extension → webview message handling ---

		window.addEventListener('message', (event) => {
			const message = event.data;
			switch (message.type) {
				case 'streamToken':
					appendStreamingText(message.token);
					break;
				case 'toolCall':
					renderToolCall(message);
					break;
				case 'agentPlan':
					renderAgentPlan(message.plan);
					break;
				case 'subtaskStart':
					renderSubtask(message, 'running');
					break;
				case 'subtaskToken':
					appendSubtaskToken(message.subtaskId, message.token);
					break;
				case 'subtaskComplete':
					renderSubtask(message, 'ok');
					break;
				case 'subtaskFail':
					renderSubtask(message, 'error');
					break;
				case 'messageComplete':
					finalizeStreamingText();
					clearStreamingIndicator();
					setStreamingState(false);
					currentAssistantDiv = null;
					currentAssistantTextSpan = null;
					tokenCount.textContent = (message.totalTokens || 0) + ' tokens';
					costEstimate.textContent = '$' + (message.estimatedCost || '0.00');
					break;
				case 'streamError':
					if (currentAssistantTextSpan) {
						currentAssistantTextSpan.textContent += '\\n\\nError: ' + message.error;
					} else if (currentAssistantDiv) {
						const errSpan = document.createElement('div');
						errSpan.textContent = 'Error: ' + message.error;
						currentAssistantDiv.appendChild(errSpan);
					}
					clearStreamingIndicator();
					setStreamingState(false);
					currentAssistantDiv = null;
					currentAssistantTextSpan = null;
					break;
				case 'loadConversation':
					messageList.querySelectorAll('.msg').forEach(n => n.remove());
					if (message.messages) {
						for (const msg of message.messages) {
							addMessage(msg.role, msg.content);
						}
					}
					updateEmptyState();
					break;
				case 'conversationCleared':
					messageList.querySelectorAll('.msg').forEach(n => n.remove());
					updateEmptyState();
					break;
				case 'connectionState':
					updateConnectionUi(message.status);
					updateAuthGate(message.status);
					break;
				case 'systemMessage':
					addMessage('system', message.content || '');
					break;
				case 'specialistChange':
					if (message.specialistId) {
						currentAgent = message.specialistId;
						updateAgentLabel();
						updateAgentMenuChecks();
					}
					break;
				case 'modelChange':
					if (message.model) {
						currentModel = message.model;
						updateModelLabel();
						updateModelMenuChecks();
					}
					break;
			}
		});

		/**
		 * Append a chunk of streamed assistant text. The text lands inside a
		 * dedicated text span so tool-call cards (which are inserted as
		 * sibling nodes) don't get clobbered when we later run markdown
		 * rendering on the accumulated text.
		 */
		function appendStreamingText(token) {
			if (!currentAssistantDiv) return;
			if (!currentAssistantTextSpan || currentAssistantTextSpan.parentNode !== currentAssistantDiv) {
				currentAssistantTextSpan = document.createElement('span');
				currentAssistantTextSpan.className = 'msg-text-stream';
				currentAssistantDiv.appendChild(currentAssistantTextSpan);
			}
			currentAssistantTextSpan.textContent += token;
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * On stream completion, render the accumulated raw text as markdown
		 * but leave any sibling tool-call cards alone. We replace just the
		 * streaming text span's content rather than the whole message body.
		 */
		function finalizeStreamingText() {
			if (!currentAssistantTextSpan) return;
			const raw = currentAssistantTextSpan.textContent || '';
			if (raw.length === 0) {
				currentAssistantTextSpan.remove();
				return;
			}
			// Replace the live span with a static rendered fragment so future
			// streamTokens (in a follow-up turn) start a fresh span and don't
			// re-render the already-finalised prose.
			const wrapper = document.createElement('span');
			wrapper.className = 'msg-text-rendered';
			wrapper.innerHTML = renderMarkdown(raw);
			currentAssistantTextSpan.replaceWith(wrapper);
			currentAssistantTextSpan = null;
		}

		/**
		 * Truncate a JSON args blob to ~120 chars with an ellipsis so the card
		 * header stays compact even when the model passes long input.
		 */
		function truncateArgs(input) {
			let json;
			try {
				json = JSON.stringify(input ?? {});
			} catch (e) {
				json = '{}';
			}
			if (json.length > 120) {
				return json.slice(0, 119) + '\\u2026';
			}
			return json;
		}

		/**
		 * Render or update a tool-call card inside the active assistant
		 * message body. Status 'running' inserts a fresh card; 'ok'/'error'
		 * either updates the existing card by id, or — defensively, in case
		 * the running marker was missed (e.g. session reload mid-run) —
		 * inserts a new card carrying the final state.
		 */
		function renderToolCall(message) {
			if (!currentAssistantDiv) {
				// No active assistant message — nothing to attach to. This is
				// rare (would mean the host posted a toolCall before any
				// streamToken) but be defensive and start a fresh assistant
				// bubble so the user still sees the activity.
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			// Finalise any in-flight streaming text so the card sits AFTER the
			// prose that triggered it, not inside it.
			finalizeStreamingText();

			const id = message.id || '';
			let card = id ? currentAssistantDiv.querySelector('[data-tool-id="' + cssEscape(id) + '"]') : null;
			if (!card) {
				card = document.createElement('div');
				card.className = 'tool-card';
				card.dataset.toolId = id;
				const header = document.createElement('div');
				header.className = 'tool-card-header';
				const icon = document.createElement('span');
				icon.className = 'tool-card-icon';
				const name = document.createElement('span');
				name.className = 'tool-card-name';
				const args = document.createElement('span');
				args.className = 'tool-card-args';
				header.appendChild(icon);
				header.appendChild(name);
				header.appendChild(args);
				card.appendChild(header);
				const details = document.createElement('details');
				details.className = 'tool-card-output';
				details.hidden = true;
				const summary = document.createElement('summary');
				summary.textContent = 'View output';
				const pre = document.createElement('pre');
				details.appendChild(summary);
				details.appendChild(pre);
				card.appendChild(details);
				currentAssistantDiv.appendChild(card);
			}

			const status = message.status || 'running';
			card.dataset.toolStatus = status;
			const iconEl = card.querySelector('.tool-card-icon');
			const nameEl = card.querySelector('.tool-card-name');
			const argsEl = card.querySelector('.tool-card-args');
			const detailsEl = card.querySelector('.tool-card-output');
			const preEl = detailsEl ? detailsEl.querySelector('pre') : null;

			if (iconEl) {
				iconEl.textContent = status === 'ok' ? '\\u2713' : status === 'error' ? '\\u2717' : '\\u2026';
			}
			if (nameEl) {
				nameEl.textContent = message.name || 'tool';
			}
			if (argsEl) {
				argsEl.textContent = truncateArgs(message.input);
			}
			if (detailsEl) {
				if (status === 'running') {
					detailsEl.hidden = true;
					if (preEl) preEl.textContent = '';
				} else {
					detailsEl.hidden = false;
					if (preEl) {
						preEl.textContent = typeof message.output === 'string' ? message.output : '';
					}
				}
			}
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Render an orchestrator plan card inside the active assistant message.
		 * The card lists each subtask with its assignee and scope so the user
		 * can follow the dispatched plan; it sits inline with any prose tokens
		 * that streamed before the structured event arrived.
		 */
		function renderAgentPlan(plan) {
			if (!plan || !Array.isArray(plan.subtasks)) {
				return;
			}
			if (!currentAssistantDiv) {
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			finalizeStreamingText();

			const card = document.createElement('div');
			card.className = 'tool-card sota-plan-card';
			card.dataset.toolStatus = 'running';
			const header = document.createElement('div');
			header.className = 'tool-card-header';
			const icon = document.createElement('span');
			icon.className = 'tool-card-icon';
			icon.textContent = '\\u2261';
			const name = document.createElement('span');
			name.className = 'tool-card-name';
			name.textContent = 'Execution plan';
			header.appendChild(icon);
			header.appendChild(name);
			card.appendChild(header);

			const list = document.createElement('ol');
			list.className = 'sota-plan-list';
			for (const subtask of plan.subtasks) {
				const li = document.createElement('li');
				const assignee = document.createElement('span');
				assignee.className = 'sota-plan-assignee';
				assignee.textContent = '@' + (subtask.assignee || 'anton');
				const instruction = document.createElement('span');
				instruction.className = 'sota-plan-instruction';
				instruction.textContent = ' ' + (subtask.instruction || '');
				li.appendChild(assignee);
				li.appendChild(instruction);
				if (Array.isArray(subtask.scopeFiles) && subtask.scopeFiles.length > 0) {
					const files = document.createElement('div');
					files.className = 'sota-plan-files';
					files.textContent = subtask.scopeFiles.join(', ');
					li.appendChild(files);
				}
				list.appendChild(li);
			}
			card.appendChild(list);
			currentAssistantDiv.appendChild(card);
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Render or update a subtask card. Status flips between 'running'
		 * (running), 'ok' (success) and 'error' (failure) so the user can watch
		 * the dispatch progress in place rather than as a wall of prose.
		 */
		function renderSubtask(message, status) {
			if (!currentAssistantDiv) {
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			finalizeStreamingText();

			const id = message.subtaskId || '';
			let card = id ? currentAssistantDiv.querySelector('[data-subtask-id="' + cssEscape(id) + '"]') : null;
			if (!card) {
				card = document.createElement('div');
				card.className = 'tool-card sota-subtask-card';
				card.dataset.subtaskId = id;
				const header = document.createElement('div');
				header.className = 'tool-card-header';
				const icon = document.createElement('span');
				icon.className = 'tool-card-icon';
				const name = document.createElement('span');
				name.className = 'tool-card-name';
				const args = document.createElement('span');
				args.className = 'tool-card-args';
				header.appendChild(icon);
				header.appendChild(name);
				header.appendChild(args);
				card.appendChild(header);
				const body = document.createElement('div');
				body.className = 'sota-subtask-body';
				card.appendChild(body);
				currentAssistantDiv.appendChild(card);
			}

			card.dataset.toolStatus = status;
			const iconEl = card.querySelector('.tool-card-icon');
			const nameEl = card.querySelector('.tool-card-name');
			const argsEl = card.querySelector('.tool-card-args');
			const bodyEl = card.querySelector('.sota-subtask-body');

			if (iconEl) {
				iconEl.textContent = status === 'ok' ? '\\u2713' : status === 'error' ? '\\u2717' : '\\u25B6';
			}
			if (nameEl) {
				nameEl.textContent = '@' + (message.assignee || 'anton');
			}
			if (argsEl) {
				argsEl.textContent = message.instruction || message.summary || '';
			}
			if (bodyEl && status === 'error' && message.error) {
				bodyEl.textContent = message.error;
			} else if (bodyEl && status === 'ok' && message.summary) {
				bodyEl.textContent = message.summary;
			}
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Append a streamed token into the body of an in-flight subtask card.
		 * Falls back to the standard streaming text span if the card is
		 * missing — defensive but rare.
		 */
		function appendSubtaskToken(subtaskId, token) {
			if (!currentAssistantDiv) return;
			const id = subtaskId || '';
			const card = id ? currentAssistantDiv.querySelector('[data-subtask-id="' + cssEscape(id) + '"]') : null;
			if (!card) {
				appendStreamingText(token);
				return;
			}
			const body = card.querySelector('.sota-subtask-body');
			if (body) {
				body.textContent = (body.textContent || '') + token;
			}
		}

		/**
		 * Minimal CSS.escape polyfill for selector use. We restrict to the
		 * id shapes the host actually emits (UUIDs / Anthropic tool-use ids)
		 * so a tight allowlist is sufficient.
		 */
		function cssEscape(value) {
			if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
				return CSS.escape(value);
			}
			return String(value).replace(/[^a-zA-Z0-9_\\-]/g, '\\\\$&');
		}

		function updateConnectionUi(status) {
			if (!hdrConn || !hdrConnLabel) {
				return;
			}
			const providers = (status && Array.isArray(status.providers)) ? status.providers : [];
			const connected = providers.filter(p => p && p.connected);
			if (connected.length === 0) {
				hdrConn.hidden = true;
				hdrConnLabel.textContent = '';
				const dot = hdrConn.querySelector('.hdr-conn-dot');
				if (dot) {
					dot.classList.remove('connected');
				}
				return;
			}
			hdrConn.hidden = false;
			const label = connected.length === 1
				? (connected[0].displayName || connected[0].id || '')
				: (connected.length + ' providers');
			hdrConnLabel.textContent = label;
			const dot = hdrConn.querySelector('.hdr-conn-dot');
			if (dot) {
				dot.classList.add('connected');
			}
		}

		/**
		 * Toggle the empty-state between the standard sample-prompts panel
		 * and the sign-in CTA panel based on whether ANY auth source is
		 * available. Defensive: a malformed status falls through to the
		 * ready panel so we never lock the user out of the prompt cards.
		 */
		function updateAuthGate(status) {
			if (!emptyStateReady || !emptyStateAuth) {
				return;
			}
			// Defensive: if the payload is missing both shape markers we treat
			// auth as available rather than locking the user out behind a CTA.
			const hasProviders = status && Array.isArray(status.providers);
			const hasApiKeysShape = status && status.apiKeys && typeof status.apiKeys === 'object';
			if (!hasProviders && !hasApiKeysShape) {
				emptyStateReady.hidden = false;
				emptyStateAuth.hidden = true;
				return;
			}
			const providers = hasProviders ? status.providers : [];
			const apiKeys = hasApiKeysShape ? status.apiKeys : {};
			const hasOAuth = providers.some(p => p && p.connected);
			const hasAnyKey = Boolean(apiKeys.anthropic) || Boolean(apiKeys.openai);
			const ready = hasOAuth || hasAnyKey;
			emptyStateReady.hidden = !ready;
			emptyStateAuth.hidden = ready;
		}

		// Bind sign-in CTA buttons to dispatch the named command back to the
		// host. We attach once at startup because the CTA buttons are part of
		// the static template — they don't get rebuilt per state change.
		document.querySelectorAll('.auth-cta').forEach((btn) => {
			btn.addEventListener('click', () => {
				const cmd = btn.dataset.cmd;
				if (!cmd) {
					return;
				}
				const arg = btn.dataset.cmdArg;
				vscode.postMessage({ type: 'runCommand', command: cmd, arg: arg });
			});
		});
	</script>
</body>
</html>`;
	}

}

/**
 * Convert an AgentPlan into a postMessage-safe payload (plain arrays/objects,
 * no readonly modifiers) so the webview JSON serialiser handles it cleanly.
 */
function serialisePlan(plan: AgentPlan): { subtasks: Array<{ instruction: string; assignee: string; scopeFiles: string[]; dependencies: string[] }> } {
	return {
		subtasks: plan.subtasks.map(s => ({
			instruction: s.instruction,
			assignee: s.assignee,
			scopeFiles: [...s.scopeFiles],
			dependencies: [...s.dependencies],
		})),
	};
}

/**
 * Apply a unified-diff patch to an original text and return the proposed
 * result. Pure function (no I/O) so it's testable in isolation.
 *
 * Supports standard unified diffs with one or more hunks of the form:
 *
 *     @@ -<origStart>,<origLen> +<newStart>,<newLen> @@
 *      context line
 *     -removed line
 *     +added line
 *
 * Hunk lines outside the recognised prefixes (` `, `-`, `+`, `\`) end the
 * current hunk so trailing junk doesn't bleed into the output. A defensive
 * mismatch between a context/removal line and the original file throws,
 * letting the caller surface a meaningful error.
 */
export function applyUnifiedDiff(originalContent: string, diffText: string): string {
	const original = originalContent.split('\n');
	const diffLines = diffText.split('\n');
	const result: string[] = [];
	let cursor = 0; // 0-based index into `original`
	let i = 0;

	while (i < diffLines.length) {
		const line = diffLines[i];
		const hunkHeader = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
		if (!hunkHeader) {
			i++;
			continue;
		}

		const origStart = Math.max(0, parseInt(hunkHeader[1], 10) - 1);
		// Pass through any unchanged lines between the previous hunk and this one.
		while (cursor < origStart && cursor < original.length) {
			result.push(original[cursor++]);
		}
		i++;

		while (i < diffLines.length) {
			const body = diffLines[i];
			if (body.startsWith('@@')) {
				break;
			}
			const prefix = body.charAt(0);
			const content = body.slice(1);
			if (prefix === ' ') {
				if (cursor >= original.length || original[cursor] !== content) {
					throw new Error(`Hunk context mismatch at line ${cursor + 1}`);
				}
				result.push(original[cursor++]);
			} else if (prefix === '-') {
				if (cursor >= original.length || original[cursor] !== content) {
					throw new Error(`Hunk context mismatch at line ${cursor + 1}`);
				}
				cursor++;
			} else if (prefix === '+') {
				result.push(content);
			} else if (prefix === '\\') {
				// e.g. "\ No newline at end of file" — informational, skip.
			} else {
				// Anything else (blank line, narrative text) terminates the hunk.
				break;
			}
			i++;
		}
	}

	// Pass through any trailing original lines beyond the last hunk.
	while (cursor < original.length) {
		result.push(original[cursor++]);
	}

	return result.join('\n');
}

/**
 * Panel-mode entry point preserved for the `sota.openChat` command. Opens the
 * chat as an editor-area webview panel beside the current editor.
 */
export class ChatPanel {
	private static currentPanel: vscode.WebviewPanel | undefined;

	static createOrShow(
		context: vscode.ExtensionContext,
		llmClient: LlmClient,
		toolRegistry: ToolRegistry,
		agentBridge?: AgentBridge,
		workspaceContext?: WorkspaceContextProvider,
	): void {
		if (ChatPanel.currentPanel) {
			ChatPanel.currentPanel.reveal(vscode.ViewColumn.Beside);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sotaChat',
			'Son of Anton Chat',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
				],
			},
		);

		const session = new ChatSession(panel.webview, context.extensionUri, context.workspaceState, llmClient, toolRegistry, agentBridge, workspaceContext);

		panel.onDidDispose(() => {
			session.dispose();
			ChatPanel.currentPanel = undefined;
		});

		ChatPanel.currentPanel = panel;
	}

	static clearConversation(context: vscode.ExtensionContext): void {
		context.workspaceState.update(CONVERSATION_STORAGE_KEY, []);
		for (const session of ACTIVE_SESSIONS) {
			session.clearConversation();
		}
	}
}
