/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { KeyMod as ConstKeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Token } from 'vs/editor/common/core/token';
import { URI } from 'vs/base/common/uri';
import * as enums from 'vs/editor/common/standalone/standaloneEnums';

export class KeyMod {
	public static readonly CtrlCmd: number = ConstKeyMod.CtrlCmd;
	public static readonly Shift: number = ConstKeyMod.Shift;
	public static readonly Alt: number = ConstKeyMod.Alt;
	public static readonly WinCtrl: number = ConstKeyMod.WinCtrl;

	public static chord(firstPart: number, secondPart: number): number {
		return KeyChord(firstPart, secondPart);
	}
}

export function createMonacoBaseAPI(): typeof monaco {
	return {
		editor: undefined!, // undefined override expected here
		languages: undefined!, // undefined override expected here
		CancellationTokenSource: CancellationTokenSource,
		Emitter: Emitter,
		KeyCode: enums.KeyCode,
		KeyMod: KeyMod,
		Position: Position,
		Range: Range,
		Selection: <any>Selection,
		SelectionDirection: enums.SelectionDirection,
		MarkerSeverity: enums.MarkerSeverity,
		MarkerTag: enums.MarkerTag,
		Promise: TPromise,
		Uri: <any>URI,
		Token: Token
	};
}
