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
	private readonly _edits: Array<CustomEditorEdit> = [];

	constructor(
		public readonly viewType: string,
		private readonly _resource: URI,
	) {
		super();
	}

	dispose() {
		this._onDisposeEdits.fire({ edits: this._edits });
		super.dispose();
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

	protected readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	//#endregion

	protected readonly _onUndo = this._register(new Emitter<{ edits: readonly CustomEditorEdit[], trigger: any | undefined }>());
	readonly onUndo = this._onUndo.event;

	protected readonly _onApplyEdit = this._register(new Emitter<{ edits: readonly CustomEditorEdit[], trigger: any | undefined }>());
	readonly onApplyEdit = this._onApplyEdit.event;

	protected readonly _onDisposeEdits = this._register(new Emitter<{ edits: readonly CustomEditorEdit[] }>());
	readonly onDisposeEdits = this._onDisposeEdits.event;

	protected readonly _onWillSave = this._register(new Emitter<CustomEditorSaveEvent>());
	readonly onWillSave = this._onWillSave.event;

	protected readonly _onWillSaveAs = this._register(new Emitter<CustomEditorSaveAsEvent>());
	readonly onWillSaveAs = this._onWillSaveAs.event;

	public pushEdit(edit: CustomEditorEdit, trigger: any): void {
		this.spliceEdits(edit);

		this._currentEditIndex = this._edits.length - 1;
		this.updateDirty();
		this._onApplyEdit.fire({ edits: [edit], trigger });
		this.updateContentChanged();
	}

	private spliceEdits(editToInsert?: CustomEditorEdit) {
		const start = this._currentEditIndex + 1;
		const toRemove = this._edits.length - this._currentEditIndex;

		const removedEdits = editToInsert
			? this._edits.splice(start, toRemove, editToInsert)
			: this._edits.splice(start, toRemove);

		if (removedEdits.length) {
			this._onDisposeEdits.fire({ edits: removedEdits });
		}
	}

	private updateDirty() {
		// TODO@matt this should to be more fine grained and avoid
		// emitting events if there was no change actually
		this._onDidChangeDirty.fire();
	}

	private updateContentChanged() {
		// TODO@matt revisit that this method is being called correctly
		// on each case of content change within the custom editor
		this._onDidChangeContent.fire();
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
			this._onUndo.fire({ edits: editsToUndo.reverse(), trigger: undefined });
		} else if (this._currentEditIndex < this._savePoint) {
			const editsToRedo = this._edits.slice(this._currentEditIndex, this._savePoint);
			this._onApplyEdit.fire({ edits: editsToRedo, trigger: undefined });
		}

		this._currentEditIndex = this._savePoint;
		this.spliceEdits();

		this.updateDirty();
		this.updateContentChanged();
		return true;
	}

	public undo() {
		if (this._currentEditIndex < 0) {
			// nothing to undo
			return;
		}

		const undoneEdit = this._edits[this._currentEditIndex];
		--this._currentEditIndex;
		this._onUndo.fire({ edits: [undoneEdit], trigger: undefined });

		this.updateDirty();
		this.updateContentChanged();
	}

	public redo() {
		if (this._currentEditIndex >= this._edits.length - 1) {
			// nothing to redo
			return;
		}

		++this._currentEditIndex;
		const redoneEdit = this._edits[this._currentEditIndex];

		this._onApplyEdit.fire({ edits: [redoneEdit], trigger: undefined });

		this.updateDirty();
		this.updateContentChanged();
	}

	public hasBackup(): boolean {
		return true; //TODO@matt forward to extension
	}

	public async backup(): Promise<void> {
		//TODO@matt forward to extension
	}
}
