// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { EXTENSION_ROOT_DIR } from '../../../constants';

// It is simpler to hard-code it instead of using vscode.ExtensionContext.extensionPath.
export const _SCRIPTS_DIR = path.join(EXTENSION_ROOT_DIR, 'python_files');
