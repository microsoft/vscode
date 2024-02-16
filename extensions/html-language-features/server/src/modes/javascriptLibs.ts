/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, join } from 'path';

const serverFolder = basename(__dirname) === 'dist' ? dirname(__dirname) : dirname(dirname(__dirname));
export const JQUERY_PATH = join(serverFolder, 'lib/jquery.d.ts');
