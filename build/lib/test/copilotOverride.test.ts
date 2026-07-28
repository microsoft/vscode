/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, suite, test } from 'node:test';
import { resolveCopilotOverrides } from '../../azure-pipelines/common/copilotOverride.ts';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const SDK = '@github/copilot-sdk';
const RUNTIME = '@github/copilot';

const tmpDirs: string[] = [];

/** Writes a throwaway repo root whose package.json carries the given `copilotOverride`. */
function rootWith(copilotOverride: unknown): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-override-'));
	tmpDirs.push(dir);
	const pkg = copilotOverride === undefined ? {} : { copilotOverride };
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
	return dir;
}

afterEach(() => {
	while (tmpDirs.length) {
		fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
	}
});

suite('copilotOverride', () => {
	test('a normal build (absent or empty field) yields no overrides', () => {
		assert.deepStrictEqual(resolveCopilotOverrides(rootWith(undefined), {}), []);
		assert.deepStrictEqual(resolveCopilotOverrides(rootWith({ [SDK]: '', [RUNTIME]: '' }), {}), []);
	});

	test('resolves a feed spec and a bare-commit source override', () => {
		const root = rootWith({ [SDK]: '1.2.3', [RUNTIME]: SHA });
		assert.deepStrictEqual(resolveCopilotOverrides(root, {}), [
			{ pkg: 'sdk', npmName: SDK, kind: 'feed', spec: '1.2.3' },
			{ pkg: 'runtime', npmName: RUNTIME, kind: 'git', repo: 'github/copilot-agent-runtime', ref: SHA },
		]);
	});

	test('treats non-hex specs (versions, ranges, dist-tags) as feed overrides', () => {
		for (const spec of ['1.2.3', '^1.2.0', 'latest', 'next']) {
			assert.deepStrictEqual(resolveCopilotOverrides(rootWith({ [SDK]: spec }), {}), [
				{ pkg: 'sdk', npmName: SDK, kind: 'feed', spec },
			]);
		}
	});

	test('rejects hex values that are not a full lowercase 40-char commit SHA', () => {
		for (const value of [SHA.slice(0, 7), SHA.slice(0, 39), SHA.toUpperCase()]) {
			assert.throws(() => resolveCopilotOverrides(rootWith({ [RUNTIME]: value }), {}), /full 40-character lowercase SHA/);
		}
	});

	test('rejects an unknown (misspelled) package name', () => {
		assert.throws(() => resolveCopilotOverrides(rootWith({ '@github/copilot-runtime': SHA }), {}), /Unknown package/);
	});

	test('a queue-time env override wins; a blank env value falls back to package.json', () => {
		const root = rootWith({ [RUNTIME]: SHA });
		assert.deepStrictEqual(resolveCopilotOverrides(root, { VSCODE_COPILOT_RUNTIME: OTHER_SHA }), [
			{ pkg: 'runtime', npmName: RUNTIME, kind: 'git', repo: 'github/copilot-agent-runtime', ref: OTHER_SHA },
		]);
		assert.deepStrictEqual(resolveCopilotOverrides(root, { VSCODE_COPILOT_RUNTIME: '   ' }), [
			{ pkg: 'runtime', npmName: RUNTIME, kind: 'git', repo: 'github/copilot-agent-runtime', ref: SHA },
		]);
	});
});
