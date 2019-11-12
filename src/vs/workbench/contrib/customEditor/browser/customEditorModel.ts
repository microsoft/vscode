/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

type Edit = string;

export class CustomEditorModel extends Disposable {

	private _currentEditIndex: number = 0;
	private _savePoint: number = -1;
	private _edits: Array<Edit> = [];

	protected readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	protected readonly _onUndo: Emitter<Edit> = this._register(new Emitter<Edit>());
	readonly onUndo: Event<Edit> = this._onUndo.event;

	public makeEdit(data: string): void {
		this._edits.splice(this._currentEditIndex, this._edits.length - this._currentEditIndex, data);
		this._currentEditIndex = this._edits.length - 1;
		this.updateDirty();
	}

	public isDirty(): boolean {
		return this._edits.length > 0 && this._savePoint !== this._edits.length;
	}

	private updateDirty() {
		this._onDidChangeDirty.fire();
	}

	public save() {
		this._savePoint = this._edits.length;
		this.updateDirty();
	}

	public undo() {
		if (this._currentEditIndex >= 0) {
			const undoneEdit = this._edits[this._currentEditIndex];
			--this._currentEditIndex;
			this._onUndo.fire(undoneEdit);
		}
		this.updateDirty();
	}
}
