/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { computePnpmStoreBaseCacheKey, computePnpmStoreCacheKey } from './cacheKeys.ts';

// Writes the files of the pnpm store cache key (see restore-pnpm-store.yml): `.build/pnpmstorebase`, for
// the platform of the job (the arguments, and the platform and architecture that pnpm installs the
// optional dependencies of), and `.build/pnpmstorelockfiles`, for the lockfiles.

const root = path.join(import.meta.dirname, '../../../');
fs.mkdirSync(path.join(root, '.build'), { recursive: true });
fs.writeFileSync(path.join(root, '.build', 'pnpmstorebase'), computePnpmStoreBaseCacheKey([...process.argv.slice(2), process.platform, process.arch]));
fs.writeFileSync(path.join(root, '.build', 'pnpmstorelockfiles'), computePnpmStoreCacheKey());
