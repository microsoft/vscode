/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

/**
 * The editor model is the heavyweight counterpart of editor input. Depending on the editor input, it
 * resolves from a file system retrieve content and may allow for saving it back or reverting it.
 * Editor models are typically cached for some while because they are expensive to construct.
 */
export class EditorModel extends Disposable {

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private resolved = false;

	/**
	 * Causes this model to resolve returning a promise when loading is completed.
	 */
	async resolve(): Promise<void> {
		this.resolved = true;
	}

	/**
	 * Returns whether this model was loaded or not.
	 */
	isResolved(): boolean {
		return this.resolved;
	}

	/**
	 * Find out if this model has been disposed.
	 */
	isDisposed(): boolean {
		return this._store.isDisposed;
	}

	/**
	 * Subclasses should implement to free resources that have been claimed through loading.
	 */
	override dispose(): void {
		this._onWillDispose.fire();

		super.dispose();
	}
}
