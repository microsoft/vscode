/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import * as yauzl from 'yauzl';
import * as crypto from 'crypto';
import { retry } from './retry';
import { BlobServiceClient, BlockBlobParallelUploadOptions, StoragePipelineOptions, StorageRetryPolicyType } from '@azure/storage-blob';
import * as mime from 'mime';
import { CosmosClient } from '@azure/cosmos';
import { ClientSecretCredential } from '@azure/identity';
import { releaseAndProvision } from './prss';

function e(name: string): string {
	const result = process.env[name];

	if (typeof result !== 'string') {
		throw new Error(`Missing env: ${name}`);
	}

	return result;
}

class State {

	private statePath: string;
	private set = new Set<string>();

	constructor() {
		const pipelineWorkspacePath = e('PIPELINE_WORKSPACE');
		const previousState = fs.readdirSync(pipelineWorkspacePath)
			.map(name => /^artifacts_processed_(\d+)$/.exec(name))
			.filter((match): match is RegExpExecArray => !!match)
			.map(match => ({ name: match![0], attempt: Number(match![1]) }))
			.sort((a, b) => b.attempt - a.attempt)[0];

		if (previousState) {
			const previousStatePath = path.join(pipelineWorkspacePath, previousState.name, previousState.name + '.txt');
			fs.readFileSync(previousStatePath, 'utf8').split(/\n/).filter(name => !!name).forEach(name => this.set.add(name));
		}

		const stageAttempt = e('SYSTEM_STAGEATTEMPT');
		this.statePath = path.join(pipelineWorkspacePath, `artifacts_processed_${stageAttempt}`, `artifacts_processed_${stageAttempt}.txt`);
		fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
		fs.writeFileSync(this.statePath, [...this.set.values()].join('\n'));
	}

	get size(): number {
		return this.set.size;
	}

	has(name: string): boolean {
		return this.set.has(name);
	}

	add(name: string): void {
		this.set.add(name);
		fs.appendFileSync(this.statePath, `${name}\n`);
	}

	[Symbol.iterator](): IterableIterator<string> {
		return this.set[Symbol.iterator]();
	}
}

interface Artifact {
	readonly name: string;
	readonly resource: {
		readonly downloadUrl: string;
		readonly properties: {
			readonly artifactsize: number;
		};
	};
}

async function getPipelineArtifacts(): Promise<Artifact[]> {
	const res = await fetch(`${e('BUILDS_API_URL')}artifacts?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });

	if (!res.ok) {
		throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
	}

	const { value: artifacts } = await res.json() as { readonly value: Artifact[] };
	return artifacts.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}

interface TimelineRecord {
	readonly name: string;
	readonly type: string;
	readonly state: string;
}

interface Timeline {
	readonly records: TimelineRecord[];
}

async function getPipelineTimeline(): Promise<Timeline> {
	return await retry(async () => {
		const res = await fetch(`${e('BUILDS_API_URL')}timeline?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });

		if (!res.ok) {
			throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
		}

		const result = await res.json() as Timeline;
		return result;
	});
}

async function downloadArtifact(artifact: Artifact, downloadPath: string): Promise<void> {
	return await retry(async () => {
		const res = await fetch(artifact.resource.downloadUrl, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });

		if (!res.ok) {
			throw new Error(`Failed to download artifact: ${res.statusText}`);
		}

		const istream = Readable.fromWeb(res.body as any);
		const ostream = fs.createWriteStream(downloadPath);
		await finished(istream.pipe(ostream));
	});
}

async function unzip(packagePath: string, outputPath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		let lastFilePath: string | undefined;

		yauzl.open(packagePath, { lazyEntries: true }, (err, zipfile) => {
			if (err) {
				return reject(err);
			}

			zipfile!.on('entry', async entry => {
				if (!/\/$/.test(entry.fileName)) {
					await new Promise((resolve, reject) => {
						zipfile!.openReadStream(entry, async (err, istream) => {
							if (err) {
								return reject(err);
							}

							try {
								const filePath = path.join(outputPath, entry.fileName);
								await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
								const ostream = fs.createWriteStream(filePath);
								await finished(istream!.pipe(ostream));
								lastFilePath = filePath;
								resolve(undefined);
							} catch (err) {
								reject(err);
							}
						});
					});
				}

				zipfile!.readEntry();
			});

			zipfile!.on('end', () => resolve(lastFilePath!));
			zipfile!.readEntry();
		});
	});
}

