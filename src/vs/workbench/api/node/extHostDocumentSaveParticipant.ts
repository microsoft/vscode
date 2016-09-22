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
import {MainThreadWorkspaceShape, ExtHostDocumentSaveParticipantShape} from 'vs/workbench/api/node/extHost.protocol';
import {TextEdit} from 'vs/workbench/api/node/extHostTypes';
import {fromRange} from 'vs/workbench/api/node/extHostTypeConverters';
import {IResourceEdit} from 'vs/editor/common/services/bulkEdit';
import {ExtHostDocuments} from 'vs/workbench/api/node/extHostDocuments';


export class ExtHostDocumentSaveParticipant extends ExtHostDocumentSaveParticipantShape {

	private _documents: ExtHostDocuments;
	private _workspace: MainThreadWorkspaceShape;
	private _callbacks = new CallbackList();

	constructor(documents: ExtHostDocuments, workspace: MainThreadWorkspaceShape) {
		super();
		this._documents = documents;
		this._workspace = workspace;
	}

	dispose(): void {
		this._callbacks.dispose();
	}

	get onWillSaveTextDocumentEvent(): Event<vscode.TextDocumentWillSaveEvent> {
		return (listener, thisArg, disposables) => {
			this._callbacks.add(listener, thisArg);
			const result = { dispose: () => this._callbacks.remove(listener, thisArg) };
			if (Array.isArray(disposables)) {
				disposables.push(result);
			}
			return result;
		};
	}

	$participateInSave(resource: URI): TPromise<any[]> {
		const entries = this._callbacks.entries();

		return sequence(entries.map(([fn, thisArg]) => {
			return () => {
				const document = this._documents.getDocumentData(resource).document;
				return this._deliverEventAsync(fn, thisArg, document);
			};
		}));
	}

	private _deliverEventAsync(listener: Function, thisArg: any, document: vscode.TextDocument): TPromise<any> {

		const promises: TPromise<any | vscode.TextEdit[]>[] = [];

		const {version} = document;

		const event = Object.freeze(<vscode.TextDocumentWillSaveEvent> {
			document,
			waitUntil(p: Thenable<any | vscode.TextEdit[]>) {
				if (Object.isFrozen(promises)) {
					throw illegalState('waitUntil can not be called async');
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

			return TPromise.join(promises).then(values => {

				const edits: IResourceEdit[] = [];
				for (const value of values) {
					if (Array.isArray(value) && (<vscode.TextEdit[]> value).every(e => e instanceof TextEdit)) {
						for (const {newText, range} of value) {
							edits.push({
								resource: <URI>document.uri,
								range: fromRange(range),
								newText
							});
						}
					}
				}

				// apply edits iff any and iff document
				// didn't change somehow in the meantime
				if (edits.length === 0) {
					return;
				}

				if (version === document.version) {
					return this._workspace.$applyWorkspaceEdit(edits);
				}

				// TODO@joh bubble this to listener?
				return new Error('ignoring change because of concurrent edits');

			}, err => {
				// ignore error
			});
		}
	}
}