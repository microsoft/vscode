/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { checkLayerViolations, getRule, type ILayerViolation, type IRule } from '../../checker/layersChecker.ts';

suite('layersChecker', () => {
	let rootPath: string;
	let tsconfigPath: string;

	const rules: IRule[] = [
		{ target: '**/test/**', skip: true },
		{ target: '**/browser/**', disallowedTypes: ['ForbiddenService'] },
	];

	beforeEach(() => {
		rootPath = mkdtempSync(join(tmpdir(), '.layers-checker-'));
		tsconfigPath = join(rootPath, 'tsconfig.json');
		writeFileSync(tsconfigPath, JSON.stringify({
			compilerOptions: {
				module: 'nodenext',
				moduleResolution: 'nodenext',
				noEmit: true,
				skipLibCheck: true,
			},
			include: ['**/*.ts'],
			exclude: ['**/test/**'],
		}));
	});

	afterEach(() => {
		rmSync(rootPath, { recursive: true, force: true });
	});

	test('matches rules relative to a hidden parent path', () => {
		const fileName = join(rootPath, 'vs', 'feature', 'browser', 'feature.ts');

		assert.strictEqual(getRule(fileName, rootPath, rules), rules[1]);
	});

	test('excludes skipped root files from the program', () => {
		writeForbiddenService();
		writeSource('vs/feature/test/feature.test.ts', `
			import { ForbiddenService } from '../../platform/common/service.js';
			export const service: ForbiddenService | undefined = undefined;
		`);

		assert.deepStrictEqual(getViolations(), []);
	});

	test('detects aliased forbidden types', () => {
		writeForbiddenService();
		writeSource('vs/feature/browser/feature.ts', `
			import { ForbiddenService as Service } from '../../platform/common/service.js';
			export const service: Service | undefined = undefined;
		`);

		assert.deepStrictEqual(getViolations(), [
			{ type: 'ForbiddenService', fileName: 'vs/feature/browser/feature.ts', line: 2, character: 13 },
			{ type: 'ForbiddenService', fileName: 'vs/feature/browser/feature.ts', line: 2, character: 33 },
			{ type: 'ForbiddenService', fileName: 'vs/feature/browser/feature.ts', line: 3, character: 26 },
		]);
	});

	test('detects members of inferred forbidden types', () => {
		writeForbiddenService();
		writeSource('vs/feature/browser/feature.ts', `
			import { getService } from '../../platform/common/service.js';
			getService().run();
		`);

		assert.deepStrictEqual(getViolations(), [
			{ type: 'ForbiddenService', fileName: 'vs/feature/browser/feature.ts', line: 3, character: 17 },
		]);
	});

	function writeForbiddenService(): void {
		writeSource('vs/platform/common/service.ts', `
			export interface ForbiddenService { run(): void }
			export declare function getService(): ForbiddenService;
		`);
	}

	function writeSource(relativePath: string, contents: string): string {
		const fileName = join(rootPath, relativePath);
		mkdirSync(dirname(fileName), { recursive: true });
		writeFileSync(fileName, contents);
		return fileName;
	}

	function getViolations(): Pick<ILayerViolation, 'type' | 'fileName' | 'line' | 'character'>[] {
		return checkLayerViolations(tsconfigPath, rootPath, rules).map(violation => ({
			type: violation.type,
			fileName: violation.fileName.slice(rootPath.length + 1).replaceAll('\\', '/'),
			line: violation.line,
			character: violation.character,
		}));
	}
});
