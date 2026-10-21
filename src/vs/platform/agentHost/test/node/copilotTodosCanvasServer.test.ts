/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { language } from '../../../../base/common/platform.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentSessionPlan } from '../../common/agent.js';
import { CopilotTodosCanvasServer, type ICopilotTodosCanvasDataSource } from '../../node/copilot/copilotTodosCanvasServer.js';

const samplePlan: IAgentSessionPlan = {
	plan: { exists: true, content: '# Plan\n\n- [ ] ship it', path: '/sessions/abc/plan.md' },
	todos: [{ id: 'a', title: 'First <task>', status: 'done', description: null }, { id: 'b', title: 'Second', status: 'pending', description: 'After a' }],
	dependencies: [{ todoId: 'b', dependsOn: 'a' }],
};

interface IEventStream {
	readonly received: () => string;
	waitFor(text: string): Promise<void>;
	readonly ended: Promise<void>;
}

/** Opens an SSE response and exposes what it has streamed so far. */
async function openEventStream(url: string, disposables: Pick<DisposableStore, 'add'>): Promise<IEventStream> {
	const http = await import('http');
	return new Promise((resolve, reject) => {
		const request = http.get(url, response => {
			let received = '';
			const waiters: { text: string; deferred: DeferredPromise<void> }[] = [];
			const ended = new DeferredPromise<void>();
			response.setEncoding('utf8');
			response.on('data', (chunk: string) => {
				received += chunk;
				for (const waiter of [...waiters]) {
					if (received.includes(waiter.text)) {
						waiters.splice(waiters.indexOf(waiter), 1);
						waiter.deferred.complete();
					}
				}
			});
			response.on('end', () => ended.complete());
			response.on('error', () => ended.complete());
			disposables.add(toDisposable(() => request.destroy()));
			resolve({
				received: () => received,
				waitFor: text => {
					if (received.includes(text)) {
						return Promise.resolve();
					}
					const deferred = new DeferredPromise<void>();
					waiters.push({ text, deferred });
					return deferred.p;
				},
				ended: ended.p,
			});
		});
		request.on('error', reject);
	});
}

