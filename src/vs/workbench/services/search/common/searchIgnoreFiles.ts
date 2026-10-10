/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { DEFAULT_SEARCH_IGNORE_FILE_NAMES } from './search.js';

export function getSearchIgnoreFileNames(contributions: readonly (readonly string[])[]): string[] {
	const contributedSearchIgnoreFileNames = contributions.flat()
		.filter(fileName => typeof fileName === 'string' && fileName.length > 0 && !fileName.includes('/') && !fileName.includes('\\'))
		.filter(fileName => !DEFAULT_SEARCH_IGNORE_FILE_NAMES.includes(fileName));
	return distinct([...contributedSearchIgnoreFileNames, ...DEFAULT_SEARCH_IGNORE_FILE_NAMES]);
}
