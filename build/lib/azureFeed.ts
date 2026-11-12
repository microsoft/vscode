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

class AzExitError extends Error { }

function azExecFile(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn('az', args, { stdio: 'inherit', shell: process.platform === 'win32' });
		child.on('error', reject);
		child.on('close', code => code === 0 ? resolve() : reject(new AzExitError(`az ${args[0]} ${args[1] ?? ''} exited with code ${code}`)));
	});
}

/** Delays before each retry of a failed `az` call. */
const AZ_RETRY_DELAYS_MS = [10_000, 30_000];

/**
 * Runs an `az` call, retrying when it exits with an error: the CLI's update of
 * its Universal Packages tooling and the package download both fail
 * transiently on feed timeouts. Failing to start `az` is not retried.
 */
async function azExecFileWithRetries(args: string[], beforeAttempt: () => Promise<void> = async () => { }, delaysMs = AZ_RETRY_DELAYS_MS): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		await beforeAttempt();
		try {
			return await azExecFile(args);
		} catch (err) {
			if (!(err instanceof AzExitError) || attempt >= delaysMs.length) {
				throw err;
			}
			console.warn(`${err.message}, retrying in ${delaysMs[attempt] / 1000} s (attempt ${attempt + 2} of ${delaysMs.length + 1})`);
			await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
		}
	}
}

let azureDevOpsExtension: Promise<void> | undefined;
function ensureAzureDevOpsExtension(): Promise<void> {
	if (!azureDevOpsExtension) {
		azureDevOpsExtension = (async () => {
			const result = cp.spawnSync('az', ['extension', 'show', '--name', 'azure-devops'], { stdio: 'ignore', shell: process.platform === 'win32' });
			if (result.status !== 0) {
				await azExecFileWithRetries(['extension', 'add', '--name', 'azure-devops', '--only-show-errors']);
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
 * @param retryDelaysMs delays before each retry of a failed download
 */
export async function downloadFeedPackage(root: string, cacheDir: string, pkg: IFeedPackage, retryDelaysMs = AZ_RETRY_DELAYS_MS): Promise<string> {
	const dir = path.join(root, '.build', cacheDir, `${pkg.name}-${pkg.version}`);
	let pending = pendingDownloads.get(dir);
	if (!pending) {
		pending = downloadInto(dir, pkg, retryDelaysMs).finally(() => pendingDownloads.delete(dir));
		pendingDownloads.set(dir, pending);
	}
	return pending;
}

const pendingDownloads = new Map<string, Promise<string>>();

async function downloadInto(dir: string, pkg: IFeedPackage, retryDelaysMs: number[]): Promise<string> {
	if (!fs.existsSync(dir)) {
		await ensureAzureDevOpsExtension();
		// Download into a directory unique to this process and move it into place
		// once complete, so a failed attempt never leaves a partial package in the
		// cache and another build process downloading the same package can't
		// interfere with this one.
		const download = `${dir}.download-${process.pid}`;
		const clean = () => fs.promises.rm(download, { recursive: true, force: true });
		await azExecFileWithRetries([
			'artifacts', 'universal', 'download',
			'--organization', getEnv('SYSTEM_COLLECTIONURI').replace(/\/+$/, ''),
			'--project', getEnv('SYSTEM_TEAMPROJECT'),
			'--scope', 'project',
			'--feed', pkg.feed,
			'--name', pkg.name,
			'--version', pkg.version,
			'--path', download,
		], clean, retryDelaysMs).catch(async err => {
			await clean();
			throw err;
		});
		try {
			await fs.promises.rename(download, dir);
		} catch (err) {
			// Another process published the same package first: use its copy.
			if (!fs.existsSync(dir)) {
				throw err;
			}
			await clean();
		}
	}
	const [only] = await fs.promises.readdir(dir);
	return path.join(dir, only);
}
