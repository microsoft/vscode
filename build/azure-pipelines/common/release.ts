/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientSecretCredential } from '@azure/identity';
import * as https from 'https';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';

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

	constructor(private readonly accessToken: string) { }

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

		const res = await this.request<CreateProvisionedFilesResponse>('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body });

		if (!res.IsSuccess) {
			console.error(res.ErrorDetails);
			throw new Error(res.ErrorDetails.Message);
		}
	}

	private async request<T>(method: string, url: string, options?: RequestOptions): Promise<T> {
		return await new Promise<T>((c, e) => {
			const headers: Record<string, string> = {
				'Authorization': `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json'
			};

			if (options?.body) {
				headers['Content-Length'] = String(options.body.length);
			}

			const req = https.request(`https://dsprovisionapi.microsoft.com${url}`, { method, headers }, res => {
				if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 500) {
					return e(new Error(`Unexpected status code: ${res.statusCode}`));
				}

				// https://vscode.download.prss.microsoft.com/dbazure/download/test/e7e037083ff4455cf320e344325dacb480062c3c/vscode_cli_linux_x64_cli.tar.gz

				const chunks: Buffer[] = [];
				res.on('data', chunk => chunks.push(chunk));
				res.on('end', () => {
					const body = Buffer.concat(chunks).toString();

					try {
						c(JSON.parse(body));
					} catch (err) {
						e(err);
					}
				});
			});

			req.on('error', e);

			if (options?.body) {
				req.write(options?.body);
			}

			req.end();
		});
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

class ESRPClient {

	constructor(
		private readonly tmp: Temp,
		private readonly tenantId: string,
		private readonly clientId: string,
		private readonly authCertSubjectName: string,
		private readonly requestSigningCertSubjectName: string,
	) { }

	async release(
		version: string,
		filePath: string
	): Promise<Release> {
		const authPath = this.tmp.tmpNameSync();
		fs.writeFileSync(authPath, JSON.stringify({
			Version: '1.0.0',
			AuthenticationType: 'AAD_CERT',
			TenantId: this.tenantId,
			ClientId: this.clientId,
			AuthCert: {
				SubjectName: this.authCertSubjectName,
				StoreLocation: 'LocalMachine',
				StoreName: 'My',
				SendX5c: 'true'
			},
			RequestSigningCert: {
				SubjectName: this.requestSigningCertSubjectName,
				StoreLocation: 'LocalMachine',
				StoreName: 'My'
			}
		}));

		const policyPath = this.tmp.tmpNameSync();
		fs.writeFileSync(authPath, JSON.stringify({
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

		cp.execSync(`ESRPClient SubmitRelease -l Verbose -a ${authPath} -p ${policyPath} -i ${inputPath} -o ${outputPath}`, {
			stdio: 'inherit'
		});

		const output = fs.readFileSync(outputPath, 'utf8');
		console.log('*************************');
		console.log(output);
		console.log('*************************');

		return JSON.parse(output);
	}
}

export async function main([
	releaseTenantId,
	releaseClientId,
	releaseAuthCertSubjectName,
	releaseRequestSigningCertSubjectName,
	provisionTenantId,
	provisionAADUsername,
	provisionAADPassword,
	version,
	quality,
	filePath
]: string[]) {
	const tmp = new Temp();
	process.on('exit', () => tmp.dispose());

	console.log('Creating release...');
	const esrpclient = new ESRPClient(tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
	const release = await esrpclient.release(version, filePath);

	console.log('Provisioning file...');
	const credential = new ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
	const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
	const service = new ProvisionService(accessToken.token);
	await service.provision(release.releaseId, release.fileId, `_${quality}/${version}/${path.basename(filePath)}`);
}

if (require.main === module) {
	main(process.argv.slice(2)).then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
