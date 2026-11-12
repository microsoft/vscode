/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Workspace images in Azure Pipelines: a disk image of the sources directory of a Linux, macOS or
// Windows job whose dependencies are installed, which the CI test jobs mount over their checkout, so
// that their install steps install only what changed since. It uses the packed image format and the
// mounts of the GitHub workspace images (see .github/workflows/workspace_image/README.md), with the
// pipeline cache instead of artifacts. See workspace-image.yml for the steps.
//
// Linux mounts an ext4 volume in a sparse file over the checkout, which it hides, and macOS an APFS
// volume in a sparse image that hdiutil attaches, as the agents run macOS 15, which has no ASIF
// images. Windows can only mount a volume at an empty folder, so the checkout of the job waits in the
// temporary folder of the agent, on the same disk, while the volume is mounted: an NTFS volume in a
// VHDX, as the agents run Windows Server 2022, which has no Dev Drives.
//
//   node workspaceImage.ts key
//     Writes the files of the cache key: the native build inputs, then the lockfiles and the day.
//   node workspaceImage.ts restore
//     Test jobs: mounts the image that the cache restored over the checkout, at the commit of the
//     checkout, or leaves the checkout as it is. Never fails the job.
//   node workspaceImage.ts create
//     Image job: mounts an empty volume over the checkout, at the commit of the checkout.
//   node workspaceImage.ts pack
//     Image job: packs the volume into the cache folder, after the install steps.
//   node workspaceImage.ts junctions
//     Windows test jobs that mounted an image, after the install steps: replaces the relative links
//     of pnpm that go up to the root of the image with junctions, which esbuild can follow.

import { spawnSync, type SpawnSyncOptions } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { abortRestore, isMountPoint, mountDarwinImage, mountLinuxImage, mountWindowsImage, openFileSource } from '../../../.github/workflows/workspace_image/image.ts';
import { computeNodeModulesBaseCacheKey, computePnpmStoreCacheKey } from './cacheKeys.ts';
import { dirs } from '../../npm/dirs.ts';

/** Written to the key files when the job must not save an image under its key: no image has it */
const DISCARDED_KEY = 'discarded';
/** At the sources directory of an image: the commit and the path of its checkout, and its native build inputs */
const METADATA_FILE = '.build/workspace-image.json';
/** The pnpm store, on the volume of the image, so that pnpm hard links its packages */
const STORE_FOLDER = '.build/pnpm-store';
/** The checkouts of private repositories, which the test jobs check out themselves: an image holds neither their sources nor their credentials, so the image job doesn't check them out */
const PRIVATE_FOLDERS = ['.build/distro', '.build/vscode-encrypt', '.build/vsda', '.build/vscode-regexp-languagedetection', '.build/.gitconfig-distro'];
const RESTORE_TIMEOUT_SECONDS = 240;
/** At the root of a macOS volume: keep Spotlight from indexing it, and fseventsd from logging its changes in the test jobs */
const DARWIN_MARKER_FILES = ['.metadata_never_index', '.fseventsd/no_log'];
/** In a checkout: the script that creates, attaches and detaches the VHDX of a Windows image */
const VHD_SCRIPT = '.github/workflows/workspace_image/win32/vhd.ps1';

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
	switch (process.platform) {
		case 'darwin': return temporary('workspace-image.sparseimage');
		case 'win32': return temporary('workspace-image.vhdx');
		default: return temporary('workspace-image.ext4');
	}
}

/** On Windows: where the checkout of the job waits while a volume is mounted at the sources directory */
function asideFolder(): string {
	return temporary('workspace-image-checkout');
}

function checkPlatform(): void {
	if (process.platform !== 'linux' && process.platform !== 'darwin' && process.platform !== 'win32') {
		throw new Error(`No workspace images on ${process.platform}`);
	}
}

/**
 * Attaches the sparse image of the volume and mounts its volume over the checkout, on macOS: out of
 * Finder, and with the files owned by the user that reads them, so that the jobs can read the
 * folders that macOS keeps at the root of a volume, such as .fseventsd.
 */
function darwinAttach(file: string, ws: string): [string, ...string[]] {
	return ['hdiutil', 'attach', '-nobrowse', '-noverify', '-noautoopen', '-owners', 'off', '-mountpoint', ws, file];
}

