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
import {ExtHostDocuments} from 'vs/workbench/api/node/extHostDocuments';

export interface TextDocumentWillSaveEvent {
	waitUntil(t: Thenable<any>): void;
}

export class ExtHostDocumentSaveParticipant {

	private _callbacks = new CallbackList();
	private _documents: ExtHostDocuments;

	constructor(documents: ExtHostDocuments) {
		this._documents = documents;
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
		const event = {
			waitUntil(p: Thenable<any>) {
				promises.push(TPromise.wrap(p));
			}
		};
		try {
			listener.apply(thisArg, [event]);
		} finally {
			event.waitUntil = () => { throw illegalState(); };
			return TPromise.join(promises).then(() => void 0, err => void 0 /* ignore */);
		}
	}
}