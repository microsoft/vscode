/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConversationStore } from '../chat/ConversationStore';
import { getPersona } from 'son-of-anton-core/chat/personas';
import { BoardSnapshot, BoardTask, SubtaskState, TaskBoardModel } from './TaskBoardModel';

/**
 * Optional hooks the panel calls back into the host with. Wired in
 * `extension.ts` so the orchestrator can react to drag/drop, click
 * actions, and agent-driven board mutations without the board needing
 * direct access to the agent stack.
 */
export interface TaskBoardPanelHandlers {
	/** User clicked a tile — host should reveal that subtask in the chat transcript. */
	readonly revealSubtaskInChat?: (taskId: string) => void;
	/** Drag from `Ready` -> `In Progress`. Host should re-fire `executeSubtask`. */
	readonly dispatchSubtask?: (taskId: string) => void;
	/** Drag tile across columns to change assignee. */
	readonly reassignSubtask?: (taskId: string, newAssignee: string) => void;
	/** User dragged a `Done` tile back to `Ready` and confirmed re-run. */
	readonly rerunSubtask?: (taskId: string) => void;
	/**
	 * Stream an LLM completion through the host on behalf of the embedded
	 * "Talk to the board" chat. Implementations should pump tokens into
	 * `onEvent` until they emit a `complete` or `error` event. Returning a
	 * disposable lets the panel cancel mid-stream if the webview disposes.
	 */
	readonly streamChat?: (
		model: string,
		messages: ReadonlyArray<{ readonly role: 'system' | 'user' | 'assistant'; readonly content: string }>,
		onEvent: (event: ChatStreamEvent) => void,
		tools?: ReadonlyArray<ChatToolDefinition>,
	) => vscode.Disposable;
}

/**
 * Loose tool definition surfaced from the React webview's action registry.
 * Mirrors `LlmClient.ToolDefinition` structurally — kept inline here so the
 * board doesn't pull a core import for a single shape.
 */
export interface ChatToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: 'object';
		readonly properties: Record<string, unknown>;
		readonly required?: ReadonlyArray<string>;
	};
}

export type ChatStreamEvent =
	| { readonly type: 'token'; readonly token: string }
	| { readonly type: 'complete'; readonly fullText: string }
	| { readonly type: 'error'; readonly error: string }
	| { readonly type: 'tool-call'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> };

interface DispatchMessage { type: 'dispatch'; taskId: string }
interface ReassignMessage { type: 'reassign'; taskId: string; newAssignee: string }
interface RerunMessage { type: 'rerun'; taskId: string }
interface RevealMessage { type: 'reveal'; taskId: string }
interface RefreshMessage { type: 'refresh' }
interface BoardActionMessage {
	type: 'board-action';
	action: 'moveCard' | 'addCard' | 'setCardStatus' | 'setCardAssignee' | 'setCardPriority';
	cardId?: string;
	toColumn?: SubtaskState;
	assignee?: string;
	priority?: 'low' | 'medium' | 'high';
	instruction?: string;
}
interface ChatRuntimeMessage {
	type: 'chat-runtime';
	requestId: string;
	model: string;
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
	tools?: Array<ChatToolDefinition>;
}
type IncomingMessage =
	| DispatchMessage
	| ReassignMessage
	| RerunMessage
	| RevealMessage
	| RefreshMessage
	| BoardActionMessage
	| ChatRuntimeMessage;

/** postMessage payloads the webview opaquely receives. */
type WebviewMessage = unknown;

/**
 * Webview panel rendering the kanban board for the active conversation.
 *
 * Single-instance — a second `createOrShow` call reveals the existing
 * panel rather than spawning a new one. The panel subscribes to
 * `TaskBoardModel.onDidChangeBoard` and re-pushes a snapshot to the webview
 * on every change. Ownership flips to the webview's React app via
 * `postMessage`, which the panel routes back through the supplied
 * `TaskBoardPanelHandlers`.
 *
 * The webview itself is a React + CopilotKit app bundled via the
 * `dist/board.js` IIFE produced by `esbuild.board.mts`. The panel only
 * serves a thin HTML stub plus the bundle URI.
 */
export class TaskBoardPanel {
	static readonly VIEW_TYPE = 'sota.taskBoard';
	static currentPanel: TaskBoardPanel | undefined;

	private readonly disposables: vscode.Disposable[] = [];
	private readonly activeChatStreams = new Map<string, vscode.Disposable>();
	private currentConversationId: string | undefined;

