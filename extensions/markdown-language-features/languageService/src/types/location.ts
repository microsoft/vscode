/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from './range';
import { IUri, toVsUri } from './uri';
import * as lsp from 'vscode-languageserver-types';

export interface ILocation {
	readonly uri: IUri;
	readonly range: IRange;
}

export function makeLocation(uri: IUri, range: IRange): ILocation {
	return { uri: toVsUri(uri), range: range };
}

export function toLspLocation(loc: ILocation): lsp.Location {
	return {
		uri: loc.uri.toString(),
		range: loc.range,
	};
}
