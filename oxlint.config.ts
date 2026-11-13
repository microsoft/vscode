/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from 'oxlint';
import { toOxlintConfig } from './build/lib/oxlintConfig.ts';
import eslintConfig from './eslint.config.js';

// oxlint runs the rules of eslint.config.js, converted when oxlint loads this file. See build/lib/oxlintConfig.ts.
export default defineConfig(toOxlintConfig(eslintConfig));
