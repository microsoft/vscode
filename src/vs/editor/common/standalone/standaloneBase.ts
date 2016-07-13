/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Emitter} from 'vs/base/common/event';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection, SelectionDirection} from 'vs/editor/common/core/selection';
import {TPromise} from 'vs/base/common/winjs.base';
import {CancellationTokenSource} from 'vs/base/common/cancellation';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';

export function createMonacoBaseAPI(): typeof monaco {
	return {
		editor: undefined,
		languages: undefined,
		CancellationTokenSource: CancellationTokenSource,
		Emitter: Emitter,
		KeyCode: KeyCode,
		KeyMod: KeyMod,
		Position: Position,
		Range: Range,
		Selection: Selection,
		SelectionDirection: SelectionDirection,
		Severity: Severity,
		Promise: TPromise,
		Uri: URI
	};
}
