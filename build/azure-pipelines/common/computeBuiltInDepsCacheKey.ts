/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.join(__dirname, '../../../');

const shasum = crypto.createHash('sha256');
shasum.update(fs.readFileSync(path.join(ROOT, 'build/.cachesalt')));

const productjson = JSON.parse(fs.readFileSync(path.join(ROOT, 'product.json'), 'utf8'));
for (const ext of productjson.builtInExtensions) {
	shasum.update(`${ext.name}@${ext.version}`);
}

process.stdout.write(shasum.digest('hex'));
