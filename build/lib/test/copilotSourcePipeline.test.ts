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
import { sourceNpmrc } from '../../azure-pipelines/common/configure-copilot-source-registry.ts';
import { assertCommitSha, copilotSourceVersion, createVscodeSourceMetadata, readCopilotBuildOverrides, RUNTIME_NPM_NAME, SDK_NPM_NAME, type VscodeSourceMetadata } from '../../azure-pipelines/common/copilotSource.ts';
import { assembleRuntimePackages } from '../../azure-pipelines/common/copilotSourcePublish.ts';
import { createProductBuildRequest } from '../../azure-pipelines/common/queue-copilot-product-build.ts';
import { copilotPlatforms, selectedCopilotPlatforms } from '../copilotPlatforms.ts';
import { pnpmVersion, runtimeArtifactName } from '../copilotRuntimeSource.ts';

const RUNTIME_REF = 'a'.repeat(40);
const SDK_REF = 'b'.repeat(40);
const VSCODE_COMMIT = 'c'.repeat(40);
const PIPELINE_PATH = path.join(import.meta.dirname, '../../azure-pipelines/copilot-source-build.yml');
const TOOLCHAIN_PATH = path.join(import.meta.dirname, '../../azure-pipelines/common/install-runtime-build-toolchain.ts');
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

function writeRootPackage(root: string, buildOverrides: object = {
	[SDK_NPM_NAME]: SDK_REF,
	[RUNTIME_NPM_NAME]: RUNTIME_REF,
}): void {
	fs.mkdirSync(root, { recursive: true });
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
		version: '1.134.0',
		buildOverrides,
		dependencies: {
			[SDK_NPM_NAME]: '1.0.10-preview.0',
			[RUNTIME_NPM_NAME]: '1.0.79',
		},
	}));
}

