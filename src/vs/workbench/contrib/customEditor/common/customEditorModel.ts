/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICustomEditorModel, CustomEditorEdit } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IRevertOptions, ISaveOptions, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';


export class CustomEditorModel extends Disposable implements ICustomEditorModel {

	private _currentEditIndex: number = -1;
	private _savePoint: number = -1;
	private _edits: Array<CustomEditorEdit> = [];

	constructor(
		private readonly _resource: URI,
	) {
		super();
	}

	//#region IWorkingCopy

	public get resource() {
		return this._resource;
	}

	public get capabilities(): WorkingCopyCapabilities {
		return 0;
	}

	public isDirty(): boolean {
		return this._edits.length > 0 && this._savePoint !== this._edits.length;
	}

	protected readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	//#endregion

	protected readonly _onUndo = this._register(new Emitter<CustomEditorEdit>());
	readonly onUndo: Event<CustomEditorEdit> = this._onUndo.event;

	protected readonly _onRedo = this._register(new Emitter<CustomEditorEdit>());
	readonly onRedo: Event<CustomEditorEdit> = this._onRedo.event;

	public makeEdit(data: string): void {
		this._edits.splice(this._currentEditIndex, this._edits.length - this._currentEditIndex, data);
		this._currentEditIndex = this._edits.length - 1;
		this.updateDirty();
	}

	private updateDirty() {
		this._onDidChangeDirty.fire();
	}

	public async save(options?: ISaveOptions) {
		this._savePoint = this._edits.length;
		this.updateDirty();

		return true;
	}

	public async revert(options?: IRevertOptions) {
		while (this._currentEditIndex > 0) {
			this.undo();
		}

		return true;
	}

	public undo() {
		if (this._currentEditIndex < 0) {
			// nothing to undo
			return;
		}

		const undoneEdit = this._edits[this._currentEditIndex];
		--this._currentEditIndex;
		this._onUndo.fire(undoneEdit);

		this.updateDirty();
	}

	public redo() {
		if (this._currentEditIndex >= this._edits.length - 1) {
			// nothing to redo
			return;
		}

		++this._currentEditIndex;
		const redoneEdit = this._edits[this._currentEditIndex];
		this._onRedo.fire(redoneEdit);

		this.updateDirty();
	}
}


