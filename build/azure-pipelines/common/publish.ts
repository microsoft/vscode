/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import * as crypto from 'crypto';
import { retry } from './retry';
import { CosmosClient } from '@azure/cosmos';
import { ClientSecretCredential } from '@azure/identity';
import * as cp from 'child_process';
import * as os from 'os';
import { Worker, isMainThread, workerData } from 'node:worker_threads';

function e(name: string): string {
	const result = process.env[name];

	if (typeof result !== 'string') {
		throw new Error(`Missing env: ${name}`);
	}

	return result;
}

class Temp {
	private _files: string[] = [];

	tmpNameSync(): string {
		const file = path.join(os.tmpdir(), crypto.randomBytes(20).toString('hex'));
		this._files.push(file);
		return file;
	}

	dispose(): void {
		for (const file of this._files) {
			try {
				fs.unlinkSync(file);
			} catch (err) {
				// noop
			}
		}
	}
}

/**
 * Gets an access token converted from a WIF/OIDC id token.
 * We need this since this build job takes a while to run and while id tokens live for 10 minutes only, access tokens live for 24 hours.
 * Source: https://goodworkaround.com/2021/12/21/another-deep-dive-into-azure-ad-workload-identity-federation-using-github-actions/
 */
export async function getAccessToken(endpoint: string, tenantId: string, clientId: string, idToken: string): Promise<string> {
	const body = new URLSearchParams({
		scope: `${endpoint}.default`,
		client_id: clientId,
		grant_type: 'client_credentials',
		client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
		client_assertion: encodeURIComponent(idToken)
	});

	const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: body.toString()
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const aadToken = await response.json();
	return aadToken.access_token;
}

interface RequestOptions {
	readonly body?: string;
}

interface CreateProvisionedFilesSuccessResponse {
	IsSuccess: true;
	ErrorDetails: null;
}

interface CreateProvisionedFilesErrorResponse {
	IsSuccess: false;
	ErrorDetails: {
		Code: string;
		Category: string;
		Message: string;
		CanRetry: boolean;
		AdditionalProperties: Record<string, string>;
	};
}

type CreateProvisionedFilesResponse = CreateProvisionedFilesSuccessResponse | CreateProvisionedFilesErrorResponse;

function isCreateProvisionedFilesErrorResponse(response: unknown): response is CreateProvisionedFilesErrorResponse {
	return (response as CreateProvisionedFilesErrorResponse)?.ErrorDetails?.Code !== undefined;
}

class ProvisionService {

	constructor(
		private readonly log: (...args: any[]) => void,
		private readonly accessToken: string
	) { }

