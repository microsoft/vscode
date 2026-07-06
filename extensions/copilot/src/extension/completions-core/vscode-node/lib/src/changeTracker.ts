/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../types/src';
import { ICompletionsTextDocumentManagerService } from './textDocumentManager';

/**
 * A tracker which can take an arbitrary number of actions to run after a given timeout
 * When all pushed timeouts have been resolved, the tracker disposes of itself.
 */
export class ChangeTracker {
	private _offset: number;
	get offset(): number {
		return this._offset;
	}
	private _referenceCount = 0;
	private _tracker: Disposable;
	private _isDisposed = false;

	constructor(
		fileURI: string,
		insertionOffset: number,
		@ICompletionsTextDocumentManagerService documentManager: ICompletionsTextDocumentManagerService
	) {
		this._offset = insertionOffset;

		this._tracker = documentManager.onDidChangeTextDocument(e => {
			if (e.document.uri === fileURI) {
				for (const cc of e.contentChanges) {
					if (cc.rangeOffset + cc.rangeLength <= this.offset) {
						const delta = cc.text.length - cc.rangeLength;
						this._offset = this._offset + delta;
					}
				}
			}
		});
	}

	push(action: () => void, timeout: number): void {
		if (this._isDisposed) {
			throw new Error('Unable to push new actions to a disposed ChangeTracker');
		}
		this._referenceCount++;
		setTimeout(() => {
			action();
			this._referenceCount--;
			if (this._referenceCount === 0) {
				this._tracker.dispose();
				this._isDisposed = true;
			}
		}, timeout);
	}
}
