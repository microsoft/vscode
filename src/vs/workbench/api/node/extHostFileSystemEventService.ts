/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from './extHostTypes';
import { parse, IRelativePattern } from 'vs/base/common/glob';
import { Uri, FileSystemWatcher as _FileSystemWatcher } from 'vscode';
import { FileSystemEvents, ExtHostFileSystemEventServiceShape } from './extHost.protocol';
import URI from 'vs/base/common/uri';

class FileSystemWatcher implements _FileSystemWatcher {

	private _onDidCreate = new Emitter<Uri>();
	private _onDidChange = new Emitter<Uri>();
	private _onDidDelete = new Emitter<Uri>();
	private _disposable: Disposable;
	private _config: number;

	get ignoreCreateEvents(): boolean {
		return Boolean(this._config & 0b001);
	}

	get ignoreChangeEvents(): boolean {
		return Boolean(this._config & 0b010);
	}

	get ignoreDeleteEvents(): boolean {
		return Boolean(this._config & 0b100);
	}

	constructor(dispatcher: Event<FileSystemEvents>, globPattern: string | IRelativePattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean) {

		this._config = 0;
		if (ignoreCreateEvents) {
			this._config += 0b001;
		}
		if (ignoreChangeEvents) {
			this._config += 0b010;
		}
		if (ignoreDeleteEvents) {
			this._config += 0b100;
		}

		const parsedPattern = parse(globPattern);

		let subscription = dispatcher(events => {
			if (!ignoreCreateEvents) {
				for (let created of events.created) {
					let uri = URI.revive(created);
					if (parsedPattern(uri.fsPath)) {
						this._onDidCreate.fire(uri);
					}
				}
			}
			if (!ignoreChangeEvents) {
				for (let changed of events.changed) {
					let uri = URI.revive(changed);
					if (parsedPattern(uri.fsPath)) {
						this._onDidChange.fire(uri);
					}
				}
			}
			if (!ignoreDeleteEvents) {
				for (let deleted of events.deleted) {
					let uri = URI.revive(deleted);
					if (parsedPattern(uri.fsPath)) {
						this._onDidDelete.fire(uri);
					}
				}
			}
		});

		this._disposable = Disposable.from(this._onDidCreate, this._onDidChange, this._onDidDelete, subscription);
	}

	dispose() {
		this._disposable.dispose();
	}

	get onDidCreate(): Event<Uri> {
		return this._onDidCreate.event;
	}

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	get onDidDelete(): Event<Uri> {
		return this._onDidDelete.event;
	}
}

export class ExtHostFileSystemEventService implements ExtHostFileSystemEventServiceShape {

	private _emitter = new Emitter<FileSystemEvents>();

	constructor() {
	}

	public createFileSystemWatcher(globPattern: string | IRelativePattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): _FileSystemWatcher {
		return new FileSystemWatcher(this._emitter.event, globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
	}

	$onFileEvent(events: FileSystemEvents) {
		this._emitter.fire(events);
	}
}
