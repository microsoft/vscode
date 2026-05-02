/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { getBackendClient } from './services/backendClient';
import { getChatWebviewHtml } from './webview/chat';
import type { ChatActivityItem, ChatInitialState, WebviewInboundMessage } from './webview/chat/types';
import { getOrchestrationWebSocket, type WebSocketMessage } from './services/websocketClient';

type ChatSessionRecord = {
	id: string;
	name: string;
	messages: Array<{ role: 'user' | 'assistant'; content: string }>;
	createdAt: number;
	memoryWorkspaceId?: string;
	memoryWorkspacePath?: string;
};

export class ChatPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'nexora.chatPanel';
	private _view?: vscode.WebviewView;
	private _wsUnsubscribe?: () => void;
	private _currentPlanId?: string;

	private readonly _context: vscode.ExtensionContext;
	private _sessions: ChatSessionRecord[] = [];
	private _activeSessionId: string = '';

	constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
		this._context = context;
		this._loadSessions();
	}

	private _loadSessions(): void {
		const storedSessions = this._context.globalState.get<any[]>('nexora.chatSessions', []);
		const storedActive = this._context.globalState.get<string>('nexora.activeSessionId', '');

		this._sessions = Array.isArray(storedSessions) ? storedSessions.map(s => this._coerceSession(s)) : [];
		this._activeSessionId = typeof storedActive === 'string' ? storedActive : '';

		if (this._sessions.length === 0) {
			const id = `s-${Date.now()}`;
			this._sessions = [{
				id,
				name: 'Chat 1',
				messages: [],
				createdAt: Date.now()
			}];
			this._activeSessionId = id;
			void this._persistSessions();
		} else if (!this._activeSessionId || !this._sessions.some(s => s.id === this._activeSessionId)) {
			this._activeSessionId = this._sessions[0].id;
			void this._persistSessions();
		}
	}

	private _coerceSession(raw: any): ChatSessionRecord {
		const messages = Array.isArray(raw?.messages) ? raw.messages : [];
		return {
			id: String(raw?.id || `s-${Date.now()}`),
			name: String(raw?.name || 'Chat'),
			messages,
			createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
			memoryWorkspaceId: typeof raw?.memoryWorkspaceId === 'string' ? raw.memoryWorkspaceId : undefined,
			memoryWorkspacePath: typeof raw?.memoryWorkspacePath === 'string' ? raw.memoryWorkspacePath : undefined
		};
	}

	private async _persistSessions(): Promise<void> {
		await this._context.globalState.update('nexora.chatSessions', this._sessions);
		await this._context.globalState.update('nexora.activeSessionId', this._activeSessionId);
	}

	private _getActiveSession() {
		return this._sessions.find(s => s.id === this._activeSessionId);
	}

	private _sessionSummaries() {
		return this._sessions.map(s => ({ id: s.id, name: s.name }));
	}

	private async _broadcastSessions(): Promise<void> {
		if (!this._view) {
			return;
		}
		this._view.webview.postMessage({
			type: 'updateSessions',
			sessions: this._sessionSummaries(),
			activeSessionId: this._activeSessionId
		});
	}

	/** Re-sync webview message list from in-memory session (e.g. after sidebar visibility changes). */
	private _pushActiveSessionToWebview(): void {
		const session = this._getActiveSession();
		if (!this._view || !session) {
			return;
		}
		this._view.webview.postMessage({
			type: 'loadSession',
			sessionId: session.id,
			messages: session.messages ? [...session.messages] : []
		});
	}

	private _emitChatActivity(items: ChatActivityItem[]): void {
		if (!this._view) {
			return;
		}
		this._view.webview.postMessage({ type: 'chatActivity', items });
	}

	private _clearChatActivity(): void {
		if (!this._view) {
			return;
		}
		this._view.webview.postMessage({ type: 'chatActivityClear' });
	}

	private async _appendAssistantToSession(content: string): Promise<void> {
		const session = this._getActiveSession();
		if (!session) {
			return;
		}
		session.messages.push({ role: 'assistant', content });
		await this._persistSessions();
	}

	private _mapUiModelToLiteLlm(model?: string): string | undefined {
		const modelMap: Record<string, string> = {
			'claude-haiku': 'anthropic/claude-3-haiku-20240307',
			'claude-sonnet': 'anthropic/claude-3-5-sonnet-20241022',
			'gpt-4o-mini': 'openai/gpt-4o-mini',
			'gpt-4o': 'openai/gpt-4o'
		};
		const raw = (model || '').trim();
		if (!raw) {
			return undefined;
		}
		return modelMap[raw] || raw;
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		// `retainContextWhenHidden` keeps the webview alive when switching Activity Bar views.
		// Some @types versions don't include it on `WebviewOptions`, but VS Code supports it at runtime.
		const webviewOpts: vscode.WebviewOptions & { retainContextWhenHidden?: boolean } = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
			retainContextWhenHidden: true
		};
		webviewView.webview.options = webviewOpts;

		const initialState: ChatInitialState = {
			connected: false,
			auth: { github: false, vercel: false },
			messages: this._getActiveSession()?.messages || [],
			sessions: this._sessionSummaries(),
			activeSessionId: this._activeSessionId
		};

		webviewView.webview.html = getChatWebviewHtml(
			webviewView.webview,
			this._extensionUri,
			initialState
		);

		webviewView.onDidChangeVisibility(() => {
			if (!webviewView.visible) {
				return;
			}
			this._pushActiveSessionToWebview();
			void this._broadcastSessions();
		});

		webviewView.webview.onDidReceiveMessage(async (data: WebviewInboundMessage) => {
			if (data.type === 'chatWebviewReady') {
				this._pushActiveSessionToWebview();
				void this._broadcastSessions();
				return;
			}
			if (data.type === 'sendMessage') {
				await this._handleUserMessage(data.message, data.model);
			} else if (data.type === 'askWorkspace') {
				await this._handleAskWorkspaceMessage(data.message, data.model);
			} else if (data.type === 'newSession') {
				await this._handleNewSession();
			} else if (data.type === 'switchSession') {
				await this._handleSwitchSession(data.sessionId);
			} else if (data.type === 'deleteSession') {
				await this._handleDeleteSession(data.sessionId);
			} else if (data.type === 'checkBackend') {
				await this._checkBackendStatus();
			} else if (data.type === 'generateCode') {
				await this._handleCodeGeneration(data.prompt, data.connector);
			} else if (data.type === 'connectGitHub') {
				await this._handleGitHubConnect();
			} else if (data.type === 'connectVercel') {
				await this._handleVercelConnect();
			} else if (data.type === 'deployProject') {
				await this._handleDeployment(data.prompt, data.repoName, data.projectName);
			} else if (data.type === 'checkAuthStatus') {
				await this._checkAuthStatus();
			} else if (data.type === 'generatePlan') {
				await this._handlePlanGeneration(data.request, data.model);
			} else if (data.type === 'approvePlan') {
				await this._handleApprovePlan(data.planId);
			} else if (data.type === 'cancelPlan') {
				await this._handleCancelPlan(data.planId);
			} else if (data.type === 'modifyPlan') {
				await this._handleModifyPlan(data.planId, data.modification);
			} else if (data.type === 'getHistory') {
				await this._handleGetHistory();
			} else if (data.type === 'getRollbackable') {
				await this._handleGetRollbackable();
			} else if (data.type === 'rollback') {
				await this._handleRollback(data.historyId);
			} else if (data.type === 'browsePlatforms') {
				await this._handleBrowsePlatforms();
			} else if (data.type === 'indexWorkspace') {
				await this._handleIndexWorkspace();
			} else if (data.type === 'executeRequest') {
				await this._handleExecuteRequest(data.request, data.model);
			} else if (data.type === 'runAgent') {
				await this._handleRunAgent(data.request, data.model);
			}
		});

		this._checkBackendStatus();
		this._checkAuthStatus();
		this._setupWebSocketListener();
		void this._broadcastSessions();
	}

	private async _handleNewSession(): Promise<void> {
		const nextIndex = this._sessions.length + 1;
		const id = `s-${Date.now()}`;
		this._sessions.unshift({
			id,
			name: `Chat ${nextIndex}`,
			messages: [],
			createdAt: Date.now()
		});
		this._activeSessionId = id;
		await this._persistSessions();
		await this._broadcastSessions();
		if (this._view) {
			this._view.webview.postMessage({
				type: 'loadSession',
				sessionId: id,
				messages: []
			});
		}
	}

	private async _handleSwitchSession(sessionId: string): Promise<void> {
		if (!sessionId || !this._sessions.some(s => s.id === sessionId)) {
			return;
		}
		this._activeSessionId = sessionId;
		await this._persistSessions();
		await this._broadcastSessions();
		const session = this._getActiveSession();
		if (this._view && session) {
			this._view.webview.postMessage({
				type: 'loadSession',
				sessionId: session.id,
				messages: session.messages || []
			});
		}
	}

	private async _handleDeleteSession(sessionId: string): Promise<void> {
		if (!sessionId || !this._sessions.some(s => s.id === sessionId)) {
			return;
		}

		this._sessions = this._sessions.filter(s => s.id !== sessionId);

		if (this._sessions.length === 0) {
			const id = `s-${Date.now()}`;
			this._sessions = [{
				id,
				name: 'Chat 1',
				messages: [],
				createdAt: Date.now()
			}];
			this._activeSessionId = id;
		} else if (this._activeSessionId === sessionId) {
			this._activeSessionId = this._sessions[0].id;
		}

		await this._persistSessions();
		await this._broadcastSessions();

		const session = this._getActiveSession();
		if (this._view && session) {
			this._view.webview.postMessage({
				type: 'loadSession',
				sessionId: session.id,
				messages: session.messages || []
			});
		}
	}

	private _setupWebSocketListener(): void {
		const wsClient = getOrchestrationWebSocket('default');

		// Ensure connected
		if (!wsClient.isConnected()) {
			wsClient.connect();
		}

		// Subscribe to WebSocket messages and forward to webview
		this._wsUnsubscribe = wsClient.onMessage((message: WebSocketMessage) => {
			if (!this._view) {
				return;
			}

			// Forward task updates to webview
			if (message.type === 'task_running' || message.type === 'task_success' || message.type === 'task_failed' || message.type === 'task_skipped') {
				this._view.webview.postMessage({
					type: 'taskUpdate',
					planId: message.plan_id,
					taskId: message.task_id,
					taskName: message.task_name,
					status: message.type.replace('task_', ''),
					result: message.result,
					error: message.error,
					cost: message.cost
				});
			}

			// Forward plan completion to webview
			if (message.type === 'plan_completed') {
				this._view.webview.postMessage({
					type: 'planCompleted',
					planId: message.plan_id,
					status: message.status,
					actualCost: message.actual_cost || 0
				});
			}

			// Forward retry notifications to webview
			if (message.type === 'task_retry') {
				this._view.webview.postMessage({
					type: 'taskRetry',
					planId: message.plan_id,
					taskId: message.task_id,
					taskName: message.task_name,
					attempt: message.attempt,
					maxAttempts: message.max_attempts,
					platform: message.platform
				});
			}
		});
	}

	// Webview HTML is now provided by `src/webview/chat/*`.
	// (legacy `_getHtmlContent()` remains but is no longer used.)

	private async _checkBackendStatus(): Promise<void> {
		const client = getBackendClient();
		const isConnected = await client.checkHealth();

		if (this._view) {
			this._view.webview.postMessage({
				type: 'backendStatus',
				connected: isConnected
			});
		}
	}

	private async _handleUserMessage(message: string, model?: string): Promise<void> {
		if (!this._view) {
			return;
		}

		const session = this._getActiveSession();
		if (session) {
			session.messages.push({ role: 'user', content: message });
			await this._persistSessions();
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: 'Thinking...',
			isLoading: true
		});

		this._emitChatActivity([
			{ id: 'backend', label: 'Checking Nexora backend...', done: false },
			{ id: 'model', label: 'Calling chat model...', done: false }
		]);

		try {
			const client = getBackendClient();
			const isConnected = await client.checkHealth();

			if (!isConnected) {
				this._clearChatActivity();
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: `Backend is offline. Your message: "${message}"\n\nPlease start the backend server and try again.`,
					isLoading: false
				});
				return;
			}

			this._emitChatActivity([
				{ id: 'backend', label: 'Checking Nexora backend...', done: true },
				{ id: 'model', label: 'Calling chat model...', done: false }
			]);

			// Get workspace path for context
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const workspacePath = workspaceFolders && workspaceFolders.length > 0
				? workspaceFolders[0].uri.fsPath
				: undefined;

			const llmModel = this._mapUiModelToLiteLlm(model);

			// Simple chat - no task decomposition
			const chatResponse = await client.chat(message, workspacePath, llmModel);

			const sessionAfter = this._getActiveSession();
			if (sessionAfter) {
				sessionAfter.messages.push({ role: 'assistant', content: chatResponse.response });
				await this._persistSessions();
			}

			this._clearChatActivity();
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: chatResponse.response,
				isLoading: false
			});

		} catch (error) {
			const errText = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			const sessionAfter = this._getActiveSession();
			if (sessionAfter) {
				sessionAfter.messages.push({ role: 'assistant', content: errText });
				await this._persistSessions();
			}
			this._clearChatActivity();
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: errText,
				isLoading: false
			});
		}
	}

	private async _handleAskWorkspaceMessage(message: string, model?: string): Promise<void> {
		if (!this._view) {
			return;
		}

		const session = this._getActiveSession();
		if (session) {
			session.messages.push({ role: 'user', content: message });
			await this._persistSessions();
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: 'Searching workspace memory...',
			isLoading: true
		});

		this._emitChatActivity([{ id: 'backend', label: 'Checking Nexora backend...', done: false }]);

		try {
			const client = getBackendClient();
			const isConnected = await client.checkHealth();
			if (!isConnected) {
				this._clearChatActivity();
				const offline = `Backend is offline. Your question: "${message}"\n\nPlease start the backend server and try again.`;
				const s0 = this._getActiveSession();
				if (s0) {
					s0.messages.push({ role: 'assistant', content: offline });
					await this._persistSessions();
				}
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: offline,
					isLoading: false
				});
				return;
			}

			this._emitChatActivity([
				{ id: 'backend', label: 'Checking Nexora backend...', done: true },
				{ id: 'folder', label: 'Checking workspace folder...', done: false }
			]);

			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				this._clearChatActivity();
				const noFolder = 'No workspace folder open. Open a folder, then use **Index Workspace** before Ask mode.';
				const s1 = this._getActiveSession();
				if (s1) {
					s1.messages.push({ role: 'assistant', content: noFolder });
					await this._persistSessions();
				}
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: noFolder,
					isLoading: false
				});
				return;
			}

			this._emitChatActivity([
				{ id: 'backend', label: 'Checking Nexora backend...', done: true },
				{ id: 'folder', label: 'Checking workspace folder...', done: true },
				{ id: 'workspaceId', label: 'Resolving workspace memory id...', done: false }
			]);

			const workspacePath = workspaceFolders[0].uri.fsPath;
			const active = this._getActiveSession();

			let workspaceId = active?.memoryWorkspaceId;
			if (!workspaceId) {
				const mapped = await client.getWorkspaceIdForPath(workspacePath).catch(() => undefined);
				workspaceId = mapped?.workspace_id;
				if (active && workspaceId) {
					active.memoryWorkspaceId = workspaceId;
					active.memoryWorkspacePath = workspacePath;
					await this._persistSessions();
				}
			}

			if (!workspaceId) {
				this._clearChatActivity();
				const notIndexed =
					'This workspace is not indexed yet (no `workspace_id` found).\n\n' +
					'Click **Index Workspace** in the welcome screen, then try Ask mode again.';
				const s2 = this._getActiveSession();
				if (s2) {
					s2.messages.push({ role: 'assistant', content: notIndexed });
					await this._persistSessions();
				}
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: notIndexed,
					isLoading: false
				});
				return;
			}

			this._emitChatActivity([
				{ id: 'backend', label: 'Checking Nexora backend...', done: true },
				{ id: 'folder', label: 'Checking workspace folder...', done: true },
				{ id: 'workspaceId', label: 'Resolving workspace memory id...', done: true },
				{ id: 'memory', label: 'Querying workspace memory...', done: false }
			]);

			let mem: any;
			try {
				mem = await client.queryMemory(workspaceId, message, 8);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				const qErr =
					`Could not query workspace memory for \`${workspaceId}\`.\n\n` +
					`Details: ${msg}\n\n` +
					'Most commonly this means the `.mv2` file is missing - click **Index Workspace** and try again.';
				const s3 = this._getActiveSession();
				if (s3) {
					s3.messages.push({ role: 'assistant', content: qErr });
					await this._persistSessions();
				}
				this._clearChatActivity();
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: qErr,
					isLoading: false
				});
				return;
			}
			let entries: any[] = Array.isArray(mem?.entries) ? mem.entries : [];
			let contextSource = 'memvid_query';

			if (entries.length === 0) {
				const altQueries = this._buildAskMemoryQueries(message);
				for (const q of altQueries) {
					if (!q || q === message) {
						continue;
					}
					try {
						const m2 = await client.queryMemory(workspaceId, q, 10);
						const e2 = Array.isArray(m2?.entries) ? m2.entries : [];
						if (e2.length > 0) {
							entries = e2;
							contextSource = `memvid_query_retry:${q}`;
							break;
						}
					} catch {
						// ignore and continue fallbacks
					}
				}
			}

			if (entries.length === 0) {
				try {
					const tc = await client.getTaskContext(workspaceId, message);
					const snippets = Array.isArray(tc?.code_snippets) ? tc.code_snippets : [];
					const files = Array.isArray(tc?.relevant_files) ? tc.relevant_files : [];
					if (snippets.length > 0) {
						let ctx = '';
						for (let i = 0; i < snippets.length; i++) {
							const fp = files[i] || 'unknown';
							const snip = String(snippets[i] || '').slice(0, 900);
							ctx += `\n### Context ${i + 1}: ${fp}\n${snip}\n`;
						}
						entries = [{ metadata: { file_path: 'task_context' }, content: ctx }];
						contextSource = 'memvid_task_context';
					}
				} catch {
					// ignore
				}
			}

			let diskReadNote = '';
			if (entries.length === 0) {
				const names = this._extractLikelyFilenames(message);
				if (names.length === 1) {
					const read = await this._readWorkspaceFileByName(workspacePath, names[0]!);
					const readAmb = read !== null ? (read as { ambiguous?: string[] }).ambiguous : undefined;
					if (read !== null && Array.isArray(readAmb)) {
						const listed = readAmb.map(p => `- \`${p}\``).join('\n');
						const ambMsg =
							`I found multiple files named like \`${names[0]}\`. Which one did you mean?\n\n${listed}\n\n` +
							`Reply with the full relative path (from the workspace root).`;
						const sAmb = this._getActiveSession();
						if (sAmb) {
							sAmb.messages.push({ role: 'assistant', content: ambMsg });
							await this._persistSessions();
						}
						this._clearChatActivity();
						this._view.webview.postMessage({
							type: 'addMessage',
							role: 'assistant',
							content: ambMsg,
							isLoading: false
						});
						return;
					}
					const readRes = read !== null ? (read as { resolvedPath?: string; contents?: string }) : undefined;
					if (
						readRes &&
						typeof readRes.resolvedPath === 'string' &&
						typeof readRes.contents === 'string'
					) {
						entries = [{
							metadata: { file_path: readRes.resolvedPath },
							content: readRes.contents
						}];
						contextSource = 'workspace_file_read';
						diskReadNote =
							`\nNOTE: Memvid returned 0 lexical hits for the original question, so the extension read this file directly from disk:\n` +
							`- \`${readRes.resolvedPath}\`\n`;
					}
				}
			}

			if (entries.length === 0) {
				const noHits =
					'No matches were found in indexed memory for that question (Memvid lexical search returned 0 hits).\n\n' +
					'Try asking with a **filename** (e.g. `app/main.py`) or a **symbol name** from the code. If you changed files, click **Index Workspace** again.';
				const s4 = this._getActiveSession();
				if (s4) {
					s4.messages.push({ role: 'assistant', content: noHits });
					await this._persistSessions();
				}
				this._clearChatActivity();
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: noHits,
					isLoading: false
				});
				return;
			}

			this._emitChatActivity([
				{ id: 'backend', label: 'Checking Nexora backend...', done: true },
				{ id: 'folder', label: 'Checking workspace folder...', done: true },
				{ id: 'workspaceId', label: 'Resolving workspace memory id...', done: true },
				{ id: 'memory', label: 'Querying workspace memory...', done: true },
				{ id: 'model', label: 'Calling chat model...', done: false }
			]);

			let context = '';
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i];
				const fp = e?.metadata?.file_path || 'unknown';
				const maxSnip = contextSource === 'workspace_file_read' ? 12000 : 900;
				const snip = String(e?.content || '').slice(0, maxSnip);
				context += `\n### Hit ${i + 1}: ${fp}\n${snip}\n`;
			}

			const composed =
				`You are Nexora. Answer the user's question using ONLY the retrieved workspace snippets below.\n` +
				`If the snippets are insufficient, say what is missing and which files/paths you would need.\n` +
				`Cite paths when you use them.\n\n` +
				`USER QUESTION:\n${message}\n\n` +
				`CONTEXT SOURCE: ${contextSource}\n` +
				diskReadNote +
				`RETRIEVED WORKSPACE SNIPPETS:\n${context}`;

			const llmModel = this._mapUiModelToLiteLlm(model);
			const chatResponse = await client.chat(composed, workspacePath, llmModel);

			const sessionAfter = this._getActiveSession();
			if (sessionAfter) {
				sessionAfter.messages.push({ role: 'assistant', content: chatResponse.response });
				await this._persistSessions();
			}

			this._clearChatActivity();
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: chatResponse.response,
				isLoading: false
			});
		} catch (error) {
			const errText = `Ask mode error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			const sessionAfter = this._getActiveSession();
			if (sessionAfter) {
				sessionAfter.messages.push({ role: 'assistant', content: errText });
				await this._persistSessions();
			}
			this._clearChatActivity();
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: errText,
				isLoading: false
			});
		}
	}

	private _buildAskMemoryQueries(message: string): string[] {
		const normalized = String(message || '').replace(/\s+\./g, '.');
		const tokens = normalized
			.split(/[^a-zA-Z0-9_.\/-]+/g)
			.map(t => t.trim())
			.filter(Boolean);

		const uniq: string[] = [];
		const push = (q: string) => {
			const s = String(q || '').trim();
			if (!s) {
				return;
			}
			if (!uniq.includes(s)) {
				uniq.push(s);
			}
		};

		for (const t of tokens) {
			if (t.length >= 3) {
				push(t);
			}
		}

		for (const t of tokens) {
			if (t.includes('.')) {
				push(path.basename(t));
				push(path.basename(t).replace(/\.[^.]+$/, ''));
			}
		}

		return uniq.slice(0, 12);
	}

	private _extractLikelyFilenames(message: string): string[] {
		const text = String(message || '').replace(/\s+\./g, '.');
		const exts = ['py', 'ts', 'tsx', 'js', 'jsx', 'java', 'go', 'rs', 'cs', 'cpp', 'c', 'h', 'md', 'json', 'yml', 'yaml', 'toml'];
		const extRe = exts.join('|');
		const re = new RegExp(`([\\w .-]+?\\.(?:${extRe}))`, 'gi');
		const out: string[] = [];
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			const name = m[1].replace(/\s+/g, ' ').trim();
			if (name && !out.includes(name)) {
				out.push(name);
			}
		}
		return out.slice(0, 3);
	}

	private _isPathInsideWorkspaceRoot(workspaceRoot: string, candidatePath: string): boolean {
		const root = path.resolve(workspaceRoot);
		const cand = path.resolve(candidatePath);
		if (process.platform === 'win32') {
			return cand.toLowerCase().startsWith(root.toLowerCase() + path.sep) || cand.toLowerCase() === root.toLowerCase();
		}
		return cand.startsWith(root + path.sep) || cand === root;
	}

	private async _readWorkspaceFileByName(
		workspaceRoot: string,
		filename: string
	): Promise<{ resolvedPath: string; contents: string } | { ambiguous: string[] } | null> {
		const direct = path.resolve(workspaceRoot, filename);
		if (this._isPathInsideWorkspaceRoot(workspaceRoot, direct)) {
			try {
				const stat = await fs.stat(direct);
				if (stat.isFile()) {
					const buf = await fs.readFile(direct);
					const contents = buf.toString('utf8');
					return { resolvedPath: direct, contents };
				}
			} catch {
				// fall through to search
			}
		}

		const base = path.basename(filename);
		const matches = await vscode.workspace.findFiles(`**/${base}`, '**/node_modules/**', 25);
		const underRoot = matches
			.map(u => u.fsPath)
			.filter(p => this._isPathInsideWorkspaceRoot(workspaceRoot, p));

		if (underRoot.length === 1) {
			const p = underRoot[0];
			const buf = await fs.readFile(p);
			return { resolvedPath: p, contents: buf.toString('utf8') };
		}
		if (underRoot.length > 1) {
			return { ambiguous: underRoot };
		}
		return null;
	}

	private async _handleCodeGeneration(prompt: string, connector: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: `Generating code with ${connector}...`,
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const isConnected = await client.checkHealth();

			if (!isConnected) {
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: 'Backend is offline. Please start the backend server and try again.',
					isLoading: false
				});
				return;
			}

			const config = connector === 'openai'
				? { model: 'gpt-4o-mini' }
				: { model: 'claude-3-haiku-20240307' };

			const result = await client.executeConnector(
				connector,
				'generate',
				{ prompt },
				config
			);

			if (result.success && result.data?.content) {
				const usage = result.usage;
				const costStr = usage.estimated_cost > 0
					? `$${usage.estimated_cost.toFixed(6)}`
					: 'free';
				const modelName = connector === 'openai' ? 'GPT-4o-mini' : 'Claude-3-Haiku';

				let response = `**${modelName}** generated in ${result.duration_ms}ms\n\n`;
				response += '```\n' + result.data.content + '\n```\n\n';
				response += ` **${usage.input_tokens}** in -> **${usage.output_tokens}** out | ${costStr}`;

				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: response,
					isLoading: false
				});
			} else {
				const errorMsg = result.error || 'Unknown error during code generation';
				let response = `**Generation Failed**\n\n`;
				response += `\`${errorMsg}\`\n\n`;
				response += `**Troubleshooting:**\n`;
				response += `- Check API key is set in \`.env\`\n`;
				response += `- OpenAI: \`OPENAI_API_KEY\`\n`;
				response += `- Anthropic: \`ANTHROPIC_API_KEY\``;

				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: response,
					isLoading: false
				});
			}
		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _checkAuthStatus(): Promise<void> {
		if (!this._view) {
			return;
		}

		const client = getBackendClient();
		const status = await client.getAuthStatus();

		this._view.webview.postMessage({
			type: 'authStatus',
			github: status.github_connected,
			vercel: status.vercel_connected
		});
	}

	private async _handleGitHubConnect(): Promise<void> {
		if (!this._view) {
			return;
		}

		const client = getBackendClient();
		const result = await client.getGitHubAuthUrl();

		if (result && result.authorization_url) {
			vscode.env.openExternal(vscode.Uri.parse(result.authorization_url));

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: 'Opening GitHub authorization page in your browser. Please authorize Nexora and then come back here.',
				isLoading: false
			});

			// Check status after a delay
			setTimeout(() => this._checkAuthStatus(), 5000);
		} else {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: 'Failed to get GitHub authorization URL. Please check backend configuration.',
				isLoading: false
			});
		}
	}

	private async _handleVercelConnect(): Promise<void> {
		if (!this._view) {
			return;
		}

		const client = getBackendClient();
		const result = await client.getVercelAuthUrl();

		if (result && result.authorization_url) {
			vscode.env.openExternal(vscode.Uri.parse(result.authorization_url));

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: 'Opening Vercel authorization page in your browser. Please authorize Nexora and then come back here.',
				isLoading: false
			});

			// Check status after a delay
			setTimeout(() => this._checkAuthStatus(), 5000);
		} else {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: 'Failed to get Vercel authorization URL. Please check backend configuration.',
				isLoading: false
			});
		}
	}

	private async _handleDeployment(prompt: string, repoName: string, projectName: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: '**Starting Deployment Pipeline**\n\nStep 1/3: Generating code with LLM...',
			isLoading: true
		});

		try {
			const client = getBackendClient();

			// Check OAuth status first
			const authStatus = await client.getAuthStatus();

			if (!authStatus.github_connected || !authStatus.vercel_connected) {
				let errorMsg = '**Deployment Failed**\n\n';
				errorMsg += 'OAuth connections required:\n';
				if (!authStatus.github_connected) {
					errorMsg += '- [ ] GitHub (click GH badge to connect)\n';
				} else {
					errorMsg += '- [x] GitHub connected\n';
				}
				if (!authStatus.vercel_connected) {
					errorMsg += '- [ ] Vercel (click Vc badge to connect)\n';
				} else {
					errorMsg += '- [x] Vercel connected\n';
				}

				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: errorMsg,
					isLoading: false
				});
				return;
			}

			// Execute deployment pipeline
			const result = await client.deployGeneratedCode(prompt, repoName, projectName);

			let response = '**Deployment Pipeline Result**\n\n';

			// Show each step with details
			for (const step of result.steps) {
				const icon = step.success ? '[ok]' : '[fail]';
				const stepName = step.step === 'generate' ? 'Generate Code' :
					step.step === 'github' ? 'Push to GitHub' :
						step.step === 'vercel' ? 'Deploy to Vercel' :
							step.step;

				response += `${icon} **${stepName}**: ${step.success ? 'Success' : 'Failed'}\n`;

				if (step.success && step.data) {
					// Show step-specific details
					if (step.step === 'generate' && step.data.length) {
						response += `   Generated ${step.data.length} characters of code\n`;
						if (step.data.cost) {
							response += `   Cost: $${step.data.cost.toFixed(6)}\n`;
						}
					} else if (step.step === 'github' && step.data.repo_url) {
						response += `   Repo: ${step.data.repo_url}\n`;
						if (step.data.commit_sha) {
							response += `   Commit: ${step.data.commit_sha.substring(0, 7)}\n`;
						}
					} else if (step.step === 'vercel' && step.data.url) {
						response += `   URL: https://${step.data.url}\n`;
					}
				}

				if (step.error) {
					response += `   **Error:** ${step.error}\n`;
				}
				response += '\n';
			}

			if (result.success && result.deployment_url) {
				response += `**Deployment successful**\n\n`;
				response += `**Live URL:** ${result.deployment_url}\n\n`;
				response += `Your application is now live. Click the URL to open it.`;
			} else {
				response += `**Deployment Failed**\n\n`;
				response += `Please check the errors above and try again.`;
			}

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: response,
				isLoading: false
			});
		} catch (error) {
			let errorMsg = `**Deployment Error**\n\n`;

			if (error instanceof Error) {
				if (error.message.includes('401')) {
					errorMsg += 'OAuth authentication required. Please connect GitHub and Vercel.\n\n';
					errorMsg += 'Click the GH and Vc badges in the status bar to connect.';
				} else if (error.message.includes('400')) {
					errorMsg += 'Invalid request. Check repo name and project name format.\n\n';
					errorMsg += 'Use only alphanumeric characters, hyphens, and underscores.';
				} else {
					errorMsg += `Error: ${error.message}\n\n`;
					errorMsg += 'Make sure the backend is running and try again.';
				}
			} else {
				errorMsg += 'Unknown error occurred during deployment.';
			}

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: errorMsg,
				isLoading: false
			});
		}
	}

	private async _handlePlanGeneration(request: string, model?: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: 'Generating execution plan...',
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const workspacePath = workspaceFolders && workspaceFolders.length > 0
				? workspaceFolders[0].uri.fsPath
				: undefined;

			const llmModel = this._mapUiModelToLiteLlm(model);
			const plan = await client.generatePlan(request, 'default', workspacePath, llmModel);

			// Store current plan ID and subscribe to WebSocket updates
			this._currentPlanId = plan.plan_id;
			const wsClient = getOrchestrationWebSocket('default');
			if (wsClient.isConnected()) {
				wsClient.subscribeToPlan(plan.plan_id);
			}

			// Send plan to webview with approval UI
			this._view.webview.postMessage({
				type: 'showPlanApproval',
				plan: plan
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error generating plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleApprovePlan(planId: string): Promise<void> {
		if (!this._view) {
			return;
		}

		// Subscribe to WebSocket for real-time updates
		const wsClient = getOrchestrationWebSocket('default');
		if (!wsClient.isConnected()) {
			await wsClient.connect();
		}
		wsClient.subscribeToPlan(planId);

		// Notify webview that execution is starting
		this._view.webview.postMessage({
			type: 'planExecutionStarted',
			planId: planId
		});

		try {
			const client = getBackendClient();
			// This will trigger execution - WebSocket will send real-time updates
			const result = await client.approvePlan(planId);

			// Final result (WebSocket may have already sent updates, but this is the definitive result)
			this._view.webview.postMessage({
				type: 'planExecutionComplete',
				planId: planId,
				status: result.status,
				tasks: result.tasks,
				actualCost: result.actual_cost
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error executing plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleCancelPlan(planId: string): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			const client = getBackendClient();
			const result = await client.cancelPlan(planId);

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Plan ${planId} cancelled.`,
				isLoading: false
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error cancelling plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleModifyPlan(planId: string, modification: any): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			const client = getBackendClient();
			const result = await client.modifyPlan(planId, modification);

			// Show updated plan
			let response = `**Plan Modified** (ID: ${result.plan_id})\n\n`;
			response += `**New Estimated Cost:** $${result.estimated_cost.toFixed(4)}\n\n`;
			response += `**Updated Tasks (${result.tasks.length}):**\n`;

			for (const task of result.tasks) {
				response += `  - ${task.task_id}: ${task.name} (${task.platform})\n`;
			}

			this._view.webview.postMessage({
				type: 'showPlanApproval',
				plan: result,
				message: response
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error modifying plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleGetHistory(): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			const client = getBackendClient();
			const history = await client.getUserHistory('default', 20);
			const stats = await client.getHistoryStats('default');

			let response = `**Execution History**\n\n`;
			response += `**Stats:** ${stats.total_executions} total | ${stats.success_rate}% success | $${stats.total_cost_usd.toFixed(4)} spent\n\n`;

			if (history.length === 0) {
				response += `No executions recorded yet.`;
			} else {
				response += `**Recent Executions:**\n`;
				for (const item of history) {
					const icon = item.status === 'success' ? '[ok]' : '[fail]';
					const rollback = item.can_rollback ? ' [rollbackable]' : '';
					response += `${icon} ${item.platform}/${item.operation} - $${item.cost_usd.toFixed(4)}${rollback}\n`;
				}
			}

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: response,
				isLoading: false
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error getting history: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleGetRollbackable(): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			const client = getBackendClient();
			const items = await client.getRollbackable('default');

			let response = `**Rollbackable Actions**\n\n`;

			if (items.length === 0) {
				response += `No rollbackable actions available.`;
			} else {
				response += `The following actions can be undone:\n\n`;
				for (const item of items) {
					response += `- **ID ${item.id}**: ${item.platform}/${item.operation} → can ${item.rollback_operation}\n`;
				}
				response += `\nTo rollback, use the rollback command with the ID.`;
			}

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: response,
				isLoading: false
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error getting rollbackable items: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleRollback(historyId: number): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: `Rolling back action ${historyId}...`,
			isLoading: true
		});

		try {
			const client = getBackendClient();

			// Get rollback info first
			const info = await client.getRollbackInfo(historyId);

			if (info.warning) {
				// Show warning but proceed
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: `**Warning:** ${info.warning}`,
					isLoading: false
				});
			}

			// Execute rollback
			const result = await client.rollback(historyId, 'default');

			if (result.success) {
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: `**Rollback Successful**\n\n${result.message}`,
					isLoading: false
				});
			} else {
				this._view.webview.postMessage({
					type: 'addMessage',
					role: 'assistant',
					content: `**Rollback Failed**\n\n${result.message}`,
					isLoading: false
				});
			}

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error during rollback: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleBrowsePlatforms(): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: 'Fetching available platforms...',
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const platforms = await client.getPlatforms();

			let response = `**Available Platforms** (${platforms.length})\n\n`;

			// Group by category
			const byCategory: Record<string, any[]> = {};
			for (const p of platforms) {
				const cat = p.category || 'Other';
				if (!byCategory[cat]) {
					byCategory[cat] = [];
				}
				byCategory[cat].push(p);
			}

			for (const [category, items] of Object.entries(byCategory)) {
				response += `**${category}**\n`;
				for (const p of items) {
					response += `  - ${p.name} (${p.id})\n`;
				}
				response += '\n';
			}

			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: response,
				isLoading: false
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error fetching platforms: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleIndexWorkspace(): Promise<void> {
		if (!this._view) {
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			const noOpen = 'No workspace folder open. Please open a folder first.';
			await this._appendAssistantToSession(noOpen);
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: noOpen,
				isLoading: false
			});
			return;
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: `Indexing workspace: ${workspacePath}...`,
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const result = await client.indexWorkspace(workspacePath);

			const wid =
				(typeof result?.workspace_id === 'string' && result.workspace_id) ? result.workspace_id :
					(typeof result?.workspace_context?.workspace_id === 'string' ? result.workspace_context.workspace_id : undefined);

			const active = this._getActiveSession();
			if (active && wid) {
				active.memoryWorkspaceId = wid;
				active.memoryWorkspacePath = workspacePath;
				await this._persistSessions();
			}

			let response = `**Workspace Indexed**\n\n`;
			response += `- **Workspace ID:** ${wid || 'unknown'}\n`;
			response += `- **Files indexed:** ${result.files_indexed || 'N/A'}\n`;
			response += `- **Status:** ${result.status || 'completed'}\n`;

			await this._appendAssistantToSession(response);
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: response,
				isLoading: false
			});

		} catch (error) {
			const errMsg = `Error indexing workspace: ${error instanceof Error ? error.message : 'Unknown error'}`;
			await this._appendAssistantToSession(errMsg);
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: errMsg,
				isLoading: false
			});
		}
	}

	private async _handleExecuteRequest(request: string, model?: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: 'Generating and executing plan immediately...',
			isLoading: true
		});

		try {
			const client = getBackendClient();
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const workspacePath = workspaceFolders && workspaceFolders.length > 0
				? workspaceFolders[0].uri.fsPath
				: undefined;

			// Generate plan
			const llmModel = this._mapUiModelToLiteLlm(model);
			const plan = await client.generatePlan(request, 'default', workspacePath, llmModel);

			// Subscribe to WebSocket
			const wsClient = getOrchestrationWebSocket('default');
			if (!wsClient.isConnected()) {
				await wsClient.connect();
			}
			wsClient.subscribeToPlan(plan.plan_id);

			// Show plan card
			this._view.webview.postMessage({
				type: 'showPlanApproval',
				plan: plan
			});

			// Immediately approve and execute
			this._view.webview.postMessage({
				type: 'planExecutionStarted',
				planId: plan.plan_id
			});

			const result = await client.approvePlan(plan.plan_id);

			this._view.webview.postMessage({
				type: 'planExecutionComplete',
				planId: plan.plan_id,
				status: result.status,
				tasks: result.tasks,
				actualCost: result.actual_cost
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Error executing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private async _handleRunAgent(request: string, model?: string): Promise<void> {
		if (!this._view) {
			return;
		}

		this._view.webview.postMessage({
			type: 'addMessage',
			role: 'assistant',
			content: `**Agent Mode**\n\nAnalyzing request and planning autonomous execution...\n\n*"${request}"*`,
			isLoading: true
		});

		// For now, agent mode uses the same flow as execute but with different messaging
		// In future, this could use a more autonomous agent loop
		try {
			const client = getBackendClient();
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const workspacePath = workspaceFolders && workspaceFolders.length > 0
				? workspaceFolders[0].uri.fsPath
				: undefined;

			const llmModel = this._mapUiModelToLiteLlm(model);
			const plan = await client.generatePlan(request, 'default', workspacePath, llmModel);

			const wsClient = getOrchestrationWebSocket('default');
			if (!wsClient.isConnected()) {
				await wsClient.connect();
			}
			wsClient.subscribeToPlan(plan.plan_id);

			this._view.webview.postMessage({
				type: 'showPlanApproval',
				plan: plan
			});

			// In agent mode, auto-approve
			this._view.webview.postMessage({
				type: 'planExecutionStarted',
				planId: plan.plan_id
			});

			const result = await client.approvePlan(plan.plan_id);

			this._view.webview.postMessage({
				type: 'planExecutionComplete',
				planId: plan.plan_id,
				status: result.status,
				tasks: result.tasks,
				actualCost: result.actual_cost
			});

		} catch (error) {
			this._view.webview.postMessage({
				type: 'addMessage',
				role: 'assistant',
				content: `Agent error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				isLoading: false
			});
		}
	}

	private _getHtmlContent(): string {
		// Legacy: kept only for reference. Not used anymore.
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		* { box-sizing: border-box; }
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			height: 100vh;
			background: var(--vscode-sideBar-background);
		}
		.status-bar {
			padding: 8px 12px;
			font-size: 11px;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			align-items: center;
			gap: 8px;
			background: var(--vscode-titleBar-activeBackground);
		}
		.status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--vscode-charts-red);
			animation: pulse 2s infinite;
		}
		.status-dot.connected {
			background: var(--vscode-charts-green);
			animation: none;
		}
		.auth-status {
			margin-left: auto;
			display: flex;
			gap: 8px;
			align-items: center;
		}
		.auth-badge {
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 2px 6px;
			border-radius: 3px;
			background: var(--vscode-badge-background);
			font-size: 10px;
			cursor: pointer;
		}
		.auth-badge .auth-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--vscode-charts-red);
		}
		.auth-badge.connected .auth-dot {
			background: var(--vscode-charts-green);
		}
		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		.messages {
			flex: 1;
			overflow-y: auto;
			padding: 12px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}
		.message {
			padding: 12px;
			border-radius: 8px;
			word-wrap: break-word;
			line-height: 1.5;
			animation: fadeIn 0.2s ease-out;
		}
		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(4px); }
			to { opacity: 1; transform: translateY(0); }
		}
		.user {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			align-self: flex-end;
			max-width: 85%;
			border-radius: 12px 12px 4px 12px;
		}
		.assistant {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			align-self: flex-start;
			max-width: 95%;
			border-radius: 12px 12px 12px 4px;
		}
		.assistant.loading {
			opacity: 0.7;
		}
		.assistant.loading::after {
			content: '';
			display: inline-block;
			width: 12px;
			height: 12px;
			border: 2px solid var(--vscode-foreground);
			border-top-color: transparent;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			margin-left: 8px;
			vertical-align: middle;
		}
		.message-header {
			font-size: 10px;
			opacity: 0.6;
			margin-bottom: 6px;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.message-content {
			white-space: pre-wrap;
		}
		.code-block {
			background: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			padding: 12px;
			margin: 8px 0;
			overflow-x: auto;
			font-family: var(--vscode-editor-font-family), monospace;
			font-size: 12px;
			line-height: 1.4;
		}
		.code-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 6px 10px;
			background: var(--vscode-titleBar-activeBackground);
			border-radius: 6px 6px 0 0;
			margin: 8px 0 0 0;
			font-size: 11px;
		}
		.copy-btn {
			padding: 4px 8px;
			font-size: 10px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		}
		.copy-btn:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.usage-info {
			font-size: 10px;
			opacity: 0.7;
			padding: 6px 10px;
			background: var(--vscode-textBlockQuote-background);
			border-radius: 4px;
			margin-top: 8px;
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
		}
		.usage-item {
			display: flex;
			align-items: center;
			gap: 4px;
		}
		.input-area {
			padding: 12px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}
		.input-row {
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
		}
		.connector-row {
			display: flex;
			gap: 8px;
			align-items: center;
			flex-wrap: wrap;
		}
		input {
			flex: 1;
			padding: 10px 12px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 6px;
			outline: none;
			font-size: 13px;
		}
		input:focus {
			border-color: var(--vscode-focusBorder);
			box-shadow: 0 0 0 1px var(--vscode-focusBorder);
		}
		input::placeholder {
			opacity: 0.6;
		}
		select {
			padding: 8px 10px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 6px;
			outline: none;
			cursor: pointer;
			font-size: 12px;
		}
		select:focus {
			border-color: var(--vscode-focusBorder);
		}
		button {
			padding: 10px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-weight: 500;
			font-size: 12px;
			transition: background 0.15s ease;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button:active {
			transform: scale(0.98);
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		button.generate {
			background: linear-gradient(135deg, #6366f1, #8b5cf6);
			color: white;
		}
		button.generate:hover {
			background: linear-gradient(135deg, #4f46e5, #7c3aed);
		}
		button.deploy {
			background: linear-gradient(135deg, #10b981, #059669);
			color: white;
		}
		button.deploy:hover {
			background: linear-gradient(135deg, #059669, #047857);
		}
		.connector-label {
			font-size: 11px;
			opacity: 0.7;
		}
		.welcome {
			text-align: center;
			padding: 30px 20px;
			opacity: 0.9;
		}
		.welcome-icon {
			font-size: 40px;
			margin-bottom: 12px;
		}
		.welcome h3 {
			margin: 0 0 8px 0;
			font-size: 18px;
			font-weight: 600;
		}
		.welcome p {
			margin: 4px 0;
			font-size: 12px;
			opacity: 0.8;
		}
		.welcome .hint {
			margin-top: 20px;
			padding: 10px;
			background: var(--vscode-textBlockQuote-background);
			border-radius: 6px;
			font-size: 11px;
		}
		.badge {
			display: inline-block;
			padding: 2px 6px;
			font-size: 10px;
			border-radius: 3px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.badge.success { background: var(--vscode-charts-green); color: white; }
		.badge.info { background: var(--vscode-charts-blue); color: white; }
	</style>
</head>
<body>
	<div class="status-bar">
		<span class="status-dot" id="statusDot"></span>
		<span id="statusText">Checking backend...</span>
		<div class="auth-status">
			<span class="auth-badge" id="githubBadge" title="Click to connect GitHub">
				<span>GH</span>
				<span class="auth-dot"></span>
			</span>
			<span class="auth-badge" id="vercelBadge" title="Click to connect Vercel">
				<span>Vc</span>
				<span class="auth-dot"></span>
			</span>
		</div>
	</div>
	<div class="messages" id="messages">
		<div class="welcome">
			<div class="welcome-icon">*</div>
			<h3>Nexora AI</h3>
			<p>Universal AI Orchestration System</p>
			<div class="hint">
				<strong>Plan:</strong> Enter + describe what to build<br/>
				<strong>Generate:</strong> Shift+Enter or click Generate
			</div>
		</div>
	</div>
	<div class="input-area">
		<div class="input-row">
			<input type="text" id="input" placeholder="What would you like to build?" />
			<button id="send">Plan</button>
		</div>
		<div class="connector-row">
			<span class="connector-label">AI:</span>
			<select id="connector">
				<option value="openai">GPT-4o-mini</option>
				<option value="anthropic">Claude-3-Haiku</option>
			</select>
			<button id="generate" class="generate">Generate Code</button>
			<button id="deploy" class="deploy" title="Generate, push to GitHub, deploy to Vercel">Deploy</button>
		</div>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		const messages = document.getElementById('messages');
		const input = document.getElementById('input');
		const send = document.getElementById('send');
		const generate = document.getElementById('generate');
		const deploy = document.getElementById('deploy');
		const connector = document.getElementById('connector');
		const statusDot = document.getElementById('statusDot');
		const statusText = document.getElementById('statusText');
		const githubBadge = document.getElementById('githubBadge');
		const vercelBadge = document.getElementById('vercelBadge');
		let lastLoadingMessage = null;

		function updateStatus(connected) {
			if (connected) {
				statusDot.classList.add('connected');
				statusText.textContent = 'Backend connected';
			} else {
				statusDot.classList.remove('connected');
				statusText.textContent = 'Backend offline';
			}
		}

		function updateAuthStatus(github, vercel) {
			if (github) {
				githubBadge.classList.add('connected');
				githubBadge.title = 'GitHub connected';
			} else {
				githubBadge.classList.remove('connected');
				githubBadge.title = 'Click to connect GitHub';
			}

			if (vercel) {
				vercelBadge.classList.add('connected');
				vercelBadge.title = 'Vercel connected';
			} else {
				vercelBadge.classList.remove('connected');
				vercelBadge.title = 'Click to connect Vercel';
			}
		}

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function formatContent(content) {
			let html = escapeHtml(content);

			// Handle code blocks
			const codeBlockRegex = /\x60\x60\x60([\\s\\S]*?)\x60\x60\x60/g;
			html = html.replace(codeBlockRegex, function(match, code) {
				const trimmed = code.trim();
				const copyId = 'code-' + Math.random().toString(36).substr(2, 9);
				return '<div class="code-header"><span>Code</span><button class="copy-btn" onclick="copyCode(\\'' + copyId + '\\')">Copy</button></div><pre class="code-block" id="' + copyId + '">' + trimmed + '</pre>';
			});

			// Handle inline code
			html = html.replace(/\x60([^\x60]+)\x60/g, '<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-family: monospace;">$1</code>');

			// Handle bold
			html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

			// Handle line breaks
			html = html.replace(/\\n/g, '<br/>');

			return html;
		}

		function copyCode(id) {
			const el = document.getElementById(id);
			if (el) {
				navigator.clipboard.writeText(el.textContent);
				const btn = el.previousElementSibling.querySelector('.copy-btn');
				if (btn) {
					btn.textContent = 'Copied!';
					setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
				}
			}
		}
		window.copyCode = copyCode;

		function addMessage(role, content, isLoading) {
			const welcome = messages.querySelector('.welcome');
			if (welcome) welcome.remove();

			if (isLoading && lastLoadingMessage) {
				lastLoadingMessage.remove();
			}

			const div = document.createElement('div');
			div.className = 'message ' + role + (isLoading ? ' loading' : '');

			if (isLoading) {
				div.textContent = content;
			} else {
				div.innerHTML = formatContent(content);
			}

			messages.appendChild(div);
			messages.scrollTop = messages.scrollHeight;

			if (isLoading) {
				lastLoadingMessage = div;
			} else if (lastLoadingMessage) {
				lastLoadingMessage.remove();
				lastLoadingMessage = null;
			}
		}

		function sendMessage() {
			const text = input.value.trim();
			if (!text) return;
			addMessage('user', text, false);
			vscode.postMessage({ type: 'sendMessage', message: text });
			input.value = '';
		}

		function generateCode() {
			const text = input.value.trim();
			if (!text) return;
			const selectedConnector = connector.value;
			addMessage('user', '[Generate] ' + text, false);
			vscode.postMessage({ type: 'generateCode', prompt: text, connector: selectedConnector });
			input.value = '';
		}

		function deployProject() {
			const text = input.value.trim();
			if (!text) return;
			
			// Simple repo/project name generation from prompt
			const baseName = text.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
			const timestamp = Date.now().toString().slice(-4);
			const repoName = 'nexora-' + baseName + '-' + timestamp;
			const projectName = repoName;

			addMessage('user', '[Deploy] ' + text, false);
			vscode.postMessage({ 
				type: 'deployProject', 
				prompt: text, 
				repoName: repoName,
				projectName: projectName
			});
			input.value = '';
		}

		send.onclick = sendMessage;
		generate.onclick = generateCode;
		deploy.onclick = deployProject;

		githubBadge.onclick = () => {
			vscode.postMessage({ type: 'connectGitHub' });
		};

		vercelBadge.onclick = () => {
			vscode.postMessage({ type: 'connectVercel' });
		};
		input.onkeypress = (e) => {
			if (e.key === 'Enter') {
				if (e.shiftKey) {
					generateCode();
				} else {
					sendMessage();
				}
			}
		};

		window.addEventListener('message', e => {
			if (e.data.type === 'addMessage') {
				addMessage(e.data.role, e.data.content, e.data.isLoading);
			} else if (e.data.type === 'backendStatus') {
				updateStatus(e.data.connected);
			} else if (e.data.type === 'authStatus') {
				updateAuthStatus(e.data.github, e.data.vercel);
			}
		});

		vscode.postMessage({ type: 'checkBackend' });
		vscode.postMessage({ type: 'checkAuthStatus' });
	</script>
</body>
</html>`;
	}
}
