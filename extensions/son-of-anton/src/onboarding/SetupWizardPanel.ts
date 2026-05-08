/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LlmClient } from 'son-of-anton-core/llm/LlmClient';
import { CredentialBroker } from 'son-of-anton-core/auth/CredentialBroker';
import { detectCredentials } from 'son-of-anton-core/credentials/credentialDetection';
import { ProviderId, saveProviderCredentials } from 'son-of-anton-core/credentials/providerCredentialSaver';

export const SETUP_WIZARD_SKIPPED_KEY = 'sotaOnboarding.setupWizardSkipped';

export interface SetupWizardDeps {
	readonly llmClient: LlmClient;
	readonly broker: CredentialBroker;
	readonly secrets: vscode.SecretStorage;
	readonly config: vscode.WorkspaceConfiguration;
}

interface SaveCredentialsMessage {
	type: 'save-credentials';
	provider: ProviderId;
	fields: Record<string, string>;
}

interface SkipMessage {
	type: 'skip';
}

interface OpenLinkMessage {
	type: 'open-link';
	url: string;
}

interface RefreshStatusMessage {
	type: 'refresh-status';
}

type IncomingMessage = SaveCredentialsMessage | SkipMessage | OpenLinkMessage | RefreshStatusMessage;

/** Webview-side typing is opaque; this is the unavoidable shim for postMessage. */
type WebviewMessage = unknown;

export class SetupWizardPanel {
	static readonly VIEW_TYPE = 'sota.setupWizard';
	static currentPanel: SetupWizardPanel | undefined;

	private readonly disposables: vscode.Disposable[] = [];

	static createOrShow(context: vscode.ExtensionContext, deps: SetupWizardDeps): void {
		if (SetupWizardPanel.currentPanel) {
			SetupWizardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			SetupWizardPanel.VIEW_TYPE,
			'Son of Anton — Setup',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
			},
		);

