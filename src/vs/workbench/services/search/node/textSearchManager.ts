/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toCanonicalName } from '../../textfile/common/encoding';
import * as pfs from '../../../../base/node/pfs';
import { ITextQuery, ITextSearchStats } from '../common/search';
import { TextSearchProviderNew } from '../common/searchExtTypes';
import { TextSearchManager } from '../common/textSearchManager';

export class NativeTextSearchManager extends TextSearchManager {

	constructor(query: ITextQuery, provider: TextSearchProviderNew, _pfs: typeof pfs = pfs, processType: ITextSearchStats['type'] = 'searchProcess') {
		super({ query, provider }, {
			readdir: resource => _pfs.Promises.readdir(resource.fsPath),
			toCanonicalName: name => toCanonicalName(name)
		}, processType);
	}
}