	static createOrShow(
		context: vscode.ExtensionContext,
		model: TaskBoardModel,
		conversationStore: ConversationStore,
		handlers: TaskBoardPanelHandlers,
		conversationId?: string,
	): void {
		if (TaskBoardPanel.currentPanel) {
			TaskBoardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
			if (conversationId) {
				TaskBoardPanel.currentPanel.switchConversation(conversationId);
			}
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			TaskBoardPanel.VIEW_TYPE,
			'Son of Anton — Task Board',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
					vscode.Uri.joinPath(context.extensionUri, 'dist'),
				],
			},
		);

		TaskBoardPanel.currentPanel = new TaskBoardPanel(panel, context, model, conversationStore, handlers, conversationId);
	}

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly context: vscode.ExtensionContext,
		private readonly model: TaskBoardModel,
		private readonly conversationStore: ConversationStore,
		private readonly handlers: TaskBoardPanelHandlers,
		initialConversationId: string | undefined,
	) {
		this.currentConversationId = initialConversationId ?? this.pickDefaultConversationId();
		this.panel.webview.html = this.renderHtml();
		this.panel.webview.onDidReceiveMessage(
			(message: WebviewMessage) => { this.handleMessage(message); },
			null,
			this.disposables,
		);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Subscribe to model changes — only redraw if the change applies to the
		// conversation we're currently displaying. Avoids redundant work when
		// many conversations have plans in flight at once.
		this.disposables.push(
			this.model.onDidChangeBoard(({ conversationId }) => {
				if (conversationId === this.currentConversationId) {
					this.pushSnapshot();
				}
			}),
		);

		this.pushSnapshot();
	}

	dispose(): void {
		TaskBoardPanel.currentPanel = undefined;
		// Cancel any chat streams in flight so their disposables release.
		for (const stream of this.activeChatStreams.values()) {
			stream.dispose();
		}
		this.activeChatStreams.clear();
		this.panel.dispose();
		while (this.disposables.length > 0) {
			const d = this.disposables.pop();
			d?.dispose();
		}
	}

	switchConversation(conversationId: string): void {
		this.currentConversationId = conversationId;
		this.pushSnapshot();
	}

	private pickDefaultConversationId(): string | undefined {
		const list = this.conversationStore.list();
		return list.length > 0 ? list[0].id : undefined;
	}

	private handleMessage(raw: WebviewMessage): void {
		const message = raw as Partial<IncomingMessage> | undefined;
		if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
			return;
		}
		switch (message.type) {
			case 'dispatch':
				if (typeof (message as DispatchMessage).taskId === 'string') {
					this.handlers.dispatchSubtask?.((message as DispatchMessage).taskId);
				}
				return;
			case 'reassign': {
				const m = message as ReassignMessage;
				if (typeof m.taskId === 'string' && typeof m.newAssignee === 'string') {
					this.handlers.reassignSubtask?.(m.taskId, m.newAssignee);
				}
				return;
			}
			case 'rerun':
				if (typeof (message as RerunMessage).taskId === 'string') {
					this.handlers.rerunSubtask?.((message as RerunMessage).taskId);
				}
				return;
			case 'reveal':
				if (typeof (message as RevealMessage).taskId === 'string') {
					this.handlers.revealSubtaskInChat?.((message as RevealMessage).taskId);
				}
				return;
			case 'refresh':
				this.pushSnapshot();
				return;
			case 'board-action':
				this.handleBoardAction(message as BoardActionMessage);
				return;
			case 'chat-runtime':
				this.handleChatRuntime(message as ChatRuntimeMessage);
				return;
		}
	}

	/**
	 * Apply an LLM-driven board mutation. The agent surfaces these via
	 * CopilotKit's `useCopilotAction` registrations in the React bundle; we
	 * route them into the same `TaskBoardModel` mutations the user-driven
	 * drag-drop path uses, so the visible board state stays in lockstep.
	 */
	private handleBoardAction(message: BoardActionMessage): void {
		const conversationId = this.currentConversationId;
		if (!conversationId) {
			return;
		}
		switch (message.action) {
			case 'moveCard':
			case 'setCardStatus':
				if (typeof message.cardId === 'string' && typeof message.toColumn === 'string') {
					this.model.updateTask(conversationId, message.cardId, { state: message.toColumn });
					if (message.toColumn === 'in-progress') {
						this.handlers.dispatchSubtask?.(message.cardId);
					}
				}
				return;
			case 'setCardAssignee':
				if (typeof message.cardId === 'string' && typeof message.assignee === 'string') {
					this.handlers.reassignSubtask?.(message.cardId, message.assignee);
				}
				return;
			case 'setCardPriority':
				// Priority is metadata-only today — annotate via summary so the
				// board surfaces it without needing a TaskBoardModel schema change.
				if (typeof message.cardId === 'string' && typeof message.priority === 'string') {
					const snapshot = this.model.getSnapshot(conversationId);
					const existing = snapshot?.tasks.find(t => t.id === message.cardId);
					const note = `priority: ${message.priority}`;
					const summary = existing?.summary ? `${existing.summary} | ${note}` : note;
					this.model.updateTask(conversationId, message.cardId, { summary });
				}
				return;
			case 'addCard': {
				if (typeof message.instruction !== 'string') {
					return;
				}
				const snapshot = this.model.getSnapshot(conversationId);
				const newTask: BoardTask = {
					id: `${conversationId}-llm-${Date.now()}`,
					instruction: message.instruction,
					assignee: message.assignee ?? 'anton',
					scopeFiles: [],
					dependencies: [],
					state: 'backlog',
				};
				const tasks: BoardTask[] = snapshot ? [...snapshot.tasks.map(t => ({ ...t })), newTask] : [newTask];
				this.model.setPlan(conversationId, tasks);
				return;
			}
		}
	}

	/**
	 * Stream an LLM completion on behalf of the embedded chat panel. The
	 * actual LlmClient call lives in `extension.ts` (passed via
	 * `handlers.streamChat`) so this file stays free of LLM-provider plumbing.
	 */
	private handleChatRuntime(message: ChatRuntimeMessage): void {
		if (!this.handlers.streamChat || typeof message.requestId !== 'string') {
			this.panel.webview.postMessage({
				type: 'chat-runtime-chunk',
				requestId: message.requestId,
				event: { type: 'error', error: 'Chat runtime not configured' },
			});
			return;
		}
		// Cancel a previous in-flight stream for the same request id (defensive
		// — webview should never reuse ids, but cheap to enforce).
		this.activeChatStreams.get(message.requestId)?.dispose();
		const handle = this.handlers.streamChat(message.model, message.messages, (event) => {
			this.panel.webview.postMessage({
				type: 'chat-runtime-chunk',
				requestId: message.requestId,
				event,
			});
			if (event.type === 'complete' || event.type === 'error') {
				this.activeChatStreams.delete(message.requestId);
			}
		}, message.tools);
		this.activeChatStreams.set(message.requestId, handle);
	}

	private pushSnapshot(): void {
		const conversationId = this.currentConversationId;
		const snapshot: BoardSnapshot | undefined = conversationId
			? this.model.getSnapshot(conversationId)
			: undefined;
		const conversationTitle = conversationId
			? this.conversationStore.list().find(s => s.id === conversationId)?.title ?? '(untitled)'
			: '(no conversation)';
		this.panel.webview.postMessage({
			type: 'snapshot',
			conversationId: conversationId ?? null,
			conversationTitle,
			snapshot: snapshot ? this.serializeSnapshot(snapshot) : null,
			personas: this.serializePersonas(snapshot),
		});
	}

	/**
	 * Strip the readonly arrays / undefined fields out of the snapshot for
	 * structured cloning across postMessage. The webview reconstructs view-
	 * model objects from this shape directly.
	 */
	private serializeSnapshot(snapshot: BoardSnapshot): unknown {
		return {
			conversationId: snapshot.conversationId,
			createdAt: snapshot.createdAt,
			tasks: snapshot.tasks.map((t: BoardTask) => ({
				id: t.id,
				instruction: t.instruction,
				assignee: t.assignee,
				scopeFiles: [...t.scopeFiles],
				dependencies: [...t.dependencies],
				state: t.state,
				startedAt: t.startedAt,
				finishedAt: t.finishedAt,
				summary: t.summary,
				tokenUsage: t.tokenUsage,
			})),
		};
	}

	/**
	 * Provide every persona referenced by the current board so the webview
	 * can colour avatars without a second round-trip. Falls back to a
	 * generic '?' persona when an assignee has no registered persona (e.g.
	 * a reassignment to an as-yet-unknown handle).
	 */
	private serializePersonas(snapshot: BoardSnapshot | undefined): unknown {
		if (!snapshot) {
			return [];
		}
		const seen = new Set<string>();
		const result: Array<{ id: string; monogram: string; accent: string; tagline: string }> = [];
		for (const task of snapshot.tasks) {
			if (seen.has(task.assignee)) {
				continue;
			}
			seen.add(task.assignee);
			const persona = getPersona(task.assignee);
			result.push({
				id: task.assignee,
				monogram: persona?.monogram ?? '?',
				accent: persona?.accent ?? 'var(--vscode-descriptionForeground)',
				tagline: persona?.tagline ?? '',
			});
		}
		return result;
	}

	/**
	 * The webview HTML is now a thin shell: just a #root div + the React
	 * bundle. CSP allows `unsafe-inline` styles because CopilotKit injects
	 * styles directly into <style> tags at runtime — there's no way around
	 * that without forking the library. Scripts remain nonce-gated.
	 */
	private renderHtml(): string {
		const cspSource = this.panel.webview.cspSource;
		const nonce = randomNonce();
		const boardJsUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'board.js'),
		);
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource} data:;" />
	<title>Task Board</title>
	<style>
		html, body, #root { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
	</style>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${boardJsUri}"></script>
</body>
</html>`;
	}
}

/**
 * Generate a 32-char alphanumeric nonce per render. Random-per-load nonces
 * are mandatory for the panel's CSP — re-using a hardcoded value would let a
 * compromised webview re-inject scripts. Phase 51 standardised this pattern
 * across panels.
 */
function randomNonce(): string {
	let nonce = '';
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
