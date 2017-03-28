/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import CallbackList from 'vs/base/common/callbackList';
import URI from 'vs/base/common/uri';
import { sequence, always } from 'vs/base/common/async';
import { illegalState } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWorkspaceShape, ExtHostDocumentSaveParticipantShape } from 'vs/workbench/api/node/extHost.protocol';
import { TextEdit } from 'vs/workbench/api/node/extHostTypes';
import { fromRange, TextDocumentSaveReason, EndOfLine } from 'vs/workbench/api/node/extHostTypeConverters';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import * as vscode from 'vscode';

export class ExtHostDocumentSaveParticipant extends ExtHostDocumentSaveParticipantShape {

	private _documents: ExtHostDocuments;
	private _workspace: MainThreadWorkspaceShape;
	private _callbacks = new CallbackList();
	private _badListeners = new WeakMap<Function, number>();
	private _thresholds: { timeout: number; errors: number; };

	constructor(documents: ExtHostDocuments, workspace: MainThreadWorkspaceShape, thresholds: { timeout: number; errors: number; } = { timeout: 1500, errors: 3 }) {
		super();
		this._documents = documents;
		this._workspace = workspace;
		this._thresholds = thresholds;
	}

	dispose(): void {
		this._callbacks.dispose();
	}

	get onWillSaveTextDocumentEvent(): Event<vscode.TextDocumentWillSaveEvent> {
		return (listener, thisArg, disposables) => {
			this._callbacks.add(listener, thisArg);
			const result = {
				dispose: () => {
					this._callbacks.remove(listener, thisArg);
				}
			};
			if (Array.isArray(disposables)) {
				disposables.push(result);
			}
			return result;
		};
	}

	$participateInSave(resource: URI, reason: SaveReason): TPromise<boolean[]> {
		const entries = this._callbacks.entries();

		let didTimeout = false;
		let didTimeoutHandle = setTimeout(() => didTimeout = true, this._thresholds.timeout);

		const promise = sequence(entries.map(([fn, thisArg]) => {
			return () => {

				if (didTimeout) {
					// timeout - no more listeners
					return undefined;
				}

				const document = this._documents.getDocumentData(resource).document;
				return this._deliverEventAsyncAndBlameBadListeners(fn, thisArg, <any>{ document, reason: TextDocumentSaveReason.to(reason) });
			};
		}));

		return always(promise, () => clearTimeout(didTimeoutHandle));
	}

	private _deliverEventAsyncAndBlameBadListeners(listener: Function, thisArg: any, stubEvent: vscode.TextDocumentWillSaveEvent): TPromise<any> {
		const errors = this._badListeners.get(listener);
		if (errors > this._thresholds.errors) {
			// bad listener - ignore
			return TPromise.wrap(false);
		}

		return this._deliverEventAsync(listener, thisArg, stubEvent).then(() => {
			// don't send result across the wire
			return true;

		}, err => {
			if (!(err instanceof Error) || (<Error>err).message !== 'concurrent_edits') {
				const errors = this._badListeners.get(listener);
				this._badListeners.set(listener, !errors ? 1 : errors + 1);

				// todo@joh signal to the listener?
				// if (errors === this._thresholds.errors) {
				// 	console.warn('BAD onWillSaveTextDocumentEvent-listener is from now on being ignored');
				// }
			}
			return false;
		});
	}

	private _deliverEventAsync(listener: Function, thisArg: any, stubEvent: vscode.TextDocumentWillSaveEvent): TPromise<any> {

		const promises: TPromise<vscode.TextEdit[]>[] = [];

		const { document, reason } = stubEvent;
		const { version } = document;

		const event = Object.freeze(<vscode.TextDocumentWillSaveEvent>{
			document,
			reason,
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
		} catch (err) {
			return TPromise.wrapError(err);
		}

		// freeze promises after event call
		Object.freeze(promises);

		return new TPromise<vscode.TextEdit[][]>((resolve, reject) => {
			// join on all listener promises, reject after timeout
			const handle = setTimeout(() => reject(new Error('timeout')), this._thresholds.timeout);
			return always(TPromise.join(promises), () => clearTimeout(handle)).then(resolve, reject);

		}).then(values => {

			let edits: IResourceEdit[] = [];

			for (const value of values) {
				if (Array.isArray(value) && (<vscode.TextEdit[]>value).every(e => e instanceof TextEdit)) {
					for (const { newText, newEol, range } of value) {
						edits.push({
							resource: <URI>document.uri,
							range: range && fromRange(range),
							newText,
							newEol: EndOfLine.from(newEol)
						});
					}
				}
			}

			// apply edits iff any and iff document
			// didn't change somehow in the meantime
			if (edits.length === 0) {
				return undefined;
			}

			if (version === document.version) {
				return this._workspace.$applyWorkspaceEdit(edits);
			}

			// TODO@joh bubble this to listener?
			return TPromise.wrapError(new Error('concurrent_edits'));
		});
	}
}
