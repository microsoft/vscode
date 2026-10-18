/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import { resolve } from 'path';
import tseslint from 'typescript-eslint';
import rule from '../code-run-with-faked-timers-whole-test.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const filename = resolve(import.meta.dirname, '../../src/vs/workbench/test/browser/example.test.ts');
const imports = `import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';\n`;
const code = (body: string) => imports + body;
const errors = (...messageIds: string[]) => messageIds.map(messageId => ({ messageId }));

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-run-with-faked-timers-whole-test', rule, {
	valid: [
		// whole test body
		{ filename, code: code(`test('x', () => runWithFakedTimers({}, async () => { setup(); await run(); assert.ok(1); }));`) },
		{ filename, code: code(`test('x', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => { }));`) },
		{ filename, code: code(`test('x', async () => { await runWithFakedTimers({}, async () => { }); });`) },
		{ filename, code: code(`test('x', async () => { return runWithFakedTimers({}, async () => { }); });`) },
		{ filename, code: code(`test('x', async function () { this.timeout(10_000); return runWithFakedTimers({}, async () => { }); });`) },
		{ filename, code: code(`test.skip('x', () => runWithFakedTimers({}, async () => { }));`) },
		{ filename, code: code(`(isMacintosh ? test.skip : test)('x', () => runWithFakedTimers({}, async () => { }));`) },
		{ filename, code: code(`for (const a of [1, 2]) { test('x' + a, () => runWithFakedTimers({}, async () => { })); }`) },
		// the virtualScheduling import path
		{ filename, code: `import { runWithFakedTimers } from '../../../base/test/common/virtualScheduling/index.js';\ntest('x', () => runWithFakedTimers({}, async () => { }));` },
		// wrapper helpers
		{ filename, code: code(`function withController(fn) { return runWithFakedTimers({}, async () => fn(create())); }\ntest('x', () => withController(async c => { }));`) },
		{ filename, code: code(`suite('s', () => { const withX = (fn) => runWithFakedTimers({}, fn); test('x', () => withX(async () => { })); });`) },
		// onHistory capture
		{ filename, code: code(`test('x', async () => { let times = []; let first: number | undefined; const errors: unknown[] = []; await runWithFakedTimers({ onHistory: h => times = h }, async () => { }); assert.deepStrictEqual(times, []); });`) },
		// unrelated runWithFakedTimers
		{ filename, code: `import { runWithFakedTimers } from './other.js';\ntest('x', async () => { setup(); await runWithFakedTimers({}, async () => { }); });` },
		{ filename, code: `function runWithFakedTimers(a, b) { }\ntest('x', async () => { setup(); runWithFakedTimers({}, async () => { }); });` },
		// excluded file
		{ filename, code: code(`test('x', async () => { setup(); await runWithFakedTimers({}, async () => { }); });`), options: [{ exclude: ['/example.test.ts'] }] },
	],
	invalid: [
		// setup before
		{ filename, code: code(`test('x', async () => { const editor = createEditor(); await runWithFakedTimers({}, async () => { editor.type(); }); });`), errors: errors('partial') },
		// assertions after the drain
		{ filename, code: code(`test('x', async () => { await runWithFakedTimers({}, async () => { await provider.refresh(); }); assert.ok(provider.ready); });`), errors: errors('partial') },
		// result consumed
		{ filename, code: code(`test('x', async () => { const r = await runWithFakedTimers({}, async () => 1); assert.strictEqual(r, 1); });`), errors: errors('partial') },
		// nested in a statement or function within a test
		{ filename, code: code(`test('x', async () => { try { await runWithFakedTimers({}, async () => { }); } finally { dispose(); } });`), errors: errors('partial') },
		{ filename, code: code(`test('x', async () => { await Promise.all([1, 2].map(() => runWithFakedTimers({}, async () => { }))); });`), errors: errors('partial') },
		// a test nested in a test
		{ filename, code: code(`test('x', async () => { await runWithFakedTimers({}, async () => { }); test('y', () => { }); });`), errors: errors('partial') },
		// partial wrapper helper
		{ filename, code: code(`async function withEditor(fn) { const editor = createEditor(); return runWithFakedTimers({}, () => fn(editor)); }`), errors: errors('partial') },
		// onHistory with non-inert setup or awaited follow-up
		{ filename, code: code(`test('x', async () => { const fake = new Fake(); await runWithFakedTimers({ onHistory: h => { } }, async () => { }); });`), errors: errors('partial') },
		{ filename, code: code(`test('x', async () => { await runWithFakedTimers({ onHistory: h => { } }, async () => { }); await settle(); });`), errors: errors('partial') },
		// nested
		{ filename, code: code(`test('x', () => runWithFakedTimers({}, async () => { await runWithFakedTimers({}, async () => { }); }));`), errors: errors('nested') },
		// hooks
		{ filename, code: code(`setup(() => runWithFakedTimers({}, async () => { }));`), errors: errors('hook') },
		{ filename, code: code(`setup(() => { const run = () => runWithFakedTimers({}, async () => { }); return run(); });`), errors: errors('hook') },
		{ filename, code: code(`setup(async () => { await Promise.all([1].map(() => runWithFakedTimers({}, async () => { }))); });`), errors: errors('hook') },
		// not awaited or returned
		{ filename, code: code(`test('x', () => { runWithFakedTimers({}, async () => { await work(); }); });`), errors: errors('floating') },
		{ filename, code: code(`test('x', async () => { let h = []; runWithFakedTimers({ onHistory: x => h = x }, async () => { }); assert.deepStrictEqual(h, []); });`), errors: errors('floating') },
		{ filename, code: code(`function withX(fn) { runWithFakedTimers({}, fn); }`), errors: errors('floating') },
		// top level
		{ filename, code: code(`await runWithFakedTimers({}, async () => { });`), errors: errors('partial') },
		// aliased import and relative import of the module itself
		{ filename, code: `import { runWithFakedTimers as rwft } from '../../../base/test/common/timeTravelScheduler.js';\ntest('x', async () => { setup(); await rwft({}, async () => { }); });`, errors: errors('partial') },
		{ filename: resolve(import.meta.dirname, '../../src/vs/base/test/common/virtualScheduling/example.test.ts'), code: `import { runWithFakedTimers } from './index.js';\ntest('x', async () => { setup(); await runWithFakedTimers({}, async () => { }); });`, errors: errors('partial') },
	],
});
