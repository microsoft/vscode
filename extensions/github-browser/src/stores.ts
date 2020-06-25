/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { commands, Event, EventEmitter, FileStat, FileType, Memento, TextDocumentShowOptions, Uri, ViewColumn } from 'vscode';
import { getRootUri } from './extension';
import { sha1 } from './sha1';

const textDecoder = new TextDecoder();

interface CreateRecord<T extends string | Uri = string> {
	type: 'created';
	size: number;
	timestamp: number;
	uri: T;
	hash: string;
	originalHash: undefined;
}

interface ChangeRecord<T extends string | Uri = string> {
	type: 'changed';
	size: number;
	timestamp: number;
	uri: T;
	hash: string;
	originalHash: string;
}

interface DeleteRecord<T extends string | Uri = string> {
	type: 'deleted';
	size: number;
	timestamp: number;
	uri: T;
	hash: undefined;
	originalHash: string;
}

export type Record = CreateRecord<Uri> | ChangeRecord<Uri> | DeleteRecord<Uri>;
type StoredRecord = CreateRecord | ChangeRecord | DeleteRecord;

const workingChangesKeyPrefix = 'github.working.changes|';
const workingFileKeyPrefix = 'github.working|';

function fromSerialized(change: StoredRecord): Record {
	return { ...change, uri: Uri.parse(change.uri) };
}

interface CreatedFileChangeStoreEvent {
	type: 'created';
	rootUri: Uri;
	size: number;
	timestamp: number;
	uri: Uri;
	hash: string;
	originalHash: undefined;
}

interface ChangedFileChangeStoreEvent {
	type: 'changed';
	rootUri: Uri;
	size: number;
	timestamp: number;
	uri: Uri;
	hash: string;
	originalHash: string;
}

interface DeletedFileChangeStoreEvent {
	type: 'deleted';
	rootUri: Uri;
	size: number;
	timestamp: number;
	uri: Uri;

	hash: undefined;
	originalHash: string;
}

type ChangeStoreEvent = CreatedFileChangeStoreEvent | ChangedFileChangeStoreEvent | DeletedFileChangeStoreEvent;

function toChangeEvent(change: Record | StoredRecord, rootUri: Uri, uri?: Uri): ChangeStoreEvent {
	return {
		...change,
		rootUri: rootUri,
		uri: uri ?? (typeof change.uri === 'string' ? Uri.parse(change.uri) : change.uri)
	};
}


export interface IChangeStore {
	onDidChange: Event<ChangeStoreEvent>;

	acceptAll(rootUri: Uri): Promise<void>;

	discardAll(rootUri: Uri): Promise<void>;
	discardChanges(uri: Uri): Promise<void>;

	getChanges(rootUri: Uri): Record[];
	getContent(uri: Uri): string | undefined;
	getStat(uri: Uri): FileStat | undefined;

	hasChanges(rootUri: Uri): boolean;

	openChanges(uri: Uri, original: Uri): void;
	openFile(uri: Uri): void;

	recordFileChange(uri: Uri, content: Uint8Array, originalContent: () => Uint8Array | Thenable<Uint8Array>): Promise<void>;
}

export class ChangeStore implements IChangeStore {
	private _onDidChange = new EventEmitter<ChangeStoreEvent>();
	get onDidChange(): Event<ChangeStoreEvent> {
		return this._onDidChange.event;
	}

	constructor(private readonly memento: Memento) { }

	async acceptAll(rootUri: Uri): Promise<void> {
		const changes = this.getChanges(rootUri);

		await this.saveWorkingChanges(rootUri, undefined);

		for (const change of changes) {
			await this.discardWorkingContent(change.uri);
			this._onDidChange.fire(toChangeEvent(change, rootUri));
		}
	}

	async discardAll(rootUri: Uri): Promise<void> {
		const changes = this.getChanges(rootUri);

		await this.saveWorkingChanges(rootUri, undefined);

		for (const change of changes) {
			await this.discardWorkingContent(change.uri);
			this._onDidChange.fire(toChangeEvent(change, rootUri));
		}
	}

	async discardChanges(uri: Uri): Promise<void> {
		const rootUri = getRootUri(uri);
		if (rootUri === undefined) {
			return;
		}

		const key = uri.toString();

		const changes = this.getWorkingChanges(rootUri);
		const index = changes.findIndex(c => c.uri === key);
		if (index === -1) {
			return;
		}

		const [change] = changes.splice(index, 1);
		await this.saveWorkingChanges(rootUri, changes);
		await this.discardWorkingContent(uri);

		this._onDidChange.fire(toChangeEvent(change, rootUri, uri));
	}

