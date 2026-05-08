/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PERSONAS, SpecialistPersona } from 'son-of-anton-core/chat/personas';
import { AgentBridge } from '../chat/AgentBridge';
import { AgentEvent } from '../chat/agentEvents';

/**
 * Visible status for a specialist in the roster panel. Drives the icon and
 * the textual chip in the description column.
 */
export type SpecialistStatus = 'idle' | 'thinking' | 'running tool' | 'completed' | 'failed';

/**
 * In-memory record for a single specialist row. Populated from `PERSONAS`
 * at construction time and mutated in-place as agent events arrive.
 */
interface RosterEntry {
	readonly persona: SpecialistPersona;
	status: SpecialistStatus;
	lastActiveAt: number | undefined;
	/** Most recent transcript snippet for "Show Last Trace" — the final summary or error message. */
	lastTrace: string | undefined;
	/** Subtask id currently in flight for this specialist (if any). */
	activeSubtaskId: string | undefined;
	/** Timeout id for the auto-decay back to `idle` after `completed` / `failed`. */
	decayHandle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Auto-revert delay back to `idle` after a terminal state. Picked from the
 * Phase 77 spec: keep the green tick visible long enough to register as
 * "just finished", clear the red X slowly enough to be noticed.
 */
const COMPLETED_DECAY_MS = 5_000;
const FAILED_DECAY_MS = 30_000;

/**
 * Tree data provider for the **Anton Roster** view.
 *
 * Lists one row per specialist persona, decorated with a live status chip
 * and a "last active" relative timestamp. Subscribes to the shared
 * {@link AgentBridge.onDidEmitEvent} stream so any orchestrator-driven
 * subtask updates the matching specialist's row regardless of which chat
 * surface initiated the run.
 *
 * The provider owns no agent state of its own — everything lives in
 * memory and is rebuilt from `PERSONAS` on construction. Persistence is
 * deliberately omitted: a fresh window starts with all specialists `idle`.
 */
export class AgentRosterProvider implements vscode.TreeDataProvider<string>, vscode.Disposable {
	private readonly entries = new Map<string, RosterEntry>();
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<string | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<string | undefined | void> = this._onDidChangeTreeData.event;

	private readonly disposables: vscode.Disposable[] = [];
	/** Repaint timer for periodic last-active relative-time updates. */
	private repaintTimer: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly agentBridge: AgentBridge) {
		for (const persona of PERSONAS) {
			this.entries.set(persona.id, {
				persona,
				status: 'idle',
				lastActiveAt: undefined,
				lastTrace: undefined,
				activeSubtaskId: undefined,
				decayHandle: undefined,
			});
		}

		this.disposables.push(
			this.agentBridge.onDidEmitEvent(envelope => this.handleAgentEvent(envelope.event)),
		);

		// One-minute repaint so "5m ago" -> "6m ago" creeps along without
		// requiring a tree event for every entry. Cheap: the tree only redraws
		// the description column.
		this.repaintTimer = setInterval(() => {
			this._onDidChangeTreeData.fire();
		}, 60_000);
	}

	getTreeItem(handle: string): vscode.TreeItem {
		const entry = this.entries.get(handle);
		if (!entry) {
			// Defensive fallback — should be unreachable because `getChildren`
			// only emits handles we've populated.
			const item = new vscode.TreeItem(handle, vscode.TreeItemCollapsibleState.None);
			item.description = '—';
			return item;
		}
		const { persona } = entry;
		const item = new vscode.TreeItem(`${persona.monogram}  ${persona.id}`, vscode.TreeItemCollapsibleState.None);
		item.id = persona.id;
		item.description = `${entry.status} · ${formatLastActive(entry.lastActiveAt)}`;
		item.tooltip = buildTooltip(entry);
		item.contextValue = 'sotaSpecialist';
		item.iconPath = iconForStatus(entry.status);
		item.command = {
			command: 'sota.specialistRoster.startThread',
			title: 'Start a Thread',
			arguments: [persona.id],
		};
		return item;
	}

