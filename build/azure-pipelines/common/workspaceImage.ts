/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Workspace images in Azure Pipelines: a disk image of the sources directory of a Linux job whose
// dependencies are installed, which the Linux CI test jobs mount over their checkout, so that their
// install steps install only what changed since. It uses the packed image format and the Linux mount
// of the GitHub workspace images (see .github/workflows/workspace_image/README.md), with the pipeline
// cache instead of artifacts. See workspace-image.yml for the steps.
//
//   node workspaceImage.ts key
//     Writes the files of the cache key: the native build inputs, then the lockfiles and the day.
//   node workspaceImage.ts restore
//     Test jobs: mounts the image that the cache restored over the checkout, at the commit of the
//     checkout, or leaves the checkout as it is. Never fails the job.
//   node workspaceImage.ts create
//     Workspace Image job: mounts an empty volume over the checkout, at the commit of the checkout.
//   node workspaceImage.ts pack
//     Workspace Image job: packs the volume into the cache folder, after the install steps.

import { spawnSync, type SpawnSyncOptions } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { abortRestore, isMountPoint, mountLinuxImage, openFileSource } from '../../../.github/workflows/workspace_image/image.ts';
import { computeNodeModulesBaseCacheKey, computePnpmStoreCacheKey } from './cacheKeys.ts';

/** Written to the key files when the job must not save an image under its key: no image has it */
const DISCARDED_KEY = 'discarded';
/** At the sources directory of an image: the commit and the path of its checkout, and its native build inputs */
const METADATA_FILE = '.build/workspace-image.json';
/** The pnpm store, on the volume of the image, so that pnpm hard links its packages */
const STORE_FOLDER = '.build/pnpm-store';
/** The checkouts of private repositories, which the test jobs check out themselves: an image holds neither their sources nor their credentials, so the Workspace Image job doesn't check them out */
const PRIVATE_FOLDERS = ['.build/distro', '.build/vscode-encrypt', '.build/vsda', '.build/vscode-regexp-languagedetection', '.build/.gitconfig-distro'];
const RESTORE_TIMEOUT_SECONDS = 240;

interface Metadata {
	readonly commit: string;
	readonly workspace: string;
	readonly base: string;
	readonly created: string;
}

function variable(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No ${name}`);
	}
	return value;
}

function sourcesDirectory(): string {
	return path.resolve(variable('BUILD_SOURCESDIRECTORY'));
}

/** A path in the temporary folder of the agent, outside of the sources directory that an image hides */
function temporary(...segments: string[]): string {
	return path.join(variable('AGENT_TEMPDIRECTORY'), ...segments);
}

/** The files of the cache key, which workspace-image.yml hashes: `base`, then `image` */
function keyFile(name: 'base' | 'image'): string {
	return temporary('workspace-image-key', name);
}

/** The folder that the cache restores and saves */
function cacheFolder(): string {
	return temporary('workspace-image');
}

function packedImage(): string {
	return path.join(cacheFolder(), 'workspace-image.img');
}

function volumeFile(): string {
	return temporary('workspace-image.ext4');
}

function setVariable(name: string, value: string): void {
	console.log(`##vso[task.setvariable variable=${name}]${value}`);
}

