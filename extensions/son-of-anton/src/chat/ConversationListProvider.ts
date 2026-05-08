/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ConversationStore, ConversationSummary } from './ConversationStore';

/**
 * Tree item wrapping a single conversation summary. The constructor wires up
 * the click command (`sota.openConversation`), inline icon, tooltip, and
 * context value so VS Code's view/item/context contributions can target it
 * for the rename / delete menu entries.
 */
export class ConversationTreeItem extends vscode.TreeItem {
	constructor(public readonly summary: ConversationSummary) {
		super(summary.title || 'Untitled', vscode.TreeItemCollapsibleState.None);

		this.id = summary.id;
		this.description = formatRelativeTime(summary.updatedAt);
		this.tooltip = buildTooltip(summary);
		this.iconPath = new vscode.ThemeIcon('comment-discussion');
		this.contextValue = 'sotaConversation';
		this.command = {
			command: 'sota.openConversation',
			title: 'Open Conversation',
			arguments: [summary.id],
		};
	}
}

/**
 * Tree data provider that surfaces the conversation history as a sidebar
 * view. Re-emits `onDidChangeTreeData` whenever the underlying store fires
 * `onDidChange`, so create/update/rename/delete all repaint the tree without
 * the host needing to call `refresh()` manually.
 */
export class ConversationListProvider implements vscode.TreeDataProvider<ConversationTreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<ConversationTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ConversationTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly store: ConversationStore) {
		this.disposables.push(
			this.store.onDidChange(() => {
				this._onDidChangeTreeData.fire();
			}),
		);
	}

	getTreeItem(element: ConversationTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ConversationTreeItem): ConversationTreeItem[] {
		if (element) {
			return [];
		}
		return this.store.list().map(summary => new ConversationTreeItem(summary));
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}
}

/**
 * Format a millisecond timestamp as a compact relative-time string suitable
 * for the description column of a sidebar item. Falls back to a short date
 * once entries get older than a few days so the column doesn't end up
 * cluttered with three-digit hour counts.
 */
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
	if (seconds < 60) {
		return 'just now';
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	if (days === 1) {
		return 'Yesterday';
	}
	if (days < 7) {
		return `${days}d ago`;
	}
	// Stable, locale-friendly short month-day rendering for older entries —
	// avoids the noise of "423h ago" on long-lived installs.
	const date = new Date(timestamp);
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildTooltip(summary: ConversationSummary): string {
	const created = new Date(summary.createdAt).toLocaleString();
	const updated = new Date(summary.updatedAt).toLocaleString();
	const lines = [
		summary.title || 'Untitled',
		`Created: ${created}`,
		`Updated: ${updated}`,
		`Messages: ${summary.messageCount}`,
	];
	if (summary.lastSpecialist) {
		lines.push(`Last specialist: ${summary.lastSpecialist}`);
	}
	return lines.join('\n');
}
