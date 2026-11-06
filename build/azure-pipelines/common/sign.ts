/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

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

interface Params {
	readonly keyCode: string;
	readonly operationSetCode: string;
	readonly parameters: {
		readonly parameterName: string;
		readonly parameterValue: string;
	}[];
	readonly toolName: string;
	readonly toolVersion: string;
}

function getParams(type: string): Params[] {
	switch (type) {
		case 'sign-windows':
			return [
				{
					keyCode: 'CP-230012',
					operationSetCode: 'SigntoolSign',
					parameters: [
						{ parameterName: 'OpusName', parameterValue: 'VS Code' },
						{ parameterName: 'OpusInfo', parameterValue: 'https://code.visualstudio.com/' },
						{ parameterName: 'Append', parameterValue: '/as' },
						{ parameterName: 'FileDigest', parameterValue: '/fd "SHA256"' },
						{ parameterName: 'PageHash', parameterValue: '/NPH' },
						{ parameterName: 'TimeStamp', parameterValue: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256' }
					],
					toolName: 'sign',
					toolVersion: '1.0'
				},
				{
					keyCode: 'CP-230012',
					operationSetCode: 'SigntoolVerify',
					parameters: [
						{ parameterName: 'VerifyAll', parameterValue: '/all' }
					],
					toolName: 'sign',
					toolVersion: '1.0'
				}
			];
		case 'sign-windows-appx':
			return [
				{
					keyCode: 'CP-229979',
					operationSetCode: 'SigntoolSign',
					parameters: [
						{ parameterName: 'OpusName', parameterValue: 'VS Code' },
						{ parameterName: 'OpusInfo', parameterValue: 'https://code.visualstudio.com/' },
						{ parameterName: 'FileDigest', parameterValue: '/fd "SHA256"' },
						{ parameterName: 'PageHash', parameterValue: '/NPH' },
						{ parameterName: 'TimeStamp', parameterValue: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256' }
					],
					toolName: 'sign',
					toolVersion: '1.0'
				},
				{
					keyCode: 'CP-229979',
					operationSetCode: 'SigntoolVerify',
					parameters: [],
					toolName: 'sign',
					toolVersion: '1.0'
				}
			];
		case 'sign-pgp':
			return [{
				keyCode: 'CP-450779-Pgp',
				operationSetCode: 'LinuxSign',
				parameters: [],
				toolName: 'sign',
				toolVersion: '1.0'
			}];
		case 'sign-darwin':
			return [{
				keyCode: 'CP-401337-Apple',
				operationSetCode: 'MacAppDeveloperSign',
				parameters: [{ parameterName: 'Hardening', parameterValue: '--options=runtime' }],
				toolName: 'sign',
				toolVersion: '1.0'
			}];
		case 'notarize-darwin':
			return [{
				keyCode: 'CP-401337-Apple',
				operationSetCode: 'MacAppNotarize',
				parameters: [],
				toolName: 'sign',
				toolVersion: '1.0'
			}];
		case 'nuget':
			return [{
				keyCode: 'CP-401405',
				operationSetCode: 'NuGetSign',
				parameters: [],
				toolName: 'sign',
				toolVersion: '1.0'
			}, {
				keyCode: 'CP-401405',
				operationSetCode: 'NuGetVerify',
				parameters: [],
				toolName: 'sign',
				toolVersion: '1.0'
			}];
		default:
			throw new Error(`Sign type ${type} not found`);
	}
}

function isWindowsSignType(type: string): boolean {
	return type === 'sign-windows' || type === 'sign-windows-appx';
}

function isDarwinSignType(type: string): boolean {
	return type === 'sign-darwin' || type === 'notarize-darwin';
}

/**
 * ESRP's own session timeout. The Windows sign job times out after 90 minutes,
 * so Windows sessions have to give up well before that.
 */
function getSessionTimeoutMinutes(type: string): string {
	return isWindowsSignType(type) ? '60' : '120';
}

export const DEFAULT_ESRP_STALL_TIMEOUT_MINUTES = 20;

/**
 * How long a Windows ESRP session may wait on its remaining operations without
 * any of them completing. Across 115 sampled sign jobs the longest such wait was
 * 5.3 minutes, so a session waiting this long is stuck (one stuck operation has
 * held a job until its 90 minute limit).
 */
export function getEsrpStallTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
	const minutes = Number(env['VSCODE_ESRP_STALL_TIMEOUT_MINUTES']);
	return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ESRP_STALL_TIMEOUT_MINUTES) * 60_000;
}

