/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileDeleteOptions, IFileOverwriteOptions, FileSystemProviderCapabilities, FileType, IFileWriteOptions, IFileSystemProvider, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions, createFileSystemProviderError, FileSystemProviderErrorCode, IFileService } from '../../../../../platform/files/common/files.js';
import { IChatPromptContentStore } from '../../common/promptSyntax/chatPromptContentStore.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';

/**
 * File system provider for virtual chat prompt files created with inline content.
 * These URIs have the scheme 'vscode-chat-prompt' and retrieve their content
 * from the {@link IChatPromptContentStore} which maintains an in-memory map
 * of content indexed by URI.
 *
 * This enables external extensions to use VS Code's file system API to read
 * these virtual prompt files.
 */
export class ChatPromptFileSystemProvider implements IFileSystemProvider, IFileSystemProviderWithFileReadWriteCapability {

	get capabilities() {
		return FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly;
	}

	constructor(
		private readonly chatPromptContentStore: IChatPromptContentStore
	) { }

	//#region Supported File Operations

	async stat(resource: URI): Promise<IStat> {
		const content = this.chatPromptContentStore.getContent(resource);
		if (content === undefined) {
			throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
		}

		const size = VSBuffer.fromString(content).byteLength;

		return {
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size
		};
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const content = this.chatPromptContentStore.getContent(resource);
		if (content === undefined) {
			throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
		}

		return VSBuffer.fromString(content).buffer;
	}

	//#endregion

	//#region Unsupported File Operations

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		throw createFileSystemProviderError('not allowed', FileSystemProviderErrorCode.NoPermissions);
	}

	async mkdir(resource: URI): Promise<void> {
		throw createFileSystemProviderError('not allowed', FileSystemProviderErrorCode.NoPermissions);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		return [];
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('not allowed', FileSystemProviderErrorCode.NoPermissions);
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('not allowed', FileSystemProviderErrorCode.NoPermissions);
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	//#endregion
}

/**
 * Workbench contribution that registers the chat prompt file system provider.
 */
export class ChatPromptFileSystemProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPromptFileSystemProvider';

	constructor(
		@IFileService fileService: IFileService,
		@IChatPromptContentStore chatPromptContentStore: IChatPromptContentStore
	) {
		super();

		this._register(fileService.registerProvider(
			Schemas.vscodeChatPrompt,
			new ChatPromptFileSystemProvider(chatPromptContentStore)
		));
	}
}

registerWorkbenchContribution2(
	ChatPromptFileSystemProviderContribution.ID,
	ChatPromptFileSystemProviderContribution,
	WorkbenchPhase.Eventually
);
