/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MAX_PARSED_TERMINAL_ERRORS, parseTerminalErrors } from '../../common/terminalErrorParser';
import { describe, expect, it } from 'vitest';

describe('parseTerminalErrors', () => {

	it('returns no errors when output is empty', () => {
		expect(parseTerminalErrors({ commandLine: 'tsc', output: '' })).toEqual([]);
	});

	it('returns no errors when output has no recognised diagnostics', () => {
		const output = 'Hello, world!\nNothing went wrong.\n';
		expect(parseTerminalErrors({ commandLine: 'echo hi', output })).toEqual([]);
	});

	it('strips ANSI escape codes before matching', () => {
		const output = '\u001b[31msrc/foo.ts(10,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\u001b[0m\n';
		const res = parseTerminalErrors({ commandLine: 'tsc --noEmit', output });
		expect(res).toEqual([
			{ source: 'tsc', file: 'src/foo.ts', line: 10, column: 5, message: `Type 'string' is not assignable to type 'number'.` },
		]);
	});

	it('caps results at MAX_PARSED_TERMINAL_ERRORS', () => {
		const lines = Array.from({ length: MAX_PARSED_TERMINAL_ERRORS + 3 }, (_, i) =>
			`src/file${i}.ts(${i + 1},1): error TS1000: msg${i}`,
		).join('\n');
		const res = parseTerminalErrors({ commandLine: 'tsc', output: lines });
		expect(res).toHaveLength(MAX_PARSED_TERMINAL_ERRORS);
	});

	it('de-duplicates identical file:line:col entries', () => {
		const output = [
			'src/foo.ts(10,5): error TS2322: A',
			'src/foo.ts(10,5): error TS2322: A',
			'src/foo.ts(11,5): error TS2322: B',
		].join('\n');
		const res = parseTerminalErrors({ commandLine: 'tsc', output });
		expect(res).toHaveLength(2);
	});

	describe('tsc', () => {

		it('parses default `path(line,col): error TSxxxx: message` form', () => {
			const output = `src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/bar.ts(3,1): warning TS6133: 'x' is declared but its value is never read.\n`;
			const res = parseTerminalErrors({ commandLine: 'tsc --noEmit', output });
			expect(res).toEqual([
				{ source: 'tsc', file: 'src/foo.ts', line: 10, column: 5, message: `Type 'string' is not assignable to type 'number'.` },
				{ source: 'tsc', file: 'src/bar.ts', line: 3, column: 1, message: `'x' is declared but its value is never read.` },
			]);
		});

		it('parses pretty `path:line:col - error TSxxxx: message` form', () => {
			const output = `src/foo.ts:10:5 - error TS2304: Cannot find name 'foo'.\n`;
			const res = parseTerminalErrors({ commandLine: 'tsc', output });
			expect(res).toEqual([
				{ source: 'tsc', file: 'src/foo.ts', line: 10, column: 5, message: `Cannot find name 'foo'.` },
			]);
		});
	});

	describe('eslint', () => {

		it('parses stylish formatter output', () => {
			const output = [
				'/abs/path/foo.js',
				`  10:5  error  'x' is assigned a value but never used  no-unused-vars`,
				'  12:1  error  Unexpected console statement              no-console',
				'',
				'✖ 2 problems (2 errors, 0 warnings)',
			].join('\n');
			const res = parseTerminalErrors({ commandLine: 'eslint .', output });
			expect(res).toEqual([
				{ source: 'eslint', file: '/abs/path/foo.js', line: 10, column: 5, message: `'x' is assigned a value but never used` },
				{ source: 'eslint', file: '/abs/path/foo.js', line: 12, column: 1, message: 'Unexpected console statement' },
			]);
		});
	});

	describe('python', () => {

		it('parses the deepest traceback frame and exception message', () => {
			const output = [
				'Traceback (most recent call last):',
				'  File "/abs/foo.py", line 10, in <module>',
				'    do_thing()',
				'  File "/abs/bar.py", line 5, in do_thing',
				'    raise ValueError("oops")',
				'ValueError: oops',
			].join('\n');
			const res = parseTerminalErrors({ commandLine: 'python -m mymod', output });
			expect(res).toEqual([
				{ source: 'python', file: '/abs/bar.py', line: 5, message: 'ValueError: oops' },
			]);
		});

		it('falls back to a generic message when no exception line is found', () => {
			const output = '  File "x.py", line 1\n    syntax error\n';
			const res = parseTerminalErrors({ commandLine: 'python x.py', output });
			expect(res).toEqual([
				{ source: 'python', file: 'x.py', line: 1, message: 'Python exception' },
			]);
		});
	});

	describe('pytest', () => {

		it('parses `path:line: ExceptionName` style', () => {
			const output = 'tests/test_foo.py:10: AssertionError\n';
			const res = parseTerminalErrors({ commandLine: 'pytest', output });
			expect(res).toContainEqual({ source: 'pytest', file: 'tests/test_foo.py', line: 10, message: 'AssertionError' });
		});

		it('parses FAILED summary lines', () => {
			const output = 'FAILED tests/test_foo.py::test_bar - AssertionError: assert 1 == 2\n';
			const res = parseTerminalErrors({ commandLine: 'pytest', output });
			expect(res).toContainEqual({ source: 'pytest', file: 'tests/test_foo.py', line: 1, message: 'AssertionError: assert 1 == 2' });
		});
	});

	describe('gcc/clang', () => {

		it('parses error/warning diagnostics with column', () => {
			const output = [
				`src/foo.c:10:5: error: 'undefined_var' undeclared (first use in this function)`,
				`src/bar.cpp:15:10: warning: unused variable 'x'`,
				`src/baz.c:1:1: fatal error: header.h: No such file or directory`,
			].join('\n');
			const res = parseTerminalErrors({ commandLine: 'gcc src/foo.c', output });
			expect(res).toEqual([
				{ source: 'gcc', file: 'src/foo.c', line: 10, column: 5, message: `'undefined_var' undeclared (first use in this function)` },
				{ source: 'gcc', file: 'src/bar.cpp', line: 15, column: 10, message: `unused variable 'x'` },
				{ source: 'gcc', file: 'src/baz.c', line: 1, column: 1, message: 'header.h: No such file or directory' },
			]);
		});
	});

	describe('node', () => {

		it('extracts user frames and the leading exception message', () => {
			const output = [
				'ReferenceError: foo is not defined',
				'    at Object.<anonymous> (/abs/path/script.js:10:5)',
				'    at Module._compile (node:internal/modules/cjs/loader:1218:14)',
				'    at /abs/path/node_modules/lib/index.js:1:1',
			].join('\n');
			const res = parseTerminalErrors({ commandLine: 'node script.js', output });
			expect(res).toEqual([
				{ source: 'node', file: '/abs/path/script.js', line: 10, column: 5, message: 'ReferenceError: foo is not defined' },
			]);
		});
	});

	describe('rustc/cargo', () => {

		it('parses the file/line from a `-->` location after an error block', () => {
			const output = [
				'error[E0425]: cannot find value `foo` in this scope',
				'  --> src/main.rs:5:9',
				'   |',
				'5  |     foo();',
				'   |     ^^^',
			].join('\n');
			const res = parseTerminalErrors({ commandLine: 'cargo build', output });
			expect(res).toEqual([
				{ source: 'rust', file: 'src/main.rs', line: 5, column: 9, message: 'cannot find value `foo` in this scope' },
			]);
		});
	});

	describe('go', () => {

		it('parses standard `path:line:col: message` form', () => {
			const output = './main.go:10:5: undefined: foo\n';
			const res = parseTerminalErrors({ commandLine: 'go build', output });
			expect(res).toEqual([
				{ source: 'go', file: './main.go', line: 10, column: 5, message: 'undefined: foo' },
			]);
		});

		it('parses `path:line: message` (no column)', () => {
			const output = 'pkg/foo.go:10: syntax error\n';
			const res = parseTerminalErrors({ commandLine: 'go test ./...', output });
			expect(res).toEqual([
				{ source: 'go', file: 'pkg/foo.go', line: 10, message: 'syntax error' },
			]);
		});
	});

	describe('fallback (unknown command)', () => {

		it('runs all parsers and finds matches when commandLine is unclassified', () => {
			const output = 'src/foo.ts(1,1): error TS2322: msg';
			const res = parseTerminalErrors({ commandLine: 'npm test', output });
			expect(res).toEqual([
				{ source: 'tsc', file: 'src/foo.ts', line: 1, column: 1, message: 'msg' },
			]);
		});
	});
});
