/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { zip } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL } from '../../common/localTranscription.js';
import { importFoundryLocalModel } from '../../node/foundryLocalModelImport.js';

suite('FoundryLocalModelImport', () => {
	let testDirectory: string;
	let cacheDirectory: string;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		testDirectory = getRandomTestPath(tmpdir(), 'vsctests', 'foundry-model-import');
		cacheDirectory = join(testDirectory, 'cache');
		await fs.promises.mkdir(testDirectory, { recursive: true });
	});

	teardown(() => fs.promises.rm(testDirectory, { recursive: true, force: true }));

	test('imports a prepared model directory and creates scanner metadata', async () => {
		const source = join(testDirectory, 'prepared', 'v4');
		await fs.promises.mkdir(source, { recursive: true });
		await fs.promises.writeFile(join(source, 'genai_config.json'), '{}');
		await fs.promises.writeFile(join(source, 'encoder.onnx'), 'model');

		const staleTarget = modelVersionDirectory(cacheDirectory, 4);
		await fs.promises.mkdir(staleTarget, { recursive: true });
		await fs.promises.writeFile(join(staleTarget, 'stale'), 'old');

		const result = await importFoundryLocalModel(source, cacheDirectory);
		const target = modelVersionDirectory(cacheDirectory, 4);
		const metadata = JSON.parse(await fs.promises.readFile(join(target, 'inference_model.json'), 'utf8'));

		assert.deepStrictEqual({
			result,
			files: (await fs.promises.readdir(target)).sort(),
			metadata,
		}, {
			result: { model: DEFAULT_LOCAL_TRANSCRIPTION_MODEL, version: 4 },
			files: ['encoder.onnx', 'genai_config.json', 'inference_model.json'],
			metadata: {
				Name: `${DEFAULT_LOCAL_TRANSCRIPTION_MODEL}-generic-cpu:4`,
				PromptTemplate: null,
			},
		});
	});

	test('imports the official nested expansion-pack OCI layout', async () => {
		const packageZip = join(testDirectory, 'Package.zip');
		const configContents = '{}';
		const modelContents = 'model';
		const configDigest = digest(configContents);
		const modelDigest = digest(modelContents);
		const ociPrefix = 'payload/oci/models/foundry-local/nemotron/cpu-onnx';
		const manifest = {
			layers: [
				{ digest: configDigest, annotations: { 'org.opencontainers.image.title': 'v3/genai_config.json' } },
				{ digest: modelDigest, annotations: { 'org.opencontainers.image.title': 'v3/encoder.onnx' } },
			],
		};
		const manifestContents = JSON.stringify(manifest);
		const manifestDigest = digest(manifestContents);
		await zip(packageZip, [
			{ path: `${ociPrefix}/oci-layout`, contents: JSON.stringify({ imageLayoutVersion: '1.0.0' }) },
			{ path: `${ociPrefix}/index.json`, contents: JSON.stringify({ manifests: [{ digest: manifestDigest }] }) },
			{ path: `${ociPrefix}/blobs/sha256/${manifestDigest.slice('sha256:'.length)}`, contents: manifestContents },
			{ path: `${ociPrefix}/blobs/sha256/${configDigest.slice('sha256:'.length)}`, contents: configContents },
			{ path: `${ociPrefix}/blobs/sha256/${modelDigest.slice('sha256:'.length)}`, contents: modelContents },
		]);

		const expansionPack = join(testDirectory, 'model.zip');
		await zip(expansionPack, [
			{ path: 'Manifest.xml', contents: '<Package />' },
			{ path: 'Package.zip', localPath: packageZip },
		]);

		const result = await importFoundryLocalModel(expansionPack, cacheDirectory);
		const target = modelVersionDirectory(cacheDirectory, 3);

		assert.deepStrictEqual({
			result,
			files: (await fs.promises.readdir(target)).sort(),
		}, {
			result: { model: DEFAULT_LOCAL_TRANSCRIPTION_MODEL, version: 3 },
			files: ['encoder.onnx', 'genai_config.json', 'inference_model.json'],
		});
	});

	test('rejects OCI layer paths that escape the model version directory', async () => {
		const source = join(testDirectory, 'oci');
		const modelContents = 'model';
		const modelDigest = digest(modelContents);
		const manifestContents = JSON.stringify({
			layers: [{
				digest: modelDigest,
				annotations: { 'org.opencontainers.image.title': 'v3/../outside.onnx' },
			}],
		});
		const manifestDigest = digest(manifestContents);
		await fs.promises.mkdir(join(source, 'blobs', 'sha256'), { recursive: true });
		await fs.promises.writeFile(join(source, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }));
		await fs.promises.writeFile(join(source, 'index.json'), JSON.stringify({ manifests: [{ digest: manifestDigest }] }));
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', manifestDigest.slice('sha256:'.length)), manifestContents);
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', modelDigest.slice('sha256:'.length)), modelContents);

		await assert.rejects(
			importFoundryLocalModel(source, cacheDirectory),
			/Invalid model file path/,
		);
		assert.strictEqual(fs.existsSync(join(cacheDirectory, 'Microsoft')), false);
	});

	test('rejects an OCI package whose embedded metadata names a different model', async () => {
		const source = join(testDirectory, 'oci-wrong-model');
		const configContents = '{}';
		const inferenceContents = JSON.stringify({ Name: 'some-other-model-generic-cpu:3' });
		const configDigest = digest(configContents);
		const inferenceDigest = digest(inferenceContents);
		const manifestContents = JSON.stringify({
			layers: [
				{ digest: configDigest, annotations: { 'org.opencontainers.image.title': 'v3/genai_config.json' } },
				{ digest: inferenceDigest, annotations: { 'org.opencontainers.image.title': 'v3/inference_model.json' } },
			],
		});
		const manifestDigest = digest(manifestContents);
		await fs.promises.mkdir(join(source, 'blobs', 'sha256'), { recursive: true });
		await fs.promises.writeFile(join(source, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }));
		await fs.promises.writeFile(join(source, 'index.json'), JSON.stringify({ manifests: [{ digest: manifestDigest }] }));
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', manifestDigest.slice('sha256:'.length)), manifestContents);
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', configDigest.slice('sha256:'.length)), configContents);
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', inferenceDigest.slice('sha256:'.length)), inferenceContents);

		await assert.rejects(
			importFoundryLocalModel(source, cacheDirectory),
			new RegExp(`not the ${DEFAULT_LOCAL_TRANSCRIPTION_MODEL}`),
		);
		assert.strictEqual(fs.existsSync(join(cacheDirectory, 'Microsoft')), false);
	});

	test('rejects an OCI package with a blob that fails its checksum', async () => {
		const source = join(testDirectory, 'oci-corrupt');
		const configContents = '{}';
		const modelContents = 'model';
		const configDigest = digest(configContents);
		const modelDigest = digest(modelContents);
		const manifestContents = JSON.stringify({
			layers: [
				{ digest: configDigest, annotations: { 'org.opencontainers.image.title': 'v3/genai_config.json' } },
				{ digest: modelDigest, annotations: { 'org.opencontainers.image.title': 'v3/encoder.onnx' } },
			],
		});
		const manifestDigest = digest(manifestContents);
		await fs.promises.mkdir(join(source, 'blobs', 'sha256'), { recursive: true });
		await fs.promises.writeFile(join(source, 'oci-layout'), JSON.stringify({ imageLayoutVersion: '1.0.0' }));
		await fs.promises.writeFile(join(source, 'index.json'), JSON.stringify({ manifests: [{ digest: manifestDigest }] }));
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', manifestDigest.slice('sha256:'.length)), manifestContents);
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', configDigest.slice('sha256:'.length)), configContents);
		// Content that does not hash to the digest used as its blob filename.
		await fs.promises.writeFile(join(source, 'blobs', 'sha256', modelDigest.slice('sha256:'.length)), 'tampered');

		await assert.rejects(
			importFoundryLocalModel(source, cacheDirectory),
			/corrupt/,
		);
		assert.strictEqual(fs.existsSync(join(cacheDirectory, 'Microsoft')), false);
	});

	test('rejects prepared directories for other models', async () => {
		const source = join(testDirectory, 'prepared', 'v3');
		await fs.promises.mkdir(source, { recursive: true });
		await fs.promises.writeFile(join(source, 'genai_config.json'), '{}');
		await fs.promises.writeFile(join(source, 'encoder.onnx'), 'model');
		await fs.promises.writeFile(join(source, 'inference_model.json'), JSON.stringify({ Name: 'other-model:3' }));

		await assert.rejects(
			importFoundryLocalModel(source, cacheDirectory),
			new RegExp(`not the ${DEFAULT_LOCAL_TRANSCRIPTION_MODEL}`),
		);
	});
});

function modelVersionDirectory(cacheDirectory: string, version: number): string {
	return join(
		cacheDirectory,
		'Microsoft',
		`${DEFAULT_LOCAL_TRANSCRIPTION_MODEL}-generic-cpu-${version}`,
		`v${version}`,
	);
}

function digest(contents: string): string {
	return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}
