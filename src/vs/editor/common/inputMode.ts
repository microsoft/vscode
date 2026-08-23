/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../base/common/event.js';

class InputModeImpl {

	private _inputMode: 'overtype' | 'insert' = 'insert';
	private readonly _onDidChangeInputMode = new Emitter<'overtype' | 'insert'>();
	public readonly onDidChangeInputMode: Event<'overtype' | 'insert'> = this._onDidChangeInputMode.event;

	public getInputMode(): 'overtype' | 'insert' {
		return this._inputMode;
	}

	public setInputMode(inputMode: 'overtype' | 'insert'): void {
		this._inputMode = inputMode;
		this._onDidChangeInputMode.fire(this._inputMode);
	}
}

/**
 * Controls the type mode, whether insert or overtype
 */
export const InputMode = new InputModeImpl();
