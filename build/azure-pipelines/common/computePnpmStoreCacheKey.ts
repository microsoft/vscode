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
//
// In Azure Pipelines it also points pnpm at the cached store for the later steps of the job:
// PNPM_CONFIG_STORE_DIR, outside of the sources but on their volume, so that pnpm can hard link from
// it, and PNPM_CONFIG_CACHE_DIR inside it. Steps templates set them here, as they can't declare job
// variables.

const root = path.join(import.meta.dirname, '../../../');
fs.mkdirSync(path.join(root, '.build'), { recursive: true });
fs.writeFileSync(path.join(root, '.build', 'pnpmstorebase'), computePnpmStoreBaseCacheKey([...process.argv.slice(2), process.platform, process.arch]));
fs.writeFileSync(path.join(root, '.build', 'pnpmstorelockfiles'), computePnpmStoreCacheKey());

if (process.env['TF_BUILD'] && process.env['PIPELINE_WORKSPACE']) {
	const storeDir = path.join(process.env['PIPELINE_WORKSPACE'], 'pnpm-store');
	console.log(`##vso[task.setvariable variable=PNPM_CONFIG_STORE_DIR]${storeDir}`);
	console.log(`##vso[task.setvariable variable=PNPM_CONFIG_CACHE_DIR]${path.join(storeDir, 'cache')}`);
}
