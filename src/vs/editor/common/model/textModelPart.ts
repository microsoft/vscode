/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';

export class TextModelPart extends Disposable {
	private _isDisposed = false;

	public override dispose(): void {
		super.dispose();
		this._isDisposed = true;
	}
	protected assertNotDisposed(): void {
		if (this._isDisposed) {
			throw new Error('TextModelPart is disposed!');
		}
	}
}
