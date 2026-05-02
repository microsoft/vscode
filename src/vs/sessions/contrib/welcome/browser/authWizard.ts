/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/authWizard.css';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';

export type ProviderId = 'anthropic-oauth' | 'chatgpt-oauth' | 'copilot' | 'api-keys' | 'skip';

export type ProviderStatus =
	| { kind: 'idle' }
	| { kind: 'unavailable'; message: string }
	| { kind: 'connecting' }
	| { kind: 'connected'; subtitle?: string }
	| { kind: 'error'; message: string };

export interface ProviderEntry {
	readonly id: ProviderId;
	readonly title: string;
	readonly description: string;
	readonly icon: Codicon;
	readonly status: ProviderStatus;
	readonly recommended?: boolean;
	readonly cta: string;
}

export interface AuthWizardHandlers {
	connect(providerId: Exclude<ProviderId, 'api-keys' | 'skip'>): Promise<void>;
	openApiKeySettings(): void;
	skip(): void;
}

const DEFAULT_ENTRIES: ReadonlyArray<ProviderEntry> = [
	{
		id: 'anthropic-oauth',
		title: localize('authWizard.claude.title', "Connect Claude"),
		description: localize('authWizard.claude.description', "Use your Claude.ai subscription. Recommended for the orchestrator agent."),
		icon: Codicon.sparkle,
		status: { kind: 'idle' },
		recommended: true,
		cta: localize('authWizard.claude.cta', "Connect"),
	},
	{
		id: 'chatgpt-oauth',
		title: localize('authWizard.chatgpt.title', "Connect ChatGPT / Codex"),
		description: localize('authWizard.chatgpt.description', "Use your ChatGPT Plus subscription for Codex models."),
		icon: Codicon.commentDiscussion,
		status: { kind: 'unavailable', message: localize('authWizard.comingSoon', "Coming soon") },
		cta: localize('authWizard.connect', "Connect"),
	},
	{
		id: 'copilot',
		title: localize('authWizard.copilot.title', "Connect GitHub Copilot"),
		description: localize('authWizard.copilot.description', "Use your Copilot subscription to access hosted Claude, GPT, and Gemini models."),
		icon: Codicon.githubAlt,
		status: { kind: 'unavailable', message: localize('authWizard.comingSoon', "Coming soon") },
		cta: localize('authWizard.connect', "Connect"),
	},
	{
		id: 'api-keys',
		title: localize('authWizard.apiKeys.title', "Use API keys (advanced)"),
		description: localize('authWizard.apiKeys.description', "Provide your own Anthropic, OpenAI, or OpenRouter API key in settings."),
		icon: Codicon.key,
		status: { kind: 'idle' },
		cta: localize('authWizard.apiKeys.cta', "Open Settings"),
	},
	{
		id: 'skip',
		title: localize('authWizard.skip.title', "Skip for now"),
		description: localize('authWizard.skip.description', "Browse the IDE without an agent connection. You can connect later from the welcome screen."),
		icon: Codicon.arrowRight,
		status: { kind: 'idle' },
		cta: localize('authWizard.skip.cta', "Skip"),
	},
];

/**
 * Multi-provider sign-in wizard shown on first launch.
 *
 * The wizard is a passive UI: it renders the provider list and emits events
 * when the user picks one. Wiring those events to the credential broker is
 * the caller's responsibility.
 */
