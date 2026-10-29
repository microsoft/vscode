/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { DocumentPasteEdit } from '../../../common/languages.js';

/** Owns cached paste edits until they are disposed or transferred to another session. */
export class PasteEditSession<T extends DocumentPasteEdit = DocumentPasteEdit> extends Disposable {
	private readonly _disposables = this._register(new MutableDisposable<IDisposable>());

	constructor(readonly edits: readonly T[], disposables: IDisposable | undefined) {
		super();
		this._disposables.value = disposables;
	}

	/** Transfers the edits to a new owner. Disposing this session will no longer release them. */
	take(): PasteEditSession<T> {
		return new PasteEditSession(this.edits, this._disposables.clearAndLeak());
	}
}
