/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { pipeline } from 'node:stream/promises';
import * as crypto from 'crypto';
import { retry } from './retry';
import { CosmosClient } from '@azure/cosmos';
import { ClientSecretCredential } from '@azure/identity';
import * as cp from 'child_process';
import * as os from 'os';

function e(name: string): string {
	const result = process.env[name];

	if (typeof result !== 'string') {
		throw new Error(`Missing env: ${name}`);
	}

	return result;
}

export interface ITask<T> {
	(): T;
}

interface ILimitedTaskFactory<T> {
	factory: ITask<Promise<T>>;
	c: (value: T | Promise<T>) => void;
	e: (error?: unknown) => void;
}

export class Limiter<T> {

	private _size = 0;
	private runningPromises: number;
	private readonly maxDegreeOfParalellism: number;
	private readonly outstandingPromises: ILimitedTaskFactory<T>[];

	constructor(maxDegreeOfParalellism: number) {
		this.maxDegreeOfParalellism = maxDegreeOfParalellism;
		this.outstandingPromises = [];
		this.runningPromises = 0;
	}

	queue(factory: ITask<Promise<T>>): Promise<T> {
		this._size++;

		return new Promise<T>((c, e) => {
			this.outstandingPromises.push({ factory, c, e });
			this.consume();
		});
	}

	private consume(): void {
		while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
			const iLimitedTask = this.outstandingPromises.shift()!;
			this.runningPromises++;

			const promise = iLimitedTask.factory();
			promise.then(iLimitedTask.c, iLimitedTask.e);
			promise.then(() => this.consumed(), () => this.consumed());
		}
	}

	private consumed(): void {
		this._size--;
		this.runningPromises--;

		if (this.outstandingPromises.length > 0) {
			this.consume();
		}
	}
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

		if (!res.ok || res.status < 200 || res.status >= 500) {
			throw new Error(`Unexpected status code: ${res.status}`);
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

const tmp = new Temp();
process.on('exit', () => tmp.dispose());

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
	url: string
): Promise<string> {
	const fileName = `${quality}/${version}/${path.basename(url)}`;
	const result = `${e('PRSS_CDN_URL')}/${fileName}`;

	const res = await fetch(result, { method: 'HEAD' });

	if (res.status === 200) {
		log(`Already released and provisioned: ${result}`);
		return result;
	}

	const assetPath = tmp.tmpNameSync();
	await download(url, assetPath);

	const esrpclient = new ESRPClient(log, tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
	const release = await esrpclient.release(version, assetPath);

	const credential = new ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
	const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
	const service = new ProvisionService(log, accessToken.token);
	await service.provision(release.releaseId, release.fileId, fileName);

	return result;
}

async function download(url: string, path: string): Promise<void> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 10 * 60 * 1000);

	try {
		const res = await fetch(url, { signal: abortController.signal });

		if (!res.ok) {
			throw new Error(`Unexpected status code: ${res.status}`);
		}

		await pipeline(Readable.fromWeb(res.body as ReadableStream), fs.createWriteStream(path));
	} finally {
		clearTimeout(timeout);
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

interface Build {
	readonly id: string;
	readonly version: string;
	readonly assets: Asset[];
}

async function migrateAsset(_client: CosmosClient, build: Build, asset: Asset): Promise<void> {
	asset.url = await releaseAndProvision(
		(...args: any[]) => console.log(`[${build.id} | ${asset.platform} | ${asset.type}]`, ...args),
		e('RELEASE_TENANT_ID'),
		e('RELEASE_CLIENT_ID'),
		e('RELEASE_AUTH_CERT_SUBJECT_NAME'),
		e('RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME'),
		e('PROVISION_TENANT_ID'),
		e('PROVISION_AAD_USERNAME'),
		e('PROVISION_AAD_PASSWORD'),
		build.id,
		'stable',
		asset.url
	);
}

const limiter = new Limiter(6);

async function main() {
	const aadCredentials = new ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
	const client = new CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
	const container = client.database('builds').container('stable');
	const builds = await container.items.query<Build>('SELECT * FROM c WHERE c.isReleased = true').fetchAll();

	for (const build of builds.resources) {
		const assetsToMigrate = build.assets.filter(asset => asset.url?.startsWith('https://az764295.vo.msecnd.net/'));

		if (assetsToMigrate.length === 0) {
			continue;
		}

		console.log(`Migrating ${build.version} (${assetsToMigrate.length} assets)...`);
		await Promise.all(assetsToMigrate.map(asset => limiter.queue(() => migrateAsset(client, build, asset))));
		await client.database('builds').container('stable').item(build.id).replace(build);
	}
}

if (require.main === module) {
	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