	getChanges(rootUri: Uri) {
		return this.getWorkingChanges(rootUri).map(c => fromSerialized(c));
	}

	getContent(uri: Uri): string | undefined {
		return this.memento.get(`${workingFileKeyPrefix}${uri.toString()}`);
	}

	getStat(uri: Uri): FileStat | undefined {
		const key = uri.toString();
		const change = this.getChanges(getRootUri(uri)!).find(c => c.uri.toString() === key);
		if (change === undefined) {
			return undefined;
		}

		return {
			type: FileType.File,
			size: change.size,
			ctime: 0,
			mtime: change.timestamp
		};
	}

	hasChanges(rootUri: Uri): boolean {
		return this.getWorkingChanges(rootUri).length !== 0;
	}

	async openChanges(uri: Uri, original: Uri) {
		const opts: TextDocumentShowOptions = {
			preserveFocus: false,
			preview: true,
			viewColumn: ViewColumn.Active
		};

		await commands.executeCommand('vscode.diff', original, uri, `${uri.fsPath} (Working Tree)`, opts);
	}

	async openFile(uri: Uri) {
		const opts: TextDocumentShowOptions = {
			preserveFocus: false,
			preview: false,
			viewColumn: ViewColumn.Active
		};

		await commands.executeCommand('vscode.open', uri, opts);
	}

	async recordFileChange(uri: Uri, content: Uint8Array, originalContent: () => Uint8Array | Thenable<Uint8Array>): Promise<void> {
		const rootUri = getRootUri(uri);
		if (rootUri === undefined) {
			return;
		}

		const key = uri.toString();

		const changes = this.getWorkingChanges(rootUri);

		const hash = await sha1(content);

		let change = changes.find(c => c.uri === key);
		if (change === undefined) {
			const originalHash = await sha1(await originalContent!());
			if (hash === originalHash) {
				return;
			}

			change = {
				type: 'changed',
				size: content.byteLength,
				timestamp: Date.now(),
				uri: key,
				hash: hash!,
				originalHash: originalHash
			} as ChangeRecord;
			changes.push(change);

			await this.saveWorkingChanges(rootUri, changes);
			await this.saveWorkingContent(uri, textDecoder.decode(content));
		} else if (hash! === change.originalHash) {
			changes.splice(changes.indexOf(change), 1);

			await this.saveWorkingChanges(rootUri, changes);
			await this.discardWorkingContent(uri);
		} else if (change.hash !== hash) {
			change.hash = hash!;
			change.timestamp = Date.now();

			await this.saveWorkingChanges(rootUri, changes);
			await this.saveWorkingContent(uri, textDecoder.decode(content));
		}

		this._onDidChange.fire(toChangeEvent(change, rootUri, uri));
	}

	private getWorkingChanges(rootUri: Uri): StoredRecord[] {
		return this.memento.get(`${workingChangesKeyPrefix}${rootUri.toString()}`, []);
	}

	private async saveWorkingChanges(rootUri: Uri, changes: StoredRecord[] | undefined): Promise<void> {
		await this.memento.update(`${workingChangesKeyPrefix}${rootUri.toString()}`, changes);
	}

	private async saveWorkingContent(uri: Uri, content: string): Promise<void> {
		await this.memento.update(`${workingFileKeyPrefix}${uri.toString()}`, content);
	}

	private async discardWorkingContent(uri: Uri): Promise<void> {
		await this.memento.update(`${workingFileKeyPrefix}${uri.toString()}`, undefined);
	}
}

const contextKeyPrefix = 'github.context|';

export class ContextStore<T> {
	private _onDidChange = new EventEmitter<Uri>();
	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	constructor(private readonly memento: Memento, private readonly scheme: string) { }

	delete(uri: Uri) {
		return this.set(uri, undefined);
	}

	get(uri: Uri): T | undefined {
		return this.memento.get<T>(`${contextKeyPrefix}${uri.toString()}`);
	}

	async set(uri: Uri, context: T | undefined) {
		if (uri.scheme !== this.scheme) {
			throw new Error(`Invalid context scheme: ${uri.scheme}`);
		}

		await this.memento.update(`${contextKeyPrefix}${uri.toString()}`, context);
		this._onDidChange.fire(uri);
	}
}