suite('Copilot source pipeline', () => {

	test('requires immutable source commits', () => {
		assert.deepStrictEqual({
			valid: assertCommitSha('a'.repeat(40), 'COPILOT_SDK_SOURCE_REF'),
			branch: errorMessage(() => assertCommitSha('main', 'COPILOT_SDK_SOURCE_REF')),
			uppercase: errorMessage(() => assertCommitSha('A'.repeat(40), 'COPILOT_RUNTIME_SOURCE_REF')),
		}, {
			valid: undefined,
			branch: '[copilot-source] COPILOT_SDK_SOURCE_REF must be a full 40-character lowercase commit SHA.',
			uppercase: '[copilot-source] COPILOT_RUNTIME_SOURCE_REF must be a full 40-character lowercase commit SHA.',
		});
	});

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

	test('pins Zig to the runtime release build version', () => {
		const toolchain = fs.readFileSync(TOOLCHAIN_PATH, 'utf8');
		assert.deepStrictEqual({
			linuxZig: toolchain.includes(`'ziglang==0.13.0'`),
			macosBrewZig: toolchain.includes(`tryRun('brew', ['install', 'zig'])`),
		}, {
			linuxZig: true,
			macosBrewZig: false,
		});
	});

	test('selects runtime targets by operating system', () => {
		assert.deepStrictEqual({
			windows: selectedCopilotPlatforms({ windows: true, linux: false, alpine: false, macos: false }),
			linux: selectedCopilotPlatforms({ windows: false, linux: true, alpine: false, macos: false }),
			alpine: selectedCopilotPlatforms({ windows: false, linux: false, alpine: true, macos: false }),
			none: errorMessage(() => selectedCopilotPlatforms({ windows: false, linux: false, alpine: false, macos: false })),
		}, {
			windows: ['win32-arm64', 'win32-x64'],
			linux: ['linux-arm64', 'linux-x64'],
			alpine: ['linuxmusl-arm64', 'linuxmusl-x64'],
			none: '[copilot-source] At least one runtime operating system must be selected.',
		});
	});

	test('downloads every runtime artifact by name', () => {
		const pipeline = fs.readFileSync(PIPELINE_PATH, 'utf8');
		const downloadedArtifacts = [...pipeline.matchAll(/^\s+artifact: (copilot_runtime_\w+)$/gm)].map(match => match[1]);
		const runtimeFlags = ['WINDOWS', 'LINUX', 'ALPINE', 'MACOS'];
		const productFlags = [...runtimeFlags, 'WEB'];

		assert.deepStrictEqual({
			downloadedArtifacts,
			hasSourceParameters: /COPILOT_(?:SDK|RUNTIME)_SOURCE_REF\s*\n\s*displayName:/.test(pipeline),
			hasProductBranchParameter: /name: VSCODE_PRODUCT_SOURCE_BRANCH/.test(pipeline),
			declaresProductFlags: productFlags.every(flag => pipeline.includes(`name: VSCODE_BUILD_${flag}`)),
			gatesRuntimeJobsAndDownloads: runtimeFlags.every(flag =>
				[...pipeline.matchAll(new RegExp(`if eq\\(parameters\\.VSCODE_BUILD_${flag}, true\\)`, 'g'))].length === 2
			),
		}, {
			downloadedArtifacts: copilotPlatforms.map(runtimeArtifactName),
			hasSourceParameters: false,
			hasProductBranchParameter: false,
			declaresProductFlags: true,
			gatesRuntimeJobsAndDownloads: true,
		});
	});

	test('reads package.json build overrides', () => {
		const root = path.join(workspace, 'root');
		writeRootPackage(root);
		const incompleteRoot = path.join(workspace, 'incomplete');
		writeRootPackage(incompleteRoot, { [SDK_NPM_NAME]: SDK_REF });

		assert.deepStrictEqual({
			overrides: readCopilotBuildOverrides(root),
			incomplete: errorMessage(() => readCopilotBuildOverrides(incompleteRoot)),
		}, {
			overrides: {
				sdkRef: SDK_REF,
				runtimeRef: RUNTIME_REF,
				sdkVersion: '1.0.10-preview.0',
				runtimeVersion: '1.0.79',
				vscodeVersion: '1.134.0',
			},
			incomplete: `[copilot-source] package.json buildOverrides must specify both ${SDK_NPM_NAME} and ${RUNTIME_NPM_NAME}.`,
		});
	});

	test('validates product package provenance against build overrides', () => {
		const root = path.join(workspace, 'root');
		writeRootPackage(root);
		const buildOverrides = readCopilotBuildOverrides(root);
		if (!buildOverrides) {
			throw new Error('Expected Copilot build overrides.');
		}
		const version = copilotSourceVersion('1.134.0', VSCODE_COMMIT);
		const metadataByPackage = new Map<string, VscodeSourceMetadata>([
			[SDK_NPM_NAME, {
				vscodeCommit: VSCODE_COMMIT,
				sourceCommit: SDK_REF,
				sourceVersion: '1.0.10-preview.0',
				sourceBuildId: '465834',
			}],
			[RUNTIME_NPM_NAME, {
				vscodeCommit: VSCODE_COMMIT,
				sourceCommit: RUNTIME_REF,
				sourceVersion: '1.0.79',
				sourceBuildId: '465834',
			}],
		]);
		const readMetadata = (packageName: string): VscodeSourceMetadata => {
			const metadata = metadataByPackage.get(packageName);
			if (!metadata) {
				throw new Error(`Missing test metadata for ${packageName}.`);
			}
			return metadata;
		};

		assert.deepStrictEqual({
			overrides: collectBuildOverrides(buildOverrides, VSCODE_COMMIT, readMetadata),
			queuedCanary: errorMessage(() => collectBuildOverrides(buildOverrides, VSCODE_COMMIT, readMetadata, '1.2.3')),
			mismatch: errorMessage(() => collectBuildOverrides(buildOverrides, VSCODE_COMMIT, packageName => ({
				...readMetadata(packageName),
				sourceCommit: 'd'.repeat(40),
			}))),
		}, {
			overrides: [
				{ name: SDK_NPM_NAME, version },
				{ name: RUNTIME_NPM_NAME, version },
			],
			queuedCanary: '[build-override] package.json buildOverrides cannot be combined with VSCODE_SDK_CANARY_VERSION or VSCODE_CLI_CANARY_VERSION.',
			mismatch: `[build-override] ${SDK_NPM_NAME}@${version} does not match package.json buildOverrides (sourceCommit: expected ${SDK_REF}, got ${'d'.repeat(40)}). Run the Copilot source pipeline: https://dev.azure.com/monacotools/Monaco/_build?definitionId=704`,
		});
	});

	test('uses the VS Code version and commit in source package versions', () => {
		assert.deepStrictEqual({
			version: copilotSourceVersion('1.134.0', VSCODE_COMMIT),
			invalidVersion: errorMessage(() => copilotSourceVersion('^1.134.0', VSCODE_COMMIT)),
			invalidCommit: errorMessage(() => copilotSourceVersion('1.134.0', 'main')),
		}, {
			version: `0.0.0-vscode.1.134.0.g${VSCODE_COMMIT}`,
			invalidVersion: '[copilot-source] VS Code must have an exact semantic version in package.json dependencies.',
			invalidCommit: '[copilot-source] BUILD_SOURCEVERSION must be a full 40-character lowercase commit SHA.',
		});
	});

	test('assembles runtime packages for the internal feed', () => {
		for (const target of copilotPlatforms) {
			writeRuntimeArtifact(target);
		}

		const output = path.join(workspace, 'packages');
		const vscodeSource: VscodeSourceMetadata = {
			vscodeCommit: VSCODE_COMMIT,
			sourceCommit: RUNTIME_REF,
			sourceVersion: '1.0.79',
			sourceBuildId: '123',
		};
		const packageDirs = assembleRuntimePackages(path.join(workspace, 'artifacts'), output, '0.0.0-vscode.123', RUNTIME_REF, vscodeSource);
		const mainManifest = JSON.parse(fs.readFileSync(path.join(output, 'copilot', 'package.json'), 'utf8'));
		const muslManifest = JSON.parse(fs.readFileSync(path.join(output, 'linuxmusl-arm64', 'package.json'), 'utf8'));

		assert.deepStrictEqual({
			packageCount: packageDirs.length,
			main: {
				name: mainManifest.name,
				version: mainManifest.version,
				dependencies: mainManifest.dependencies,
				optionalDependencies: mainManifest.optionalDependencies,
				vscodeSource: mainManifest.vscodeSource,
			},
			musl: {
				name: muslManifest.name,
				version: muslManifest.version,
				os: muslManifest.os,
				cpu: muslManifest.cpu,
				libc: muslManifest.libc,
				exports: muslManifest.exports,
				vscodeSource: muslManifest.vscodeSource,
			},
		}, {
			packageCount: 9,
			main: {
				name: '@github/copilot',
				version: '0.0.0-vscode.123',
				dependencies: { 'detect-libc': '^2.1.2' },
				optionalDependencies: Object.fromEntries(copilotPlatforms.map(target => [`@github/copilot-${target}`, '0.0.0-vscode.123'])),
				vscodeSource,
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
				vscodeSource,
			},
		});
	});

	test('assembles a runtime subset with a complete loader manifest', () => {
		for (const target of copilotPlatforms) {
			writeRuntimeArtifact(target);
		}

		const version = '0.0.0-vscode.123';
		const output = path.join(workspace, 'subset-packages');
		const targets = selectedCopilotPlatforms({ windows: true, linux: false, alpine: false, macos: false });
		const packageDirs = assembleRuntimePackages(path.join(workspace, 'artifacts'), output, version, RUNTIME_REF, {
			vscodeCommit: VSCODE_COMMIT,
			sourceCommit: RUNTIME_REF,
			sourceVersion: '1.0.79',
			sourceBuildId: '123',
		}, targets);
		const mainManifest = JSON.parse(fs.readFileSync(path.join(output, 'copilot', 'package.json'), 'utf8'));

		assert.deepStrictEqual({
			packages: packageDirs.map(packageDir => path.basename(packageDir)),
			optionalDependencies: mainManifest.optionalDependencies,
		}, {
			packages: ['win32-arm64', 'win32-x64', 'copilot'],
			optionalDependencies: Object.fromEntries(copilotPlatforms.map(target => [`@github/copilot-${target}`, version])),
		});
	});

	test('creates package provenance from the root manifest', () => {
		const root = path.join(workspace, 'root');
		writeRootPackage(root);
		assert.deepStrictEqual(createVscodeSourceMetadata(root, SDK_NPM_NAME, VSCODE_COMMIT, SDK_REF, '465834'), {
			vscodeCommit: VSCODE_COMMIT,
			sourceCommit: SDK_REF,
			sourceVersion: '1.0.10-preview.0',
			sourceBuildId: '465834',
		});
	});

	test('rejects a runtime artifact built from another commit', () => {
		for (const target of copilotPlatforms) {
			writeRuntimeArtifact(target);
		}
		writeRuntimeArtifact('linux-x64', 'b'.repeat(40));

		assert.throws(
			() => assembleRuntimePackages(path.join(workspace, 'artifacts'), path.join(workspace, 'packages'), '0.0.0-vscode.123', RUNTIME_REF, {
				vscodeCommit: VSCODE_COMMIT,
				sourceCommit: RUNTIME_REF,
				sourceVersion: '1.0.79',
				sourceBuildId: '123',
			}),
			/copilot_runtime_linux_x64 was built from b{40}, but this build requires a{40}/,
		);
	});

	test('queues the product build with only supported override parameters', () => {
		assert.deepStrictEqual(createProductBuildRequest({
			definitionId: 111,
			sourceBranch: 'feature/copilot-source',
			sourceVersion: VSCODE_COMMIT,
			quality: 'insider',
			registry: 'https://example.test/npm/',
			publish: false,
			release: false,
			windows: true,
			linux: false,
			alpine: true,
			macos: false,
			web: true,
		}), {
			definition: { id: 111 },
			sourceBranch: 'refs/heads/feature/copilot-source',
			sourceVersion: VSCODE_COMMIT,
			templateParameters: {
				VSCODE_QUALITY: 'insider',
				NPM_REGISTRY: 'https://example.test/npm/',
				VSCODE_PUBLISH: false,
				VSCODE_RELEASE: false,
				VSCODE_RUN_ARTIFACT_SANITY_TESTS: true,
				VSCODE_BUILD_WIN32: true,
				VSCODE_BUILD_WIN32_ARM64: true,
				VSCODE_BUILD_LINUX: false,
				VSCODE_BUILD_LINUX_SNAP: false,
				VSCODE_BUILD_LINUX_ARM64: false,
				VSCODE_BUILD_LINUX_ARMHF: false,
				VSCODE_BUILD_ALPINE: true,
				VSCODE_BUILD_ALPINE_ARM64: true,
				VSCODE_BUILD_MACOS: false,
				VSCODE_BUILD_MACOS_ARM64: false,
				VSCODE_BUILD_MACOS_UNIVERSAL: false,
				VSCODE_BUILD_WEB: true,
			},
		});
	});
});
