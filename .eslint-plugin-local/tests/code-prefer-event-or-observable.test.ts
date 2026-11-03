/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESLint, RuleTester, type Linter } from 'eslint';
import { suite, test } from 'node:test';
import { resolve } from 'path';
import tseslint from 'typescript-eslint';
import rule from '../code-prefer-event-or-observable.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const checkPublicMethods = [{ checkPublicMethods: true }];
const constructorErrors = [{ messageId: 'constructorCallback', data: { name: 'callback' } }];
const methodErrors = [{ messageId: 'methodCallback', data: { name: 'callback' } }];

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-prefer-event-or-observable', rule, {
	valid: [
		`class C { constructor(value: string) {} }`,
		`class C { constructor(service: IService) {} }`,
		`class C { constructor(event: Event<string>) {} }`,
		`class C { constructor(value: IObservable<string>) {} }`,
		`class C { constructor(value: IObservable<() => void>) {} }`,
		`import { Event as ChangeEvent } from './event.js'; class C { constructor(event: ChangeEvent<void>) {} }`,
		`import type { Callback } from './other.js'; class C { constructor(callback: Callback) {} }`,
		`interface Event<T> { (listener: (value: T) => void): IDisposable; } class C { constructor(event: Event<void>) {} }`,
		`type ChangeEvent = Event<void>; class C { constructor(event: ChangeEvent) {} }`,
		`type Options = { callback: () => void }; class C { constructor(options: Options) {} }`,
		`class C { constructor(options: { callback: () => void }) {} }`,
		`class C { constructor(factory: new () => Item) {} }`,
		`type A = B; type B = A; class C { constructor(value: A) {} }`,
		`type Callback = () => void; class C<Callback> { constructor(value: Callback) {} }`,
		`class Function {} class C { constructor(value: Function) {} }`,
		{ code: `class C { run(callback: () => void) {} }`, options: [{ checkPublicMethods: false }] },
		{ code: `class C { private run(callback: () => void) {} }`, options: checkPublicMethods },
		{ code: `class C { protected run(callback: () => void) {} }`, options: checkPublicMethods },
		{ code: `class C { #run(callback: () => void) {} }`, options: checkPublicMethods },
		{ code: `class C { private run = (callback: () => void) => {}; }`, options: checkPublicMethods },
		{ code: `class C { protected run: (callback: () => void) => void; }`, options: checkPublicMethods },
		{ code: `class C { #run = (callback: () => void) => {}; }`, options: checkPublicMethods },
		{ code: `class C { onDidChange: Event<void> = (listener: () => void) => subscribe(listener); }`, options: checkPublicMethods },
		{ code: `class C { run(event: Event<void>, value: IObservable<number>) {} }`, options: checkPublicMethods },
		{ code: `interface C { onDidChange: Event<void>; run(value: IObservable<number>): void; }`, options: checkPublicMethods },
		{ code: `class C { run() { function helper(callback: () => void) {} } }`, options: checkPublicMethods },
		{ code: `const c = { run(callback: () => void) {} };`, options: checkPublicMethods },
		{ code: `function run(callback: () => void) {}`, options: checkPublicMethods },
		{ code: `[1, 2].map(value => value + 1); new Promise(resolve => resolve()); onDidChange(() => refresh()); autorun(reader => value.read(reader)); new C(() => refresh());`, options: checkPublicMethods },
	],
	invalid: [
		{ code: `class C { constructor(callback: () => void) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(private readonly callback: () => void) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(public callback: (value: string) => Promise<void>) {} }`, errors: constructorErrors },
		{ code: `class C { private constructor(callback: () => void) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback?: () => void) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: (() => void) | undefined) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: null | (() => void)) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: (() => void) & { label: string }) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: { (value: number): void }) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: Function) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: CallableFunction) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback = () => {}) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(private readonly callback = () => {}) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback = function () {}) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: () => void = () => {}) {} }`, errors: constructorErrors },
		{ code: `type Callback = () => void; class C { constructor(callback: Callback) {} }`, errors: constructorErrors },
		{ code: `type Callback<T> = (value: T) => void; class C { constructor(callback: Callback<string>) {} }`, errors: constructorErrors },
		{ code: `type Callback = () => void; type Alias = Callback | undefined; class C { constructor(callback: Alias) {} }`, errors: constructorErrors },
		{ code: `class C { constructor(callback: Callback) {} } type Callback = () => void;`, errors: constructorErrors },
		{ code: `type Callback = string; namespace N { type Callback = () => void; class C { constructor(callback: Callback) {} } }`, errors: constructorErrors },
		{ code: `interface Callback { (value: string): void; } class C { constructor(callback: Callback) {} }`, errors: constructorErrors },
		{
			code: `class C {
	constructor(callback: () => void, getValue: () => number) {}
}`,
			errors: [
				{ messageId: 'constructorCallback', data: { name: 'callback' }, line: 2, column: 14 },
				{ messageId: 'constructorCallback', data: { name: 'getValue' }, line: 2, column: 36 },
			],
		},
		{ code: `class C { run(callback: () => void) {} }`, errors: methodErrors },
		{ code: `class C { public run(callback?: () => void) {} }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `class C { static run(callback: () => void) {} }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `class C { set onChange(callback: () => void) {} }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `abstract class C { abstract run(callback: () => void): void; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `declare class C { run(callback: () => void): void; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `interface C { run(callback: () => void): void; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `type C = { run(callback: () => void): void };`, options: checkPublicMethods, errors: methodErrors },
		{ code: `interface C { run: (callback: () => void) => void; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `class C { run = (callback: () => void) => {}; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `class C { run = function(callback: () => void) {}; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `class C { run: (callback: () => void) => void = callback => {}; }`, options: checkPublicMethods, errors: methodErrors },
		{ code: `abstract class C { abstract run: (callback: () => void) => void; }`, options: checkPublicMethods, errors: methodErrors },
		{
			code: `class C { constructor(callback: () => void) {} run(callback: () => void) {} }`,
			options: checkPublicMethods,
			errors: [...constructorErrors, ...methodErrors],
		},
		{
			code: `class C { constructor(callback: () => void) {} run(callback: () => void) {} }`,
			options: [{ checkPublicMethods: false }],
			errors: constructorErrors,
		},
	],
});

suite('code-prefer-event-or-observable configuration', () => {
	const filePath = resolve(import.meta.dirname, '../../src/vs/workbench/common/example.ts');
	const code = `class C { constructor(callback: () => void) {} run(callback: () => void) {} }`;

	test('is opt-in and checks public methods by default when enabled', async () => {
		const configurations: NonNullable<Linter.Config['rules']>[] = [
			{},
			{ 'local/code-prefer-event-or-observable': 'warn' },
			{ 'local/code-prefer-event-or-observable': ['warn', { checkPublicMethods: false }] },
			{ 'local/code-prefer-event-or-observable': ['warn', { checkPublicMethods: true }] },
		];

		assert.deepStrictEqual(await Promise.all(configurations.map(async rules => {
			const eslint = new ESLint({ overrideConfig: [{ rules }] });
			const results = await eslint.lintText(code, { filePath });
			return results.flatMap(result => result.messages
				.filter(message => message.ruleId === 'local/code-prefer-event-or-observable')
				.map(message => ({ messageId: message.messageId, severity: message.severity })));
		})), [
			[],
			[{ messageId: 'constructorCallback', severity: 1 }, { messageId: 'methodCallback', severity: 1 }],
			[{ messageId: 'constructorCallback', severity: 1 }],
			[{ messageId: 'constructorCallback', severity: 1 }, { messageId: 'methodCallback', severity: 1 }],
		]);
	});

	test('can opt in an individual file with an ESLint directive', async () => {
		const eslint = new ESLint();
		const results = await eslint.lintText(`/* eslint local/code-prefer-event-or-observable: "warn" */\n${code}`, { filePath });
		assert.deepStrictEqual(results.flatMap(result => result.messages
			.filter(message => message.ruleId === 'local/code-prefer-event-or-observable')
			.map(message => message.messageId)), ['constructorCallback', 'methodCallback']);
	});

	test('enforces errors only in migrated areas', async () => {
		const eslint = new ESLint();
		const files = [
			'src/vs/workbench/api/browser/mainThreadMcp.ts',
			'src/vs/workbench/api/common/extHostQuickOpen.ts',
			'src/vs/platform/agentHost/node/claude/claudeAgentSession.ts',
			'src/vs/platform/agentHost/node/claude/customizations/claudeSessionCustomizationDiscovery.ts',
			'src/vs/platform/agentHost/node/claude/future/nested/example.ts',
			'src/vs/platform/agentHost/node/copilot/copilotAgent.ts',
			'src/vs/platform/agentHost/node/codex/codexAgent.ts',
			'src/vs/workbench/api/common/extHostMcp.ts',
			'src/vs/workbench/api/browser/mainThreadAuthentication.ts',
			'src/vs/workbench/api/test/browser/mainThreadMcp.test.ts',
		];
		const errors = [{ messageId: 'constructorCallback', severity: 2 }, { messageId: 'methodCallback', severity: 2 }];
		assert.deepStrictEqual(await Promise.all(files.map(async file => {
			const results = await eslint.lintText(code, { filePath: resolve(import.meta.dirname, '../..', file) });
			return results.flatMap(result => result.messages
				.filter(message => message.ruleId === 'local/code-prefer-event-or-observable')
				.map(message => ({ messageId: message.messageId, severity: message.severity })));
		})), [
			errors,
			errors,
			errors,
			errors,
			errors,
			[],
			[],
			[],
			[],
			[],
		]);
	});
});
