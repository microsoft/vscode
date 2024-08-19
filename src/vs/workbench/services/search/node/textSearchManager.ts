/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toCanonicalName } from 'vs/workbench/services/textfile/common/encoding';
import * as pfs from 'vs/base/node/pfs';
import { ITextQuery, ITextSearchStats } from 'vs/workbench/services/search/common/search';
import { TextSearchProviderNew } from 'vs/workbench/services/search/common/searchExtTypes';
import { TextSearchManager } from 'vs/workbench/services/search/common/textSearchManager';

export class NativeTextSearchManager extends TextSearchManager {

	constructor(query: ITextQuery, provider: TextSearchProviderNew, _pfs: typeof pfs = pfs, processType: ITextSearchStats['type'] = 'searchProcess') {
		super({ query, provider }, {
			readdir: resource => _pfs.Promises.readdir(resource.fsPath),
			toCanonicalName: name => toCanonicalName(name)
		}, processType);
	}
}
