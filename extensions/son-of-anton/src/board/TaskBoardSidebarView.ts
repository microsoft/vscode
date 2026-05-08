/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConversationStore } from '../chat/ConversationStore';
import { BoardSnapshot, SubtaskState, TaskBoardModel } from './TaskBoardModel';

interface OpenFullBoardMessage { type: 'openFullBoard' }
interface OpenChatMessage { type: 'openChat' }
interface RefreshMessage { type: 'refresh' }
type IncomingMessage = OpenFullBoardMessage | OpenChatMessage | RefreshMessage;

interface SidebarSnapshotPayload {
	readonly type: 'snapshot';
	readonly conversationId: string | null;
	readonly conversationTitle: string;
	readonly hasPlan: boolean;
	readonly counts: Record<SubtaskState, number>;
	readonly total: number;
}

const STATE_ORDER: ReadonlyArray<SubtaskState> = [
	'backlog',
	'ready',
	'in-progress',
	'review',
	'done',
	'failed',
];

/**
 * Compact sidebar pane summarising the active conversation's task board.
 *
 * Lives inside the dedicated `sota-board` activity-bar container alongside the
 * chat sidebar. Renders per-state counts plus a CTA that opens the full
 * `TaskBoardPanel` editor view via the existing `sota.openTaskBoard` command,
 * preserving the wide layout for actual interaction. The pane subscribes to
 * `TaskBoardModel.onDidChangeBoard` and `ConversationStore.onDidChange` so
 * counts stay in sync as plans evolve and the user switches conversations.
 */
