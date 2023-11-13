/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientSecretCredential } from '@azure/identity';
import fetch, { RequestInit } from 'node-fetch';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import * as os from 'os';

export class Temp {
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

export class Sequencer {

	private current: Promise<unknown> = Promise.resolve(null);

	queue<T>(promiseTask: () => Promise<T>): Promise<T> {
		return this.current = this.current.then(() => promiseTask(), () => promiseTask());
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
		const res = await this.request<CreateProvisionedFilesResponse>('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body });

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

	private static Sequencer = new Sequencer();

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
		const submitReleaseResult = await ESRPClient.Sequencer.queue(() => this.SubmitRelease(version, filePath));

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

export async function releaseAndProvision(
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
) {
	const tmp = new Temp();
	process.on('exit', () => tmp.dispose());

	log('releaseAndProvision:', 'releaseTenantId', releaseTenantId, 'releaseClientId', releaseClientId, 'releaseAuthCertSubjectName', releaseAuthCertSubjectName, 'releaseRequestSigningCertSubjectName', releaseRequestSigningCertSubjectName, 'provisionTenantId', provisionTenantId);

	const esrpclient = new ESRPClient(log, tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
	const release = await esrpclient.release(version, filePath);

	const credential = new ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
	const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
	const service = new ProvisionService(log, accessToken.token);

	await service.provision(release.releaseId, release.fileId, `${quality}/${version}/${path.basename(filePath)}`);
}
