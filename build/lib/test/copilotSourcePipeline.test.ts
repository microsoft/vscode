/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { sourceNpmrc } from '../../azure-pipelines/common/configure-copilot-source-registry.ts';
import { assembleRuntimePackages } from '../../azure-pipelines/common/copilotSourcePublish.ts';
import { createProductBuildRequest } from '../../azure-pipelines/common/queue-copilot-product-build.ts';
import { copilotSourceVersion } from '../../azure-pipelines/common/set-copilot-source-version.ts';
import { copilotPlatforms } from '../copilotPlatforms.ts';
import { pnpmVersion, runtimeArtifactName } from '../copilotRuntimeSource.ts';

const RUNTIME_REF = 'a'.repeat(40);
let workspace: string;

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-source-pipeline-'));
});

afterEach(() => {
	fs.rmSync(workspace, { recursive: true, force: true });
});

function writeRuntimeArtifact(target: string, ref = RUNTIME_REF): void {
	const dir = path.join(workspace, 'artifacts', runtimeArtifactName(target));
	fs.mkdirSync(path.join(dir, 'sdk'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'index.js'), '// runtime\n');
	fs.writeFileSync(path.join(dir, 'npm-loader.js'), '// loader\n');
	fs.writeFileSync(path.join(dir, 'sdk', 'index.js'), '// sdk\n');
	fs.writeFileSync(path.join(dir, 'sdk', 'index.d.ts'), 'export { };\n');
	fs.writeFileSync(path.join(dir, '.copilot-source-complete'), ref);
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
		name: '@github/copilot',
		version: '0.0.0-dev',
		type: 'module',
		dependencies: { 'detect-libc': '^2.1.2' },
		files: ['index.js', 'npm-loader.js', 'sdk'],
	}));
}

function errorMessage(callback: () => void): string {
	try {
		callback();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error('Expected callback to throw.');
}

suite('Copilot source pipeline', () => {

	test('writes queue-time registry values without shell interpretation', () => {
		assert.deepStrictEqual({
			npmrc: sourceNpmrc('https://example.test/npm/;echo-not-a-command'),
			insecureRegistry: errorMessage(() => sourceNpmrc('http://example.test/npm/')),
		}, {
			npmrc: 'registry=https://example.test/npm/;echo-not-a-command\nalways-auth=true\n',
			insecureRegistry: '[copilot-source-registry] Registry must use HTTPS: http://example.test/npm/',
		});
	});

	test('extracts the runtime-pinned pnpm version', () => {
		assert.deepStrictEqual({
			version: pnpmVersion('pnpm@11.5.2+sha512.abc123'),
			prerelease: pnpmVersion('pnpm@12.0.0-rc.1'),
			unsupported: errorMessage(() => pnpmVersion('yarn@1.22.22')),
		}, {
			version: '11.5.2',
			prerelease: '12.0.0-rc.1',
			unsupported: '[copilot-runtime-source] Unsupported packageManager "yarn@1.22.22". Expected pnpm@<semver>.',
		});
	});

	test('uses the VS Code version and pipeline build ID in source package versions', () => {
		assert.deepStrictEqual({
			version: copilotSourceVersion('1.134.0', '464620'),
			invalidVersion: errorMessage(() => copilotSourceVersion('1.134.0-insider', '464620')),
			invalidBuildId: errorMessage(() => copilotSourceVersion('1.134.0', '20260818.1')),
		}, {
			version: '0.0.0-vscode.1.134.0.464620',
			invalidVersion: '[copilot-source-version] Invalid VS Code package version "1.134.0-insider". Expected a numeric major.minor.patch version.',
			invalidBuildId: '[copilot-source-version] Invalid Azure Pipelines build ID "20260818.1". Expected a non-negative integer.',
		});
	});

	test('assembles runtime packages for the internal feed', () => {
		for (const target of copilotPlatforms) {
			writeRuntimeArtifact(target);
		}

		const output = path.join(workspace, 'packages');
		const packageDirs = assembleRuntimePackages(path.join(workspace, 'artifacts'), output, '0.0.0-vscode.123', RUNTIME_REF);
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

	test('rejects a runtime artifact built from another commit', () => {
		for (const target of copilotPlatforms) {
			writeRuntimeArtifact(target);
		}
		writeRuntimeArtifact('linux-x64', 'b'.repeat(40));

		assert.throws(
			() => assembleRuntimePackages(path.join(workspace, 'artifacts'), path.join(workspace, 'packages'), '0.0.0-vscode.123', RUNTIME_REF),
			/copilot_runtime_linux_x64 was built from b{40}, but this build requires a{40}/,
		);
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
