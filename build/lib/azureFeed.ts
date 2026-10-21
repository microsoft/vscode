/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import fs from 'fs';
import path from 'path';

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function azExecFile(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn('az', args, { stdio: 'inherit', shell: process.platform === 'win32' });
		child.on('error', reject);
		child.on('close', code => code === 0 ? resolve() : reject(new Error(`az ${args[0]} ${args[1] ?? ''} exited with code ${code}`)));
	});
}

let azureDevOpsExtension: Promise<void> | undefined;
function ensureAzureDevOpsExtension(): Promise<void> {
	if (!azureDevOpsExtension) {
		azureDevOpsExtension = (async () => {
			const result = cp.spawnSync('az', ['extension', 'show', '--name', 'azure-devops'], { stdio: 'ignore', shell: process.platform === 'win32' });
			if (result.status !== 0) {
				await azExecFile(['extension', 'add', '--name', 'azure-devops', '--only-show-errors']);
			}
		})();
	}
	return azureDevOpsExtension;
}

export interface IFeedPackage {
	readonly feed: string;
	readonly name: string;
	readonly version: string;
}

/**
 * Downloads a universal package from an Azure Artifacts feed into a cache
 * directory under `<root>/.build/<cacheDir>` and returns the absolute path to
 * the single file it contains. Subsequent requests for the same package are
 * served from the cache.
 * @param root the repository root
 * @param cacheDir the `.build` sub directory used to cache downloaded packages
 * @param pkg the feed, package name and version to download
 */
export async function downloadFeedPackage(root: string, cacheDir: string, pkg: IFeedPackage): Promise<string> {
	const dir = path.join(root, '.build', cacheDir, `${pkg.name}-${pkg.version}`);
	if (!fs.existsSync(dir)) {
		await ensureAzureDevOpsExtension();
		await azExecFile([
			'artifacts', 'universal', 'download',
			'--organization', getEnv('SYSTEM_COLLECTIONURI').replace(/\/+$/, ''),
			'--project', getEnv('SYSTEM_TEAMPROJECT'),
			'--scope', 'project',
			'--feed', pkg.feed,
			'--name', pkg.name,
			'--version', pkg.version,
			'--path', dir,
		]);
	}
	const [only] = await fs.promises.readdir(dir);
	return path.join(dir, only);
}
