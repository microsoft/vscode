/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { KeyChord, KeyMod as ConstKeyMod } from '../../../base/common/keyCodes.js';
import { URI } from '../../../base/common/uri.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { Token } from '../languages.js';
import * as standaloneEnums from '../standalone/standaloneEnums.js';

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
		KeyCode: standaloneEnums.KeyCode,
		KeyMod: KeyMod,
		Position: Position,
		Range: Range,
		Selection: Selection as unknown as typeof monaco.Selection,
		SelectionDirection: standaloneEnums.SelectionDirection,
		MarkerSeverity: standaloneEnums.MarkerSeverity,
		MarkerTag: standaloneEnums.MarkerTag,
		Uri: URI as unknown as typeof monaco.Uri,
		Token: Token
	};
}
