// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';
import { Uri } from 'vscode';
import { EXTENSION_ROOT_DIR } from '../../constants';

const darkIconsPath = path.join(EXTENSION_ROOT_DIR, 'resources', 'dark');
const lightIconsPath = path.join(EXTENSION_ROOT_DIR, 'resources', 'light');

export function getIcon(fileName: string): { light: Uri; dark: Uri } {
    return {
        dark: Uri.file(path.join(darkIconsPath, fileName)),
        light: Uri.file(path.join(lightIconsPath, fileName)),
    };
}
