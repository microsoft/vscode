/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { Location } from '../../../../../../../editor/common/languages.js';
import { Range } from '../../../../../../../editor/common/core/range.js';

export function toolResultDetailsFromResponse(terminalResults: { output: string; resources?: ILinkLocation[] }[]): (URI | Location)[] {
	return Array.from(new Map(
		terminalResults
			.flatMap(r =>
				r.resources?.filter(res => res.uri).map(res => {
					const range = res.range;
					const item = range !== undefined ? { uri: res.uri, range } : res.uri;
					const key = range !== undefined
						? `${res.uri.toString()}-${range.toString()}`
						: `${res.uri.toString()}`;
					return [key, item] as [string, URI | Location];
				}) ?? []
			)
	).values());
}

export interface ILinkLocation { uri: URI; range?: Range }