		SetupWizardPanel.currentPanel = new SetupWizardPanel(panel, context, deps);
	}

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly context: vscode.ExtensionContext,
		private readonly deps: SetupWizardDeps,
	) {
		this.panel.webview.html = this.renderHtml();
		this.panel.webview.onDidReceiveMessage(
			(message: WebviewMessage) => { void this.handleMessage(message); },
			null,
			this.disposables,
		);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		void this.pushStatus();
	}

	dispose(): void {
		SetupWizardPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length > 0) {
			const d = this.disposables.pop();
			d?.dispose();
		}
	}

	private async handleMessage(raw: WebviewMessage): Promise<void> {
		const message = raw as Partial<IncomingMessage> | undefined;
		if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
			return;
		}

		switch (message.type) {
			case 'save-credentials':
				await this.handleSave(message as SaveCredentialsMessage);
				return;
			case 'skip': {
				await this.context.globalState.update(SETUP_WIZARD_SKIPPED_KEY, true);
				this.dispose();
				return;
			}
			case 'open-link': {
				const url = (message as OpenLinkMessage).url;
				if (typeof url === 'string' && /^https?:\/\//.test(url)) {
					await vscode.env.openExternal(vscode.Uri.parse(url));
				}
				return;
			}
			case 'refresh-status':
				await this.pushStatus();
				return;
		}
	}

	private async handleSave(message: SaveCredentialsMessage): Promise<void> {
		const { provider, fields } = message;
		const result = await saveProviderCredentials(provider, fields, {
			llmClient: this.deps.llmClient,
			secrets: this.deps.secrets,
			config: this.deps.config,
		});
		this.panel.webview.postMessage({
			type: 'save-result',
			provider,
			ok: result.ok,
			message: result.message,
			deferred: result.deferred ?? false,
		});
		if (result.ok) {
			await this.pushStatus();
		}
	}

	private async pushStatus(): Promise<void> {
		const state = await detectCredentials(this.deps.secrets, this.deps.config, this.deps.broker);
		this.panel.webview.postMessage({ type: 'status', state });
	}

	private renderHtml(): string {
		const cspSource = this.panel.webview.cspSource;
		const nonce = randomNonce();
		// Inline styles + script kept self-contained so the wizard is one file
		// to scan; the surface area is small enough that splitting into
		// media/setup-wizard.css / .js would obscure rather than help.
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
	<title>Son of Anton Setup</title>
	<style>
		:root {
			--pad: 16px;
			--gap: 12px;
			--radius: 8px;
			--muted: var(--vscode-descriptionForeground);
			--border: var(--vscode-panel-border, var(--vscode-editorWidget-border, transparent));
		}
		* { box-sizing: border-box; }
		html, body {
			margin: 0; padding: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
		}
		.shell { max-width: 760px; margin: 0 auto; padding: 32px var(--pad); }
		h1 { font-size: 1.6em; margin: 0 0 8px; }
		h2 { font-size: 1.1em; margin: 24px 0 8px; }
		p.lede { color: var(--muted); margin: 0 0 24px; line-height: 1.5; }
		.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap); }
		.card {
			border: 1px solid var(--border);
			border-radius: var(--radius);
			padding: var(--pad);
			cursor: pointer;
			background: var(--vscode-editorWidget-background, transparent);
			text-align: left;
			color: inherit;
			font: inherit;
			transition: border-color 120ms ease;
		}
		.card:hover, .card:focus { outline: none; border-color: var(--vscode-focusBorder); }
		.card .name { font-weight: 600; margin-bottom: 4px; }
		.card .desc { color: var(--muted); font-size: 0.9em; line-height: 1.45; }
		.card .badge {
			display: inline-block;
			margin-top: 8px;
			font-size: 0.75em;
			padding: 2px 6px;
			border-radius: 999px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.card.connected { border-color: var(--vscode-charts-green, var(--vscode-focusBorder)); }
		.card.connected .badge { background: var(--vscode-charts-green, var(--vscode-badge-background)); }
		form { display: none; flex-direction: column; gap: var(--gap); margin-top: 12px; }
		form.active { display: flex; }
		label { display: flex; flex-direction: column; gap: 4px; font-size: 0.9em; }
		label span.hint { color: var(--muted); font-size: 0.85em; }
		input, select {
			padding: 6px 8px;
			border-radius: 4px;
			border: 1px solid var(--vscode-input-border, var(--border));
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font: inherit;
		}
		input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
		.row-buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
		button.primary, button.secondary, button.link {
			padding: 6px 14px;
			border-radius: 4px;
			border: 1px solid transparent;
			cursor: pointer;
			font: inherit;
		}
		button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
		button.primary:hover { background: var(--vscode-button-hoverBackground); }
		button.secondary {
			background: var(--vscode-button-secondaryBackground, transparent);
			color: var(--vscode-button-secondaryForeground, inherit);
			border-color: var(--vscode-button-border, var(--border));
		}
		button.link {
			background: transparent; color: var(--vscode-textLink-foreground);
			padding: 0; border: none; text-decoration: underline;
		}
		.status {
			margin-top: 8px; padding: 8px 10px; border-radius: 4px; font-size: 0.9em;
			display: none;
		}
		.status.ok { display: block; background: rgba(0, 128, 0, 0.12); color: var(--vscode-charts-green, var(--vscode-foreground)); }
		.status.err { display: block; background: rgba(255, 0, 0, 0.12); color: var(--vscode-errorForeground); }
		.status.pending { display: block; background: var(--vscode-inputValidation-infoBackground, rgba(0, 122, 204, 0.12)); }
		.skip-row { margin-top: 32px; display: flex; justify-content: flex-end; }
		.back { color: var(--muted); cursor: pointer; background: transparent; border: none; font: inherit; padding: 0; margin-bottom: 8px; }
		.back:hover { color: var(--vscode-foreground); }
		.section { display: none; }
		.section.active { display: block; }
	</style>
</head>
<body>
	<main class="shell">
		<h1>Welcome to Son of Anton</h1>
		<p class="lede">Pick a model provider to get started. You can switch between providers at any time, and add more later from the command palette.</p>

		<section id="picker" class="section active">
			<div class="cards">
				<button class="card" data-provider="anthropic" type="button">
					<div class="name">Anthropic (Claude)</div>
					<div class="desc">Direct Claude API. Uses an API key from console.anthropic.com.</div>
					<span class="badge" data-badge="anthropic">Not configured</span>
				</button>
				<button class="card" data-provider="openai" type="button">
					<div class="name">OpenAI (ChatGPT / Codex)</div>
					<div class="desc">GPT-4o and Codex via the OpenAI API. Uses an API key.</div>
					<span class="badge" data-badge="openai">Not configured</span>
				</button>
				<button class="card" data-provider="foundry" type="button">
					<div class="name">Microsoft Foundry / Azure OpenAI</div>
					<div class="desc">Azure-hosted OpenAI deployments. Needs an endpoint, key, and deployment name.</div>
					<span class="badge" data-badge="foundry">Not configured</span>
				</button>
				<button class="card" data-provider="bedrock" type="button">
					<div class="name">Amazon Bedrock</div>
					<div class="desc">Claude on AWS. Uses AWS credentials (profile or access keys).</div>
					<span class="badge" data-badge="bedrock">Not configured</span>
				</button>
				<button class="card" data-provider="google" type="button">
					<div class="name">Google Gemini</div>
					<div class="desc">Gemini Pro / Flash via Google AI Studio. Uses an API key.</div>
					<span class="badge" data-badge="google">Not configured</span>
				</button>
			</div>
			<div class="skip-row">
				<button class="secondary" id="skip-button" type="button">I'll set this up later</button>
			</div>
		</section>

		${this.renderProviderForm('anthropic', 'Anthropic API Key', 'https://console.anthropic.com/settings/keys', [
			{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...' },
		])}

		${this.renderProviderForm('openai', 'OpenAI API Key', 'https://platform.openai.com/api-keys', [
			{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
		])}

		${this.renderProviderForm('foundry', 'Microsoft Foundry / Azure OpenAI', 'https://portal.azure.com/#browse/Microsoft.CognitiveServices%2Faccounts', [
			{ name: 'endpoint', label: 'Endpoint URL', type: 'text', placeholder: 'https://my-resource.openai.azure.com', hint: 'No trailing slash. Find this in Keys and Endpoint in the Azure portal.' },
			{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'paste from Azure portal' },
			{ name: 'deployment', label: 'Deployment name', type: 'text', placeholder: 'e.g. gpt-4o-mini', hint: 'The name of an existing deployment in your Foundry resource.' },
		])}

		${this.renderProviderForm('bedrock', 'Amazon Bedrock', 'https://console.aws.amazon.com/bedrock/', [
			{
				name: 'region', label: 'Region', type: 'select', options: [
					'us-east-1', 'us-west-2', 'us-east-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'ap-northeast-1', 'ap-southeast-1', 'ap-southeast-2',
				], hint: 'Each region exposes a different subset of foundation models.',
			},
			{ name: 'profile', label: 'AWS Profile (optional)', type: 'text', placeholder: 'leave blank to use access keys', hint: 'If set, takes precedence over access keys and uses the standard AWS credential chain.' },
			{ name: 'accessKeyId', label: 'Access Key ID', type: 'password', placeholder: 'AKIA...' },
			{ name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '...' },
			{ name: 'sessionToken', label: 'Session Token (optional)', type: 'password', placeholder: 'for temporary STS credentials' },
		])}

		${this.renderProviderForm('google', 'Google Gemini API Key', 'https://aistudio.google.com/apikey', [
			{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'AIza...' },
		])}
	</main>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();

		const cards = document.querySelectorAll('.card');
		const sections = document.querySelectorAll('.section');
		const badges = document.querySelectorAll('[data-badge]');

		function show(sectionId) {
			sections.forEach(s => s.classList.toggle('active', s.id === sectionId));
		}

		cards.forEach(c => {
			c.addEventListener('click', () => {
				const provider = c.getAttribute('data-provider');
				show('form-' + provider);
			});
		});

		document.querySelectorAll('.back').forEach(b => {
			b.addEventListener('click', () => show('picker'));
		});

		document.getElementById('skip-button').addEventListener('click', () => {
			vscode.postMessage({ type: 'skip' });
		});

		document.querySelectorAll('button.link[data-href]').forEach(l => {
			l.addEventListener('click', () => {
				vscode.postMessage({ type: 'open-link', url: l.getAttribute('data-href') });
			});
		});

		document.querySelectorAll('form[data-provider]').forEach(form => {
			form.addEventListener('submit', ev => {
				ev.preventDefault();
				const provider = form.getAttribute('data-provider');
				const status = form.querySelector('.status');
				status.className = 'status pending';
				status.textContent = 'Saving and validating...';
				const fields = {};
				new FormData(form).forEach((value, key) => { fields[key] = String(value); });
				vscode.postMessage({ type: 'save-credentials', provider, fields });
			});
		});

		window.addEventListener('message', ev => {
			const msg = ev.data;
			if (!msg || typeof msg !== 'object') return;
			if (msg.type === 'save-result') {
				const form = document.querySelector('form[data-provider="' + msg.provider + '"]');
				if (!form) return;
				const status = form.querySelector('.status');
				status.className = 'status ' + (msg.ok ? 'ok' : 'err');
				status.textContent = msg.message;
				return;
			}
			if (msg.type === 'status') {
				const state = msg.state || {};
				badges.forEach(badge => {
					const provider = badge.getAttribute('data-badge');
					const entry = state[provider];
					const card = document.querySelector('.card[data-provider="' + provider + '"]');
					const connected = isConnected(provider, entry);
					if (card) card.classList.toggle('connected', connected);
					badge.textContent = connected ? 'Configured' : 'Not configured';
				});
			}
		});

		function isConnected(provider, entry) {
			if (!entry) return false;
			switch (provider) {
				case 'anthropic': return entry.hasApiKey || entry.hasOAuth;
				case 'openai': return entry.hasApiKey || entry.hasOAuth;
				case 'foundry': return entry.hasApiKey && entry.hasEndpoint;
				case 'bedrock': return entry.hasAccessKey || entry.hasProfile;
				case 'google': return entry.hasApiKey;
				default: return false;
			}
		}

		vscode.postMessage({ type: 'refresh-status' });
	</script>
</body>
</html>`;
	}

	private renderProviderForm(
		provider: ProviderId,
		title: string,
		helpLink: string,
		fields: ReadonlyArray<FormField>,
	): string {
		const inputs = fields.map(f => this.renderField(f)).join('\n');
		return `<section id="form-${provider}" class="section">
			<button class="back" type="button" data-target="picker">← Back to providers</button>
			<h2>${escapeHtml(title)}</h2>
			<p class="lede">
				<button class="link" type="button" data-href="${escapeHtml(helpLink)}">Where do I get one?</button>
			</p>
			<form data-provider="${provider}">
				${inputs}
				<div class="row-buttons">
					<button class="primary" type="submit">Save and validate</button>
					<button class="secondary back" type="button">Cancel</button>
				</div>
				<div class="status"></div>
			</form>
		</section>`;
	}

	private renderField(field: FormField): string {
		const id = `f-${field.name}`;
		const hint = field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : '';
		if (field.type === 'select') {
			const options = (field.options ?? []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
			return `<label for="${id}"><span>${escapeHtml(field.label)}</span>${hint}<select id="${id}" name="${escapeHtml(field.name)}">${options}</select></label>`;
		}
		const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
		return `<label for="${id}"><span>${escapeHtml(field.label)}</span>${hint}<input id="${id}" name="${escapeHtml(field.name)}" type="${field.type}" autocomplete="off" spellcheck="false"${placeholder} /></label>`;
	}
}

interface FormField {
	readonly name: string;
	readonly label: string;
	readonly type: 'text' | 'password' | 'select';
	readonly placeholder?: string;
	readonly hint?: string;
	readonly options?: ReadonlyArray<string>;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function randomNonce(): string {
	let nonce = '';
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
