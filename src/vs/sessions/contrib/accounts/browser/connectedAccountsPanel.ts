/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/connectedAccountsPanel.css';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';

export type AccountRowStatus =
	| { kind: 'connected' }
	| { kind: 'disconnected' }
	| { kind: 'refresh-failed'; message: string }
	| { kind: 'connecting' }
	| { kind: 'disconnecting' };

export interface AccountRow {
	readonly id: string;
	readonly displayName: string;
	readonly icon: Codicon;
	readonly status: AccountRowStatus;
	/** Unix timestamp (ms) when the current token expires. */
	readonly expiresAt?: number;
	/** Optional quota/window summary surfaced from provider response headers. */
	readonly quotaFragment?: string;
}

export interface ConnectedAccountsPanelHandlers {
	connect(providerId: string): Promise<void>;
	disconnect(providerId: string): Promise<void>;
}

/** Emitted when the user clicks a connect/disconnect button. */
export type PanelActionEvent =
	| { type: 'connect'; providerId: string }
	| { type: 'disconnect'; providerId: string };

/**
 * Connected-accounts panel rendered inside the accounts view pane.
 *
 * Displays each registered provider as a row with status, optional expiry /
 * quota info, and a Connect or Disconnect button. The component is passive:
 * all state changes flow in via `setRows()`; user interactions are forwarded
 * to the injected handlers.
 */
export class ConnectedAccountsPanel extends Disposable {

	private readonly _onDidAction = this._register(new Emitter<PanelActionEvent>());
	readonly onDidAction: Event<PanelActionEvent> = this._onDidAction.event;

	private readonly rowStatuses = new Map<string, AccountRowStatus>();
	private readonly rowElements = new Map<string, HTMLElement>();
	private readonly buttons = new Map<string, Button>();

