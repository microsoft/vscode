/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { CustomEditorSaveAsEvent, CustomEditorSaveEvent, ICustomEditorModel } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IWorkingCopyBackup, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILabelService } from 'vs/platform/label/common/label';
import { basename } from 'vs/base/common/path';

namespace HotExitState {
	export const enum Type {
		NotSupported,
		Allowed,
		NotAllowed,
		Pending,
	}

	export const NotSupported = Object.freeze({ type: Type.NotSupported } as const);
	export const Allowed = Object.freeze({ type: Type.Allowed } as const);
	export const NotAllowed = Object.freeze({ type: Type.NotAllowed } as const);

	export class Pending {
		readonly type = Type.Pending;

		constructor(
			public readonly operation: CancelablePromise<void>,
		) { }
	}

	export type State = typeof NotSupported | typeof Allowed | typeof NotAllowed | Pending;
}

export class CustomEditorModel extends Disposable implements ICustomEditorModel {

	private _hotExitState: HotExitState.State = HotExitState.NotSupported;
	private _dirty = false;

	constructor(
		public readonly viewType: string,
		private readonly _resource: URI,
		private readonly labelService: ILabelService,
	) {
		super();
	}

	//#region IWorkingCopy

	public get resource() {
		return this._resource;
	}

	public get name() {
		return basename(this.labelService.getUriLabel(this._resource));
	}

	public get capabilities(): WorkingCopyCapabilities {
		return 0;
	}

	public isDirty(): boolean {
		return this._dirty;
	}

	private readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	//#endregion

	private readonly _onUndo = this._register(new Emitter<void>());
	public readonly onUndo = this._onUndo.event;

	private readonly _onRedo = this._register(new Emitter<void>());
	public readonly onRedo = this._onRedo.event;

	private readonly _onRevert = this._register(new Emitter<void>());
	public readonly onRevert = this._onRevert.event;

	private readonly _onWillSave = this._register(new Emitter<CustomEditorSaveEvent>());
	public readonly onWillSave = this._onWillSave.event;

	private readonly _onWillSaveAs = this._register(new Emitter<CustomEditorSaveAsEvent>());
	public readonly onWillSaveAs = this._onWillSaveAs.event;

	private _onBackup: undefined | (() => CancelablePromise<void>);

	public onBackup(f: () => CancelablePromise<void>) {
		if (this._onBackup) {
			throw new Error('Backup already implemented');
		}
		this._onBackup = f;

		if (this._hotExitState === HotExitState.NotSupported) {
			this._hotExitState = this.isDirty() ? HotExitState.NotAllowed : HotExitState.Allowed;
		}
	}

	public setDirty(dirty: boolean): void {
		this._onDidChangeContent.fire();

		if (this._dirty !== dirty) {
			this._dirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	public async revert(_options?: IRevertOptions) {
		if (!this._dirty) {
			return true;
		}

		this._onRevert.fire();
		return true;
	}

	public undo() {
		this._onUndo.fire();
	}

	public redo() {
		this._onRedo.fire();
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

		this.setDirty(false);

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

		this.setDirty(false);

		return true;
	}

	public async backup(): Promise<IWorkingCopyBackup> {
		if (this._hotExitState === HotExitState.NotSupported) {
			throw new Error('Not supported');
		}

		if (this._hotExitState.type === HotExitState.Type.Pending) {
			this._hotExitState.operation.cancel();
		}
		this._hotExitState = HotExitState.NotAllowed;

		const pendingState = new HotExitState.Pending(this._onBackup!());
		this._hotExitState = pendingState;

		try {
			await pendingState.operation;
			// Make sure state has not changed in the meantime
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.Allowed;
			}
		} catch (e) {
			// Make sure state has not changed in the meantime
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.NotAllowed;
			}
		}

		if (this._hotExitState === HotExitState.Allowed) {
			return {
				meta: {
					viewType: this.viewType,
				}
			};
		}
		throw new Error('Cannot back up in this state');
	}
}
