/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { basename, dirname, join } from '../../../base/common/path.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { extract } from '../../../base/node/zip.js';
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL, ILocalTranscriptionModelImportResult } from '../common/localTranscription.js';

const MODEL_PUBLISHER = 'Microsoft';
const MODEL_VARIANT = `${DEFAULT_LOCAL_TRANSCRIPTION_MODEL}-generic-cpu`;
const INFERENCE_MODEL_FILE = 'inference_model.json';
const GENAI_CONFIG_FILE = 'genai_config.json';
const OCI_TITLE_ANNOTATION = 'org.opencontainers.image.title';

interface IOciDescriptor {
	readonly digest: string;
	readonly annotations?: Record<string, string>;
}

interface IOciIndex {
	readonly manifests?: readonly IOciDescriptor[];
}

interface IOciManifest {
	readonly layers?: readonly IOciDescriptor[];
}

interface IPreparedModel {
	readonly version: number;
	readonly versionDirectory: string;
	readonly canMove: boolean;
}

/**
 * Imports the official Foundry Local expansion pack (ZIP or extracted OCI
 * layout), or an already prepared model directory, into the model cache.
 */
export async function importFoundryLocalModel(sourcePath: string, cacheDir: string): Promise<ILocalTranscriptionModelImportResult> {
	const sourceStat = await fs.stat(sourcePath);
	await fs.mkdir(cacheDir, { recursive: true });
	const workDirectory = await fs.mkdtemp(join(cacheDir, '.dictation-model-import-'));

	try {
		const prepared = sourceStat.isDirectory()
			? await prepareModelSource(sourcePath, workDirectory, false)
			: await prepareModelArchive(sourcePath, workDirectory);
		await verifyPreparedModel(prepared.versionDirectory);
		await installPreparedModel(prepared, cacheDir);
		return { model: DEFAULT_LOCAL_TRANSCRIPTION_MODEL, version: prepared.version };
	} finally {
		await fs.rm(workDirectory, { recursive: true, force: true });
	}
}

async function prepareModelArchive(sourcePath: string, workDirectory: string): Promise<IPreparedModel> {
	if (!sourcePath.toLowerCase().endsWith('.zip')) {
		throw new Error('The selected dictation model package must be a ZIP archive or a folder.');
	}

	const extracted = join(workDirectory, 'archive');
	await extract(sourcePath, extracted, {}, CancellationToken.None);
	return prepareModelSource(extracted, workDirectory, true);
}

async function prepareModelSource(sourcePath: string, workDirectory: string, canMove: boolean): Promise<IPreparedModel> {
	const nestedPackage = (await findNamedFiles(sourcePath, 'Package.zip'))[0];
	if (nestedPackage) {
		const extractedPackage = join(workDirectory, 'package');
		await extract(nestedPackage, extractedPackage, {}, CancellationToken.None);
		if (canMove) {
			await fs.rm(sourcePath, { recursive: true, force: true });
		}
		sourcePath = extractedPackage;
		canMove = true;
	}

	const ociIndex = await findOciIndex(sourcePath);
	if (ociIndex) {
		return materializeOciModel(ociIndex, workDirectory, canMove);
	}

	return findPreparedModel(sourcePath, canMove);
}

