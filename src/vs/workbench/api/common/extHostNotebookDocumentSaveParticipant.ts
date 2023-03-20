/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostNotebookDocumentSaveParticipantShape, IWorkspaceEditDto, MainThreadBulkEditsShape } from 'vs/workbench/api/common/extHost.protocol';
import { LinkedList } from 'vs/base/common/linkedList';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { ILogService } from 'vs/platform/log/common/log';
import { NotebookDocumentWillSaveEvent, WorkspaceEdit } from 'vscode';
import { illegalState } from 'vs/base/common/errors';
import { NotebookDocumentSaveReason, WorkspaceEdit as WorksapceEditConverter } from 'vs/workbench/api/common/extHostTypeConverters';
import { SaveReason } from 'vs/workbench/common/editor';

type Listener = [Function, any, IExtensionDescription];
export class ExtHostNotebookDocumentSaveParticipant implements ExtHostNotebookDocumentSaveParticipantShape {
	private readonly _callbacks = new LinkedList<Listener>();
	private readonly _badListeners = new WeakMap<Function, number>();

	constructor(
		private readonly _logService: ILogService,
		private readonly _notebooksAndEditors: ExtHostNotebookController,
		private readonly _mainThreadBulkEdits: MainThreadBulkEditsShape,
		private readonly _thresholds: { timeout: number; errors: number } = { timeout: 1500, errors: 3 }) {

	}

	dispose(): void {
		this._callbacks.clear();
	}

	getOnWillSaveNotebookDocumentEvent(extension: IExtensionDescription): Event<NotebookDocumentWillSaveEvent> {
		return (listener, thisArg, disposables) => {
			const remove = this._callbacks.push([listener, thisArg, extension]);
			const result = { dispose: remove };
			if (Array.isArray(disposables)) {
				disposables.push(result);
			}
			return result;
		};
	}

	async $participateInSave(resource: UriComponents, reason: SaveReason): Promise<boolean[]> {
		const revivedUri = URI.revive(resource);
		let didTimeout = false;
		const didTimeoutHandle = setTimeout(() => didTimeout = true, this._thresholds.timeout);

		const results: boolean[] = [];

		try {
			for (const listener of [...this._callbacks]) { // copy to prevent concurrent modifications
				if (didTimeout) {
					break;
				}
				const document = this._notebooksAndEditors.getNotebookDocument(revivedUri);
				const success = await this._deliverEventAsyncAndBlameBadListeners(listener, <any>{ document, reason: NotebookDocumentSaveReason.to(reason) });
				results.push(success);
			}
		} finally {
			clearTimeout(didTimeoutHandle);
		}

		return results;
	}

	private _deliverEventAsyncAndBlameBadListeners([listener, thisArg, extension]: Listener, stubEvent: NotebookDocumentWillSaveEvent): Promise<any> {
		const errors = this._badListeners.get(listener);
		if (typeof errors === 'number' && errors > this._thresholds.errors) {
			// bad listener - ignore
			return Promise.resolve(false);
		}

		return this._deliverEventAsync(extension, listener, thisArg, stubEvent).then(() => {
			// don't send result across the wire
			return true;

		}, err => {

			this._logService.error(`onWillSaveNotebookDocument-listener from extension '${extension.identifier.value}' threw ERROR`);
			this._logService.error(err);

			if (!(err instanceof Error) || (<Error>err).message !== 'concurrent_edits') {
				const errors = this._badListeners.get(listener);
				this._badListeners.set(listener, !errors ? 1 : errors + 1);

				if (typeof errors === 'number' && errors > this._thresholds.errors) {
					this._logService.info(`onWillSaveNotebookDocument-listener from extension '${extension.identifier.value}' will now be IGNORED because of timeouts and/or errors`);
				}
			}
			return false;
		});
	}

	private _deliverEventAsync(extension: IExtensionDescription, listener: Function, thisArg: any, stubEvent: NotebookDocumentWillSaveEvent): Promise<any> {

		const promises: Promise<WorkspaceEdit[]>[] = [];

		const t1 = Date.now();
		const { document, reason } = stubEvent;
		const { version } = document;

		const event = Object.freeze<NotebookDocumentWillSaveEvent>({
			document,
			reason,
			waitUntil(p: Promise<any | WorkspaceEdit[]>) {
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

		return new Promise<WorkspaceEdit[][]>((resolve, reject) => {
			// join on all listener promises, reject after timeout
			const handle = setTimeout(() => reject(new Error('timeout')), this._thresholds.timeout);

			return Promise.all(promises).then(edits => {
				this._logService.debug(`onWillSaveNotebookDocument-listener from extension '${extension.identifier.value}' finished after ${(Date.now() - t1)}ms`);
				clearTimeout(handle);
				resolve(edits);
			}).catch(err => {
				clearTimeout(handle);
				reject(err);
			});

		}).then(values => {
			const dto: IWorkspaceEditDto = { edits: [] };
			for (const value of values) {
				if (Array.isArray(value)) {
					for (const edit of value) {
						if (edit) {
							const editDto = WorksapceEditConverter.from(edit);
							dto.edits.push(...editDto.edits);
						}
					}
				}
			}

			// apply edits if any and if document
			// didn't change somehow in the meantime
			if (dto.edits.length === 0) {
				return undefined;
			}

			if (version === document.version) {
				return this._mainThreadBulkEdits.$tryApplyWorkspaceEdit(dto);
			}

			return Promise.reject(new Error('concurrent_edits'));
		});
	}
}
