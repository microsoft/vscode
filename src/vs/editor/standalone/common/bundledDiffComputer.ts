/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTsDiffComputer } from '@vscode/diff/core';
import { setBundledExternalDiffComputer } from '../../common/diff/externalLinesDiffComputer.js';

// The standalone editor's users bundle `@vscode/diff` like any other dependency, so its worker can import
// the TypeScript backend statically instead of loading the package from `node_modules` at runtime.
setBundledExternalDiffComputer(createTsDiffComputer());
