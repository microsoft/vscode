/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import * as glob from '../../vs/base/common/glob';
import { combineGlob } from '../glob';

suite('combineGlob', () => {

	/** Matches the way a combined glob is ultimately consumed, as a VS Code search exclude. */
	function matches(pattern: string, files: string[]): string[] {
		return files.filter(file => glob.match(pattern, file));
	}

	test('combines two plain globs', () => {
		expect(combineGlob('**/*.ts', '**/*.js')).toBe('{**/*.ts,**/*.js}');
	});

	test('flattens a brace group rather than dropping its patterns', () => {
		// A multi pattern content exclusion arrives as a single brace group. Stripping it, or
		// nesting it, silently stops it excluding anything.
		expect(combineGlob('**/node_modules/**', '{**/secrets/**,**/*.pem}'))
			.toBe('{**/node_modules/**,**/secrets/**,**/*.pem}');
	});

	test('flattens brace groups on both sides', () => {
		expect(combineGlob('{a.ts,b.ts}', '{c.js,d.js}')).toBe('{a.ts,b.ts,c.js,d.js}');
	});

	test('keeps every input pattern matchable by the search glob engine', () => {
		const combined = combineGlob('**/node_modules/**', '{secrets/keys.ts,config.pem}');

		expect(matches(combined, ['node_modules/x.js', 'secrets/keys.ts', 'config.pem', 'src/index.ts']))
			.toEqual(['node_modules/x.js', 'secrets/keys.ts', 'config.pem']);
	});

	test('leaves a glob whose braces are not a single wrapping group intact', () => {
		// Splitting `{a,b}{c,d}` on its top level comma would change what it matches.
		expect(combineGlob('{a,b}{c,d}', '*.ts')).toBe('{{a,b}{c,d},*.ts}');
	});

	test('leaves a glob that merely starts and ends with a brace group intact', () => {
		expect(combineGlob('{a,b}/x/{c,d}', '*.ts')).toBe('{{a,b}/x/{c,d},*.ts}');
	});

	test('does not split a comma nested inside an inner group', () => {
		expect(combineGlob('{a,{b,c}}', '*.ts')).toBe('{a,{b,c},*.ts}');
	});

	test('leaves a suffixed brace group intact', () => {
		expect(combineGlob('{a,b}.ts', '*.js')).toBe('{{a,b}.ts,*.js}');
	});
});
