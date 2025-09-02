/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as decompress from 'decompress';
import * as fs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';
import * as os from 'os';
import { platform, arch } from 'os';
import * as path from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const existsAsync = promisify(fs.exists);
const mkdtempAsync = promisify(fs.mkdtemp);

const httpsGetAsync = (opts: https.RequestOptions) => {
	return new Promise<IncomingMessage>((resolve, reject) => {
		const req = https.get(opts, resolve);
		req.once('error', reject);
	});
};

async function getVersionFromPackageJson(): Promise<string | null> {
	try {
		const packageJson = JSON.parse(await readFileAsync('package.json', 'utf-8'));
		return packageJson.erdos.binaryDependencies?.ark || null;
	} catch (error) {
		throw new Error(`Error reading package.json: ${error}`);
	}
}

async function getLocalArkVersion(): Promise<string | null> {
	const versionFile = path.join('resources', 'ark', 'VERSION');
	try {
		const arkExists = await existsAsync(versionFile);
		if (!arkExists) {
			return null;
		}
		return readFileAsync(versionFile, 'utf-8');
	} catch (error) {
		throw new Error(`Error determining ARK version: ${error}`);
	}
}

async function executeCommand(
	command: string,
	stdin?: string,
	cwd?: string
): Promise<{ stdout: string; stderr: string }> {
	const { exec } = require('child_process');
	return new Promise((resolve, reject) => {
		const options: { cwd?: string } = {};
		if (cwd) {
			options.cwd = cwd;
		}

		const process = exec(command, options, (error: any, stdout: string, stderr: string) => {
			if (error) {
				reject(error);
			} else {
				resolve({ stdout, stderr });
			}
		});

		if (stdin) {
			process.stdin.write(stdin);
			process.stdin.end();
		}
	});
}

async function downloadAndReplaceArk(version: string, githubPat: string | undefined): Promise<void> {
	try {
		const headers: Record<string, string> = {
			'Accept': 'application/vnd.github.v3.raw',
			'User-Agent': 'erdos-ark-downloader'
		};
		if (githubPat) {
			headers.Authorization = `token ${githubPat}`;
		}
		const requestOptions: https.RequestOptions = {
			headers,
			method: 'GET',
			protocol: 'https:',
			hostname: 'api.github.com',
			path: `/repos/willnickols/ark/releases`
		};

		const response = await httpsGetAsync(requestOptions as any) as any;

		let responseBody = '';

		response.on('data', (chunk: any) => {
			responseBody += chunk;
		});

		response.on('end', async () => {
			if (response.statusCode !== 200) {
				throw new Error(`Failed to download Ark: HTTP ${response.statusCode}\n\n` +
					`${responseBody}`);
			}
			const releases = JSON.parse(responseBody);
			if (!Array.isArray(releases)) {
				throw new Error(`Unexpected response from Github:\n\n` +
					`${responseBody}`);
			}
			const release = releases.find((asset: any) => asset.tag_name === version);
			if (!release) {
				throw new Error(`Could not find Ark ${version} in the releases.`);
			}

			let os: string;
			switch (platform()) {
				case 'win32': os = 'windows-x64'; break;
				case 'darwin': os = 'darwin-universal'; break;
				case 'linux': os = (arch() === 'arm64' ? 'linux-arm64' : 'linux-x64'); break;
				default: {
					throw new Error(`Unsupported platform ${platform()}.`);
				}
			}

			const assetName = `ark-${version}-${os}.zip`;
			const asset = release.assets.find((asset: any) => asset.name === assetName);
			if (!asset) {
				throw new Error(`Could not find Ark with asset name ${assetName} in the release.`);
			}
			console.log(`Downloading Ark ${version} from ${asset.url}...`);
			const url = new URL(asset.url);
			headers.Accept = 'application/octet-stream';
			const requestOptions: https.RequestOptions = {
				headers,
				method: 'GET',
				protocol: url.protocol,
				hostname: url.hostname,
				path: url.pathname
			};

			let dlResponse = await httpsGetAsync(requestOptions) as any;
			while (dlResponse.statusCode === 302) {
				dlResponse = await httpsGetAsync(dlResponse.headers.location) as any;
			}
			let binaryData = Buffer.alloc(0);

			if (dlResponse.statusCode !== 200) {
				throw new Error(`Failed to download Ark: HTTP ${dlResponse.statusCode}`);
			}

			dlResponse.on('data', (chunk: any) => {
				binaryData = Buffer.concat([binaryData, chunk]);
			});
			dlResponse.on('end', async () => {
				const arkDir = path.join('resources', 'ark');

				if (binaryData.length < 1024) {
					console.error(binaryData.toString('utf-8'));
					throw new Error(
						`Binary data is too small (${binaryData.length} bytes); download probably failed.`);
				}

				if (!await existsAsync(arkDir)) {
					await fs.promises.mkdir(arkDir);
				}

				console.log(`Successfully downloaded Ark ${version} (${binaryData.length} bytes).`);
				const zipFileDest = path.join(arkDir, 'ark.zip');
				await writeFileAsync(zipFileDest, binaryData);

				await decompress(zipFileDest, arkDir).then(files => {
					console.log(`Successfully unzipped Ark ${version}.`);
				});

				await fs.promises.unlink(zipFileDest);

				await writeFileAsync(path.join('resources', 'ark', 'VERSION'), version);
			});
		});
	} catch (error) {
		throw new Error(`Error downloading Ark: ${error}`);
	}
}

