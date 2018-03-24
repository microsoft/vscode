/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Event } from 'vs/base/common/event';
import URI, { UriComponents } from 'vs/base/common/uri';
import { sequence, always } from 'vs/base/common/async';
import { illegalState } from 'vs/base/common/errors';
import { ExtHostDocumentSaveParticipantShape, MainThreadTextEditorsShape, ResourceTextEditDto } from 'vs/workbench/api/node/extHost.protocol';
import { TextEdit } from 'vs/workbench/api/node/extHostTypes';
import { fromRange, TextDocumentSaveReason, EndOfLine } from 'vs/workbench/api/node/extHostTypeConverters';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import * as vscode from 'vscode';
import { LinkedList } from 'vs/base/common/linkedList';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';

type Listener = [Function, any, IExtensionDescription];

export class ExtHostDocumentSaveParticipant implements ExtHostDocumentSaveParticipantShape {

	private readonly _callbacks = new LinkedList<Listener>();
	private readonly _badListeners = new WeakMap<Function, number>();

	constructor(
		private readonly _logService: ILogService,
		private readonly _documents: ExtHostDocuments,
		private readonly _mainThreadEditors: MainThreadTextEditorsShape,
		private readonly _thresholds: { timeout: number; errors: number; } = { timeout: 1500, errors: 3 }
	) {
		//
	}

	dispose(): void {
		this._callbacks.clear();
	}

	getOnWillSaveTextDocumentEvent(extension: IExtensionDescription): Event<vscode.TextDocumentWillSaveEvent> {
		return (listener, thisArg, disposables) => {
			const remove = this._callbacks.push([listener, thisArg, extension]);
			const result = { dispose: remove };
			if (Array.isArray(disposables)) {
				disposables.push(result);
			}
			return result;
		};
	}

	$participateInSave(data: UriComponents, reason: SaveReason): Thenable<boolean[]> {
		const resource = URI.revive(data);
		const entries = this._callbacks.toArray();

		let didTimeout = false;
		let didTimeoutHandle = setTimeout(() => didTimeout = true, this._thresholds.timeout);

		const promise = sequence(entries.map(listener => {
			return () => {

				if (didTimeout) {
					// timeout - no more listeners
					return undefined;
				}

				const document = this._documents.getDocumentData(resource).document;
				return this._deliverEventAsyncAndBlameBadListeners(listener, <any>{ document, reason: TextDocumentSaveReason.to(reason) });
			};
		}));
		return always(promise, () => clearTimeout(didTimeoutHandle));
	}

	private _deliverEventAsyncAndBlameBadListeners([listener, thisArg, extension]: Listener, stubEvent: vscode.TextDocumentWillSaveEvent): Promise<any> {
		const errors = this._badListeners.get(listener);
		if (errors > this._thresholds.errors) {
			// bad listener - ignore
			return Promise.resolve(false);
		}

		return this._deliverEventAsync(listener, thisArg, stubEvent).then(() => {
			// don't send result across the wire
			return true;

		}, err => {

			this._logService.error('[onWillSaveTextDocument]', extension.id);
			this._logService.error(err);

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

	private _deliverEventAsync(listener: Function, thisArg: any, stubEvent: vscode.TextDocumentWillSaveEvent): Promise<any> {

		const promises: Promise<vscode.TextEdit[]>[] = [];

		const { document, reason } = stubEvent;
		const { version } = document;

		const event = Object.freeze(<vscode.TextDocumentWillSaveEvent>{
			document,
			reason,
			waitUntil(p: Thenable<any | vscode.TextEdit[]>) {
				if (Object.isFrozen(promises)) {
					throw illegalState('waitUntil can not be called async');
				}
				promises.push(Promise.resolve(p));
			}
		});

		try {
			// fire event
			listener.apply(thisArg, [event]);
		} catch (err) {
			return Promise.reject(err);
		}

		// freeze promises after event call
		Object.freeze(promises);

		return new Promise<vscode.TextEdit[][]>((resolve, reject) => {
			// join on all listener promises, reject after timeout
			const handle = setTimeout(() => reject(new Error('timeout')), this._thresholds.timeout);

			return Promise.all(promises).then(edits => {
				clearTimeout(handle);
				resolve(edits);
			}).catch(err => {
				clearTimeout(handle);
				reject(err);
			});

		}).then(values => {

			const resourceEdit: ResourceTextEditDto = {
				resource: document.uri,
				edits: []
			};

			for (const value of values) {
				if (Array.isArray(value) && (<vscode.TextEdit[]>value).every(e => e instanceof TextEdit)) {
					for (const { newText, newEol, range } of value) {
						resourceEdit.edits.push({
							range: range && fromRange(range),
							text: newText,
							eol: EndOfLine.from(newEol)
						});
					}
				}
			}

			// apply edits if any and if document
			// didn't change somehow in the meantime
			if (resourceEdit.edits.length === 0) {
				return undefined;
			}

			if (version === document.version) {
				return this._mainThreadEditors.$tryApplyWorkspaceEdit({ edits: [resourceEdit] });
			}

			// TODO@joh bubble this to listener?
			return Promise.reject(new Error('concurrent_edits'));
		});
	}
}
