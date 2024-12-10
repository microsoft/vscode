/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { NotebookCellStateChangedEvent, NotebookLayoutChangedEvent, NotebookMetadataChangedEvent, NotebookViewEvent, NotebookViewEventType } from '../notebookViewEvents.js';

export class NotebookEventDispatcher extends Disposable {
	private readonly _onDidChangeLayout = this._register(new Emitter<NotebookLayoutChangedEvent>());
	readonly onDidChangeLayout = this._onDidChangeLayout.event;

	private readonly _onDidChangeMetadata = this._register(new Emitter<NotebookMetadataChangedEvent>());
	readonly onDidChangeMetadata = this._onDidChangeMetadata.event;

	private readonly _onDidChangeCellState = this._register(new Emitter<NotebookCellStateChangedEvent>());
	readonly onDidChangeCellState = this._onDidChangeCellState.event;

	emit(events: NotebookViewEvent[]) {
		for (let i = 0, len = events.length; i < len; i++) {
			const e = events[i];

			switch (e.type) {
				case NotebookViewEventType.LayoutChanged:
					this._onDidChangeLayout.fire(e);
					break;
				case NotebookViewEventType.MetadataChanged:
					this._onDidChangeMetadata.fire(e);
					break;
				case NotebookViewEventType.CellStateChanged:
					this._onDidChangeCellState.fire(e);
					break;
			}
		}
	}
}

