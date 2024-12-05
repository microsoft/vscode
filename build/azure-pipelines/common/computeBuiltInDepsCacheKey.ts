/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../product.json'), 'utf8'));
const shasum = crypto.createHash('sha256');

for (const ext of productjson.builtInExtensions) {
	shasum.update(`${ext.name}@${ext.version}`);
}

process.stdout.write(shasum.digest('hex'));
