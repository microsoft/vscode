/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Native modules of this install root are built for the remote server's Node.js version in
// .npmrc. pnpm loads this file in its own process (`pnpmfile` in pnpm-workspace.yaml), so the
// npm_config_* variables set here reach every dependency install script. It exports no hooks, so
// lockfiles don't depend on it. See build/npm/pnpm/nativeBuildEnv.ts.
import { applyNativeBuildEnv } from '../build/npm/pnpm/nativeBuildEnv.ts';

applyNativeBuildEnv(import.meta.dirname, { forceProcessConfigOnDarwin: true });
