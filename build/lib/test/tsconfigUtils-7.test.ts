/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { getTargetStringFromTsConfig } from '../tsconfigUtils-7.ts';

suite('TypeScript 7 tsconfig utilities', () => {
	let directory: string;
	let configFilePath: string;

	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsconfig-utils-7-'));
		configFilePath = path.join(directory, 'tsconfig.json');
	});

	afterEach(() => {
		fs.rmSync(directory, { recursive: true, force: true });
	});

	for (const [target, expected] of [['ES2024', 'ES2024'], ['es6', 'ES2015'], ['ESNext', 'Latest']]) {
		test(`resolves ${target}`, () => {
			fs.writeFileSync(configFilePath, JSON.stringify({ compilerOptions: { target }, files: [] }));
			assert.equal(getTargetStringFromTsConfig(configFilePath), expected);
		});
	}

	test('inherits and overrides a target from a relative base config', () => {
		fs.writeFileSync(configFilePath, JSON.stringify({ compilerOptions: { target: 'ES2022' }, files: [] }));
		const childDirectory = path.join(directory, 'child');
		fs.mkdirSync(childDirectory);
		const childConfig = path.join(childDirectory, 'tsconfig.json');
		fs.writeFileSync(childConfig, JSON.stringify({ extends: '../tsconfig.json' }));
		const inherited = getTargetStringFromTsConfig(childConfig);
		fs.writeFileSync(childConfig, JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { target: 'ES2024' } }));
		const overridden = getTargetStringFromTsConfig(childConfig);
		assert.deepStrictEqual({ inherited, overridden }, { inherited: 'ES2022', overridden: 'ES2024' });
	});

	test('accepts a relative config path and JSON comments', () => {
		fs.writeFileSync(configFilePath, '{\n// target for the build\n"compilerOptions": { "target": "ES2020", }, "files": []\n}');
		assert.equal(getTargetStringFromTsConfig(path.relative(process.cwd(), configFilePath)), 'ES2020');
	});

	test('reports an unreadable config', () => {
		assert.throws(() => getTargetStringFromTsConfig(configFilePath), /Cannot determine target.*Cannot read file/);
	});

	test('reports malformed config JSON', () => {
		fs.writeFileSync(configFilePath, '{ "compilerOptions": { "target": "ES2024" }');
		assert.throws(() => getTargetStringFromTsConfig(configFilePath), /Cannot determine target/);
	});

	test('reports a missing target', () => {
		fs.writeFileSync(configFilePath, JSON.stringify({ compilerOptions: {}, files: [] }));
		assert.throws(() => getTargetStringFromTsConfig(configFilePath), /Could not resolve target/);
	});
});
