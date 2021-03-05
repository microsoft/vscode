/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICustomEditorModel, CustomEditorEdit, CustomEditorSaveAsEvent, CustomEditorSaveEvent } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';

export class CustomEditorModel extends Disposable implements ICustomEditorModel {

	private _currentEditIndex: number = -1;
	private _savePoint: number = -1;
	private _edits: Array<any> = [];

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
		return this._edits.length > 0 && this._savePoint !== this._currentEditIndex;
	}

	protected readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	//#endregion

	protected readonly _onUndo = this._register(new Emitter<readonly CustomEditorEdit[]>());
	readonly onUndo = this._onUndo.event;

	protected readonly _onApplyEdit = this._register(new Emitter<readonly CustomEditorEdit[]>());
	readonly onApplyEdit = this._onApplyEdit.event;

	protected readonly _onWillSave = this._register(new Emitter<CustomEditorSaveEvent>());
	readonly onWillSave = this._onWillSave.event;

	protected readonly _onWillSaveAs = this._register(new Emitter<CustomEditorSaveAsEvent>());
	readonly onWillSaveAs = this._onWillSaveAs.event;

	get currentEdits(): readonly CustomEditorEdit[] {
		return this._edits.slice(0, Math.max(0, this._currentEditIndex + 1));
	}

	public pushEdit(edit: CustomEditorEdit): void {
		this._edits.splice(this._currentEditIndex + 1, this._edits.length - this._currentEditIndex, edit.data);
		this._currentEditIndex = this._edits.length - 1;
		this.updateDirty();
		this._onApplyEdit.fire([edit]);
	}

	private updateDirty() {
		this._onDidChangeDirty.fire();
	}

	public async save(_options?: ISaveOptions): Promise<boolean> {
		const untils: Promise<any>[] = [];
		const handler: CustomEditorSaveEvent = {
			resource: this._resource,
			waitUntil: (until: Promise<any>) => untils.push(until)
		};

		try {
			this._onWillSave.fire(handler);
			await Promise.all(untils);
		} catch {
			return false;
		}

		this._savePoint = this._currentEditIndex;
		this.updateDirty();

		return true;
	}

	public async saveAs(resource: URI, targetResource: URI, _options?: ISaveOptions): Promise<boolean> {
		const untils: Promise<any>[] = [];
		const handler: CustomEditorSaveAsEvent = {
			resource,
			targetResource,
			waitUntil: (until: Promise<any>) => untils.push(until)
		};

		try {
			this._onWillSaveAs.fire(handler);
			await Promise.all(untils);
		} catch {
			return false;
		}

		this._savePoint = this._currentEditIndex;
		this.updateDirty();

		return true;
	}

	public async revert(_options?: IRevertOptions) {
		if (this._currentEditIndex === this._savePoint) {
			return true;
		}

		if (this._currentEditIndex >= this._savePoint) {
			const editsToUndo = this._edits.slice(this._savePoint, this._currentEditIndex);
			this._onUndo.fire(editsToUndo.reverse());
		} else if (this._currentEditIndex < this._savePoint) {
			const editsToRedo = this._edits.slice(this._currentEditIndex, this._savePoint);
			this._onApplyEdit.fire(editsToRedo);
		}

		this._currentEditIndex = this._savePoint;
		this._edits.splice(this._currentEditIndex + 1, this._edits.length - this._currentEditIndex);
		this.updateDirty();
		return true;
	}

	public undo() {
		if (this._currentEditIndex < 0) {
			// nothing to undo
			return;
		}

		const undoneEdit = this._edits[this._currentEditIndex];
		--this._currentEditIndex;
		this._onUndo.fire([{ data: undoneEdit }]);

		this.updateDirty();
	}

	public redo() {
		if (this._currentEditIndex >= this._edits.length - 1) {
			// nothing to redo
			return;
		}

		++this._currentEditIndex;
		const redoneEdit = this._edits[this._currentEditIndex];

		this._onApplyEdit.fire([{ data: redoneEdit }]);

		this.updateDirty();
	}
}
