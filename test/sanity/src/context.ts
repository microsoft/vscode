/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync, SpawnSyncReturns } from 'child_process';
import { createHash } from 'crypto';
import { gunzipSync, unzipSync } from 'fflate';
import fs from 'fs';
import fetch, { Response } from 'node-fetch';
import os from 'os';
import path from 'path';
import tar from 'tar-stream';

/**
 * Response from https://update.code.visualstudio.com/api/versions/commit:<commit>/<target>/<quality>
 */
interface ITargetMetadata {
	url: string;
	name: string;
	version: string;
	productVersion: string;
	hash: string;
	timestamp: number;
	sha256hash: string;
	supportsFastUpdate: boolean;
}

/**
 * Provides context and utilities for VS Code sanity tests.
 */
export class TestContext {
	private static readonly authenticodeInclude = /^.+\.(exe|dll|sys|cab|cat|msi|jar|ocx|ps1|psm1|psd1|ps1xml|pssc1)$/i;

	private readonly tempDirs = new Set<string>();

	public constructor(
		public readonly quality: 'stable' | 'insider',
		public readonly commit: string,
	) { }

	/**
	 * Logs a message with a timestamp.
	 */
	public log(message: string) {
		console.log(`[${new Date().toISOString()}] ${message}`);
	}

	/**
	 * Logs an error message and throws an Error.
	 */
	public error(message: string): never {
		console.error(`[${new Date().toISOString()}] ${message}`);
		throw new Error(message);
	}

	/**
	 * Creates a new temporary directory and returns its path.
	 */
	public createTempDir(): string {
		const osTempDir = fs.realpathSync(os.tmpdir());
		const tempDir = fs.mkdtempSync(path.join(osTempDir, 'vscode-sanity'));
		this.log(`Created temp directory: ${tempDir}`);
		this.tempDirs.add(tempDir);
		return tempDir;
	}

