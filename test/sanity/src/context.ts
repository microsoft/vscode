/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync, SpawnSyncReturns } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import fetch, { Response } from 'node-fetch';
import os from 'os';
import path from 'path';
import { Browser, chromium, webkit } from 'playwright';

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
	private static readonly codesignExclude = /node_modules\/(@parcel\/watcher\/build\/Release\/watcher\.node|@vscode\/deviceid\/build\/Release\/windows\.node|@vscode\/ripgrep\/bin\/rg|@vscode\/spdlog\/build\/Release\/spdlog.node|kerberos\/build\/Release\/kerberos.node|native-watchdog\/build\/Release\/watchdog\.node|node-pty\/build\/Release\/(pty\.node|spawn-helper)|vsda\/build\/Release\/vsda\.node)$/;

	private readonly tempDirs = new Set<string>();
	private _currentTest?: Mocha.Test & { consoleOutputs?: string[] };

	public constructor(
		public readonly quality: 'stable' | 'insider' | 'exploration',
		public readonly commit: string,
		public readonly verbose: boolean,
		public readonly skipSigningCheck: boolean,
	) {
	}

	/**
	 * Sets the current test for log capturing.
	 */
	public set currentTest(test: Mocha.Test) {
		this._currentTest = test;
		this._currentTest.consoleOutputs ||= [];
	}

	/**
	 * Returns the current platform in the format <platform>-<arch>.
	 */
	public get platform(): string {
		return `${os.platform()}-${os.arch()}`;
	}

	/**
	 * Logs a message with a timestamp.
	 */
	public log(message: string) {
		const line = `[${new Date().toISOString()}] ${message}`;
		this._currentTest?.consoleOutputs?.push(line);
		if (this.verbose) {
			console.log(line);
		}
	}

	/**
	 * Logs an error message and throws an Error.
	 */
	public error(message: string): never {
		const line = `[${new Date().toISOString()}] ERROR: ${message}`;
		this._currentTest?.consoleOutputs?.push(line);
		console.error(line);
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
		process.chdir(os.homedir());
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
		const maxRetries = 5;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			if (attempt > 0) {
				const delay = Math.pow(2, attempt - 1) * 1000;
				this.log(`Retrying fetch (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}

			try {
				const response = await fetch(url);
				if (!response.ok) {
					lastError = new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
					continue;
				}

				if (response.body === null) {
					lastError = new Error(`Response body is null for ${url}`);
					continue;
				}

				return response as Response & { body: NodeJS.ReadableStream };
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				this.log(`Fetch attempt ${attempt + 1} failed: ${lastError.message}`);
			}
		}

		this.error(`Failed to fetch ${url} after ${maxRetries} attempts: ${lastError?.message}`);
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
			this.validateAuthenticodeSignature(filePath);
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
	public validateAuthenticodeSignature(filePath: string) {
		if (this.skipSigningCheck) {
			this.log(`Skipping Authenticode signature validation for ${filePath} (signing checks disabled)`);
			return;
		}

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
	 * Validates Authenticode signatures for all executable files in the specified directory.
	 * @param dir The directory to scan for executable files.
	 */
	public validateAllAuthenticodeSignatures(dir: string) {
		if (this.skipSigningCheck) {
			this.log(`Skipping Authenticode signature validation for ${dir} (signing checks disabled)`);
			return;
		}

		const files = fs.readdirSync(dir, { withFileTypes: true });
		for (const file of files) {
			const filePath = path.join(dir, file.name);
			if (file.isDirectory()) {
				this.validateAllAuthenticodeSignatures(filePath);
			} else if (TestContext.authenticodeInclude.test(file.name)) {
				this.validateAuthenticodeSignature(filePath);
			}
		}
	}

	/**
	 * Validates the codesign signature of a macOS binary or app bundle.
	 * @param filePath The path to the file or app bundle to validate.
	 */
	public validateCodesignSignature(filePath: string) {
		if (this.skipSigningCheck) {
			this.log(`Skipping codesign signature validation for ${filePath} (signing checks disabled)`);
			return;
		}

		this.log(`Validating codesign signature for ${filePath}`);

		const result = this.run('codesign', '--verify', '--deep', '--strict', filePath);
		if (result.error !== undefined) {
			this.error(`Failed to run codesign: ${result.error.message}`);
		}

		if (result.status !== 0) {
			this.error(`Codesign signature is not valid for ${filePath}: ${result.stderr}`);
		}
	}

	/**
	 * Validates codesign signatures for all Mach-O binaries in the specified directory.
	 * @param dir The directory to scan for Mach-O binaries.
	 */
	public validateAllCodesignSignatures(dir: string) {
		if (this.skipSigningCheck) {
			this.log(`Skipping codesign signature validation for ${dir} (signing checks disabled)`);
			return;
		}

		const files = fs.readdirSync(dir, { withFileTypes: true });
		for (const file of files) {
			const filePath = path.join(dir, file.name);
			if (TestContext.codesignExclude.test(filePath)) {
				this.log(`Skipping codesign validation for excluded file: ${filePath}`);
			} else if (file.isDirectory()) {
				// For .app bundles, validate the bundle itself, not its contents
				if (file.name.endsWith('.app') || file.name.endsWith('.framework')) {
					this.validateCodesignSignature(filePath);
				} else {
					this.validateAllCodesignSignatures(filePath);
				}
			} else if (this.isMachOBinary(filePath)) {
				this.validateCodesignSignature(filePath);
			}
		}
	}

	/**
	 * Checks if a file is a Mach-O binary by examining its magic number.
	 * @param filePath The path to the file to check.
	 * @returns True if the file is a Mach-O binary.
	 */
	private isMachOBinary(filePath: string): boolean {
		try {
			const fd = fs.openSync(filePath, 'r');
			const buffer = Buffer.alloc(4);
			fs.readSync(fd, buffer, 0, 4, 0);
			fs.closeSync(fd);

			// Mach-O magic numbers:
			// MH_MAGIC: 0xFEEDFACE (32-bit)
			// MH_CIGAM: 0xCEFAEDFE (32-bit, byte-swapped)
			// MH_MAGIC_64: 0xFEEDFACF (64-bit)
			// MH_CIGAM_64: 0xCFFAEDFE (64-bit, byte-swapped)
			// FAT_MAGIC: 0xCAFEBABE (universal binary)
			// FAT_CIGAM: 0xBEBAFECA (universal binary, byte-swapped)
			const magic = buffer.readUInt32BE(0);
			return magic === 0xFEEDFACE || magic === 0xCEFAEDFE ||
				magic === 0xFEEDFACF || magic === 0xCFFAEDFE ||
				magic === 0xCAFEBABE || magic === 0xBEBAFECA;
		} catch {
			return false;
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
	public unpackArchive(archivePath: string): string {
		const dir = this.createTempDir();

		this.log(`Unpacking ${archivePath} to ${dir}`);
		this.runNoErrors('tar', '-xzf', archivePath, '-C', dir);
		this.log(`Unpacked ${archivePath} to ${dir}`);

		return dir;
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
	 * Kills a process and all its child processes.
	 * @param pid The process ID to kill.
	 */
	public killProcessTree(pid: number): void {
		this.log(`Killing process tree for PID: ${pid}`);
		if (os.platform() === 'win32') {
			spawnSync('taskkill', ['/T', '/F', '/PID', pid.toString()]);
		} else {
			process.kill(-pid, 'SIGKILL');
		}
		this.log(`Killed process tree for PID: ${pid}`);
	}

	/**
	 * Returns the Windows installation directory for VS Code based on the installation type and quality.
	 * @param type The type of installation ('user' or 'system').
	 * @returns The path to the VS Code installation directory.
	 */
	private getWindowsInstallDir(type: 'user' | 'system'): string {
		let parentDir: string;
		if (type === 'system') {
			parentDir = process.env['PROGRAMFILES'] || '';
		} else {
			parentDir = path.join(process.env['LOCALAPPDATA'] || '', 'Programs');
		}

		switch (this.quality) {
			case 'stable':
				return path.join(parentDir, 'Microsoft VS Code');
			case 'insider':
				return path.join(parentDir, 'Microsoft VS Code Insiders');
			case 'exploration':
				return path.join(parentDir, 'Microsoft VS Code Exploration');
		}
	}

	/**
	 * Installs a Microsoft Installer package silently.
	 * @param installerPath The path to the installer executable.
	 * @returns The path to the installed VS Code executable.
	 */
	public installWindowsApp(type: 'user' | 'system', installerPath: string): string {
		this.log(`Installing ${installerPath} in silent mode`);
		this.runNoErrors(installerPath, '/silent', '/mergetasks=!runcode');
		this.log(`Installed ${installerPath} successfully`);

		const appDir = this.getWindowsInstallDir(type);
		let entryPoint: string;
		switch (this.quality) {
			case 'stable':
				entryPoint = path.join(appDir, 'Code.exe');
				break;
			case 'insider':
				entryPoint = path.join(appDir, 'Code - Insiders.exe');
				break;
			case 'exploration':
				entryPoint = path.join(appDir, 'Code - Exploration.exe');
				break;
		}

		if (!fs.existsSync(entryPoint)) {
			this.error(`Desktop entry point does not exist: ${entryPoint}`);
		}

		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Uninstalls a Windows application silently.
	 * @param type The type of installation ('user' or 'system').
	 */
	public async uninstallWindowsApp(type: 'user' | 'system'): Promise<void> {
		const appDir = this.getWindowsInstallDir(type);
		const uninstallerPath = path.join(appDir, 'unins000.exe');
		if (!fs.existsSync(uninstallerPath)) {
			this.error(`Uninstaller does not exist: ${uninstallerPath}`);
		}

		this.log(`Uninstalling VS Code from ${appDir} in silent mode`);
		this.runNoErrors(uninstallerPath, '/silent');
		this.log(`Uninstalled VS Code from ${appDir} successfully`);

		await new Promise(resolve => setTimeout(resolve, 2000));
		if (fs.existsSync(appDir)) {
			this.error(`Installation directory still exists after uninstall: ${appDir}`);
		}
	}

	/**
	 * Prepares a macOS .app bundle for execution by removing the quarantine attribute.
	 * @param bundleDir The directory containing the .app bundle.
	 * @returns The path to the VS Code Electron executable.
	 */
	public installMacApp(bundleDir: string): string {
		let appName: string;
		switch (this.quality) {
			case 'stable':
				appName = 'Visual Studio Code.app';
				break;
			case 'insider':
				appName = 'Visual Studio Code - Insiders.app';
				break;
			case 'exploration':
				appName = 'Visual Studio Code - Exploration.app';
				break;
		}

		const entryPoint = path.join(bundleDir, appName, 'Contents/MacOS/Electron');
		if (!fs.existsSync(entryPoint)) {
			this.error(`Desktop entry point does not exist: ${entryPoint}`);
		}

		this.log(`VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Installs a Linux RPM package.
	 * @param packagePath The path to the RPM file.
	 * @returns The path to the installed VS Code executable.
	 */
	public installRpm(packagePath: string): string {
		this.log(`Installing ${packagePath} using RPM package manager`);
		this.runNoErrors('sudo', 'rpm', '-i', packagePath);
		this.log(`Installed ${packagePath} successfully`);

		const entryPoint = this.getEntryPoint('desktop', '/usr/bin');
		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Installs a Linux DEB package.
	 * @param packagePath The path to the DEB file.
	 * @returns The path to the installed VS Code executable.
	 */
	public installDeb(packagePath: string): string {
		this.log(`Installing ${packagePath} using DEB package manager`);
		this.runNoErrors('sudo', 'dpkg', '-i', packagePath);
		this.log(`Installed ${packagePath} successfully`);

		const entryPoint = this.getEntryPoint('desktop', '/usr/bin');
		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Installs a Linux Snap package.
	 * @param packagePath The path to the Snap file.
	 * @returns The path to the installed VS Code executable.
	 */
	public installSnap(packagePath: string): string {
		this.log(`Installing ${packagePath} using Snap package manager`);
		this.runNoErrors('sudo', 'snap', 'install', packagePath, '--classic', '--dangerous');
		this.log(`Installed ${packagePath} successfully`);

		const entryPoint = this.getEntryPoint('desktop', '/snap/bin');
		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Returns the entry point executable for the VS Code CLI or Desktop installation in the specified directory.
	 * @param dir The directory of the VS Code installation.
	 * @returns The path to the entry point executable.
	 */
	public getEntryPoint(type: 'cli' | 'desktop', dir: string): string {
		let suffix: string;
		switch (this.quality) {
			case 'stable':
				suffix = type === 'cli' ? '' : '';
				break;
			case 'insider':
				suffix = type === 'cli' ? '-insiders' : ' - Insiders';
				break;
			case 'exploration':
				suffix = type === 'cli' ? '-exploration' : ' - Exploration';
				break;
		}

		const extension = os.platform() === 'win32' ? '.exe' : '';
		const filePath = path.join(dir, `code${suffix}${extension}`);
		if (!fs.existsSync(filePath)) {
			this.error(`CLI entry point does not exist: ${filePath}`);
		}

		return filePath;
	}

	/**
	 * Creates a portable data directory in the specified unpacked VS Code directory.
	 * @param dir The directory where VS Code was unpacked.
	 * @returns The path to the created portable data directory.
	 */
	public createPortableDataDir(dir: string): string {
		const dataDir = path.join(dir, os.platform() === 'darwin' ? 'code-portable-data' : 'data');

		this.log(`Creating portable data directory: ${dataDir}`);
		fs.mkdirSync(dataDir, { recursive: true });
		this.log(`Created portable data directory: ${dataDir}`);

		return dataDir;
	}

	/**
	 * Returns the entry point executable for the VS Code server in the specified directory.
	 * @param dir The directory containing unpacked server files.
	 * @returns The path to the server entry point executable.
	 */
	public getServerEntryPoint(dir: string): string {
		const serverDir = fs.readdirSync(dir, { withFileTypes: true }).filter(o => o.isDirectory()).at(0)?.name;
		if (!serverDir) {
			this.error(`No subdirectories found in server directory: ${dir}`);
		}

		let filename: string;
		switch (this.quality) {
			case 'stable':
				filename = 'code-server';
				break;
			case 'insider':
				filename = 'code-server-insiders';
				break;
			case 'exploration':
				filename = 'code-server-exploration';
				break;
		}

		if (os.platform() === 'win32') {
			filename += '.cmd';
		}

		const entryPoint = path.join(dir, serverDir, 'bin', filename);
		if (!fs.existsSync(entryPoint)) {
			this.error(`Server entry point does not exist: ${entryPoint}`);
		}

		return entryPoint;
	}

	/**
	 * Returns the tunnel URL for the VS Code server including vscode-version parameter.
	 * @param baseUrl The base URL for the VS Code server.
	 * @returns The tunnel URL with vscode-version parameter.
	 */
	public getTunnelUrl(baseUrl: string): string {
		const url = new URL(baseUrl);
		url.searchParams.set('vscode-version', this.commit);
		return url.toString();
	}

	/**
	 * Launches a web browser for UI testing.
	 * @returns The launched Browser instance.
	 */
	public async launchBrowser(): Promise<Browser> {
		this.log(`Launching web browser`);
		switch (os.platform()) {
			case 'darwin':
				return await webkit.launch({ headless: false });
			case 'win32':
				return await chromium.launch({ channel: 'msedge', headless: false });
			default:
				return await chromium.launch({ channel: 'chrome', headless: false });
		}
	}

	/**
	 * Constructs a web server URL with optional token and folder parameters.
	 * @param port The port number of the web server.
	 * @param token The optional authentication token.
	 * @param folder The optional workspace folder path to open.
	 * @returns The constructed web server URL.
	 */
	public getWebServerUrl(port: string, token?: string, folder?: string): URL {
		const url = new URL(`http://localhost:${port}`);
		if (token) {
			url.searchParams.set('tkn', token);
		}
		if (folder) {
			folder = folder.replaceAll('\\', '/');
			if (!folder.startsWith('/')) {
				folder = `/${folder}`;
			}
			url.searchParams.set('folder', folder);
		}
		return url;
	}

	/**
	 * Returns a random alphanumeric token of length 10.
	 */
	public getRandomToken(): string {
		return Array.from({ length: 10 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
	}

	/**
	 * Returns a random port number between 3000 and 9999.
	 */
	public getRandomPort(): string {
		return String(Math.floor(Math.random() * 7000) + 3000);
	}
}
