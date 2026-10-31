/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Native modules of this install root are built for the remote server's Node.js version in
// .npmrc. `pnpmfile` in pnpm-workspace.yaml selects this file. pnpm only loads JavaScript
// pnpmfiles; the hooks, which pass the npm_config_* variables to every dependency install script,
// are in TypeScript. See build/npm/pnpm/nativeBuildEnv.ts.
import { createNativeBuildHooks } from '../build/npm/pnpm/nativeBuildEnv.ts';

export const hooks = createNativeBuildHooks(import.meta.dirname, { forceProcessConfigOnDarwin: true });
