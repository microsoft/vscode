/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testGlobals } from './testGlobals.js';

const { join, resolve, dirname, isAbsolute, normalize, relative, basename, extname, format, parse, toNamedspacedPath, sep, delimiter } = testGlobals.path;

export { basename, delimiter, dirname, extname, format, isAbsolute, join, normalize, parse, relative, resolve, sep, toNamedspacedPath };
