/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileDeleteOptions, IFileOverwriteOptions, IFileService, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat } from '../../../../../../platform/files/common/files.js';

/**
 * URI scheme for internal chat prompt files (skills, instructions, agents, etc.)
 * backed by a readonly virtual filesystem.
 */
export const CHAT_INTERNAL_SCHEME = 'vscode-chat-internal';

/**
 * A readonly virtual filesystem provider for internal chat prompt files.
 *
 * Files are registered at startup via {@link registerFile} and cannot be
 * modified or deleted afterwards.
 */
export class ChatInternalFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	private readonly files = new Map<string, Uint8Array>();

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite
		| FileSystemProviderCapabilities.Readonly
		| FileSystemProviderCapabilities.PathCaseSensitive;

	/**
	 * Register a file with static content. Must be called before the
	 * file can be read. Typically called once at startup.
	 */
	registerFile(uri: URI, content: string): void {
		this.files.set(uri.toString(), VSBuffer.fromString(content).buffer);
	}

	// --- IFileSystemProvider ---

	watch(): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
		const data = this.files.get(resource.toString());
		if (data) {
			return {
				type: FileType.File,
				ctime: 0,
				mtime: 0,
				size: data.byteLength,
			};
		}
		// Check if this is a directory (any registered file has this as prefix)
		const prefix = resource.toString() + '/';
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) {
				return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
			}
		}
		throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
	}

	async mkdir(): Promise<void> {
		throw createFileSystemProviderError('readonly filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const prefix = resource.toString() + '/';
		const entries = new Map<string, FileType>();
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) {
				const rest = key.substring(prefix.length);
				const slash = rest.indexOf('/');
				if (slash === -1) {
					entries.set(rest, FileType.File);
				} else {
					entries.set(rest.substring(0, slash), FileType.Directory);
				}
			}
		}
		return [...entries.entries()];
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('readonly filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('readonly filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const data = this.files.get(resource.toString());
		if (data) {
			return data;
		}
		throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
	}

	async writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		throw createFileSystemProviderError('readonly filesystem', FileSystemProviderErrorCode.NoPermissions);
	}
}

/**
 * Registers the internal chat filesystem provider with the file service,
 * populates it with built-in files, and returns both the provider (for
 * event subscription) and a disposable for cleanup.
 */
export function registerChatInternalFileSystem(fileService: IFileService): { provider: ChatInternalFileSystemProvider; disposable: IDisposable } {
	const provider = new ChatInternalFileSystemProvider();
	const registration = fileService.registerProvider(CHAT_INTERNAL_SCHEME, provider);

	return {
		provider,
		disposable: {
			dispose() {
				registration.dispose();
				provider.dispose();
			}
		}
	};
}
