/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Parser } from '../../common/contextkey.js';

function parseToStr(input: string): string {
	const parser = new Parser();

	const prints: string[] = [];

	const print = (...ss: string[]) => { ss.forEach(s => prints.push(s)); };

	const expr = parser.parse(input);
	if (expr === undefined) {
		if (parser.lexingErrors.length > 0) {
			print('Lexing errors:', '\n\n');
			parser.lexingErrors.forEach(lexingError => print(`Unexpected token '${lexingError.lexeme}' at offset ${lexingError.offset}. ${lexingError.additionalInfo}`, '\n'));
		}

		if (parser.parsingErrors.length > 0) {
			if (parser.lexingErrors.length > 0) { print('\n --- \n'); }
			print('Parsing errors:', '\n\n');
			parser.parsingErrors.forEach(parsingError => print(`Unexpected '${parsingError.lexeme}' at offset ${parsingError.offset}.`, '\n'));
		}

	} else {
		print(expr.serialize());
	}

	return prints.join('');
}

suite('Context Key Parser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test(' foo', () => {
		const input = ' foo';
		assert.deepStrictEqual(parseToStr(input), 'foo');
	});

	test('!foo', () => {
		const input = '!foo';
		assert.deepStrictEqual(parseToStr(input), '!foo');
	});

	test('foo =~ /bar/', () => {
		const input = 'foo =~ /bar/';
		assert.deepStrictEqual(parseToStr(input), 'foo =~ /bar/');
	});

	test(`foo || (foo =~ /bar/ && baz)`, () => {
		const input = `foo || (foo =~ /bar/ && baz)`;
		assert.deepStrictEqual(parseToStr(input), 'foo || baz && foo =~ /bar/');
	});

	test('foo || (foo =~ /bar/ || baz)', () => {
		const input = 'foo || (foo =~ /bar/ || baz)';
		assert.deepStrictEqual(parseToStr(input), 'baz || foo || foo =~ /bar/');
	});

	test(`(foo || bar) && (jee || jar)`, () => {
		const input = `(foo || bar) && (jee || jar)`;
		assert.deepStrictEqual(parseToStr(input), 'bar && jar || bar && jee || foo && jar || foo && jee');
	});

	test('foo && foo =~ /zee/i', () => {
		const input = 'foo && foo =~ /zee/i';
		assert.deepStrictEqual(parseToStr(input), 'foo && foo =~ /zee/i');
	});

	test('foo.bar==enabled', () => {
		const input = 'foo.bar==enabled';
		assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
	});

	test(`foo.bar == 'enabled'`, () => {
		const input = `foo.bar == 'enabled'`;
		assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
	});

	test('foo.bar:zed==completed - equality with no space', () => {
		const input = 'foo.bar:zed==completed';
		assert.deepStrictEqual(parseToStr(input), `foo.bar:zed == 'completed'`);
	});

	test('a && b || c', () => {
		const input = 'a && b || c';
		assert.deepStrictEqual(parseToStr(input), 'c || a && b');
	});

	test('fooBar && baz.jar && fee.bee<K-loo+1>', () => {
		const input = 'fooBar && baz.jar && fee.bee<K-loo+1>';
		assert.deepStrictEqual(parseToStr(input), 'baz.jar && fee.bee<K-loo+1> && fooBar');
	});

	test('foo.barBaz<C-r> < 2', () => {
		const input = 'foo.barBaz<C-r> < 2';
		assert.deepStrictEqual(parseToStr(input), `foo.barBaz<C-r> < 2`);
	});

	test('foo.bar >= -1', () => {
		const input = 'foo.bar >= -1';
		assert.deepStrictEqual(parseToStr(input), 'foo.bar >= -1');
	});

	test(`key contains &nbsp: view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`, () => {
		const input = `view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`;
		assert.deepStrictEqual(parseToStr(input), `vsc-packages-folders-loaded && view == 'vsc-packages-activitybar-folders'`);
	});

	test('foo.bar <= -1', () => {
		const input = 'foo.bar <= -1';
		assert.deepStrictEqual(parseToStr(input), `foo.bar <= -1`);
	});

	test('!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet', () => {
		const input = '!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet';
		assert.deepStrictEqual(parseToStr(input), 'cmake:enableFullFeatureSet && !cmake:hideBuildCommand');
	});

	test('!(foo && bar)', () => {
		const input = '!(foo && bar)';
		assert.deepStrictEqual(parseToStr(input), '!bar || !foo');
	});

	test('!(foo && bar || boar) || deer', () => {
		const input = '!(foo && bar || boar) || deer';
		assert.deepStrictEqual(parseToStr(input), 'deer || !bar && !boar || !boar && !foo');
	});

	test(`!(!foo)`, () => {
		const input = `!(!foo)`;
		assert.deepStrictEqual(parseToStr(input), 'foo');
	});

	suite('controversial', () => {
		/*
			new parser KEEPS old one's behavior:

			old parser output: { key: 'debugState', op: '==', value: '"stopped"' }
			new parser output: { key: 'debugState', op: '==', value: '"stopped"' }

			TODO@ulugbekna: we should consider breaking old parser's behavior, and not take double quotes as part of the `value` because that's not what user expects.
		*/
		test(`debugState == "stopped"`, () => {
			const input = `debugState == "stopped"`;
			assert.deepStrictEqual(parseToStr(input), `debugState == '"stopped"'`);
		});

		/*
			new parser BREAKS old one's behavior:

			old parser output: { key: 'viewItem', op: '==', value: 'VSCode WorkSpace' }
			new parser output: { key: 'viewItem', op: '==', value: 'VSCode' }

			TODO@ulugbekna: since this's breaking, we can have hacky code that tries detecting such cases and replicate old parser's behavior.
		*/
		test(` viewItem == VSCode WorkSpace`, () => {
			const input = ` viewItem == VSCode WorkSpace`;
			assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected 'WorkSpace' at offset 20.\n`);
		});


	});

	suite('regex', () => {

		test(`resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`, () => {
			const input = `resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`;
			assert.deepStrictEqual(parseToStr(input), 'resource =~ /\\/foo\\/(barr|door\\/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(\\/.*)*$/');
		});

		test(`resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`, () => {
			const input = `resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`;
			assert.deepStrictEqual(parseToStr(input), 'resource =~ /((\\/scratch\\/(?!update)(.*)\\/)|((\\/src\\/).*\\/)).*$/');
		});

		test(`resourcePath =~ /\.md(\.yml|\.txt)*$/giym`, () => {
			const input = `resourcePath =~ /\.md(\.yml|\.txt)*$/giym`;
			assert.deepStrictEqual(parseToStr(input), 'resourcePath =~ /.md(.yml|.txt)*$/im');
		});

	});

	suite('error handling', () => {

		test(`/foo`, () => {
			const input = `/foo`;
			assert.deepStrictEqual(parseToStr(input), `Lexing errors:\n\nUnexpected token '/foo' at offset 0. Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/'.\n\n --- \nParsing errors:\n\nUnexpected '/foo' at offset 0.\n`);
		});

		test(`!b == 'true'`, () => {
			const input = `!b == 'true'`;
			assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '==' at offset 3.\n`);
		});

		test('!foo &&  in bar', () => {
			const input = '!foo &&  in bar';
			assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected 'in' at offset 9.\n`);
		});

		test('vim<c-r> == 1 && vim<2<=3', () => {
			const input = 'vim<c-r> == 1 && vim<2<=3';
			assert.deepStrictEqual(parseToStr(input), `Lexing errors:\n\nUnexpected token '=' at offset 23. Did you mean == or =~?\n\n --- \nParsing errors:\n\nUnexpected '=' at offset 23.\n`); // FIXME
		});

		test(`foo && 'bar`, () => {
			const input = `foo && 'bar`;
			assert.deepStrictEqual(parseToStr(input), `Lexing errors:\n\nUnexpected token ''bar' at offset 7. Did you forget to open or close the quote?\n\n --- \nParsing errors:\n\nUnexpected ''bar' at offset 7.\n`);
		});

		test(`config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`, () => {
			const input = `config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`;
			assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '&&' at offset 15.\n`);
		});

		test(`!foo == 'test'`, () => {
			const input = `!foo == 'test'`;
			assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '==' at offset 5.\n`);
		});

		test(`!!foo`, function () {
			const input = `!!foo`;
			assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '!' at offset 1.\n`);
		});

	});

});