function warn(message: string): void {
	console.log(`##vso[task.logissue type=warning]${message.replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
}

function run(command: string, args: readonly string[], options: SpawnSyncOptions = {}): string {
	const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024, ...options });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
	}
	return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

/** Runs git without downloading the Git LFS files of a checkout, like the checkout of the agent */
function git(cwd: string, ...args: string[]): string {
	return run('git', ['-C', cwd, ...args], { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });
}

function writeKeys(base: string, image: string): void {
	fs.mkdirSync(path.dirname(keyFile('base')), { recursive: true });
	fs.writeFileSync(keyFile('base'), base);
	fs.writeFileSync(keyFile('image'), image);
}

function readKey(name: 'base' | 'image'): string {
	return fs.readFileSync(keyFile(name), 'utf8').trim();
}

/**
 * The cache key has two parts. `base` is the key of the native build inputs, which a job needs to
 * install on top of an image, as installing doesn't build the native modules of an image again: the
 * test jobs restore the newest image of the same `base`. `image` also holds the lockfiles and the day
 * of the pipeline run, so the Workspace Image job builds a new image after a dependency change and on
 * the first run of a day. The steps run it before the distro is checked out, so the distro roots don't
 * count (see `distroRoots`), as the images leave the distro out.
 */
function key(): void {
	const arch = process.env.VSCODE_ARCH || process.arch;
	const day = process.env.VSCODE_WORKSPACE_IMAGE_DAY || new Date().toISOString().slice(0, 10).replaceAll('-', '');
	let base = DISCARDED_KEY;
	let image = DISCARDED_KEY;
	try {
		base = computeNodeModulesBaseCacheKey(['workspace-image', process.platform, process.arch, arch]);
		image = crypto.createHash('sha256').update(base).update(computePnpmStoreCacheKey()).update(day).digest('hex');
	} catch (err) {
		warn(`Cannot compute the workspace image cache key, so the job uses no image: ${err}`);
	}
	writeKeys(base, image);
	console.log(`Workspace image key: base ${base}, image ${image} (day ${day})`);
}

/** The URL of the origin of a checkout, without credentials */
function originUrl(cwd: string): string {
	const origin = git(cwd, 'remote', 'get-url', 'origin');
	try {
		const url = new URL(origin);
		url.username = '';
		url.password = '';
		return url.toString();
	} catch {
		// Such as git@github.com:microsoft/vscode.git
		return origin;
	}
}

/**
 * Links the .git of the checkout in the temporary folder, as the volume that is mounted over the
 * checkout hides it, and returns its path.
 */
function linkCheckout(ws: string): string {
	const target = temporary('workspace-image-checkout.git');
	fs.rmSync(target, { recursive: true, force: true });
	const link = spawnSync('cp', ['-al', path.join(ws, '.git'), target], { stdio: 'inherit' });
	if (link.status !== 0) {
		fs.rmSync(target, { recursive: true, force: true });
		run('cp', ['-a', path.join(ws, '.git'), target]);
	}
	return target;
}

/**
 * Brings the repository of the volume at `ws` to `commit`, the HEAD of the linked .git of the
 * checkout, which it fetches from there: git writes only the files that changed since the commit of
 * the image.
 */
function checkoutCommit(ws: string, checkout: string, commit: string, origin: string): void {
	if (!fs.existsSync(path.join(ws, '.git'))) {
		git(ws, 'init', '--quiet', '--initial-branch=main');
	}
	const remotes = git(ws, 'remote').split('\n');
	git(ws, 'remote', remotes.includes('origin') ? 'set-url' : 'add', 'origin', origin);
	git(ws, 'fetch', '--quiet', '--no-tags', '--depth=1', checkout, 'HEAD');
	git(ws, 'checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD');
	const head = git(ws, 'rev-parse', 'HEAD');
	if (head !== commit) {
		throw new Error(`The checkout is at ${head}, not ${commit}`);
	}
}

function setStoreVariables(ws: string): void {
	const store = path.join(ws, STORE_FOLDER);
	fs.mkdirSync(store, { recursive: true });
	// As computePnpmStoreCacheKey.ts sets them without an image
	setVariable('PNPM_CONFIG_STORE_DIR', store);
	setVariable('PNPM_CONFIG_CACHE_DIR', path.join(store, 'cache'));
}

async function mountImage(ws: string, base: string): Promise<void> {
	if (process.platform !== 'linux') {
		throw new Error(`No workspace images on ${process.platform}`);
	}
	if (isMountPoint(ws)) {
		throw new Error(`A volume is mounted at ${ws} already`);
	}
	if (!fs.existsSync(packedImage())) {
		throw new Error(`The cache restored no ${path.basename(packedImage())}`);
	}
	const commit = git(ws, 'rev-parse', 'HEAD');
	const origin = originUrl(ws);
	const checkout = linkCheckout(ws);
	const source = await openFileSource(packedImage());
	let unmount: (() => void) | undefined;
	try {
		unmount = await mountLinuxImage(source, volumeFile(), ws, os.availableParallelism());
		const metadata: Metadata = JSON.parse(fs.readFileSync(path.join(ws, METADATA_FILE), 'utf8'));
		// pnpm records the path of its store in the node_modules folders
		if (path.resolve(metadata.workspace) !== ws) {
			throw new Error(`The image holds the checkout of ${metadata.workspace}, not ${ws}`);
		}
		if (metadata.base !== base) {
			throw new Error(`The image is built from other native build inputs (${metadata.base}) than the job (${base})`);
		}
		checkoutCommit(ws, checkout, commit, origin);
		console.log(`Mounted the workspace image of ${metadata.commit}, built on ${metadata.created}, at ${ws}, and checked out ${commit}`);
	} catch (err) {
		// The checkout of the job is in the sources directory again
		unmount?.();
		throw err;
	} finally {
		await source.close();
		fs.rmSync(checkout, { recursive: true, force: true });
	}
}

/**
 * The cache task has no restore-only mode: at the end of a job that succeeded, it saves its folder
 * under its key unless it restored that key exactly, or another job saved it first. Only the
 * Workspace Image job saves images, so the key of a test job that didn't restore it exactly becomes a
 * key that no image has, and its folder is emptied: the job saves an empty entry under that key, once.
 */
async function restore(): Promise<void> {
	const ws = sourcesDirectory();
	const restored = process.env.WORKSPACE_IMAGE_RESTORED ?? '';
	let base = DISCARDED_KEY;
	try {
		base = readKey('base');
	} catch (err) {
		console.log(`No workspace image cache key: ${err}`);
	}
	if (restored !== 'true') {
		writeKeys(DISCARDED_KEY, DISCARDED_KEY);
	}
	let used = false;
	try {
		if (base === DISCARDED_KEY) {
			console.log('No workspace image cache key, so the job installs everything.');
		} else if (restored === 'true' || restored === 'inexact') {
			const timedOut = new Error(`The restore took longer than ${RESTORE_TIMEOUT_SECONDS} s`);
			const timer = setTimeout(() => abortRestore(timedOut), RESTORE_TIMEOUT_SECONDS * 1000);
			try {
				await mountImage(ws, base);
				used = true;
			} finally {
				clearTimeout(timer);
			}
		} else {
			console.log('The cache has no workspace image of these native build inputs, so the job installs everything.');
		}
	} catch (err) {
		warn(`No workspace image, so the job installs everything: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		fs.rmSync(cacheFolder(), { recursive: true, force: true });
		fs.mkdirSync(cacheFolder(), { recursive: true });
	}
	setVariable('WORKSPACE_IMAGE_USED', String(used));
	if (used) {
		setStoreVariables(ws);
	}
}