function darwinDetach(ws: string): [string, ...string[]] {
	return ['hdiutil', 'detach', '-force', ws];
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
 * of the pipeline run, so the image job builds a new image after a dependency change and on
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

/** Renames, retrying while a scanner keeps a file of a folder open, as happens on Windows */
function rename(from: string, to: string): void {
	for (let attempt = 1; ; attempt++) {
		try {
			fs.renameSync(from, to);
			return;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (attempt === 10 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
				throw err;
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
		}
	}
}

/** Moves the entries of a folder into another folder, or none of them */
function moveEntries(from: string, to: string): void {
	const moved: string[] = [];
	try {
		for (const entry of fs.readdirSync(from)) {
			rename(path.join(from, entry), path.join(to, entry));
			moved.push(entry);
		}
	} catch (err) {
		for (const entry of moved) {
			rename(path.join(to, entry), path.join(from, entry));
		}
		throw err;
	}
}

/** The checkout of the job while a volume is mounted at the sources directory */
interface IKeptCheckout {
	/** The .git of the checkout, which the repository of the volume fetches the commit of the job from */
	readonly git: string;
	/** Puts the checkout back in the sources directory, once no volume is mounted there */
	restore(): void;
	/** Deletes what the job doesn't need once the commit of the job is checked out on the volume */
	dispose(): void;
}

/**
 * Keeps the checkout of the job while a volume is mounted at the sources directory. On Linux, links
 * its .git in the temporary folder, as the volume hides the checkout. On Windows, where a volume can
 * only be mounted at an empty folder, moves the checkout into the temporary folder of the agent, on
 * the same disk, so that it only renames its entries. The checkout stays there once the volume is
 * mounted, as deleting it would take time, and the image job moves it back after it packed the
 * volume (see `pack`).
 */
function keepCheckout(ws: string): IKeptCheckout {
	if (process.platform !== 'win32') {
		const link = linkCheckout(ws);
		return { git: link, restore: () => { }, dispose: () => fs.rmSync(link, { recursive: true, force: true }) };
	}
	const aside = asideFolder();
	if (path.parse(aside).root.toLowerCase() !== path.parse(ws).root.toLowerCase()) {
		throw new Error(`The temporary folder ${aside} is on another disk than ${ws}`);
	}
	fs.rmSync(aside, { recursive: true, force: true });
	fs.mkdirSync(aside, { recursive: true });
	moveEntries(ws, aside);
	return { git: path.join(aside, '.git'), restore: () => moveCheckoutBack(ws), dispose: () => { } };
}

/** On Windows: moves the checkout that `keepCheckout` moved out of the sources directory back */
function moveCheckoutBack(ws: string): void {
	if (fs.readdirSync(ws).length) {
		throw new Error(`Cannot move the checkout back to ${ws}, which is not empty`);
	}
	moveEntries(asideFolder(), ws);
	fs.rmdirSync(asideFolder());
}

/** Whether a volume is mounted at a folder. On Windows, mountvol only lists the volume of a mount point. */
function isVolumeMountedAt(folder: string): boolean {
	return process.platform === 'win32'
		? spawnSync('mountvol', [`${folder}\\`, '/L'], { stdio: 'ignore' }).status === 0
		: isMountPoint(folder);
}

/** On Windows: removes the mount point of the volume at `ws` if there is one, detaches the VHDX and deletes it */
function releaseWindowsVolume(ws: string, file: string): void {
	spawnSync('mountvol', [`${ws}\\`, '/D'], { stdio: 'inherit' });
	spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', 'Dismount-DiskImage -ImagePath $env:WORKSPACE_IMAGE_VHDX | Out-Null'], { stdio: 'inherit', timeout: 60_000, env: { ...process.env, WORKSPACE_IMAGE_VHDX: file } });
	try {
		fs.rmSync(file, { force: true });
	} catch (err) {
		console.log(`Cannot delete ${file}: ${err}`);
	}
}

/**
 * On Windows: deletes the folders that Windows keeps at the root of a volume, such as System Volume
 * Information, which only the system can read, from the volume at the sources directory: the
 * scripts that walk the repository fail on them, such as setup-npm-registry.ts. Windows creates them
 * when the volume gets a drive letter, which only the creation of the volume gives it, as the test
 * jobs attach the image without one. The agent runs elevated, so it can take them over.
 */
function removeSystemFolders(ws: string): void {
	for (const name of fs.readdirSync(ws).filter(entry => ['system volume information', '$recycle.bin'].includes(entry.toLowerCase()))) {
		const folder = path.join(ws, name);
		run('takeown', ['/F', folder, '/A', '/R', '/D', 'Y'], { stdio: 'inherit' });
		run('icacls', [folder, '/grant', '*S-1-5-32-544:F', '/T', '/C', '/Q'], { stdio: 'inherit' });
		fs.rmSync(folder, { recursive: true, force: true });
		console.log(`Deleted ${folder}`);
	}
}

function samePath(a: string, b: string): boolean {
	return process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
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

function setImageVariables(ws: string): void {
	const store = path.join(ws, STORE_FOLDER);
	fs.mkdirSync(store, { recursive: true });
	// As computePnpmStoreCacheKey.ts sets them without an image
	setVariable('PNPM_CONFIG_STORE_DIR', store);
	setVariable('PNPM_CONFIG_CACHE_DIR', path.join(store, 'cache'));
	// So that esbuild resolves pnpm's junctions on the volume, which is mounted without a drive letter
	if (process.platform === 'win32') {
		setVariable('GODEBUG', 'winreadlinkvolume=1');
	}
}

async function mountImage(ws: string, base: string): Promise<void> {
	checkPlatform();
	if (isVolumeMountedAt(ws)) {
		throw new Error(`A volume is mounted at ${ws} already`);
	}
	if (!fs.existsSync(packedImage())) {
		throw new Error(`The cache restored no ${path.basename(packedImage())}`);
	}
	const commit = git(ws, 'rev-parse', 'HEAD');
	const origin = originUrl(ws);
	const source = await openFileSource(packedImage());
	let checkout: IKeptCheckout | undefined;
	let unmount: (() => void) | undefined;
	try {
		checkout = keepCheckout(ws);
		const connections = os.availableParallelism();
		if (process.platform === 'win32') {
			// The checkout of the job, with vhd.ps1, is out of the sources directory already
			unmount = await mountWindowsImage(source, volumeFile(), ws, connections, { vhdScript: path.join(asideFolder(), VHD_SCRIPT), trust: false, vacate: () => { }, released: () => { } });
			removeSystemFolders(ws);
			// The files of an image belong to the user of the agent that built it
			run('git', ['config', '--global', '--add', 'safe.directory', '*']);
		} else if (process.platform === 'darwin') {
			unmount = await mountDarwinImage(source, volumeFile(), ws, connections, darwinAttach(volumeFile(), ws), darwinDetach(ws));
		} else {
			unmount = await mountLinuxImage(source, volumeFile(), ws, connections);
		}
		const metadata: Metadata = JSON.parse(fs.readFileSync(path.join(ws, METADATA_FILE), 'utf8'));
		// pnpm records the path of its store in the node_modules folders
		if (!samePath(metadata.workspace, ws)) {
			throw new Error(`The image holds the checkout of ${metadata.workspace}, not ${ws}`);
		}
		if (metadata.base !== base) {
			throw new Error(`The image is built from other native build inputs (${metadata.base}) than the job (${base})`);
		}
		checkoutCommit(ws, checkout.git, commit, origin);
		console.log(`Mounted the workspace image of ${metadata.commit}, built on ${metadata.created}, at ${ws}, and checked out ${commit}`);
	} catch (err) {
		// The checkout of the job is in the sources directory again
		unmount?.();
		checkout?.restore();
		throw err;
	} finally {
		await source.close();
		checkout?.dispose();
	}
}

/**
 * The cache task has no restore-only mode: at the end of a job that succeeded, it saves its folder
 * under its key unless it restored that key exactly, or another job saved it first. Only the
 * image job saves images, so the key of a test job that didn't restore it exactly becomes a
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
		setImageVariables(ws);
	}
}

/**
 * Mounts an empty volume over the checkout, and checks out the commit of the checkout there, so that
 * the install steps install into the volume. On Linux, an ext4 volume in a sparse file: without a
 * journal or reserved blocks, and with the inode tables left to initialize, so that they stay zeros,
 * which the packed image doesn't store. On macOS, an APFS volume in a sparse image, which holds only
 * the blocks that the volume wrote. On Windows, an NTFS volume in a dynamic VHDX with blocks of 1 MB,
 * like the GitHub images but without a Dev Drive, which Windows Server 2022 doesn't have.
 */
function create(): void {
	checkPlatform();
	if (readKey('base') === DISCARDED_KEY) {
		throw new Error('No workspace image cache key');
	}
	const ws = sourcesDirectory();
	if (isVolumeMountedAt(ws)) {
		throw new Error(`A volume is mounted at ${ws} already`);
	}
	const commit = git(ws, 'rev-parse', 'HEAD');
	const origin = originUrl(ws);
	const checkout = keepCheckout(ws);
	const file = volumeFile();
	let mounted = false;
	try {
		fs.rmSync(file, { force: true });
		if (process.platform === 'win32') {
			// 64 GB leave the jobs room, like the GitHub images
			run('pwsh', ['-NoProfile', '-NonInteractive', '-File', path.join(asideFolder(), VHD_SCRIPT), '-Path', file, '-Create', '-FileSystem', 'NTFS', '-MaximumSizeGB', '64', '-MountFolder', ws], { stdio: 'inherit' });
			removeSystemFolders(ws);
		} else if (process.platform === 'darwin') {
			run('hdiutil', ['create', '-size', '64g', '-type', 'SPARSE', '-fs', 'APFS', '-volname', 'vscode-workspace', file]);
			const [command, ...args] = darwinAttach(file, ws);
			run(command, args, { stdio: 'inherit' });
			mounted = true;
			for (const marker of DARWIN_MARKER_FILES) {
				fs.mkdirSync(path.dirname(path.join(ws, marker)), { recursive: true });
				fs.writeFileSync(path.join(ws, marker), '');
			}
		} else {
			const { uid, gid } = os.userInfo();
			run('truncate', ['-s', '64G', file]);
			run('mkfs.ext4', ['-q', '-F', '-O', '^has_journal', '-m', '0', '-E', `lazy_itable_init=1,root_owner=${uid}:${gid}`, file]);
			run('sudo', ['mount', '-o', 'loop,noatime,noinit_itable', file, ws]);
			mounted = true;
			// It would be an untracked folder of the checkout
			run('sudo', ['rmdir', path.join(ws, 'lost+found')]);
		}
		checkoutCommit(ws, checkout.git, commit, origin);
		if (process.platform === 'darwin') {
			// They would be untracked files of the checkout
			fs.appendFileSync(path.join(ws, '.git', 'info', 'exclude'), ['', '/.metadata_never_index', '/.fseventsd/', ''].join('\n'));
		}
	} catch (err) {
		if (process.platform === 'win32') {
			releaseWindowsVolume(ws, file);
		} else if (mounted) {
			const [command, ...args] = process.platform === 'darwin' ? darwinDetach(ws) : ['sudo', 'umount', ws];
			spawnSync(command, args, { stdio: 'inherit' });
		}
		fs.rmSync(file, { force: true });
		checkout.restore();
		throw err;
	} finally {
		checkout.dispose();
	}
	console.log(`Mounted an empty workspace image volume at ${ws}, and checked out ${commit}`);
	setVariable('WORKSPACE_IMAGE_USED', 'true');
	setImageVariables(ws);
}

/**
 * Leaves the volume ready for the test jobs and packs it into the cache folder: git compares only
 * the sizes and modification times of the files, which the image keeps (unlike the device of the
 * volume), so that the checkout of a test job writes only the files that changed.
 */
function pack(): void {
	const ws = sourcesDirectory();
	if (!isVolumeMountedAt(ws)) {
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
	if (process.platform === 'win32') {
		packWindowsVolume(ws);
	} else {
		run('df', ['-h', ws], { stdio: 'inherit' });
		if (process.platform === 'darwin') {
			packDarwinVolume(ws);
		} else {
			packLinuxVolume(ws);
		}
	}
	console.log(`Packed the workspace image of ${commit}`);
}

function packVolume(): void {
	fs.mkdirSync(cacheFolder(), { recursive: true });
	run(process.execPath, [path.join(import.meta.dirname, '../../../.github/workflows/workspace_image/image.ts'), 'pack', '--in', volumeFile(), '--out', packedImage()], { stdio: 'inherit' });
}

function packLinuxVolume(ws: string): void {
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
		packVolume();
	} finally {
		// For the rest of the job
		spawnSync('sudo', ['mount', '-o', 'remount,rw', ws], { stdio: 'inherit' });
	}
}

/**
 * Detaches the volume, which leaves the checkout of the job in the sources directory for the rest of
 * the job, and compacts its sparse image, which otherwise keeps the blocks of the files that the
 * install deleted, before packing it.
 */
function packDarwinVolume(ws: string): void {
	// Retried, in case Spotlight or a process that just ended still holds a file
	if (spawnSync('hdiutil', ['detach', ws], { stdio: 'inherit' }).status !== 0) {
		spawnSync('sleep', ['5']);
		const [command, ...args] = darwinDetach(ws);
		run(command, args, { stdio: 'inherit' });
	}
	if (spawnSync('hdiutil', ['compact', volumeFile()], { stdio: 'inherit' }).status !== 0) {
		console.log('hdiutil compact failed, so the image keeps the blocks of deleted files.');
	}
	try {
		packVolume();
	} finally {
		fs.rmSync(volumeFile(), { force: true });
	}
}

/**
 * Flushes the volume, removes its mount point and detaches the VHDX, whose file then holds the image,
 * and moves the checkout of the job back into the sources directory for the rest of the job, which
 * holds image.ts too, before packing it.
 */
function packWindowsVolume(ws: string): void {
	spawnSync('fsutil', ['volume', 'diskfree', ws], { stdio: 'inherit' });
	// In case Windows created them again during the install
	removeSystemFolders(ws);
	run('pwsh', ['-NoProfile', '-NonInteractive', '-File', path.join(asideFolder(), VHD_SCRIPT), '-Path', volumeFile(), '-MountFolder', ws, '-Detach'], { stdio: 'inherit' });
	moveCheckoutBack(ws);
	try {
		packVolume();
	} finally {
		fs.rmSync(volumeFile(), { force: true });
	}
}

interface IRelativeLink {
	readonly link: string;
	/** The absolute path that the link resolves to */
	readonly target: string;
}

/**
 * The relative links of pnpm in the sources directory `ws` that go up to its root, such as
 * `extensions/npm/node_modules/which`, which links to `../../../node_modules/.pnpm/...`: the packages
 * in the `node_modules` folders of the install roots and the workspace members, with their scopes and
 * the virtual stores. pnpm creates relative symbolic links on Windows when it can, and junctions,
 * which hold absolute paths, otherwise.
 */
export function findLinksToRoot(ws: string): IRelativeLink[] {
	const links: IRelativeLink[] = [];
	const read = (folder: string): fs.Dirent[] => {
		try {
			return fs.readdirSync(folder, { withFileTypes: true });
		} catch {
			return [];
		}
	};
	const visit = (folder: string, scopes: boolean) => {
		for (const entry of read(folder)) {
			const entryPath = path.join(folder, entry.name);
			if (entry.isSymbolicLink()) {
				let target: string;
				try {
					target = fs.readlinkSync(entryPath);
				} catch {
					continue;
				}
				if (path.isAbsolute(target)) {
					continue;
				}
				const depth = path.relative(ws, folder).split(path.sep).length;
				const segments = path.normalize(target).split(path.sep);
				let up = 0;
				while (segments[up] === '..') {
					up++;
				}
				if (up >= depth) {
					links.push({ link: entryPath, target: path.resolve(folder, target) });
				}
			} else if (scopes && entry.isDirectory() && entry.name.startsWith('@')) {
				visit(entryPath, false);
			}
		}
	};
	for (const dir of dirs) {
		const nodeModules = path.join(ws, dir, 'node_modules');
		visit(nodeModules, true);
		const store = path.join(nodeModules, '.pnpm');
		for (const entry of read(store)) {
			if (entry.isDirectory()) {
				visit(entry.name === 'node_modules' ? path.join(store, entry.name) : path.join(store, entry.name, 'node_modules'), true);
			}
		}
	}
	return links;
}

/**
 * Replaces the relative links of pnpm that go up to the root of the image with junctions. esbuild
 * resolves the `..` of a link itself, and when that reaches the root of a volume without a drive
 * letter, it drops the separator after the volume name (`\\?\Volume{...}node_modules\...`), so it
 * can't resolve the dependencies of the packages of the workspace members. The GitHub images are
 * mounted at the parent of the workspace, so the links go up to the workspace folder at most.
 */
function junctions(): void {
	if (process.platform !== 'win32') {
		throw new Error('Only Windows images need junctions');
	}
	const start = Date.now();
	const links = findLinksToRoot(sourcesDirectory());
	for (const { link, target } of links) {
		fs.unlinkSync(link);
		fs.symlinkSync(target, link, 'junction');
	}
	console.log(`Replaced ${links.length} relative links that go up to the root of the image with junctions in ${((Date.now() - start) / 1000).toFixed(1)} s`);
}

if (import.meta.main) {
	const command = process.argv[2];
	try {
		switch (command) {
			case 'key': key(); break;
			case 'restore': await restore(); break;
			case 'create': create(); break;
			case 'pack': pack(); break;
			case 'junctions': junctions(); break;
			default: throw new Error(`Unknown command: ${command}`);
		}
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
}
