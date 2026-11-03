/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { beforeAll, suite, test } from 'vitest';

// These must be type imports since the module is loaded dynamically in the beforeAll hook.
import type * as protocol from '../../common/protocol';
import type * as testing from './testing';

// This is OK since we are running in a Node / CommonJS environment.
import ts from 'typescript';

// Define variables in outer scope so they can be accessed in tests
let ContextKind: typeof protocol.ContextKind;
let assertContextItems: typeof testing.assertContextItems;
let computeContext: typeof testing.computeContext;
let create: typeof testing.create;

// This is OK since we run tests in node loading a TS version installed in the workspace.
const root = path.join(__dirname, '../../../fixtures/context');

// Use before hook to ensure async setup completes before tests run
beforeAll(async function () {
	const TS = await import('../../common/typescript');
	TS.default.install(ts);

	const [protocolModule, testingModule] = await Promise.all([
		import('../../common/protocol'),
		import('./testing'),
	]);
	ContextKind = protocolModule.ContextKind;
	assertContextItems = testingModule.assertContextItems;
	computeContext = testingModule.computeContext;
	create = testingModule.create;
}, 10000);

suite('Class', () => {
	let session: testing.TestSession;
	let expected: testing.ExpectedCodeSnippet[];
	beforeAll(() => {
		session = create(path.join(root, 'p1'));
		expected = [{
			kind: ContextKind.Snippet,
			value: 'export class X implements Name, NameLength { name() { return \'x\'; } length() { return \'x\'.length; } }',
			fileName: /p1\/source\/f2.ts$/
		}];
	});

	test('complete', function () {
		assertContextItems(computeContext(session, path.join(root, 'p1/source/f3.ts'), { line: 3, character: 0 }, ContextKind.Snippet), expected, 'contains');
	});

	test('signature', function () {
		const context = computeContext(session, path.join(root, 'p1/source/f4.ts'), { line: 2, character: 42 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

});

suite('Type Alias', () => {
	let session: testing.TestSession;
	let expected: testing.ExpectedCodeSnippet[];
	beforeAll(() => {
		session = create(path.join(root, 'p4'));
		expected = [{
			kind: ContextKind.Snippet,
			value: 'export class X implements Name, NameLength { name() { return \'x\'; } length() { return \'x\'.length; } }',
			fileName: /p4\/source\/f2.ts$/
		}];
	});

	test('complete', () => {
		const context = computeContext(session, path.join(root, 'p4/source/f3.ts'), { line: 3, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('rename', () => {
		const context = computeContext(session, path.join(root, 'p4/source/f4.ts'), { line: 6, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('intersection', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'export class W implements Both { name() { return \'w\'; } length() { return \'w\'.length; } }',
			fileName: /p4\/source\/f2.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'export type Both = Name & NameLength;',
			fileName: /p4\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'interface Name { name(): string; }',
			fileName: /p4\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'type NameLength = { length(): number; }',
			fileName: /p4\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p4/source/f5.ts'), { line: 3, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
});

suite('Method - Simple', () => {
	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p2'));
	});

	test('complete method', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class B { /** * The distance between two points. */ protected distance: number; /** * The length of the line. */ protected _length: number; /** * Returns the occurrence of \'foo\'. * * @returns the occurrence of \'foo\'. */ public foo(): number; }',
			fileName: /p2\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p2/source/f2.ts'), { line: 5, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
});

suite('Method - Search', () => {
	test('complete private method with blueprint', () => {
		const session = create(path.join(root, 'p5'));
		const expected: testing.ExpectedCodeSnippet[] = [
			{
				kind: ContextKind.Snippet,
				value: 'declare class Foo { }',
				fileName: /p5\/source\/f1.ts$/
			},
			{
				kind: ContextKind.Snippet,
				value: '/** * Javadoc */ export class Bar extends Foo { private name(): string { return \'Bar\'; } }',
				fileName: /p5\/source\/f2.ts$/
			}
		];
		const context = computeContext(session, path.join(root, 'p5/source/f3.ts'), { line: 4, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});

	test('complete public method with blueprint from interface', () => {
		const session = create(path.join(root, 'p9'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'export class Bar implements Foo { public name(): string { return \'Bar\'; } }',
			fileName: /p9\/source\/f2.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p9/source/f3.ts'), { line: 4, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('complete public method with blueprint from interface hierarchy', () => {
		const session = create(path.join(root, 'p10'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'export class Bar implements Fooo { public name(): string { return \'Bar\'; } }',
			fileName: /p10\/source\/f2.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p10/source/f3.ts'), { line: 4, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('complete public method with blueprint from type alias', () => {
		const session = create(path.join(root, 'p11'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'export class Bar implements Foo { public name(): string { return \'Bar\'; } }',
			fileName: /p11\/source\/f2.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p11/source/f3.ts'), { line: 4, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});
});

suite('Method - Signature', () => {
	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p6'));
	});

	test('complete method signature types', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Foo { public foo(): void; }',
			fileName: /p6\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'interface Bar { bar(): void; }',
			fileName: /p6\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'enum Enum { a = 1, b = 2 }',
			fileName: /p6\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'const enum CEnum { a = 1, b = 2 }',
			fileName: /p6\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'type Baz = { baz(): void; bazz: () => number; }',
			fileName: /p6\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p6/source/f2.ts'), { line: 7, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
});

suite('Function signature', () => {
	test('complete function signature types', () => {
		const session: testing.TestSession = create(path.join(root, 'p7'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Foo { public foo(): void; }',
			fileName: /p7\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'interface Bar { bar(): void; }',
			fileName: /p7\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'enum Enum { a = 1, b = 2 }',
			fileName: /p7\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'const enum CEnum { a = 1, b = 2 }',
			fileName: /p7\/source\/f1.ts$/
		}, {
			kind: ContextKind.Snippet,
			value: 'type Baz = { baz(): void; bazz: () => number; }',
			fileName: /p7\/source\/f1.ts$/
		}];

		const context = computeContext(session, path.join(root, 'p7/source/f2.ts'), { line: 6, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});

	test('Imported types in functions', () => {
		const session: testing.TestSession = create(path.join(root, 'p12'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Person { constructor(age: number = 10); public getAlter(): number; }',
			fileName: /p12\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p12/source/f2.ts'), { line: 3, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});

	test('Type of locals in functions', () => {
		const session: testing.TestSession = create(path.join(root, 'p12'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Person { constructor(age: number = 10); public getAlter(): number; }',
			fileName: /p12\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p12/source/f3.ts'), { line: 4, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});

	test('Top level code', () => {
		const session: testing.TestSession = create(path.join(root, 'p12'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Person { constructor(age: number = 10); public getAlter(): number; }',
			fileName: /p12\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p12/source/f4.ts'), { line: 3, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});

	test('Module code', () => {
		const session: testing.TestSession = create(path.join(root, 'p12'));
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Person { constructor(age: number = 10); public getAlter(): number; }',
			fileName: /p12\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p12/source/f5.ts'), { line: 3, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
});

suite('Constructor', () => {
	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p8'));
	});

	test('complete constructor', () => {
		const expected: testing.ExpectedCodeSnippet[] = [
			{
				kind: ContextKind.Snippet,
				value: 'declare class Foo { }',
				fileName: /p8\/source\/f1.ts$/
			},
			{
				kind: ContextKind.Snippet,
				value: '/** * Javadoc */ export class Bar extends Foo { private name: string; constructor() { super(); this.name = \'Bar\'; } }',
				fileName: /p8\/source\/f2.ts$/
			}
		];
		const context = computeContext(session, path.join(root, 'p8/source/f3.ts'), { line: 5, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
});

suite('PropertyTypes', () => {
	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p13'));
	});

	test('from same class', () => {
		const expected: testing.ExpectedCodeSnippet[] = [
			{
				kind: ContextKind.Snippet,
				value: 'type Age = { value: number; }',
				fileName: /p13\/source\/f1.ts$/
			},
			{
				kind: ContextKind.Snippet,
				value: 'declare class Street { constructor(name: string); public getName(); }',
				fileName: /p13\/source\/f1.ts$/
			}
		];
		const context = computeContext(session, path.join(root, 'p13/source/f2.ts'), { line: 15, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
	test('from parent class', () => {
		const expected: testing.ExpectedCodeSnippet[] = [
			{
				kind: ContextKind.Snippet,
				value: 'declare class Person { constructor(age: Age = { value: 10 }); protected getStreet(): Street; public print(): void; }',
				fileName: /p13\/source\/f2.ts$/
			},
			{
				kind: ContextKind.Snippet,
				value: 'declare class Street { constructor(name: string); public getName(); }',
				fileName: /p13\/source\/f1.ts$/
			}
		];
		const context = computeContext(session, path.join(root, 'p13/source/f3.ts'), { line: 4, character: 0 }, ContextKind.Snippet);
		assertContextItems(context, expected);
	});
});

suite('TypeOfExpressionRunnable', () => {
	let session: testing.TestSession;
	beforeAll(() => {
		session = create(path.join(root, 'p14'));
	});

	test('ignores property access without identifier', () => {
		const context = computeContext(session, path.join(root, 'p14/source/f2.ts'), { line: 3, character: 19 }, ContextKind.Snippet);
		assertContextItems(context, []);
	});

	test('type from method chain', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Calculator { constructor(initial: number = 0); public add(x: number): Calculator; public getResult(): Result; }',
			fileName: /p14\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p14/source/f3.ts'), { line: 4, character: 22 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('type from method return (interface)', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'interface Result { value: number; message: string; }',
			fileName: /p14\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p14/source/f4.ts'), { line: 4, character: 25 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('type from element access chain', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Calculator { constructor(initial: number = 0); public add(x: number): Calculator; public getResult(): Result; }',
			fileName: /p14\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p14/source/f5.ts'), { line: 4, character: 19 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});

	test('type from deeply nested property access', () => {
		const expected: testing.ExpectedCodeSnippet[] = [{
			kind: ContextKind.Snippet,
			value: 'declare class Calculator { constructor(initial: number = 0); public add(x: number): Calculator; public getResult(): Result; }',
			fileName: /p14\/source\/f1.ts$/
		}];
		const context = computeContext(session, path.join(root, 'p14/source/f6.ts'), { line: 7, character: 25 }, ContextKind.Snippet);
		assertContextItems(context, expected, 'contains');
	});
});

suite('Traits', () => {
	test('complete traits', () => {
		const session: testing.TestSession = create(path.join(root, 'p1'));
		const expected: testing.ExpectedTrait[] = [
			{
				kind: ContextKind.Trait,
				name: 'The TypeScript module system used in this project is ',
				value: 'Node16'
			},
			{
				kind: ContextKind.Trait,
				name: 'The TypeScript module resolution strategy used in this project is ',
				value: 'Node16'
			},
			{
				kind: ContextKind.Trait,
				name: 'The target version of JavaScript for this project is ',
				value: 'ES2022'
			},
			{
				kind: ContextKind.Trait,
				name: 'Library files that should be included in TypeScript compilation are ',
				value: 'lib.es2022.d.ts,lib.dom.d.ts'
			},
			{
				kind: ContextKind.Trait,
				name: 'The TypeScript version used in this project is ',
				value: '5.7.3'
			},
		];

		const context = computeContext(session, path.join(root, 'p1/source/f1.ts'), { line: 0, character: 0 }, ContextKind.Trait);
		assertContextItems(context, expected);
	});

	test('limited traits', () => {

		const session = create(path.join(root, 'p2'));
		const expected: testing.ExpectedTrait[] = [
			{
				kind: ContextKind.Trait,
				name: 'The TypeScript module system used in this project is ',
				value: 'CommonJS'
			},
			{
				kind: ContextKind.Trait,
				name: 'The TypeScript version used in this project is ',
				value: '5.7.3'
			},
		];

		const context = computeContext(session, path.join(root, 'p2/source/f1.ts'), { line: 0, character: 0 }, ContextKind.Trait);
		assertContextItems(context, expected);
	});
});