export class TaskBoardSidebarView implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly VIEW_ID = 'sota.boardSidebar';

	private view: vscode.WebviewView | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private viewDisposables: vscode.Disposable[] = [];

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly model: TaskBoardModel,
		private readonly conversationStore: ConversationStore,
	) {
		// Re-render whenever the underlying model fires for *any* conversation
		// — the active conversation may have just changed and the sidebar
		// should reflect that without an explicit subscription per id.
		this.disposables.push(
			this.model.onDidChangeBoard(() => {
				this.pushSnapshot();
			}),
		);
		// Conversation list mutations (new/rename/delete) shift which
		// conversation the sidebar should display, so refresh on any change.
		this.disposables.push(
			this.conversationStore.onDidChange(() => {
				this.pushSnapshot();
			}),
		);
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			],
		};
		view.webview.html = this.renderHtml(view.webview);

		const messageSub = view.webview.onDidReceiveMessage((raw: unknown) => {
			this.handleMessage(raw);
		});
		const disposeSub = view.onDidDispose(() => {
			this.view = undefined;
			while (this.viewDisposables.length > 0) {
				const d = this.viewDisposables.pop();
				d?.dispose();
			}
		});
		this.viewDisposables.push(messageSub, disposeSub);

		// Push initial snapshot so the panel renders something the moment the
		// activity-bar icon is clicked, even before any model events fire.
		this.pushSnapshot();
	}

	dispose(): void {
		while (this.disposables.length > 0) {
			const d = this.disposables.pop();
			d?.dispose();
		}
		while (this.viewDisposables.length > 0) {
			const d = this.viewDisposables.pop();
			d?.dispose();
		}
		this.view = undefined;
	}

	private handleMessage(raw: unknown): void {
		if (!raw || typeof raw !== 'object') {
			return;
		}
		const message = raw as Partial<IncomingMessage>;
		if (typeof message.type !== 'string') {
			return;
		}
		switch (message.type) {
			case 'openFullBoard':
				void vscode.commands.executeCommand('sota.openTaskBoard');
				return;
			case 'openChat':
				// `*.focus` reveals the matching webview view container; chat
				// view id matches the activity-bar entry so this surfaces the
				// chat sidebar from the empty-state CTA.
				void vscode.commands.executeCommand('sota.chatView.focus');
				return;
			case 'refresh':
				this.pushSnapshot();
				return;
		}
	}

	private pushSnapshot(): void {
		const view = this.view;
		if (!view) {
			return;
		}
		const payload = this.computeSnapshotPayload();
		void view.webview.postMessage(payload);
	}

	private computeSnapshotPayload(): SidebarSnapshotPayload {
		const list = this.conversationStore.list();
		// Active conversation = most-recently updated, matching the heuristic
		// used by ChatViewProvider and the `sota.openTaskBoard` command.
		const activeId = list.length > 0 ? list[0].id : undefined;
		const conversationTitle = activeId
			? list.find(s => s.id === activeId)?.title ?? '(untitled)'
			: '';

		// Prefer the active conversation's board, but fall back to any other
		// conversation that *does* have a board so users see real progress
		// rather than an empty state when work is happening on a different
		// conversation than the one their chat is currently focused on.
		let snapshot: BoardSnapshot | undefined = activeId
			? this.model.getSnapshot(activeId)
			: undefined;
		let displayConversationId: string | undefined = activeId;
		let displayTitle: string = conversationTitle;
		if (!snapshot || snapshot.tasks.length === 0) {
			for (const summary of list) {
				const candidate = this.model.getSnapshot(summary.id);
				if (candidate && candidate.tasks.length > 0) {
					snapshot = candidate;
					displayConversationId = summary.id;
					displayTitle = summary.title;
					break;
				}
			}
		}

		const counts = this.emptyCounts();
		if (snapshot) {
			for (const task of snapshot.tasks) {
				counts[task.state] = (counts[task.state] ?? 0) + 1;
			}
		}
		const total = Object.values(counts).reduce((acc, n) => acc + n, 0);

		return {
			type: 'snapshot',
			conversationId: displayConversationId ?? null,
			conversationTitle: displayTitle,
			hasPlan: total > 0,
			counts,
			total,
		};
	}

	private emptyCounts(): Record<SubtaskState, number> {
		return {
			'backlog': 0,
			'ready': 0,
			'in-progress': 0,
			'review': 0,
			'done': 0,
			'failed': 0,
		};
	}

	private renderHtml(webview: vscode.Webview): string {
		const cspSource = webview.cspSource;
		const nonce = randomNonce();
		const labelByState: Record<SubtaskState, string> = {
			'backlog': 'Backlog',
			'ready': 'Ready',
			'in-progress': 'In Progress',
			'review': 'Review',
			'done': 'Done',
			'failed': 'Failed',
		};
		const rowsHtml = STATE_ORDER.map(state => {
			const label = labelByState[state];
			return `<div class="row" data-state="${state}">`
				+ `<span class="row-label">${label}</span>`
				+ `<span class="row-count" data-count="${state}">0</span>`
				+ `</div>`;
		}).join('');
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
	<title>Tasks</title>
	<style>
		:root {
			--sota-card-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
			--sota-radius: 6px;
			--sota-radius-pill: 999px;
			--sota-fg-muted: var(--vscode-descriptionForeground);
			--sota-border: var(--vscode-panel-border, var(--vscode-editorWidget-border, transparent));
			--sota-accent: var(--vscode-button-background, var(--vscode-focusBorder, #0078d4));
			--sota-accent-fg: var(--vscode-button-foreground, #ffffff);
			--sota-accent-hover: var(--vscode-button-hoverBackground, var(--sota-accent));
			--sota-status-backlog: var(--vscode-descriptionForeground);
			--sota-status-ready: var(--vscode-charts-blue, #3b82f6);
			--sota-status-progress: var(--vscode-charts-yellow, #f59e0b);
			--sota-status-review: var(--vscode-charts-purple, #a855f7);
			--sota-status-done: var(--vscode-charts-green, #16a34a);
			--sota-status-failed: var(--vscode-errorForeground, #dc2626);
		}
		* { box-sizing: border-box; }
		html, body {
			margin: 0; padding: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background, var(--vscode-editor-background));
		}
		.shell {
			display: flex; flex-direction: column;
			gap: 12px;
			padding: 12px;
		}
		.section-label {
			font-size: 0.75em;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--sota-fg-muted);
		}
		.conversation-title {
			font-size: 0.95em;
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.empty {
			display: flex; flex-direction: column; gap: 10px;
			color: var(--sota-fg-muted);
			font-size: 0.85em;
			line-height: 1.4;
		}
		.empty code {
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.9em;
			padding: 1px 4px;
			border-radius: 3px;
			background: color-mix(in srgb, var(--sota-fg-muted) 18%, transparent);
		}
		.empty strong {
			color: var(--vscode-foreground);
			font-weight: 600;
		}
		.status-card {
			display: flex; flex-direction: column;
			background: var(--sota-card-bg);
			border: 1px solid var(--sota-border);
			border-radius: var(--sota-radius);
			overflow: hidden;
		}
		.row {
			display: flex; align-items: center;
			padding: 6px 10px;
			border-bottom: 1px solid var(--sota-border);
			font-size: 0.85em;
		}
		.row:last-child { border-bottom: none; }
		.row-label {
			flex: 1;
			color: var(--vscode-foreground);
		}
		.row-count {
			min-width: 1.6em;
			text-align: right;
			font-variant-numeric: tabular-nums;
			font-weight: 600;
		}
		.row[data-state="backlog"] .row-count { color: var(--sota-status-backlog); }
		.row[data-state="ready"] .row-count { color: var(--sota-status-ready); }
		.row[data-state="in-progress"] .row-count { color: var(--sota-status-progress); }
		.row[data-state="review"] .row-count { color: var(--sota-status-review); }
		.row[data-state="done"] .row-count { color: var(--sota-status-done); }
		.row[data-state="failed"] .row-count { color: var(--sota-status-failed); }
		.row.zero .row-count { color: var(--sota-fg-muted); opacity: 0.7; }
		.cta {
			display: flex; align-items: center; justify-content: center;
			gap: 6px;
			width: 100%;
			padding: 8px 12px;
			border: 1px solid transparent;
			border-radius: var(--sota-radius);
			background: var(--sota-accent);
			color: var(--sota-accent-fg);
			font: inherit;
			font-weight: 600;
			cursor: pointer;
		}
		.cta:hover { background: var(--sota-accent-hover); }
		.cta:focus-visible {
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}
		.cta.secondary {
			background: var(--vscode-button-secondaryBackground, transparent);
			color: var(--vscode-button-secondaryForeground, inherit);
			border-color: var(--sota-border);
		}
		.cta.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground, transparent);
			border-color: var(--sota-accent);
		}
	</style>
</head>
<body>
	<main class="shell">
		<section id="active-section" hidden>
			<div class="section-label">Active conversation</div>
			<div id="conversation-title" class="conversation-title" title=""></div>
		</section>
		<section id="status-section" hidden>
			<div class="section-label">Status</div>
			<div class="status-card">
				${rowsHtml}
			</div>
			<button id="open-full-board" class="cta" type="button" style="margin-top: 12px;">
				<span aria-hidden="true">&#9654;</span>
				<span>Open Full Board</span>
			</button>
		</section>
		<section id="empty-section" class="empty" hidden>
			<div id="empty-message"></div>
			<button id="open-chat" class="cta secondary" type="button">Open Chat</button>
		</section>
	</main>
	<script nonce="${nonce}">
		(function () {
			const vscode = acquireVsCodeApi();
			const activeSection = document.getElementById('active-section');
			const conversationTitle = document.getElementById('conversation-title');
			const statusSection = document.getElementById('status-section');
			const emptySection = document.getElementById('empty-section');
			const emptyMessage = document.getElementById('empty-message');
			const states = ${JSON.stringify(STATE_ORDER)};

			document.getElementById('open-full-board').addEventListener('click', () => {
				vscode.postMessage({ type: 'openFullBoard' });
			});
			document.getElementById('open-chat').addEventListener('click', () => {
				vscode.postMessage({ type: 'openChat' });
			});

			window.addEventListener('message', (event) => {
				const data = event.data || {};
				if (data.type !== 'snapshot') {
					return;
				}
				render(data);
			});

			function clearChildren(node) {
				while (node.firstChild) {
					node.removeChild(node.firstChild);
				}
			}

			function buildEmptyMessage(hasConversation, title) {
				clearChildren(emptyMessage);
				if (hasConversation) {
					emptyMessage.appendChild(document.createTextNode('No active plan in '));
					const strong = document.createElement('strong');
					strong.textContent = title || '(untitled)';
					emptyMessage.appendChild(strong);
					emptyMessage.appendChild(document.createTextNode('. Send a request to '));
				} else {
					emptyMessage.appendChild(document.createTextNode('No active plan. Send a request to '));
				}
				const code = document.createElement('code');
				code.textContent = '@anton';
				emptyMessage.appendChild(code);
				emptyMessage.appendChild(document.createTextNode(' to generate one.'));
			}

			function render(data) {
				const hasConversation = !!data.conversationId;
				const hasPlan = !!data.hasPlan;
				if (hasConversation) {
					activeSection.hidden = false;
					const title = data.conversationTitle || '(untitled)';
					conversationTitle.textContent = title;
					conversationTitle.title = title;
				} else {
					activeSection.hidden = true;
					conversationTitle.textContent = '';
					conversationTitle.title = '';
				}

				if (hasPlan) {
					statusSection.hidden = false;
					emptySection.hidden = true;
					const counts = data.counts || {};
					for (const state of states) {
						const cell = statusSection.querySelector('[data-count="' + state + '"]');
						if (!cell) { continue; }
						const value = Number(counts[state] || 0);
						cell.textContent = String(value);
						const row = cell.closest('.row');
						if (row) {
							row.classList.toggle('zero', value === 0);
						}
					}
				} else {
					statusSection.hidden = true;
					emptySection.hidden = false;
					buildEmptyMessage(hasConversation, data.conversationTitle);
				}
			}

			// Ask the host for a fresh snapshot in case the view was just
			// resurrected and missed the host's initial push.
			vscode.postMessage({ type: 'refresh' });
		})();
	</script>
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
