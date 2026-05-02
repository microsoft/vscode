/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AuthWizard, ProviderId } from '../../browser/authWizard.js';

interface CallLog {
	connectCalls: string[];
	openApiKeyCalls: number;
	skipCalls: number;
	completeCalls: number;
}

suite('AuthWizard', () => {

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeWizard(opts?: {
		connect?: (id: string) => Promise<void>;
	}): { wizard: AuthWizard; container: HTMLElement; log: CallLog } {
		const container = document.createElement('div');
		const log: CallLog = { connectCalls: [], openApiKeyCalls: 0, skipCalls: 0, completeCalls: 0 };
		const wizard = store.add(new AuthWizard(container, {
			connect: async id => {
				log.connectCalls.push(id);
				if (opts?.connect) {
					await opts.connect(id);
				}
			},
			openApiKeySettings: () => { log.openApiKeyCalls++; },
			skip: () => { log.skipCalls++; },
		}));
		store.add(wizard.onDidComplete(() => { log.completeCalls++; }));
		return { wizard, container, log };
	}

	function buttonFor(container: HTMLElement, providerId: ProviderId): HTMLButtonElement {
		const row = container.querySelector<HTMLElement>(`[data-provider="${providerId}"]`);
		assert.ok(row, `row for ${providerId} should exist`);
		const button = row.querySelector<HTMLButtonElement>('a.monaco-button, button.monaco-button');
		assert.ok(button, `button for ${providerId} should exist`);
		return button;
	}

	function rowStateFor(container: HTMLElement, providerId: ProviderId): {
		classes: string[];
		statusText: string;
		buttonDisabled: boolean;
	} {
		const row = container.querySelector<HTMLElement>(`[data-provider="${providerId}"]`)!;
		const status = row.querySelector<HTMLElement>('.sessions-auth-wizard-row-status')!;
		const button = buttonFor(container, providerId);
		return {
			classes: row.classList.toString().split(/\s+/).filter(Boolean).sort(),
			statusText: status.textContent ?? '',
			buttonDisabled: button.classList.contains('disabled') || button.getAttribute('aria-disabled') === 'true',
		};
	}

	test('initial render lists every provider and disables unavailable ones', () => {
		const { container } = makeWizard();
		const expected: Record<ProviderId, { classes: string[]; statusText: string; buttonDisabled: boolean }> = {
			'anthropic-oauth': {
				classes: ['recommended', 'sessions-auth-wizard-row'],
				statusText: '',
				buttonDisabled: false,
			},
			'chatgpt-oauth': {
				classes: ['sessions-auth-wizard-row', 'unavailable'],
				statusText: 'Coming soon',
				buttonDisabled: true,
			},
			'copilot': {
				classes: ['sessions-auth-wizard-row', 'unavailable'],
				statusText: 'Coming soon',
				buttonDisabled: true,
			},
			'api-keys': {
				classes: ['sessions-auth-wizard-row'],
				statusText: '',
				buttonDisabled: false,
			},
			'skip': {
				classes: ['sessions-auth-wizard-row'],
				statusText: '',
				buttonDisabled: false,
			},
		};

		const actual: typeof expected = {} as typeof expected;
		for (const id of Object.keys(expected) as ProviderId[]) {
			actual[id] = rowStateFor(container, id);
		}

		assert.deepStrictEqual(actual, expected);
	});

	test('skip fires onDidComplete and notifies handler without connecting', () => {
		const { container, log } = makeWizard();
		buttonFor(container, 'skip').click();
		assert.deepStrictEqual(log, {
			connectCalls: [],
			openApiKeyCalls: 0,
			skipCalls: 1,
			completeCalls: 1,
		});
	});

	test('api-keys opens settings and completes', () => {
		const { container, log } = makeWizard();
		buttonFor(container, 'api-keys').click();
		assert.deepStrictEqual(log, {
			connectCalls: [],
			openApiKeyCalls: 1,
			skipCalls: 0,
			completeCalls: 1,
		});
	});

	test('successful connect transitions through connecting -> connected and completes', async () => {
		const { container, log } = makeWizard({
			connect: () => Promise.resolve(),
		});

		buttonFor(container, 'anthropic-oauth').click();

		// connecting: row has connecting class, status text is set
		const connecting = rowStateFor(container, 'anthropic-oauth');
		assert.deepStrictEqual(
			{ hasClass: connecting.classes.includes('connecting'), status: connecting.statusText, disabled: connecting.buttonDisabled },
			{ hasClass: true, status: 'Opening browser…', disabled: true },
		);

		// Let connect promise resolve
		await new Promise(r => setTimeout(r, 0));

		const connected = rowStateFor(container, 'anthropic-oauth');
		assert.deepStrictEqual(
			{
				hasClass: connected.classes.includes('connected'),
				status: connected.statusText,
				connectCalls: log.connectCalls,
				completes: log.completeCalls,
			},
			{ hasClass: true, status: 'Connected', connectCalls: ['anthropic-oauth'], completes: 1 },
		);
	});

	test('failed connect surfaces error message, leaves wizard open, and re-enables retry', async () => {
		const { container, log } = makeWizard({
			connect: () => Promise.reject(new Error('OAuth failed: HTTP 401')),
		});

		buttonFor(container, 'anthropic-oauth').click();
		await new Promise(r => setTimeout(r, 0));

		const errored = rowStateFor(container, 'anthropic-oauth');
		assert.deepStrictEqual(
			{
				hasClass: errored.classes.includes('errored'),
				status: errored.statusText,
				disabled: errored.buttonDisabled,
				completes: log.completeCalls,
			},
			{ hasClass: true, status: 'OAuth failed: HTTP 401', disabled: false, completes: 0 },
		);
	});

	test('setStatus updates the row in place', () => {
		const { wizard, container } = makeWizard();
		wizard.setStatus('anthropic-oauth', { kind: 'connected', subtitle: 'opus + sonnet + haiku' });
		const state = rowStateFor(container, 'anthropic-oauth');
		assert.deepStrictEqual(
			{ hasClass: state.classes.includes('connected'), status: state.statusText },
			{ hasClass: true, status: 'opus + sonnet + haiku' },
		);
	});
});
