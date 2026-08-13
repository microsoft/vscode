/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { assembleRuntimePackages } from '../../azure-pipelines/common/copilotSourcePublish.ts';
import { createProductBuildRequest } from '../../azure-pipelines/common/queue-copilot-product-build.ts';
import { copilotPlatforms } from '../copilotPlatforms.ts';
import { runtimeArtifactName } from '../copilotRuntimeSource.ts';

let workspace: string;

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-source-pipeline-'));
});

afterEach(() => {
	fs.rmSync(workspace, { recursive: true, force: true });
});

function writeRuntimeArtifact(target: string): void {
	const dir = path.join(workspace, 'artifacts', runtimeArtifactName(target));
	fs.mkdirSync(path.join(dir, 'sdk'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'index.js'), '// runtime\n');
	fs.writeFileSync(path.join(dir, 'npm-loader.js'), '// loader\n');
	fs.writeFileSync(path.join(dir, 'sdk', 'index.js'), '// sdk\n');
	fs.writeFileSync(path.join(dir, 'sdk', 'index.d.ts'), 'export { };\n');
	fs.writeFileSync(path.join(dir, '.copilot-source-complete'), 'a'.repeat(40));
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
		name: '@github/copilot',
		version: '0.0.0-dev',
		type: 'module',
		dependencies: { 'detect-libc': '^2.1.2' },
		files: ['index.js', 'npm-loader.js', 'sdk'],
	}));
}

suite('Copilot source pipeline', () => {

	test('assembles runtime packages for the internal feed', () => {
		for (const target of copilotPlatforms) {
			writeRuntimeArtifact(target);
		}

		const output = path.join(workspace, 'packages');
		const packageDirs = assembleRuntimePackages(path.join(workspace, 'artifacts'), output, '0.0.0-vscode.123');
		const mainManifest = JSON.parse(fs.readFileSync(path.join(output, 'copilot', 'package.json'), 'utf8'));
		const muslManifest = JSON.parse(fs.readFileSync(path.join(output, 'linuxmusl-arm64', 'package.json'), 'utf8'));

		assert.deepStrictEqual({
			packageCount: packageDirs.length,
			main: {
				name: mainManifest.name,
				version: mainManifest.version,
				dependencies: mainManifest.dependencies,
				optionalDependencies: mainManifest.optionalDependencies,
			},
			musl: {
				name: muslManifest.name,
				version: muslManifest.version,
				os: muslManifest.os,
				cpu: muslManifest.cpu,
				libc: muslManifest.libc,
				exports: muslManifest.exports,
			},
		}, {
			packageCount: 9,
			main: {
				name: '@github/copilot',
				version: '0.0.0-vscode.123',
				dependencies: { 'detect-libc': '^2.1.2' },
				optionalDependencies: Object.fromEntries(copilotPlatforms.map(target => [`@github/copilot-${target}`, '0.0.0-vscode.123'])),
			},
			musl: {
				name: '@github/copilot-linuxmusl-arm64',
				version: '0.0.0-vscode.123',
				os: ['linux'],
				cpu: ['arm64'],
				libc: ['musl'],
				exports: {
					'.': './index.js',
					'./sdk': {
						types: './sdk/index.d.ts',
						import: './sdk/index.js',
					},
				},
			},
		});
	});

	test('queues the product build with only supported override parameters', () => {
		assert.deepStrictEqual(createProductBuildRequest({
			definitionId: 111,
			sourceBranch: 'feature/copilot-source',
			quality: 'insider',
			registry: 'https://example.test/npm/',
			sdkVersion: '0.0.0-vscode.123',
			runtimeVersion: '0.0.0-vscode.123',
			publish: false,
			release: false,
		}), {
			definition: { id: 111 },
			sourceBranch: 'refs/heads/feature/copilot-source',
			templateParameters: {
				VSCODE_QUALITY: 'insider',
				NPM_REGISTRY: 'https://example.test/npm/',
				VSCODE_SDK_CANARY_VERSION: '0.0.0-vscode.123',
				VSCODE_CLI_CANARY_VERSION: '0.0.0-vscode.123',
				VSCODE_PUBLISH: false,
				VSCODE_RELEASE: false,
			},
		});
	});
});
