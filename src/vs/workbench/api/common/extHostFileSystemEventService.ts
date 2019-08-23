/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { AsyncEmitter, Emitter, Event } from 'vs/base/common/event';
import { IRelativePattern, parse } from 'vs/base/common/glob';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import * as vscode from 'vscode';
import { ExtHostFileSystemEventServiceShape, FileSystemEvents, IMainContext, MainContext, IResourceFileEditDto, IResourceTextEditDto, MainThreadTextEditorsShape } from './extHost.protocol';
import * as typeConverter from './extHostTypeConverters';
import { Disposable, WorkspaceEdit } from './extHostTypes';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

class FileSystemWatcher implements vscode.FileSystemWatcher {

	private _onDidCreate = new Emitter<vscode.Uri>();
	private _onDidChange = new Emitter<vscode.Uri>();
	private _onDidDelete = new Emitter<vscode.Uri>();
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

interface WillRenameListener {
	extension: IExtensionDescription;
	(e: vscode.FileWillRenameEvent): any;
}

export class ExtHostFileSystemEventService implements ExtHostFileSystemEventServiceShape {

	private readonly _onFileEvent = new Emitter<FileSystemEvents>();
	private readonly _onDidRenameFile = new Emitter<vscode.FileRenameEvent>();
	private readonly _onWillRenameFile = new AsyncEmitter<vscode.FileWillRenameEvent>();

	readonly onDidRenameFile: Event<vscode.FileRenameEvent> = this._onDidRenameFile.event;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _mainThreadTextEditors: MainThreadTextEditorsShape = mainContext.getProxy(MainContext.MainThreadTextEditors)
	) {
		//
	}

	public createFileSystemWatcher(globPattern: string | IRelativePattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): vscode.FileSystemWatcher {
		return new FileSystemWatcher(this._onFileEvent.event, globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
	}

	$onFileEvent(events: FileSystemEvents) {
		this._onFileEvent.fire(events);
	}

	$onFileRename(oldUri: UriComponents, newUri: UriComponents) {
		this._onDidRenameFile.fire(Object.freeze({ oldUri: URI.revive(oldUri), newUri: URI.revive(newUri) }));
	}

	getOnWillRenameFileEvent(extension: IExtensionDescription): Event<vscode.FileWillRenameEvent> {
		return (listener, thisArg, disposables) => {
			const wrappedListener: WillRenameListener = <any>((e: vscode.FileWillRenameEvent) => {
				listener.call(thisArg, e);
			});
			wrappedListener.extension = extension;
			return this._onWillRenameFile.event(wrappedListener, undefined, disposables);
		};
	}

	$onWillRename(oldUriDto: UriComponents, newUriDto: UriComponents): Promise<any> {
		const oldUri = URI.revive(oldUriDto);
		const newUri = URI.revive(newUriDto);

		const edits: WorkspaceEdit[] = [];
		return Promise.resolve(this._onWillRenameFile.fireAsync((bucket, _listener) => {
			return {
				oldUri,
				newUri,
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
		}).then((): any => {
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
		}));
	}
}
