/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, AsyncEmitter, IWaitUntil, IWaitUntilData } from 'vs/base/common/event';
import { GLOBSTAR, GLOB_SPLIT, parse } from 'vs/base/common/glob';
import { URI } from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import type * as vscode from 'vscode';
import { ExtHostFileSystemEventServiceShape, FileSystemEvents, IMainContext, SourceTargetPair, IWorkspaceEditDto, IWillRunFileOperationParticipation, MainContext, IRelativePatternDto } from './extHost.protocol';
import * as typeConverter from './extHostTypeConverters';
import { Disposable, WorkspaceEdit } from './extHostTypes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { FileChangeFilter, FileOperation } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { Lazy } from 'vs/base/common/lazy';

export interface FileSystemWatcherCreateOptions {
	readonly correlate: boolean;

	readonly ignoreCreateEvents?: boolean;
	readonly ignoreChangeEvents?: boolean;
	readonly ignoreDeleteEvents?: boolean;

	readonly excludes?: string[];
}

class FileSystemWatcher implements vscode.FileSystemWatcher {

	private readonly session = Math.random();

	private readonly _onDidCreate = new Emitter<vscode.Uri>();
	private readonly _onDidChange = new Emitter<vscode.Uri>();
	private readonly _onDidDelete = new Emitter<vscode.Uri>();

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

	constructor(mainContext: IMainContext, workspace: IExtHostWorkspace, extension: IExtensionDescription, dispatcher: Event<FileSystemEvents>, globPattern: string | IRelativePatternDto, options?: FileSystemWatcherCreateOptions) {
		this._config = 0;
		if (options?.ignoreCreateEvents) {
			this._config += 0b001;
		}
		if (options?.ignoreChangeEvents) {
			this._config += 0b010;
		}
		if (options?.ignoreDeleteEvents) {
			this._config += 0b100;
		}

		const parsedPattern = parse(globPattern);

		// 1.64.x behaviour change: given the new support to watch any folder
		// we start to ignore events outside the workspace when only a string
		// pattern is provided to avoid sending events to extensions that are
		// unexpected.
		// https://github.com/microsoft/vscode/issues/3025
		const excludeOutOfWorkspaceEvents = typeof globPattern === 'string';

		// 1.84.x introduces new proposed API for a watcher to set exclude
		// rules. In these cases, we turn the file watcher into correlation
		// mode and ignore any event that does not match the correlation ID.
		const excludeUncorrelatedEvents = options?.correlate;

		const subscription = dispatcher(events => {
			if (typeof events.session === 'number' && events.session !== this.session) {
				return; // ignore events from other file watchers that are in correlation mode
			}

			if (excludeUncorrelatedEvents && typeof events.session === 'undefined') {
				return; // ignore events from other non-correlating file watcher when we are in correlation mode
			}

			if (!options?.ignoreCreateEvents) {
				for (const created of events.created) {
					const uri = URI.revive(created);
					if (parsedPattern(uri.fsPath) && (!excludeOutOfWorkspaceEvents || workspace.getWorkspaceFolder(uri))) {
						this._onDidCreate.fire(uri);
					}
				}
			}
			if (!options?.ignoreChangeEvents) {
				for (const changed of events.changed) {
					const uri = URI.revive(changed);
					if (parsedPattern(uri.fsPath) && (!excludeOutOfWorkspaceEvents || workspace.getWorkspaceFolder(uri))) {
						this._onDidChange.fire(uri);
					}
				}
			}
			if (!options?.ignoreDeleteEvents) {
				for (const deleted of events.deleted) {
					const uri = URI.revive(deleted);
					if (parsedPattern(uri.fsPath) && (!excludeOutOfWorkspaceEvents || workspace.getWorkspaceFolder(uri))) {
						this._onDidDelete.fire(uri);
					}
				}
			}
		});

		this._disposable = Disposable.from(this.ensureWatching(mainContext, extension, globPattern, options, options?.correlate), this._onDidCreate, this._onDidChange, this._onDidDelete, subscription);
	}

