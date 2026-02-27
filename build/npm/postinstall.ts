/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';

// With pnpm workspaces, all dependencies are installed by a single `pnpm install`
// at the repo root. The old multi-directory npm install cascade is no longer needed.
// This postinstall script only handles post-install setup tasks.

// Configure git settings
child_process.execSync('git config pull.rebase merges');
child_process.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs');
