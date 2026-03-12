/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { illegalState } from '../../../base/common/errors.js';
import { ExtHostDocumentSaveParticipantShape, IWorkspaceEditDto, MainThreadBulkEditsShape } from './extHost.protocol.js';
import { TextEdit } from './extHostTypes.js';
import { Range, TextDocumentSaveReason, EndOfLine } from './extHostTypeConverters.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { SaveReason } from '../../common/editor.js';
import type * as vscode from 'vscode';
import { LinkedList } from '../../../base/common/linkedList.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';

type Listener = [Function, unknown, IExtensionDescription];

export class ExtHostDocumentSaveParticipant implements ExtHostDocumentSaveParticipantShape {

	private readonly _callbacks = new LinkedList<Listener>();
	private readonly _badListeners = new WeakMap<Function, number>();

	constructor(
		private readonly _logService: ILogService,
		private readonly _documents: ExtHostDocuments,
		private readonly _mainThreadBulkEdits: MainThreadBulkEditsShape,
		private readonly _thresholds: { timeout: number; errors: number } = { timeout: 1500, errors: 3 }
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

	async $participateInSave(data: UriComponents, reason: SaveReason): Promise<boolean[]> {
		const resource = URI.revive(data);

		let didTimeout = false;
		const didTimeoutHandle = setTimeout(() => didTimeout = true, this._thresholds.timeout);

		const results: boolean[] = [];
		try {
			for (const listener of [...this._callbacks]) { // copy to prevent concurrent modifications
				if (didTimeout) {
					// timeout - no more listeners
					break;
				}
				const document = this._documents.getDocument(resource);

				const success = await this._deliverEventAsyncAndBlameBadListeners(listener, { document, reason: TextDocumentSaveReason.to(reason) });
				results.push(success);
			}
		} finally {
			clearTimeout(didTimeoutHandle);
		}
		return results;
	}

	private _deliverEventAsyncAndBlameBadListeners([listener, thisArg, extension]: Listener, stubEvent: Pick<vscode.TextDocumentWillSaveEvent, 'document' | 'reason'>): Promise<boolean> {
		const errors = this._badListeners.get(listener);
		if (typeof errors === 'number' && errors > this._thresholds.errors) {
			// bad listener - ignore
			return Promise.resolve(false);
		}

		return this._deliverEventAsync(extension, listener, thisArg, stubEvent).then(() => {
			// don't send result across the wire
			return true;

		}, err => {

			this._logService.error(`onWillSaveTextDocument-listener from extension '${extension.identifier.value}' threw ERROR`);
			this._logService.error(err);

			if (!(err instanceof Error) || (<Error>err).message !== 'concurrent_edits') {
				const errors = this._badListeners.get(listener);
				this._badListeners.set(listener, !errors ? 1 : errors + 1);

				if (typeof errors === 'number' && errors > this._thresholds.errors) {
					this._logService.info(`onWillSaveTextDocument-listener from extension '${extension.identifier.value}' will now be IGNORED because of timeouts and/or errors`);
				}
			}
			return false;
		});
	}

	private _deliverEventAsync(extension: IExtensionDescription, listener: Function, thisArg: unknown, stubEvent: Pick<vscode.TextDocumentWillSaveEvent, 'document' | 'reason'>): Promise<boolean | undefined> {

		const promises: Promise<vscode.TextEdit[]>[] = [];

		const t1 = Date.now();
		const { document, reason } = stubEvent;
		const { version } = document;

		const event = Object.freeze<vscode.TextDocumentWillSaveEvent>({
			document,
			reason,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			waitUntil(p: Promise<any | vscode.TextEdit[]>) {
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
				this._logService.debug(`onWillSaveTextDocument-listener from extension '${extension.identifier.value}' finished after ${(Date.now() - t1)}ms`);
				clearTimeout(handle);
				resolve(edits);
			}).catch(err => {
				clearTimeout(handle);
				reject(err);
			});

		}).then(values => {
			const dto: IWorkspaceEditDto = { edits: [] };
			for (const value of values) {
				if (Array.isArray(value) && (<vscode.TextEdit[]>value).every(e => e instanceof TextEdit)) {
					for (const { newText, newEol, range } of value) {
						dto.edits.push({
							resource: document.uri,
							versionId: undefined,
							textEdit: {
								range: range && Range.from(range),
								text: newText,
								eol: newEol && EndOfLine.from(newEol),
							}
						});
					}
				}
			}

			// apply edits if any and if document
			// didn't change somehow in the meantime
			if (dto.edits.length === 0) {
				return undefined;
			}

			if (version === document.version) {
				return this._mainThreadBulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers(dto));
			}

			return Promise.reject(new Error('concurrent_edits'));
		});
	}
}
