/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFilter, matchesFuzzy, matchesFuzzy2 } from 'vs/base/common/filters';
import * as strings from 'vs/base/common/strings';

export class FilterOptions {

	static readonly _filter: IFilter = matchesFuzzy2;
	static readonly _messageFilter: IFilter = matchesFuzzy;

	readonly showResolved: boolean = true;
	readonly showUnresolved: boolean = true;
	readonly textFilter: { readonly text: string; readonly negate: boolean };

	constructor(
		readonly filter: string,
		showResolved: boolean,
		showUnresolved: boolean,
	) {
		filter = filter.trim();
		this.showResolved = showResolved;
		this.showUnresolved = showUnresolved;

		const negate = filter.startsWith('!');
		this.textFilter = { text: (negate ? strings.ltrim(filter, '!') : filter).trim(), negate };
	}
}
