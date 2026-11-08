/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { matchesShellCommandLine, matchesShellSubCommand, shellExactRule } from '../../common/permissionRules.js';
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
			ask: ['Shell(/^echo\\b/)', 'Shell(/^rm\\b/)', 'Shell(/^sudo\\b/)', 'Shell(commandLine:/danger/i)'],
		});
	});

	test('sorts and deduplicates equivalent rules', () => {
		assert.deepStrictEqual([
			terminalRulesToShellPermissions({}),
			terminalRulesToShellPermissions({
				z: true,
				a: false,
				'/^a\\b/': null,
				foo: { approve: true, matchCommandLine: true },
				bar: { approve: false, matchCommandLine: true },
				'/^bar\\b/': { approve: false, matchCommandLine: true },
			}),
		], [
			{ allow: [], ask: [] },
			{ allow: ['Shell(commandLine:foo *)', 'Shell(z *)'], ask: ['Shell(/^a\\b/)', 'Shell(commandLine:/^bar\\b/)'] },
		]);
	});

	test('plain terminal opt-outs preserve word boundaries and path variants', () => {
		const cases = [
			{ key: 'echo', value: false, rule: 'Shell(/^echo\\b/)', commands: ['echo', 'echo\thello', 'echo hello', 'echoes'], matches: [true, true, true, false] },
			{ key: 'echo', value: null, rule: 'Shell(/^echo\\b/)', commands: ['echo\thello', 'echoes'], matches: [true, false] },
			{ key: 'echo', value: { approve: false }, rule: 'Shell(/^echo\\b/)', commands: ['echo\thello', 'echoes'], matches: [true, false] },
			{ key: 'echo', value: { approve: false, matchCommandLine: true }, rule: 'Shell(commandLine:/^echo\\b/)', commands: ['echo\thello && pwd', 'echoes'], matches: [true, false] },
			{ key: 'tools/build', value: false, rule: `Shell(${/^^(?:\.[/\\])?tools[/\\]build\b/})`, commands: ['tools/build', 'tools\\build', './tools/build', '.\\tools\\build', 'tools/build\targ', 'tools/builder', 'other/tools/build'], matches: [true, true, true, true, true, false, false] },
			{ key: 'tools\\build', value: null, rule: `Shell(${/^^(?:\.[/\\])?tools[/\\]build\b/})`, commands: ['./tools/build', '.\\tools\\build', 'tools/build\targ', 'tools/builder'], matches: [true, true, true, false] },
		];
		assert.deepStrictEqual(cases.map(({ key, value, commands }) => {
			const permissions = terminalRulesToShellPermissions({ [key]: value });
			const matchCommandLine = typeof value === 'object' && value?.matchCommandLine === true;
			return {
				permissions,
				matches: commands.map(command => permissions.ask.some(rule => matchCommandLine
					? matchesShellCommandLine(rule, command, 'bash')
					: matchesShellSubCommand(rule, command, 'bash'))),
			};
		}), cases.map(({ rule, matches }) => ({ permissions: { allow: [], ask: [rule] }, matches })));
	});

	test('skips empty and invalid patterns that cannot match terminal commands', () => {
		assert.deepStrictEqual(terminalRulesToShellPermissions({ '': false, '/(/': false, '/a*/': null, '/[/': true, valid: true }), {
			allow: ['Shell(valid *)'], ask: [],
		});
	});

	for (const { rule, expected } of [
		{ rule: 'Shell(npm run *)', expected: { key: 'npm run', value: true } },
		{ rule: 'Shell(npm test)', expected: { key: '/^npm test$/', value: true } },
		{ rule: shellExactRule('/usr/bin/su')!, expected: { key: '/^\\/usr\\/bin\\/su$/', value: true } },
		{ rule: shellExactRule('commandLine:echo')!, expected: { key: '/^commandLine:echo$/', value: true } },
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