export class Sequencer {

	private current: Promise<unknown> = Promise.resolve(null);

	queue<T>(promiseTask: () => Promise<T>): Promise<T> {
		return this.current = this.current.then(() => promiseTask(), () => promiseTask());
	}
}

interface Asset {
	platform: string;
	type: string;
	url: string;
	mooncakeUrl?: string;
	prssUrl?: string;
	hash: string;
	sha256hash: string;
	size: number;
	supportsFastUpdate?: boolean;
}

// Contains all of the logic for mapping details to our actual product names in CosmosDB
function getPlatform(product: string, os: string, arch: string, type: string): string {
	switch (os) {
		case 'win32':
			switch (product) {
				case 'client': {
					switch (type) {
						case 'archive':
							return `win32-${arch}-archive`;
						case 'setup':
							return `win32-${arch}`;
						case 'user-setup':
							return `win32-${arch}-user`;
						default:
							throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
				}
				case 'server':
					if (arch === 'arm64') {
						throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
					return `server-win32-${arch}`;
				case 'web':
					if (arch === 'arm64') {
						throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
					return `server-win32-${arch}-web`;
				case 'cli':
					return `cli-win32-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		case 'alpine':
			switch (product) {
				case 'server':
					return `server-alpine-${arch}`;
				case 'web':
					return `server-alpine-${arch}-web`;
				case 'cli':
					return `cli-alpine-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		case 'linux':
			switch (type) {
				case 'snap':
					return `linux-snap-${arch}`;
				case 'archive-unsigned':
					switch (product) {
						case 'client':
							return `linux-${arch}`;
						case 'server':
							return `server-linux-${arch}`;
						case 'web':
							return arch === 'standalone' ? 'web-standalone' : `server-linux-${arch}-web`;
						default:
							throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
					}
				case 'deb-package':
					return `linux-deb-${arch}`;
				case 'rpm-package':
					return `linux-rpm-${arch}`;
				case 'cli':
					return `cli-linux-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		case 'darwin':
			switch (product) {
				case 'client':
					if (arch === 'x64') {
						return 'darwin';
					}
					return `darwin-${arch}`;
				case 'server':
					if (arch === 'x64') {
						return 'server-darwin';
					}
					return `server-darwin-${arch}`;
				case 'web':
					if (arch === 'x64') {
						return 'server-darwin-web';
					}
					return `server-darwin-${arch}-web`;
				case 'cli':
					return `cli-darwin-${arch}`;
				default:
					throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
			}
		default:
			throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
	}
}

// Contains all of the logic for mapping types to our actual types in CosmosDB
function getRealType(type: string) {
	switch (type) {
		case 'user-setup':
			return 'setup';
		case 'deb-package':
		case 'rpm-package':
			return 'package';
		default:
			return type;
	}
}

function hashStream(hashName: string, stream: Readable): Promise<string> {
	return new Promise<string>((c, e) => {
		const shasum = crypto.createHash(hashName);

		stream
			.on('data', shasum.update.bind(shasum))
			.on('error', e)
			.on('close', () => c(shasum.digest('hex')));
	});
}

export async function uploadAssetLegacy(log: (...args: any[]) => void, quality: string, commit: string, filePath: string): Promise<{ blobName: string; assetUrl: string; mooncakeUrl: string }> {
	const fileName = path.basename(filePath);
	const blobName = commit + '/' + fileName;

	const storagePipelineOptions: StoragePipelineOptions = { retryOptions: { retryPolicyType: StorageRetryPolicyType.EXPONENTIAL, maxTries: 6, tryTimeoutInMs: 10 * 60 * 1000 } };

	const credential = new ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
	const blobServiceClient = new BlobServiceClient(`https://vscode.blob.core.windows.net`, credential, storagePipelineOptions);
	const containerClient = blobServiceClient.getContainerClient(quality);
	const blobClient = containerClient.getBlockBlobClient(blobName);

	const blobOptions: BlockBlobParallelUploadOptions = {
		blobHTTPHeaders: {
			blobContentType: mime.lookup(filePath),
			blobContentDisposition: `attachment; filename="${fileName}"`,
			blobCacheControl: 'max-age=31536000, public'
		}
	};

	const uploadPromises: Promise<void>[] = [];

	uploadPromises.push((async (): Promise<void> => {
		log(`Checking for blob in Azure...`);

		if (await retry(() => blobClient.exists())) {
			throw new Error(`Blob ${quality}, ${blobName} already exists, not publishing again.`);
		} else {
			await retry(async (attempt) => {
				log(`Uploading blobs to Azure storage (attempt ${attempt})...`);
				await blobClient.uploadFile(filePath, blobOptions);
				log('Blob successfully uploaded to Azure storage.');
			});
		}
	})());

	const shouldUploadToMooncake = /true/i.test(e('VSCODE_PUBLISH_TO_MOONCAKE'));

	if (shouldUploadToMooncake) {
		const mooncakeCredential = new ClientSecretCredential(e('AZURE_MOONCAKE_TENANT_ID'), e('AZURE_MOONCAKE_CLIENT_ID'), e('AZURE_MOONCAKE_CLIENT_SECRET'));
		const mooncakeBlobServiceClient = new BlobServiceClient(`https://vscode.blob.core.chinacloudapi.cn`, mooncakeCredential, storagePipelineOptions);
		const mooncakeContainerClient = mooncakeBlobServiceClient.getContainerClient(quality);
		const mooncakeBlobClient = mooncakeContainerClient.getBlockBlobClient(blobName);

		uploadPromises.push((async (): Promise<void> => {
			log(`Checking for blob in Mooncake Azure...`);

			if (await retry(() => mooncakeBlobClient.exists())) {
				throw new Error(`Mooncake Blob ${quality}, ${blobName} already exists, not publishing again.`);
			} else {
				await retry(async (attempt) => {
					log(`Uploading blobs to Mooncake Azure storage (attempt ${attempt})...`);
					await mooncakeBlobClient.uploadFile(filePath, blobOptions);
					log('Blob successfully uploaded to Mooncake Azure storage.');
				});
			}
		})());
	}

	const promiseResults = await Promise.allSettled(uploadPromises);
	const rejectedPromiseResults = promiseResults.filter(result => result.status === 'rejected') as PromiseRejectedResult[];

	if (rejectedPromiseResults.length === 0) {
		log('All blobs successfully uploaded.');
	} else if (rejectedPromiseResults[0]?.reason?.message?.includes('already exists')) {
		log(rejectedPromiseResults[0].reason.message);
		log('Some blobs successfully uploaded.');
	} else {
		// eslint-disable-next-line no-throw-literal
		throw rejectedPromiseResults[0]?.reason;
	}

	const assetUrl = `${e('AZURE_CDN_URL')}/${quality}/${blobName}`;
	const blobPath = new URL(assetUrl).pathname;
	const mooncakeUrl = `${e('MOONCAKE_CDN_URL')}${blobPath}`;

	return { blobName, assetUrl, mooncakeUrl };
}

const sequencer = new Sequencer();

export async function processArtifact(product: string, os: string, arch: string, unprocessedType: string, filePath: string): Promise<void> {
	const log = (...args: any[]) => console.log(`[${product} ${os} ${arch} ${unprocessedType}]`, ...args);

	// getPlatform needs the unprocessedType
	const quality = e('VSCODE_QUALITY');
	const commit = e('BUILD_SOURCEVERSION');
	const platform = getPlatform(product, os, arch, unprocessedType);
	const type = getRealType(unprocessedType);

	const stat = await new Promise<fs.Stats>((c, e) => fs.stat(filePath, (err, stat) => err ? e(err) : c(stat)));
	const size = stat.size;

	log('Size:', size);

	const stream = fs.createReadStream(filePath);
	const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);

	log('SHA1:', sha1hash);
	log('SHA256:', sha256hash);

	const [{ blobName, assetUrl, mooncakeUrl }] = await Promise.all([
		sequencer.queue(() => uploadAssetLegacy(log, quality, commit, filePath)),
		releaseAndProvision(
			log,
			e('RELEASE_TENANT_ID'),
			e('RELEASE_CLIENT_ID'),
			e('RELEASE_AUTH_CERT_SUBJECT_NAME'),
			e('RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME'),
			e('PROVISION_TENANT_ID'),
			e('PROVISION_AAD_USERNAME'),
			e('PROVISION_AAD_PASSWORD'),
			commit,
			quality,
			filePath
		)
	]);

	const asset: Asset = {
		platform,
		type,
		url: assetUrl,
		hash: sha1hash,
		mooncakeUrl,
		prssUrl: `${e('PRSS_CDN_URL')}/${quality}/${blobName}`,
		sha256hash,
		size,
		supportsFastUpdate: true
	};

	log('Asset:', JSON.stringify(asset, null, '  '));

	const aadCredentials = new ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
	const client = new CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
	const scripts = client.database('builds').container(quality).scripts;
	await retry(() => scripts.storedProcedure('createAsset').execute('', [commit, asset, true]));

	log(`  Done ✔️`);
	log('Asset successfully created');
}

export async function main() {
	const state = new State();

	for (const name of state) {
		console.log(`Already processed artifact: ${name}`);
	}

	const stages = new Set<string>();
	if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') { stages.add('Windows'); }
	if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') { stages.add('Linux'); }
	if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') { stages.add('Alpine'); }
	if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') { stages.add('macOS'); }
	if (e('VSCODE_BUILD_STAGE_WEB') === 'True') { stages.add('Web'); }

	const publishPromises: Promise<void>[] = [];

	while (true) {
		const artifacts = await getPipelineArtifacts();

		for (const artifact of artifacts) {
			if (!state.has(artifact.name)) {
				const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)_(?<arch>[^_]+)_(?<type>[^_]+)$/.exec(artifact.name);

				if (!match) {
					console.warn('Invalid artifact name:', artifact.name);
					continue;
				}

				let artifactPath: string;

				try {
					console.log(`Processing ${artifact.name} (${artifact.resource.downloadUrl})`);

					const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
					console.log(`Downloading artifact...`);
					await downloadArtifact(artifact, artifactZipPath);

					console.log(`Extracting artifact...`);
					artifactPath = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
					const artifactSize = fs.statSync(artifactPath).size;

					if (artifactSize !== Number(artifact.resource.properties.artifactsize)) {
						throw new Error(`Artifact size mismatch. Expected ${artifact.resource.properties.artifactsize}. Actual ${artifactSize}`);
					}
				} catch (err) {
					console.error(err);
					continue;
				}

				const { product, os, arch, type } = match.groups!;
				console.log('Submitting artifact for publish:', { path: artifactPath, product, os, arch, type });
				publishPromises.push(processArtifact(product, os, arch, type, artifactPath));

				state.add(artifact.name);
			}
		}

		const [timeline, artifacts2] = await Promise.all([getPipelineTimeline(), getPipelineArtifacts()]);
		const stagesCompleted = new Set<string>(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));

		if (stagesCompleted.size === stages.size && artifacts2.length === state.size) {
			break;
		}

		console.log(`Stages completed: ${stagesCompleted.size}/${stages.size}`);
		console.log(`Artifacts processed: ${state.size}/${artifacts2.length}`);

		await new Promise(c => setTimeout(c, 10_000));
	}

	console.log(`Waiting for all artifacts to be published...`);
	await Promise.all(publishPromises);

	console.log(`All ${state.size} artifacts published!`);
}

if (require.main === module) {
	const [] = process.argv.slice(2);

	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
