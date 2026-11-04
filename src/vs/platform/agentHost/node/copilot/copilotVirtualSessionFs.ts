/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionFsConfig, SessionFsFileInfo, SessionFsProvider } from '@github/copilot-sdk';
import { SequencerByKey } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { posix } from '../../../../base/common/path.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, FileSystemProviderCapabilities, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { toAgentClientUri } from '../../common/agentClientUri.js';
import { CopilotWorkspace, createCopilotSdkPathMapper, ICopilotSdkPathMapper } from './copilotWorkspace.js';

type VirtualWorkspace = Extract<CopilotWorkspace, { kind: 'virtual' }>;

function normalizePath(path: string): string {
	if (!posix.isAbsolute(path)) {
		throw new Error(`Expected an absolute session filesystem path: ${path}`);
	}
	return posix.normalize(path).replace(/\/$/, '') || '/';
}

function isWithin(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

function isNotFound(error: unknown): boolean {
	return error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND;
}

export function createCopilotVirtualSessionFsConfig(workspace: VirtualWorkspace, sessionStatePath: string): SessionFsConfig {
	const initialCwd = createCopilotSdkPathMapper(workspace).rootSdkPath;
	const statePath = normalizePath(sessionStatePath);
	if (statePath === '/' || isWithin(initialCwd, statePath) || isWithin(statePath, initialCwd)) {
		throw new Error('Session state and virtual workspace paths must not overlap');
	}
	return { initialCwd, sessionStatePath: statePath, conventions: 'posix', capabilities: { binary: true } };
}

/** Routes SDK filesystem operations to durable host session state or the currently connected workspace owner. */
export class CopilotVirtualSessionFs implements SessionFsProvider {
	readonly pathMapper: ICopilotSdkPathMapper;
	private readonly sessionStatePath: string;
	private readonly writes = new SequencerByKey<string>();

	constructor(
		workspace: VirtualWorkspace,
		sessionStatePath: string,
		private readonly sessionStateDirectory: URI,
		private readonly getClientId: () => string | undefined,
		@IFileService private readonly fileService: IFileService,
	) {
		this.pathMapper = createCopilotSdkPathMapper(workspace);
		this.sessionStatePath = createCopilotVirtualSessionFsConfig(workspace, sessionStatePath).sessionStatePath;
		if (sessionStateDirectory.scheme !== Schemas.file) {
			throw new Error('The session state directory must be on the host filesystem');
		}
	}

	private toResource(path: string): URI {
		const normalized = normalizePath(path);
		if (isWithin(normalized, this.sessionStatePath)) {
			return joinPath(this.sessionStateDirectory, posix.relative(this.sessionStatePath, normalized));
		}
		const uri = this.pathMapper.toUri(normalized);
		const clientId = this.getClientId();
		if (!clientId) {
			throw new Error(localize('virtualWorkspaceDisconnected', "The window that owns the virtual workspace is not connected."));
		}
		return toAgentClientUri(uri, clientId);
	}

	private async run<T>(operation: () => Promise<T>): Promise<T> {
		try {
			return await operation();
		} catch (error) {
			if (isNotFound(error)) {
				throw Object.assign(new Error(error instanceof Error ? error.message : 'File not found'), { code: 'ENOENT' });
			}
			throw error;
		}
	}

	async readFile(path: string): Promise<string> {
		return VSBuffer.wrap(await this.readFileBytes(path)).toString();
	}

	async readFileBytes(path: string): Promise<Uint8Array> {
		return this.run(async () => (await this.fileService.readFile(this.toResource(path))).value.buffer);
	}

	async writeFile(path: string, content: string): Promise<void> {
		return this.writeFileBytes(path, VSBuffer.fromString(content).buffer);
	}

	async writeFileBytes(path: string, content: Uint8Array): Promise<void> {
		return this.writes.queue(normalizePath(path), () => this.run(async () => {
			await this.fileService.writeFile(this.toResource(path), VSBuffer.wrap(content));
		}));
	}

	async appendFile(path: string, content: string): Promise<void> {
		return this.writes.queue(normalizePath(path), () => this.run(async () => {
			const resource = this.toResource(path);
			if (this.fileService.hasCapability(resource, FileSystemProviderCapabilities.FileAppend)) {
				await this.fileService.writeFile(resource, VSBuffer.fromString(content), { append: true });
				return;
			}
			let previous = VSBuffer.alloc(0);
			try {
				previous = (await this.fileService.readFile(resource)).value;
			} catch (error) {
				if (!isNotFound(error)) {
					throw error;
				}
			}
			await this.fileService.writeFile(resource, VSBuffer.concat([previous, VSBuffer.fromString(content)]));
		}));
	}

	async exists(path: string): Promise<boolean> {
		return this.run(async () => {
			try {
				await this.fileService.stat(this.toResource(path));
				return true;
			} catch (error) {
				if (isNotFound(error)) {
					return false;
				}
				throw error;
			}
		});
	}

	async stat(path: string): Promise<SessionFsFileInfo> {
		return this.run(async () => {
			const stat = await this.fileService.stat(this.toResource(path));
			return {
				isFile: stat.isFile,
				isDirectory: stat.isDirectory,
				size: stat.size ?? 0,
				mtime: new Date(stat.mtime ?? 0).toISOString(),
				birthtime: new Date(stat.ctime ?? 0).toISOString(),
			};
		});
	}

	async mkdir(path: string, recursive: boolean): Promise<void> {
		return this.run(async () => {
			const resource = this.toResource(path);
			if (!recursive) {
				const parent = await this.fileService.stat(dirname(resource));
				if (!parent.isDirectory) {
					throw Object.assign(new Error('Parent is not a directory'), { code: 'ENOTDIR' });
				}
				if (await this.fileService.exists(resource)) {
					throw Object.assign(new Error('Path already exists'), { code: 'EEXIST' });
				}
			}
			await this.fileService.createFolder(resource);
		});
	}

	async readdir(path: string): Promise<string[]> {
		return (await this.readdirWithTypes(path)).map(entry => entry.name);
	}

	async readdirWithTypes(path: string): Promise<Awaited<ReturnType<SessionFsProvider['readdirWithTypes']>>> {
		return this.run(async () => {
			const stat = await this.fileService.resolve(this.toResource(path));
			if (!stat.isDirectory) {
				throw Object.assign(new Error('Path is not a directory'), { code: 'ENOTDIR' });
			}
			return (stat.children ?? []).map(child => ({
				name: child.name,
				type: child.isDirectory ? 'directory' : 'file',
			}));
		});
	}

	async rm(path: string, recursive: boolean, force: boolean): Promise<void> {
		return this.run(async () => {
			const resource = this.toResource(path);
			try {
				await this.fileService.del(resource, { recursive });
			} catch (error) {
				if (!force || !isNotFound(error)) {
					throw error;
				}
			}
		});
	}

	async rename(src: string, dest: string): Promise<void> {
		return this.run(async () => {
			await this.fileService.move(this.toResource(src), this.toResource(dest), true);
		});
	}
}