	async provision(releaseId: string, fileId: string, fileName: string) {
		const body = JSON.stringify({
			ReleaseId: releaseId,
			PortalName: 'VSCode',
			PublisherCode: 'VSCode',
			ProvisionedFilesCollection: [{
				PublisherKey: fileId,
				IsStaticFriendlyFileName: true,
				FriendlyFileName: fileName,
				MaxTTL: '1440',
				CdnMappings: ['ECN']
			}]
		});

		this.log(`Provisioning ${fileName} (releaseId: ${releaseId}, fileId: ${fileId})...`);
		const res = await retry(() => this.request<CreateProvisionedFilesResponse>('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body }));

		if (isCreateProvisionedFilesErrorResponse(res) && res.ErrorDetails.Code === 'FriendlyFileNameAlreadyProvisioned') {
			this.log(`File already provisioned (most likley due to a re-run), skipping: ${fileName}`);
			return;
		}

		if (!res.IsSuccess) {
			throw new Error(`Failed to submit provisioning request: ${JSON.stringify(res.ErrorDetails)}`);
		}

		this.log(`Successfully provisioned ${fileName}`);
	}

	private async request<T>(method: string, url: string, options?: RequestOptions): Promise<T> {
		const opts: RequestInit = {
			method,
			body: options?.body,
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json'
			}
		};

		const res = await fetch(`https://dsprovisionapi.microsoft.com${url}`, opts);


		// 400 normally means the request is bad or something is already provisioned, so we will return as retries are useless
		// Otherwise log the text body and headers. We do text because some responses are not JSON.
		if ((!res.ok || res.status < 200 || res.status >= 500) && res.status !== 400) {
			throw new Error(`Unexpected status code: ${res.status}\nResponse Headers: ${JSON.stringify(res.headers)}\nBody Text: ${await res.text()}`);
		}

		return await res.json();
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

interface Release {
	readonly releaseId: string;
	readonly fileId: string;
}

interface SubmitReleaseResult {
	submissionResponse: {
		operationId: string;
		statusCode: string;
	};
}

interface ReleaseDetailsResult {
	releaseDetails: [{
		fileDetails: [{ publisherKey: string }];
		statusCode: 'inprogress' | 'pass';
	}];
}

class ESRPClient {

	private readonly authPath: string;

	constructor(
		private readonly log: (...args: any[]) => void,
		private readonly tmp: Temp,
		tenantId: string,
		clientId: string,
		authCertSubjectName: string,
		requestSigningCertSubjectName: string,
	) {
		this.authPath = this.tmp.tmpNameSync();
		fs.writeFileSync(this.authPath, JSON.stringify({
			Version: '1.0.0',
			AuthenticationType: 'AAD_CERT',
			TenantId: tenantId,
			ClientId: clientId,
			AuthCert: {
				SubjectName: authCertSubjectName,
				StoreLocation: 'LocalMachine',
				StoreName: 'My',
				SendX5c: 'true'
			},
			RequestSigningCert: {
				SubjectName: requestSigningCertSubjectName,
				StoreLocation: 'LocalMachine',
				StoreName: 'My'
			}
		}));
	}

	async release(
		version: string,
		filePath: string
	): Promise<Release> {
		this.log(`Submitting release for ${version}: ${filePath}`);
		const submitReleaseResult = await this.SubmitRelease(version, filePath);

		if (submitReleaseResult.submissionResponse.statusCode !== 'pass') {
			throw new Error(`Unexpected status code: ${submitReleaseResult.submissionResponse.statusCode}`);
		}

		const releaseId = submitReleaseResult.submissionResponse.operationId;
		this.log(`Successfully submitted release ${releaseId}. Polling for completion...`);

		let details!: ReleaseDetailsResult;

		// Poll every 5 seconds, wait 60 minutes max -> poll 60/5*60=720 times
		for (let i = 0; i < 720; i++) {
			details = await this.ReleaseDetails(releaseId);

			if (details.releaseDetails[0].statusCode === 'pass') {
				break;
			} else if (details.releaseDetails[0].statusCode !== 'inprogress') {
				throw new Error(`Failed to submit release: ${JSON.stringify(details)}`);
			}

			await new Promise(c => setTimeout(c, 5000));
		}

		if (details.releaseDetails[0].statusCode !== 'pass') {
			throw new Error(`Timed out waiting for release ${releaseId}: ${JSON.stringify(details)}`);
		}

		const fileId = details.releaseDetails[0].fileDetails[0].publisherKey;
		this.log('Release completed successfully with fileId: ', fileId);

		return { releaseId, fileId };
	}

	private async SubmitRelease(
		version: string,
		filePath: string
	): Promise<SubmitReleaseResult> {
		const policyPath = this.tmp.tmpNameSync();
		fs.writeFileSync(policyPath, JSON.stringify({
			Version: '1.0.0',
			Audience: 'InternalLimited',
			Intent: 'distribution',
			ContentType: 'InstallPackage'
		}));

		const inputPath = this.tmp.tmpNameSync();
		const size = fs.statSync(filePath).size;
		const istream = fs.createReadStream(filePath);
		const sha256 = await hashStream('sha256', istream);
		fs.writeFileSync(inputPath, JSON.stringify({
			Version: '1.0.0',
			ReleaseInfo: {
				ReleaseMetadata: {
					Title: 'VS Code',
					Properties: {
						ReleaseContentType: 'InstallPackage'
					},
					MinimumNumberOfApprovers: 1
				},
				ProductInfo: {
					Name: 'VS Code',
					Version: version,
					Description: path.basename(filePath, path.extname(filePath)),
				},
				Owners: [
					{
						Owner: {
							UserPrincipalName: 'jomo@microsoft.com'
						}
					}
				],
				Approvers: [
					{
						Approver: {
							UserPrincipalName: 'jomo@microsoft.com'
						},
						IsAutoApproved: true,
						IsMandatory: false
					}
				],
				AccessPermissions: {
					MainPublisher: 'VSCode',
					ChannelDownloadEntityDetails: {
						Consumer: ['VSCode']
					}
				},
				CreatedBy: {
					UserPrincipalName: 'jomo@microsoft.com'
				}
			},
			ReleaseBatches: [
				{
					ReleaseRequestFiles: [
						{
							SizeInBytes: size,
							SourceHash: sha256,
							HashType: 'SHA256',
							SourceLocation: path.basename(filePath)
						}
					],
					SourceLocationType: 'UNC',
					SourceRootDirectory: path.dirname(filePath),
					DestinationLocationType: 'AzureBlob'
				}
			]
		}));

		const outputPath = this.tmp.tmpNameSync();
		cp.execSync(`ESRPClient SubmitRelease -a ${this.authPath} -p ${policyPath} -i ${inputPath} -o ${outputPath}`, { stdio: 'inherit' });

		const output = fs.readFileSync(outputPath, 'utf8');
		return JSON.parse(output) as SubmitReleaseResult;
	}

	private async ReleaseDetails(
		releaseId: string
	): Promise<ReleaseDetailsResult> {
		const inputPath = this.tmp.tmpNameSync();
		fs.writeFileSync(inputPath, JSON.stringify({
			Version: '1.0.0',
			OperationIds: [releaseId]
		}));

		const outputPath = this.tmp.tmpNameSync();
		cp.execSync(`ESRPClient ReleaseDetails -a ${this.authPath} -i ${inputPath} -o ${outputPath}`, { stdio: 'inherit' });

		const output = fs.readFileSync(outputPath, 'utf8');
		return JSON.parse(output) as ReleaseDetailsResult;
	}
}

async function releaseAndProvision(
	log: (...args: any[]) => void,
	releaseTenantId: string,
	releaseClientId: string,
	releaseAuthCertSubjectName: string,
	releaseRequestSigningCertSubjectName: string,
	provisionTenantId: string,
	provisionAADUsername: string,
	provisionAADPassword: string,
	version: string,
	quality: string,
	filePath: string
): Promise<string> {
	const fileName = `${quality}/${version}/${path.basename(filePath)}`;
	const result = `${e('PRSS_CDN_URL')}/${fileName}`;

	const res = await retry(() => fetch(result));

	if (res.status === 200) {
		log(`Already released and provisioned: ${result}`);
		return result;
	}

	const tmp = new Temp();
	process.on('exit', () => tmp.dispose());

	const esrpclient = new ESRPClient(log, tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
	const release = await esrpclient.release(version, filePath);

	const credential = new ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
	const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
	const service = new ProvisionService(log, accessToken.token);
	await service.provision(release.releaseId, release.fileId, fileName);

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
		fs.writeFileSync(this.statePath, [...this.set.values()].map(name => `${name}\n`).join(''));
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

const azdoFetchOptions = {
	headers: {
		// Pretend we're a web browser to avoid download rate limits
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
		'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
		'Accept-Encoding': 'gzip, deflate, br',
		'Accept-Language': 'en-US,en;q=0.9',
		'Referer': 'https://dev.azure.com',
		Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}`
	}
};

async function requestAZDOAPI<T>(path: string): Promise<T> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 2 * 60 * 1000);

	try {
		const res = await fetch(`${e('BUILDS_API_URL')}${path}?api-version=6.0`, { ...azdoFetchOptions, signal: abortController.signal });

		if (!res.ok) {
			throw new Error(`Unexpected status code: ${res.status}`);
		}

		return await res.json();
	} finally {
		clearTimeout(timeout);
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
	const result = await requestAZDOAPI<{ readonly value: Artifact[] }>('artifacts');
	return result.value.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}

interface Timeline {
	readonly records: {
		readonly name: string;
		readonly type: string;
		readonly state: string;
	}[];
}

async function getPipelineTimeline(): Promise<Timeline> {
	return await requestAZDOAPI<Timeline>('timeline');
}

async function downloadArtifact(artifact: Artifact, downloadPath: string): Promise<void> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 4 * 60 * 1000);

	try {
		const res = await fetch(artifact.resource.downloadUrl, { ...azdoFetchOptions, signal: abortController.signal });

		if (!res.ok) {
			throw new Error(`Unexpected status code: ${res.status}`);
		}

		await pipeline(Readable.fromWeb(res.body as ReadableStream), fs.createWriteStream(downloadPath));
	} finally {
		clearTimeout(timeout);
	}
}

async function unzip(packagePath: string, outputPath: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		yauzl.open(packagePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
			if (err) {
				return reject(err);
			}

			const result: string[] = [];
			zipfile!.on('entry', entry => {
				if (/\/$/.test(entry.fileName)) {
					zipfile!.readEntry();
				} else {
					zipfile!.openReadStream(entry, (err, istream) => {
						if (err) {
							return reject(err);
						}

						const filePath = path.join(outputPath, entry.fileName);
						fs.mkdirSync(path.dirname(filePath), { recursive: true });

						const ostream = fs.createWriteStream(filePath);
						ostream.on('finish', () => {
							result.push(filePath);
							zipfile!.readEntry();
						});
						istream?.on('error', err => reject(err));
						istream!.pipe(ostream);
					});
				}
			});

			zipfile!.on('close', () => resolve(result));
			zipfile!.readEntry();
		});
	});
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
function getPlatform(product: string, os: string, arch: string, type: string, isLegacy: boolean): string {
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
					return `server-win32-${arch}`;
				case 'web':
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
							return isLegacy ? `server-linux-legacy-${arch}` : `server-linux-${arch}`;
						case 'web':
							if (arch === 'standalone') {
								return 'web-standalone';
							}
							return isLegacy ? `server-linux-legacy-${arch}-web` : `server-linux-${arch}-web`;
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

async function processArtifact(artifact: Artifact, artifactFilePath: string, cosmosDBAccessToken: string): Promise<void> {
	const log = (...args: any[]) => console.log(`[${artifact.name}]`, ...args);
	const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)(?:_legacy)?_(?<arch>[^_]+)_(?<unprocessedType>[^_]+)$/.exec(artifact.name);

	if (!match) {
		throw new Error(`Invalid artifact name: ${artifact.name}`);
	}

	// getPlatform needs the unprocessedType
	const quality = e('VSCODE_QUALITY');
	const commit = e('BUILD_SOURCEVERSION');
	const { product, os, arch, unprocessedType } = match.groups!;
	const isLegacy = artifact.name.includes('_legacy');
	const platform = getPlatform(product, os, arch, unprocessedType, isLegacy);
	const type = getRealType(unprocessedType);
	const size = fs.statSync(artifactFilePath).size;
	const stream = fs.createReadStream(artifactFilePath);
	const [hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]); // CodeQL [SM04514] Using SHA1 only for legacy reasons, we are actually only respecting SHA256

	const url = await releaseAndProvision(
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
		artifactFilePath
	);

	const asset: Asset = { platform, type, url, hash, sha256hash, size, supportsFastUpdate: true };
	log('Creating asset...', JSON.stringify(asset, undefined, 2));

	await retry(async (attempt) => {
		log(`Creating asset in Cosmos DB (attempt ${attempt})...`);
		const client = new CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT')!, tokenProvider: () => Promise.resolve(`type=aad&ver=1.0&sig=${cosmosDBAccessToken}`) });
		const scripts = client.database('builds').container(quality).scripts;
		await scripts.storedProcedure('createAsset').execute('', [commit, asset, true]);
	});

	log('Asset successfully created');
}

// It is VERY important that we don't download artifacts too much too fast from AZDO.
// AZDO throttles us SEVERELY if we do. Not just that, but they also close open
// sockets, so the whole things turns to a grinding halt. So, downloading and extracting
// happens serially in the main thread, making the downloads are spaced out
// properly. For each extracted artifact, we spawn a worker thread to upload it to
// the CDN and finally update the build in Cosmos DB.
async function main() {
	if (!isMainThread) {
		const { artifact, artifactFilePath, cosmosDBAccessToken } = workerData;
		await processArtifact(artifact, artifactFilePath, cosmosDBAccessToken);
		return;
	}

	const done = new State();
	const processing = new Set<string>();

	for (const name of done) {
		console.log(`\u2705 ${name}`);
	}

	const stages = new Set<string>(['Compile', 'CompileCLI']);
	if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') { stages.add('Windows'); }
	if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') { stages.add('Linux'); }
	if (e('VSCODE_BUILD_STAGE_LINUX_LEGACY_SERVER') === 'True') { stages.add('LinuxLegacyServer'); }
	if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') { stages.add('Alpine'); }
	if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') { stages.add('macOS'); }
	if (e('VSCODE_BUILD_STAGE_WEB') === 'True') { stages.add('Web'); }

	let resultPromise = Promise.resolve<PromiseSettledResult<void>[]>([]);
	const operations: { name: string; operation: Promise<void> }[] = [];
	const cosmosDBAccessToken = await getAccessToken(e('AZURE_DOCUMENTDB_ENDPOINT')!, e('AZURE_TENANT_ID')!, e('AZURE_CLIENT_ID')!, e('AZURE_ID_TOKEN')!);

	while (true) {
		const [timeline, artifacts] = await Promise.all([retry(() => getPipelineTimeline()), retry(() => getPipelineArtifacts())]);
		const stagesCompleted = new Set<string>(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));
		const stagesInProgress = [...stages].filter(s => !stagesCompleted.has(s));
		const artifactsInProgress = artifacts.filter(a => processing.has(a.name));

		if (stagesInProgress.length === 0 && artifacts.length === done.size + processing.size) {
			break;
		} else if (stagesInProgress.length > 0) {
			console.log('Stages in progress:', stagesInProgress.join(', '));
		} else if (artifactsInProgress.length > 0) {
			console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
		} else {
			console.log(`Waiting for a total of ${artifacts.length}, ${done.size} done, ${processing.size} in progress...`);
		}

		for (const artifact of artifacts) {
			if (done.has(artifact.name) || processing.has(artifact.name)) {
				continue;
			}

			console.log(`[${artifact.name}] Found new artifact`);

			const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);

			await retry(async (attempt) => {
				const start = Date.now();
				console.log(`[${artifact.name}] Downloading (attempt ${attempt})...`);
				await downloadArtifact(artifact, artifactZipPath);
				const archiveSize = fs.statSync(artifactZipPath).size;
				const downloadDurationS = (Date.now() - start) / 1000;
				const downloadSpeedKBS = Math.round((archiveSize / 1024) / downloadDurationS);
				console.log(`[${artifact.name}] Successfully downloaded after ${Math.floor(downloadDurationS)} seconds(${downloadSpeedKBS} KB/s).`);
			});

			const artifactFilePaths = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
			const artifactFilePath = artifactFilePaths.filter(p => !/_manifest/.test(p))[0];

			processing.add(artifact.name);
			const promise = new Promise<void>((resolve, reject) => {
				const worker = new Worker(__filename, { workerData: { artifact, artifactFilePath, cosmosDBAccessToken } });
				worker.on('error', reject);
				worker.on('exit', code => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`[${artifact.name}] Worker stopped with exit code ${code}`));
					}
				});
			});

			const operation = promise.then(() => {
				processing.delete(artifact.name);
				done.add(artifact.name);
				console.log(`\u2705 ${artifact.name} `);
			});

			operations.push({ name: artifact.name, operation });
			resultPromise = Promise.allSettled(operations.map(o => o.operation));
		}

		await new Promise(c => setTimeout(c, 10_000));
	}

	console.log(`Found all ${done.size + processing.size} artifacts, waiting for ${processing.size} artifacts to finish publishing...`);

	const artifactsInProgress = operations.filter(o => processing.has(o.name));

	if (artifactsInProgress.length > 0) {
		console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
	}

	const results = await resultPromise;

	for (let i = 0; i < operations.length; i++) {
		const result = results[i];

		if (result.status === 'rejected') {
			console.error(`[${operations[i].name}]`, result.reason);
		}
	}

	if (results.some(r => r.status === 'rejected')) {
		throw new Error('Some artifacts failed to publish');
	}

	console.log(`All ${done.size} artifacts published!`);
}

if (require.main === module) {
	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
