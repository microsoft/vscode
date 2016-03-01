/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {FileChangesEvent, FileChangeType} from 'vs/platform/files/common/files';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import Event, {Emitter} from 'vs/base/common/event';
import {Disposable} from './extHostTypes';
import {IEventService} from 'vs/platform/event/common/event';
import {RunOnceScheduler} from 'vs/base/common/async';
import URI from 'vs/base/common/uri';
import {match} from 'vs/base/common/glob';
import {Uri, FileSystemWatcher as _FileSystemWatcher} from 'vscode';

export interface FileSystemEvents {
	created: URI[];
	changed: URI[];
	deleted: URI[];
}

export class FileSystemWatcher implements _FileSystemWatcher {

	private _onDidCreate = new Emitter<Uri>();
	private _onDidChange = new Emitter<Uri>();
	private _onDidDelete = new Emitter<Uri>();
	private _disposable: Disposable;
	private _config: number;

	get ignoreCreateEvents(): boolean{
		return Boolean(this._config & 0b001);
	}

	get ignoreChangeEvents(): boolean{
		return Boolean(this._config & 0b010);
	}

	get ignoreDeleteEvents(): boolean{
		return Boolean(this._config & 0b100);
	}

	constructor(dispatcher: Event<FileSystemEvents>, globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean) {

		this._config = 0;
		if (!ignoreCreateEvents) {
			this._config += 0b001;
		}
		if (!ignoreChangeEvents) {
			this._config += 0b010;
		}
		if (!ignoreDeleteEvents) {
			this._config += 0b100;
		}

		let subscription = dispatcher(events => {
			if (!ignoreCreateEvents) {
				for (let created of events.created) {
					if (match(globPattern, created.fsPath)) {
						this._onDidCreate.fire(created);
					}
				}
			}
			if (!ignoreChangeEvents) {
				for (let changed of events.changed) {
					if (match(globPattern, changed.fsPath)) {
						this._onDidChange.fire(changed);
					}
				}
			}
			if (!ignoreDeleteEvents) {
				for (let deleted of events.deleted) {
					if (match(globPattern, deleted.fsPath)) {
						this._onDidDelete.fire(deleted);
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

@Remotable.ExtHostContext('ExtHostFileSystemEventService')
export class ExtHostFileSystemEventService {

	private _emitter = new Emitter<FileSystemEvents>();

	constructor() {
	}

	public createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): _FileSystemWatcher {
		return new FileSystemWatcher(this._emitter.event, globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
	}

	_onFileEvent(events: FileSystemEvents) {
		this._emitter.fire(events);
	}
}

export class MainThreadFileSystemEventService {

	constructor( @IEventService eventService: IEventService, @IThreadService threadService: IThreadService) {

		const proxy = threadService.getRemotable(ExtHostFileSystemEventService);
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};

		const scheduler = new RunOnceScheduler(() => {
			proxy._onFileEvent(events);
			events.created.length = 0;
			events.changed.length = 0;
			events.deleted.length = 0;
		}, 100);

		eventService.addListener('files:fileChanges', (event: FileChangesEvent) => {
			for (let change of event.changes) {
				switch (change.type) {
					case FileChangeType.ADDED:
						events.created.push(change.resource);
						break;
					case FileChangeType.UPDATED:
						events.changed.push(change.resource);
						break;
					case FileChangeType.DELETED:
						events.deleted.push(change.resource);
						break;
				}
			}
			scheduler.schedule();
		});
	}
}
