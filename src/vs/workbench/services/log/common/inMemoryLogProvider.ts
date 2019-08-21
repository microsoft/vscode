/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IFileSystemProviderWithFileReadWriteCapability, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileOverwriteOptions, FileType, FileDeleteOptions, FileWriteOptions, FileChangeType } from 'vs/platform/files/common/files';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { VSBuffer } from 'vs/base/common/buffer';

export const INMEMORY_LOG_SCHEME = 'vscode-logs-inmemory';

interface ILog {
	content: string;
	version: number;
}

export class InMemoryLogProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile: Emitter<IFileChange[]> = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChangeFile.event;

	private readonly logs: Map<string, ILog> = new Map<string, ILog>();

	constructor(
	) {
		super();
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	mkdir(resource: URI): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return Promise.reject(new Error('Not Supported'));
	}

	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	async stat(resource: URI): Promise<IStat> {
		const log = this.logs.get(resource.toString());
		return {
			ctime: 0,
			mtime: log ? log.version : 0,
			size: log ? log.content.length : 0,
			type: FileType.File
		};
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const log = this.logs.get(resource.toString());
		return VSBuffer.fromString(log ? log.content : '').buffer;
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		const log = this.logs.get(resource.toString()) || { content: '', version: 0 };
		log.content = VSBuffer.wrap(content).toString();
		log.version = log.version + 1;
		this.logs.set(resource.toString(), log);
		this._onDidChangeFile.fire([{ resource, type: FileChangeType.UPDATED }]);
	}

}
