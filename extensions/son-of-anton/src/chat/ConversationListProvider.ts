/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ConversationStore, ConversationSummary } from './ConversationStore';
import {
	CliConversationSummary,
	getCliConversationsDir,
	listCliConversations,
} from './CliConversationReader';

/**
 * Tree item wrapping a single IDE-side conversation summary. The
 * constructor wires up the click command (`sota.openConversation`), inline
 * icon, tooltip, and context value so VS Code's view/item/context
 * contributions can target it for the rename / delete menu entries.
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
 * Tree item wrapping a CLI-authored conversation summary. Click dispatches
 * `sota.openCliConversation` which imports the conversation into the IDE
 * store as a fresh editable record before opening it. The `(CLI)` prefix
 * on the description column is decorative — the icon (`terminal`) is the
 * primary affordance distinguishing CLI items from IDE-native ones.
 */
export class CliConversationTreeItem extends vscode.TreeItem {
	constructor(public readonly summary: CliConversationSummary) {
		super(summary.title || 'Untitled', vscode.TreeItemCollapsibleState.None);

		// IDs across CLI and IDE conversations may collide (the CLI mints
		// its own UUIDs), so we namespace the tree item id while leaving the
		// underlying conversation id untouched on `summary`.
		this.id = `cli-${summary.id}`;
		this.description = `(CLI) ${formatRelativeTime(summary.updatedAt)}`;
		this.tooltip = buildCliTooltip(summary);
		this.iconPath = new vscode.ThemeIcon('terminal');
		this.contextValue = 'sotaCliConversation';
		this.command = {
			command: 'sota.openCliConversation',
			title: 'Open CLI Conversation',
			arguments: [summary.id],
		};
	}
}

/**
 * Synthetic group header that wraps the CLI conversations underneath an
 * "CLI sessions" expandable node. Keeps the IDE list visually unbroken
 * while still surfacing CLI history in the same tree.
 */
class CliGroupTreeItem extends vscode.TreeItem {
	constructor(count: number) {
		super('CLI sessions', vscode.TreeItemCollapsibleState.Expanded);
		this.id = 'sota.cliConversationsGroup';
		this.description = count === 0 ? '(empty)' : `${count}`;
		this.iconPath = new vscode.ThemeIcon('terminal');
		this.contextValue = 'sotaCliConversationsGroup';
		this.tooltip = 'Conversations created by the Son of Anton CLI. Clicking imports them into a fresh editable IDE conversation.';
	}
}

type AnyTreeItem = ConversationTreeItem | CliConversationTreeItem | CliGroupTreeItem;

/**
 * Tree data provider that surfaces both IDE-side and CLI-side conversation
 * history in a single sidebar view. IDE conversations sit at the top of
 * the tree (matching the previous layout); CLI conversations live under a
 * collapsible "CLI sessions" group below them.
 *
 * Re-emits `onDidChangeTreeData` whenever the IDE store fires `onDidChange`
 * or whenever the CLI conversation directory is touched (created /
 * modified / deleted), so all three write surfaces (chat, history menu,
 * external CLI process) keep the tree in sync.
 */
export class ConversationListProvider implements vscode.TreeDataProvider<AnyTreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<AnyTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<AnyTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	private readonly disposables: vscode.Disposable[] = [];
	private readonly cliWatcher: vscode.FileSystemWatcher;

	constructor(private readonly store: ConversationStore) {
		this.disposables.push(
			this.store.onDidChange(() => {
				this._onDidChangeTreeData.fire();
			}),
		);

		// File watcher on the CLI conversations directory. We use an
		// absolute `RelativePattern` so the watcher is independent of the
		// open workspace folders (the directory lives under `$HOME`,
		// which may sit outside any workspace). The `*.json` glob picks
		// up the atomic-rename completion event the CLI emits at the end
		// of every save.
		const cliDirUri = getCliConversationsDir();
		const pattern = new vscode.RelativePattern(cliDirUri, '*.json');
		this.cliWatcher = vscode.workspace.createFileSystemWatcher(pattern);
		this.disposables.push(this.cliWatcher);
		this.disposables.push(
			this.cliWatcher.onDidCreate(() => this._onDidChangeTreeData.fire()),
			this.cliWatcher.onDidChange(() => this._onDidChangeTreeData.fire()),
			this.cliWatcher.onDidDelete(() => this._onDidChangeTreeData.fire()),
		);
	}

	getTreeItem(element: AnyTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: AnyTreeItem): Promise<AnyTreeItem[]> {
		if (element instanceof CliGroupTreeItem) {
			const cliSummaries = await listCliConversations();
			return cliSummaries.map(s => new CliConversationTreeItem(s));
		}
		if (element) {
			return [];
		}
		const ideItems: AnyTreeItem[] = this.store.list().map(summary => new ConversationTreeItem(summary));
		// Probe the CLI list eagerly so the group header can show an
		// accurate count (including "(empty)") without forcing the user
		// to expand it. This is one fs scan per refresh — cheap given
		// `MAX_CONVERSATIONS` order-of-magnitude bounds the directory
		// size on the CLI side too.
		const cliSummaries = await listCliConversations();
		// Hide the group entirely when the user has never used the CLI —
		// keeps the sidebar uncluttered for IDE-only installs.
		if (cliSummaries.length === 0) {
			return ideItems;
		}
		return [...ideItems, new CliGroupTreeItem(cliSummaries.length)];
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

function buildCliTooltip(summary: CliConversationSummary): string {
	const created = new Date(summary.createdAt).toLocaleString();
	const updated = new Date(summary.updatedAt).toLocaleString();
	const lines = [
		summary.title || 'Untitled',
		'Source: Son of Anton CLI',
		`Created: ${created}`,
		`Updated: ${updated}`,
		`Messages: ${summary.messageCount}`,
	];
	if (summary.lastSpecialist) {
		lines.push(`Last specialist: ${summary.lastSpecialist}`);
	}
	lines.push('Click to import into a new IDE conversation.');
	return lines.join('\n');
}
