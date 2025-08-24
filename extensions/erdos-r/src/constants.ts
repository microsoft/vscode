/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

export const EXTENSION_ROOT_DIR = path.join(__dirname, '..');

const packageJsonPath = path.join(EXTENSION_ROOT_DIR, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

export const MINIMUM_R_VERSION = packageJson.erdos.minimumRVersion as string;
export const MINIMUM_RENV_VERSION = packageJson.erdos.minimumRenvVersion as string;
export const ERDOS_R_INTERPRETERS_DEFAULT_SETTING_KEY = 'erdos.r.interpreters.default';