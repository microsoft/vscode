/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {dirname, join} from 'vs/base/common/paths';
import {mkdirp, writeFile} from 'vs/base/node/pfs';

export function createPath(parent: string, fileName: string): string {
	return join(dirname(parent), fileName);
};

export function save(file: string, content: string): any {
	mkdirp(dirname(file)).then(() => {
		return writeFile(file, content, 'ascii');
	}, err => {
		//
	});
}
