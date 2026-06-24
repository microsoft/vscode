/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from '../../vscodeTypes';
import { Location, Position, Range } from '../../vscodeTypes';
import { URI } from '../vs/base/common/uri';

export function isUri(thing: any): thing is URI | vscode.Uri {
	// This check works for URIs from vscode, but doesn't help with type narrowing on its own, so this function exists.
	return URI.isUri(thing);
}

export function isLocation(obj: any): obj is vscode.Location {
	return obj && typeof obj === 'object' && 'uri' in obj && 'range' in obj;
}

export function toLocation(obj: any) {
	if (isLocation(obj) && Array.isArray(obj.range) && obj.range.length === 2) {
		// HACK: prompt-tsx returns serialized ranges/positions that need to be converted back into real objects
		const start = obj.range[0];
		const end = obj.range[1];
		return new Location(obj.uri, new Range(new Position(start.line, start.character), new Position(end.line, end.character)));
	} else if (isLocation(obj) && obj.range instanceof Range) {
		return obj;
	}
	return undefined;
}

export function isSymbolInformation(obj: any): obj is vscode.SymbolInformation {
	return obj && typeof obj === 'object' && 'name' in obj && 'containerName' in obj;
}
