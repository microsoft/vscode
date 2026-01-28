/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync, SpawnSyncReturns } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import { test } from 'mocha';
import fetch, { Response } from 'node-fetch';
import os from 'os';
import path from 'path';
import { Browser, chromium, Page, webkit } from 'playwright';
import { Capability, detectCapabilities } from './detectors.js';

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
	private static readonly codesignExclude = /node_modules\/(@parcel\/watcher\/build\/Release\/watcher\.node|@vscode\/deviceid\/build\/Release\/windows\.node|@vscode\/ripgrep\/bin\/rg|@vscode\/spdlog\/build\/Release\/spdlog.node|kerberos\/build\/Release\/kerberos.node|@vscode\/native-watchdog\/build\/Release\/watchdog\.node|node-pty\/build\/Release\/(pty\.node|spawn-helper)|vsda\/build\/Release\/vsda\.node|native-watchdog\/build\/Release\/watchdog\.node)$/;

	private readonly tempDirs = new Set<string>();
	private readonly wslTempDirs = new Set<string>();
	private nextPort = 3010;

	public constructor(public readonly options: Readonly<{
		quality: 'stable' | 'insider' | 'exploration';
		commit: string;
		verbose: boolean;
		cleanup: boolean;
		checkSigning: boolean;
		headlessBrowser: boolean;
		downloadOnly: boolean;
	}>) {
	}

	/**
	 * Returns true if the current process is running as root.
	 */
	public readonly isRootUser = process.getuid?.() === 0;

	/**
	 * Returns the detected capabilities of the current system.
	 */
	public readonly capabilities = detectCapabilities();

	/**
	 * Returns the OS temp directory with expanded long names on Windows.
	 */
	public readonly osTempDir = (function () {
		let tempDir = fs.realpathSync(os.tmpdir());

		// On Windows, expand short 8.3 file names to long names
		if (os.platform() === 'win32') {
			const result = spawnSync('powershell', ['-Command', `(Get-Item "${tempDir}").FullName`], { encoding: 'utf-8' });
			if (result.status === 0 && result.stdout) {
				tempDir = result.stdout.trim();
			}
		}

		return tempDir;
	})();

	/**
	 * Runs a test only if the required capabilities are present.
	 * @param name The name of the test.
	 * @param require The required capabilities for the test.
	 * @param fn The test function.
	 * @returns The Mocha test object or void if the test is skipped.
	 */
	public test(name: string, require: Capability[], fn: () => Promise<void>): Mocha.Test | void {
		if (!this.options.downloadOnly && require.some(o => !this.capabilities.has(o))) {
			return;
		}

		const self = this;
		return test(name, async function () {
			self.log(`Starting test: ${name}`);

			const homeDir = os.homedir();
			process.chdir(homeDir);
			self.log(`Changed working directory to: ${homeDir}`);

			try {
				await fn();

			} catch (error) {
				self.log(`Test failed with error: ${error instanceof Error ? error.message : String(error)}`);
				throw error;

			} finally {
				process.chdir(homeDir);
				self.log(`Changed working directory to: ${homeDir}`);

				if (self.options.cleanup) {
					self.cleanup();
				}

				self.log(`Finished test: ${name}`);
			}
		});
	}

	/**
	 * The console outputs collected during the current test.
	 */
	public consoleOutputs: string[] = [];

	/**
	 * Logs a message with a timestamp.
	 */
	public log(message: string) {
		const line = `[${new Date().toISOString()}] ${message}`;
		this.consoleOutputs.push(line);
		if (this.options.verbose) {
			console.log(line);
		}
	}

	/**
	 * Logs an error message and throws an Error.
	 */
	public error(message: string): never {
		const line = `[${new Date().toISOString()}] ERROR: ${message}`;
		this.consoleOutputs.push(line);
		console.error(line);
		throw new Error(message);
	}

	/**
	 * Creates a new temporary directory and returns its path.
	 */
	public createTempDir(): string {
		const tempDir = fs.mkdtempSync(path.join(this.osTempDir, 'vscode-sanity'));
		this.log(`Created temp directory: ${tempDir}`);
		this.tempDirs.add(tempDir);
		return tempDir;
	}

	/**
	 * Creates a new temporary directory in WSL and returns its path.
	 */
	public createWslTempDir(): string {
		const tempDir = `/tmp/vscode-sanity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		this.log(`Creating WSL temp directory: ${tempDir}`);
		this.runNoErrors('wsl', 'mkdir', '-p', tempDir);
		this.wslTempDirs.add(tempDir);
		return tempDir;
	}

	/**
	 * Deletes a directory in WSL.
	 * @param dir The WSL directory path to delete.
	 */
	public deleteWslDir(dir: string): void {
		this.log(`Deleting WSL directory: ${dir}`);
		this.runNoErrors('wsl', 'rm', '-rf', dir);
	}

	/**
	 * Converts a Windows path to a WSL path.
	 * @param windowsPath The Windows path to convert (e.g., 'C:\Users\test').
	 * @returns The WSL path (e.g., '/mnt/c/Users/test').
	 */
	public toWslPath(windowsPath: string): string {
		return windowsPath
			.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
			.replaceAll('\\', '/');
	}

	/**
	 * Returns the name of the default WSL distribution.
	 * @returns The default WSL distribution name (e.g., 'Ubuntu').
	 */
	public getDefaultWslDistro(): string {
		const result = this.runNoErrors('wsl', '--list', '--quiet');
		const distro = result.stdout.trim().split('\n')[0].replace(/\0/g, '').trim();
		if (!distro) {
			this.error('No WSL distribution found');
		}
		this.log(`Default WSL distribution: ${distro}`);
		return distro;
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

		for (const dir of this.wslTempDirs) {
			try {
				this.deleteWslDir(dir);
			} catch (error) {
				this.log(`Failed to delete WSL temp directory: ${dir}: ${error}`);
			}
		}
		this.wslTempDirs.clear();
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
		const url = `https://update.code.visualstudio.com/api/versions/commit:${this.options.commit}/${target}/${this.options.quality}`;

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
		if (!this.options.checkSigning || !this.capabilities.has('windows')) {
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
		if (!this.options.checkSigning || !this.capabilities.has('windows')) {
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
		if (!this.options.checkSigning || !this.capabilities.has('darwin')) {
			this.log(`Skipping codesign signature validation for ${filePath} (signing checks disabled)`);
			return;
		}

		this.log(`Validating codesign signature for ${filePath}`);

		const result = this.run('codesign', '--verify', '--deep', '--strict', '--verbose', filePath);
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
		if (!this.options.checkSigning || !this.capabilities.has('darwin')) {
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
			const file = fs.openSync(filePath, 'r');
			const buffer = Buffer.alloc(4);
			fs.readSync(file, buffer, 0, 4, 0);
			fs.closeSync(file);
			const magic = buffer.readUInt32BE(0);
			return magic === 0xFEEDFACE || magic === 0xCEFAEDFE || magic === 0xFEEDFACF ||
				magic === 0xCFFAEDFE || magic === 0xCAFEBABE || magic === 0xBEBAFECA;
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
		this.runNoErrors('tar', '-xzf', archivePath, '-C', dir, '--no-same-permissions');
		this.log(`Unpacked ${archivePath} to ${dir}`);

		return dir;
	}

	/**
	 * Mounts a macOS DMG file and returns the mount point.
	 * @param dmgPath The path to the DMG file.
	 * @returns The path to the mounted volume.
	 */
	public mountDmg(dmgPath: string): string {
		this.log(`Mounting DMG ${dmgPath}`);
		const result = this.runNoErrors('hdiutil', 'attach', dmgPath, '-nobrowse', '-readonly');

		// Parse the output to find the mount point (last column of the last line)
		const lines = result.stdout.trim().split('\n');
		const lastLine = lines[lines.length - 1];
		const mountPoint = lastLine.split('\t').pop()?.trim();

		if (!mountPoint || !fs.existsSync(mountPoint)) {
			this.error(`Failed to find mount point for DMG ${dmgPath}`);
		}

		this.log(`Mounted DMG at ${mountPoint}`);
		return mountPoint;
	}

	/**
	 * Unmounts a macOS DMG volume.
	 * @param mountPoint The path to the mounted volume.
	 */
	public unmountDmg(mountPoint: string): void {
		this.log(`Unmounting DMG ${mountPoint}`);
		this.runNoErrors('hdiutil', 'detach', mountPoint);
		this.log(`Unmounted DMG ${mountPoint}`);
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

		switch (this.options.quality) {
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
		switch (this.options.quality) {
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
	public async uninstallWindowsApp(type: 'user' | 'system') {
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
	 * Installs VS Code Linux DEB package.
	 * @param packagePath The path to the DEB file.
	 * @returns The path to the installed VS Code executable.
	 */
	public installDeb(packagePath: string): string {
		this.log(`Installing ${packagePath} using DEB package manager`);
		if (this.isRootUser) {
			this.runNoErrors('dpkg', '-i', packagePath);
		} else {
			this.runNoErrors('sudo', 'dpkg', '-i', packagePath);
		}
		this.log(`Installed ${packagePath} successfully`);

		const name = this.getLinuxBinaryName();
		const entryPoint = path.join('/usr/share', name, name);
		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Uninstalls VS Code Linux DEB package.
	 */
	public async uninstallDeb() {
		const name = this.getLinuxBinaryName();
		const packagePath = path.join('/usr/share', name, name);

		this.log(`Uninstalling DEB package ${packagePath}`);
		if (this.isRootUser) {
			this.runNoErrors('dpkg', '-r', name);
		} else {
			this.runNoErrors('sudo', 'dpkg', '-r', name);
		}
		this.log(`Uninstalled DEB package ${packagePath} successfully`);

		await new Promise(resolve => setTimeout(resolve, 1000));
		if (fs.existsSync(packagePath)) {
			this.error(`Package still exists after uninstall: ${packagePath}`);
		}
	}

	/**
	 * Installs VS Code Linux RPM package.
	 * @param packagePath The path to the RPM file.
	 * @returns The path to the installed VS Code executable.
	 */
	public installRpm(packagePath: string): string {
		this.log(`Installing ${packagePath} using RPM package manager`);
		if (this.isRootUser) {
			this.runNoErrors('rpm', '-i', packagePath);
		} else {
			this.runNoErrors('sudo', 'rpm', '-i', packagePath);
		}
		this.log(`Installed ${packagePath} successfully`);

		const name = this.getLinuxBinaryName();
		const entryPoint = path.join('/usr/share', name, name);
		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Uninstalls VS Code Linux RPM package.
	 */
	public async uninstallRpm() {
		const name = this.getLinuxBinaryName();
		const packagePath = path.join('/usr/bin', name);

		this.log(`Uninstalling RPM package ${packagePath}`);
		if (this.isRootUser) {
			this.runNoErrors('rpm', '-e', name);
		} else {
			this.runNoErrors('sudo', 'rpm', '-e', name);
		}
		this.log(`Uninstalled RPM package ${packagePath} successfully`);

		await new Promise(resolve => setTimeout(resolve, 1000));
		if (fs.existsSync(packagePath)) {
			this.error(`Package still exists after uninstall: ${packagePath}`);
		}
	}

	/**
	 * Installs VS Code Linux Snap package.
	 * @param packagePath The path to the Snap file.
	 * @returns The path to the installed VS Code executable.
	 */
	public installSnap(packagePath: string): string {
		this.log(`Installing ${packagePath} using Snap package manager`);
		if (this.isRootUser) {
			this.runNoErrors('snap', 'install', packagePath, '--classic', '--dangerous');
		} else {
			this.runNoErrors('sudo', 'snap', 'install', packagePath, '--classic', '--dangerous');
		}
		this.log(`Installed ${packagePath} successfully`);

		// Snap wrapper scripts are in /snap/bin, but actual Electron binary is in /snap/<package>/current/usr/share/
		const name = this.getLinuxBinaryName();
		const entryPoint = `/snap/${name}/current/usr/share/${name}/${name}`;
		this.log(`Installed VS Code executable at: ${entryPoint}`);
		return entryPoint;
	}

	/**
	 * Uninstalls VS Code Linux Snap package.
	 */
	public async uninstallSnap() {
		const name = this.getLinuxBinaryName();
		const packagePath = path.join('/snap/bin', name);

		this.log(`Uninstalling Snap package ${packagePath}`);
		if (this.isRootUser) {
			this.runNoErrors('snap', 'remove', name);
		} else {
			this.runNoErrors('sudo', 'snap', 'remove', name);
		}
		this.log(`Uninstalled Snap package ${packagePath} successfully`);

		await new Promise(resolve => setTimeout(resolve, 1000));
		if (fs.existsSync(packagePath)) {
			this.error(`Package still exists after uninstall: ${packagePath}`);
		}
	}

	/**
	 * Returns the Linux binary name based on quality.
	 */
	private getLinuxBinaryName(): string {
		switch (this.options.quality) {
			case 'stable':
				return 'code';
			case 'insider':
				return 'code-insiders';
			case 'exploration':
				return 'code-exploration';
		}
	}

	/**
	 * Returns the entry point executable for the VS Code Desktop installation in the specified directory.
	 * @param dir The directory of the VS Code installation.
	 * @returns The path to the entry point executable.
	 */
	public getDesktopEntryPoint(dir: string): string {
		let filePath: string = '';

		switch (os.platform()) {
			case 'darwin': {
				let appName: string;
				switch (this.options.quality) {
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
				filePath = path.join(dir, appName, 'Contents/MacOS/Electron');
				break;
			}
			case 'linux': {
				let binaryName: string;
				switch (this.options.quality) {
					case 'stable':
						binaryName = `code`;
						break;
					case 'insider':
						binaryName = `code-insiders`;
						break;
					case 'exploration':
						binaryName = `code-exploration`;
						break;
				}
				filePath = path.join(dir, binaryName);
				break;
			}
			case 'win32': {
				let exeName: string;
				switch (this.options.quality) {
					case 'stable':
						exeName = 'Code.exe';
						break;
					case 'insider':
						exeName = 'Code - Insiders.exe';
						break;
					case 'exploration':
						exeName = 'Code - Exploration.exe';
						break;
				}
				filePath = path.join(dir, exeName);
				break;
			}
		}

		if (!filePath || !fs.existsSync(filePath)) {
			this.error(`Desktop entry point does not exist: ${filePath}`);
		}

		return filePath;
	}

	/**
	 * Returns the entry point executable for the VS Code CLI in the specified directory.
	 * @param dir The directory containing unpacked CLI files.
	 * @returns The path to the CLI entry point executable.
	 */
	public getCliEntryPoint(dir: string): string {
		let filename: string;
		switch (this.options.quality) {
			case 'stable':
				filename = 'code';
				break;
			case 'insider':
				filename = 'code-insiders';
				break;
			case 'exploration':
				filename = 'code-exploration';
				break;
		}

		if (os.platform() === 'win32') {
			filename += '.exe';
		}

		const entryPoint = path.join(dir, filename);
		if (!fs.existsSync(entryPoint)) {
			this.error(`CLI entry point does not exist: ${entryPoint}`);
		}

		return entryPoint;
	}

	/**
	 * Returns the entry point executable for the VS Code server in the specified directory.
	 * @param dir The directory containing unpacked server files.
	 * @param forWsl If true, returns the Linux entry point (for running in WSL on Windows).
	 * @returns The path to the server entry point executable.
	 */
	public getServerEntryPoint(dir: string, forWsl = false): string {
		let filename: string;
		switch (this.options.quality) {
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

		if (os.platform() === 'win32' && !forWsl) {
			filename += '.cmd';
		}

		const entryPoint = path.join(this.getFirstSubdirectory(dir), 'bin', filename);
		if (!fs.existsSync(entryPoint)) {
			this.error(`Server entry point does not exist: ${entryPoint}`);
		}

		return entryPoint;
	}

	/**
	 * Returns the first subdirectory within the specified directory.
	 */
	public getFirstSubdirectory(dir: string): string {
		const subDir = fs.readdirSync(dir, { withFileTypes: true }).filter(o => o.isDirectory()).at(0)?.name;
		if (!subDir) {
			this.error(`No subdirectories found in directory: ${dir}`);
		}
		return path.join(dir, subDir);
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
	 * Returns the tunnel URL for the VS Code server including vscode-version parameter.
	 * @param baseUrl The base URL for the VS Code server.
	 * @returns The tunnel URL with vscode-version parameter.
	 */
	public getTunnelUrl(baseUrl: string): string {
		const url = new URL(baseUrl);
		url.searchParams.set('vscode-version', this.options.commit);
		return url.toString();
	}

	/**
	 * Launches a web browser for UI testing.
	 * @returns The launched Browser instance.
	 */
	public async launchBrowser(): Promise<Browser> {
		this.log(`Launching web browser`);
		const headless = this.options.headlessBrowser;
		switch (os.platform()) {
			case 'darwin': {
				return await webkit.launch({ headless });
			}
			case 'win32': {
				const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
				this.log(`Using Chromium executable at: ${executablePath}`);
				return await chromium.launch({ headless, executablePath });
			}
			case 'linux':
			default: {
				const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] ?? '/usr/bin/chromium-browser';
				this.log(`Using Chromium executable at: ${executablePath}`);
				return await chromium.launch({
					headless,
					executablePath,
					args: [
						'--disable-gpu',
						'--disable-gpu-compositing',
						'--disable-software-rasterizer',
						'--no-zygote',
					]
				});
			}
		}
	}

	/**
	 * Awaits a page promise and sets the default timeout.
	 * @param pagePromise The promise that resolves to a Page.
	 * @returns The page with the timeout configured.
	 */
	public async getPage(pagePromise: Promise<Page>): Promise<Page> {
		const page = await pagePromise;
		page.setDefaultTimeout(3 * 60 * 1000);
		return page;
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
	 * Returns a unique port number, starting from 3010 and incrementing.
	 */
	public getUniquePort(): string {
		return String(this.nextPort++);
	}

	/**
	 * Returns the default WSL server extensions directory path.
	 * @returns The path to the extensions directory (e.g., '~/.vscode-server-insiders/extensions').
	 */
	public getWslServerExtensionsDir(): string {
		let serverDir: string;
		switch (this.options.quality) {
			case 'stable':
				serverDir = '.vscode-server';
				break;
			case 'insider':
				serverDir = '.vscode-server-insiders';
				break;
			case 'exploration':
				serverDir = '.vscode-server-exploration';
				break;
		}
		return `~/${serverDir}/extensions`;
	}
}