/**
 * Tracks an ESRP session's progress from its output. ESRP prints
 * `N file(s) remaining, FileIds: ...` whenever its set of pending operations
 * changes and `Signed file: ...` for each file it replaces. In between it only
 * polls the status of the pending operations.
 */
export class EsrpProgress {
	remaining: number | undefined;
	fileIds = '';
	private lastProgressAt: number;
	private partialLine = '';

	constructor(now = Date.now()) {
		this.lastProgressAt = now;
	}

	write(chunk: string, now = Date.now()): void {
		const lines = (this.partialLine + chunk).split(/\r?\n/);
		this.partialLine = lines.pop() ?? '';
		for (const line of lines) {
			const remaining = /(\d+) file\(s\) remaining(?:, FileIds: (.*))?/.exec(line);
			if (remaining) {
				const count = Number(remaining[1]);
				if (count !== this.remaining) {
					this.remaining = count;
					this.lastProgressAt = now;
				}
				this.fileIds = remaining[2]?.trim() ?? '';
			} else if (line.includes('Signed file: ')) {
				this.lastProgressAt = now;
			}
		}
	}

	/** How long the session has waited without progress, once ESRP reported pending operations. */
	stalledForMs(now = Date.now()): number {
		return this.remaining ? now - this.lastProgressAt : 0;
	}
}

function killProcessTree(child: cp.ChildProcess): void {
	if (child.pid === undefined) {
		return;
	}
	if (process.platform === 'win32') {
		cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
	} else {
		child.kill('SIGKILL');
	}
}

/**
 * Runs an ESRP session and stops it once it stops making progress, so a stuck
 * operation fails the sign step in minutes instead of holding the job until its
 * time limit. The signed files are replaced in place as they complete, so the
 * session isn't resubmitted here. A stage retry signs fresh, unsigned artifacts.
 */
export async function runWithEsrpStallGuard(command: string, args: string[], stallTimeoutMs: number, pollIntervalMs = 15_000): Promise<{ exitCode: number | null; stalled?: EsrpProgress }> {
	const progress = new EsrpProgress();
	const child = cp.spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
	child.stdout!.on('data', (data: Buffer) => {
		process.stdout.write(data);
		progress.write(data.toString());
	});

	let stalled: EsrpProgress | undefined;
	let resolveExit!: (exitCode: number | null) => void;
	const exited = new Promise<number | null>((resolve, reject) => {
		resolveExit = resolve;
		child.once('error', reject);
		child.once('close', resolve);
	});
	const timer = setInterval(() => {
		if (progress.stalledForMs() >= stallTimeoutMs) {
			clearInterval(timer);
			stalled = progress;
			killProcessTree(child);
			// Don't wait on a process that survived the kill.
			setTimeout(() => resolveExit(null), 30_000).unref();
		}
	}, pollIntervalMs);

	try {
		return { exitCode: await exited, stalled };
	} finally {
		clearInterval(timer);
	}
}

export interface EsrpDownloadStallOptions {
	/** How long a download is measured before it can be called stalled. */
	readonly windowMs: number;
	/** The slowest download rate that is not a stall. */
	readonly minBytesPerSecond: number;
}

export const DEFAULT_ESRP_DOWNLOAD_STALL_WINDOW_SECONDS = 60;
export const DEFAULT_ESRP_DOWNLOAD_MIN_MB_PER_SECOND = 1;
export const MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS = 2;

/**
 * Some connections from Azure Storage to the macOS agents run at about 0.2 MB/s
 * for their whole life (IcM 891066261), where downloads normally run at about
 * 20 MB/s. ESRP downloads a signed file on a single connection without a
 * timeout, so such a download takes 25-40 minutes. Across 876 macOS downloads,
 * stalls averaged below 1 MB/s and healthy slow ones 1.5-3 MB/s.
 */
