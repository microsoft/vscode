/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { looksLikeCode } from '../../common/codeGuesser';

suite('codeGuesser', () => {

	test('looksLikeCode - detects JavaScript configuration as code', () => {
		const jsConfigSnippet = `'prefer-const': 'off',`;
		assert.strictEqual(looksLikeCode(jsConfigSnippet), true);
	});

	test('looksLikeCode - detects code-like text', () => {
		const codeSnippet = 'function test() { return true; }';
		assert.strictEqual(looksLikeCode(codeSnippet), true);
	});

	test('looksLikeCode - detects non-code text', () => {
		const nonCodeSnippet = 'This is a regular sentence.';
		assert.strictEqual(looksLikeCode(nonCodeSnippet), false);
	});

	test('looksLikeCode - detects empty string', () => {
		const emptyString = '';
		assert.strictEqual(looksLikeCode(emptyString), false);
	});

	test('looksLikeCode - detects HTML as code', () => {
		const htmlSnippet = '<div>Hello World</div>';
		assert.strictEqual(looksLikeCode(htmlSnippet), true);
	});

	test('looksLikeCode - detects JSON as code', () => {
		const jsonSnippet = '{"key": "value"}';
		assert.strictEqual(looksLikeCode(jsonSnippet), true);
	});

	test('looksLikeCode - detects CSS as code', () => {
		const cssSnippet = 'body { background-color: #fff; }';
		assert.strictEqual(looksLikeCode(cssSnippet), true);
	});

	test('looksLikeCode - detects SQL as code', () => {
		const sqlSnippet = 'SELECT * FROM users WHERE id = 1;';
		assert.strictEqual(looksLikeCode(sqlSnippet), true);
	});

	test('looksLikeCode - detects Python as code', () => {
		const pythonSnippet = 'def test(): return True';
		assert.strictEqual(looksLikeCode(pythonSnippet), true);
	});

	test('looksLikeCode - detects Java as code', () => {
		const javaSnippet = 'public class Test { public static void main(String[] args) { } }';
		assert.strictEqual(looksLikeCode(javaSnippet), true);
	});

	test('looksLikeCode - detects C++ as code', () => {
		const cppSnippet = 'int main() { return 0; }';
		assert.strictEqual(looksLikeCode(cppSnippet), true);
	});

	test('looksLikeCode - detects Ruby as code', () => {
		const rubySnippet = 'def test; true; end';
		assert.strictEqual(looksLikeCode(rubySnippet), true);
	});

	test('looksLikeCode - detects PHP as code', () => {
		const phpSnippet = '<?php echo "Hello World"; ?>';
		assert.strictEqual(looksLikeCode(phpSnippet), true);
	});

	test('looksLikeCode - detects XML as code', () => {
		const xmlSnippet = '<note><to>Tove</to></note>';
		assert.strictEqual(looksLikeCode(xmlSnippet), true);
	});

	test.skip('looksLikeCode - detects YAML as code', () => {
		const yamlSnippet = 'key: value';
		assert.strictEqual(looksLikeCode(yamlSnippet), true);
	});

	test.skip('looksLikeCode - detects Markdown as non-code', () => {
		const markdownSnippet = '# This is a heading';
		assert.strictEqual(looksLikeCode(markdownSnippet), false);
	});

	test('looksLikeCode - detects plain text as non-code', () => {
		const plainTextSnippet = 'Just some plain text.';
		assert.strictEqual(looksLikeCode(plainTextSnippet), false);
	});

	test.skip('looksLikeCode - detects shell script as code', () => {
		const shellSnippet = 'echo "Hello World"';
		assert.strictEqual(looksLikeCode(shellSnippet), true);
	});

	test('looksLikeCode - detects TypeScript as code', () => {
		const tsSnippet = 'const test: boolean = true;';
		assert.strictEqual(looksLikeCode(tsSnippet), true);
	});

	test('looksLikeCode - detects Swift as code', () => {
		const swiftSnippet = 'func test() -> Bool { return true }';
		assert.strictEqual(looksLikeCode(swiftSnippet), true);
	});

	test('looksLikeCode - detects Kotlin as code', () => {
		const kotlinSnippet = 'fun test(): Boolean { return true }';
		assert.strictEqual(looksLikeCode(kotlinSnippet), true);
	});

	test('looksLikeCode - detects Go as code', () => {
		const goSnippet = 'func main() { fmt.Println("Hello World") }';
		assert.strictEqual(looksLikeCode(goSnippet), true);
	});

	test('looksLikeCode - detects Rust as code', () => {
		const rustSnippet = 'fn main() { println!("Hello World"); }';
		assert.strictEqual(looksLikeCode(rustSnippet), true);
	});

	test('looksLikeCode - detects Perl as code', () => {
		const perlSnippet = 'print "Hello World";';
		assert.strictEqual(looksLikeCode(perlSnippet), true);
	});

	test('looksLikeCode - detects Lua as code', () => {
		const luaSnippet = 'print("Hello World")';
		assert.strictEqual(looksLikeCode(luaSnippet), true);
	});

	test('looksLikeCode - detects R as code', () => {
		const rSnippet = 'print("Hello World")';
		assert.strictEqual(looksLikeCode(rSnippet), true);
	});

	test('looksLikeCode - detects multiline JavaScript as code', () => {
		const jsSnippet = `
			function add(a, b) {
				return a + b;
			}
			console.log(add(2, 3));
		`;
		assert.strictEqual(looksLikeCode(jsSnippet), true);
	});

	test('looksLikeCode - detects multiline Python as code', () => {
		const pythonSnippet = `
			def add(a, b):
				return a + b

			print(add(2, 3))
		`;
		assert.strictEqual(looksLikeCode(pythonSnippet), true);
	});

	test('looksLikeCode - detects multiline HTML as code', () => {
		const htmlSnippet = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Test</title>
			</head>
			<body>
				<p>Hello World</p>
			</body>
			</html>
		`;
		assert.strictEqual(looksLikeCode(htmlSnippet), true);
	});

	test('looksLikeCode - detects multiline CSS as code', () => {
		const cssSnippet = `
			body {
				background-color: #fff;
				color: #333;
			}
			h1 {
				font-size: 2em;
			}
		`;
		assert.strictEqual(looksLikeCode(cssSnippet), true);
	});

	test('looksLikeCode - detects multiline SQL as code', () => {
		const sqlSnippet = `
			SELECT id, name
			FROM users
			WHERE active = 1
			ORDER BY name;
		`;
		assert.strictEqual(looksLikeCode(sqlSnippet), true);
	});

	test('looksLikeCode - detects natural language response as non-code', () => {
		const naturalLanguageSnippet = 'Sure, I can help you with that. What do you need assistance with?';
		assert.strictEqual(looksLikeCode(naturalLanguageSnippet), false);
	});

	test('looksLikeCode - detects natural language explanation as non-code', () => {
		const naturalLanguageSnippet = 'To create a new React component, you can use the following code snippet:';
		assert.strictEqual(looksLikeCode(naturalLanguageSnippet), false);
	});

	test('looksLikeCode - detects natural language instruction as non-code', () => {
		const naturalLanguageSnippet = 'First, install the necessary dependencies using npm or yarn.';
		assert.strictEqual(looksLikeCode(naturalLanguageSnippet), false);
	});

	test('looksLikeCode - detects natural language question as non-code', () => {
		const naturalLanguageSnippet = 'Have you tried restarting your development server?';
		assert.strictEqual(looksLikeCode(naturalLanguageSnippet), false);
	});

	test('looksLikeCode - detects natural language suggestion as non-code', () => {
		const naturalLanguageSnippet = 'I suggest checking the console for any error messages.';
		assert.strictEqual(looksLikeCode(naturalLanguageSnippet), false);
	});

	test('looksLikeCode - detects natural language response in Spanish as non-code', () => {
		const spanishSnippet = 'Claro, puedo ayudarte con eso. ¿Qué necesitas?';
		assert.strictEqual(looksLikeCode(spanishSnippet), false);
	});

	test('looksLikeCode - detects natural language response in French as non-code', () => {
		const frenchSnippet = 'Bien sûr, je peux vous aider avec cela. Que voulez-vous savoir?';
		assert.strictEqual(looksLikeCode(frenchSnippet), false);
	});

	test('looksLikeCode - detects natural language response in German as non-code', () => {
		const germanSnippet = 'Natürlich kann ich Ihnen dabei helfen. Was brauchen Sie?';
		assert.strictEqual(looksLikeCode(germanSnippet), false);
	});

	test('looksLikeCode - detects natural language response in Chinese as non-code', () => {
		const chineseSnippet = '当然，我可以帮你。你需要什么帮助？';
		assert.strictEqual(looksLikeCode(chineseSnippet), false);
	});

	test('looksLikeCode - detects natural language response in Japanese as non-code', () => {
		const japaneseSnippet = 'もちろん、お手伝いできます。何が必要ですか？';
		assert.strictEqual(looksLikeCode(japaneseSnippet), false);
	});

	test('looksLikeCode - detects natural language response in Russian as non-code', () => {
		const russianSnippet = 'Конечно, я могу вам помочь. Что вам нужно?';
		assert.strictEqual(looksLikeCode(russianSnippet), false);
	});

});
