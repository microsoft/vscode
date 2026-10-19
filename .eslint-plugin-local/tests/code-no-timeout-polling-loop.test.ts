/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import { resolve } from 'path';
import tseslint from 'typescript-eslint';
import rule from '../code-no-timeout-polling-loop.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const filename = resolve(import.meta.dirname, '../../src/vs/workbench/test/browser/example.test.ts');
const errors = [{ messageId: 'polling' }];

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-no-timeout-polling-loop', rule, {
	valid: [
		// the loop does work besides waiting
		{ filename, code: `async function f() { for (const chunk of chunks) { emitter.fire(chunk); await timeout(10); } }` },
		{ filename, code: `async function f() { for (const kind of ['a', 'b']) { service.dispatch(kind); await timeout(0); assert.ok(service.done); } }` },
		{ filename, code: `async function f() { while (!done) { clock.tick(1); await timeout(0); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 10 && !done; i++) { await timeout(1); release(); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 3; i++) { try { return await op(); } catch { await timeout(100); } } }` },
		{ filename, code: `async function f() { while (!done) { if (ready) { start(); } await timeout(1); } }` },
		{ filename, code: `async function f() { while (!done) { this.count = await read(); await timeout(1); } }` },
		// work in a branch that continues the loop
		{ filename, code: `async function f() { while (!done) { if (ready) { service.dispatch(); continue; } await timeout(1); } }` },
		// declarations and assignments that do work
		{ filename, code: `async function f() { for (const chunk of chunks) { const sent = socket.write(chunk); await timeout(10); } }` },
		{ filename, code: `async function f() { let sent; for (const chunk of chunks) { sent = socket.write(chunk); await timeout(10); } }` },
		{ filename, code: `async function f() { while (!done) { const editor = new Editor(); await timeout(10); } }` },
		// executors that wait on a signal or do work
		{ filename, code: `async function f() { while (!done) { await new Promise((resolve, reject) => { onDidChange(resolve); setTimeout(reject, 1000); }); } }` },
		{ filename, code: `async function f() { while (!done) { await new Promise(resolve => { emitter.fire(data); setTimeout(resolve, 10); }); } }` },
		{ filename, code: `async function f() { while (!done) { await new Promise((_, reject) => setTimeout(reject, 10)); } }` },
		// waiting on a signal
		{ filename, code: `async function f() { while (!done) { await Event.toPromise(onDidChange); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await promises[i]; } }` },
		// not awaited, or not a timer
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { timeout(1); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await barrier.wait(); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await new Promise(resolve => queueMicrotask(resolve)); } }` },
		// a timer within a nested function
		{ filename, code: `for (const name of names) { test(name, async () => { await timeout(1); }); }` },
		// virtual time
		{ filename, code: `test('x', () => runWithFakedTimers({}, async () => { for (let i = 0; i < 100 && !done; i++) { await timeout(1); } }));` },
		{ filename, code: `test('x', () => runWithFakedTimers({}, async () => { const waitFor = async () => { while (!done) { await timeout(1); } }; await waitFor(); }));` },
		{ filename, code: `test('x', () => runWithFakedTimers({ useFakeTimers: true }, async () => { while (!done) { await timeout(1); } }));` },
		{ filename, code: `test('x', () => runWithFakedTimers({}, async () => { await runWithFakedTimers({ useFakeTimers: false }, async () => { while (!done) { await timeout(1); } }); }));` },
		// excluded file
		{ filename, code: `async function f() { while (!done) { await timeout(1); } }`, options: [{ exclude: ['/example.test.ts'] }] },
	],
	invalid: [
		// bounded poll
		{ filename, code: `async function f() { for (let i = 0; i < 100 && agent.historyHits === 0; i++) { await timeout(1); } }`, errors },
		{ filename, code: `async function f() { for (let i = 0; i < 100 && !done; i++) await timeout(1); }`, errors },
		// unbounded poll
		{ filename, code: `async function f() { while (!done) { await timeout(0); } }`, errors },
		{ filename, code: `async function f() { do { await timeout(5); } while (!done); }`, errors },
		// fixed number of ticks
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await timeout(0); } }`, errors },
		// polls with guards and reads
		{ filename, code: `async function f() { while (Date.now() < deadline) { if (done) { return; } await timeout(10); } }`, errors },
		{ filename, code: `async function f() { const deadline = Date.now() + 1000; while (true) { const request = find(); if (request) { return request; } if (Date.now() > deadline) { const sent = list(); throw new Error(sent); } await timeout(5); } }`, errors },
		{ filename, code: `async function f() { let state; for (let i = 0; i < 50 && !state; i++) { await timeout(2); state = await db.read(); } }`, errors },
		{ filename, code: `async function f() { while (true) { const requests = transport.sentMessages.filter(m => m.method === method); if (requests[index]) { return requests[index]; } await timeout(5); } }`, errors },
		{ filename, code: `async function f() { while (!done) { if (Date.now() > deadline) { log.error(state); throw new Error('timeout'); } await timeout(5); } }`, errors },
		{ filename, code: `async function f() { while (!done) { if (ready) { service.dispatch(); break; } await timeout(1); } }`, errors },
		{ filename, code: `async function f() { while (!done) { if (skip) { const now = Date.now(); continue; } await timeout(1); } }`, errors },
		// other timer sleeps
		{ filename, code: `async function f() { while (!done) { await new Promise(resolve => setTimeout(resolve, 5)); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await new Promise<void>(function (r) { setTimeout(() => r(), 5); }); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await new Promise<void>(resolve => { setTimeout(() => { resolve(); }, 5); }); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await setTimeout(5); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await sleep(5); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await (timeout(5) as Promise<void>); } }`, errors },
		// a helper defined outside of runWithFakedTimers runs on real time
		{ filename, code: `async function waitFor(predicate) { for (let i = 0; i < 100 && !predicate(); i++) { await timeout(0); } }\ntest('x', () => runWithFakedTimers({}, async () => { await waitFor(() => done); }));`, errors },
		// fake timers disabled
		{ filename, code: `test('x', () => runWithFakedTimers({ useFakeTimers: false }, async () => { while (!done) { await timeout(1); } }));`, errors },
	],
});
