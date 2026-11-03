/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Native modules of this install root are built for Electron. `pnpmfile` in pnpm-workspace.yaml
// selects this file. pnpm only loads JavaScript pnpmfiles; the hooks are in TypeScript. They pass
// the npm_config_* variables of .npmrc to every dependency install script, and pass the frozen
// lockfile of `pnpm ci` on to the separate install roots. See build/npm/pnpm/nativeBuildEnv.ts.
import { createNativeBuildHooks } from './build/npm/pnpm/nativeBuildEnv.ts';

export const hooks = createNativeBuildHooks(import.meta.dirname, { exportFrozenLockfileOfCi: true });