/**
 * Mounts an empty ext4 volume in a sparse file over the checkout, and checks out the commit of the
 * checkout there, so that the install steps install into the volume: without a journal or reserved
 * blocks, and with the inode tables left to initialize, so that they stay zeros, which the packed
 * image doesn't store.
 */
function create(): void {
	if (process.platform !== 'linux') {
		throw new Error(`No workspace images on ${process.platform}`);
	}
	if (readKey('base') === DISCARDED_KEY) {
		throw new Error('No workspace image cache key');
	}
	const ws = sourcesDirectory();
	if (isMountPoint(ws)) {
		throw new Error(`A volume is mounted at ${ws} already`);
	}
	const commit = git(ws, 'rev-parse', 'HEAD');
	const origin = originUrl(ws);
	const checkout = linkCheckout(ws);
	const file = volumeFile();
	const { uid, gid } = os.userInfo();
	let mounted = false;
	try {
		fs.rmSync(file, { force: true });
		run('truncate', ['-s', '64G', file]);
		run('mkfs.ext4', ['-q', '-F', '-O', '^has_journal', '-m', '0', '-E', `lazy_itable_init=1,root_owner=${uid}:${gid}`, file]);
		run('sudo', ['mount', '-o', 'loop,noatime,noinit_itable', file, ws]);
		mounted = true;
		// It would be an untracked folder of the checkout
		run('sudo', ['rmdir', path.join(ws, 'lost+found')]);
		checkoutCommit(ws, checkout, commit, origin);
	} catch (err) {
		if (mounted) {
			spawnSync('sudo', ['umount', ws], { stdio: 'inherit' });
		}
		fs.rmSync(file, { force: true });
		throw err;
	} finally {
		fs.rmSync(checkout, { recursive: true, force: true });
	}
	console.log(`Mounted an empty workspace image volume at ${ws}, and checked out ${commit}`);
	setVariable('WORKSPACE_IMAGE_USED', 'true');
	setStoreVariables(ws);
}

