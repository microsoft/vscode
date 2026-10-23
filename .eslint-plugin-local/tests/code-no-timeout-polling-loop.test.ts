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
		// microtask spins are deterministic and do not depend on load
		{ filename, code: `async function f() { while (!done) { await Promise.resolve(); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await Promise.resolve(); } }` },
		{ filename, code: `async function f() { while (!done) { await null; } }` },
		{ filename, code: `async function f() { while (!done) { await new Promise(resolve => process.nextTick(resolve)); } }` },
		{ filename, code: `function flush() { return Promise.resolve(); }\nasync function f() { while (!done) { await flush(); } }` },
		// a member `wait` usually waits on a barrier or gate
		{ filename, code: `async function f() { while (!done) { await gate.wait('subject', signal); } }` },
		// helpers that do work besides sleeping, or are not bound to a function
		{ filename, code: `function step() { emitter.fire(); return timeout(0); }\nasync function f() { while (!done) { await step(); } }` },
		{ filename, code: `let pause = (ms) => timeout(ms);\nasync function f() { while (!done) { await pause(10); } }` },
		{ filename, code: `import { tick } from './clock.js';\nasync function f() { while (!done) { await tick(); } }` },
		// racing a signal against a timer waits on the signal
		{ filename, code: `async function f() { while (!done) { await raceTimeout(Event.toPromise(onDidChange), 100); } }` },
		// per-frame sampling, scrolling and clicking do work on every iteration
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await new Promise(r => requestAnimationFrame(r)); assert.strictEqual(element.style.opacity, '1'); } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 10; i++) { await new Promise(r => requestAnimationFrame(r)); samples.push(element.offsetHeight); } }` },
		{ filename, code: `async function f() { while (!findRow()) { list.scrollTop += 100; await timeout(10); } }` },
		{ filename, code: `async function f() { while (!findRow()) { button.click(); await timeout(10); } }` },
		{ filename, code: `async function f() { while (!done) { this.attempts++; await timeout(1); } }` },
		// retrying an operation, or work within a retried `try` block
		{ filename, code: `async function retry(task, delay) { for (let i = 0; i < 3; i++) { try { return await task(); } catch { await timeout(delay); } } }` },
		{ filename, code: `async function f() { for (let i = 0; i < 20; i++) { try { service.dispatch(); assert.ok(done); break; } catch { await timeout(10); } } }` },
		// recursion that does work
		{ filename, code: `async function pump() { emitter.fire(); await timeout(10); return pump(); }` },
		{ filename, code: `async function tick() { await timeout(0); }` },
		// `setInterval` callbacks that do work, or settle unconditionally
		{ filename, code: `const handle = setInterval(() => { emitter.fire(); }, 10);` },
		{ filename, code: `async function f() { await new Promise<void>(resolve => { const h = setInterval(() => { clearInterval(h); resolve(); }, 10); }); }` },
		{ filename, code: `async function f() { await new Promise<void>(resolve => { const h = setInterval(() => { if (done) { clearInterval(h); start(); } }, 10); }); }` },
		{ filename, code: `const handle = setInterval(() => { if (failed) { log.error(state); } }, 10);` },
		// calling an unknown parameter is not a sleep
		{ filename, code: `async function f(pause) { while (!done) { await pause(10); } }` },
		{ filename, code: `test('x', () => runWithFakedTimers({}, async () => { await new Promise<void>(resolve => { const h = setInterval(() => { if (done) { clearInterval(h); resolve(); } }, 10); }); }));` },
		{ filename, code: `test('x', () => runWithFakedTimers({}, async () => { async function waitUntil() { if (done) { return; } await timeout(10); return waitUntil(); } await waitUntil(); }));` },
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
		// sleeps on a namespace, a later macrotask or an animation frame
		{ filename, code: `async function f() { while (!cond()) { await async.timeout(10); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await new Promise<void>(resolve => setImmediate(resolve)); } }`, errors },
		{ filename, code: `async function f() { for (let i = 0; i < 3; i++) { await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve()))); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await new Promise(r => void setTimeout(r, 10)); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await new Promise<void>(resolve => { return setTimeout(resolve, 10); }); } }`, errors },
		// `raceTimeout` on a promise that never settles is a sleep
		{ filename, code: `async function f() { const neverResolving = new Promise<void>(() => { }); while (!done) { await raceTimeout(neverResolving, 10); } }`, errors },
		{ filename, code: `async function f() { while (!done) { await async.raceTimeout(new Promise(() => { }), 10); } }`, errors },
		// same-file helpers that only sleep, and renamed imports of a sleep
		{ filename, code: `async function f() { for (let i = 0; i < 100 && !done; i++) { await tick(); } }\nfunction tick(): Promise<void> { return new Promise(resolve => setImmediate(resolve)); }`, errors },
		{ filename, code: `const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));\nasync function f() { while (!done) { await pause(10); } }`, errors },
		{ filename, code: `async function settle(rounds = 5) { for (let i = 0; i < rounds; i++) { await nextFrame(); } }\nconst nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));\nasync function f() { while (!done) { await settle(); } }`, errors: [...errors, ...errors] },
		{ filename, code: `import { timeout as pause } from './async.js';\nasync function f() { while (!done) { await pause(10); } }`, errors },
		// bookkeeping
		{ filename, code: `async function f() { let attempts = 0; while (!done) { attempts++; await timeout(10); } }`, errors },
		{ filename, code: `async function f() { let attempts = 0; while (!done) { attempts += 1; await timeout(10); } }`, errors },
		{ filename, code: `async function f() { while (!done) { console.log('waiting', state); await timeout(10); } }`, errors },
		{ filename, code: `async function f() { while (!done) { { await timeout(10); } } }`, errors },
		{ filename, code: `async function f() { while (!done) { if (verbose) { log = describe; } else { skipped++; } await timeout(10); } }`, errors },
		// retries of reads and assertions
		{ filename, code: `async function f() { let persisted = false; for (let attempt = 0; attempt < 20; attempt++) { try { const parsed = JSON.parse(readFileSync(path, 'utf8')); assert.deepStrictEqual(parsed.items, [item]); persisted = true; break; } catch { } if (attempt === 19) { break; } await new Promise(resolve => setTimeout(resolve, 5)); } }`, errors },
		{ filename, code: `async function f() { for (let i = 0; i < 50; i++) { try { assert.strictEqual(model.state, 'done'); return; } catch { await timeout(10); } } }`, errors },
		{ filename, code: `async function poll(fn, acceptFn, retryCount = 200) { let trial = 1; let lastError = ''; while (true) { if (trial > retryCount) { throw new Error(\`Timeout: \${lastError}\`); } let result; try { result = await fn(); if (acceptFn(result)) { return result; } else { lastError = 'Did not pass accept function'; } } catch (e) { lastError = Array.isArray(e.stack) ? e.stack.join('\\n') : e.stack; } await new Promise(resolve => setTimeout(resolve, 10)); trial++; } }`, errors },
		{ filename, code: `async function waitForValue(probe) { while (true) { const value = await probe(); if (value !== undefined) { return value; } await timeout(100); } }`, errors },
		{ filename, code: `async function f() { for (let attempt = 0; attempt < 100; attempt++) { const element = container.querySelector(selector); if (element && element.getBoundingClientRect().height > 0) { const bounds = (element.closest('.hover') ?? element).getBoundingClientRect(); if (bounds.top >= 0) { return element; } } await timeout(10); } }`, errors },
		// recursion instead of a loop
		{ filename, code: `async function waitUntil(): Promise<void> { if (done) { return; } await timeout(10); return waitUntil(); }`, errors },
		{ filename, code: `const waitFor = async (predicate, attempts = 100) => { if (predicate() || attempts === 0) { return; } await timeout(10); await waitFor(predicate, attempts - 1); };`, errors },
		{ filename, code: `async function f() { await new Promise<void>(resolve => { const check = () => { if (done) { resolve(); } else { setTimeout(check, 10); } }; check(); }); }`, errors },
		// `setInterval` waiters
		{ filename, code: `async function f() { await new Promise<void>(resolve => { const i = setInterval(() => { if (signalSeen) { clearInterval(i); resolve(); } }, 10); }); }`, errors },
		{ filename, code: `async function f() { const deferred = new DeferredPromise<void>(); const handle = mainWindow.setInterval(() => { if (ready()) { mainWindow.clearInterval(handle); deferred.complete(); } }, 10); await deferred.p; }`, errors },
		{ filename, code: `function f() { return new Promise<void>((resolve, reject) => { let waited = 0; const handle = setInterval(() => { waited += 10; if (waited > 1000) { clearInterval(handle); reject(new Error('timeout')); } else if (isReady()) { clearInterval(handle); resolve(); } }, 10); }); }`, errors },
	],
});
