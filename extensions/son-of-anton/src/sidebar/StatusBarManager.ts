/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { AgentManager } from 'son-of-anton-core/agents/AgentManager';
import { CredentialBroker } from 'son-of-anton-core/auth/CredentialBroker';
import type { ProviderStatus } from 'son-of-anton-core/auth/types';

/**
 * Manages the status bar items for Son of Anton.
 *
 * Layout decision: TWO side-by-side left-aligned status bar items rather than
 * one combined entry.
 *  - The agent item (priority 100) keeps its existing click target
 *    (sota.openChat) and behaviour (spinner / hubot icon depending on whether
 *    any agent task is running).
 *  - The auth item (priority 99) is independent and reflects OAuth provider
 *    connection state. When nothing is connected it offers a single click to
 *    sign in (sota.signInClaude); when one or more providers are connected it
 *    routes the click through sota.signOutAll for quick disconnect.
 *
 * Splitting the items keeps the agent-task display intact (no string-juggling
 * with provider state) and gives each entry a dedicated tooltip + command.
 */
export class StatusBarManager implements vscode.Disposable {
	private readonly agentItem: vscode.StatusBarItem;
	private readonly authItem: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly broker: CredentialBroker;

	constructor(agentManager: AgentManager, broker: CredentialBroker) {
		this.broker = broker;

		// --- Agent task indicator (existing behaviour preserved) ---
		this.agentItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.agentItem.command = 'sota.openChat';
		this.agentItem.tooltip = 'Son of Anton';
		this.updateAgent(agentManager.hasActiveAgents());
		this.agentItem.show();

		this.disposables.push(
			agentManager.onDidChangeTasks(() => {
				this.updateAgent(agentManager.hasActiveAgents());
			})
		);

		// --- Auth / provider indicator (new) ---
		this.authItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			99
		);
		this.authItem.show();

		// Render the disconnected baseline immediately so the item shows up on
		// activation; then kick off the async status fetch which will replace
		// the placeholder once it resolves.
		this.renderAuth([]);
		void this.refreshAuth();

		// CredentialBroker exposes onDidDisconnect; there is no onDidConnect
		// hook today, so the connect-side refresh is driven by the sign-in
		// commands (extension.ts) calling refreshAuth() after a successful
		// connect attempt.
		this.broker.onDidDisconnect(() => {
			void this.refreshAuth();
		});
	}

	/**
	 * Re-fetch broker status and re-render the auth status bar item.
	 * Exposed so command handlers can refresh after sign-in / sign-out.
	 */
	async refreshAuth(): Promise<void> {
		try {
			const providers = await this.broker.status();
			this.renderAuth(providers);
		} catch {
			// status() should not throw, but guard so a transient failure does
			// not leave the status bar in a broken state.
			this.renderAuth([]);
		}
	}

	private updateAgent(hasActiveAgents: boolean): void {
		if (hasActiveAgents) {
			this.agentItem.text = '$(sync~spin) Son of Anton';
			this.agentItem.tooltip = 'Son of Anton — agents running';
		} else {
			this.agentItem.text = '$(hubot) Son of Anton';
			this.agentItem.tooltip = 'Son of Anton — idle';
		}
	}

	private renderAuth(providers: ReadonlyArray<ProviderStatus>): void {
		const connected = providers.filter(p => p.connected);

		if (connected.length === 0) {
			this.authItem.text = '$(account) Sign in';
			this.authItem.command = 'sota.signInClaude';
		} else if (connected.length === 1) {
			this.authItem.text = `$(account) ${connected[0].displayName}`;
			this.authItem.command = 'sota.signOutAll';
		} else {
			this.authItem.text = `$(account) ${connected.length} providers`;
			this.authItem.command = 'sota.signOutAll';
		}

		this.authItem.tooltip = this.buildTooltip(providers);
	}

	private buildTooltip(providers: ReadonlyArray<ProviderStatus>): vscode.MarkdownString {
		const md = new vscode.MarkdownString(undefined, true);
		md.isTrusted = false;
		md.supportThemeIcons = true;

		if (providers.length === 0) {
			md.appendMarkdown('**Son of Anton**\n\nNo providers configured. Click to sign in.');
			return md;
		}

		md.appendMarkdown('**Son of Anton — Providers**\n\n');
		const lines: string[] = [];
		for (const p of providers) {
			if (p.connected) {
				lines.push(`- ${p.displayName}: connected${this.formatExpiry(p.expiresAt)}`);
			} else {
				lines.push(`- ${p.displayName}: not connected`);
			}
		}
		md.appendMarkdown(lines.join('\n'));
		// Keep tooltip concise: cap to <400 chars to satisfy the spec.
		const text = md.value;
		if (text.length > 380) {
			const truncated = new vscode.MarkdownString(text.slice(0, 377) + '...', true);
			truncated.supportThemeIcons = true;
			return truncated;
		}
		return md;
	}

	private formatExpiry(expiresAt?: number): string {
		if (typeof expiresAt !== 'number' || expiresAt <= 0) {
			return '';
		}
		const remainingMs = expiresAt - Date.now();
		if (remainingMs <= 0) {
			return ' (expired)';
		}
		const minutes = Math.round(remainingMs / 60000);
		if (minutes < 60) {
			return ` (expires in ${minutes}m)`;
		}
		const hours = Math.round(minutes / 60);
		if (hours < 48) {
			return ` (expires in ${hours}h)`;
		}
		const days = Math.round(hours / 24);
		return ` (expires in ${days}d)`;
	}

	dispose(): void {
		this.agentItem.dispose();
		this.authItem.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
