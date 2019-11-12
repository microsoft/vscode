/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { AsyncEmitter, Emitter, Event, IWaitUntil } from 'vs/base/common/event';
import { IRelativePattern, parse } from 'vs/base/common/glob';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import * as vscode from 'vscode';
import { ExtHostFileSystemEventServiceShape, FileSystemEvents, IMainContext, MainContext, IResourceFileEditDto, IResourceTextEditDto, MainThreadTextEditorsShape } from './extHost.protocol';
import * as typeConverter from './extHostTypeConverters';
import { Disposable, WorkspaceEdit } from './extHostTypes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { FileOperation } from 'vs/platform/files/common/files';

class FileSystemWatcher implements vscode.FileSystemWatcher {

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

		const subscription = dispatcher(events => {
			if (!ignoreCreateEvents) {
				for (let created of events.created) {
					const uri = URI.revive(created);
					if (parsedPattern(uri.fsPath)) {
						this._onDidCreate.fire(uri);
					}
				}
			}
			if (!ignoreChangeEvents) {
				for (let changed of events.changed) {
					const uri = URI.revive(changed);
					if (parsedPattern(uri.fsPath)) {
						this._onDidChange.fire(uri);
					}
				}
			}
			if (!ignoreDeleteEvents) {
				for (let deleted of events.deleted) {
					const uri = URI.revive(deleted);
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
		mainContext: IMainContext,
		private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _mainThreadTextEditors: MainThreadTextEditorsShape = mainContext.getProxy(MainContext.MainThreadTextEditors)
	) {
		//
	}

	//--- file events

	createFileSystemWatcher(globPattern: string | IRelativePattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): vscode.FileSystemWatcher {
		return new FileSystemWatcher(this._onFileSystemEvent.event, globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
	}

	$onFileEvent(events: FileSystemEvents) {
		this._onFileSystemEvent.fire(events);
	}


	//--- file operations

	$onDidRunFileOperation(operation: FileOperation, target: UriComponents, source: UriComponents | undefined): void {
		switch (operation) {
			case FileOperation.MOVE:
				this._onDidRenameFile.fire(Object.freeze({ renamed: [{ oldUri: URI.revive(source!), newUri: URI.revive(target) }] }));
				break;
			case FileOperation.DELETE:
				this._onDidDeleteFile.fire(Object.freeze({ deleted: [URI.revive(target)] }));
				break;
			case FileOperation.CREATE:
				this._onDidCreateFile.fire(Object.freeze({ created: [URI.revive(target)] }));
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

	async $onWillRunFileOperation(operation: FileOperation, target: UriComponents, source: UriComponents | undefined): Promise<any> {
		switch (operation) {
			case FileOperation.MOVE:
				await this._fireWillRename(URI.revive(source!), URI.revive(target));
				break;
			case FileOperation.DELETE:
				this._onWillDeleteFile.fireAsync(thenables => (<vscode.FileWillDeleteEvent>{ deleting: [URI.revive(target)], waitUntil: p => thenables.push(Promise.resolve(p)) }));
				break;
			case FileOperation.CREATE:
				this._onWillCreateFile.fireAsync(thenables => (<vscode.FileWillCreateEvent>{ creating: [URI.revive(target)], waitUntil: p => thenables.push(Promise.resolve(p)) }));
				break;
			default:
			//ignore, dont send
		}
	}

	private async _fireWillRename(oldUri: URI, newUri: URI): Promise<any> {

		const edits: WorkspaceEdit[] = [];
		await Promise.resolve(this._onWillRenameFile.fireAsync(bucket => {
			return {
				renaming: [{ oldUri, newUri }],
				waitUntil: (thenable: Promise<vscode.WorkspaceEdit>): void => {
					if (Object.isFrozen(bucket)) {
						throw new TypeError('waitUntil cannot be called async');
					}
					const index = bucket.length;
					const wrappedThenable = Promise.resolve(thenable).then(result => {
						// ignore all results except for WorkspaceEdits. Those
						// are stored in a spare array
						if (result instanceof WorkspaceEdit) {
							edits[index] = result;
						}
					});
					bucket.push(wrappedThenable);
				}
			};
		}));

		if (edits.length === 0) {
			return undefined;
		}

		// flatten all WorkspaceEdits collected via waitUntil-call
		// and apply them in one go.
		const allEdits = new Array<Array<IResourceFileEditDto | IResourceTextEditDto>>();
		for (let edit of edits) {
			if (edit) { // sparse array
				let { edits } = typeConverter.WorkspaceEdit.from(edit, this._extHostDocumentsAndEditors);
				allEdits.push(edits);
			}
		}
		return this._mainThreadTextEditors.$tryApplyWorkspaceEdit({ edits: flatten(allEdits) });
	}


}