async function findOciIndex(root: string): Promise<string | undefined> {
	for (const candidate of await findNamedFiles(root, 'index.json')) {
		try {
			const layout = JSON.parse(await fs.readFile(join(dirname(candidate), 'oci-layout'), 'utf8')) as { imageLayoutVersion?: string };
			if (layout.imageLayoutVersion) {
				return candidate;
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
	}
	return undefined;
}

async function materializeOciModel(indexPath: string, workDirectory: string, canMove: boolean): Promise<IPreparedModel> {
	const ociRoot = dirname(indexPath);
	const index = JSON.parse(await fs.readFile(indexPath, 'utf8')) as IOciIndex;
	if (!index.manifests?.length) {
		throw new Error('The selected dictation model package has no OCI manifest.');
	}
	for (const descriptor of index.manifests) {
		const manifest = JSON.parse((await readVerifiedOciBlob(ociRoot, descriptor.digest)).toString('utf8')) as IOciManifest;
		const titledLayers = manifest.layers?.filter(layer => layer.annotations?.[OCI_TITLE_ANNOTATION]);
		if (!titledLayers?.length) {
			continue;
		}

		let version: number | undefined;
		const materializedRoot = join(workDirectory, 'materialized');
		for (const layer of titledLayers) {
			const title = layer.annotations?.[OCI_TITLE_ANNOTATION];
			if (!title) {
				continue;
			}
			const match = /^v(?<version>[1-9]\d*)\/(?<path>.+)$/.exec(title);
			if (!match?.groups?.version || !match.groups.path) {
				throw new Error(`Invalid model file path in the OCI package: ${title}`);
			}
			const layerVersion = Number(match.groups.version);
			if (version !== undefined && version !== layerVersion) {
				throw new Error('The selected dictation model package contains multiple model versions.');
			}
			version = layerVersion;

			const pathSegments = match.groups.path.split('/');
			if (pathSegments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
				throw new Error(`Invalid model file path in the OCI package: ${title}`);
			}

			const target = join(materializedRoot, `v${version}`, ...pathSegments);
			await fs.mkdir(dirname(target), { recursive: true });
			const blob = resolveOciBlob(ociRoot, layer.digest);
			await verifyOciBlob(blob);
			if (canMove) {
				await fs.rename(blob.path, target);
			} else {
				await fs.copyFile(blob.path, target);
			}
		}

		if (version !== undefined) {
			const versionDirectory = join(materializedRoot, `v${version}`);
			await assertMaterializedIdentity(versionDirectory, version);
			await writeInferenceModel(versionDirectory, version);
			return { version, versionDirectory, canMove: true };
		}
	}

	throw new Error('The selected package does not contain a dictation model OCI payload.');
}

function resolveOciBlob(ociRoot: string, digest: string): { readonly path: string; readonly hash: string } {
	const match = /^sha256:(?<hash>[a-fA-F0-9]{64})$/.exec(digest);
	if (!match?.groups?.hash) {
		throw new Error(`Unsupported OCI digest: ${digest}`);
	}
	const hash = match.groups.hash.toLowerCase();
	return { path: join(ociRoot, 'blobs', 'sha256', hash), hash };
}

/** Read a (small) OCI blob into memory and verify it against its content digest. */
async function readVerifiedOciBlob(ociRoot: string, digest: string): Promise<Buffer> {
	const blob = resolveOciBlob(ociRoot, digest);
	const contents = await fs.readFile(blob.path);
	if (createHash('sha256').update(contents).digest('hex') !== blob.hash) {
		throw new Error('The selected model package is corrupt (checksum mismatch).');
	}
	return contents;
}

/** Verify a blob against its content digest by streaming it (no full buffering). */
async function verifyOciBlob(blob: { readonly path: string; readonly hash: string }): Promise<void> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(blob.path)) {
		hash.update(chunk as Buffer);
	}
	if (hash.digest('hex') !== blob.hash) {
		throw new Error('The selected model package is corrupt (checksum mismatch).');
	}
}

/**
 * Interpret a Foundry Local `inference_model.json` `Name`. Returns the model
 * version when the name identifies the supported nemotron CPU model, throws when
 * it names a *different* model, and returns `undefined` when there is no name to
 * check (a truly unlabeled package we accept on trust).
 */
function modelVersionFromName(name: string | undefined): number | undefined {
	if (!name) {
		return undefined;
	}
	const match = new RegExp(`^${MODEL_VARIANT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(?<version>[1-9]\\d*)$`).exec(name);
	if (!match?.groups?.version) {
		throw new Error(`The selected package is not the ${DEFAULT_LOCAL_TRANSCRIPTION_MODEL} CPU model.`);
	}
	return Number(match.groups.version);
}

/**
 * Guard the OCI path against mislabeling: if the materialized payload already
 * carries an `inference_model.json`, it must identify the supported model at
 * this version before we (re)write our own scanner metadata over it. A payload
 * with no embedded identity is accepted on trust.
 */
async function assertMaterializedIdentity(versionDirectory: string, version: number): Promise<void> {
	let metadata: { Name?: string };
	try {
		metadata = JSON.parse(await fs.readFile(join(versionDirectory, INFERENCE_MODEL_FILE), 'utf8'));
	} catch {
		return;
	}
	const named = modelVersionFromName(metadata.Name);
	if (named !== undefined && named !== version) {
		throw new Error('The selected package identifies a different model version than its files.');
	}
}