export class AuthWizard extends Disposable {

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private readonly statuses = new Map<ProviderId, ProviderStatus>();
	private readonly rowElements = new Map<ProviderId, HTMLElement>();
	private readonly buttons = new Map<ProviderId, Button>();
	private firstActionableButton: Button | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly handlers: AuthWizardHandlers,
		entries: ReadonlyArray<ProviderEntry> = DEFAULT_ENTRIES,
	) {
		super();
		for (const entry of entries) {
			this.statuses.set(entry.id, entry.status);
		}
		this.render(entries);
	}

	/** Move keyboard focus to the first actionable button. */
	focus(): void {
		this.firstActionableButton?.focus();
	}

	/** Update a provider's status; re-renders the affected row. */
	setStatus(providerId: ProviderId, status: ProviderStatus): void {
		this.statuses.set(providerId, status);
		this.refreshRow(providerId);
	}

	private render(entries: ReadonlyArray<ProviderEntry>): void {
		clearNode(this.container);
		this.container.classList.add('sessions-auth-wizard');

		const header = append(this.container, $('.sessions-auth-wizard-header'));
		const iconEl = append(header, $('span.sessions-auth-wizard-icon'));
		iconEl.appendChild(renderIcon(Codicon.agent));
		append(header, $('h2', undefined, localize('authWizard.title', "Get started with Son of Anton")));
		append(header, $('p.sessions-auth-wizard-subtitle', undefined,
			localize('authWizard.subtitle', "Connect a coding subscription to chat with agents.")));

		const list = append(this.container, $('.sessions-auth-wizard-list'));
		for (const entry of entries) {
			this.renderRow(list, entry);
		}
	}

	private renderRow(parent: HTMLElement, entry: ProviderEntry): void {
		const row = append(parent, $('.sessions-auth-wizard-row'));
		row.setAttribute('data-provider', entry.id);
		if (entry.recommended) {
			row.classList.add('recommended');
		}
		this.rowElements.set(entry.id, row);

		const iconEl = append(row, $('span.sessions-auth-wizard-row-icon'));
		iconEl.appendChild(renderIcon(entry.icon));

		const body = append(row, $('.sessions-auth-wizard-row-body'));
		const titleRow = append(body, $('.sessions-auth-wizard-row-title-row'));
		append(titleRow, $('span.sessions-auth-wizard-row-title', undefined, entry.title));
		if (entry.recommended) {
			append(titleRow, $('span.sessions-auth-wizard-row-badge', undefined,
				localize('authWizard.recommended', "Recommended")));
		}
		append(body, $('p.sessions-auth-wizard-row-description', undefined, entry.description));
		const status = append(body, $('p.sessions-auth-wizard-row-status'));
		status.style.display = 'none';

		const action = append(row, $('.sessions-auth-wizard-row-action'));
		const button = this._register(new Button(action, { ...defaultButtonStyles, secondary: !entry.recommended }));
		button.label = entry.cta;
		this.buttons.set(entry.id, button);
		this._register(button.onDidClick(() => this.onAction(entry.id)));

		if (!this.firstActionableButton && this.statuses.get(entry.id)?.kind !== 'unavailable') {
			this.firstActionableButton = button;
		}

		this.refreshRow(entry.id);
	}

	private refreshRow(providerId: ProviderId): void {
		const row = this.rowElements.get(providerId);
		const button = this.buttons.get(providerId);
		if (!row || !button) {
			return;
		}
		const status = this.statuses.get(providerId) ?? { kind: 'idle' };
		const statusEl = row.querySelector<HTMLElement>('.sessions-auth-wizard-row-status');

		row.classList.toggle('connecting', status.kind === 'connecting');
		row.classList.toggle('connected', status.kind === 'connected');
		row.classList.toggle('errored', status.kind === 'error');
		row.classList.toggle('unavailable', status.kind === 'unavailable');

		switch (status.kind) {
			case 'idle':
				button.enabled = true;
				if (statusEl) {
					statusEl.textContent = '';
					statusEl.style.display = 'none';
				}
				break;
			case 'unavailable':
				button.enabled = false;
				if (statusEl) {
					statusEl.textContent = status.message;
					statusEl.style.display = '';
				}
				break;
			case 'connecting':
				button.enabled = false;
				if (statusEl) {
					statusEl.textContent = localize('authWizard.connecting', "Opening browser…");
					statusEl.style.display = '';
				}
				break;
			case 'connected':
				button.enabled = false;
				if (statusEl) {
					statusEl.textContent = status.subtitle ?? localize('authWizard.connected', "Connected");
					statusEl.style.display = '';
				}
				break;
			case 'error':
				button.enabled = true;
				if (statusEl) {
					statusEl.textContent = status.message;
					statusEl.style.display = '';
				}
				break;
		}
	}

	private async onAction(providerId: ProviderId): Promise<void> {
		switch (providerId) {
			case 'skip':
				this.handlers.skip();
				this._onDidComplete.fire();
				return;
			case 'api-keys':
				this.handlers.openApiKeySettings();
				this._onDidComplete.fire();
				return;
			default:
				await this.runConnect(providerId);
		}
	}

	private async runConnect(providerId: Exclude<ProviderId, 'api-keys' | 'skip'>): Promise<void> {
		this.setStatus(providerId, { kind: 'connecting' });
		try {
			await this.handlers.connect(providerId);
			this.setStatus(providerId, { kind: 'connected' });
			this._onDidComplete.fire();
		} catch (err) {
			const message = err instanceof Error
				? err.message
				: localize('authWizard.connectFailed', "Connection failed");
			this.setStatus(providerId, { kind: 'error', message });
		}
	}
}
