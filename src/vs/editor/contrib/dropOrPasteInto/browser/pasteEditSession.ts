/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';

/** Owns cached paste edits until they are disposed or transferred to another session. */
export class PasteEditSession extends Disposable {
	private readonly _edits = this._register(new MutableDisposable<IDisposable>());

	constructor(edits: IDisposable | undefined) {
		super();
		this._edits.value = edits;
	}

	/** Transfers the edits to a new owner. Disposing this session will no longer release them. */
	take(): PasteEditSession {
		return new PasteEditSession(this._edits.clearAndLeak());
	}
}