suite('CopilotTodosCanvasServer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSource(plan: () => Promise<IAgentSessionPlan>): { source: ICopilotTodosCanvasDataSource; fireChange: () => void } {
		const changes = disposables.add(new Emitter<void>());
		return { source: { readPlan: plan, onDidChange: changes.event }, fireChange: () => changes.fire() };
	}

	function createServer(): CopilotTodosCanvasServer {
		const server = new CopilotTodosCanvasServer(new NullLogService());
		disposables.add(toDisposable(() => server.dispose()));
		return server;
	}

	test('serves the page, the plan and change events until the presentation is disposed', async () => {
		const server = createServer();
		const { source, fireChange } = createSource(async () => samplePlan);
		const presentation = await server.present(source);
		disposables.add(presentation);
		// Keeps the listener bound after `presentation` ends, so its token is refused rather than unreachable.
		disposables.add(await server.present(createSource(async () => samplePlan).source));

		const page = await fetch(presentation.url);
		const pageBody = await page.text();
		const plan = await fetch(`${presentation.url}plan.json`);
		const planBody = await plan.json();
		const stream = await openEventStream(`${presentation.url}events`, disposables);
		await stream.waitFor(': connected');
		fireChange();
		await stream.waitFor('event: change');
		presentation.dispose();
		await stream.ended;
		const afterDispose = await fetch(presentation.url);

		assert.deepStrictEqual({
			url: /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/$/.test(presentation.url),
			page: { status: page.status, contentType: page.headers.get('content-type'), cacheControl: page.headers.get('cache-control'), hasTitle: pageBody.includes('<title>Todos</title>'), hasCsp: pageBody.includes('Content-Security-Policy'), hasNonce: /<script nonce="[^"]+">/.test(pageBody), lang: /<html lang="([^"]+)">/.exec(pageBody)?.[1] },
			plan: { status: plan.status, contentType: plan.headers.get('content-type'), body: planBody },
			change: stream.received().includes('event: change\ndata: {}\n\n'),
			afterDispose: afterDispose.status,
		}, {
			url: true,
			page: { status: 200, contentType: 'text/html; charset=utf-8', cacheControl: 'no-store', hasTitle: true, hasCsp: true, hasNonce: true, lang: language },
			plan: { status: 200, contentType: 'application/json; charset=utf-8', body: samplePlan },
			change: true,
			afterDispose: 404,
		});
	});

	test('rejects unknown tokens, extra path segments, unknown routes and other methods', async () => {
		const server = createServer();
		const { source } = createSource(async () => samplePlan);
		const presentation = await server.present(source);
		disposables.add(presentation);
		const base = new URL(presentation.url);

		const responses = await Promise.all([
			fetch(`${base.origin}/0123456789abcdef0123456789abcdef/`),
			fetch(`${base.origin}/`),
			fetch(`${presentation.url}plan.json/extra`),
			fetch(`${presentation.url}unknown`),
			fetch(`${presentation.url}plan.json`, { method: 'POST', body: '{}' }),
		]);
		await Promise.all(responses.map(response => response.arrayBuffer()));

		assert.deepStrictEqual({
			statuses: responses.map(response => response.status),
			methodNotAllowedHeaders: [responses[4].headers.get('allow'), responses[4].headers.get('x-content-type-options'), responses[4].headers.get('cache-control')],
		}, {
			statuses: [404, 404, 404, 404, 405],
			methodNotAllowedHeaders: ['GET', 'nosniff', 'no-store'],
		});
	});

	test('keeps notifying remaining streams after a subscriber disconnects', async () => {
		const server = createServer();
		const { source, fireChange } = createSource(async () => samplePlan);
		const presentation = await server.present(source);
		disposables.add(presentation);
		const errors: unknown[] = [];
		const onError = (error: unknown) => errors.push(error);
		process.on('uncaughtException', onError);
		disposables.add(toDisposable(() => process.off('uncaughtException', onError)));

		const dropped = new DisposableStore();
		const droppedStream = await openEventStream(`${presentation.url}events`, dropped);
		const kept = await openEventStream(`${presentation.url}events`, disposables);
		await Promise.all([droppedStream.waitFor(': connected'), kept.waitFor(': connected')]);
		dropped.dispose();
		await droppedStream.ended;
		// Fire before and after the server observes the disconnect; neither write may surface an error.
		fireChange();
		await kept.waitFor('event: change');
		await new Promise(resolve => setTimeout(resolve, 50));
		fireChange();
		await kept.waitFor('event: change\ndata: {}\n\nevent: change');

		assert.deepStrictEqual({ errors, keptChanges: kept.received().split('event: change').length - 1 }, { errors: [], keptChanges: 2 });
	});

	test('reports a failed plan read without ending the presentation', async () => {
		const server = createServer();
		let fail = true;
		const { source } = createSource(async () => {
			if (fail) {
				throw new Error('runtime unavailable');
			}
			return samplePlan;
		});
		const presentation = await server.present(source);
		disposables.add(presentation);

		const failed = await fetch(`${presentation.url}plan.json`);
		const failedBody = await failed.json();
		fail = false;
		const recovered = await fetch(`${presentation.url}plan.json`);
		await recovered.arrayBuffer();

		assert.deepStrictEqual({ failed: { status: failed.status, body: failedBody }, recovered: recovered.status }, {
			failed: { status: 503, body: { error: 'runtime unavailable' } },
			recovered: 200,
		});
	});

	test('shares one listener across presentations and closes it with the last one', async () => {
		const server = createServer();
		const first = await server.present(createSource(async () => samplePlan).source);
		disposables.add(first);
		const second = await server.present(createSource(async () => samplePlan).source);
		disposables.add(second);
		const firstUrl = new URL(first.url);
		const secondUrl = new URL(second.url);

		first.dispose();
		const secondStillServed = await fetch(`${second.url}plan.json`);
		await secondStillServed.arrayBuffer();
		const firstGone = await fetch(`${first.url}plan.json`);
		await firstGone.arrayBuffer();
		second.dispose();
		const listenerClosed = await fetch(`${second.url}plan.json`).then(() => false, () => true);

		assert.deepStrictEqual({
			sameOrigin: firstUrl.origin === secondUrl.origin,
			distinctTokens: firstUrl.pathname !== secondUrl.pathname,
			secondStillServed: secondStillServed.status,
			firstGone: firstGone.status,
			listenerClosed,
		}, {
			sameOrigin: true,
			distinctTokens: true,
			secondStillServed: 200,
			firstGone: 404,
			listenerClosed: true,
		});
	});
});
