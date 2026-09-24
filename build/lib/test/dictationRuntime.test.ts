/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import {
	fetchDependencyLibraries,
	getStandardArtifacts,
	type IFoundryDependencyVersions,
	normalizeOrtLibraryName,
	requiredDependencyLibraryNames,
} from '../../dictation-runtime/nuget.ts';
import { buildTarball } from '../../dictation-runtime/package.ts';

const dependencies: IFoundryDependencyVersions = {
	onnxruntime: { version: '1.28.0' },
	'onnxruntime-genai': { version: '0.15.2' },
};

suite('dictation runtime', () => {
	test('uses the Foundry Local 2.x dependency artifact set', () => {
		assert.deepStrictEqual(getStandardArtifacts(dependencies), [
			{ name: 'Microsoft.ML.OnnxRuntime', version: '1.28.0' },
			{ name: 'Microsoft.ML.OnnxRuntimeGenAI.Foundry', version: '0.15.2' },
		]);
	});

	test('requires the platform-specific 2.x dependency names', () => {
		assert.deepStrictEqual({
			linux: requiredDependencyLibraryNames('linux-x64', dependencies),
			darwin: requiredDependencyLibraryNames('darwin-arm64', dependencies),
			win32: requiredDependencyLibraryNames('win32-arm64', dependencies),
		}, {
			linux: ['libonnxruntime.so.1', 'libonnxruntime-genai.so'],
			darwin: ['libonnxruntime.1.dylib', 'libonnxruntime-genai.dylib'],
			win32: ['onnxruntime.dll', 'onnxruntime-genai.dll'],
		});
	});

	test('normalizes the Linux ONNX Runtime soname', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-runtime-test-'));
		try {
			fs.writeFileSync(path.join(directory, 'libonnxruntime.so'), 'runtime');
			normalizeOrtLibraryName(directory, 'linux-x64', dependencies.onnxruntime.version);
			assert.deepStrictEqual(fs.readdirSync(directory), ['libonnxruntime.so.1']);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	test('skips downloads when normalized dependency libraries are present', async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-runtime-test-'));
		try {
			for (const target of ['linux-x64', 'darwin-arm64']) {
				const targetDirectory = path.join(directory, target);
				fs.mkdirSync(targetDirectory);
				for (const name of requiredDependencyLibraryNames(target, dependencies)) {
					fs.writeFileSync(path.join(targetDirectory, name), 'runtime');
				}
				await fetchDependencyLibraries(target, getStandardArtifacts(dependencies), targetDirectory, { feeds: [], skipIfPresent: true });
			}
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	test('builds reproducible tarballs regardless of directory enumeration order', async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-runtime-test-'));
		try {
			const stagingDirectory = path.join(directory, 'staging');
			const targetDirectory = path.join(stagingDirectory, 'prebuilds', 'linux-x64');
			fs.mkdirSync(targetDirectory, { recursive: true });
			fs.writeFileSync(path.join(targetDirectory, 'z.node'), 'addon');
			fs.writeFileSync(path.join(targetDirectory, 'a.so'), 'runtime');

			const ascendingTarball = path.join(directory, 'ascending.tgz');
			const descendingTarball = path.join(directory, 'descending.tgz');
			await buildTarball(stagingDirectory, ascendingTarball, currentDirectory => fs.readdirSync(currentDirectory, { withFileTypes: true }));
			await buildTarball(stagingDirectory, descendingTarball, currentDirectory => fs.readdirSync(currentDirectory, { withFileTypes: true }).reverse());

			assert.deepStrictEqual(fs.readFileSync(descendingTarball), fs.readFileSync(ascendingTarball));
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});