	private ensureWatching(mainContext: IMainContext, extension: IExtensionDescription, globPattern: string | IRelativePatternDto, options: FileSystemWatcherCreateOptions | undefined, correlate: boolean | undefined): Disposable {
		const disposable = Disposable.from();

		if (typeof globPattern === 'string') {
			return disposable; // workspace is already watched by default, no need to watch again!
		}

		if (options?.ignoreChangeEvents && options?.ignoreCreateEvents && options?.ignoreDeleteEvents) {
			return disposable; // no need to watch if we ignore all events
		}

		const proxy = mainContext.getProxy(MainContext.MainThreadFileSystemEventService);

		let recursive = false;
		if (globPattern.pattern.includes(GLOBSTAR) || globPattern.pattern.includes(GLOB_SPLIT)) {
			recursive = true; // only watch recursively if pattern indicates the need for it
		}

		let filter: FileChangeFilter | undefined;
		if (correlate) {
			if (options?.ignoreChangeEvents || options?.ignoreCreateEvents || options?.ignoreDeleteEvents) {
				filter = FileChangeFilter.UPDATED | FileChangeFilter.ADDED | FileChangeFilter.DELETED;

				if (options?.ignoreChangeEvents) {
					filter &= ~FileChangeFilter.UPDATED;
				}

				if (options?.ignoreCreateEvents) {
					filter &= ~FileChangeFilter.ADDED;
				}

				if (options?.ignoreDeleteEvents) {
					filter &= ~FileChangeFilter.DELETED;
				}
			}
		}

		proxy.$watch(extension.identifier.value, this.session, globPattern.baseUri, { recursive, excludes: options?.excludes ?? [], filter }, Boolean(correlate));

		return Disposable.from({ dispose: () => proxy.$unwatch(this.session) });
	}

	dispose() {
		this._disposable.dispose();
	}

	get onDidCreate(): Event<vscode.Uri> {
		return this._onDidCreate.event;
	}

	get onDidChange(): Event<vscode.Uri> {
		return this._onDidChange.event;
	}

	get onDidDelete(): Event<vscode.Uri> {
		return this._onDidDelete.event;
	}
}

interface IExtensionListener<E> {
	extension: IExtensionDescription;
	(e: E): any;
}

class LazyRevivedFileSystemEvents implements FileSystemEvents {

	constructor(private readonly _events: FileSystemEvents) { }

	readonly session = this._events.session;

	private _created = new Lazy(() => this._events.created.map(URI.revive) as URI[]);
	get created(): URI[] { return this._created.value; }

	private _changed = new Lazy(() => this._events.changed.map(URI.revive) as URI[]);
	get changed(): URI[] { return this._changed.value; }

	private _deleted = new Lazy(() => this._events.deleted.map(URI.revive) as URI[]);
	get deleted(): URI[] { return this._deleted.value; }
}

export class ExtHostFileSystemEventService implements ExtHostFileSystemEventServiceShape {

	private readonly _onFileSystemEvent = new Emitter<FileSystemEvents>();

	private readonly _onDidRenameFile = new Emitter<vscode.FileRenameEvent>();
	private readonly _onDidCreateFile = new Emitter<vscode.FileCreateEvent>();
	private readonly _onDidDeleteFile = new Emitter<vscode.FileDeleteEvent>();
	private readonly _onWillRenameFile = new AsyncEmitter<vscode.FileWillRenameEvent>();
	private readonly _onWillCreateFile = new AsyncEmitter<vscode.FileWillCreateEvent>();
	private readonly _onWillDeleteFile = new AsyncEmitter<vscode.FileWillDeleteEvent>();

	readonly onDidRenameFile: Event<vscode.FileRenameEvent> = this._onDidRenameFile.event;
	readonly onDidCreateFile: Event<vscode.FileCreateEvent> = this._onDidCreateFile.event;
	readonly onDidDeleteFile: Event<vscode.FileDeleteEvent> = this._onDidDeleteFile.event;

	constructor(
		private readonly _mainContext: IMainContext,
		private readonly _logService: ILogService,
		private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors
	) {
		//
	}

	//--- file events

	createFileSystemWatcher(workspace: IExtHostWorkspace, extension: IExtensionDescription, globPattern: vscode.GlobPattern, options?: FileSystemWatcherCreateOptions): vscode.FileSystemWatcher {
		return new FileSystemWatcher(this._mainContext, workspace, extension, this._onFileSystemEvent.event, typeConverter.GlobPattern.from(globPattern), options);
	}

	$onFileEvent(events: FileSystemEvents) {
		this._onFileSystemEvent.fire(new LazyRevivedFileSystemEvents(events));
	}

	//--- file operations

