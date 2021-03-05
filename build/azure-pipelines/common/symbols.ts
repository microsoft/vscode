/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as request from 'request';
import { createReadStream, createWriteStream, unlink, mkdir } from 'fs';
import * as github from 'github-releases';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

const BASE_URL = 'https://rink.hockeyapp.net/api/2/';
const HOCKEY_APP_TOKEN_HEADER = 'X-HockeyAppToken';

export interface IVersions {
	app_versions: IVersion[];
}

export interface IVersion {
	id: number;
	version: string;
}

export interface IApplicationAccessor {
	accessToken: string;
	appId: string;
}

export interface IVersionAccessor extends IApplicationAccessor {
	id: string;
}

enum Platform {
	WIN_32 = 'win32-ia32',
	WIN_64 = 'win32-x64',
	LINUX_64 = 'linux-x64',
	MAC_OS = 'darwin-x64'
}

function symbolsZipName(platform: Platform, electronVersion: string, insiders: boolean): string {
	return `${insiders ? 'insiders' : 'stable'}-symbols-v${electronVersion}-${platform}.zip`;
}

const SEED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
async function tmpFile(name: string): Promise<string> {
	let res = '';
	for (let i = 0; i < 8; i++) {
		res += SEED.charAt(Math.floor(Math.random() * SEED.length));
	}

	const tmpParent = join(tmpdir(), res);

	await promisify(mkdir)(tmpParent);

	return join(tmpParent, name);
}

function getVersions(accessor: IApplicationAccessor): Promise<IVersions> {
	return asyncRequest<IVersions>({
		url: `${BASE_URL}/apps/${accessor.appId}/app_versions`,
		method: 'GET',
		headers: {
			[HOCKEY_APP_TOKEN_HEADER]: accessor.accessToken
		}
	});
}

function createVersion(accessor: IApplicationAccessor, version: string): Promise<IVersion> {
	return asyncRequest<IVersion>({
		url: `${BASE_URL}/apps/${accessor.appId}/app_versions/new`,
		method: 'POST',
		headers: {
			[HOCKEY_APP_TOKEN_HEADER]: accessor.accessToken
		},
		formData: {
			bundle_version: version
		}
	});
}

function updateVersion(accessor: IVersionAccessor, symbolsPath: string) {
	return asyncRequest<IVersions>({
		url: `${BASE_URL}/apps/${accessor.appId}/app_versions/${accessor.id}`,
		method: 'PUT',
		headers: {
			[HOCKEY_APP_TOKEN_HEADER]: accessor.accessToken
		},
		formData: {
			dsym: createReadStream(symbolsPath)
		}
	});
}

function asyncRequest<T>(options: request.UrlOptions & request.CoreOptions): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request(options, (error, _response, body) => {
			if (error) {
				reject(error);
			} else {
				resolve(JSON.parse(body));
			}
		});
	});
}

function downloadAsset(repository: any, assetName: string, targetPath: string, electronVersion: string) {
	return new Promise((resolve, reject) => {
		repository.getReleases({ tag_name: `v${electronVersion}` }, (err: any, releases: any) => {
			if (err) {
				reject(err);
			} else {
				const asset = releases[0].assets.filter((asset: any) => asset.name === assetName)[0];
				if (!asset) {
					reject(new Error(`Asset with name ${assetName} not found`));
				} else {
					repository.downloadAsset(asset, (err: any, reader: any) => {
						if (err) {
							reject(err);
						} else {
							const writer = createWriteStream(targetPath);
							writer.on('error', reject);
							writer.on('close', resolve);
							reader.on('error', reject);

							reader.pipe(writer);
						}
					});
				}
			}
		});
	});
}

interface IOptions {
	repository: string;
	platform: Platform;
	versions: { code: string; insiders: boolean; electron: string; };
	access: { hockeyAppToken: string; hockeyAppId: string; githubToken: string };
}

async function ensureVersionAndSymbols(options: IOptions) {

	// Check version does not exist
	console.log(`HockeyApp: checking for existing version ${options.versions.code} (${options.platform})`);
	const versions = await getVersions({ accessToken: options.access.hockeyAppToken, appId: options.access.hockeyAppId });
	if (!Array.isArray(versions.app_versions)) {
		throw new Error(`Unexpected response: ${JSON.stringify(versions)}`);
	}

	if (versions.app_versions.some(v => v.version === options.versions.code)) {
		console.log(`HockeyApp: Returning without uploading symbols because version ${options.versions.code} (${options.platform}) was already found`);
		return;
	}

	// Download symbols for platform and electron version
	const symbolsName = symbolsZipName(options.platform, options.versions.electron, options.versions.insiders);
	const symbolsPath = await tmpFile('symbols.zip');
	console.log(`HockeyApp: downloading symbols ${symbolsName} for electron ${options.versions.electron} (${options.platform}) into ${symbolsPath}`);
	await downloadAsset(new (github as any)({ repo: options.repository, token: options.access.githubToken }), symbolsName, symbolsPath, options.versions.electron);

	// Create version
	console.log(`HockeyApp: creating new version ${options.versions.code} (${options.platform})`);
	const version = await createVersion({ accessToken: options.access.hockeyAppToken, appId: options.access.hockeyAppId }, options.versions.code);

	// Upload symbols
	console.log(`HockeyApp: uploading symbols for version ${options.versions.code} (${options.platform})`);
	await updateVersion({ id: String(version.id), accessToken: options.access.hockeyAppToken, appId: options.access.hockeyAppId }, symbolsPath);

	// Cleanup
	await promisify(unlink)(symbolsPath);
}

// Environment
const pakage = require('../../../package.json');
const product = require('../../../product.json');
const repository = product.electronRepository;
const electronVersion = require('../../lib/electron').getElectronVersion();
const insiders = product.quality !== 'stable';
let codeVersion = pakage.version;
if (insiders) {
	codeVersion = `${codeVersion}-insider`;
}
const githubToken = process.argv[2];
const hockeyAppToken = process.argv[3];
const is64 = process.argv[4] === 'x64';
const hockeyAppId = process.argv[5];

if (process.argv.length !== 6) {
	throw new Error(`HockeyApp: Unexpected number of arguments. Got ${process.argv}`);
}

let platform: Platform;
if (process.platform === 'darwin') {
	platform = Platform.MAC_OS;
} else if (process.platform === 'win32') {
	platform = is64 ? Platform.WIN_64 : Platform.WIN_32;
} else {
	platform = Platform.LINUX_64;
}

// Create version and upload symbols in HockeyApp
if (repository && codeVersion && electronVersion && (product.quality === 'stable' || product.quality === 'insider')) {
	ensureVersionAndSymbols({
		repository,
		platform,
		versions: {
			code: codeVersion,
			insiders,
			electron: electronVersion
		},
		access: {
			githubToken,
			hockeyAppToken,
			hockeyAppId
		}
	}).then(() => {
		console.log('HockeyApp: done');
	}).catch(error => {
		console.error(`HockeyApp: error ${error} (AppID: ${hockeyAppId})`);

		return process.exit(1);
	});
} else {
	console.log(`HockeyApp: skipping due to unexpected context (repository: ${repository}, codeVersion: ${codeVersion}, electronVersion: ${electronVersion}, quality: ${product.quality})`);
}