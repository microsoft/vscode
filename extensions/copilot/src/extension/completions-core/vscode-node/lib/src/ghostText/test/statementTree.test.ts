/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// WARNING: the file needs to keep space for some of the tests. So please don;t reformat.

import assert from 'assert';
import dedent from 'ts-dedent';
import { StatementNode, StatementTree } from '../statementTree';

type StatementNodeSpec = {
	startOffset: number;
	endOffset?: number;
	parent?: StatementNodeSpec;
	children: StatementNodeSpec[];
};

suite('StatementTree', function () {
	test('tree with offsets includes the enclosing statements but no other statements outside the range', async function () {
		await testStatementBuilding(
			'typescript',
			dedent`
			const ignoredStatement = 1;

			▶️function fibonacci(n: number): number ▶️{
				if (n <= 1) {
					return n;
				}
				▶️return❚ fibonacci(n - 1) + fibonacci(n - 2);◀️
			}◀️◀️
			`
		);
	});

	// Test for types of statements we want to match in supported languages and
	// document the behavior of the current grammar:

	// MARK: JavaScript / TypeScript

	suite('JavaScript / Typescript', function () {
		['javascript', 'javascriptreact', 'jsx', 'typescript', 'typescriptreact'].forEach(language => {
			test(`${language} is supported`, function () {
				assert.strictEqual(StatementTree.isSupported(language), true);
			});
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes simple expression statements', dedent`
				▶️x = 1;◀️
				▶️y = 2;◀️
				`],
			['ignores comments', dedent`
				▶️x = 1;◀️
				// comment
				▶️y = 2;◀️
				`],
			['recognizes export statements', `▶️export ▶️const x = 1;◀️◀️`],
			['recognizes import statements', `▶️import assert from 'assert';◀️`],
			['recognizes debugger statements', `▶️debugger;◀️`],
			['recognizes var declarations', `▶️var x = 1;◀️`],
			['recognizes lexical declarations', dedent`
				▶️const x = 1;◀️
				▶️let y = 2;◀️
				`],
			['recognizes single-expression if statements as', dedent`
				▶️if (x)
					▶️y = 1;◀️◀️
				`],
			['recognizes single-expression if statements on a single line as single statements', `▶️if (x) y = 1;◀️`],
			['recognizes single-expression if / else statements', dedent`
				▶️if (x)
					▶️y = 1;◀️
				else
					▶️y = 2;◀️◀️
				`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('typescript', code);
			});
		}

		test('recognizes single-expression if / else statements on a single line as single statements', async function () {
			await testStatementBuilding('typescript', `▶️if (x) y = 1; else y = 2;◀️`);
			// Since TS and JS are different grammars and the else property changed to alternative ensure we are good in JS as well.
			await testStatementBuilding('javascript', `▶️if (x) y = 1; else y = 2;◀️`);
		});

		const moreStatementCases: [name: string, code: string][] = [
			['recognizes if statements with blocks', dedent`
				▶️if (x) ▶️{
					▶️y = 1;◀️
				}◀️◀️
				`],
			['recognizes if / else statements with blocks', dedent`
				▶️if (x) ▶️{
					▶️y = 1;◀️
				}◀️ else ▶️{
					▶️y = 2;◀️
				}◀️◀️
				`],
			['recognizes switch statements', dedent`
				▶️switch (x) {
					case 1:
						▶️y = true;◀️
					default:
						▶️y = false;◀️
				}◀️
				`],
			// The termination expression is not it's own statement anymore.
			['recognizes for statements', dedent`
				▶️for (let i = 0; i < 10; i++) ▶️{
					▶️str += ' ';◀️
				}◀️◀️
				`],
			['recognizes for...in statements', dedent`
				▶️for (const prop in object) ▶️{
					▶️console.log(prop, object[prop]);◀️
				}◀️◀️
				`],
			['recognizes for...of statements', dedent`
				▶️for (const item of [1, 2, 3]) ▶️{
					▶️console.log(item);◀️
				}◀️◀️
				`],
			['recognizes while statements', dedent`
				▶️while (true) ▶️{
					▶️break;◀️
				}◀️◀️
				`],
			['recognizes do statements', dedent`
				▶️do ▶️{
					▶️break;◀️
				}◀️ while (true);◀️
				`],
			['recognizes try / catch / finally statements', dedent`
				▶️try ▶️{
					▶️throw new Error('oops!');◀️
				}◀️ catch (e) ▶️{
					▶️console.error(e.message);◀️
				}◀️ finally ▶️{
					▶️console.log('done!');◀️
				}◀️◀️
				`],
			['recognizes with statements', dedent`
				▶️with ({x: 1}) ▶️{
					▶️console.log(x);◀️ // 1
				}◀️◀️
				`],
			['recognizes continue statements', dedent`
				▶️while (false) ▶️{
					▶️continue;◀️
				}◀️◀️
				`],
			['recognizes return statements', dedent`
				▶️function foo() ▶️{
					▶️return;◀️
				}◀️◀️
				`],
			['recognizes labeled statements', dedent`
				▶️outer: ▶️for await (chunk of stream) ▶️{
					▶️for (const char of chunk) ▶️{
						▶️if (char === '\n')
							▶️break outer;◀️◀️
					}◀️◀️
				}◀️◀️◀️
				`],
			['recognizes statements with ternary expressions as single statements', dedent`
				▶️let i = featureFlag ? 0 : 1;◀️
				`],
			['recognizes function declarations', dedent`
				▶️function noop() ▶️{
					// empty
				}◀️◀️
				`],
			['recognizes generator function declarations', dedent`
				▶️function* values() ▶️{
					▶️yield 1;◀️
					▶️yield 2;◀️
				}◀️◀️
				`],
			['recognizes class declarations', dedent`
				▶️class Empty {
					// empty
				}◀️
				`],
			['recognizes class field declarations', dedent`
				▶️class ConstantIdentifier {
					▶️readonly id = 1◀️;
				}◀️
				`],
			['recognizes class method declarations', dedent`
				▶️class Example {
					▶️constructor() ▶️{
						▶️this.value = Math.random();◀️
					}◀️◀️

					▶️getValue() ▶️{
						▶️return this.value;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes class getter and setter declarations', dedent`
				▶️class Example {
					▶️set value(newValue) ▶️{
						▶️this.value = newValue;◀️
					}◀️◀️

					▶️get value() ▶️{
						▶️return this.value;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes type alias declarations', `▶️type OptionalIdentifier = number | undefined;◀️`],
			['recognizes interface declarations', dedent`
				▶️interface Vector {
					x: number;
					y: number;
				}◀️
				`],
			['recognizes enum declarations', dedent`
				▶️enum Direction {
					North,
					South,
					East,
					West
				}◀️
				`],
		];
		for (const [name, code] of moreStatementCases) {
			test(name, async function () {
				await testStatementBuilding('typescript', code);
			});
		}

		const compoundTypeCases: [name: string, doc: string, expected: boolean][] = [
			['node.isCompoundStatementType is true for splittable statements that may contain other statements', 'if (x) { y = 1; }', true],
			['node.isCompoundStatementType is false for un-splittable statements', 'const y = 1;', false],
		];
		for (const [name, doc, expected] of compoundTypeCases) {
			test(name, async function () {
				using tree = StatementTree.create('typescript', doc, 0, doc.length);

				await tree.build();
				const statement = tree.statementAt(1);

				assert.ok(statement);
				assert.strictEqual(statement.isCompoundStatementType, expected);
			});
		}
	});

	// MARK: Python

	suite('Python', function () {
		test('python is supported', function () {
			assert.strictEqual(StatementTree.isSupported('python'), true);
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes simple expression statements', dedent`
				▶️x = 1◀️
				▶️y = 2◀️
				`],
			['ignores comments', dedent`
				▶️x = 1◀️
				# comment
				▶️y = 2◀️
				`],
			['recognizes import statements', `▶️import assert◀️`],
			['recognizes from import statements', `▶️from assert import strict◀️`],
			['recognizes from future import statements', `▶️from __future__ import annotations◀️`],
			['recognizes print statements', `▶️print a◀️`],
			['recognizes assert statements', `▶️assert x◀️`],
			['recognizes return statements', dedent`
				▶️def example():
					▶️▶️return 1◀️◀️◀️
				`],
			['recognizes delete statements', `▶️del x◀️`],
			['recognizes raise statements', `▶️raise ValueError◀️`],
			['recognizes pass statements', dedent`
				▶️def example():
					▶️▶️pass◀️◀️◀️`],
			['recognizes break statements', dedent`
				▶️while True:
					▶️▶️break◀️◀️◀️
				`],
			['recognizes continue statements', dedent`
				▶️while True:
					▶️▶️continue◀️◀️◀️
				`],
			['recognizes global statements', `▶️global x◀️`],
			['recognizes nonlocal statements', dedent`
				▶️def example():
					▶️▶️nonlocal x◀️◀️◀️`],
			['recognizes exec statements', `▶️exec 'x+=1' in None◀️`],
			['recognizes statements with list comprehensions as single statements', `▶️some_powers_of_two = [2**n for in range(1,6) if n != 5]◀️`],
			['recognizes statements with lamba expressions as single statements', `▶️fn = lambda x: x+1◀️`],
			['recognizes if statements', dedent`
				▶️if x:
					▶️▶️y = 1◀️◀️◀️
				`],
			['recognizes if statements on a single line as single statements', dedent`
				▶️if x: y = 1◀️
				`],
			['recognizes if / else statements', dedent`
				▶️if x:
					▶️▶️y = 1◀️◀️
				else:
					▶️▶️y = 2◀️◀️◀️
				`],
			['recognizes compact if / else statements as compound statements', dedent`
				▶️if x: ▶️▶️y = 1◀️◀️
				else: ▶️▶️y = 2◀️◀️◀️
				`],
			['recognizes if / elif / else statements', dedent`
				▶️if x:
					▶️▶️y = 1◀️◀️
				elif y:
					▶️▶️y = 2◀️◀️
				else:
					▶️▶️y = 3◀️◀️◀️
				`],
			['recognizes statements with conditional expressions as single statements', `▶️result = x if y else z◀️`],
			['recognizes for statements', dedent`
				▶️for i in range(10):
					▶️▶️y = 1◀️◀️◀️
				`],
			['recognizes for / else statements', dedent`
				▶️for line in lines:
					▶️▶️print line◀️◀️
				else:
					▶️▶️print x◀️◀️◀️
				`],
			['recognizes while statements', dedent`
				▶️while x:
					▶️▶️print y◀️◀️◀️
				`],
			['recognizes while / else statements', dedent`
				▶️while x:
					▶️▶️print y◀️◀️
				else:
					▶️▶️print z◀️◀️◀️
				`],
			['recognizes try / except / finally statements', dedent`
				▶️try:
					▶️▶️x = 1◀️◀️
				except:
					▶️▶️x = 2◀️◀️
				finally:
					▶️▶️x = 3◀️◀️◀️
				`],
			['recognizes with statements', dedent`
				▶️with open('file.txt') as f:
					▶️▶️x = f.read()◀️◀️◀️
				`],
			['recognizes function definitions', dedent`
				▶️def add(x, y):
					▶️▶️return x + y◀️◀️◀️
				`],
			// this is slightly odd that the grammar gives these an expression type,
			// but it is ok for the purposes of completion trimming and block
			// position determination
			['recognizes docstrings as expressions', dedent`
				▶️def example():
					▶️▶️"""
					This is a docstring.
					"""◀️
					▶️pass◀️◀️◀️
				`],
			['recognizes class definitions', dedent`
				▶️class Example:
						▶️▶️pass◀️◀️◀️
				`],
			['recognizes class method definitions', dedent`
				▶️class Example:
					▶️▶️def method(self):
						▶️▶️pass◀️◀️◀️◀️◀️
				`],
			['recognizes decorated definitions', dedent`
				▶️@decorator1
				@decorator2
				▶️def example():
					▶️▶️pass◀️◀️◀️◀️
				`],
			['recognizes match statements', dedent`
				▶️match x:▶️
					case 1:
						▶️▶️y = 1◀️◀️
					case 2:
						▶️▶️y = 2◀️◀️
					case _:
						▶️▶️y = 3◀️◀️◀️◀️
				`],
			['permits type annotations on variable assignments', `▶️x: list[int] = []◀️`],
			['permits type annotations on functions', dedent`
				▶️def example(x: int) -> int:
					▶️▶️return x + 1◀️◀️◀️
				`],
			// this is to document the behavior of the current grammar
			// type alias is not supported in 0.23 Python grammar. Results in no statement.
			['permits type aliases but omits the type keyword from the statement', `type Vector = list[float]`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('python', code);
			});
		}

		const compoundTypeCases: [name: string, doc: string, expected: boolean][] = [
			['node.isCompoundStatementType is false for un-splittable statements', 'y = 1', false],
			['node.isCompoundStatementType is true for if statements', 'if x:\n\tpass', true],
			['node.isCompoundStatementType is true for for statements', 'for i in range(10):\n\tpass', true],
			['node.isCompoundStatementType is true for while statements', 'while x:\n\tpass', true],
			['node.isCompoundStatementType is true for try statements', 'try:\n\tpass\nexcept:\n\tpass', true],
			['node.isCompoundStatementType is true for with statements', 'with open("file.txt") as f:\n\tpass', true],
			['node.isCompoundStatementType is true for function definition statements', 'def example():\n\tpass', true],
			['node.isCompoundStatementType is true for class definition statements', 'class Example:\n\tpass', true],
			['node.isCompoundStatementType is true for decorated definition statements', '@decorator\ndef example():\n\tpass', true],
			['node.isCompoundStatementType is true for match statements', 'match x:\n\tcase 1:\n\t\tpass', true],
		];
		for (const [name, doc, expected] of compoundTypeCases) {
			test(name, async function () {
				using tree = StatementTree.create('python', doc, 0, doc.length);

				await tree.build();
				const statement = tree.statementAt(1);

				assert.ok(statement);
				assert.strictEqual(statement.isCompoundStatementType, expected);
			});
		}
	});

	// MARK: Go

	suite('Go', function () {
		test('go is supported', function () {
			assert.strictEqual(StatementTree.isSupported('go'), true);
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes package clauses', `▶️package main◀️`],
			['recognizes function declarations', dedent`
				▶️package main◀️

				▶️func example() ▶️{}◀️◀️
				`],
			['recognizes method declarations', dedent`
				▶️package main◀️

				▶️func (self Document) GetLine(n int) ▶️{}◀️◀️
				`],
			['recognizes import declarations', dedent`
				▶️package main◀️

				▶️import "fmt"◀️
				`],
			['recognizes grouped import declarations', dedent`
				▶️package main◀️

				▶️import (
					"fmt"
					"os
				)◀️
				`],
			['ignores comments', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					// comment
				}◀️◀️
				`],
			['ignores block comments', dedent`
				▶️package main◀️

				/*
				 * Comment
				 */
				▶️func main() ▶️{}◀️◀️
				`],
			['recognizes single constant declarations', dedent`
				▶️package main◀️

				▶️const zero = 0◀️
				`],
			['recognizes grouped constant declarations', dedent`
				▶️package main◀️

				▶️const (
					zero = 0
					one = 1
				)◀️
				`],
			['recognizes var declarations', dedent`
				▶️package main◀️

				▶️var counter = 0◀️
				`],
			['recognizes type declarations', dedent`
				▶️package main◀️

				▶️type a b◀️
				`],
			['recognizes simple expression statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️x := 1◀️
				}◀️◀️
				`],
			['recognizes return statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️return◀️
				}◀️◀️
				`],
			['recognizes go statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️go f()◀️
				}◀️◀️
				`],
			['recognizes defer statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️defer f()◀️
				}◀️◀️
				`],
			['recognizes if statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️if a ▶️{
						▶️b◀️
					}◀️◀️
				}◀️◀️
				`],
			['recognizes if statements with an initializer', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️if b := a(); b < 0 ▶️{
						▶️b *= -1◀️
					}◀️◀️
				}◀️◀️
				`],
			['recognizes if / else statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️if a ▶️{
						▶️b()◀️
					}◀️ else ▶️{
						▶️c()◀️
					}◀️◀️
				}◀️◀️
				`],
			['recognizes simple for statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️for ▶️{
						▶️a()◀️
					}◀️◀️
				}◀️◀️
				`],
			['recognizes for statements with conditions', dedent`
				▶️package main◀️
				▶️import "fmt"◀️

				▶️func main() ▶️{
					▶️for i:= 0; i < 10; i++ ▶️{
						▶️fmt.Println(i)◀️
					}◀️◀️
				}◀️◀️
				`],
			['recognizes expression switch statements', dedent`
				▶️package main◀️
				▶️import "fmt"◀️

				▶️func main() ▶️{
					▶️switch a {
						case 1:
							▶️b◀️
						case 2:
							▶️c◀️
						default:
							▶️d◀️
					}◀️
				}◀️◀️
				`],
			['recognizes type switch statements', dedent`
				▶️package main◀️

				▶️func debug(i interface{}) ▶️{
					▶️switch v := i.(type) {
						case int:
							▶️fmt.Printf("%v is an integer", v)◀️
						case string:
							▶️fmt.Printf("%q is a string", v)◀️
						default:
							▶️fmt.Printf("%T is unknown", v)◀️
					}◀️
				}◀️◀️
				`],
			['recognizes select statements', dedent`
				▶️package main◀️

				▶️func demux(a chan string, b chan string) ▶️{
					▶️select {
						case msg := <-a:
							▶️dispatch(msg)◀️
						case msg := <-b:
							▶️dispatch(msg)◀️
					}◀️
				}◀️◀️
				`],
			['recognizes labeled statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
				▶️start:
					▶️a()◀️◀️
					▶️b()◀️
				}◀️◀️
				`],
			['recognizes fallthrough statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️switch i {
						case 0:
							▶️fallthrough◀️
						default:
							▶️f(i)◀️
					}◀️
				}◀️◀️
				`],
			['recognizes break statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️switch i {
						case 0:
							▶️break◀️
						default:
							▶️f(i)◀️
					}◀️
				}◀️◀️
				`],
			['recognizes continue statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️for i := 0; i < 10; i++ ▶️{
						▶️if i == 0 ▶️{
							▶️continue◀️
						}◀️◀️
						▶️f(i)◀️
					}◀️◀️
				}◀️◀️
				`],
			['recognizes goto statements', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️goto end◀️
				▶️end:
					▶️return◀️◀️
				}◀️◀️
				`],
			['recognizes nested blocks', dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️{
						▶️a()◀️
					}◀️
				}◀️◀️
				`],
			['recognizes empty statements', dedent`
				▶️package main◀️

				▶️func noop() ▶️{
					▶️;◀️
				}◀️◀️
				`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('go', code);
			});
		}

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			await assertStatementIsNotCompoundType(dedent`
				package main

				func main() {
					❚x := 1
				}
			`);
		});

		const compoundCases: [name: string, code: string][] = [
			['node.isCompoundStatementType is true for function declarations', dedent`
				package main

				❚func main() {}
			`],
			['node.isCompoundStatementType is true for method declarations', dedent`
				package main

				❚func (self Document) GetLine (n int) {}
			`],
			['node.isCompoundStatementType is true for if statements', dedent`
				package main

				func main() {
					❚if a {
						b
					}
				}
			`],
			['node.isCompoundStatementType is true for for statements', dedent`
				package main

				func main() {
					❚for i := 0; i < 10; i++ {
						a()
					}
				}
			`],
			['node.isCompoundStatementType is true for expression switch statements', dedent`
				package main

				func main() {
					❚switch a {
						case 1:
							b
						default:
							c
					}
				}
			`],
			['node.isCompoundStatementType is true for type switch statements', dedent`
				package main

				func f(i interface{}) {
					❚switch v := i.(type) {
						case int:
							b
						default:
							c
					}
				}
			`],
			['node.isCompoundStatementType is true for select statements', dedent`
				package main

				func demux(a chan string, b chan string) {
					❚select {
						case msg := <-a:
							dispatch(msg)
						case msg := <-b:
							dispatch(msg)
					}
				}
			`],
		];
		for (const [name, code] of compoundCases) {
			test(name, async function () {
				await assertStatementIsCompoundType(code);
			});
		}

		async function testStatementIsCompoundType(text: string, expectedResult: boolean) {
			const posIndicator = '❚';
			const offset = text.indexOf(posIndicator);
			const doc = text.replace(posIndicator, '');
			using tree = StatementTree.create('go', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(offset + 1);

			assert.ok(statement, `Statement not found at offset ${offset}`);
			assert.strictEqual(statement.isCompoundStatementType, expectedResult);
		}

		async function assertStatementIsCompoundType(text: string) {
			await testStatementIsCompoundType(text, true);
		}

		async function assertStatementIsNotCompoundType(text: string) {
			await testStatementIsCompoundType(text, false);
		}
	});

	// MARK: Php
	suite('PHP', function () {
		test('Php is supported', function () {
			assert.strictEqual(StatementTree.isSupported('php'), true);
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes simple expressions', dedent`
				<?php
				▶️echo "hello";◀️
				▶️$b = $a = 5;◀️
				?>
				`],
			['recognizes named if statements', dedent`
				<?php
				▶️if (1 == 2) ▶️{
					▶️echo "hello";◀️
				}◀️◀️
				?>
				`],
			['recognizes if statements with else', dedent`
				<?php
				▶️if (1 == 2) ▶️{
					▶️echo "hello";◀️
				}◀️ else ▶️{
					▶️echo "world";◀️
				}◀️◀️
				?>
				`],
			['recognizes if statements with else if', dedent`
				<?php
				▶️if (1 == 2) ▶️{
					▶️echo "hello";◀️
				}◀️ elseif (1 == 3) ▶️{
					▶️echo "world";◀️
				}◀️ else ▶️{
					▶️echo "foo";◀️
				}◀️◀️
				?>
				`],
			['recognizes switch statements', dedent`
				<?php
				▶️switch ($a) {
					case 1:
						▶️echo "hello";◀️
						▶️break;◀️
					case 2:
						▶️echo "world";◀️
						▶️break;◀️
					default:
						▶️echo "foo";◀️
				}◀️
				?>
				`],
			['recognizes while statements', dedent`
				<?php
				▶️while (true) ▶️{
					▶️break;◀️
				}◀️◀️
				?>
				`],
			['recognizes do statements', dedent`
				<?php
				▶️do ▶️{
					▶️break;◀️
				}◀️ while (true);◀️
				?>
				`],
			['recognizes for statements', dedent`
				<?php
				▶️for ($i = 0; $i < 10; $i++) ▶️{
					▶️$str += ' ';◀️
				}◀️◀️
				?>
				`],
			['recognizes foreach statements', dedent`
				<?php
				▶️foreach ($arr as $key => $value) ▶️{
					▶️echo $key;◀️
				}◀️◀️
				?>
				`],
			['recognizes try statements', dedent`
				<?php
				▶️try ▶️{
					▶️throw new Exception();◀️
				}◀️ catch (Exception $e) ▶️{
					▶️echo $e;◀️
				}◀️ finally ▶️{
					▶️echo "done";◀️
				}◀️◀️
				?>
				`],
			['recognizes function declarations', dedent`
				<?php
				▶️function example($arg_1) ▶️{
					▶️echo "hello";◀️
					▶️return $retval;◀️
				}◀️◀️
				?>
				`],
			['recognizes class declarations', dedent`
				<?php
				▶️class Example {
				}◀️
				?>
				`],
			['recognizes class method declarations', dedent`
				<?php
				▶️class Example {
					▶️public function example($arg_1) ▶️{
						▶️echo "hello";◀️
						▶️return $retval;◀️
					}◀️◀️
				}◀️
				?>
				`],
			['recognizes class field declarations', dedent`
				<?php
				▶️class Example {
					▶️public $field_1;◀️
					▶️private $field_2;◀️
				}◀️
				?>
				`],
			['recognizes class constant declarations', dedent`
				<?php
				▶️class Example {
					▶️const EXAMPLE = 1;◀️
				}◀️
				?>
				`],
			['recognizes class interface and trait uses', dedent`
				<?php
				▶️class Example extends BaseClass implements Interface1, Interface2 {
					▶️use Trait1, Trait2;◀️
				}◀️
				?>
				`],
			['recognizes interface declarations', dedent`
				<?php
				▶️interface Example {
					▶️public function example($arg_1);◀️
				}◀️
				?>
				`],
			['recognizes trait declarations', dedent`
				<?php
				▶️trait Example {
					▶️public function example($arg_1) ▶️{
						▶️echo "hello";◀️
					}◀️◀️
				}◀️
				?>
				`],
			['recognizes namespace declarations', dedent`
				<?php
				▶️namespace Example;◀️
				?>
				`],
			['recognizes namespace use declarations', dedent`
				<?php
				▶️use Example\\ExampleClass;◀️
				?>
				`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('php', code);
			});
		}

		const compoundTypeCases: [name: string, doc: string, expected: boolean][] = [
			['node.isCompoundStatementType is true for splittable statements that may contain other statements', dedent`<?php
			if (true)
			{
				$foo = 1;
			}
			?>`, true],
			['node.isCompoundStatementType is false for un-splittable statements', dedent`<?php
			$foo = 1;
			?>`, false],
		];
		for (const [name, doc, expected] of compoundTypeCases) {
			test(name, async function () {
				using tree = StatementTree.create('php', doc, 0, doc.length);

				await tree.build();
				const statement = tree.statementAt(6);

				assert.ok(statement);
				assert.strictEqual(statement.isCompoundStatementType, expected);
			});
		}
	});

	// MARK: Ruby
	suite('Ruby', function () {
		test('ruby is supported', function () {
			assert.strictEqual(StatementTree.isSupported('ruby'), true);
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes simple expression statements', dedent`
				▶️x = 1◀️
				▶️y = 2◀️
				`],
			['ignores comments', dedent`
				▶️x = 1◀️
				# comment
				▶️y = 2◀️
				`],
			['recognizes if statements', dedent`
				▶️if ▶️x◀️
					▶️y = 1◀️
				end◀️
				`],
			['recognizes if / else statements', dedent`
				▶️if ▶️x◀️
					▶️y = 1◀️
				else
					▶️y = 2◀️
				end◀️
				`],
			['recognizes if / elsif / else statements', dedent`
				▶️if ▶️x◀️
					▶️y = 1◀️
				elsif ▶️y◀️
					▶️y = 2◀️
				else
					▶️y = 3◀️
				end◀️
				`],
			['recognizes unless statements', dedent`
				▶️unless ▶️x◀️
					▶️y = 1◀️
				end◀️
				`],
			['recognizes unless / else statements', dedent`
				▶️unless ▶️x◀️
					▶️y = 1◀️
				else
					▶️y = 2◀️
				end◀️
				`],
			['recognizes unless / elsif / else statements', dedent`
				▶️unless ▶️x◀️
					▶️y = 1◀️
				elsif ▶️y◀️
					▶️y = 2◀️
				else
					▶️y = 3◀️
				end◀️
				`],
			['recognizes if modifier statements', dedent`
				▶️▶️x = 1◀️ if y◀️
				`],
			['recognizes unless modifier statements', dedent`
				▶️▶️x = 1◀️ unless y◀️
				`],
			['recognizes range statements', dedent`
				▶️x = 1..10◀️
				`],
			['recognizes case statements', dedent`
				▶️case ▶️x◀️
					▶️when 1
						▶️y = 1◀️◀️
					▶️when 2
						▶️y = 2◀️◀️
					else
						▶️y = 3◀️
				end◀️
				`],
			['recognizes for statements', dedent`
				▶️for i in 1..10 do
					▶️y = 1◀️
				end◀️
				`],
			['recognizes while statements', dedent`
				▶️while ▶️x◀️
					▶️y = 1◀️
				end◀️
				`],
			['recognizes until statements', dedent`
				▶️until ▶️x◀️
					▶️y = 1◀️
				end◀️
				`],
			['recognizes loop modifier statements', dedent`
				▶️▶️sleep◀️ while idle◀️
				▶️▶️sleep◀️ until idle◀️
				`],
			['recognizes begin / rescue / else / ensure statements', dedent`
				▶️begin
					▶️x = 1◀️
				rescue
					▶️x = 2◀️
				else
					▶️x = 3◀️
				ensure
					▶️x = 4◀️
				end◀️
				`],
			['recognizes begin statements', dedent`
				▶️BEGIN {
					▶️x = 1◀️
				}◀️
				`],
			['recognizes end statements', dedent`
				▶️END {
					▶️x = 1◀️
				}◀️
				`],
			['recognizes class definitions', dedent`
				▶️class Example < Base
					▶️x = 1◀️
				end◀️
				`],
			['recognizes class definitions with methods', dedent`
				▶️class Example < Base
					▶️def method
						▶️x = 1◀️
					end◀️
				end◀️
				`],
			['recognizes module definitions', dedent`
				▶️module Example
					▶️x = 1◀️
				end◀️
				`],
			['recognizes module definitions with methods', dedent`
				▶️module Example
					▶️def method
						▶️x = 1◀️
					end◀️
				end◀️
				`],
			['recognizes def statements', dedent`
				▶️def example
					▶️x = 1◀️
				end◀️
				`],
			['recognizes method invocation with a block argument,', dedent`
				▶️someArray.select do |item|
					▶️item %2 == 0◀️
				end◀️
				`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('ruby', code);
			});
		}

		test('node.isCompoundStatementType is true for splittable statements that may contain other statements', async function () {
			const doc = dedent`
			if x
			    y = 1
			end

			case x
			when x
			    y = 1
			end

			while x
			    y = 1
			end

			until x
			    y = 1
			end

			for x in y
			    y = 1
			end

			begin
			    y = 1
			rescue
			    y = 1
			else
			    y = 1
			ensure
			    y = 1
			end

			class X
			    y = 1
			end

			module X
			    y = 1
			end

			def x
			    y = 1
			end
			`;
			using tree = StatementTree.create('ruby', doc, 0, doc.length);

			await tree.build();
			const if_statement = tree.statementAt(1);
			const case_statement = tree.statementAt(20);
			const while_statement = tree.statementAt(68);
			const until_statement = tree.statementAt(107);
			const for_statement = tree.statementAt(146);
			const begin_statement = tree.statementAt(145);
			const class_statement = tree.statementAt(191);
			const module_statement = tree.statementAt(214);
			const def_statement = tree.statementAt(238);

			assert.ok(if_statement);
			assert.strictEqual(if_statement.isCompoundStatementType, true);
			assert.ok(case_statement);
			assert.strictEqual(case_statement.isCompoundStatementType, true);
			assert.ok(while_statement);
			assert.strictEqual(while_statement.isCompoundStatementType, true);
			assert.ok(until_statement);
			assert.strictEqual(until_statement.isCompoundStatementType, true);
			assert.ok(for_statement);
			assert.strictEqual(for_statement.isCompoundStatementType, true);
			assert.ok(begin_statement);
			assert.strictEqual(begin_statement.isCompoundStatementType, true);
			assert.ok(class_statement);
			assert.strictEqual(class_statement.isCompoundStatementType, true);
			assert.ok(module_statement);
			assert.strictEqual(module_statement.isCompoundStatementType, true);
			assert.ok(def_statement);
			assert.strictEqual(def_statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			const doc = 'x = 1';
			using tree = StatementTree.create('ruby', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, false);
		});
	});

	// MARK: Java

	suite('Java', function () {
		test('java is supported', function () {
			assert.strictEqual(StatementTree.isSupported('java'), true);
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes blocks', dedent`
				▶️public class BlockSample {
					▶️public static void main(String[] args) ▶️{
						▶️{}◀️
					}◀️◀️
				}◀️
				`],
			['recognizes assert statements', dedent`
				▶️public class AssertSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 10;◀️
						▶️assert x > 0 : "x should be positive";◀️
					}◀️◀️
				}◀️
				`],
			['recognizes break statements', dedent`
				▶️public class BreakSample {
					▶️public static void main(String[] args) ▶️{
						▶️for (int i = 0; i < 10; i++) ▶️{
							▶️if (i == 5) ▶️{
								▶️break;◀️
							}◀️◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes continue statements', dedent`
				▶️public class ContinueSample {
					▶️public static void main(String[] args) ▶️{
						▶️for (int i = 0; i < 10; i++) ▶️{
							▶️if (i == 5) ▶️{
								▶️continue;◀️
							}◀️◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes do statements', dedent`
				▶️public class DoWhileSample {
					▶️public static void main(String[] args) ▶️{
						▶️int i = 0;◀️
						▶️do ▶️{
							▶️if (i == 5) ▶️{
								▶️continue;◀️
							}◀️◀️
							▶️i++;◀️
						}◀️ while (i < 10);◀️
					}◀️◀️
				}◀️
				`],
			['recognizes for-each (enhanced_for) statements', dedent`
				▶️public class ForEachSample {
					▶️public static void main(String[] args) ▶️{
						▶️int[] numbers = {1, 2, 3, 4, 5};◀️
						▶️for (int n : numbers) ▶️{
							▶️if (n == 5) ▶️{
								▶️continue;◀️
							}◀️◀️️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes simple expression statements', dedent`
				▶️public class SimpleExpressionSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 1;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes for statements', dedent`
				▶️public class ForSample {
					▶️public static void main(String[] args) ▶️{
						▶️for (int i = 0; i < 10; i++) ▶️{
							▶️int x = i;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes if statements', dedent`
				▶️public class IfSample {
					▶️public static void main(String[] args) ▶️{
						▶️int number = 1;◀️
						▶️if (number > 0) ▶️{
							▶️number++;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes labeled statements', dedent`
				▶️public class LabelSample {
					▶️public static void main(String[] args) ▶️{
						▶️myLabel: ▶️{
							▶️int x = 1;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes local variable declarations', dedent`
				▶️public class LocalVariableSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 1;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes return statement', dedent`
				▶️public class ReturnSample {
					▶️public static void main(String[] args) ▶️{
						▶️int number = ReturnSample.add(5, 10);◀️
					}◀️◀️
					▶️public static int add(int a, int b) ▶️{
						▶️return a + b;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes switch statements', dedent`
				▶️public class SwitchSample {
					▶️public static void main(String[] args) ▶️{
						▶️int test = 1;◀️
						▶️switch (test) {
							case 0:
								▶️System.out.println("The number is one.");◀️
								▶️break;◀️
							case 1:
								▶️System.out.println("The number is zero.");◀️
								▶️break;◀️
							default:
								▶️System.out.println("The number is not zero or one.");◀️
								▶️break;◀️
						}◀️
					}◀️◀️
				}◀️
				`],
			['recognizes synchronized statements', dedent`
				▶️public class SynchronizedSample {
					▶️public static void main(String[] args) ▶️{
						▶️int counter = 0;◀️
						▶️synchronized (ReturnSample.class) ▶️{
							▶️counter++;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes throw statements', dedent`
				▶️public class ThrowSample {
					▶️public static void main(String[] args) ▶️{
						▶️throw new RuntimeException("This is a runtime exception");◀️
					}◀️◀️
				}◀️
				`],
			['recognizes try statements', dedent`
				▶️public class TrySample {
					▶️public static void main(String[] args) ▶️{
						▶️try ▶️{
							▶️int result = 10 / 0;◀️
						}◀️ catch (ArithmeticException e) ▶️{
							▶️System.out.println("Cannot divide by zero");◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes try with resources statements', dedent`
				▶️public class TrySample {
					▶️public static void main(String[] args) ▶️{
						▶️try (BufferedReader br = new BufferedReader()) ▶️{
							▶️int result = 10 / 0;◀️
						}◀️ catch (ArithmeticException e) ▶️{
							▶️System.out.println("Cannot divide by zero");◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`],
			['recognizes enum declarations', dedent`
				▶️public class EnumSample {
					▶️public static void main(String[] args) ▶️{
						▶️public enum Day {
							MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
						}◀️
					}◀️◀️
				}◀️
				`],
			['recognizes import declarations', dedent`
				▶️import java.util.List;◀️
				▶️public class ImportSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`],
			['recognizes interface declarations', dedent`
				▶️public interface Animal {
					▶️void makeSound();◀️
				}◀️
				▶️public class InterfaceSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`],
			['recognizes method declarations', dedent`
				▶️public class MethodSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public static void add(int a, int b) ▶️{
						▶️int sum = a + b;◀️
						▶️System.out.println("Sum: " + sum);◀️
					}◀️◀️
				}◀️
				`],
			['recognizes field declarations', dedent`
				▶️public class InterfaceSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public static int x = 0;◀️
				}◀️
				`],
			['recognizes compact constructor declarations', dedent`
				▶️public record Person(String firstName, String lastName) {
					▶️public Person ▶️{
						▶️firstName = firstName;◀️
						▶️lastName = lastName;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes class declaration inside a class body', dedent`
				▶️public class OuterSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public class InnerSample {
						▶️public static void innerMethod() ▶️{
							▶️int x = 0;◀️
						}◀️◀️
					}◀️
				}◀️
				`],
			['recognizes interface declaration inside a class body', dedent`
				▶️public class OuterSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public interface InnerInterface {
						▶️void innerMethod();◀️
					}◀️
				}◀️
				`],
			['recognizes annotation type declaration inside a class body', dedent`
				▶️public class AnnotateSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public @interface MyAnnotation {
					}◀️
				}◀️
				`],
			['recognizes enum declarations inside a class body', dedent`
				▶️public class EnumClassSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public enum Day {
						MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
					}◀️
				}◀️
				`],
			['recognizes static initializer inside a class body', dedent`
				▶️public class StaticInitClassSample {
					▶️static int count;◀️
					▶️static ▶️{
						▶️count = 100;◀️
					}◀️◀️
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`],
			['recognizes constructor declarations', dedent`
				▶️public class ConstructorSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				▶️public class MyClass {
					▶️public MyClass() {
						▶️int x = 0;◀️
					}◀️
				}◀️
				`],
			['recognizes record declarations', dedent`
				▶️public record Point(int x, int y) {}◀️
				▶️public class RecordSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`],
			['recognizes ternary statements as one line', dedent`
				▶️public class RecordSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 5;◀️
						▶️int y = (x == 5) ? 0 : 1;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes single line if statements as one statement', dedent`
				▶️public class SingleLineIfSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 5;◀️
						▶️int y = 10;◀️
						▶️if (x == 5) y = 0;◀️
					}◀️◀️
				}◀️
				`],
			['recognizes single line if else statements with blocks as multiple statements', dedent`
				▶️public class SingleLineIfSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 5;◀️
						▶️int y = 10;◀️
						▶️if (x == 5) ▶️{ ▶️y = 0;◀️ }◀️◀️
					}◀️◀️
				}◀️
				`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('java', code);
			});
		}

		const compoundCases: [name: string, code: string][] = [
			['node.isCompoundStatementType is true for splittable block statements', dedent`
						{
							int x = 1;
						}`],
			['node.isCompoundStatementType is true for splittable do statements', dedent`
						do {
							int x = 1;
						} while (true);`],
			['node.isCompoundStatementType is true for splittable enhanced for statements', dedent`
				for (int n : numbers) {
					int x = 1;
				}`],
			['node.isCompoundStatementType is true for splittable for statements', dedent`
				for (int i = 0; i < 10; i++) {
					int x = 1;
				}`],
			['node.isCompoundStatementType is true for splittable labeled statements', dedent`
				myLabel: {
					int x = 1;
				}`],
			['node.isCompoundStatementType is true for splittable switch expression', dedent`
				switch (test) {
					case 0:
						System.out.println("The number is one.");
						break;
				}`],
			['node.isCompoundStatementType is true for splittable synchronized statement', dedent`
				synchronized (ReturnSample.class) {
					int x = 1;
				}`],
			['node.isCompoundStatementType is true for splittable try statement', dedent`
				try {
					int result = 10 / 0;
				} catch (ArithmeticException e) {
					System.out.println("Cannot divide by zero");
				}`],
			['node.isCompoundStatementType is true for splittable try with resources statement', dedent`
				try (BufferedReader br = new BufferedReader(new FileReader("file.txt"))) {
					int result = 10 / 0;
				} catch (ArithmeticException e) {
					System.out.println("Cannot divide by zero");
				}`],
			['node.isCompoundStatementType is true for splittable while statement', dedent`
				while (true) {
					int x = 1;
				}`],
			['node.isCompoundStatementType is true for splittable interface declaration', dedent`
				public interface InnerInterface {
					void innerMethod();
				}`],
			['node.isCompoundStatementType is true for splittable method declaration', dedent`
				public static void add(int a, int b) {
					int sum = a + b;
				}`],
			['node.isCompoundStatementType is true for splittable constructor declaration', dedent`
				class MyClass {
					 ❚public MyClass() {
						int x = 0;
					}
				}`],
			['node.isCompoundStatementType is true for splittable compact constructor declaration', dedent`
				public record Person(String firstName, String lastName) {
					❚public Person {
						firstName = firstName;
						lastName = lastName;
					}
				}`],
			['node.isCompoundStatementType is true for splittable class declaration', dedent`
				class MyClass {
					 public MyClass() {
						int x = 0;
					}
				}`],
			['node.isCompoundStatementType is true for splittable annotation type declaration', dedent`
				public @interface MyAnnotation {
					void myMethod();
				}`],
			['node.isCompoundStatementType is true for splittable static initializer', dedent`
				public class StaticInitClassSample {
					static int count
					❚static
					{
						count = 100;
					}
				}`],
			['node.isCompoundStatementType is true for splittable if statements', dedent`
						if (true) {
							int x = 1;
						}`],
		];
		for (const [name, code] of compoundCases) {
			test(name, async function () {
				await assertStatementIsCompoundType(code);
			});
		}

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			await assertStatementIsNotCompoundType('int x = 1;');
		});

		async function testStatementIsCompoundType(text: string, expectedResult: boolean) {
			const posIndicator = '❚';
			const offset = text.indexOf(posIndicator);
			const doc = text.replace(posIndicator, '');
			using tree = StatementTree.create('java', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(offset + 1);

			assert.ok(statement, `Statement not found at offset ${offset}`);
			assert.strictEqual(statement.isCompoundStatementType, expectedResult);
		}

		async function assertStatementIsCompoundType(text: string) {
			await testStatementIsCompoundType(text, true);
		}

		async function assertStatementIsNotCompoundType(text: string) {
			await testStatementIsCompoundType(text, false);
		}
	});

	// MARK: C#

	suite('C#', function () {
		test('csharp is supported', function () {
			assert.strictEqual(StatementTree.isSupported('csharp'), true);
		});

		const statementCases: [name: string, code: string][] = [
			['recognizes extern alias directives', `▶️extern alias Example;◀️`],
			['recognizes using directives', `▶️using System;◀️`],
			['recognizes global attributes', `▶️[assembly: AssemblyTitle("Example")]◀️`],
			['recognizes top-level pre-processor directives', dedent`
					▶️#if WIN32
						▶️string os = "Win32";◀️
					#elif MACOS
						▶️string os = "MacOS";◀️
					#else
						▶️string os = "Linux";◀️
					#endif◀️
				`],
			['recognizes file-scoped namespace declarations', `▶️namespace Example;◀️`],
			['recognizes namespace declarations', `▶️namespace Example { }◀️`],
			['recognizes top-level statements', `▶️Console.WriteLine("example");◀️`],
			['recognizes enum declarations', dedent`
					▶️enum Direction
					{
						North,
						South,
						East,
						West
					}◀️
				`],
			['recognizes class declarations', dedent`
					▶️class Example
					{
					}◀️
				`],
			['recognizes struct declarations', dedent`
					▶️struct Example
					{
					}◀️
				`],
			['recognizes record declarations', dedent`
					▶️record Example
					{
					}◀️
				`],
			['recognizes interface declarations', dedent`
					▶️interface Example
					{
					}◀️
				`],
			['recognizes fields', dedent`
					▶️class Example
					{
						▶️bool flag = true;◀️
					}◀️
				`],
			['recognizes event fields', dedent`
					▶️class Example
					{
						▶️event EventHandler onEvent;◀️
					}◀️
				`],
			['recognizes properties', dedent`
					▶️class Example
					{
						▶️int Len
						{
							▶️get ▶️{ ▶️return _len;◀️ }◀️◀️
							▶️set ▶️{ ▶️_len = value;◀️ }◀️◀️
						}◀️
					}◀️
				`],
			['recognizes automatic properties', dedent`
					▶️class Example
					{
						▶️int Len { ▶️get;◀️ ▶️set;◀️ }◀️
						▶️int Capacity { ▶️get;◀️ ▶️init;◀️ }◀️
					}◀️
				`],
			['recognizes properties with initial values', dedent`
					▶️class Example
					{
						▶️int Len { ▶️get;◀️ } = 0;◀️
					}◀️
				`],
			['recognizes properties with an arrow expression', dedent`
					▶️class Example
					{
						▶️int Area => _width * _height;◀️
					}◀️
				`],
			['recognizes event declarations with add / remove functions', dedent`
					▶️class Example
					{
						▶️event EventHandler onEvent
						{
							▶️add ▶️{ ▶️someWork();◀️ }◀️◀️
						}◀️
					}◀️
				`],
			['recognizes methods', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
						}◀️◀️
					}◀️
				`],
			['recognizes constructors', dedent`
					▶️class Example
					{
						▶️Example()
						▶️{
						}◀️◀️
					}◀️
				`],
			['recognizes destructors', dedent`
					▶️class Example
					{
						▶️~Example()
						▶️{
						}◀️◀️
					}◀️
				`],
			['recognizes indexers', dedent`
					▶️class Example
					{
						▶️int this[int index]()
						{
							▶️get ▶️{ ▶️return _items[index];◀️ }◀️◀️
							▶️set ▶️{ ▶️_items[index] = value;◀️ }◀️◀️
						}◀️
					}◀️
				`],
			['recognizes operators', dedent`
					▶️class Example
					{
						▶️Example operator +(Example e) ▶️{ ▶️return new Example();◀️ }◀️◀️
					}◀️
				`],
			['recognizes conversion operators', dedent`
					▶️class Example
					{
						▶️explicit operator int(Example e) ▶️{ ▶️return 0;◀️ }◀️◀️
					}◀️
				`],
			['recognizes delegates', dedent`
					▶️class Example
					{
						▶️delegate void Action();◀️
					}◀️
				`],
			['recognizes block statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️{
								▶️Console.WriteLine("example");◀️
							}◀️
						}◀️◀️
					}◀️
				`],
			['recognizes break statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️for (;;) ▶️{
								▶️break;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes expression statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️x = y * 4 + 2;◀️
						}◀️◀️
					}◀️
				`],
			['recognizes checked statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️uint i = uint.MaxValue;◀️
							▶️checked
							▶️{
								▶️i += 10;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes do statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️int i = 0;◀️
							▶️do
							▶️{
								▶️Console.WriteLine(i);◀️
								▶️i++;◀️
							}◀️ while (i < 10);◀️
						}◀️◀️
					}◀️
				`],
			['recognizes empty statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️;◀️
						}◀️◀️
					}◀️
				`],
			['recognizes unsafe statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️unsafe
							▶️{
								▶️int numbers = [1, 2, 3];◀️
								▶️int* p = numbers;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes fixed statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️unsafe
							▶️{
								▶️int numbers = [1, 2, 3];◀️
								▶️fixed (int* p = numbers)
								▶️{
									▶️Console.WriteLine(*p);◀️
								}◀️◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes for statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️for (int i = 0; i < 5; i++)
							▶️{
								▶️Console.WriteLine(i);◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes return statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️return;◀️
						}◀️◀️
					}◀️
				`],
			['recognizes lock statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️lock (x)
							▶️{
								// do work
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes yield statements', dedent`
					▶️class Example
					{
						▶️IEnumerable<int> Odds(int through)
						▶️{
							▶️for (int i = 1; i <= through; i += 2)
							▶️{
								▶️yield return i;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes switch statements', dedent`
					▶️class Example
					{
						▶️void Diagnostics(int a, int b)
						▶️{
							▶️switch ((a, b))
							{
								case (> 0, > 0) when a == b:
									▶️Console.WriteLine("Values are equal");◀️
									▶️break;◀️
								case (> 0, > 0):
									▶️Console.WriteLine("Both values are positive");◀️
									▶️break;◀️
								default:
									▶️Console.WriteLine("One or more values are not positive");◀️
									▶️break;◀️
							}◀️
						}◀️◀️
					}◀️
				`],
			['recognizes throw statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️throw new Exception("Error occurred");◀️
						}◀️◀️
					}◀️
				`],
			['recognizes try / catch / finally statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️try
							▶️{
								▶️throw new Exception("Error occurred");◀️
							}◀️
							catch (Exception e)
							▶️{
								▶️Console.WriteLine(e.Message);◀️
							}◀️
							finally
							▶️{
								▶️Console.WriteLine("Done");◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes using statements', dedent`
					▶️class Example
					{
						▶️void ReadFile(string path)
						▶️{
							▶️using var file = new StreamReader(path);◀️
						}◀️◀️
					}◀️
				`],
			['recognizes foreach statements', dedent`
					▶️class Example
					{
						▶️void PrintAll(List<int> numbers)
						▶️{
							▶️foreach (var number in numbers)
							▶️{
								▶️Console.WriteLine(number);◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes goto and labeled statements', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️goto End;◀️

						▶️End:
							▶️return;◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes if / else statements', dedent`
					▶️class Example
					{
						▶️bool IsEven(int number)
						▶️{
							▶️if (number % 2 == 0)
							▶️{
								▶️return true;◀️
							}◀️
							else
							▶️{
								▶️return false;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['collapses single-line if statements without braces', dedent`
					▶️class Example
					{
						▶️void Run(bool flag)
						▶️{
							▶️if (flag) return;◀️
						}◀️◀️
					}◀️
				`],
			['recognizes while statements', dedent`
					▶️class Example
					{
						▶️void PrintTimes(string message, int times)
						▶️{
							▶️int i = 0;◀️
							▶️while (i < times)
							▶️{
								▶️Console.WriteLine(message);◀️
								▶️i++;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`],
			['recognizes local variable declarations', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️int x = 10;◀️
						}◀️◀️
					}◀️
				`],
			['recognizes local function declarations', dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️void LocalFunction() ▶️{ ▶️Console.WriteLine("Hello from local function!");◀️ }◀️◀️
							▶️LocalFunction();◀️
						}◀️◀️
					}◀️
				`],
		];
		for (const [name, code] of statementCases) {
			test(name, async function () {
				await testStatementBuilding('csharp', code);
			});
		}

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			await assertStatementIsNotCompoundType(dedent`
				class Example
				{
					static void Main()
					{
						❚int x = 1;
					}
				}
			`);
		});

		const compoundCases: [name: string, code: string][] = [
			['node.isCompoundStatementType is true for class declarations', dedent`
				❚class Example
				{
				}
			`],
			['node.isCompoundStatementType is true for struct declarations', dedent`
				❚struct Example
				{
				}
			`],
			['node.isCompoundStatementType is true for interface declarations', dedent`
				❚interface Example
				{
				}
			`],
			['node.isCompoundStatementType is true for method declarations', dedent`
				class Example
				{
					❚void Run()
					{
					}
				}
			`],
			['node.isCompoundStatementType is true for constructor declarations', dedent`
				class Example
				{
					❚Example()
					{
					}
				}
			`],
			['node.isCompoundStatementType is true for destructor declarations', dedent`
				class Example
				{
					❚~Example()
					{
					}
				}
			`],
			['node.isCompoundStatementType is true for blocks', dedent`
				class Example
				{
					void Run()
					{
						❚{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for checked statements', dedent`
				class Example
				{
					void Run()
					{
						❚checked
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for do statements', dedent`
				class Example
				{
					void Run()
					{
						❚do
						{
						} while (false);
					}
				}
			`],
			['node.isCompoundStatementType is true for fixed statements', dedent`
				class Example
				{
					void Run()
					{
						❚fixed
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for for statements', dedent`
				class Example
				{
					void Run()
					{
						❚for (;;)
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for lock statements', dedent`
				class Example
				{
					void Run()
					{
						❚lock (x)
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for switch statements', dedent`
				class Example
				{
					void Run()
					{
						❚switch (x)
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for try statements', dedent`
				class Example
				{
					void Run()
					{
						❚try
						{
						}
						finally
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for unsafe statements', dedent`
				class Example
				{
					void Run()
					{
						❚unsafe
						{
						}
					}
				}
			`],
			['node.isCompoundStatementType is true for foreach statements', dedent`
				class Example
				{
					void Run()
					{
						❚foreach (var item in items)
						{
						}
					}
				}
			`],
		];
		for (const [name, code] of compoundCases) {
			test(name, async function () {
				await assertStatementIsCompoundType(code);
			});
		}

		test('node.isCompoundStatementType is true for uncollapsed if statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚if (x)
						{
						}
					}
				}
			`);

			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚if (x) {}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is false for collapsed if statements', async function () {
			await assertStatementIsNotCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚if (x) return;
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for while statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚while (false)
						{
						}
					}
				}
			`);
		});

		async function assertStatementIsCompoundType(text: string) {
			await testStatementIsCompoundType('csharp', text, true);
		}

		async function assertStatementIsNotCompoundType(text: string) {
			await testStatementIsCompoundType('csharp', text, false);
		}
	});

	// MARK: C, C++

	suite('C, C++', function () {
		const languages = ['c', 'cpp'];
		languages.forEach(lang => {
			test(`${lang} is supported`, function () {
				assert.strictEqual(StatementTree.isSupported(lang), true);
			});
		});

		suite('Statement identification (C, C++)', function () {
			const statementCases: [name: string, code: string][] = [
				['recognizes extern declarations', `▶️extern int foo();◀️`],
				['recognizes typedef declarations', `▶️typedef int myInt;◀️`],
				['recognizes struct declarations', dedent`
					▶️typedef struct Obj
					▶️{
						▶️int x;◀️
						▶️float y;◀️
					}◀️ obj;◀️
				`],
				['recognizes union declarations', dedent`
					▶️union Example
					▶️{
						▶️int x;◀️
						▶️float y;◀️
					}◀️ example◀️
				`],
				['recognizes enum declarations', dedent`
					▶️enum Color
					{
						RED,
						GREEN,
						BLUE
					}◀️
				`],
				['recognizes function declarations', dedent`
					▶️int add(int a, int b)
					▶️{
						▶️return a + b;◀️
					}◀️◀️
				`],
				['recognizes old style function declarations', dedent`
					▶️int add(a, b)◀️
					▶️int a;◀️
					▶️int b;◀️
					▶️{
						▶️return a + b;◀️
					}◀️
				`],
				['recognizes variable declarations', dedent`
					▶️int x = 10;◀️
				`],
				['recognizes compound statements', dedent`
					▶️{
						▶️int x = 10;◀️
						▶️int y = 20;◀️
					}◀️
				`],
				['recognizes if statements', dedent`
					▶️void example()
					▶️{
						▶️if (x > 0)
						▶️{
							▶️printf("Positive");◀️
						}◀️◀️
					}◀️◀️
				`],
				['recognizes else and else if statements', dedent`
					▶️void example()
					▶️{
						▶️if (x > 0)
						▶️{
							▶️printf("Positive");◀️
						}◀️else ▶️if (x < 0)
						▶️{
							▶️printf("Negative");◀️
						}◀️
						else
						▶️{
							▶️printf("Zero");◀️
						}◀️◀️◀️
					}◀️◀️
				`],
				['recognizes switch statements', dedent`
					▶️void example()
					▶️{
						▶️switch (x)
						▶️{
							▶️case 1:
								▶️printf("One");◀️
								▶️break;◀️◀️
							▶️case 2:
								▶️printf("Two");◀️
								▶️break;◀️◀️
							▶️default:
								▶️printf("Default");◀️
								▶️break;◀️◀️
						}◀️◀️
					}◀️◀️
				`],
				['recognizes while statements', dedent`
					▶️void example()
					▶️{
						▶️while (x < 10)
						▶️{
							▶️printf("%d", x);◀️
							▶️x++;◀️
							▶️continue;◀️
						}◀️◀️
					}◀️◀️
				`],
				['recognizes for statements', dedent`
					▶️void example()
					▶️{
						▶️for (▶️int i = 0;◀️ i < 10; i++)
						▶️{
							▶️printf("%d", i);◀️
						}◀️◀️
					}◀️◀️
				`],
				['recognizes do while statements', dedent`
					▶️void example()
					▶️{
						▶️do
						▶️{
							▶️printf("%d", x);◀️
						}◀️ while (x < 10);◀️
					}◀️◀️
				`],
				['recognizes goto statements', dedent`
					▶️goto label;◀️
					▶️label:
						▶️printf("Label reached");◀️◀️
				`],
				['recognizes preprocessor if statements', dedent`
					▶️#if DEBUG
						▶️#define STACK 0
					◀️#elif RELEASE
						▶️#define STACK 100
					◀️#else
						▶️printf("Unknown mode");◀️
					#endif◀️
				`],
				['recognizes ifdef statements', dedent`
					▶️#ifdef DEBUG
						▶️printf("Debug mode");◀️
					#endif◀️
				`],
				['recognizes include statements', dedent`
					▶️#include <stdio.h>
					◀️▶️#include "myheader.h"◀️
				`],
				['recognizes preprocessor call statements', dedent`
					▶️#import "..\\file"
					◀️▶️#line 10
					◀️▶️#pragma once
					◀️▶️#using "using_assembly_A.dll"
					◀️▶️#undef ADD
					◀️▶️#error C++ compiler required.◀️
				`],
				['recognizes preprocessor functions', dedent`
					▶️#define SQUARE(x) ((x) * (x))
					◀️▶️#define MAX(a, b) (\\
						(a) > (b) ? (a) : (b) \\
					)◀️
				`],
			];
			for (const [name, code] of statementCases) {
				test(name, async function () {
					await testStatementBuilding('c', code);
				});
			}
		});

		suite('Statement identification (C++)', function () {
			const statementCases: [name: string, code: string][] = [
				['recognizes namespace statements', dedent`
					▶️namespace MyNamespace
					{
						▶️int x;◀️
					}◀️
				`],
				['recognizes class definitions', dedent`
					▶️class MyClass
					▶️{
						▶️int x;◀️
						▶️void m() ▶️{
							▶️x = 1;◀️
						}◀️◀️
					}◀️◀️
				`],
				['recognizes template declarations', dedent`
					▶️template <typename T> ▶️T myMax(T x, T y) ▶️{
						▶️return (x > y) ? x : y;◀️
					}◀️◀️◀️
				`],
				['recognizes concept definitions', dedent`
					▶️template<typename T>
					▶️concept MyConcept = requires(T t)
					{
						▶️{ t.foo() } -> std::same_as<int>;◀️
					}◀️◀️
				`],
				['recognizes using statements', dedent`
					▶️using MyType = int;◀️
				`],
				['recognizes alias declarations', dedent`
					▶️using MyAlias = int;◀️
				`],
				['recognizes static assertions', dedent`
					▶️static_assert(sizeof(int) == 4, "int is not 4 bytes");◀️
				`],
			];
			for (const [name, code] of statementCases) {
				test(name, async function () {
					await testStatementBuilding('cpp', code);
				});
			}
		});

		suite('Compound Statement Identification (C, C++)', function () {
			const compoundCases: [name: string, code: string][] = [
				['node.isCompoundStatementType is true for struct declarations', dedent`
					❚struct Obj
					{
						int x;
						float y;
					} obj;
				`],
				['node.isCompoundStatementType is true for union declarations', dedent`
					❚union Obj
					{
						int x;
						float y;
					} obj;
				`],
				['node.isCompoundStatementType is true for enum declarations', dedent`
					❚enum Color
					{
						RED,
						GREEN,
						BLUE
					} obj;
				`],
				['node.isCompoundStatementType is true for empty blocks', dedent`
					❚{
					}
				`],
				['node.isCompoundStatementType is true for function declarations', dedent`
					void example()
					{
						❚int add(int a, int b)
						{
							return a + b;
						}
					}
				`],
				['node.isCompoundStatementType is true for compound statements', dedent`
					❚{
						int x = 10;
						int y = 20;
					}
				`],
				['node.isCompoundStatementType is true for if statements', dedent`
					void example()
					{
						❚if (x > 0)
						{
							printf("Positive");
						}
					}
				`],
				['node.isCompoundStatementType is true for type definitions', dedent`
					❚typedef struct Obj
					{
						int x;
						float y;
					} obj;
				`],
				['node.isCompoundStatementType is true for for statements', dedent`
					void example()
					{
						❚for (int i = 0; i < 10; i++)
						{
							printf("%d", i);
						}
					}
				`],
				['node.isCompoundStatementType is true for while statements', dedent`
					void example()
					{
						❚while (x < 10)
						{
							printf("%d", x);
							x++;
						}
					}
				`],
				['node.isCompoundStatementType is true for do while statements', dedent`
					void example()
					{
						❚do
						{
							printf("%d", x);
						} while (x < 10);
					}
				`],
				['node.isCompoundStatementType is true for switch statements', dedent`
					void example()
					{
						❚switch (x)
						{
							default:
								printf("Default");
								break;
						}
					}
				`],
				['node.isCompoundStatementType is true for preprocessor if statements', dedent`
					❚#if DEBUG
						#define STACK 0
					#elif RELEASE
						#define STACK 100
					#else
						printf("Unknown mode");
					#endif
				`],
				['node.isCompoundStatementType is true for preprocessor ifdef statements', dedent`
					❚#ifdef DEBUG
						printf("Debug mode");
					#endif
				`],
			];
			for (const [name, code] of compoundCases) {
				test(name, async function () {
					await assertStatementIsCompoundType(code);
				});
			}

			const nonCompoundCases: [name: string, code: string][] = [
				['node.isCompoundStatementType is false for declaration statements', dedent`
					int foo() {
						❚int x = 10;
					}
				`],
				['node.isCompoundStatementType is false for return statements', dedent`
					int foo() {
						❚return 1;
					}
				`],
				['node.isCompoundStatementType is false for goto statements', dedent`
					❚goto label;
				`],
				['node.isCompoundStatementType is false for label statements', dedent`
					❚label:
						printf("Label reached");
				`],
				['node.isCompoundStatementType is false for preprocessor include statements', dedent`
					❚#include <stdio.h>
				`],
				['node.isCompoundStatementType is false for preprocessor functions', dedent`
					❚#define SQUARE(x) ((x) * (x))
				`],
			];
			for (const [name, code] of nonCompoundCases) {
				test(name, async function () {
					await assertStatementIsNotCompoundType(code);
				});
			}

			async function assertStatementIsCompoundType(text: string) {
				await testStatementIsCompoundType('c', text, true);
			}

			async function assertStatementIsNotCompoundType(text: string) {
				await testStatementIsCompoundType('c', text, false);
			}
		});

		suite('Compound Statement Identification (C++)', function () {
			const compoundCases: [name: string, code: string][] = [
				['node.isCompoundStatementType is true for namespace definitions', dedent`
					❚namespace MyNamespace
					{
						int x;
					}
				`],
				['node.isCompoundStatementType is true for template declaratations', dedent`
					❚template<typename T>
					class MyClass
					{
						T value;
					}
				`],
				['node.isCompoundStatementType is true for concept definitions', dedent`
					❚concept MyConcept = requires(T t)
					{
						{ t.foo() } -> std::same_as<int>;
					};
				`],
				['node.isCompoundStatementType is true for class declarations', dedent`
					❚class MyClass
					{
						int x;
						float y;
					};
				`],
				['node.isCompoundStatementType is true for class declarations with template', dedent`
					❚template<typename T>
					class MyClass
					{
						T value;
					};
				`],
				['node.isCompoundStatementType is true for field declaration lists', dedent`
					class MyClass
					❚{
						int x;
						float y;
						double z;
					};
				`],
			];
			for (const [name, code] of compoundCases) {
				test(name, async function () {
					await assertStatementIsCompoundType(code);
				});
			}

			const nonCompoundCases: [name: string, code: string][] = [
				['node.isCompoundStatementType is false for field declarations', dedent`
					class MyClass
					{
						❚int x;
						float y;
					};
				`],
				['node.isCompoundStatementType is false for single-line concept definitions', dedent`
					template<class T, class U>
					❚concept Derived = std::is_base_of<U, T>::value;
				`],
				['node.isCompoundStatementType is false for using statements', dedent`
					❚using MyType = int;
				`],
				['node.isCompoundStatementType is false for alias declarations', dedent`
					❚using MyAlias = int;
				`],
				['node.isCompoundStatementType is false for static assertions', dedent`
					❚static_assert(sizeof(int) == 4, "int is not 4 bytes");
				`],
			];
			for (const [name, code] of nonCompoundCases) {
				test(name, async function () {
					await assertStatementIsNotCompoundType(code);
				});
			}

			async function assertStatementIsCompoundType(text: string) {
				await testStatementIsCompoundType('cpp', text, true);
			}

			async function assertStatementIsNotCompoundType(text: string) {
				await testStatementIsCompoundType('cpp', text, false);
			}
		});
	});

	/**
	 * Use `▶️` and `◀️` to mark the beginning and end of statements in the test text.
	 *
	 * If `❚` (`'\u275A'`) is present in the text, it represents the cursor, and the region
	 * between the cursor and end of the text is passed as the offsets for tree building
	 * (otherwise, the full text region is used).
	 */
	async function testStatementBuilding(language: string, text: string) {
		const delim = /▶️|◀️|❚/;
		const statements: StatementNodeSpec[] = [];
		let doc = '';
		let remainder = text;
		let s: StatementNodeSpec | undefined;
		let match = remainder.match(delim);
		let startOffset = 0;

		while (match) {
			doc += remainder.slice(0, match.index);
			if (match[0] === '▶️') {
				const newS: StatementNodeSpec = {
					startOffset: doc.length,
					parent: s,
					children: [],
				};
				if (s) {
					s.children.push(newS);
				} else {
					statements.push(newS);
				}
				s = newS;
			} else if (match[0] === '❚') {
				startOffset = doc.length;
			} else {
				if (s) {
					s.endOffset = doc.length;
					s = s.parent;
				} else {
					throw new Error(
						`Unmatched statement end at offset ${doc.length} (at ${JSON.stringify(remainder.slice(match.index! + match[0].length))})`
					);
				}
			}
			remainder = remainder.slice(match.index! + match[0].length);
			match = remainder.match(delim);
		}
		doc += remainder;

		if (s) {
			throw new Error(
				`Unmatched statement start beginning at offset ${s.startOffset} (at ${JSON.stringify(doc.substring(s.startOffset))})`
			);
		}

		using tree = StatementTree.create(language, doc, startOffset, doc.length);

		await tree.build();

		function expectNodeLike(node: StatementNode, spec: StatementNodeSpec, prefix = '') {
			const pad = ' '.repeat(prefix.length);
			const path = node.dumpPath(prefix, pad);
			assert.strictEqual(
				node.node.startIndex,
				spec.startOffset,
				`At:\n\n${path}\n\nExpected statement to begin at offset ${spec.startOffset}, but begins at ${node.node.startIndex}`
			);
			assert.strictEqual(
				node.node.endIndex,
				spec.endOffset,
				`At:\n\n${path}\n\nExpected statement to end at offset ${spec.endOffset}, but ends at ${node.node.endIndex}`
			);
			assert.strictEqual(
				node.children.length,
				spec.children.length,
				`At:\n\n${path}\n\nExpected node to have ${spec.children.length} children, but got ${node.children.length}`
			);
			for (let i = 0; i < spec.children.length; i++) {
				expectNodeLike(node.children[i], spec.children[i], prefix);
			}
		}

		assert.strictEqual(
			tree.statements.length,
			statements.length,
			`Expected a tree with ${statements.length} statements, but got ${tree.statements.length}:\n${tree.dump()}`
		);
		for (let i = 0; i < statements.length; i++) {
			expectNodeLike(tree.statements[i], statements[i], ` [${i}] `);
		}
	}

	async function testStatementIsCompoundType(languageId: string, text: string, expectedResult: boolean) {
		const posIndicator = '❚';
		const offset = text.indexOf(posIndicator);
		const doc = text.replace(posIndicator, '');
		using tree = StatementTree.create(languageId, doc, 0, doc.length);

		await tree.build();
		const statement = tree.statementAt(offset + 1);

		assert.ok(statement, `Statement not found at offset ${offset}`);
		assert.strictEqual(
			statement.isCompoundStatementType,
			expectedResult,
			`Expected .isCompoundStatementType to be ${expectedResult ? 'true' : 'false'} for ${statement.node.type} but got ${statement.isCompoundStatementType ? 'true' : 'false'}`
		);
	}
});
