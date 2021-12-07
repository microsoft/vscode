/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';

export class TextModelPart implements IDisposable {
	private _isDisposed = false;

	public dispose(): void {
		this._isDisposed = true;
	}
	protected assertNotDisposed(): void {
		if (this._isDisposed) {
			throw new Error('TextModelPart is disposed!');
		}
	}
}
