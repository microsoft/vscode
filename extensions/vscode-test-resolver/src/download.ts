/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import { promises as fs, createWriteStream } from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { URL } from 'url';

async function ensureFolderExists(loc: string) {
	if (!(await folderExists(loc))) {
		await fs.mkdir(loc, { recursive: true });
	}
}

async function folderExists(location: string) {
	try {
		return (await fs.stat(location)).isDirectory;
	} catch (e) {
		return false;
	}
}

async function fileExists(location: string) {
	try {
		return (await fs.stat(location)).isFile;
	} catch (e) {
		return false;
	}

}

export function getDownloadUrl(updateUrl: string, commit: string, platform: string, quality: string): string {
	return `${updateUrl}/commit:${commit}/server-${platform}/${quality}`;
}

export function getPlatform() {
	return process.platform === 'win32' ? 'win32-x64' : process.platform === 'darwin' ? 'darwin' : 'linux-x64';
}

export function getDownloadLocation(updateUrl: string, commit: string, platform: string, quality: string): string {
	return `${updateUrl}/commit:${commit}/server-${platform}/${quality}`;
}

export async function downloadVSCodeServerArchive(updateUrl: string, commit: string, quality: string, destDir: string, log: (messsage: string) => void): Promise<string> {
	await ensureFolderExists(destDir);

	const platform = getPlatform();
	const downloadUrl = getDownloadUrl(updateUrl, commit, platform, quality);
	console.log('downloadUrl' + downloadUrl);

	return new Promise((resolve, reject) => {
		log(`Downloading VS Code Server from: ${downloadUrl}`);
		const requestOptions: https.RequestOptions = new URL(downloadUrl);

		https.get(requestOptions, async res => {
			if (res.statusCode !== 302) {
				reject('Failed to get VS Code server archive location');
			}
			const archiveUrl = res.headers.location;
			if (!archiveUrl) {
				reject('Failed to get VS Code server archive location');
				return;
			}
			const archivePath = path.resolve(destDir, `vscode-server-${quality}-${platform}-${commit}.${archiveUrl.endsWith('.zip') ? 'zip' : 'tgz'}`);
			fileExists(archivePath).then(exists => {
				if (exists) {
					resolve(archivePath);
				} else {
					const outStream = createWriteStream(archivePath);
					outStream.on('close', () => {
						resolve(archivePath);
					});
					const archiveRequestOptions: https.RequestOptions = new URL(archiveUrl);
					https.get(archiveRequestOptions, res => {
						res.pipe(outStream);
					});
				}
			});
		});
	});
}

/**
 * Unzip a .zip or .tar.gz VS Code archive
 */
async function unzipVSCodeServer(vscodeArchivePath: string, extractDir: string, destDir: string, log: (messsage: string) => void) {
	log(`Extracting ${vscodeArchivePath}`);
	if (vscodeArchivePath.endsWith('.zip')) {
		const tempDir = await fs.mkdtemp(path.join(destDir, 'vscode-server-extract'));
		if (process.platform === 'win32') {
			cp.spawnSync('powershell.exe', [
				'-NoProfile',
				'-ExecutionPolicy', 'Bypass',
				'-NonInteractive',
				'-NoLogo',
				'-Command',
				`Microsoft.PowerShell.Archive\\Expand-Archive -Path "${vscodeArchivePath}" -DestinationPath "${tempDir}"`
			]);
		} else {
			cp.spawnSync('unzip', [vscodeArchivePath, '-d', `${tempDir}`]);
		}
		await fs.rename(path.join(tempDir, process.platform === 'win32' ? 'vscode-server-win32-x64' : 'vscode-server-darwin-x64'), extractDir);
	} else {
		// tar does not create extractDir by default
		await ensureFolderExists(extractDir);
		cp.spawnSync('tar', ['-xzf', vscodeArchivePath, '-C', extractDir, '--strip-components', '1']);
	}
}

export async function downloadAndUnzipVSCodeServer(updateUrl: string, commit: string, quality: string = 'stable', destDir: string, log: (messsage: string) => void): Promise<string> {

	const extractDir = path.join(destDir, commit);
	if (await folderExists(extractDir)) {
		log(`Found ${extractDir}. Skipping download.`);
	} else {
		log(`Downloading VS Code Server ${quality} - ${commit} into ${extractDir}.`);
		try {
			const vscodeArchivePath = await downloadVSCodeServerArchive(updateUrl, commit, quality, destDir, log);
			if (await fileExists(vscodeArchivePath)) {
				unzipVSCodeServer(vscodeArchivePath, extractDir, destDir, log);
				// Remove archive
				await fs.unlink(vscodeArchivePath);
			}
		} catch (err) {
			throw Error(`Failed to download and unzip VS Code ${quality} - ${commit}`);
		}
	}
	return extractDir;
}


