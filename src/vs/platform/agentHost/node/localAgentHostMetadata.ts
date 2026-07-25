/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../base/common/path.js';
import { vArray, vLiteral, vNumber, vObj, vString } from '../../../base/common/validation.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';

const metadataSchemaVersion = 1;
const metadataDirectoryName = 'agent-host';
const endpointDirectoryName = 'local-endpoint';
const metadataFileName = 'metadata.json';

export interface ILocalAgentHostEndpointMetadata {
	readonly type: 'editor';
	readonly schemaVersion: typeof metadataSchemaVersion;
	readonly pid: number;
	readonly instanceId: string;
	readonly endpointPath: string;
	readonly connectionToken: string;
	readonly protocolVersion: string;
}

const metadataValidator = vArray(vObj({
	type: vLiteral('editor'),
	schemaVersion: vNumber(),
	pid: vNumber(),
	instanceId: vString(),
	endpointPath: vString(),
	connectionToken: vString(),
	protocolVersion: vString(),
}));

export function createLocalAgentHostEndpointMetadata(userDataPath: string): ILocalAgentHostEndpointMetadata {
	const instanceId = randomBytes(16).toString('base64url');
	return {
		type: 'editor',
		schemaVersion: metadataSchemaVersion,
		pid: process.pid,
		instanceId,
		endpointPath: getEndpointPath(userDataPath, instanceId),
		connectionToken: randomBytes(32).toString('base64url'),
		protocolVersion: PROTOCOL_VERSION,
	};
}

export async function prepareLocalAgentHostEndpointMetadataDirectory(userDataPath: string): Promise<void> {
	const directory = getMetadataDirectory(userDataPath);
	await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
	const stat = await fs.promises.lstat(directory);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`Local agent host endpoint metadata directory is not a directory: ${directory}`);
	}

	if (process.platform === 'win32') {
		await applyWindowsOwnerOnlyAcl(directory);
	} else {
		if (process.getuid && stat.uid !== process.getuid()) {
			throw new Error(`Local agent host endpoint metadata directory is not owned by the current user: ${directory}`);
		}
		await fs.promises.chmod(directory, 0o700);
	}
}

export async function prepareLocalAgentHostEndpointSocketDirectory(userDataPath: string): Promise<void> {
	if (process.platform !== 'win32') {
		const directory = getSocketDirectory(userDataPath);
		await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
		const stat = await fs.promises.lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error(`Local agent host endpoint socket directory is not a directory: ${directory}`);
		}
		if (process.getuid && stat.uid !== process.getuid()) {
			throw new Error(`Local agent host endpoint socket directory is not owned by the current user: ${directory}`);
		}
		await fs.promises.chmod(directory, 0o700);
	}
}

export async function publishLocalAgentHostEndpointMetadata(userDataPath: string, metadata: ILocalAgentHostEndpointMetadata): Promise<void> {
	const metadataPath = getMetadataPath(userDataPath);
	const temporaryPath = `${metadataPath}.${metadata.instanceId}.tmp`;
	const entries = readMetadata(metadataPath).filter(entry => entry.pid !== metadata.pid || entry.type !== metadata.type);
	entries.push(metadata);
	const handle = await fs.promises.open(temporaryPath, 'wx', 0o600);
	try {
		await handle.writeFile(JSON.stringify(entries), 'utf8');
		await handle.sync();
	} finally {
		await handle.close();
	}

	try {
		await fs.promises.rename(temporaryPath, metadataPath);
	} finally {
		await fs.promises.rm(temporaryPath, { force: true });
	}
}

export function cleanupLocalAgentHostEndpointMetadataSync(userDataPath: string, owner: ILocalAgentHostEndpointMetadata): void {
	const metadataPath = getMetadataPath(userDataPath);
	const entries = readMetadata(metadataPath);
	const remaining = entries.filter(entry => entry.pid !== owner.pid || entry.instanceId !== owner.instanceId || entry.type !== owner.type);
	if (remaining.length === entries.length) {
		return;
	}
	if (remaining.length === 0) {
		fs.rmSync(metadataPath, { force: true });
	} else {
		fs.writeFileSync(metadataPath, JSON.stringify(remaining), { encoding: 'utf8', mode: 0o600 });
	}
}

export function cleanupLocalAgentHostEndpointSocketSync(endpointPath: string): void {
	if (process.platform !== 'win32') {
		fs.rmSync(endpointPath, { force: true });
	}
}

function getMetadataDirectory(userDataPath: string): string {
	return join(userDataPath, metadataDirectoryName, endpointDirectoryName);
}

function getMetadataPath(userDataPath: string): string {
	return join(getMetadataDirectory(userDataPath), metadataFileName);
}

function getSocketDirectory(userDataPath: string): string {
	const owner = process.getuid?.().toString() ?? '';
	const hash = createHash('sha256').update(`${owner}:${userDataPath}`).digest('hex').slice(0, 12);
	return join(os.tmpdir(), `vscode-ah-${hash}`);
}

function getEndpointPath(userDataPath: string, instanceId: string): string {
	if (process.platform === 'win32') {
		const userDataHash = createHash('sha256').update(userDataPath).digest('hex');
		return `\\\\.\\pipe\\vscode-agent-host-${userDataHash}-${instanceId}`;
	}
	return join(getSocketDirectory(userDataPath), `${instanceId}.sock`);
}

function readMetadata(path: string): ILocalAgentHostEndpointMetadata[] {
	try {
		const stat = fs.lstatSync(path);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return [];
		}
		const result = metadataValidator.validate(JSON.parse(fs.readFileSync(path, 'utf8')));
		if (result.error) {
			return [];
		}
		return result.content
			.filter(entry => entry.schemaVersion === metadataSchemaVersion)
			.map(entry => ({ ...entry, schemaVersion: metadataSchemaVersion }));
	} catch (error) {
		if (isNotFound(error) || error instanceof SyntaxError) {
			return [];
		}
		throw error;
	}
}

async function applyWindowsOwnerOnlyAcl(path: string): Promise<void> {
	const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
	if (!systemRoot) {
		throw new Error('Unable to resolve the Windows system directory for local agent host metadata.');
	}
	const systemDirectory = join(systemRoot, 'System32');
	const whoAmI = await runWindowsCommand(join(systemDirectory, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
	const sid = whoAmI.match(/S-\d+(?:-\d+)+/)?.[0];
	if (!sid) {
		throw new Error('Unable to determine the current Windows user SID for local agent host metadata.');
	}
	const icacls = join(systemDirectory, 'icacls.exe');
	await runWindowsCommand(icacls, [path, '/reset']);
	await runWindowsCommand(icacls, [
		path,
		'/inheritance:r',
		'/grant:r',
		`*${sid}:(OI)(CI)F`,
		'*S-1-5-18:(OI)(CI)F',
		'*S-1-5-32-544:(OI)(CI)F',
	]);
}

function runWindowsCommand(command: string, args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, [...args], { encoding: 'utf8', windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(String(stdout)));
	});
}

function isNotFound(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}
