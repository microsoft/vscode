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

		test('recognizes simple expression statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️x = 1;◀️
				▶️y = 2;◀️
				`
			);
		});

		test('ignores comments', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️x = 1;◀️
				// comment
				▶️y = 2;◀️
				`
			);
		});

		test('recognizes export statements', async function () {
			await testStatementBuilding('typescript', `▶️export ▶️const x = 1;◀️◀️`);
		});

		test('recognizes import statements', async function () {
			await testStatementBuilding('typescript', `▶️import assert from 'assert';◀️`);
		});

		test('recognizes debugger statements', async function () {
			await testStatementBuilding('typescript', `▶️debugger;◀️`);
		});

		test('recognizes var declarations', async function () {
			await testStatementBuilding('typescript', `▶️var x = 1;◀️`);
		});

		test('recognizes lexical declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️const x = 1;◀️
				▶️let y = 2;◀️
				`
			);
		});

		test('recognizes single-expression if statements as', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️if (x)
					▶️y = 1;◀️◀️
				`
			);
		});

		test('recognizes single-expression if statements on a single line as single statements', async function () {
			await testStatementBuilding('typescript', `▶️if (x) y = 1;◀️`);
		});

		test('recognizes single-expression if / else statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️if (x)
					▶️y = 1;◀️
				else
					▶️y = 2;◀️◀️
				`
			);
		});

		test('recognizes single-expression if / else statements on a single line as single statements', async function () {
			await testStatementBuilding('typescript', `▶️if (x) y = 1; else y = 2;◀️`);
			// Since TS and JS are different grammars and the else property changed to alternative ensure we are good in JS as well.
			await testStatementBuilding('javascript', `▶️if (x) y = 1; else y = 2;◀️`);
		});

		test('recognizes if statements with blocks', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️if (x) ▶️{
					▶️y = 1;◀️
				}◀️◀️
				`
			);
		});

		test('recognizes if / else statements with blocks', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️if (x) ▶️{
					▶️y = 1;◀️
				}◀️ else ▶️{
					▶️y = 2;◀️
				}◀️◀️
				`
			);
		});

		test('recognizes switch statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️switch (x) {
					case 1:
						▶️y = true;◀️
					default:
						▶️y = false;◀️
				}◀️
				`
			);
		});

		test('recognizes for statements', async function () {
			// The termination expression is not it's own statement anymore.
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️for (let i = 0; i < 10; i++) ▶️{
					▶️str += ' ';◀️
				}◀️◀️
				`
			);
		});

		test('recognizes for...in statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️for (const prop in object) ▶️{
					▶️console.log(prop, object[prop]);◀️
				}◀️◀️
				`
			);
		});

		test('recognizes for...of statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️for (const item of [1, 2, 3]) ▶️{
					▶️console.log(item);◀️
				}◀️◀️
				`
			);
		});

		test('recognizes while statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️while (true) ▶️{
					▶️break;◀️
				}◀️◀️
				`
			);
		});

		test('recognizes do statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️do ▶️{
					▶️break;◀️
				}◀️ while (true);◀️
				`
			);
		});

		test('recognizes try / catch / finally statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️try ▶️{
					▶️throw new Error('oops!');◀️
				}◀️ catch (e) ▶️{
					▶️console.error(e.message);◀️
				}◀️ finally ▶️{
					▶️console.log('done!');◀️
				}◀️◀️
				`
			);
		});

		test('recognizes with statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️with ({x: 1}) ▶️{
					▶️console.log(x);◀️ // 1
				}◀️◀️
				`
			);
		});

		test('recognizes continue statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️while (false) ▶️{
					▶️continue;◀️
				}◀️◀️
				`
			);
		});

		test('recognizes return statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️function foo() ▶️{
					▶️return;◀️
				}◀️◀️
				`
			);
		});

		test('recognizes labeled statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️outer: ▶️for await (chunk of stream) ▶️{
					▶️for (const char of chunk) ▶️{
						▶️if (char === '\n')
							▶️break outer;◀️◀️
					}◀️◀️
				}◀️◀️◀️
				`
			);
		});

		test('recognizes statements with ternary expressions as single statements', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️let i = featureFlag ? 0 : 1;◀️
				`
			);
		});

		test('recognizes function declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️function noop() ▶️{
					// empty
				}◀️◀️
				`
			);
		});

		test('recognizes generator function declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️function* values() ▶️{
					▶️yield 1;◀️
					▶️yield 2;◀️
				}◀️◀️
				`
			);
		});

		test('recognizes class declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️class Empty {
					// empty
				}◀️
				`
			);
		});

		test('recognizes class field declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️class ConstantIdentifier {
					▶️readonly id = 1◀️;
				}◀️
				`
			);
		});

		test('recognizes class method declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️class Example {
					▶️constructor() ▶️{
						▶️this.value = Math.random();◀️
					}◀️◀️

					▶️getValue() ▶️{
						▶️return this.value;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes class getter and setter declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️class Example {
					▶️set value(newValue) ▶️{
						▶️this.value = newValue;◀️
					}◀️◀️

					▶️get value() ▶️{
						▶️return this.value;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes type alias declarations', async function () {
			await testStatementBuilding('typescript', `▶️type OptionalIdentifier = number | undefined;◀️`);
		});

		test('recognizes interface declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️interface Vector {
					x: number;
					y: number;
				}◀️
				`
			);
		});

		test('recognizes enum declarations', async function () {
			await testStatementBuilding(
				'typescript',
				dedent`
				▶️enum Direction {
					North,
					South,
					East,
					West
				}◀️
				`
			);
		});

		test('node.isCompoundStatementType is true for splittable statements that may contain other statements', async function () {
			const doc = 'if (x) { y = 1; }';
			using tree = StatementTree.create('typescript', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			const doc = 'const y = 1;';
			using tree = StatementTree.create('typescript', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, false);
		});
	});

	// MARK: Python

	suite('Python', function () {
		test('python is supported', function () {
			assert.strictEqual(StatementTree.isSupported('python'), true);
		});

		test('recognizes simple expression statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️x = 1◀️
				▶️y = 2◀️
				`
			);
		});

		test('ignores comments', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️x = 1◀️
				# comment
				▶️y = 2◀️
				`
			);
		});

		test('recognizes import statements', async function () {
			await testStatementBuilding('python', `▶️import assert◀️`);
		});

		test('recognizes from import statements', async function () {
			await testStatementBuilding('python', `▶️from assert import strict◀️`);
		});

		test('recognizes from future import statements', async function () {
			await testStatementBuilding('python', `▶️from __future__ import annotations◀️`);
		});

		test('recognizes print statements', async function () {
			await testStatementBuilding('python', `▶️print a◀️`);
		});

		test('recognizes assert statements', async function () {
			await testStatementBuilding('python', `▶️assert x◀️`);
		});

		test('recognizes return statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️def example():
					▶️▶️return 1◀️◀️◀️
				`
			);
		});

		test('recognizes delete statements', async function () {
			await testStatementBuilding('python', `▶️del x◀️`);
		});

		test('recognizes raise statements', async function () {
			await testStatementBuilding('python', `▶️raise ValueError◀️`);
		});

		test('recognizes pass statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️def example():
					▶️▶️pass◀️◀️◀️`
			);
		});

		test('recognizes break statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️while True:
					▶️▶️break◀️◀️◀️
				`
			);
		});

		test('recognizes continue statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️while True:
					▶️▶️continue◀️◀️◀️
				`
			);
		});

		test('recognizes global statements', async function () {
			await testStatementBuilding('python', `▶️global x◀️`);
		});

		test('recognizes nonlocal statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️def example():
					▶️▶️nonlocal x◀️◀️◀️`
			);
		});

		test('recognizes exec statements', async function () {
			await testStatementBuilding('python', `▶️exec 'x+=1' in None◀️`);
		});

		test('recognizes statements with list comprehensions as single statements', async function () {
			await testStatementBuilding('python', `▶️some_powers_of_two = [2**n for in range(1,6) if n != 5]◀️`);
		});

		test('recognizes statements with lamba expressions as single statements', async function () {
			await testStatementBuilding('python', `▶️fn = lambda x: x+1◀️`);
		});

		test('recognizes if statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️if x:
					▶️▶️y = 1◀️◀️◀️
				`
			);
		});

		test('recognizes if statements on a single line as single statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️if x: y = 1◀️
				`
			);
		});

		test('recognizes if / else statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️if x:
					▶️▶️y = 1◀️◀️
				else:
					▶️▶️y = 2◀️◀️◀️
				`
			);
		});

		test('recognizes compact if / else statements as compound statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️if x: ▶️▶️y = 1◀️◀️
				else: ▶️▶️y = 2◀️◀️◀️
				`
			);
		});

		test('recognizes if / elif / else statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️if x:
					▶️▶️y = 1◀️◀️
				elif y:
					▶️▶️y = 2◀️◀️
				else:
					▶️▶️y = 3◀️◀️◀️
				`
			);
		});

		test('recognizes statements with conditional expressions as single statements', async function () {
			await testStatementBuilding('python', `▶️result = x if y else z◀️`);
		});

		test('recognizes for statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️for i in range(10):
					▶️▶️y = 1◀️◀️◀️
				`
			);
		});

		test('recognizes for / else statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️for line in lines:
					▶️▶️print line◀️◀️
				else:
					▶️▶️print x◀️◀️◀️
				`
			);
		});

		test('recognizes while statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️while x:
					▶️▶️print y◀️◀️◀️
				`
			);
		});

		test('recognizes while / else statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️while x:
					▶️▶️print y◀️◀️
				else:
					▶️▶️print z◀️◀️◀️
				`
			);
		});

		test('recognizes try / except / finally statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️try:
					▶️▶️x = 1◀️◀️
				except:
					▶️▶️x = 2◀️◀️
				finally:
					▶️▶️x = 3◀️◀️◀️
				`
			);
		});

		test('recognizes with statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️with open('file.txt') as f:
					▶️▶️x = f.read()◀️◀️◀️
				`
			);
		});

		test('recognizes function definitions', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️def add(x, y):
					▶️▶️return x + y◀️◀️◀️
				`
			);
		});

		test('recognizes docstrings as expressions', async function () {
			// this is slightly odd that the grammar gives these an expression type,
			// but it is ok for the purposes of completion trimming and block
			// position determination
			await testStatementBuilding(
				'python',
				dedent`
				▶️def example():
					▶️▶️"""
					This is a docstring.
					"""◀️
					▶️pass◀️◀️◀️
				`
			);
		});

		test('recognizes class definitions', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️class Example:
						▶️▶️pass◀️◀️◀️
				`
			);
		});

		test('recognizes class method definitions', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️class Example:
					▶️▶️def method(self):
						▶️▶️pass◀️◀️◀️◀️◀️
				`
			);
		});

		test('recognizes decorated definitions', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️@decorator1
				@decorator2
				▶️def example():
					▶️▶️pass◀️◀️◀️◀️
				`
			);
		});

		test('recognizes match statements', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️match x:▶️
					case 1:
						▶️▶️y = 1◀️◀️
					case 2:
						▶️▶️y = 2◀️◀️
					case _:
						▶️▶️y = 3◀️◀️◀️◀️
				`
			);
		});

		test('permits type annotations on variable assignments', async function () {
			await testStatementBuilding('python', `▶️x: list[int] = []◀️`);
		});

		test('permits type annotations on functions', async function () {
			await testStatementBuilding(
				'python',
				dedent`
				▶️def example(x: int) -> int:
					▶️▶️return x + 1◀️◀️◀️
				`
			);
		});

		test('permits type aliases but omits the type keyword from the statement', async function () {
			// this is to document the behavior of the current grammar
			// type alias is not supported in 0.23 Python grammar. Results in no statement.
			await testStatementBuilding('python', `type Vector = list[float]`);
		});

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			const doc = 'y = 1';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, false);
		});

		test('node.isCompoundStatementType is true for if statements', async function () {
			const doc = 'if x:\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for for statements', async function () {
			const doc = 'for i in range(10):\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for while statements', async function () {
			const doc = 'while x:\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for try statements', async function () {
			const doc = 'try:\n\tpass\nexcept:\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for with statements', async function () {
			const doc = 'with open("file.txt") as f:\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for function definition statements', async function () {
			const doc = 'def example():\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for class definition statements', async function () {
			const doc = 'class Example:\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for decorated definition statements', async function () {
			const doc = '@decorator\ndef example():\n\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is true for match statements', async function () {
			const doc = 'match x:\n\tcase 1:\n\t\tpass';
			using tree = StatementTree.create('python', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(1);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});
	});

	// MARK: Go

	suite('Go', function () {
		test('go is supported', function () {
			assert.strictEqual(StatementTree.isSupported('go'), true);
		});

		test('recognizes package clauses', async function () {
			await testStatementBuilding('go', `▶️package main◀️`);
		});

		test('recognizes function declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func example() ▶️{}◀️◀️
				`
			);
		});

		test('recognizes method declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func (self Document) GetLine(n int) ▶️{}◀️◀️
				`
			);
		});

		test('recognizes import declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️import "fmt"◀️
				`
			);
		});

		test('recognizes grouped import declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️import (
					"fmt"
					"os
				)◀️
				`
			);
		});

		test('ignores comments', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					// comment
				}◀️◀️
				`
			);
		});

		test('ignores block comments', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				/*
				 * Comment
				 */
				▶️func main() ▶️{}◀️◀️
				`
			);
		});

		test('recognizes single constant declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️const zero = 0◀️
				`
			);
		});

		test('recognizes grouped constant declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️const (
					zero = 0
					one = 1
				)◀️
				`
			);
		});

		test('recognizes var declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️var counter = 0◀️
				`
			);
		});

		test('recognizes type declarations', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️type a b◀️
				`
			);
		});

		test('recognizes simple expression statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️x := 1◀️
				}◀️◀️
				`
			);
		});

		test('recognizes return statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️return◀️
				}◀️◀️
				`
			);
		});

		test('recognizes go statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️go f()◀️
				}◀️◀️
				`
			);
		});

		test('recognizes defer statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️defer f()◀️
				}◀️◀️
				`
			);
		});

		test('recognizes if statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️if a ▶️{
						▶️b◀️
					}◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes if statements with an initializer', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️if b := a(); b < 0 ▶️{
						▶️b *= -1◀️
					}◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes if / else statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️if a ▶️{
						▶️b()◀️
					}◀️ else ▶️{
						▶️c()◀️
					}◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes simple for statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️for ▶️{
						▶️a()◀️
					}◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes for statements with conditions', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️
				▶️import "fmt"◀️

				▶️func main() ▶️{
					▶️for i:= 0; i < 10; i++ ▶️{
						▶️fmt.Println(i)◀️
					}◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes expression switch statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
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
				`
			);
		});

		test('recognizes type switch statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
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
				`
			);
		});

		test('recognizes select statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func demux(a chan string, b chan string) ▶️{
					▶️select {
						case msg := <-a:
							▶️dispatch(msg)◀️
						case msg := <-b:
							▶️dispatch(msg)◀️
					}◀️
				}◀️◀️
				`
			);
		});

		test('recognizes labeled statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
				▶️start:
					▶️a()◀️◀️
					▶️b()◀️
				}◀️◀️
				`
			);
		});

		test('recognizes fallthrough statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️switch i {
						case 0:
							▶️fallthrough◀️
						default:
							▶️f(i)◀️
					}◀️
				}◀️◀️
				`
			);
		});

		test('recognizes break statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️switch i {
						case 0:
							▶️break◀️
						default:
							▶️f(i)◀️
					}◀️
				}◀️◀️
				`
			);
		});

		test('recognizes continue statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️for i := 0; i < 10; i++ ▶️{
						▶️if i == 0 ▶️{
							▶️continue◀️
						}◀️◀️
						▶️f(i)◀️
					}◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes goto statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️goto end◀️
				▶️end:
					▶️return◀️◀️
				}◀️◀️
				`
			);
		});

		test('recognizes nested blocks', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func main() ▶️{
					▶️{
						▶️a()◀️
					}◀️
				}◀️◀️
				`
			);
		});

		test('recognizes empty statements', async function () {
			await testStatementBuilding(
				'go',
				dedent`
				▶️package main◀️

				▶️func noop() ▶️{
					▶️;◀️
				}◀️◀️
				`
			);
		});

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			await assertStatementIsNotCompoundType(dedent`
				package main

				func main() {
					❚x := 1
				}
			`);
		});

		test('node.isCompoundStatementType is true for function declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				❚func main() {}
			`);
		});

		test('node.isCompoundStatementType is true for method declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				❚func (self Document) GetLine (n int) {}
			`);
		});

		test('node.isCompoundStatementType is true for if statements', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				func main() {
					❚if a {
						b
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for for statements', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				func main() {
					❚for i := 0; i < 10; i++ {
						a()
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for expression switch statements', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				func main() {
					❚switch a {
						case 1:
							b
						default:
							c
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for type switch statements', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				func f(i interface{}) {
					❚switch v := i.(type) {
						case int:
							b
						default:
							c
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for select statements', async function () {
			await assertStatementIsCompoundType(dedent`
				package main

				func demux(a chan string, b chan string) {
					❚select {
						case msg := <-a:
							dispatch(msg)
						case msg := <-b:
							dispatch(msg)
					}
				}
			`);
		});

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

		test('recognizes simple expressions', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️echo "hello";◀️
				▶️$b = $a = 5;◀️
				?>
				`
			);
		});

		test('recognizes named if statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️if (1 == 2) ▶️{
					▶️echo "hello";◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes if statements with else', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️if (1 == 2) ▶️{
					▶️echo "hello";◀️
				}◀️ else ▶️{
					▶️echo "world";◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes if statements with else if', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️if (1 == 2) ▶️{
					▶️echo "hello";◀️
				}◀️ elseif (1 == 3) ▶️{
					▶️echo "world";◀️
				}◀️ else ▶️{
					▶️echo "foo";◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes switch statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
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
				`
			);
		});

		test('recognizes while statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️while (true) ▶️{
					▶️break;◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes do statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️do ▶️{
					▶️break;◀️
				}◀️ while (true);◀️
				?>
				`
			);
		});

		test('recognizes for statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️for ($i = 0; $i < 10; $i++) ▶️{
					▶️$str += ' ';◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes foreach statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️foreach ($arr as $key => $value) ▶️{
					▶️echo $key;◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes try statements', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️try ▶️{
					▶️throw new Exception();◀️
				}◀️ catch (Exception $e) ▶️{
					▶️echo $e;◀️
				}◀️ finally ▶️{
					▶️echo "done";◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes function declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️function example($arg_1) ▶️{
					▶️echo "hello";◀️
					▶️return $retval;◀️
				}◀️◀️
				?>
				`
			);
		});

		test('recognizes class declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️class Example {
				}◀️
				?>
				`
			);
		});

		test('recognizes class method declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️class Example {
					▶️public function example($arg_1) ▶️{
						▶️echo "hello";◀️
						▶️return $retval;◀️
					}◀️◀️
				}◀️
				?>
				`
			);
		});

		test('recognizes class field declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️class Example {
					▶️public $field_1;◀️
					▶️private $field_2;◀️
				}◀️
				?>
				`
			);
		});

		test('recognizes class constant declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️class Example {
					▶️const EXAMPLE = 1;◀️
				}◀️
				?>
				`
			);
		});

		test('recognizes class interface and trait uses', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️class Example extends BaseClass implements Interface1, Interface2 {
					▶️use Trait1, Trait2;◀️
				}◀️
				?>
				`
			);
		});

		test('recognizes interface declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️interface Example {
					▶️public function example($arg_1);◀️
				}◀️
				?>
				`
			);
		});

		test('recognizes trait declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️trait Example {
					▶️public function example($arg_1) ▶️{
						▶️echo "hello";◀️
					}◀️◀️
				}◀️
				?>
				`
			);
		});

		test('recognizes namespace declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️namespace Example;◀️
				?>
				`
			);
		});

		test('recognizes namespace use declarations', async function () {
			await testStatementBuilding(
				'php',
				dedent`
				<?php
				▶️use Example\\ExampleClass;◀️
				?>
				`
			);
		});

		test('node.isCompoundStatementType is true for splittable statements that may contain other statements', async function () {
			const doc = dedent`<?php
			if (true)
			{
				$foo = 1;
			}
			?>`;
			using tree = StatementTree.create('php', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(6);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, true);
		});

		test('node.isCompoundStatementType is false for un-splittable statements', async function () {
			const doc = dedent`<?php
			$foo = 1;
			?>`;
			using tree = StatementTree.create('php', doc, 0, doc.length);

			await tree.build();
			const statement = tree.statementAt(6);

			assert.ok(statement);
			assert.strictEqual(statement.isCompoundStatementType, false);
		});
	});

	// MARK: Ruby
	suite('Ruby', function () {
		test('ruby is supported', function () {
			assert.strictEqual(StatementTree.isSupported('ruby'), true);
		});

		test('recognizes simple expression statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️x = 1◀️
				▶️y = 2◀️
				`
			);
		});

		test('ignores comments', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️x = 1◀️
				# comment
				▶️y = 2◀️
				`
			);
		});

		test('recognizes if statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️if ▶️x◀️
					▶️y = 1◀️
				end◀️
				`
			);
		});

		test('recognizes if / else statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️if ▶️x◀️
					▶️y = 1◀️
				else
					▶️y = 2◀️
				end◀️
				`
			);
		});

		test('recognizes if / elsif / else statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️if ▶️x◀️
					▶️y = 1◀️
				elsif ▶️y◀️
					▶️y = 2◀️
				else
					▶️y = 3◀️
				end◀️
				`
			);
		});

		test('recognizes unless statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️unless ▶️x◀️
					▶️y = 1◀️
				end◀️
				`
			);
		});

		test('recognizes unless / else statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️unless ▶️x◀️
					▶️y = 1◀️
				else
					▶️y = 2◀️
				end◀️
				`
			);
		});

		test('recognizes unless / elsif / else statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️unless ▶️x◀️
					▶️y = 1◀️
				elsif ▶️y◀️
					▶️y = 2◀️
				else
					▶️y = 3◀️
				end◀️
				`
			);
		});

		test('recognizes if modifier statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️▶️x = 1◀️ if y◀️
				`
			);
		});

		test('recognizes unless modifier statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️▶️x = 1◀️ unless y◀️
				`
			);
		});

		test('recognizes range statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️x = 1..10◀️
				`
			);
		});

		test('recognizes case statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️case ▶️x◀️
					▶️when 1
						▶️y = 1◀️◀️
					▶️when 2
						▶️y = 2◀️◀️
					else
						▶️y = 3◀️
				end◀️
				`
			);
		});

		test('recognizes for statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️for i in 1..10 do
					▶️y = 1◀️
				end◀️
				`
			);
		});

		test('recognizes while statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️while ▶️x◀️
					▶️y = 1◀️
				end◀️
				`
			);
		});

		test('recognizes until statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️until ▶️x◀️
					▶️y = 1◀️
				end◀️
				`
			);
		});

		test('recognizes loop modifier statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️▶️sleep◀️ while idle◀️
				▶️▶️sleep◀️ until idle◀️
				`
			);
		});

		test('recognizes begin / rescue / else / ensure statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️begin
					▶️x = 1◀️
				rescue
					▶️x = 2◀️
				else
					▶️x = 3◀️
				ensure
					▶️x = 4◀️
				end◀️
				`
			);
		});

		test('recognizes begin statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️BEGIN {
					▶️x = 1◀️
				}◀️
				`
			);
		});

		test('recognizes end statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️END {
					▶️x = 1◀️
				}◀️
				`
			);
		});

		test('recognizes class definitions', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️class Example < Base
					▶️x = 1◀️
				end◀️
				`
			);
		});

		test('recognizes class definitions with methods', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️class Example < Base
					▶️def method
						▶️x = 1◀️
					end◀️
				end◀️
				`
			);
		});

		test('recognizes module definitions', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️module Example
					▶️x = 1◀️
				end◀️
				`
			);
		});

		test('recognizes module definitions with methods', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️module Example
					▶️def method
						▶️x = 1◀️
					end◀️
				end◀️
				`
			);
		});

		test('recognizes def statements', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️def example
					▶️x = 1◀️
				end◀️
				`
			);
		});

		test('recognizes method invocation with a block argument,', async function () {
			await testStatementBuilding(
				'ruby',
				dedent`
				▶️someArray.select do |item|
					▶️item %2 == 0◀️
				end◀️
				`
			);
		});

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

		test('recognizes blocks', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class BlockSample {
					▶️public static void main(String[] args) ▶️{
						▶️{}◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes assert statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class AssertSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 10;◀️
						▶️assert x > 0 : "x should be positive";◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes break statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class BreakSample {
					▶️public static void main(String[] args) ▶️{
						▶️for (int i = 0; i < 10; i++) ▶️{
							▶️if (i == 5) ▶️{
								▶️break;◀️
							}◀️◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes continue statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class ContinueSample {
					▶️public static void main(String[] args) ▶️{
						▶️for (int i = 0; i < 10; i++) ▶️{
							▶️if (i == 5) ▶️{
								▶️continue;◀️
							}◀️◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes do statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
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
				`
			);
		});

		test('recognizes for-each (enhanced_for) statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
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
				`
			);
		});

		test('recognizes simple expression statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class SimpleExpressionSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 1;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes for statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class ForSample {
					▶️public static void main(String[] args) ▶️{
						▶️for (int i = 0; i < 10; i++) ▶️{
							▶️int x = i;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes if statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class IfSample {
					▶️public static void main(String[] args) ▶️{
						▶️int number = 1;◀️
						▶️if (number > 0) ▶️{
							▶️number++;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes labeled statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class LabelSample {
					▶️public static void main(String[] args) ▶️{
						▶️myLabel: ▶️{
							▶️int x = 1;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes local variable declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class LocalVariableSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 1;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes return statement', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class ReturnSample {
					▶️public static void main(String[] args) ▶️{
						▶️int number = ReturnSample.add(5, 10);◀️
					}◀️◀️
					▶️public static int add(int a, int b) ▶️{
						▶️return a + b;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes switch statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
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
				`
			);
		});

		test('recognizes synchronized statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class SynchronizedSample {
					▶️public static void main(String[] args) ▶️{
						▶️int counter = 0;◀️
						▶️synchronized (ReturnSample.class) ▶️{
							▶️counter++;◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes throw statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class ThrowSample {
					▶️public static void main(String[] args) ▶️{
						▶️throw new RuntimeException("This is a runtime exception");◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes try statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class TrySample {
					▶️public static void main(String[] args) ▶️{
						▶️try ▶️{
							▶️int result = 10 / 0;◀️
						}◀️ catch (ArithmeticException e) ▶️{
							▶️System.out.println("Cannot divide by zero");◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes try with resources statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class TrySample {
					▶️public static void main(String[] args) ▶️{
						▶️try (BufferedReader br = new BufferedReader()) ▶️{
							▶️int result = 10 / 0;◀️
						}◀️ catch (ArithmeticException e) ▶️{
							▶️System.out.println("Cannot divide by zero");◀️
						}◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes enum declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class EnumSample {
					▶️public static void main(String[] args) ▶️{
						▶️public enum Day {
							MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
						}◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes import declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️import java.util.List;◀️
				▶️public class ImportSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes interface declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public interface Animal {
					▶️void makeSound();◀️
				}◀️
				▶️public class InterfaceSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes method declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class MethodSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public static void add(int a, int b) ▶️{
						▶️int sum = a + b;◀️
						▶️System.out.println("Sum: " + sum);◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes field declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class InterfaceSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public static int x = 0;◀️
				}◀️
				`
			);
		});

		test('recognizes compact constructor declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public record Person(String firstName, String lastName) {
					▶️public Person ▶️{
						▶️firstName = firstName;◀️
						▶️lastName = lastName;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes class declaration inside a class body', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class OuterSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public class InnerSample {
						▶️public static void innerMethod() ▶️{
							▶️int x = 0;◀️
						}◀️◀️
					}◀️
				}◀️
				`
			);
		});

		test('recognizes interface declaration inside a class body', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class OuterSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public interface InnerInterface {
						▶️void innerMethod();◀️
					}◀️
				}◀️
				`
			);
		});

		test('recognizes annotation type declaration inside a class body', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class AnnotateSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public @interface MyAnnotation {
					}◀️
				}◀️
				`
			);
		});

		test('recognizes enum declarations inside a class body', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class EnumClassSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
					▶️public enum Day {
						MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
					}◀️
				}◀️
				`
			);
		});

		test('recognizes static initializer inside a class body', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class StaticInitClassSample {
					▶️static int count;◀️
					▶️static ▶️{
						▶️count = 100;◀️
					}◀️◀️
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes constructor declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class ConstructorSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				▶️public class MyClass {
					▶️public MyClass() {
						▶️int x = 0;◀️
					}◀️
				}◀️
				`
			);
		});

		test('recognizes record declarations', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public record Point(int x, int y) {}◀️
				▶️public class RecordSample {
					▶️public static void main(String[] args) ▶️{
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes ternary statements as one line', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class RecordSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 5;◀️
						▶️int y = (x == 5) ? 0 : 1;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes single line if statements as one statement', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class SingleLineIfSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 5;◀️
						▶️int y = 10;◀️
						▶️if (x == 5) y = 0;◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('recognizes single line if else statements with blocks as multiple statements', async function () {
			await testStatementBuilding(
				'java',
				dedent`
				▶️public class SingleLineIfSample {
					▶️public static void main(String[] args) ▶️{
						▶️int x = 5;◀️
						▶️int y = 10;◀️
						▶️if (x == 5) ▶️{ ▶️y = 0;◀️ }◀️◀️
					}◀️◀️
				}◀️
				`
			);
		});

		test('node.isCompoundStatementType is true for splittable block statements', async function () {
			await assertStatementIsCompoundType(dedent`
						{
							int x = 1;
						}`);
		});

		test('node.isCompoundStatementType is true for splittable do statements', async function () {
			await assertStatementIsCompoundType(dedent`
						do {
							int x = 1;
						} while (true);`);
		});

		test('node.isCompoundStatementType is true for splittable enhanced for statements', async function () {
			await assertStatementIsCompoundType(dedent`
				for (int n : numbers) {
					int x = 1;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable for statements', async function () {
			await assertStatementIsCompoundType(dedent`
				for (int i = 0; i < 10; i++) {
					int x = 1;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable labeled statements', async function () {
			await assertStatementIsCompoundType(dedent`
				myLabel: {
					int x = 1;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable switch expression', async function () {
			await assertStatementIsCompoundType(dedent`
				switch (test) {
					case 0:
						System.out.println("The number is one.");
						break;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable synchronized statement', async function () {
			await assertStatementIsCompoundType(dedent`
				synchronized (ReturnSample.class) {
					int x = 1;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable try statement', async function () {
			await assertStatementIsCompoundType(dedent`
				try {
					int result = 10 / 0;
				} catch (ArithmeticException e) {
					System.out.println("Cannot divide by zero");
				}`);
		});

		test('node.isCompoundStatementType is true for splittable try with resources statement', async function () {
			await assertStatementIsCompoundType(dedent`
				try (BufferedReader br = new BufferedReader(new FileReader("file.txt"))) {
					int result = 10 / 0;
				} catch (ArithmeticException e) {
					System.out.println("Cannot divide by zero");
				}`);
		});

		test('node.isCompoundStatementType is true for splittable while statement', async function () {
			await assertStatementIsCompoundType(dedent`
				while (true) {
					int x = 1;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable interface declaration', async function () {
			await assertStatementIsCompoundType(dedent`
				public interface InnerInterface {
					void innerMethod();
				}`);
		});

		test('node.isCompoundStatementType is true for splittable method declaration', async function () {
			await assertStatementIsCompoundType(dedent`
				public static void add(int a, int b) {
					int sum = a + b;
				}`);
		});

		test('node.isCompoundStatementType is true for splittable constructor declaration', async function () {
			await assertStatementIsCompoundType(dedent`
				class MyClass {
					 ❚public MyClass() {
						int x = 0;
					}
				}`);
		});

		test('node.isCompoundStatementType is true for splittable compact constructor declaration', async function () {
			await assertStatementIsCompoundType(dedent`
				public record Person(String firstName, String lastName) {
					❚public Person {
						firstName = firstName;
						lastName = lastName;
					}
				}`);
		});

		test('node.isCompoundStatementType is true for splittable class declaration', async function () {
			await assertStatementIsCompoundType(dedent`
				class MyClass {
					 public MyClass() {
						int x = 0;
					}
				}`);
		});

		test('node.isCompoundStatementType is true for splittable annotation type declaration', async function () {
			await assertStatementIsCompoundType(dedent`
				public @interface MyAnnotation {
					void myMethod();
				}`);
		});

		test('node.isCompoundStatementType is true for splittable static initializer', async function () {
			await assertStatementIsCompoundType(dedent`
				public class StaticInitClassSample {
					static int count
					❚static
					{
						count = 100;
					}
				}`);
		});

		test('node.isCompoundStatementType is true for splittable if statements', async function () {
			await assertStatementIsCompoundType(dedent`
						if (true) {
							int x = 1;
						}`);
		});

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

		test('recognizes extern alias directives', async function () {
			await testStatementBuilding('csharp', `▶️extern alias Example;◀️`);
		});

		test('recognizes using directives', async function () {
			await testStatementBuilding('csharp', `▶️using System;◀️`);
		});

		test('recognizes global attributes', async function () {
			await testStatementBuilding('csharp', `▶️[assembly: AssemblyTitle("Example")]◀️`);
		});

		test('recognizes top-level pre-processor directives', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️#if WIN32
						▶️string os = "Win32";◀️
					#elif MACOS
						▶️string os = "MacOS";◀️
					#else
						▶️string os = "Linux";◀️
					#endif◀️
				`
			);
		});

		test('recognizes file-scoped namespace declarations', async function () {
			await testStatementBuilding('csharp', `▶️namespace Example;◀️`);
		});

		test('recognizes namespace declarations', async function () {
			await testStatementBuilding('csharp', `▶️namespace Example { }◀️`);
		});

		test('recognizes top-level statements', async function () {
			await testStatementBuilding('csharp', `▶️Console.WriteLine("example");◀️`);
		});

		test('recognizes enum declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️enum Direction
					{
						North,
						South,
						East,
						West
					}◀️
				`
			);
		});

		test('recognizes class declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
					}◀️
				`
			);
		});

		test('recognizes struct declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️struct Example
					{
					}◀️
				`
			);
		});

		test('recognizes record declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️record Example
					{
					}◀️
				`
			);
		});

		test('recognizes interface declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️interface Example
					{
					}◀️
				`
			);
		});

		test('recognizes fields', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️bool flag = true;◀️
					}◀️
				`
			);
		});

		test('recognizes event fields', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️event EventHandler onEvent;◀️
					}◀️
				`
			);
		});

		test('recognizes properties', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️int Len
						{
							▶️get ▶️{ ▶️return _len;◀️ }◀️◀️
							▶️set ▶️{ ▶️_len = value;◀️ }◀️◀️
						}◀️
					}◀️
				`
			);
		});

		test('recognizes automatic properties', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️int Len { ▶️get;◀️ ▶️set;◀️ }◀️
						▶️int Capacity { ▶️get;◀️ ▶️init;◀️ }◀️
					}◀️
				`
			);
		});

		test('recognizes properties with initial values', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️int Len { ▶️get;◀️ } = 0;◀️
					}◀️
				`
			);
		});

		test('recognizes properties with an arrow expression', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️int Area => _width * _height;◀️
					}◀️
				`
			);
		});

		test('recognizes event declarations with add / remove functions', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️event EventHandler onEvent
						{
							▶️add ▶️{ ▶️someWork();◀️ }◀️◀️
						}◀️
					}◀️
				`
			);
		});

		test('recognizes methods', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes constructors', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️Example()
						▶️{
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes destructors', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️~Example()
						▶️{
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes indexers', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️int this[int index]()
						{
							▶️get ▶️{ ▶️return _items[index];◀️ }◀️◀️
							▶️set ▶️{ ▶️_items[index] = value;◀️ }◀️◀️
						}◀️
					}◀️
				`
			);
		});

		test('recognizes operators', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️Example operator +(Example e) ▶️{ ▶️return new Example();◀️ }◀️◀️
					}◀️
				`
			);
		});

		test('recognizes conversion operators', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️explicit operator int(Example e) ▶️{ ▶️return 0;◀️ }◀️◀️
					}◀️
				`
			);
		});

		test('recognizes delegates', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️delegate void Action();◀️
					}◀️
				`
			);
		});

		test('recognizes block statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️{
								▶️Console.WriteLine("example");◀️
							}◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes break statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️for (;;) ▶️{
								▶️break;◀️
							}◀️◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes expression statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️x = y * 4 + 2;◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes checked statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes do statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes empty statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️;◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes unsafe statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes fixed statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes for statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes return statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️return;◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes lock statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes yield statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes switch statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes throw statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️throw new Exception("Error occurred");◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes try / catch / finally statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes using statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void ReadFile(string path)
						▶️{
							▶️using var file = new StreamReader(path);◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes foreach statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes goto and labeled statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️goto End;◀️

						▶️End:
							▶️return;◀️◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes if / else statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('collapses single-line if statements without braces', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run(bool flag)
						▶️{
							▶️if (flag) return;◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes while statements', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
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
				`
			);
		});

		test('recognizes local variable declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️int x = 10;◀️
						}◀️◀️
					}◀️
				`
			);
		});

		test('recognizes local function declarations', async function () {
			await testStatementBuilding(
				'csharp',
				dedent`
					▶️class Example
					{
						▶️void Run()
						▶️{
							▶️void LocalFunction() ▶️{ ▶️Console.WriteLine("Hello from local function!");◀️ }◀️◀️
							▶️LocalFunction();◀️
						}◀️◀️
					}◀️
				`
			);
		});

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

		test('node.isCompoundStatementType is true for class declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				❚class Example
				{
				}
			`);
		});

		test('node.isCompoundStatementType is true for struct declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				❚struct Example
				{
				}
			`);
		});

		test('node.isCompoundStatementType is true for interface declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				❚interface Example
				{
				}
			`);
		});

		test('node.isCompoundStatementType is true for method declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					❚void Run()
					{
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for constructor declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					❚Example()
					{
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for destructor declarations', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					❚~Example()
					{
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for blocks', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for checked statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚checked
						{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for do statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚do
						{
						} while (false);
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for fixed statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚fixed
						{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for for statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚for (;;)
						{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for lock statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚lock (x)
						{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for switch statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚switch (x)
						{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for try statements', async function () {
			await assertStatementIsCompoundType(dedent`
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
			`);
		});

		test('node.isCompoundStatementType is true for unsafe statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚unsafe
						{
						}
					}
				}
			`);
		});

		test('node.isCompoundStatementType is true for foreach statements', async function () {
			await assertStatementIsCompoundType(dedent`
				class Example
				{
					void Run()
					{
						❚foreach (var item in items)
						{
						}
					}
				}
			`);
		});

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
			test('recognizes extern declarations', async function () {
				await testStatementBuilding('c', `▶️extern int foo();◀️`);
			});

			test('recognizes typedef declarations', async function () {
				await testStatementBuilding('c', `▶️typedef int myInt;◀️`);
			});

			test('recognizes struct declarations', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️typedef struct Obj
					▶️{
						▶️int x;◀️
						▶️float y;◀️
					}◀️ obj;◀️
				`
				);
			});

			test('recognizes union declarations', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️union Example
					▶️{
						▶️int x;◀️
						▶️float y;◀️
					}◀️ example◀️
				`
				);
			});

			test('recognizes enum declarations', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️enum Color
					{
						RED,
						GREEN,
						BLUE
					}◀️
				`
				);
			});

			test('recognizes function declarations', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️int add(int a, int b)
					▶️{
						▶️return a + b;◀️
					}◀️◀️
				`
				);
			});

			test('recognizes old style function declarations', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️int add(a, b)◀️
					▶️int a;◀️
					▶️int b;◀️
					▶️{
						▶️return a + b;◀️
					}◀️
				`
				);
			});

			test('recognizes variable declarations', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️int x = 10;◀️
				`
				);
			});

			test('recognizes compound statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️{
						▶️int x = 10;◀️
						▶️int y = 20;◀️
					}◀️
				`
				);
			});

			test('recognizes if statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️void example()
					▶️{
						▶️if (x > 0)
						▶️{
							▶️printf("Positive");◀️
						}◀️◀️
					}◀️◀️
				`
				);
			});

			test('recognizes else and else if statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
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
				`
				);
			});

			test('recognizes switch statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
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
				`
				);
			});

			test('recognizes while statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️void example()
					▶️{
						▶️while (x < 10)
						▶️{
							▶️printf("%d", x);◀️
							▶️x++;◀️
							▶️continue;◀️
						}◀️◀️
					}◀️◀️
				`
				);
			});

			test('recognizes for statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️void example()
					▶️{
						▶️for (▶️int i = 0;◀️ i < 10; i++)
						▶️{
							▶️printf("%d", i);◀️
						}◀️◀️
					}◀️◀️
				`
				);
			});

			test('recognizes do while statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️void example()
					▶️{
						▶️do
						▶️{
							▶️printf("%d", x);◀️
						}◀️ while (x < 10);◀️
					}◀️◀️
				`
				);
			});

			test('recognizes goto statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️goto label;◀️
					▶️label:
						▶️printf("Label reached");◀️◀️
				`
				);
			});

			test('recognizes preprocessor if statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️#if DEBUG
						▶️#define STACK 0
					◀️#elif RELEASE
						▶️#define STACK 100
					◀️#else
						▶️printf("Unknown mode");◀️
					#endif◀️
				`
				);
			});

			test('recognizes ifdef statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️#ifdef DEBUG
						▶️printf("Debug mode");◀️
					#endif◀️
				`
				);
			});

			test('recognizes include statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️#include <stdio.h>
					◀️▶️#include "myheader.h"◀️
				`
				);
			});

			test('recognizes preprocessor call statements', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️#import "..\\file"
					◀️▶️#line 10
					◀️▶️#pragma once
					◀️▶️#using "using_assembly_A.dll"
					◀️▶️#undef ADD
					◀️▶️#error C++ compiler required.◀️
				`
				);
			});

			test('recognizes preprocessor functions', async function () {
				await testStatementBuilding(
					'c',
					dedent`
					▶️#define SQUARE(x) ((x) * (x))
					◀️▶️#define MAX(a, b) (\\
						(a) > (b) ? (a) : (b) \\
					)◀️
				`
				);
			});
		});

		suite('Statement identification (C++)', function () {
			test('recognizes namespace statements', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️namespace MyNamespace
					{
						▶️int x;◀️
					}◀️
				`
				);
			});

			test('recognizes class definitions', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️class MyClass
					▶️{
						▶️int x;◀️
						▶️void m() ▶️{
							▶️x = 1;◀️
						}◀️◀️
					}◀️◀️
				`
				);
			});

			test('recognizes template declarations', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️template <typename T> ▶️T myMax(T x, T y) ▶️{
						▶️return (x > y) ? x : y;◀️
					}◀️◀️◀️
				`
				);
			});

			test('recognizes concept definitions', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️template<typename T>
					▶️concept MyConcept = requires(T t)
					{
						▶️{ t.foo() } -> std::same_as<int>;◀️
					}◀️◀️
				`
				);
			});

			test('recognizes using statements', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️using MyType = int;◀️
				`
				);
			});

			test('recognizes alias declarations', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️using MyAlias = int;◀️
				`
				);
			});

			test('recognizes static assertions', async function () {
				await testStatementBuilding(
					'cpp',
					dedent`
					▶️static_assert(sizeof(int) == 4, "int is not 4 bytes");◀️
				`
				);
			});
		});

		suite('Compound Statement Identification (C, C++)', function () {
			test('node.isCompoundStatementType is true for struct declarations', async function () {
				await assertStatementIsCompoundType(dedent`
					❚struct Obj
					{
						int x;
						float y;
					} obj;
				`);
			});

			test('node.isCompoundStatementType is true for union declarations', async function () {
				await assertStatementIsCompoundType(dedent`
					❚union Obj
					{
						int x;
						float y;
					} obj;
				`);
			});

			test('node.isCompoundStatementType is true for enum declarations', async function () {
				await assertStatementIsCompoundType(dedent`
					❚enum Color
					{
						RED,
						GREEN,
						BLUE
					} obj;
				`);
			});

			test('node.isCompoundStatementType is true for empty blocks', async function () {
				await assertStatementIsCompoundType(dedent`
					❚{
					}
				`);
			});

			test('node.isCompoundStatementType is true for function declarations', async function () {
				await assertStatementIsCompoundType(dedent`
					void example()
					{
						❚int add(int a, int b)
						{
							return a + b;
						}
					}
				`);
			});

			test('node.isCompoundStatementType is true for compound statements', async function () {
				await assertStatementIsCompoundType(dedent`
					❚{
						int x = 10;
						int y = 20;
					}
				`);
			});

			test('node.isCompoundStatementType is true for if statements', async function () {
				await assertStatementIsCompoundType(dedent`
					void example()
					{
						❚if (x > 0)
						{
							printf("Positive");
						}
					}
				`);
			});

			test('node.isCompoundStatementType is true for type definitions', async function () {
				await assertStatementIsCompoundType(dedent`
					❚typedef struct Obj
					{
						int x;
						float y;
					} obj;
				`);
			});

			test('node.isCompoundStatementType is true for for statements', async function () {
				await assertStatementIsCompoundType(dedent`
					void example()
					{
						❚for (int i = 0; i < 10; i++)
						{
							printf("%d", i);
						}
					}
				`);
			});

			test('node.isCompoundStatementType is true for while statements', async function () {
				await assertStatementIsCompoundType(dedent`
					void example()
					{
						❚while (x < 10)
						{
							printf("%d", x);
							x++;
						}
					}
				`);
			});

			test('node.isCompoundStatementType is true for do while statements', async function () {
				await assertStatementIsCompoundType(dedent`
					void example()
					{
						❚do
						{
							printf("%d", x);
						} while (x < 10);
					}
				`);
			});

			test('node.isCompoundStatementType is true for switch statements', async function () {
				await assertStatementIsCompoundType(dedent`
					void example()
					{
						❚switch (x)
						{
							default:
								printf("Default");
								break;
						}
					}
				`);
			});

			test('node.isCompoundStatementType is true for preprocessor if statements', async function () {
				await assertStatementIsCompoundType(dedent`
					❚#if DEBUG
						#define STACK 0
					#elif RELEASE
						#define STACK 100
					#else
						printf("Unknown mode");
					#endif
				`);
			});

			test('node.isCompoundStatementType is true for preprocessor ifdef statements', async function () {
				await assertStatementIsCompoundType(dedent`
					❚#ifdef DEBUG
						printf("Debug mode");
					#endif
				`);
			});

			test('node.isCompoundStatementType is false for declaration statements', async function () {
				await assertStatementIsNotCompoundType(dedent`
					int foo() {
						❚int x = 10;
					}
				`);
			});

			test('node.isCompoundStatementType is false for return statements', async function () {
				await assertStatementIsNotCompoundType(dedent`
					int foo() {
						❚return 1;
					}
				`);
			});

			test('node.isCompoundStatementType is false for goto statements', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚goto label;
				`);
			});

			test('node.isCompoundStatementType is false for label statements', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚label:
						printf("Label reached");
				`);
			});

			test('node.isCompoundStatementType is false for preprocessor include statements', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚#include <stdio.h>
				`);
			});

			test('node.isCompoundStatementType is false for preprocessor functions', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚#define SQUARE(x) ((x) * (x))
				`);
			});

			async function assertStatementIsCompoundType(text: string) {
				await testStatementIsCompoundType('c', text, true);
			}

			async function assertStatementIsNotCompoundType(text: string) {
				await testStatementIsCompoundType('c', text, false);
			}
		});

		suite('Compound Statement Identification (C++)', function () {
			test('node.isCompoundStatementType is true for namespace definitions', async function () {
				await assertStatementIsCompoundType(dedent`
					❚namespace MyNamespace
					{
						int x;
					}
				`);
			});

			test('node.isCompoundStatementType is true for template declaratations', async function () {
				await assertStatementIsCompoundType(dedent`
					❚template<typename T>
					class MyClass
					{
						T value;
					}
				`);
			});

			test('node.isCompoundStatementType is true for concept definitions', async function () {
				await assertStatementIsCompoundType(dedent`
					❚concept MyConcept = requires(T t)
					{
						{ t.foo() } -> std::same_as<int>;
					};
				`);
			});

			test('node.isCompoundStatementType is true for class declarations', async function () {
				await assertStatementIsCompoundType(dedent`
					❚class MyClass
					{
						int x;
						float y;
					};
				`);
			});

			test('node.isCompoundStatementType is true for class declarations with template', async function () {
				await assertStatementIsCompoundType(dedent`
					❚template<typename T>
					class MyClass
					{
						T value;
					};
				`);
			});

			test('node.isCompoundStatementType is true for field declaration lists', async function () {
				await assertStatementIsCompoundType(dedent`
					class MyClass
					❚{
						int x;
						float y;
						double z;
					};
				`);
			});

			test('node.isCompoundStatementType is false for field declarations', async function () {
				await assertStatementIsNotCompoundType(dedent`
					class MyClass
					{
						❚int x;
						float y;
					};
				`);
			});

			test('node.isCompoundStatementType is false for single-line concept definitions', async function () {
				await assertStatementIsNotCompoundType(dedent`
					template<class T, class U>
					❚concept Derived = std::is_base_of<U, T>::value;
				`);
			});

			test('node.isCompoundStatementType is false for using statements', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚using MyType = int;
				`);
			});

			test('node.isCompoundStatementType is false for alias declarations', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚using MyAlias = int;
				`);
			});

			test('node.isCompoundStatementType is false for static assertions', async function () {
				await assertStatementIsNotCompoundType(dedent`
					❚static_assert(sizeof(int) == 4, "int is not 4 bytes");
				`);
			});

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