/**
 * Leaves the volume ready for the test jobs and packs it into the cache folder: git compares only
 * the sizes and modification times of the files, which the image keeps (unlike the device of the
 * volume), so that the checkout of a test job writes only the files that changed.
 */
function pack(): void {
	const ws = sourcesDirectory();
	if (!isMountPoint(ws)) {
		throw new Error(`No workspace image volume is mounted at ${ws}`);
	}
	if (!fs.existsSync(path.join(ws, 'node_modules'))) {
		throw new Error('The workspace image volume holds no node_modules');
	}
	// Deleting them wouldn't do: the packed image keeps the blocks of deleted files
	const privateFolders = PRIVATE_FOLDERS.filter(folder => fs.existsSync(path.join(ws, folder)));
	if (privateFolders.length) {
		throw new Error(`The workspace image volume holds checkouts of private repositories: ${privateFolders.join(', ')}`);
	}
	const commit = git(ws, 'rev-parse', 'HEAD');
	git(ws, 'config', '--local', 'core.checkStat', 'minimal');
	git(ws, 'config', '--local', 'core.trustctime', 'false');
	// No credentials in an image
	const keys = spawnSync('git', ['-C', ws, 'config', '--local', '--name-only', '--get-regexp', '^(http\\..*\\.extraheader|includeif\\..*)$'], { encoding: 'utf8' }).stdout ?? '';
	for (const configKey of new Set(keys.split(/\r?\n/).filter(Boolean))) {
		git(ws, 'config', '--local', '--unset-all', configKey);
	}
	const metadata: Metadata = { commit, workspace: ws, base: readKey('base'), created: new Date().toISOString() };
	fs.writeFileSync(path.join(ws, METADATA_FILE), `${JSON.stringify(metadata, null, '\t')}\n`);
	run('df', ['-h', ws], { stdio: 'inherit' });
	run('sync', []);
	// The loop device punches holes for the blocks that the install freed, which the packed image then doesn't store
	if (spawnSync('sudo', ['fstrim', '--verbose', ws], { stdio: 'inherit' }).status !== 0) {
		console.log('fstrim failed, so the image keeps the blocks of deleted files.');
	}
	// The volume can't be unmounted: the agent starts the task of every step in the sources directory.
	// Read-only, the file of the volume holds a consistent file system, which ext4 marks clean.
	if (spawnSync('sudo', ['mount', '-o', 'remount,ro', ws], { stdio: 'inherit' }).status !== 0) {
		// The processes that write to the volume
		spawnSync('sudo', ['fuser', '-vm', ws], { stdio: 'inherit' });
		throw new Error(`Cannot remount ${ws} read-only`);
	}
	try {
		fs.mkdirSync(cacheFolder(), { recursive: true });
		run(process.execPath, [path.join(import.meta.dirname, '../../../.github/workflows/workspace_image/image.ts'), 'pack', '--in', volumeFile(), '--out', packedImage()], { stdio: 'inherit' });
	} finally {
		// For the rest of the job
		spawnSync('sudo', ['mount', '-o', 'remount,rw', ws], { stdio: 'inherit' });
	}
	console.log(`Packed the workspace image of ${commit}`);
}

if (import.meta.main) {
	const command = process.argv[2];
	try {
		switch (command) {
			case 'key': key(); break;
			case 'restore': await restore(); break;
			case 'create': create(); break;
			case 'pack': pack(); break;
			default: throw new Error(`Unknown command: ${command}`);
		}
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
}