	$onDidRunFileOperation(operation: FileOperation, files: SourceTargetPair[]): void {
		switch (operation) {
			case FileOperation.MOVE:
				this._onDidRenameFile.fire(Object.freeze({ files: files.map(f => ({ oldUri: URI.revive(f.source!), newUri: URI.revive(f.target) })) }));
				break;
			case FileOperation.DELETE:
				this._onDidDeleteFile.fire(Object.freeze({ files: files.map(f => URI.revive(f.target)) }));
				break;
			case FileOperation.CREATE:
			case FileOperation.COPY:
				this._onDidCreateFile.fire(Object.freeze({ files: files.map(f => URI.revive(f.target)) }));
				break;
			default:
			//ignore, dont send
		}
	}


	getOnWillRenameFileEvent(extension: IExtensionDescription): Event<vscode.FileWillRenameEvent> {
		return this._createWillExecuteEvent(extension, this._onWillRenameFile);
	}

	getOnWillCreateFileEvent(extension: IExtensionDescription): Event<vscode.FileWillCreateEvent> {
		return this._createWillExecuteEvent(extension, this._onWillCreateFile);
	}

	getOnWillDeleteFileEvent(extension: IExtensionDescription): Event<vscode.FileWillDeleteEvent> {
		return this._createWillExecuteEvent(extension, this._onWillDeleteFile);
	}

	private _createWillExecuteEvent<E extends IWaitUntil>(extension: IExtensionDescription, emitter: AsyncEmitter<E>): Event<E> {
		return (listener, thisArg, disposables) => {
			const wrappedListener: IExtensionListener<E> = function wrapped(e: E) { listener.call(thisArg, e); };
			wrappedListener.extension = extension;
			return emitter.event(wrappedListener, undefined, disposables);
		};
	}

	async $onWillRunFileOperation(operation: FileOperation, files: SourceTargetPair[], timeout: number, token: CancellationToken): Promise<IWillRunFileOperationParticipation | undefined> {
		switch (operation) {
			case FileOperation.MOVE:
				return await this._fireWillEvent(this._onWillRenameFile, { files: files.map(f => ({ oldUri: URI.revive(f.source!), newUri: URI.revive(f.target) })) }, timeout, token);
			case FileOperation.DELETE:
				return await this._fireWillEvent(this._onWillDeleteFile, { files: files.map(f => URI.revive(f.target)) }, timeout, token);
			case FileOperation.CREATE:
			case FileOperation.COPY:
				return await this._fireWillEvent(this._onWillCreateFile, { files: files.map(f => URI.revive(f.target)) }, timeout, token);
		}
		return undefined;
	}

	private async _fireWillEvent<E extends IWaitUntil>(emitter: AsyncEmitter<E>, data: IWaitUntilData<E>, timeout: number, token: CancellationToken): Promise<IWillRunFileOperationParticipation | undefined> {

		const extensionNames = new Set<string>();
		const edits: [IExtensionDescription, WorkspaceEdit][] = [];

		await emitter.fireAsync(data, token, async (thenable: Promise<unknown>, listener) => {
			// ignore all results except for WorkspaceEdits. Those are stored in an array.
			const now = Date.now();
			const result = await Promise.resolve(thenable);
			if (result instanceof WorkspaceEdit) {
				edits.push([(<IExtensionListener<E>>listener).extension, result]);
				extensionNames.add((<IExtensionListener<E>>listener).extension.displayName ?? (<IExtensionListener<E>>listener).extension.identifier.value);
			}

			if (Date.now() - now > timeout) {
				this._logService.warn('SLOW file-participant', (<IExtensionListener<E>>listener).extension.identifier);
			}
		});

		if (token.isCancellationRequested) {
			return undefined;
		}

		if (edits.length === 0) {
			return undefined;
		}

		// concat all WorkspaceEdits collected via waitUntil-call and send them over to the renderer
		const dto: IWorkspaceEditDto = { edits: [] };
		for (const [, edit] of edits) {
			const { edits } = typeConverter.WorkspaceEdit.from(edit, {
				getTextDocumentVersion: uri => this._extHostDocumentsAndEditors.getDocument(uri)?.version,
				getNotebookDocumentVersion: () => undefined,
			});
			dto.edits = dto.edits.concat(edits);
		}
		return { edit: dto, extensionNames: Array.from(extensionNames) };
	}
}