async function downloadFromGitHubRepository(
	ref: string,
	githubPat: string | undefined
): Promise<void> {
	const { org, repo, revision } = parseGitHubRepoReference(ref);

	console.log(`Downloading and building Ark from GitHub repo: ${org}/${repo} at revision: ${revision}`);

	const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'ark-build-'));

	try {
		console.log(`Created temporary build directory: ${tempDir}`);

		let gitCloneCommand = `git clone https://github.com/${org}/${repo}.git ${tempDir}`;
		if (githubPat) {
			gitCloneCommand = `git clone https://x-access-token:${githubPat}@github.com/${org}/${repo}.git ${tempDir}`;
		}

		console.log('Cloning repository...');
		await executeCommand(gitCloneCommand);

		console.log(`Checking out revision: ${revision}`);
		await executeCommand(`git checkout ${revision}`, undefined, tempDir);

		const cargoTomlPath = path.join(tempDir, 'Cargo.toml');
		if (!await existsAsync(cargoTomlPath)) {
			throw new Error(`Invalid Ark repository: Cargo.toml not found at the repository root`);
		}

		console.log('Building Ark from source...');

		const buildOutput = await executeCommand('cargo build --release', undefined, tempDir);
		console.log('Ark build stdout:', buildOutput.stdout);
		console.log('Ark build stderr:', buildOutput.stderr);

		const kernelName = platform() === 'win32' ? 'ark.exe' : 'ark';
		const binaryPath = path.join(tempDir, 'target', 'release', kernelName);

		if (!fs.existsSync(binaryPath)) {
			throw new Error(`Failed to build Ark binary at ${binaryPath}`);
		}

		const { stdout: versionStdout, stderr: versionStderr } = await executeCommand(`${binaryPath}`);
		console.log('Ark stdout:', versionStdout);
		console.log('Ark stderr:', versionStderr);

		const arkDir = path.join('resources', 'ark');
		if (!await existsAsync(arkDir)) {
			await fs.promises.mkdir(arkDir, { recursive: true });
		}

		await fs.promises.copyFile(binaryPath, path.join(arkDir, kernelName));
		console.log(`Successfully built and installed Ark from ${org}/${repo}@${revision}`);

		await writeFileAsync(path.join(arkDir, 'VERSION'), ref);

	} catch (err) {
		throw new Error(`Error building Ark from GitHub repository: ${err}`);
	} finally {
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch (err) {
			console.warn(`Warning: Failed to clean up temporary directory ${tempDir}: ${err}`);
		}
	}
}