export function getEsrpDownloadStallOptions(env: NodeJS.ProcessEnv = process.env): EsrpDownloadStallOptions {
	const positive = (value: string | undefined, fallback: number) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
	};
	return {
		windowMs: positive(env['VSCODE_ESRP_DOWNLOAD_STALL_WINDOW_SECONDS'], DEFAULT_ESRP_DOWNLOAD_STALL_WINDOW_SECONDS) * 1000,
		minBytesPerSecond: positive(env['VSCODE_ESRP_DOWNLOAD_MIN_MB_PER_SECOND'], DEFAULT_ESRP_DOWNLOAD_MIN_MB_PER_SECOND) * 1024 * 1024,
	};
}

export interface EsrpDownloadStall {
	readonly file: string;
	readonly bytesPerSecond: number;
}

/**
 * Measures how fast ESRP downloads signed files. ESRP downloads each signed file
 * to `<file>.tmp` next to it, checks its hash and only then replaces the file,
 * so the growth of the `.tmp` files is the download rate.
 */
export class EsrpDownloadMonitor {
	private readonly samples = new Map<string, { readonly time: number; readonly size: number }[]>();
	private readonly options: EsrpDownloadStallOptions;

	constructor(options: EsrpDownloadStallOptions) {
		this.options = options;
	}

	/** Records the current sizes of the `.tmp` files and returns a download that stalled. */
	sample(sizes: ReadonlyMap<string, number>, now = Date.now()): EsrpDownloadStall | undefined {
		for (const file of [...this.samples.keys()]) {
			if (!sizes.has(file)) {
				this.samples.delete(file);
			}
		}
		for (const [file, size] of sizes) {
			let samples = this.samples.get(file);
			if (!samples) {
				samples = [];
				this.samples.set(file, samples);
			}
			samples.push({ time: now, size });
			// Keep the latest sample that is at least a window old, and the ones after it.
			while (samples.length > 1 && samples[1].time <= now - this.options.windowMs) {
				samples.shift();
			}
			const oldest = samples[0];
			if (oldest.time <= now - this.options.windowMs) {
				const bytesPerSecond = (size - oldest.size) / ((now - oldest.time) / 1000);
				if (bytesPerSecond < this.options.minBytesPerSecond) {
					return { file, bytesPerSecond };
				}
			}
		}
		return undefined;
	}
}