	getChildren(element?: string): string[] {
		if (element) {
			// Top-level only in v1 — no nested children.
			return [];
		}
		return Array.from(this.entries.keys());
	}

	/**
	 * Read-only access for command handlers (e.g. "View Memory", "Show Last
	 * Trace") so they can surface the persona metadata without re-importing
	 * the registry.
	 */
	getEntry(handle: string): { readonly persona: SpecialistPersona; readonly status: SpecialistStatus; readonly lastActiveAt: number | undefined; readonly lastTrace: string | undefined } | undefined {
		const entry = this.entries.get(handle);
		if (!entry) {
			return undefined;
		}
		return {
			persona: entry.persona,
			status: entry.status,
			lastActiveAt: entry.lastActiveAt,
			lastTrace: entry.lastTrace,
		};
	}

	/**
	 * Reset the row to `idle` and clear any in-flight trace. Used by the
	 * "Clear Thread" command; safe to call when the specialist has never
	 * been used.
	 */
	resetEntry(handle: string): void {
		const entry = this.entries.get(handle);
		if (!entry) {
			return;
		}
		this.cancelDecay(entry);
		entry.status = 'idle';
		entry.activeSubtaskId = undefined;
		entry.lastTrace = undefined;
		entry.lastActiveAt = undefined;
		this._onDidChangeTreeData.fire(handle);
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
		for (const entry of this.entries.values()) {
			this.cancelDecay(entry);
		}
		if (this.repaintTimer !== undefined) {
			clearInterval(this.repaintTimer);
			this.repaintTimer = undefined;
		}
		this._onDidChangeTreeData.dispose();
	}

	private handleAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case 'subtask-started': {
				this.transition(event.assignee, {
					status: 'thinking',
					lastActiveAt: Date.now(),
					activeSubtaskId: event.subtaskId,
					lastTrace: `Started: ${event.instruction}`,
				});
				return;
			}
			case 'subtask-token': {
				// First token after the start signals tool use is unlikely;
				// flip back from `running tool` to `thinking` only if we
				// already know the subtask is in flight. Token events fire
				// at high cadence so we keep this branch idempotent.
				const handle = this.lookupAssigneeBySubtask(event.subtaskId);
				if (!handle) {
					return;
				}
				const entry = this.entries.get(handle);
				if (!entry) {
					return;
				}
				entry.lastActiveAt = Date.now();
				if (entry.status !== 'thinking' && entry.status !== 'running tool') {
					entry.status = 'thinking';
					this._onDidChangeTreeData.fire(handle);
				}
				return;
			}
			case 'subtask-completed': {
				this.transition(event.assignee, {
					status: 'completed',
					lastActiveAt: Date.now(),
					activeSubtaskId: undefined,
					lastTrace: event.summary,
				});
				this.scheduleDecay(event.assignee, COMPLETED_DECAY_MS);
				return;
			}
			case 'subtask-failed': {
				this.transition(event.assignee, {
					status: 'failed',
					lastActiveAt: Date.now(),
					activeSubtaskId: undefined,
					lastTrace: event.error,
				});
				this.scheduleDecay(event.assignee, FAILED_DECAY_MS);
				return;
			}
			case 'subtask-blocked': {
				this.transition(event.assignee, {
					status: 'failed',
					lastActiveAt: Date.now(),
					activeSubtaskId: undefined,
					lastTrace: `Blocked: ${event.reason}`,
				});
				this.scheduleDecay(event.assignee, FAILED_DECAY_MS);
				return;
			}
			case 'subtask-reassigned': {
				// The previous assignee falls back to idle (they were waiting
				// on a dispatch that never happened); the new assignee picks
				// up the active subtask id.
				this.transition(event.from, {
					status: 'idle',
					activeSubtaskId: undefined,
				});
				this.transition(event.to, {
					status: 'thinking',
					lastActiveAt: Date.now(),
					activeSubtaskId: event.subtaskId,
				});
				return;
			}
			case 'subtask-ready': {
				// Promotion to ready is informational here — the row stays
				// idle until dispatch fires `subtask-started`.
				return;
			}
			default:
				return;
		}
	}

	/**
	 * Apply a partial update to the named entry and fire a tree-change event.
	 * Cancels any pending auto-decay so a fresh `subtask-started` doesn't get
	 * stomped by the previous run's "back to idle" timer.
	 */
	private transition(handle: string, patch: Partial<RosterEntry>): void {
		const entry = this.entries.get(handle);
		if (!entry) {
			// Unknown specialist (e.g. an experimental handle not in PERSONAS).
			// Silently ignore — the roster only lists registered personas.
			return;
		}
		this.cancelDecay(entry);
		Object.assign(entry, patch);
		this._onDidChangeTreeData.fire(handle);
	}

	private scheduleDecay(handle: string, delayMs: number): void {
		const entry = this.entries.get(handle);
		if (!entry) {
			return;
		}
		this.cancelDecay(entry);
		entry.decayHandle = setTimeout(() => {
			entry.decayHandle = undefined;
			// Only revert if no fresh activity has overtaken the timer.
			if (entry.status === 'completed' || entry.status === 'failed') {
				entry.status = 'idle';
				this._onDidChangeTreeData.fire(handle);
			}
		}, delayMs);
	}

	private cancelDecay(entry: RosterEntry): void {
		if (entry.decayHandle !== undefined) {
			clearTimeout(entry.decayHandle);
			entry.decayHandle = undefined;
		}
	}

	private lookupAssigneeBySubtask(subtaskId: string): string | undefined {
		for (const [handle, entry] of this.entries) {
			if (entry.activeSubtaskId === subtaskId) {
				return handle;
			}
		}
		return undefined;
	}
}

