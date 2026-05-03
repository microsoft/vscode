/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/multiSessionListPanel.css';
import { $, EventType, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import {
	MultiSessionListRow,
	MultiSessionListRowStatus,
	formatElapsed,
} from '../common/multiSessionListModel.js';

export interface MultiSessionListPanelHandlers {
	/** Called when the user picks a session row. */
	openSession(resource: URI): void;
}

interface RowEntry {
	readonly el: HTMLElement;
	readonly statusEl: HTMLElement;
	readonly labelEl: HTMLElement;
	readonly providerEl: HTMLElement;
	readonly elapsedEl: HTMLElement;
	readonly descriptionEl: HTMLElement;
	readonly disposables: DisposableStore;
	row: MultiSessionListRow;
}

const STATUS_LABELS: Record<MultiSessionListRowStatus, string> = {
	[MultiSessionListRowStatus.Failed]: localize('multiSession.status.failed', "Failed"),
	[MultiSessionListRowStatus.Completed]: localize('multiSession.status.completed', "Completed"),
	[MultiSessionListRowStatus.InProgress]: localize('multiSession.status.inProgress', "Running"),
	[MultiSessionListRowStatus.NeedsInput]: localize('multiSession.status.needsInput', "Needs input"),
};

const STATUS_ICONS: Record<MultiSessionListRowStatus, Codicon> = {
	[MultiSessionListRowStatus.Failed]: Codicon.error,
	[MultiSessionListRowStatus.Completed]: Codicon.check,
	[MultiSessionListRowStatus.InProgress]: Codicon.sync,
	[MultiSessionListRowStatus.NeedsInput]: Codicon.question,
};

/**
 * Renders the live agent-session list as a nested tree.
 *
 * The component is passive: rows flow in via `setRows()`; user interactions
 * are forwarded to the injected handlers. Depth is rendered as left-padding
 * plus a connector dot so orchestrator-spawned specialists visually nest under
 * their parent.
 */
export class MultiSessionListPanel extends Disposable {

	private readonly _onDidSelectSession = this._register(new Emitter<URI>());
	readonly onDidSelectSession: Event<URI> = this._onDidSelectSession.event;

	private readonly entries = new Map<string, RowEntry>();

	private listEl: HTMLElement | undefined;
	private emptyStateEl: HTMLElement | undefined;

	private activeResourceKey: string | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly handlers: MultiSessionListPanelHandlers,
	) {
		super();
		this.renderShell();
	}

	/**
	 * Replace the displayed rows. Existing rows whose resource is no longer
	 * present are removed; new rows are appended; existing rows are updated in
	 * place. Order in the DOM mirrors `rows`.
	 */
	setRows(rows: ReadonlyArray<MultiSessionListRow>): void {
		if (!this.listEl) {
			return;
		}

		const incoming = new Set(rows.map(r => r.resource.toString()));
		for (const [key, entry] of this.entries) {
			if (!incoming.has(key)) {
				entry.disposables.dispose();
				entry.el.remove();
				this.entries.delete(key);
			}
		}

		for (const row of rows) {
			const key = row.resource.toString();
			const existing = this.entries.get(key);
			if (existing) {
				existing.row = row;
				this.refreshEntry(existing);
			} else {
				this.renderEntry(row);
			}
		}

		this.reorderRows(rows);
		this.refreshActiveHighlight();
		this.refreshEmptyState(rows.length === 0);
	}

	/** Mark a row as active. Pass `undefined` to clear the highlight. */
	setActiveResource(resource: URI | undefined): void {
		this.activeResourceKey = resource?.toString();
		this.refreshActiveHighlight();
	}

	private renderShell(): void {
		clearNode(this.container);
		this.container.classList.add('multi-session-panel');

		const header = append(this.container, $('.multi-session-panel-header'));
		append(header, $('h2', undefined, localize('multiSession.title', "Active Sessions")));
		append(header, $('p.multi-session-panel-subtitle', undefined,
			localize('multiSession.subtitle', "Orchestrator and specialist sessions running in parallel.")));

		this.listEl = append(this.container, $('.multi-session-panel-list'));

		this.emptyStateEl = append(this.container, $('.multi-session-panel-empty.hidden'));
		this.emptyStateEl.textContent = localize('multiSession.empty', "No active sessions yet.");
	}

	private renderEntry(row: MultiSessionListRow): void {
		if (!this.listEl) {
			return;
		}
		const el = append(this.listEl, $('.multi-session-panel-row'));
		el.setAttribute('data-resource', row.resource.toString());
		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');

		const statusEl = append(el, $('span.multi-session-panel-row-status'));

		const body = append(el, $('.multi-session-panel-row-body'));
		const titleRow = append(body, $('.multi-session-panel-row-title-row'));
		const labelEl = append(titleRow, $('span.multi-session-panel-row-label'));
		const providerEl = append(titleRow, $('span.multi-session-panel-row-provider'));
		const descriptionEl = append(body, $('span.multi-session-panel-row-description'));

		const elapsedEl = append(el, $('span.multi-session-panel-row-elapsed'));

		const disposables = new DisposableStore();
		disposables.add(addDisposableListener(el, EventType.CLICK, () => this.fireSelect(row.resource)));
		disposables.add(addDisposableListener(el, EventType.KEY_DOWN, e => {
			const event = e as KeyboardEvent;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				this.fireSelect(row.resource);
			}
		}));

		const entry: RowEntry = {
			el,
			statusEl,
			labelEl,
			providerEl,
			elapsedEl,
			descriptionEl,
			disposables,
			row,
		};
		this.entries.set(row.resource.toString(), entry);
		this.refreshEntry(entry);
	}

	private refreshEntry(entry: RowEntry): void {
		const { row } = entry;

		entry.el.style.setProperty('--multi-session-depth', String(row.depth));
		entry.el.classList.toggle('has-children', row.hasChildren);

		entry.el.classList.remove('status-failed', 'status-completed', 'status-in-progress', 'status-needs-input');
		entry.el.classList.add(`status-${row.status}`);

		clearNode(entry.statusEl);
		entry.statusEl.appendChild(renderIcon(STATUS_ICONS[row.status]));
		entry.statusEl.setAttribute('title', STATUS_LABELS[row.status]);
		entry.statusEl.setAttribute('aria-label', STATUS_LABELS[row.status]);

		entry.labelEl.textContent = row.label;
		entry.providerEl.textContent = row.providerType;
		entry.elapsedEl.textContent = formatElapsed(row.elapsedMs);

		if (row.description) {
			entry.descriptionEl.textContent = row.description;
			entry.descriptionEl.classList.remove('hidden');
		} else {
			entry.descriptionEl.textContent = '';
			entry.descriptionEl.classList.add('hidden');
		}
	}

	private reorderRows(rows: ReadonlyArray<MultiSessionListRow>): void {
		if (!this.listEl) {
			return;
		}
		for (const row of rows) {
			const entry = this.entries.get(row.resource.toString());
			if (entry) {
				this.listEl.appendChild(entry.el);
			}
		}
	}

	private refreshActiveHighlight(): void {
		for (const [key, entry] of this.entries) {
			entry.el.classList.toggle('active', key === this.activeResourceKey);
		}
	}

	private refreshEmptyState(empty: boolean): void {
		this.emptyStateEl?.classList.toggle('hidden', !empty);
	}

	private fireSelect(resource: URI): void {
		this._onDidSelectSession.fire(resource);
		this.handlers.openSession(resource);
	}

	override dispose(): void {
		for (const entry of this.entries.values()) {
			entry.disposables.dispose();
		}
		this.entries.clear();
		super.dispose();
	}
}
