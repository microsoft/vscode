/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The built-in extensions run in Electron, so their native modules are built for the `nativeBuild`
// field of the repository's package.json, like the workspace's. `pnpmfile` in pnpm-workspace.yaml
// selects this file. See build/npm/pnpm/nativeBuildEnv.ts.
import path from 'node:path';
import { createNativeBuildHooks } from '../build/npm/pnpm/nativeBuildEnv.ts';

export const hooks = createNativeBuildHooks(path.dirname(import.meta.dirname));
