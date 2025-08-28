/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ErdosNotebookEditorInput } from './ErdosNotebookEditorInput.js';

/**
 * Basic ErdosNotebookInstance for managing notebook state
 */
export class ErdosNotebookInstance extends Disposable {

	private static _instanceMap = new Map<string, ErdosNotebookInstance>();
	private static count = 0;

	readonly uniqueId: string = `erdos-notebook-instance-${ErdosNotebookInstance.count++}`;
	private _identifier = `Erdos Notebook Instance | ${this.uniqueId} |`;

	// Mock selection state machine
	selectionStateMachine = {
		moveUp: (extend: boolean) => {
			this._logService.debug(this._identifier, 'moveUp', extend);
		},
		moveDown: (extend: boolean) => {
			this._logService.debug(this._identifier, 'moveDown', extend);
		},
		getSelectedCell: () => {
			this._logService.debug(this._identifier, 'getSelectedCell');
			return {
				run: () => {
					this._logService.debug(this._identifier, 'run cell');
				}
			};
		}
	};

	constructor(
		private readonly editorInput: ErdosNotebookEditorInput,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._logService.info(this._identifier, 'constructor');
	}

	static getOrCreate(
		editorInput: ErdosNotebookEditorInput,
		workspaceFolder: any,
		instantiationService: IInstantiationService
	): ErdosNotebookInstance {
		const key = editorInput.resource.toString();
		let instance = this._instanceMap.get(key);
		
		if (!instance) {
			instance = instantiationService.createInstance(ErdosNotebookInstance, editorInput);
			this._instanceMap.set(key, instance);
		}
		
		return instance;
	}

	static updateInstanceUri(oldUri: URI, newUri: URI): void {
		const oldKey = oldUri.toString();
		const newKey = newUri.toString();
		
		const instance = this._instanceMap.get(oldKey);
		if (instance) {
			this._instanceMap.delete(oldKey);
			this._instanceMap.set(newKey, instance);
		}
	}

	insertCodeCellAndFocusContainer(position: 'above' | 'below'): void {
		this._logService.debug(this._identifier, 'insertCodeCellAndFocusContainer', position);
	}

	deleteCell(): void {
		this._logService.debug(this._identifier, 'deleteCell');
	}

	override dispose(): void {
		const key = this.editorInput.resource.toString();
		ErdosNotebookInstance._instanceMap.delete(key);
		super.dispose();
	}
}