/**
 * Map a status to its `ThemeIcon`. Codicon names + theme colour tokens
 * survive theme switches without per-theme overrides — VS Code remaps the
 * stroke colour to whichever palette is active.
 */
function iconForStatus(status: SpecialistStatus): vscode.ThemeIcon {
	switch (status) {
		case 'thinking':
			return new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.blue'));
		case 'running tool':
			return new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.yellow'));
		case 'completed':
			return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
		case 'failed':
			return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
		case 'idle':
		default:
			return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
	}
}

/**
 * Compose a tooltip surface that combines the persona's voice line with
 * runtime context (current status, last activity). Multi-line so VS Code
 * renders it as a stacked tooltip.
 */
function buildTooltip(entry: RosterEntry): string {
	const lines: string[] = [];
	lines.push(`${entry.persona.monogram}  ${entry.persona.id}`);
	if (entry.persona.tagline) {
		lines.push(entry.persona.tagline);
	}
	if (entry.persona.voice) {
		lines.push('');
		lines.push(entry.persona.voice);
	}
	lines.push('');
	lines.push(`Status: ${entry.status}`);
	lines.push(`Last active: ${formatLastActive(entry.lastActiveAt)}`);
	if (entry.lastTrace) {
		lines.push('');
		lines.push(`Last trace: ${truncate(entry.lastTrace, 240)}`);
	}
	return lines.join('\n');
}

function truncate(value: string, max: number): string {
	if (value.length <= max) {
		return value;
	}
	return value.slice(0, max - 1) + '…';
}

/**
 * Format a millisecond timestamp as the compact `Xm ago` / `Xh ago`
 * convention used elsewhere in the chat sidebar. Returns `'—'` when the
 * specialist has never been used in this window.
 */
export function formatLastActive(timestamp: number | undefined): string {
	if (!timestamp) {
		return '—';
	}
	const diff = Math.max(0, Date.now() - timestamp);
	const seconds = Math.floor(diff / 1000);
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
	return `${days}d ago`;
}
