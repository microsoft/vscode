/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { computePnpmStoreBaseCacheKey, computePnpmStoreCacheKey } from './cacheKeys.ts';

// Writes the files of the pnpm store cache key (see restore-pnpm-store.yml, and
// .github/actions/restore-pnpm-store in GitHub Actions): `.build/pnpmstorebase`, for the platform of the
// job (the arguments, and the platform and architecture that pnpm installs the optional dependencies
// of), and `.build/pnpmstorelockfiles`, for the lockfiles.
//
// It also points pnpm at the cached store for the later steps of the job: the store directory, outside
// of the sources but on their volume, so that pnpm can hard link from it, and the cache directory
// inside it. In Azure Pipelines, steps templates set them here, as they can't declare job variables.
// In GitHub Actions, the store is beside the workspace, where the workspace images keep it (see
// .github/workflows/workspace_image/README.md).

const root = path.join(import.meta.dirname, '../../../');
fs.mkdirSync(path.join(root, '.build'), { recursive: true });
fs.writeFileSync(path.join(root, '.build', 'pnpmstorebase'), computePnpmStoreBaseCacheKey([...process.argv.slice(2), process.platform, process.arch]));
fs.writeFileSync(path.join(root, '.build', 'pnpmstorelockfiles'), computePnpmStoreCacheKey());

if (process.env['TF_BUILD'] && process.env['PIPELINE_WORKSPACE']) {
	const storeDir = path.join(process.env['PIPELINE_WORKSPACE'], 'pnpm-store');
	console.log(`##vso[task.setvariable variable=PNPM_CONFIG_STORE_DIR]${storeDir}`);
	console.log(`##vso[task.setvariable variable=PNPM_CONFIG_CACHE_DIR]${path.join(storeDir, 'cache')}`);
} else if (process.env['GITHUB_ACTIONS'] && process.env['GITHUB_ENV'] && process.env['GITHUB_WORKSPACE']) {
	const storeDir = path.join(path.dirname(process.env['GITHUB_WORKSPACE']), '.pnpm-store');
	fs.appendFileSync(process.env['GITHUB_ENV'], `pnpm_config_store_dir=${storeDir}\npnpm_config_cache_dir=${path.join(storeDir, 'cache')}\n`);
}