async function main() {
	const kernelName = platform() === 'win32' ? 'ark.exe' : 'ark';

	const erdosParent = path.dirname(path.dirname(path.dirname(path.dirname(__dirname))));
	const arkFolder = path.join(erdosParent, 'ark');
	const targetFolder = path.join(arkFolder, 'target');
	const debugBinary = path.join(targetFolder, 'debug', kernelName);
	const releaseBinary = path.join(targetFolder, 'release', kernelName);
	if (fs.existsSync(debugBinary) || fs.existsSync(releaseBinary)) {
		// Choose the newer binary by modification time (same logic as kernel.ts)
		const debugModified = fs.existsSync(debugBinary) ? fs.statSync(debugBinary).mtime : null;
		const releaseModified = fs.existsSync(releaseBinary) ? fs.statSync(releaseBinary).mtime : null;
		
		let binary: string;
		if (debugModified && releaseModified) {
			binary = releaseModified > debugModified ? releaseBinary : debugBinary;
		} else if (debugModified) {
			binary = debugBinary;
		} else if (releaseModified) {
			binary = releaseBinary;
		} else {
			throw new Error('No ark binary found');
		}
		
		console.log(`Using locally built Ark in ${binary}.`);

		fs.mkdirSync(path.join('resources', 'ark'), { recursive: true });
		fs.copyFileSync(binary, path.join('resources', 'ark', kernelName));
		return;
	} else {
		console.log(`No locally built Ark found in ${path.join(erdosParent, 'ark')}; ` +
			`checking downloaded version.`);
	}

	const packageJsonVersion = await getVersionFromPackageJson();
	const localArkVersion = await getLocalArkVersion();

	if (!packageJsonVersion) {
		throw new Error('Could not determine Ark version from package.json.');
	}

	console.log(`package.json version: ${packageJsonVersion} `);
	console.log(`Downloaded ark version: ${localArkVersion ? localArkVersion : 'Not found'} `);

	if (packageJsonVersion === localArkVersion) {
		console.log('Versions match. No action required.');
		return;
	}

	let githubPat = process.env.GITHUB_PAT;
	if (githubPat) {
		console.log('Using Github PAT from environment variable GITHUB_PAT.');
	} else {
		githubPat = process.env.ERDOS_GITHUB_PAT;
		if (githubPat) {
			console.log('Using Github PAT from environment variable ERDOS_GITHUB_PAT.');
		}
	}

	if (!githubPat) {
		try {
			const { stdout, stderr } =
				await executeCommand('git config --get credential.https://api.github.com.token');
			githubPat = stdout.trim();
			if (githubPat) {
				console.log(`Using Github PAT from git config setting ` +
					`'credential.https://api.github.com.token'.`);
			}
		} catch (error) {
		}
	}

	if (isGitHubRepoReference(packageJsonVersion)) {
		await downloadFromGitHubRepository(packageJsonVersion, githubPat);
	} else {
		await downloadAndReplaceArk(packageJsonVersion, githubPat);
	}
}

function isGitHubRepoReference(version: string): boolean {
	return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+@[a-zA-Z0-9._\/-]+$/.test(version);
}

function parseGitHubRepoReference(reference: string): { org: string; repo: string; revision: string } {
	const orgRepoMatch = reference.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)@([a-zA-Z0-9._\/-]+)$/);
	if (!orgRepoMatch) {
		throw new Error(`Invalid GitHub repo reference: ${reference}`);
	}

	return {
		org: orgRepoMatch[1],
		repo: orgRepoMatch[2],
		revision: orgRepoMatch[3]
	};
}

main().catch((error) => {
	console.error('An error occurred:', error);
});