function globToRegExp(glob: string): RegExp {
	const source = glob.split('').map(c => c === '*' ? '[^/\\\\]*' : c === '?' ? '[^/\\\\]' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('');
	return new RegExp(`^${source}$`);
}

/** Returns the `.tmp` files of ESRP downloads in progress for the files of `pattern` in `folder`, with their sizes. */
export function getEsrpDownloadTempFiles(folder: string, pattern: string): Map<string, number> {
	const matches = globToRegExp(pattern);
	const result = new Map<string, number>();
	let entries: string[];
	try {
		entries = fs.readdirSync(folder);
	} catch {
		return result;
	}
	for (const entry of entries) {
		if (entry.endsWith('.tmp') && matches.test(entry.slice(0, -'.tmp'.length))) {
			try {
				result.set(path.join(folder, entry), fs.statSync(path.join(folder, entry)).size);
			} catch {
				// Moved into place since it was listed
			}
		}
	}
	return result;
}

/**
 * Runs an ESRP session for macOS files and stops it once one of its signed-file
 * downloads stalls. Killing the session leaves the original file in place (ESRP
 * replaces it only after a complete, verified download), so the caller can submit
 * the file again, which downloads it on a new connection.
 */
export async function runWithEsrpDownloadStallGuard(command: string, args: string[], getTempFiles: () => ReadonlyMap<string, number>, options: EsrpDownloadStallOptions, pollIntervalMs = 15_000): Promise<{ exitCode: number | null; stalled?: EsrpDownloadStall }> {
	const monitor = new EsrpDownloadMonitor(options);
	const child = cp.spawn(command, args, { stdio: 'inherit' });

	let stalled: EsrpDownloadStall | undefined;
	let resolveExit!: (exitCode: number | null) => void;
	const exited = new Promise<number | null>((resolve, reject) => {
		resolveExit = resolve;
		child.once('error', reject);
		child.once('close', resolve);
	});
	const timer = setInterval(() => {
		stalled = monitor.sample(getTempFiles());
		if (stalled) {
			clearInterval(timer);
			killProcessTree(child);
			// Don't wait on a process that survived the kill.
			setTimeout(() => resolveExit(null), 30_000).unref();
		}
	}, pollIntervalMs);

	try {
		return { exitCode: await exited, stalled };
	} finally {
		clearInterval(timer);
	}
}

function removeEsrpDownloadTempFiles(folder: string, pattern: string): void {
	for (const file of getEsrpDownloadTempFiles(folder, pattern).keys()) {
		// ESRP opens the .tmp file without truncating it, so a leftover one would fail its hash check.
		fs.rmSync(file, { force: true });
	}
}

/**
 * Runs ESRP sessions for macOS files until one finishes without a stalled
 * download, submitting the files again after a stall at most
 * MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS times. Returns the exit code of the
 * last session.
 */
export async function runWithEsrpDownloadResubmission(command: string, createArgs: () => string[], folderPath: string, pattern: string, options: EsrpDownloadStallOptions, onStall: (stall: EsrpDownloadStall, attempt: number) => void, pollIntervalMs = 15_000): Promise<number | null> {
	for (let attempt = 1; ; attempt++) {
		removeEsrpDownloadTempFiles(folderPath, pattern);
		// The last session isn't stopped, so the files get signed even if every download stalls.
		const guard = attempt <= MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS;
		const { exitCode, stalled } = await runWithEsrpDownloadStallGuard(command, createArgs(), () => guard ? getEsrpDownloadTempFiles(folderPath, pattern) : new Map(), options, pollIntervalMs);
		if (!stalled) {
			return exitCode;
		}
		onStall(stalled, attempt);
	}
}

async function runDarwinSession(type: string, folderPath: string, pattern: string, createArgs: () => string[]): Promise<void> {
	const options = getEsrpDownloadStallOptions();
	const exitCode = await runWithEsrpDownloadResubmission('dotnet', createArgs, folderPath, pattern, options, (stalled, attempt) => {
		const rate = (stalled.bytesPerSecond / 1024 / 1024).toFixed(2);
		const file = path.basename(stalled.file, '.tmp');
		console.log(`[esrp-stall] type=${type} file=${file} rate=${rate}MB/s window=${options.windowMs / 1000}s attempt=${attempt} action=resubmit`);
		console.log(`##vso[task.logissue type=warning]ESRP download of ${file} stalled at ${rate} MB/s; submitting it again (attempt ${attempt + 1}).`);
	});
	if (exitCode !== 0) {
		console.error('ESRP failed');
		console.error(`dotnet exited with code ${exitCode}`);
		process.exit(1);
	}
}

export function main([esrpCliPath, type, folderPath, pattern]: string[]): void | Promise<void> {
	const tmp = new Temp();
	process.on('exit', () => tmp.dispose());

	const patternPath = tmp.tmpNameSync();
	fs.writeFileSync(patternPath, pattern);

	const paramsPath = tmp.tmpNameSync();
	fs.writeFileSync(paramsPath, JSON.stringify(getParams(type)));

	const dotnetVersion = cp.execSync('dotnet --version', { encoding: 'utf8' }).trim();
	const adoTaskVersion = path.basename(path.dirname(path.dirname(esrpCliPath)));

	// esrpcli deletes the encryption key file once it has read it, so every session
	// needs a newly encrypted token.
	const createArgs = (): string[] => {
		const key = crypto.randomBytes(32);
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
		const encryptedToken = cipher.update(process.env['SYSTEM_ACCESSTOKEN']!.trim(), 'utf8', 'hex') + cipher.final('hex');

		const encryptionDetailsPath = tmp.tmpNameSync();
		fs.writeFileSync(encryptionDetailsPath, JSON.stringify({ key: key.toString('hex'), iv: iv.toString('hex') }));

		const encryptedTokenPath = tmp.tmpNameSync();
		fs.writeFileSync(encryptedTokenPath, encryptedToken);

		const federatedTokenData = {
			jobId: process.env['SYSTEM_JOBID'],
			planId: process.env['SYSTEM_PLANID'],
			projectId: process.env['SYSTEM_TEAMPROJECTID'],
			hub: process.env['SYSTEM_HOSTTYPE'],
			uri: process.env['SYSTEM_COLLECTIONURI'],
			managedIdentityId: process.env['VSCODE_ESRP_CLIENT_ID'],
			managedIdentityTenantId: process.env['VSCODE_ESRP_TENANT_ID'],
			serviceConnectionId: process.env['VSCODE_ESRP_SERVICE_CONNECTION_ID'],
			tempDirectory: os.tmpdir(),
			systemAccessToken: encryptedTokenPath,
			encryptionKey: encryptionDetailsPath
		};

		return [
			esrpCliPath,
			'vsts.sign',
			'-a', process.env['ESRP_CLIENT_ID']!,
			'-d', process.env['ESRP_TENANT_ID']!,
			'-k', JSON.stringify({ akv: 'vscode-esrp' }),
			'-z', JSON.stringify({ akv: 'vscode-esrp', cert: 'esrp-sign' }),
			'-f', folderPath,
			'-p', patternPath,
			'-u', 'false',
			'-x', 'regularSigning',
			'-b', 'input.json',
			'-l', 'AzSecPack_PublisherPolicyProd.xml',
			'-y', 'inlineSignParams',
			'-j', paramsPath,
			'-c', '9997',
			'-t', getSessionTimeoutMinutes(type),
			'-g', '10',
			'-v', 'Tls12',
			'-s', 'https://api.esrp.microsoft.com/api/v1',
			'-m', '0',
			'-o', 'Microsoft',
			'-i', 'https://www.microsoft.com',
			'-n', '5',
			'-r', 'true',
			'-w', dotnetVersion,
			'-skipAdoReportAttachment', 'false',
			'-pendingAnalysisWaitTimeoutMinutes', '5',
			'-adoTaskVersion', adoTaskVersion,
			'-resourceUri', 'https://msazurecloud.onmicrosoft.com/api.esrp.microsoft.com',
			'-esrpClientId', process.env['ESRP_CLIENT_ID']!,
			'-useMSIAuthentication', 'true',
			'-federatedTokenData', JSON.stringify(federatedTokenData)
		];
	};

	if (isWindowsSignType(type)) {
		const stallTimeoutMs = getEsrpStallTimeoutMs();
		return runWithEsrpStallGuard('dotnet', createArgs(), stallTimeoutMs).then(({ exitCode, stalled }) => {
			if (stalled) {
				console.log(`##vso[task.logissue type=error]ESRP signing stalled: ${stalled.remaining} file(s) still pending after ${stallTimeoutMs / 60_000} minutes without progress (FileIds: ${stalled.fileIds}). Retry the stage, not this step: files signed so far were replaced in place.`);
				process.exit(1);
			}
			if (exitCode !== 0) {
				console.error('ESRP failed');
				console.error(`dotnet exited with code ${exitCode}`);
				process.exit(1);
			}
		}, err => {
			console.error('ESRP failed');
			console.error(err);
			process.exit(1);
		});
	}

	if (isDarwinSignType(type)) {
		return runDarwinSession(type, folderPath, pattern, createArgs).catch(err => {
			console.error('ESRP failed');
			console.error(err);
			process.exit(1);
		});
	}

	try {
		cp.execFileSync('dotnet', createArgs(), { stdio: 'inherit' });
	} catch (err) {
		console.error('ESRP failed');
		console.error(err);
		process.exit(1);
	}
}

if (import.meta.main) {
	await main(process.argv.slice(2));
	process.exit(0);
}
