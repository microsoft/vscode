/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import CallbackList from 'vs/base/common/callbackList';
import URI from 'vs/base/common/uri';
import {sequence} from 'vs/base/common/async';
import {illegalState} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {MainThreadWorkspaceShape} from 'vs/workbench/api/node/extHost.protocol';
import {fromRange} from 'vs/workbench/api/node/extHostTypeConverters';
import {IResourceEdit} from 'vs/editor/common/services/bulkEdit';
import {ExtHostDocuments} from 'vs/workbench/api/node/extHostDocuments';

export interface TextDocumentWillSaveEvent {
	document: vscode.TextDocument;
	pushEdits(edits: vscode.TextEdit[]): void;
	waitUntil(t: Thenable<any>): void;
}

export class ExtHostDocumentSaveParticipant {

	private _documents: ExtHostDocuments;
	private _workspace: MainThreadWorkspaceShape;
	private _callbacks = new CallbackList();

	constructor(documents: ExtHostDocuments, workspace: MainThreadWorkspaceShape) {
		this._documents = documents;
		this._workspace = workspace;
	}

	dispose(): void {
		this._callbacks.dispose();
	}

	get onWillSaveTextDocumentEvent(): Event<TextDocumentWillSaveEvent> {
		return (listener, thisArg, disposables) => {
			this._callbacks.add(listener, thisArg);
			const result = { dispose: () => this._callbacks.remove(listener, thisArg) };
			if (Array.isArray(disposables)) {
				disposables.push(result);
			}
			return result;
		};
	}

	$participateInSave(resource: URI): TPromise<any> {
		const entries = this._callbacks.entries();

		return sequence(entries.map(([fn, thisArg]) => {
			return () => {
				const document = this._documents.getDocumentData(resource).document;
				return this._deliverEventAsync(fn, thisArg, document);
			};
		}));
	}

	private _deliverEventAsync(listener: Function, thisArg: any, document: vscode.TextDocument): TPromise<any> {

		const promises: TPromise<any>[] = [];
		const resourceEdits: IResourceEdit[] = [];

		const {version} = document;

		const event = Object.freeze(<TextDocumentWillSaveEvent> {
			document,
			pushEdits(edits) {
				if (Object.isFrozen(resourceEdits)) {
					throw illegalState('pushEdits can not be called anymore');
				}
				for (const {newText, range} of edits) {
					resourceEdits.push({
						newText,
						range: fromRange(range),
						resource: <URI> document.uri,
					});
				}
			},
			waitUntil(p: Thenable<any>) {
				if (Object.isFrozen(promises)) {
					throw illegalState('waitUntil can not be called anymore');
				}
				promises.push(TPromise.wrap(p));
			}
		});

		try {
			// fire event
			listener.apply(thisArg, [event]);
		} finally {
			// freeze promises after event call
			Object.freeze(promises);

			return TPromise.join(promises).then(() => {
				// freeze edits after async/sync is done
				Object.freeze(resourceEdits);

				if (resourceEdits.length === 0) {
					return;
				}

				if (version !== document.version) {
					// TODO@joh - fail?
					return;
				}

				// apply edits iff any
				return this._workspace.$applyWorkspaceEdit(resourceEdits);

			}, err => {
				// ignore error
			});
		}
	}
}