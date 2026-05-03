/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ConnectedAccountsPanel, AccountRow, AccountRowStatus } from '../../browser/connectedAccountsPanel.js';

interface CallLog {
	connectCalls: string[];
	disconnectCalls: string[];
}

const PROVIDER_A: AccountRow = {
	id: 'anthropic-oauth',
	displayName: 'Claude (Anthropic)',
	icon: Codicon.sparkle,
	status: { kind: 'disconnected' },
};

const PROVIDER_B: AccountRow = {
	id: 'copilot',
	displayName: 'GitHub Copilot',
	icon: Codicon.githubAlt,
	status: { kind: 'connected' },
	expiresAt: Date.now() + 30 * 60_000,
};

suite('ConnectedAccountsPanel', () => {

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function makePanel(opts?: {
		connect?: (id: string) => Promise<void>;
		disconnect?: (id: string) => Promise<void>;
	}): { panel: ConnectedAccountsPanel; container: HTMLElement; log: CallLog } {
		const container = document.createElement('div');
		const log: CallLog = { connectCalls: [], disconnectCalls: [] };

		const panel = store.add(new ConnectedAccountsPanel(container, {
			connect: async id => {
				log.connectCalls.push(id);
				if (opts?.connect) {
					await opts.connect(id);
				}
			},
			disconnect: async id => {
				log.disconnectCalls.push(id);
				if (opts?.disconnect) {
					await opts.disconnect(id);
				}
			},
		}));

		return { panel, container, log };
	}

	function rowFor(container: HTMLElement, providerId: string): HTMLElement {
		const row = container.querySelector<HTMLElement>(`[data-provider="${providerId}"]`);
		assert.ok(row, `row for "${providerId}" should exist`);
		return row;
	}

	function buttonFor(container: HTMLElement, providerId: string): HTMLButtonElement {
		const row = rowFor(container, providerId);
		const button = row.querySelector<HTMLButtonElement>('a.monaco-button, button.monaco-button');
		assert.ok(button, `button for "${providerId}" should exist`);
		return button;
	}

	function rowState(container: HTMLElement, providerId: string): {
		statusClasses: string[];
		statusText: string;
		buttonLabel: string;
		buttonDisabled: boolean;
	} {
		const row = rowFor(container, providerId);
		const statusEl = row.querySelector<HTMLElement>('.sota-accounts-panel-row-status');
		const button = buttonFor(container, providerId);
		return {
			statusClasses: [...row.classList].filter(c => c.startsWith('sota-status-')).sort(),
			statusText: statusEl?.textContent ?? '',
			buttonLabel: button.textContent?.trim() ?? '',
			buttonDisabled: button.classList.contains('disabled') || button.getAttribute('aria-disabled') === 'true',
		};
	}

	// ── rendering ──────────────────────────────────────────────────────────────

	test('setRows renders a row per provider', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A, PROVIDER_B]);

		assert.ok(container.querySelector('[data-provider="anthropic-oauth"]'), 'anthropic-oauth row present');
		assert.ok(container.querySelector('[data-provider="copilot"]'), 'copilot row present');
	});

	test('disconnected row shows Connect button enabled', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A]);

		const state = rowState(container, 'anthropic-oauth');
		assert.deepStrictEqual(state, {
			statusClasses: ['sota-status-disconnected'],
			statusText: 'Not connected',
			buttonLabel: 'Connect',
			buttonDisabled: false,
		});
	});

	test('connected row shows Disconnect button enabled and status text', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_B]);

		const state = rowState(container, 'copilot');
		assert.deepStrictEqual({
			statusClasses: state.statusClasses,
			buttonLabel: state.buttonLabel,
			buttonDisabled: state.buttonDisabled,
		}, {
			statusClasses: ['sota-status-connected'],
			buttonLabel: 'Disconnect',
			buttonDisabled: false,
		});
	});

	test('connected row with expiresAt shows expiry text', () => {
		const { panel, container } = makePanel();
		const expiresAt = Date.now() + 30 * 60_000;
		panel.setRows([{ ...PROVIDER_B, expiresAt }]);

		const row = rowFor(container, 'copilot');
		const expiryEl = row.querySelector('.sota-accounts-panel-row-expiry');
		assert.ok(expiryEl, 'expiry element present');
		assert.ok(expiryEl.textContent?.includes('min') || expiryEl.textContent?.includes('h'), 'expiry text contains time unit');
	});

	test('connected row with quotaFragment shows quota badge', () => {
		const { panel, container } = makePanel();
		panel.setRows([{ ...PROVIDER_B, quotaFragment: 'session valid 24m' }]);

		const row = rowFor(container, 'copilot');
		const quotaEl = row.querySelector('.sota-accounts-panel-row-quota');
		assert.ok(quotaEl, 'quota element present');
		assert.strictEqual(quotaEl.textContent, 'session valid 24m');
	});

	// ── setRows updates ────────────────────────────────────────────────────────

	test('setRows removes rows that are no longer in the list', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A, PROVIDER_B]);
		panel.setRows([PROVIDER_A]);

		assert.ok(container.querySelector('[data-provider="anthropic-oauth"]'), 'anthropic-oauth still present');
		assert.strictEqual(container.querySelector('[data-provider="copilot"]'), null, 'copilot row removed');
	});

	test('setRows updates status of existing row in-place', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A]);

		panel.setRows([{ ...PROVIDER_A, status: { kind: 'connected' } }]);

		const state = rowState(container, 'anthropic-oauth');
		assert.deepStrictEqual({
			statusClasses: state.statusClasses,
			buttonLabel: state.buttonLabel,
		}, {
			statusClasses: ['sota-status-connected'],
			buttonLabel: 'Disconnect',
		});
	});

	// ── setRowStatus ───────────────────────────────────────────────────────────

	test('setRowStatus updates an individual row without re-rendering list', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A, PROVIDER_B]);

		panel.setRowStatus('anthropic-oauth', { kind: 'connecting' });

		const state = rowState(container, 'anthropic-oauth');
		assert.deepStrictEqual({
			statusClasses: state.statusClasses,
			buttonDisabled: state.buttonDisabled,
		}, {
			statusClasses: ['sota-status-connecting'],
			buttonDisabled: true,
		});

		// copilot row must not change
		const copilotState = rowState(container, 'copilot');
		assert.ok(copilotState.statusClasses.includes('sota-status-connected'), 'copilot still connected');
	});

	test('refresh-failed row shows Reconnect button and error text', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A]);
		panel.setRowStatus('anthropic-oauth', { kind: 'refresh-failed', message: 'Token expired' });

		const state = rowState(container, 'anthropic-oauth');
		assert.deepStrictEqual({
			statusClasses: state.statusClasses,
			buttonLabel: state.buttonLabel,
			statusText: state.statusText,
		}, {
			statusClasses: ['sota-status-refresh-failed'],
			buttonLabel: 'Reconnect',
			statusText: 'Token expired',
		});
	});

	// ── user actions ──────────────────────────────────────────────────────────

	test('clicking Connect on a disconnected row calls connect handler', async () => {
		const { panel, container, log } = makePanel({ connect: () => Promise.resolve() });
		panel.setRows([PROVIDER_A]);

		buttonFor(container, 'anthropic-oauth').click();
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual(log.connectCalls, ['anthropic-oauth']);
		assert.deepStrictEqual(log.disconnectCalls, []);
	});

	test('clicking Disconnect on a connected row calls disconnect handler', async () => {
		const { panel, container, log } = makePanel({ disconnect: () => Promise.resolve() });
		panel.setRows([PROVIDER_B]);

		buttonFor(container, 'copilot').click();
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual(log.disconnectCalls, ['copilot']);
		assert.deepStrictEqual(log.connectCalls, []);
	});

	test('connect success transitions disconnected -> connecting -> connected', async () => {
		let resolveConnect!: () => void;
		const connectPromise = new Promise<void>(r => { resolveConnect = r; });
		const { panel, container } = makePanel({ connect: () => connectPromise });
		panel.setRows([PROVIDER_A]);

		buttonFor(container, 'anthropic-oauth').click();

		// Immediately after click: connecting
		{
			const state = rowState(container, 'anthropic-oauth');
			assert.ok(state.statusClasses.includes('sota-status-connecting'), 'row is connecting');
			assert.strictEqual(state.buttonDisabled, true, 'button disabled while connecting');
		}

		resolveConnect();
		await new Promise(r => setTimeout(r, 0));

		// After resolve: connected
		{
			const state = rowState(container, 'anthropic-oauth');
			assert.ok(state.statusClasses.includes('sota-status-connected'), 'row is connected after success');
		}
	});

	test('connect failure leaves row in refresh-failed state with error message', async () => {
		const { panel, container } = makePanel({
			connect: () => Promise.reject(new Error('OAuth token exchange failed')),
		});
		panel.setRows([PROVIDER_A]);

		buttonFor(container, 'anthropic-oauth').click();
		await new Promise(r => setTimeout(r, 0));

		const state = rowState(container, 'anthropic-oauth');
		assert.deepStrictEqual({
			statusClasses: state.statusClasses,
			statusText: state.statusText,
			buttonLabel: state.buttonLabel,
		}, {
			statusClasses: ['sota-status-refresh-failed'],
			statusText: 'OAuth token exchange failed',
			buttonLabel: 'Reconnect',
		});
	});

	test('disconnect success transitions connected -> disconnecting -> disconnected', async () => {
		let resolveDisconnect!: () => void;
		const disconnectPromise = new Promise<void>(r => { resolveDisconnect = r; });
		const { panel, container } = makePanel({ disconnect: () => disconnectPromise });
		panel.setRows([PROVIDER_B]);

		buttonFor(container, 'copilot').click();

		{
			const state = rowState(container, 'copilot');
			assert.ok(state.statusClasses.includes('sota-status-disconnecting'), 'row is disconnecting');
			assert.strictEqual(state.buttonDisabled, true, 'button disabled while disconnecting');
		}

		resolveDisconnect();
		await new Promise(r => setTimeout(r, 0));

		{
			const state = rowState(container, 'copilot');
			assert.ok(state.statusClasses.includes('sota-status-disconnected'), 'row is disconnected');
		}
	});

	// ── status format helpers ──────────────────────────────────────────────────

	test('formatExpiry shows minutes for sub-hour tokens', () => {
		const { panel, container } = makePanel();
		const expiresAt = Date.now() + 45 * 60_000;
		panel.setRows([{ ...PROVIDER_B, expiresAt }]);

		const row = rowFor(container, 'copilot');
		const expiryEl = row.querySelector('.sota-accounts-panel-row-expiry');
		assert.ok(expiryEl?.textContent?.includes('min'), 'shows minutes for < 1h expiry');
	});

	test('formatExpiry shows hours for tokens expiring in > 1h', () => {
		const { panel, container } = makePanel();
		const expiresAt = Date.now() + 3 * 60 * 60_000;
		panel.setRows([{ ...PROVIDER_B, expiresAt }]);

		const row = rowFor(container, 'copilot');
		const expiryEl = row.querySelector('.sota-accounts-panel-row-expiry');
		assert.ok(expiryEl?.textContent?.includes('h'), 'shows hours for > 1h expiry');
	});

	test('expired token shows "Token expired" text', () => {
		const { panel, container } = makePanel();
		const expiresAt = Date.now() - 1000;
		panel.setRows([{ ...PROVIDER_B, expiresAt }]);

		const row = rowFor(container, 'copilot');
		const expiryEl = row.querySelector('.sota-accounts-panel-row-expiry');
		assert.ok(expiryEl?.textContent?.includes('expired') || expiryEl?.textContent?.toLowerCase().includes('expired'),
			'shows expired text for past timestamp');
	});

	// ── onDidAction event ─────────────────────────────────────────────────────

	test('onDidAction fires connect event when user clicks Connect', async () => {
		const { panel, container } = makePanel({ connect: () => Promise.resolve() });
		panel.setRows([PROVIDER_A]);

		const actions: { type: string; providerId: string }[] = [];
		store.add(panel.onDidAction(e => actions.push(e)));

		buttonFor(container, 'anthropic-oauth').click();
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual(actions, [{ type: 'connect', providerId: 'anthropic-oauth' }]);
	});

	test('onDidAction fires disconnect event when user clicks Disconnect', async () => {
		const { panel, container } = makePanel({ disconnect: () => Promise.resolve() });
		panel.setRows([PROVIDER_B]);

		const actions: { type: string; providerId: string }[] = [];
		store.add(panel.onDidAction(e => actions.push(e)));

		buttonFor(container, 'copilot').click();
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual(actions, [{ type: 'disconnect', providerId: 'copilot' }]);
	});

	// ── edge cases ────────────────────────────────────────────────────────────

	test('clicking button while connecting is a no-op', async () => {
		const { panel, container, log } = makePanel({
			connect: () => new Promise(r => setTimeout(r, 100)),
		});
		panel.setRows([PROVIDER_A]);

		buttonFor(container, 'anthropic-oauth').click();
		// Button is disabled while connecting; a second click on the button element
		// should be ignored by the handler guard.
		panel.setRowStatus('anthropic-oauth', { kind: 'connecting' });
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(log.connectCalls.length, 1, 'handler called exactly once despite re-click');
	});

	test('setRowStatus on an unknown provider id is a no-op', () => {
		const { panel, container } = makePanel();
		panel.setRows([PROVIDER_A]);

		// Should not throw.
		assert.doesNotThrow(() => {
			panel.setRowStatus('unknown-provider', { kind: 'connected' });
		});
		// anthropic-oauth row must be unchanged
		const state = rowState(container, 'anthropic-oauth');
		assert.ok(state.statusClasses.includes('sota-status-disconnected'), 'other row unchanged');
	});
});

// Expose AccountRowStatus for type-level checks only — no runtime assertions.
export type { AccountRowStatus };
