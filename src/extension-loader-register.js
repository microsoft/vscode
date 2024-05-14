/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { register } from "node:module";
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const absolutePath = join(__dirname, 'extension-loader.js')
const absoluteUri = pathToFileURL(absolutePath).toString()

register(absoluteUri);
