/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IUserDataProvider, FileChangeEvent } from 'vs/workbench/services/userData/common/userData';
import { VSBuffer } from 'vs/base/common/buffer';
import { FileChangeType } from 'vs/platform/files/common/files';

export class InMemoryUserDataProvider extends Disposable implements IUserDataProvider {
	_serviceBrand: any;

	private _onDidChangeFile: Emitter<FileChangeEvent[]> = this._register(new Emitter<FileChangeEvent[]>());
	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._onDidChangeFile.event;

	private readonly store: Map<string, string> = new Map<string, string>();

	constructor() {
		super();
		this._register(toDisposable(() => this.store.clear()));
	}

	async listFiles(path: string): Promise<string[]> {
		return [];
	}

	async readFile(path: string): Promise<Uint8Array> {
		if (this.store.has(path)) {
			return VSBuffer.fromString(this.store.get(path)!).buffer;
		}
		throw new Error(`Not Found: ${path}`);
	}

	async writeFile(path: string, value: Uint8Array): Promise<void> {
		const exists = this.store.has(path);
		const content = VSBuffer.wrap(value).toString();
		if (!exists || content !== this.store.get(path)) {
			this.store.set(path, content);
			this._onDidChangeFile.fire([{ path, type: exists ? FileChangeType.UPDATED : FileChangeType.ADDED }]);
		}
	}

	async deleteFile(path: string): Promise<void> {
		if (this.store.has(path)) {
			this.store.delete(path);
			this._onDidChangeFile.fire([{ path, type: FileChangeType.DELETED }]);
		}
	}
}