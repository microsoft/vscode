/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import {
	_dispose
} from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { srcWithAnnotatedNodeToDoc } from './getNodeToDocument.util';


suite('getNodeToDocument - python', () => {

	afterAll(() => _dispose());

	async function run(annotatedSrc: string) {
		return srcWithAnnotatedNodeToDoc(
			WASMLanguage.Python,
			annotatedSrc,
		);
	}

	test('plain function definition - cursor on `def`', async () => {
		const result = await run(
			outdent`
				<<def>> hello():
				    return 1
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>def <IDENT>hello</IDENT>():
			    return 1</FUNCTION_DEFINITION>"
		`);
	});

	test('plain function definition - cursor in body', async () => {
		const result = await run(
			outdent`
				def hello():
				    return <<1>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>def <IDENT>hello</IDENT>():
			    return 1</FUNCTION_DEFINITION>"
		`);
	});

	test('plain class definition - cursor on `class`', async () => {
		const result = await run(
			outdent`
				<<class>> Foo:
				    x = 1
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<CLASS_DEFINITION>class <IDENT>Foo</IDENT>:
			    x = 1</CLASS_DEFINITION>"
		`);
	});

	// Regression test for https://github.com/microsoft/vscode/issues/283165:
	// when a Python function has a decorator, the documentable node should be
	// the inner `function_definition` (not the wrapping `decorated_definition`),
	// so that anything downstream (LLM prompt context, docstring insertion)
	// treats the `def` line — not the `@decorator` line — as the start of the
	// function. Otherwise docstrings end up *before* the decorator, which is a
	// syntax error / Pylance error.
	test('decorated function - cursor in body picks function_definition (not decorated_definition)', async () => {
		const result = await run(
			outdent`
				import pytest

				@pytest.fixture(scope="module")
				def sample_data():
				    return <<{}>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"import pytest

			@pytest.fixture(scope="module")
			<FUNCTION_DEFINITION>def <IDENT>sample_data</IDENT>():
			    return {}</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated function - cursor on `def` picks function_definition', async () => {
		const result = await run(
			outdent`
				@my_decorator
				<<def>> say_hello():
				    print("hi")
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@my_decorator
			<FUNCTION_DEFINITION>def <IDENT>say_hello</IDENT>():
			    print("hi")</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated function - selecting the whole file picks function_definition', async () => {
		const result = await run(
			outdent`
				<<@my_decorator
				def say_hello():
				    print("hi")
				>>`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@my_decorator
			<FUNCTION_DEFINITION>def <IDENT>say_hello</IDENT>():
			    print("hi")</FUNCTION_DEFINITION>
			"
		`);
	});

	test('multiple decorators - picks function_definition', async () => {
		const result = await run(
			outdent`
				@first
				@second(arg=1)
				@third
				def stacked():
				    return <<42>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@first
			@second(arg=1)
			@third
			<FUNCTION_DEFINITION>def <IDENT>stacked</IDENT>():
			    return 42</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated class - picks class_definition (not decorated_definition)', async () => {
		const result = await run(
			outdent`
				@dataclass
				class Point:
				    x: int = <<0>>
				    y: int = 0
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@dataclass
			<CLASS_DEFINITION>class <IDENT>Point</IDENT>:
			    x: int = 0
			    y: int = 0</CLASS_DEFINITION>"
		`);
	});

	test('decorated method inside a class - picks the inner function_definition', async () => {
		const result = await run(
			outdent`
				class Service:
				    @staticmethod
				    def helper():
				        return <<42>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Service:
			    @staticmethod
			    <FUNCTION_DEFINITION>def <IDENT>helper</IDENT>():
			        return 42</FUNCTION_DEFINITION>"
		`);
	});

	test('plain method inside a class - cursor in body picks function_definition (not class_definition)', async () => {
		const result = await run(
			outdent`
				class Service:
				    def helper(self):
				        return <<42>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Service:
			    <FUNCTION_DEFINITION>def <IDENT>helper</IDENT>(self):
			        return 42</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated method - whole-method selection picks the inner function_definition', async () => {
		const result = await run(
			outdent`
				class Service:
				    <<@staticmethod
				    def helper():
				        return 42>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Service:
			    @staticmethod
			    <FUNCTION_DEFINITION>def <IDENT>helper</IDENT>():
			        return 42</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated method inside a decorated class - cursor in method body picks the method function_definition', async () => {
		const result = await run(
			outdent`
				@dataclass
				class Service:
				    @staticmethod
				    def helper():
				        return <<42>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@dataclass
			class Service:
			    @staticmethod
			    <FUNCTION_DEFINITION>def <IDENT>helper</IDENT>():
			        return 42</FUNCTION_DEFINITION>"
		`);
	});

	test('classmethod with @property-like decorator - picks the method function_definition', async () => {
		const result = await run(
			outdent`
				class Config:
				    @classmethod
				    @cached
				    def from_env(cls):
				        return <<cls()>>
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Config:
			    @classmethod
			    @cached
			    <FUNCTION_DEFINITION>def <IDENT>from_env</IDENT>(cls):
			        return cls()</FUNCTION_DEFINITION>"
		`);
	});

	// Reproduces the exact scenario from
	// https://github.com/microsoft/vscode/issues/283165: a Python file with an
	// import and a single decorated function, with the user selecting the entire
	// file content. The node-to-document must be the inner `function_definition`
	// so that any docstring is inserted *inside* the function (after `def …:`),
	// not above the `@pytest.fixture(...)` decorator.
	test('issue #283165: decorated pytest fixture with whole-file selection', async () => {
		const result = await run(
			outdent`
				<<import pytest

				@pytest.fixture(scope="module")
				def sample_data():
				    return {
				        "name": "John Doe",
				        "age": 30,
				        "email": "john.doe@example.com"
				    }
				>>`,
		);
		expect(result).toMatchInlineSnapshot(`
			"import pytest

			@pytest.fixture(scope="module")
			<FUNCTION_DEFINITION>def <IDENT>sample_data</IDENT>():
			    return {
			        "name": "John Doe",
			        "age": 30,
			        "email": "john.doe@example.com"
			    }</FUNCTION_DEFINITION>
			"
		`);
	});

	// Regression test: when the cursor is *on the decorator line*, the
	// node-to-document must still be the inner function/class (with the range
	// excluding the `@decorator`). Previously this would walk all the way up
	// to the `module` node, which is a regression for `/doc` invoked with the
	// cursor on `@decorator`.
	test('decorated function - cursor on decorator picks function_definition (not module)', async () => {
		const result = await run(
			outdent`
				import pytest

				@pytest.fix<<>>ture(scope="module")
				def sample_data():
				    return {}
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"import pytest

			@pytest.fixture(scope="module")
			<FUNCTION_DEFINITION>def <IDENT>sample_data</IDENT>():
			    return {}</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated function - cursor on the `@` sign picks function_definition (not module)', async () => {
		const result = await run(
			outdent`
				<<@>>my_decorator
				def say_hello():
				    print("hi")
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@my_decorator
			<FUNCTION_DEFINITION>def <IDENT>say_hello</IDENT>():
			    print("hi")</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated function - selection covering only the decorator line picks function_definition', async () => {
		const result = await run(
			outdent`
				<<@my_decorator>>
				def say_hello():
				    print("hi")
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"@my_decorator
			<FUNCTION_DEFINITION>def <IDENT>say_hello</IDENT>():
			    print("hi")</FUNCTION_DEFINITION>"
		`);
	});

	test('decorated method - cursor on decorator inside a class picks the method function_definition', async () => {
		const result = await run(
			outdent`
				class Service:
				    @static<<>>method
				    def helper():
				        return 42
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Service:
			    @staticmethod
			    <FUNCTION_DEFINITION>def <IDENT>helper</IDENT>():
			        return 42</FUNCTION_DEFINITION>"
		`);
	});
});