	/**
	 * Ensures that the directory for the specified file path exists.
	 */
	public ensureDirExists(filePath: string) {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	/**
	 * Cleans up all temporary directories created during the test run.
	 */
	public cleanup() {
		for (const dir of this.tempDirs) {
			this.log(`Deleting temp directory: ${dir}`);
			try {
				fs.rmSync(dir, { recursive: true, force: true });
				this.log(`Deleted temp directory: ${dir}`);
			} catch (error) {
				this.log(`Failed to delete temp directory: ${dir}: ${error}`);
			}
		}
		this.tempDirs.clear();
	}

	/**
	 * Fetches a URL and ensures there are no errors.
	 * @param url The URL to fetch.
	 * @returns The fetch Response object.
	 */
	public async fetchNoErrors(url: string): Promise<Response & { body: NodeJS.ReadableStream }> {
		const response = await fetch(url);
		if (!response.ok) {
			this.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
		}

		if (response.body === null) {
			this.error(`Response body is null for ${url}`);
		}

		return response as Response & { body: NodeJS.ReadableStream };
	}

	/**
	 * Fetches metadata for a specific VS Code release target.
	 * @param target The target platform (e.g., 'cli-linux-x64').
	 * @returns The target metadata.
	 */
	public async fetchMetadata(target: string): Promise<ITargetMetadata> {
		const url = `https://update.code.visualstudio.com/api/versions/commit:${this.commit}/${target}/${this.quality}`;

		this.log(`Fetching metadata for ${target} from ${url}`);
		const response = await this.fetchNoErrors(url);

		const result = await response.json() as ITargetMetadata;
		if (result.url === undefined || result.sha256hash === undefined) {
			this.error(`Invalid metadata response for ${target}: ${JSON.stringify(result)}`);
		}

		this.log(`Fetched metadata for ${target}: ${JSON.stringify(result)}`);
		return result;
	}

	/**
	 * Downloads installer for specified VS Code release target.
	 * @param target The target platform (e.g., 'cli-linux-x64').
	 * @returns The path to the downloaded file.
	 */
	public async downloadTarget(target: string): Promise<string> {
		const { url, sha256hash } = await this.fetchMetadata(target);
		const filePath = path.join(this.createTempDir(), path.basename(url));

		this.log(`Downloading ${url} to ${filePath}`);
		const { body } = await this.fetchNoErrors(url);

		const stream = fs.createWriteStream(filePath);
		await new Promise<void>((resolve, reject) => {
			body.on('error', reject);
			stream.on('error', reject);
			stream.on('finish', resolve);
			body.pipe(stream);
		});

		this.log(`Downloaded ${url} to ${filePath}`);
		this.validateSha256Hash(filePath, sha256hash);

		if (TestContext.authenticodeInclude.test(filePath) && os.platform() === 'win32') {
			this.validateSignature(filePath);
		}

		return filePath;
	}

	/**
	 * Validates the SHA-256 hash of a file.
	 * @param filePath The path to the file to validate.
	 * @param expectedHash The expected SHA-256 hash in hexadecimal format.
	 */
	public validateSha256Hash(filePath: string, expectedHash: string) {
		this.log(`Validating SHA256 hash for ${filePath}`);

		const buffer = fs.readFileSync(filePath);
		const hash = createHash('sha256').update(buffer).digest('hex');

		if (hash !== expectedHash) {
			this.error(`Hash mismatch for ${filePath}: expected ${expectedHash}, got ${hash}`);
		}
	}

	/**
	 * Validates the Authenticode signature of a Windows executable.
	 * @param filePath The path to the file to validate.
	 */
	public validateSignature(filePath: string) {
		this.log(`Validating Authenticode signature for ${filePath}`);

		const result = this.run('powershell', '-Command', `Get-AuthenticodeSignature "${filePath}" | Select-Object -ExpandProperty Status`);
		if (result.error !== undefined) {
			this.error(`Failed to run Get-AuthenticodeSignature: ${result.error.message}`);
		}

		const status = result.stdout.trim();
		if (status !== 'Valid') {
			this.error(`Authenticode signature is not valid for ${filePath}: ${status}`);
		}
	}

	/**
	 * Validates signatures for all executable files in the specified directory.
	 * @param dir The directory to scan for executable files.
	 */
	public validateAllSignatures(dir: string) {
		const files = fs.readdirSync(dir, { withFileTypes: true });
		for (const file of files) {
			const filePath = path.join(dir, file.name);
			if (file.isDirectory()) {
				this.validateAllSignatures(filePath);
			} else if (TestContext.authenticodeInclude.test(file.name)) {
				this.validateSignature(filePath);
			}
		}
	}

	/**
	 * Downloads and unpacks the specified VS Code release target.
	 * @param target The target platform (e.g., 'cli-linux-x64').
	 * @returns The path to the unpacked directory.
	 */
	public async downloadAndUnpack(target: string): Promise<string> {
		const filePath = await this.downloadTarget(target);
		return this.unpackArchive(filePath);
	}

	/**
	 * Unpacks a .zip or .tar.gz archive to a temporary directory.
	 * @param archivePath The path to the archive file.
	 * @returns The path to the temporary directory where the archive was unpacked.
	 */
	public async unpackArchive(archivePath: string): Promise<string> {
		const dir = this.createTempDir();
		this.log(`Unpacking ${archivePath} to ${dir}`);

		if (path.extname(archivePath).toLowerCase() === '.zip') {
			this.unpackZip(archivePath, dir);
		} else {
			await this.unpackTarGz(archivePath, dir);
		}

		this.log(`Unpacked ${archivePath} to ${dir}`);
		return dir;
	}

	/**
	 * Unpacks a .zip archive to the specified target directory.
	 * @param archivePath The path to the .zip archive.
	 * @param dir The target directory to unpack the archive into.
	 */
	public unpackZip(archivePath: string, dir: string) {
		const buffer = fs.readFileSync(archivePath);
		const files = unzipSync(buffer);
		for (const [filename, content] of Object.entries(files)) {
			if (!filename.endsWith('/')) {
				const filePath = path.join(dir, filename);
				this.ensureDirExists(filePath);
				fs.writeFileSync(filePath, content);
			}
		}
	}

	/**
	 * Unpacks a .tar.gz archive to the specified target directory.
	 * @param archivePath The path to the .tar.gz archive.
	 * @param dir The target directory to unpack the archive into.
	 */
	public async unpackTarGz(archivePath: string, dir: string): Promise<void> {
		const buffer = fs.readFileSync(archivePath);
		const extract = tar.extract();

		return new Promise((resolve, reject) => {
			extract.on('entry', ({ name, type, mode }, stream, next) => {
				if (name.includes('..') || type !== 'file') {
					stream.resume();
					next();
				} else {
					const filePath = path.join(dir, name);
					this.ensureDirExists(filePath);
					stream.pipe(fs.createWriteStream(filePath, { mode })
						.on('finish', next)
						.on('error', reject));
				}
			});

			extract.on('finish', resolve);
			extract.on('error', reject);

			const tarBuffer = gunzipSync(buffer);
			extract.end(tarBuffer);
		});
	}

	/**
	 * Runs a command synchronously.
	 * @param command The command to run.
	 * @param args Optional arguments for the command.
	 * @returns The result of the spawnSync call.
	 */
	public run(command: string, ...args: string[]): SpawnSyncReturns<string> {
		this.log(`Running command: ${command} ${args.join(' ')}`);
		return spawnSync(command, args, { encoding: 'utf-8' }) as SpawnSyncReturns<string>;
	}

	/**
	 * Runs a command synchronously and ensures it succeeds.
	 * @param command The command to run.
	 * @param args Optional arguments for the command.
	 * @returns The result of the spawnSync call.
	 */
	public runNoErrors(command: string, ...args: string[]): SpawnSyncReturns<string> {
		const result = this.run(command, ...args);
		if (result.error !== undefined) {
			this.error(`Failed to run command: ${result.error.message}`);
		}

		if (result.status !== 0) {
			this.error(`Command exited with code ${result.status}: ${result.stderr}`);
		}

		return result;
	}

	/**
	 * Installs a Windows EXE installer silently.
	 * @param filePath The path to the installer file.
	 */
	public installExe(filePath: string) {
		this.log(`Installing ${filePath} using Windows Installer in silent mode`);
		this.runNoErrors(filePath, '/silent', '/mergetasks=!runcode');
		this.log(`Installed ${filePath} successfully`);
	}

	/**
	 * Installs a Linux RPM package.
	 * @param filePath The path to the RPM file.
	 */
	public installRpm(filePath: string) {
		this.log(`Installing ${filePath} using RPM package manager`);
		this.runNoErrors('sudo', 'rpm', '-i', filePath);
		this.log(`Installed ${filePath} successfully`);
	}

	/**
	 * Installs a Linux DEB package.
	 * @param filePath The path to the DEB file.
	 */
	public installDeb(filePath: string) {
		this.log(`Installing ${filePath} using DEB package manager`);
		this.runNoErrors('sudo', 'dpkg', '-i', filePath);
		this.log(`Installed ${filePath} successfully`);
	}

	/**
	 * Installs a Linux Snap package.
	 * @param filePath The path to the Snap file.
	 */
	public installSnap(filePath: string) {
		this.log(`Installing ${filePath} using Snap package manager`);
		this.runNoErrors('sudo', 'snap', 'install', filePath, '--classic', '--dangerous');
		this.log(`Installed ${filePath} successfully`);
	}

	/**
	 * Returns the entry point executable for the VS Code CLI installation in the specified directory.
	 * @param dir The directory of the VS Code installation.
	 * @returns The path to the entry point executable.
	 */
	public getCliEntryPoint(dir: string): string {
		const suffix = this.quality === 'insider' ? '-insiders' : '';
		const extension = os.platform() === 'win32' ? '.exe' : '';

		const filePath = path.join(dir, `code${suffix}${extension}`);
		if (!fs.existsSync(filePath)) {
			this.error(`CLI entry point does not exist: ${filePath}`);
		}

		return filePath;
	}
}
