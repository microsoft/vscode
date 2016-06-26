/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import {dirname, join} from 'vs/base/common/paths';
import {mkdirp, writeFile} from 'vs/base/node/pfs';

export function createPath(parent: string, fileName: string): string {
	var stat = fs.statSync(parent);
	if (stat && !stat.isDirectory()) {
		parent = dirname(parent);
	}

	return join(parent, fileName);
};

export function save(file: string, content: string): any {
	mkdirp(dirname(file)).then(() => {
		return writeFile(file, content, 'ascii');
	}, err => {
		//
	});
}
