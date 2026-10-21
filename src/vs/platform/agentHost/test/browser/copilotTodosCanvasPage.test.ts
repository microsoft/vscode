/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentSessionPlan } from '../../common/agent.js';
import { renderCopilotTodosCanvasPage } from '../../common/copilotTodosCanvasPage.js';

interface IPageHarness {
	readonly document: Document;
	/** Plan reads in request order; complete them in any order to simulate slow responses. */
	readonly reads: DeferredPromise<IAgentSessionPlan>[];
	readonly events: FakeEventSource;
	/** Emits an SSE `change` event as the server would. */
	signalChange(): void;
	text(selector: string): string[];
}

class FakeEventSource {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;
	static instances: FakeEventSource[] = [];
	readyState = FakeEventSource.CONNECTING;
	private readonly listeners = new Map<string, ((event: Event) => void)[]>();
	constructor(readonly url: string) {
		FakeEventSource.instances.push(this);
	}
	addEventListener(type: string, listener: (event: Event) => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	dispatch(type: string): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(new Event(type));
		}
	}
}

suite('Copilot todos canvas page', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** Loads the rendered page into an iframe whose network is replaced by the harness. */
	async function loadPage(): Promise<IPageHarness> {
		const iframe = document.createElement('iframe');
		store.add(toDisposable(() => iframe.remove()));
		const reads: DeferredPromise<IAgentSessionPlan>[] = [];
		const loaded = new DeferredPromise<void>();
		iframe.addEventListener('load', () => loaded.complete());
		document.body.appendChild(iframe);
		// The CSP meta tag is dropped so the test can install its fakes before the page script runs.
		const html = renderCopilotTodosCanvasPage('test-nonce').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
		const frameWindow = iframe.contentWindow as Window & { fetch: typeof fetch; EventSource: unknown };
		frameWindow.document.open();
		Object.defineProperty(frameWindow, 'fetch', {
			configurable: true,
			value: () => {
				const read = new DeferredPromise<IAgentSessionPlan>();
				reads.push(read);
				return read.p.then(plan => ({ ok: true, status: 200, statusText: 'OK', json: async () => plan }));
			},
		});
		Object.defineProperty(frameWindow, 'EventSource', { configurable: true, value: FakeEventSource });
		FakeEventSource.instances = [];
		frameWindow.document.write(html);
		frameWindow.document.close();
		await loaded.p;
		const events = FakeEventSource.instances[0];
		return {
			document: frameWindow.document,
			reads,
			events,
			signalChange: () => events.dispatch('change'),
			text: selector => [...frameWindow.document.querySelectorAll(selector)].map(element => element.textContent ?? ''),
		};
	}

	const plan = (todos: IAgentSessionPlan['todos'], dependencies: IAgentSessionPlan['dependencies'] = [], content: string | null = null): IAgentSessionPlan => ({
		plan: { exists: content !== null, content, path: content !== null ? '/plan.md' : null },
		todos,
		dependencies,
	});

	test('groups todos by status, lists unmet blockers by title and renders the plan', async () => {
		const page = await loadPage();
		page.reads[0].complete(plan([
			{ id: 'a', title: 'Design <b>it</b>', status: 'done', description: null },
			{ id: 'b', title: 'Build it', status: 'in_progress', description: 'In flight' },
			{ id: 'c', title: 'Ship it', status: 'pending', description: null },
			{ id: 'd', title: 'Celebrate', status: 'pending', description: null },
			{ id: 'e', title: 'Mystery', status: 'waiting_on_user', description: null },
		], [
			{ todoId: 'c', dependsOn: 'b' },
			{ todoId: 'c', dependsOn: 'a' },
			{ todoId: 'd', dependsOn: 'missing' },
		], '# Plan\n\n- [x] done step\n- [ ] `next` step\n'));
		await timeout(0);

		assert.deepStrictEqual({
			groups: page.text('h2'),
			titles: page.text('.todo .title').map(text => text.replace(/ \(.*\)$/, '')),
			blockers: page.text('.deps'),
			summary: page.text('#summary'),
			progressLabel: page.document.querySelector('[role=progressbar]')?.getAttribute('aria-labelledby'),
			planItems: page.text('.plan li'),
			rawStatus: page.text('.raw-status'),
			injectedMarkup: page.document.querySelector('.todo b'),
		}, {
			groups: ['In Progress', 'Ready', 'Blocked', 'Other', 'Done', 'Plan'],
			titles: ['Build it', 'Celebrate', 'Ship it', 'Mystery', 'Design <b>it</b>'],
			blockers: ['Blocked by: Build it'],
			summary: ['1 of 5 done'],
			progressLabel: 'summary',
			planItems: ['☑done step', '☐next step'],
			rawStatus: ['waiting_on_user'],
			injectedMarkup: null,
		});
	});

	test('renders todos whose ids collide with Object.prototype names', async () => {
		const page = await loadPage();
		page.reads[0].complete(plan([
			{ id: 'constructor', title: 'Constructor todo', status: 'pending', description: null },
			{ id: '__proto__', title: 'Proto todo', status: 'pending', description: null },
			{ id: 'toString', title: 'Stringy', status: 'done', description: null },
		], [{ todoId: 'constructor', dependsOn: '__proto__' }]));
		await timeout(0);

		assert.deepStrictEqual({
			titles: page.text('.todo .title').map(text => text.replace(/ \(.*\)$/, '')),
			blockers: page.text('.deps'),
		}, {
			titles: ['Proto todo', 'Constructor todo', 'Stringy'],
			blockers: ['Blocked by: Proto todo'],
		});
	});

	test('ignores a slower, older read that completes after a newer one', async () => {
		const page = await loadPage();
		page.signalChange();
		await timeout(200);
		const [older, newer] = page.reads;
		newer.complete(plan([{ id: 'a', title: 'Task', status: 'done', description: null }]));
		await timeout(0);
		const afterNewer = page.text('#summary');
		older.complete(plan([{ id: 'a', title: 'Task', status: 'pending', description: null }]));
		await timeout(0);

		assert.deepStrictEqual({ reads: page.reads.length, afterNewer, afterOlder: page.text('#summary') }, {
			reads: 2,
			afterNewer: ['1 of 1 done'],
			afterOlder: ['1 of 1 done'],
		});
	});

	test('reports render failures and a permanently closed stream instead of staying on stale content', async () => {
		const page = await loadPage();
		// A malformed payload makes the renderer throw inside the success path.
		page.reads[0].complete({ plan: { exists: false, content: null, path: null }, todos: 'oops' as unknown as IAgentSessionPlan['todos'], dependencies: [] });
		await timeout(0);
		const renderFailure = page.text('#connection');
		page.events.readyState = FakeEventSource.OPEN;
		page.events.dispatch('open');
		const afterOpen = page.text('#connection');
		page.events.readyState = FakeEventSource.CONNECTING;
		page.events.dispatch('error');
		const whileReconnecting = page.text('#connection');
		page.events.readyState = FakeEventSource.CLOSED;
		page.events.dispatch('error');

		assert.deepStrictEqual({ renderFailure: renderFailure[0]?.startsWith('Couldn\'t load todos:'), afterOpen, whileReconnecting, closed: page.text('#connection') }, {
			renderFailure: true,
			afterOpen: ['Live'],
			whileReconnecting: ['Reconnecting…'],
			closed: ['No longer updating. Reopen the canvas to see the latest todos.'],
		});
	});

	test('shows the empty state without a plan', async () => {
		const page = await loadPage();
		page.reads[0].complete(plan([]));
		await timeout(0);

		assert.deepStrictEqual(page.text('.empty'), [
			'No todos yet. Items the agent records with its planning tools appear here as it works.',
			'No plan document yet.',
		]);
	});
});
