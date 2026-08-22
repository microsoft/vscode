/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { collectBuildOverrides, resolveSourcePackageVersion } from '../../azure-pipelines/common/apply-sdk-canary-override.ts';
import { readCopilotBuildOverrides, RUNTIME_NPM_NAME, SDK_NPM_NAME, type VscodeSourceMetadata } from '../../azure-pipelines/common/copilotSource.ts';

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
	test('resolves package-specific source versions and validates provenance', () => {
		const overrides = readCopilotBuildOverrides(workspace);
		assert.ok(overrides);
		const sdkVersion = `1.0.12-vscode.g${sdkRef}`;
		const runtimeVersion = `1.0.81-vscode.g${runtimeRef}`;
		const metadata = new Map<string, VscodeSourceMetadata>([
			[SDK_NPM_NAME, { vscodeCommit, sourceCommit: sdkRef, sourceVersion: '1.0.11', sourceBuildId: '466393' }],
			[RUNTIME_NPM_NAME, { vscodeCommit, sourceCommit: runtimeRef, sourceVersion: '1.0.81-0', sourceBuildId: '466393' }],
		]);

		assert.deepStrictEqual(collectBuildOverrides(
			overrides,
			vscodeCommit,
			packageName => metadata.get(packageName)!,
			'',
			'',
			packageName => packageName === SDK_NPM_NAME ? sdkVersion : runtimeVersion,
			() => undefined,
		), [
			{ name: SDK_NPM_NAME, version: sdkVersion },
			{ name: RUNTIME_NPM_NAME, version: runtimeVersion },
		]);
	});

	test('requires exactly one published version for each source hash', () => {
		assert.equal(resolveSourcePackageVersion(SDK_NPM_NAME, sdkRef, [
			'1.0.11',
			`1.0.12-vscode.g${sdkRef}`,
		]), `1.0.12-vscode.g${sdkRef}`);
		assert.throws(() => resolveSourcePackageVersion(SDK_NPM_NAME, sdkRef, []), /found 0/);
		assert.throws(() => resolveSourcePackageVersion(SDK_NPM_NAME, sdkRef, [
			`1.0.11-vscode.g${sdkRef}`,
			`1.0.12-vscode.g${sdkRef}`,
		]), /found 2/);
	});

	test('rejects incomplete buildOverrides', () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
		delete manifest.buildOverrides[RUNTIME_NPM_NAME];
		fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify(manifest));
		assert.throws(() => readCopilotBuildOverrides(workspace), /must specify both/);
	});
});
