/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open, unlink, type FileHandle } from 'fs/promises';
import { ResourceQueue } from '../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getMediaOrTextMime } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname as resourcesDirname, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { AhpErrorCodes, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceType, ResourceWriteMode, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWriteParams, type ResourceWriteResult } from '../../common/state/sessionProtocol.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';

/** Implements filesystem resource operations and serializes writes to each resource. */
export class FileSystemResources extends Disposable implements IAgentHostResourceProvider {
	private readonly _resourceWriteQueue = this._register(new ResourceQueue());

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
	}

	async read(uri: URI, encoding: ContentEncoding): Promise<ResourceReadResult> {
		try {
			const content = await this._fileService.readFile(uri);
			return {
				data: encoding === ContentEncoding.Base64 ? encodeBase64(content.value) : content.value.toString(),
				encoding,
				contentType: getMediaOrTextMime(uri.path) ?? 'application/octet-stream',
			};
		} catch (e) {
			const error = e instanceof Error ? e : new Error(String(e));
			const result = toFileOperationResult(error);
			if (result === FileOperationResult.FILE_NOT_FOUND) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
			}
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to read content: ${uri.toString()}: ${toErrorMessage(error)}`);
		}
	}

	async list(uri: URI): Promise<ResourceListResult> {
		let stat;
		try {
			stat = await this._fileService.resolve(uri);
		} catch {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
		}

		if (!stat.isDirectory) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
		}

		const entries: DirectoryEntry[] = (stat.children ?? []).map(child => ({
			name: child.name,
			type: child.isDirectory ? 'directory' : 'file',
		}));
		return { entries };
	}

	async write(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		const fileUri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		try {
			const parent = await this._fileService.stat(resourcesDirname(fileUri));
			if (!parent.isDirectory) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
			}
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			const result = toFileOperationResult(e as Error);
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
		}
		let content: VSBuffer;
		if (params.encoding === ContentEncoding.Base64) {
			content = decodeBase64(params.data);
		} else {
			content = VSBuffer.fromString(params.data);
		}
		const mode = params.mode ?? ResourceWriteMode.Truncate;
		const position = params.position ?? 0;
		try {
			await this._resourceWriteQueue.queueFor(fileUri, async () => {
				if (params.ifMatch !== undefined || mode !== ResourceWriteMode.Truncate || position !== 0) {
					await this._resourceWriteWithMode(fileUri, content, mode, position, params);
				} else if (params.createOnly) {
					await this._createFileExclusive(fileUri, content);
				} else {
					await this._fileService.writeFile(fileUri, content);
				}
			}, extUriBiasedIgnorePathCase);
			return {};
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			const result = toFileOperationResult(e as Error);
			if (params.createOnly && (result === FileOperationResult.FILE_MODIFIED_SINCE || result === FileOperationResult.FILE_MOVE_CONFLICT)) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			if (result === FileOperationResult.FILE_MODIFIED_SINCE) {
				const message = params.ifMatch !== undefined
					? `ifMatch precondition failed for: ${fileUri.toString()}`
					: `File changed while writing: ${fileUri.toString()}`;
				throw new ProtocolError(AhpErrorCodes.Conflict, message);
			}
			if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
		}
	}

	private async _createFileExclusive(fileUri: URI, content: VSBuffer): Promise<void> {
		if (fileUri.scheme !== Schemas.file) {
			await this._fileService.createFile(fileUri, content, { overwrite: false });
			return;
		}

		let handle: FileHandle;
		try {
			handle = await open(fileUri.fsPath, 'wx');
		} catch (error) {
			if (isErrorWithCode(error, 'EEXIST')) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			throw error;
		}

		let failure: unknown;
		try {
			await handle.writeFile(content.buffer);
		} catch (error) {
			failure = error;
		}
		try {
			await handle.close();
		} catch (error) {
			failure = failure ? new AggregateError([failure, error]) : error;
		}
		if (failure) {
			try {
				await unlink(fileUri.fsPath);
			} catch (cleanupError) {
				throw new AggregateError([failure, cleanupError], `Failed to create and clean up file: ${fileUri.toString()}`);
			}
			throw failure;
		}
	}

	/**
	 * Slow-path for {@link write} when the caller requested a
	 * non-default {@link ResourceWriteMode}, supplied a `position`, or
	 * provided an `ifMatch` etag precondition. Reads the current file
	 * contents (when needed) and produces a single `writeFile` call that
	 * realises the requested splice. A missing file is treated as
	 * empty for `append` and `insert` (so the operation behaves like a
	 * create); for `truncate` it falls through to a normal write.
	 */
	private async _resourceWriteWithMode(
		fileUri: URI,
		data: VSBuffer,
		mode: ResourceWriteMode,
		position: number,
		params: ResourceWriteParams,
	): Promise<void> {
		let existing: VSBuffer | undefined;
		let currentEtag: string | undefined;
		let currentMtime: number | undefined;
		try {
			const file = await this._fileService.readFile(fileUri);
			existing = file.value;
			currentEtag = file.etag;
			currentMtime = file.mtime;
		} catch (e) {
			if (toFileOperationResult(e as Error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw e;
			}
		}

		if (params.createOnly && existing !== undefined) {
			throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
		}

		if (params.ifMatch !== undefined) {
			// Missing file with an ifMatch is always a conflict (the caller
			// believed they had the etag for an existing file).
			if (existing === undefined || currentEtag !== params.ifMatch) {
				throw new ProtocolError(AhpErrorCodes.Conflict, `ifMatch precondition failed for: ${fileUri.toString()}`);
			}
		}

		const base = existing ?? VSBuffer.alloc(0);
		let next: VSBuffer;
		switch (mode) {
			case ResourceWriteMode.Append: {
				const eof = base.byteLength;
				const splitAt = Math.max(0, eof - position);
				next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, eof)]);
				break;
			}
			case ResourceWriteMode.Insert: {
				const splitAt = Math.min(position, base.byteLength);
				next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, base.byteLength)]);
				break;
			}
			case ResourceWriteMode.Truncate:
			default: {
				const splitAt = Math.min(position, base.byteLength);
				next = VSBuffer.concat([base.slice(0, splitAt), data]);
				break;
			}
		}
		if (params.createOnly) {
			await this._createFileExclusive(fileUri, next);
		} else {
			await this._fileService.writeFile(fileUri, next, { etag: currentEtag, mtime: currentMtime });
		}
	}

	async copy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.copy(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const result = toFileOperationResult(e as Error);
			if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
		}
	}

	async delete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		const fileUri = URI.parse(params.uri);
		try {
			await this._fileService.del(fileUri, { recursive: params.recursive });
			return {};
		} catch (e) {
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${fileUri.toString()}`);
		}
	}

	async move(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.move(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const result = toFileOperationResult(e as Error);
			if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
		}
	}

	async resolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
		const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		try {
			const stat = await this._fileService.stat(uri);
			let type: ResourceType;
			if (stat.isSymbolicLink && params.followSymlinks === false) {
				// `IFileService.stat` always follows symlinks in its
				// type-classification logic, so `followSymlinks: false`
				// only changes how we report the result — we surface the
				// link itself rather than the target.
				type = ResourceType.Symlink;
			} else if (stat.isDirectory) {
				type = ResourceType.Directory;
			} else {
				type = ResourceType.File;
			}
			const result: ResourceResolveResult = {
				uri: uri.toString(),
				type,
				...(stat.size !== undefined ? { size: stat.size } : {}),
				...(stat.mtime !== undefined ? { mtime: new Date(stat.mtime).toISOString() } : {}),
				...(stat.ctime !== undefined ? { ctime: new Date(stat.ctime).toISOString() } : {}),
				...(stat.etag ? { etag: stat.etag } : {}),
			};
			return result;
		} catch (e) {
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${uri.toString()}`);
		}
	}

	async mkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult> {
		const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		try {
			// `IFileService.createFolder` is idempotent for an existing
			// directory and creates parents as needed, matching the
			// `mkdir -p` semantics required by the spec.
			const existing = await this._fileService.stat(uri).catch(() => undefined);
			if (existing && !existing.isDirectory) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Path exists and is not a directory: ${uri.toString()}`);
			}
			await this._fileService.createFolder(uri);
			return {};
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to create directory: ${uri.toString()}`);
		}
	}
}

function isErrorWithCode(error: unknown, code: string): boolean {
	return error instanceof Error && hasErrorCode(error, code);
}

function hasErrorCode(error: Error | { code: unknown }, code: string): boolean {
	return hasKey(error, { code: true }) && error.code === code;
}
