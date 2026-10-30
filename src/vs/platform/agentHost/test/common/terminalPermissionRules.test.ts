/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isShellRule, shellRuleToTerminalRule, terminalRulesToShellPermissions } from '../../common/terminalPermissionRules.js';

suite('Terminal permission rules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts terminal approval values and command-line selectors', () => {
		assert.deepStrictEqual(terminalRulesToShellPermissions({
			npm: true,
			'git status': { approve: true },
			rm: false,
			sudo: { approve: false },
			echo: null,
			'/^ls(?: .*)?$/i': true,
			'/danger/i': { approve: false, matchCommandLine: true },
			'./build': { approve: true, matchCommandLine: true },
		}), {
			allow: ['Shell(/^ls(?: .*)?$/i)', 'Shell(commandLine:./build *)', 'Shell(git status *)', 'Shell(npm *)'],
			ask: ['Shell(commandLine:/danger/i)', 'Shell(echo *)', 'Shell(rm *)', 'Shell(sudo *)'],
		});
	});

	test('sorts and deduplicates equivalent rules', () => {
		assert.deepStrictEqual([
			terminalRulesToShellPermissions({}),
			terminalRulesToShellPermissions({
				z: true,
				a: false,
				foo: { approve: true, matchCommandLine: true },
				'commandLine:foo': true,
				bar: { approve: false, matchCommandLine: true },
				'commandLine:bar': null,
			}),
		], [
			{ allow: [], ask: [] },
			{ allow: ['Shell(commandLine:foo *)', 'Shell(z *)'], ask: ['Shell(a *)', 'Shell(commandLine:bar *)'] },
		]);
	});

	for (const { rule, expected } of [
		{ rule: 'Shell(npm run *)', expected: { key: 'npm run', value: true } },
		{ rule: 'Shell(npm test)', expected: { key: '/^npm test$/', value: true } },
		{ rule: 'Shell(echo (hello).?)', expected: { key: '/^echo \\(hello\\)\\.\\?$/', value: true } },
		{ rule: 'Shell(git*status)', expected: { key: '/^git.*status$/s', value: true } },
		{ rule: 'Shell(git* *)', expected: { key: '/^git.* .*$/s', value: true } },
		{ rule: 'Shell(*)', expected: { key: '/^.*$/s', value: true } },
		{ rule: 'Shell(/foo(bar)*/gi)', expected: { key: '/foo(bar)*/gi', value: true } },
		{ rule: 'Shell(commandLine:npm test)', expected: { key: '/^npm test$/', value: { approve: true, matchCommandLine: true } } },
		{ rule: 'Shell(commandLine:npm *)', expected: { key: 'npm', value: { approve: true, matchCommandLine: true } } },
		{ rule: 'Shell(commandLine:*build*)', expected: { key: '/^.*build.*$/s', value: { approve: true, matchCommandLine: true } } },
		{ rule: 'Shell(commandLine:/^npm test$/i)', expected: { key: '/^npm test$/i', value: { approve: true, matchCommandLine: true } } },
		{ rule: ' Shell(npm *) ', expected: { key: 'npm', value: true } },
		{ rule: 'Shell', expected: undefined },
		{ rule: 'Shell()', expected: undefined },
		{ rule: 'Shell( )', expected: undefined },
		{ rule: 'Shell(commandLine:)', expected: undefined },
		{ rule: 'Shell(commandLine: )', expected: undefined },
		{ rule: 'Shell(echo', expected: undefined },
		{ rule: 'Bash(echo *)', expected: undefined },
		{ rule: 'WebFetch(example.com)', expected: undefined },
	]) {
		test(`mirrors ${rule}`, () => {
			assert.deepStrictEqual(shellRuleToTerminalRule(rule), expected);
		});
	}

	test('identifies Shell rules without confusing other tools or malformed rules', () => {
		const rules = ['Shell', 'Shell(*)', 'Shell(npm *)', 'Shell(commandLine:/foo/i)', ' Shell(echo) ', 'Shell()', 'Shell(echo', 'ShellExtra', 'Bash(echo *)'];
		assert.deepStrictEqual(rules.map(isShellRule), [true, true, true, true, true, false, false, false, false]);
	});
});
