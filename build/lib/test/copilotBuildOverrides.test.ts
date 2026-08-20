/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { collectBuildOverrides } from '../../azure-pipelines/common/apply-sdk-canary-override.ts';
import { copilotSourceVersion, readCopilotBuildOverrides, RUNTIME_NPM_NAME, SDK_NPM_NAME, type VscodeSourceMetadata } from '../../azure-pipelines/common/copilotSource.ts';

const sdkRef = 'a'.repeat(40);
const runtimeRef = 'b'.repeat(40);
const vscodeCommit = 'c'.repeat(40);
let workspace: string;

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-build-overrides-'));
	fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({
		version: '1.135.0',
		dependencies: {
			[SDK_NPM_NAME]: '1.0.11',
			[RUNTIME_NPM_NAME]: '1.0.81-0',
		},
		buildOverrides: {
			[SDK_NPM_NAME]: sdkRef,
			[RUNTIME_NPM_NAME]: runtimeRef,
		},
	}));
});

afterEach(() => {
	fs.rmSync(workspace, { recursive: true, force: true });
});

suite('Copilot build overrides', () => {
	test('derives deterministic package versions and validates provenance', () => {
		const overrides = readCopilotBuildOverrides(workspace);
		assert.ok(overrides);
		const version = copilotSourceVersion(overrides.vscodeVersion, vscodeCommit);
		const metadata = new Map<string, VscodeSourceMetadata>([
			[SDK_NPM_NAME, { vscodeCommit, sourceCommit: sdkRef, sourceVersion: '1.0.11', sourceBuildId: '466393' }],
			[RUNTIME_NPM_NAME, { vscodeCommit, sourceCommit: runtimeRef, sourceVersion: '1.0.81-0', sourceBuildId: '466393' }],
		]);

		assert.deepStrictEqual({
			version,
			overrides: collectBuildOverrides(overrides, vscodeCommit, packageName => metadata.get(packageName)!),
		}, {
			version: `0.0.0-vscode.1.135.0.g${vscodeCommit}`,
			overrides: [
				{ name: SDK_NPM_NAME, version },
				{ name: RUNTIME_NPM_NAME, version },
			],
		});
	});

	test('rejects incomplete buildOverrides', () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
		delete manifest.buildOverrides[RUNTIME_NPM_NAME];
		fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify(manifest));
		assert.throws(() => readCopilotBuildOverrides(workspace), /must specify both/);
	});
});
