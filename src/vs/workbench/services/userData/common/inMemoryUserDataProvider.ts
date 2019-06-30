/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IUserDataProvider } from 'vs/workbench/services/userData/common/userData';
import { VSBuffer } from 'vs/base/common/buffer';

export class InMemoryUserDataProvider extends Disposable implements IUserDataProvider {
	_serviceBrand: any;

	private _onDidChangeFile: Emitter<string[]> = this._register(new Emitter<string[]>());
	readonly onDidChangeFile: Event<string[]> = this._onDidChangeFile.event;

	private readonly store: Map<string, string> = new Map<string, string>();

	constructor() {
		super();
		this._register(toDisposable(() => this.store.clear()));
	}

	async listFiles(path: string): Promise<string[]> {
		return [];
	}

	async readFile(path: string): Promise<Uint8Array> {
		return VSBuffer.fromString(this.getValue(path)).buffer;
	}

	async writeFile(path: string, value: Uint8Array): Promise<void> {
		const content = VSBuffer.wrap(value).toString();
		if (content !== this.getValue(path)) {
			if (content) {
				this.store.set(path, content);
				this._onDidChangeFile.fire([path]);
			} else {
				this.deleteFile(path);
			}
		}
	}

	async deleteFile(path: string): Promise<void> {
		if (this.store.has(path)) {
			this.store.delete(path);
			this._onDidChangeFile.fire([path]);
		}
	}

	private getValue(key: string): string {
		return this.store.get(key) || '';
	}
}