async function findPreparedModel(root: string, canMove: boolean): Promise<IPreparedModel> {
	const inferenceModel = (await findNamedFiles(root, INFERENCE_MODEL_FILE))[0];
	if (inferenceModel) {
		const metadata = JSON.parse(await fs.readFile(inferenceModel, 'utf8')) as { Name?: string };
		const version = modelVersionFromName(metadata.Name);
		if (version === undefined) {
			throw new Error(`The selected folder is not the ${DEFAULT_LOCAL_TRANSCRIPTION_MODEL} CPU model.`);
		}
		const versionDirectory = dirname(inferenceModel);
		if (basename(versionDirectory) !== `v${version}`) {
			throw new Error(`The model files must be stored in a v${version} folder.`);
		}
		return { version, versionDirectory, canMove };
	}

	const genaiConfig = (await findNamedFiles(root, GENAI_CONFIG_FILE))[0];
	if (genaiConfig) {
		const versionDirectory = dirname(genaiConfig);
		const match = /^v(?<version>[1-9]\d*)$/.exec(basename(versionDirectory));
		if (!match?.groups?.version) {
			throw new Error('The model files must be stored in a version folder such as v3.');
		}
		return { version: Number(match.groups.version), versionDirectory, canMove };
	}

	throw new Error('The selected package does not contain a supported dictation model.');
}

async function verifyPreparedModel(versionDirectory: string): Promise<void> {
	const entries = await fs.readdir(versionDirectory, { withFileTypes: true });
	const hasOnnxModel = entries.some(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.onnx'));
	if (!hasOnnxModel) {
		throw new Error('The selected dictation model is missing its ONNX model files.');
	}
	try {
		JSON.parse(await fs.readFile(join(versionDirectory, GENAI_CONFIG_FILE), 'utf8'));
	} catch {
		throw new Error(`The selected dictation model has a missing or invalid ${GENAI_CONFIG_FILE}.`);
	}
}

async function installPreparedModel(model: IPreparedModel, cacheDir: string): Promise<void> {
	const publisherDirectory = join(cacheDir, MODEL_PUBLISHER);
	await fs.mkdir(publisherDirectory, { recursive: true });
	const modelDirectoryName = `${MODEL_VARIANT}-${model.version}`;
	const target = join(publisherDirectory, modelDirectoryName);
	const staged = join(publisherDirectory, `.${modelDirectoryName}.staged-${randomUUID()}`);
	const backup = join(publisherDirectory, `.${modelDirectoryName}.backup-${randomUUID()}`);
	const stagedVersion = join(staged, `v${model.version}`);

	try {
		if (model.canMove) {
			await fs.mkdir(staged, { recursive: true });
			await fs.rename(model.versionDirectory, stagedVersion);
		} else {
			await copyDirectory(model.versionDirectory, stagedVersion);
		}
		await writeInferenceModel(stagedVersion, model.version);
		await replaceDirectory(staged, target, backup);
	} finally {
		// Only the staging area is always safe to remove. The backup is owned by
		// `replaceDirectory`: it is deleted there once the swap succeeds and is
		// otherwise the sole surviving copy of a previously working model, so it
		// must never be force-removed here (a failed rollback would lose it).
		await fs.rm(staged, { recursive: true, force: true });
	}
}

async function replaceDirectory(staged: string, target: string, backup: string): Promise<void> {
	let movedExisting = false;
	try {
		await fs.rename(target, backup);
		movedExisting = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}

	try {
		await fs.rename(staged, target);
	} catch (error) {
		if (movedExisting) {
			await fs.rename(backup, target);
		}
		throw error;
	}

	if (movedExisting) {
		await fs.rm(backup, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	}
}

async function copyDirectory(source: string, target: string): Promise<void> {
	await fs.mkdir(target, { recursive: true });
	for (const entry of await fs.readdir(source, { withFileTypes: true })) {
		const sourceEntry = join(source, entry.name);
		const targetEntry = join(target, entry.name);
		if (entry.isDirectory()) {
			await copyDirectory(sourceEntry, targetEntry);
		} else if (entry.isFile()) {
			await fs.copyFile(sourceEntry, targetEntry);
		} else {
			throw new Error(`Unsupported model package entry: ${entry.name}`);
		}
	}
}

async function writeInferenceModel(versionDirectory: string, version: number): Promise<void> {
	await fs.writeFile(join(versionDirectory, INFERENCE_MODEL_FILE), JSON.stringify({
		Name: `${MODEL_VARIANT}:${version}`,
		PromptTemplate: null,
	}, undefined, 2));
}

async function findNamedFiles(root: string, name: string): Promise<string[]> {
	const matches: string[] = [];
	const directories = [root];
	while (directories.length) {
		const directory = directories.pop()!;
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const entryPath = join(directory, entry.name);
			if (entry.isDirectory()) {
				directories.push(entryPath);
			} else if (entry.isFile() && entry.name === name) {
				matches.push(entryPath);
			}
		}
	}
	return matches.sort();
}