	private listEl: HTMLElement | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly handlers: ConnectedAccountsPanelHandlers,
	) {
		super();
		this.renderShell();
	}

	/**
	 * Replace the displayed provider list.
	 * Existing rows whose id is not in the new list are removed; new rows are
	 * appended; existing rows are updated in-place.
	 */
	setRows(rows: ReadonlyArray<AccountRow>): void {
		if (!this.listEl) {
			return;
		}

		const incoming = new Set(rows.map(r => r.id));

		// Remove stale rows
		for (const id of this.rowElements.keys()) {
			if (!incoming.has(id)) {
				this.rowElements.get(id)?.remove();
				this.rowElements.delete(id);
				this.buttons.get(id)?.dispose();
				this.buttons.delete(id);
				this.rowStatuses.delete(id);
			}
		}

		// Add or update rows
		for (const row of rows) {
			this.rowStatuses.set(row.id, row.status);
			if (this.rowElements.has(row.id)) {
				this.refreshRow(row);
			} else {
				this.renderRow(this.listEl, row);
			}
		}
	}

	/** Optimistically update a single row's status without a full re-render. */
	setRowStatus(providerId: string, status: AccountRowStatus): void {
		this.rowStatuses.set(providerId, status);
		const row = this.rowElements.get(providerId);
		if (row) {
			this.refreshRowFromMap(providerId, row);
		}
	}

	private renderShell(): void {
		clearNode(this.container);
		this.container.classList.add('sota-accounts-panel');

		const header = append(this.container, $('.sota-accounts-panel-header'));
		append(header, $('h2', undefined, localize('accounts.title', "Connected Accounts")));
		append(header, $('p.sota-accounts-panel-subtitle', undefined,
			localize('accounts.subtitle', "Manage the coding subscriptions Son of Anton uses for inference.")));

		this.listEl = append(this.container, $('.sota-accounts-panel-list'));
	}

	private renderRow(parent: HTMLElement, row: AccountRow): void {
		const el = append(parent, $('.sota-accounts-panel-row'));
		el.setAttribute('data-provider', row.id);
		this.rowElements.set(row.id, el);

		const iconEl = append(el, $('span.sota-accounts-panel-row-icon'));
		iconEl.appendChild(renderIcon(row.icon));

		const body = append(el, $('.sota-accounts-panel-row-body'));
		append(body, $('span.sota-accounts-panel-row-title', undefined, row.displayName));

		const meta = append(body, $('.sota-accounts-panel-row-meta'));
		meta.setAttribute('data-meta', '');

		const actionEl = append(el, $('.sota-accounts-panel-row-action'));
		const button = this._register(new Button(actionEl, { ...defaultButtonStyles, secondary: true }));
		this.buttons.set(row.id, button);

		this._register(button.onDidClick(() => this.onRowAction(row.id)));

		this.refreshRow(row);
	}

	private refreshRow(row: AccountRow): void {
		const el = this.rowElements.get(row.id);
		if (!el) {
			return;
		}
		this.refreshRowFromMap(row.id, el);
		this.refreshMeta(el, row);
	}

	private refreshRowFromMap(id: string, el: HTMLElement): void {
		const status = this.rowStatuses.get(id) ?? { kind: 'disconnected' };
		const button = this.buttons.get(id);

		el.classList.toggle('sota-status-connected', status.kind === 'connected');
		el.classList.toggle('sota-status-disconnected', status.kind === 'disconnected');
		el.classList.toggle('sota-status-refresh-failed', status.kind === 'refresh-failed');
		el.classList.toggle('sota-status-connecting', status.kind === 'connecting');
		el.classList.toggle('sota-status-disconnecting', status.kind === 'disconnecting');

		if (!button) {
			return;
		}

		switch (status.kind) {
			case 'connected':
				button.label = localize('accounts.disconnect', "Disconnect");
				button.enabled = true;
				break;
			case 'disconnected':
				button.label = localize('accounts.connect', "Connect");
				button.enabled = true;
				break;
			case 'refresh-failed':
				button.label = localize('accounts.reconnect', "Reconnect");
				button.enabled = true;
				break;
			case 'connecting':
			case 'disconnecting':
				button.label = status.kind === 'connecting'
					? localize('accounts.connecting', "Connecting…")
					: localize('accounts.disconnecting', "Disconnecting…");
				button.enabled = false;
				break;
		}
	}

	private refreshMeta(el: HTMLElement, row: AccountRow): void {
		const meta = el.querySelector<HTMLElement>('[data-meta]');
		if (!meta) {
			return;
		}
		clearNode(meta);

		const status = row.status;

		const statusText = this.statusText(status);
		if (statusText) {
			const statusEl = append(meta, $('span.sota-accounts-panel-row-status'));
			statusEl.textContent = statusText;
		}

		if (status.kind === 'connected' && row.expiresAt !== undefined) {
			const expiryEl = append(meta, $('span.sota-accounts-panel-row-expiry'));
			expiryEl.textContent = this.formatExpiry(row.expiresAt);
		}

		if (row.quotaFragment) {
			const quotaEl = append(meta, $('span.sota-accounts-panel-row-quota'));
			quotaEl.textContent = row.quotaFragment;
		}
	}

	private statusText(status: AccountRowStatus): string | undefined {
		switch (status.kind) {
			case 'connected': return localize('accounts.status.connected', "Connected");
			case 'disconnected': return localize('accounts.status.disconnected', "Not connected");
			case 'refresh-failed': return status.message;
			case 'connecting': return localize('accounts.status.connecting', "Opening browser…");
			case 'disconnecting': return localize('accounts.status.disconnecting', "Disconnecting…");
		}
	}

	private formatExpiry(expiresAt: number): string {
		const remaining = expiresAt - Date.now();
		if (remaining <= 0) {
			return localize('accounts.expired', "Token expired");
		}
		const minutes = Math.floor(remaining / 60_000);
		if (minutes < 60) {
			return localize('accounts.expiresInMinutes', "Expires in {0} min", minutes);
		}
		const hours = Math.floor(minutes / 60);
		return localize('accounts.expiresInHours', "Expires in {0} h", hours);
	}

	private async onRowAction(providerId: string): Promise<void> {
		const status = this.rowStatuses.get(providerId);
		if (!status || status.kind === 'connecting' || status.kind === 'disconnecting') {
			return;
		}

		if (status.kind === 'connected') {
			this.setRowStatus(providerId, { kind: 'disconnecting' });
			this._onDidAction.fire({ type: 'disconnect', providerId });
			try {
				await this.handlers.disconnect(providerId);
				this.setRowStatus(providerId, { kind: 'disconnected' });
			} catch {
				this.setRowStatus(providerId, { kind: 'connected' });
			}
		} else {
			this.setRowStatus(providerId, { kind: 'connecting' });
			this._onDidAction.fire({ type: 'connect', providerId });
			try {
				await this.handlers.connect(providerId);
				this.setRowStatus(providerId, { kind: 'connected' });
			} catch (err) {
				const message = err instanceof Error
					? err.message
					: localize('accounts.connectFailed', "Connection failed");
				this.setRowStatus(providerId, { kind: 'refresh-failed', message });
			}
		}
	}
}

/** Default provider metadata (icons, display names). */
export const KNOWN_PROVIDERS: ReadonlyArray<Pick<AccountRow, 'id' | 'displayName' | 'icon'>> = [
	{ id: 'anthropic-oauth', displayName: localize('accounts.provider.claude', "Claude (Anthropic)"), icon: Codicon.sparkle },
	{ id: 'chatgpt-oauth', displayName: localize('accounts.provider.chatgpt', "ChatGPT / Codex"), icon: Codicon.commentDiscussion },
	{ id: 'copilot', displayName: localize('accounts.provider.copilot', "GitHub Copilot"), icon: Codicon.githubAlt },
];
