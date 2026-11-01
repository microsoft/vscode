/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Workspace images: a disk image of a workspace of main with its dependencies, Electron and the
// Playwright browsers installed, which a test job mounts instead of installing them (see README.md).
// Dependency-free, as the jobs download it from the API and run it before they check out.
//
//   node image.ts restore --name NAME [--branch main] [--connections 16]
//     Mounts the newest image NAME of a branch at the parent folder of the empty workspace, where
//     actions/checkout then reuses its .git. Sets the output `used` to 'true' when it did, and warns
//     instead of failing otherwise, as the job can still install everything.
//   node image.ts deps
//     After the checkout, compares the install state that the image saved with the checkout, and
//     sets the output `current` to 'true' when no dependency changed.
//   node image.ts env
//     Points the pnpm store and the Playwright browsers into the image, for the next steps.
//   node image.ts seed
//     Prepares the checkout of an image for the checkouts of the jobs.
//   node image.ts pack --in FILE --out FILE [--level 9] [--chunk-mb 32]
//     Compresses a disk image in chunks that `restore` downloads and decompresses in parallel.
//
// `restore` reads the API with the token in GH_TOKEN, which needs `actions: read`.

import { spawn, spawnSync, type SpawnSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import * as zlib from 'zlib';

// Decompression runs in the thread pool of libuv, next to the file writes
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(16, os.availableParallelism() * 2));

/** The events of the workflow runs that build images: never a pull request */
const TRUSTED_EVENTS = new Set(['push', 'schedule', 'workflow_dispatch']);
/** At the root of an image: the commit and the path of its workspace */
const METADATA_FILE = '.workspace-image.json';
/** The tag at the commit of an image, which the shallow fetch of actions/checkout sends, so that it downloads only what changed */
const SEED_TAG = 'workspace-image';

const started = performance.now();

function log(message: string): void {
	console.log(`${((performance.now() - started) / 1000).toFixed(1).padStart(6)}s  ${message}`);
}

type Args = Map<string, string>;

function parseArgs(argv: readonly string[]): Args {
	const args: Args = new Map();
	for (let i = 0; i < argv.length; i += 2) {
		args.set(argv[i].replace(/^--/, ''), argv[i + 1]);
	}
	return args;
}

function required(args: Args, name: string): string {
	const value = args.get(name);
	if (!value) {
		throw new Error(`Missing --${name}`);
	}
	return value;
}

function setOutput(name: string, value: string): void {
	console.log(`${name}=${value}`);
	if (process.env.GITHUB_OUTPUT) {
		fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
	}
}

function setEnv(values: Record<string, string>): void {
	for (const [name, value] of Object.entries(values)) {
		console.log(`${name}=${value}`);
		if (process.env.GITHUB_ENV) {
			fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
		}
	}
}

function summary(line: string): void {
	if (process.env.GITHUB_STEP_SUMMARY) {
		fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
	}
}

function run(command: string, args: readonly string[], options: SpawnSyncOptions = {}): string {
	// `git ls-files` lists over 1 MB, the default
	const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, ...options });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
	}
	return typeof result.stdout === 'string' ? result.stdout : '';
}

function workspace(): string {
	const folder = process.env.GITHUB_WORKSPACE;
	if (!folder) {
		throw new Error('No GITHUB_WORKSPACE');
	}
	return path.resolve(folder);
}

/** The folder where a job mounts an image: the parent folder of its workspace, so that the workspace keeps its path */
function imageRoot(): string {
	return path.dirname(workspace());
}

/** The folders of the tools in an image, outside of the workspace, so that the checkout of a job doesn't see them */
function toolFolders(root: string): Record<string, string> {
	return {
		// pnpm records its store in node_modules/.modules.yaml, and installs everything again with another one
		pnpm_config_store_dir: path.join(root, '.pnpm-store'),
		PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.playwright'),
		// The clones of pnpm on ReFS store the packages again, unlike the hard links
		...(process.platform === 'win32' ? { pnpm_config_package_import_method: 'hardlink' } : {}),
	};
}

//#region downloads

function githubHeaders(): Record<string, string> {
	const token = process.env.GH_TOKEN;
	if (!token) {
		throw new Error('No GH_TOKEN');
	}
	return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

function repositoryUrl(): string {
	return `${process.env.GITHUB_API_URL ?? 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}`;
}

async function api<T>(route: string): Promise<T> {
	const response = await fetch(`${repositoryUrl()}/${route}`, { headers: githubHeaders() });
	if (!response.ok) {
		throw new Error(`GET ${route}: HTTP ${response.status}`);
	}
	return await response.json() as T;
}

interface Artifact {
	readonly id: number;
	readonly name: string;
	readonly size_in_bytes: number;
	readonly created_at: string;
	readonly expired: boolean;
	readonly workflow_run?: { readonly id: number; readonly repository_id: number; readonly head_repository_id: number; readonly head_branch: string; readonly head_sha: string };
}

/**
 * The newest image of a branch. Only runs of this repository for pushes, schedules or manual
 * dispatches build images, as a pull request could upload an artifact of the same name.
 */
async function locate(name: string, branch: string): Promise<Artifact> {
	const { artifacts } = await api<{ artifacts: Artifact[] }>(`actions/artifacts?name=${encodeURIComponent(name)}&per_page=50`);
	const candidates = artifacts
		.filter(artifact => !artifact.expired && artifact.workflow_run?.head_branch === branch && artifact.workflow_run.head_repository_id === artifact.workflow_run.repository_id)
		.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
	for (const artifact of candidates) {
		const workflowRun = await api<{ event: string }>(`actions/runs/${artifact.workflow_run!.id}`);
		if (TRUSTED_EVENTS.has(workflowRun.event)) {
			return artifact;
		}
		log(`Skipped artifact ${artifact.id} of a ${workflowRun.event} run`);
	}
	throw new Error(`No ${name} of ${branch}`);
}

/** The signed URL of an artifact, which expires after a minute */
async function artifactUrl(id: number): Promise<string> {
	const response = await fetch(`${repositoryUrl()}/actions/artifacts/${id}/zip`, { headers: githubHeaders(), redirect: 'manual' });
	await response.body?.cancel();
	const location = response.headers.get('location');
	if (!location) {
		throw new Error(`No download URL for artifact ${id}: HTTP ${response.status}`);
	}
	return location;
}

async function fetchRange(url: string, from: number, to: number): Promise<Buffer> {
	for (let attempt = 1; ; attempt++) {
		let status = 0;
		try {
			const response = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
			status = response.status;
			if (status !== 206) {
				await response.body?.cancel();
				throw new Error(`HTTP ${status}`);
			}
			const data = Buffer.from(await response.arrayBuffer());
			if (data.length !== to - from + 1) {
				throw new Error(`${data.length} bytes instead of ${to - from + 1}`);
			}
			return data;
		} catch (err) {
			// An expired URL needs a new one
			if (status === 403 || attempt === 5) {
				throw err;
			}
			await new Promise(resolve => setTimeout(resolve, 250 * attempt));
		}
	}
}

/** Where the data of a file is in a download: the file itself, or the entry of a zip that stores it uncompressed */
interface Located {
	readonly start: number;
	readonly size: number;
}

/**
 * The data of an artifact: the file itself, which upload-artifact uploads without a zip with
 * `archive: false`, or else the stored entry of its zip.
 */
async function locateArtifactData(url: string): Promise<Located> {
	const response = await fetch(url, { headers: { Range: 'bytes=0-3' } });
	const range = response.headers.get('content-range');
	const head = Buffer.from(await response.arrayBuffer());
	if (response.status !== 206 || !range) {
		throw new Error(`No range support: HTTP ${response.status}`);
	}
	const total = Number(range.split('/')[1]);
	return head.readUInt32LE(0) === 0x04034b50 ? await locateZipEntry(url, total) : { start: 0, size: total };
}

/** Finds the data of the first entry of a zip that stores it uncompressed, with a few small range requests */
async function locateZipEntry(url: string, total: number): Promise<Located> {
	const tail = await fetchRange(url, Math.max(0, total - 65_600), total - 1);
	let eocd = -1;
	for (let i = tail.length - 22; i >= 0 && eocd === -1; i--) {
		if (tail.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
		}
	}
	if (eocd === -1) {
		throw new Error('No end of central directory record');
	}
	let directorySize = tail.readUInt32LE(eocd + 12);
	let directoryOffset = tail.readUInt32LE(eocd + 16);
	if (directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
		const locator = eocd - 20;
		if (tail.readUInt32LE(locator) !== 0x07064b50) {
			throw new Error('No zip64 end of central directory locator');
		}
		const recordOffset = Number(tail.readBigUInt64LE(locator + 8));
		const record = await fetchRange(url, recordOffset, recordOffset + 55);
		directorySize = Number(record.readBigUInt64LE(40));
		directoryOffset = Number(record.readBigUInt64LE(48));
	}
	const directory = await fetchRange(url, directoryOffset, directoryOffset + directorySize - 1);
	if (directory.readUInt32LE(0) !== 0x02014b50) {
		throw new Error('No central directory');
	}
	const method = directory.readUInt16LE(10);
	let compressedSize = directory.readUInt32LE(20);
	let uncompressedSize = directory.readUInt32LE(24);
	const nameLength = directory.readUInt16LE(28);
	const extraLength = directory.readUInt16LE(30);
	let localOffset = directory.readUInt32LE(42);
	for (let extra = 46 + nameLength; extra + 4 <= 46 + nameLength + extraLength;) {
		const id = directory.readUInt16LE(extra);
		const fieldLength = directory.readUInt16LE(extra + 2);
		if (id === 0x0001) {
			let field = extra + 4;
			const next = () => {
				const value = Number(directory.readBigUInt64LE(field));
				field += 8;
				return value;
			};
			if (uncompressedSize === 0xffffffff) {
				uncompressedSize = next();
			}
			if (compressedSize === 0xffffffff) {
				compressedSize = next();
			}
			if (localOffset === 0xffffffff) {
				localOffset = next();
			}
		}
		extra += 4 + fieldLength;
	}
	if (method !== 0) {
		throw new Error(`The entry of the zip is compressed with method ${method}`);
	}
	const local = await fetchRange(url, localOffset, localOffset + 29);
	return { start: localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), size: compressedSize };
}

/** Reads ranges of the file of an artifact, and renews the signed URL when it expires */
interface Source {
	readonly size: number;
	read(from: number, length: number): Promise<Buffer>;
}

async function openArtifact(id: number): Promise<Source> {
	const open = async () => {
		const url = await artifactUrl(id);
		return { url, ...await locateArtifactData(url) };
	};
	let current = await open();
	let renewal: Promise<typeof current> | undefined;
	const read = async (from: number, length: number, attempt = 1): Promise<Buffer> => {
		const used = current;
		try {
			return await fetchRange(used.url, used.start + from, used.start + from + length - 1);
		} catch (err) {
			if (!String(err).includes('HTTP 403') || attempt > 3) {
				throw err;
			}
			if (current === used) {
				renewal ??= open().finally(() => renewal = undefined);
				current = await renewal;
			}
			return read(from, length, attempt + 1);
		}
	};
	return { size: current.size, read };
}

async function writeAll(handle: fs.promises.FileHandle, data: Buffer, position: number): Promise<void> {
	for (let offset = 0; offset < data.length;) {
		const { bytesWritten } = await handle.write(data, offset, data.length - offset, position + offset);
		offset += bytesWritten;
	}
}

async function readAll(handle: fs.promises.FileHandle, length: number, position: number): Promise<Buffer> {
	const buffer = Buffer.allocUnsafe(length);
	for (let offset = 0; offset < length;) {
		const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
		if (bytesRead === 0) {
			throw new Error(`Unexpected end of file at ${position + offset}`);
		}
		offset += bytesRead;
	}
	return buffer;
}

//#endregion

//#region packed disk images

const IMAGE_MAGIC = Buffer.from('VSCWIMG1');
/** The unit of the holes of a packed image: the pages of zeros are neither stored nor written */
const PAGE = 1024 * 1024;
/** Larger output buffers than the default of 16 KB, which would take a trip to the thread pool each */
const ZLIB_CHUNK = 4 * 1024 * 1024;

interface ImageHeader {
	readonly rawSize: number;
	readonly chunkSize: number;
	readonly level: number;
	/** For each chunk, the size of its zstd frame and the bit mask of its pages that are not zeros, which the frame holds in order */
	readonly chunks: readonly (readonly [size: number, pages: number])[];
}

const zstdCompress = promisify(zlib.zstdCompress);
const zstdDecompress = promisify(zlib.zstdDecompress);

/** The runs of consecutive set bits of a page mask, as [first page, page count] */
function pageRuns(mask: number, pages: number): [number, number][] {
	const runs: [number, number][] = [];
	for (let page = 0; page < pages; page++) {
		if (mask & (1 << page)) {
			const last = runs[runs.length - 1];
			if (last && last[0] + last[1] === page) {
				last[1]++;
			} else {
				runs.push([page, 1]);
			}
		}
	}
	return runs;
}

async function pack(args: Args): Promise<void> {
	const input = required(args, 'in');
	const output = required(args, 'out');
	const chunkSize = Number(args.get('chunk-mb') ?? '32') * PAGE;
	if (chunkSize > 32 * PAGE || chunkSize % PAGE) {
		throw new Error('The chunks hold at most 32 pages of 1 MB');
	}
	const level = Number(args.get('level') ?? '9');
	const rawSize = fs.statSync(input).size;
	const count = Math.ceil(rawSize / chunkSize);
	const frames: (Buffer | undefined)[] = new Array(count);
	const masks: number[] = new Array(count).fill(0);
	const zeros = Buffer.alloc(PAGE);
	const options: zlib.ZstdOptions = { chunkSize: ZLIB_CHUNK, params: { [zlib.constants.ZSTD_c_compressionLevel]: level, [zlib.constants.ZSTD_c_checksumFlag]: 1 } };
	const handle = await fs.promises.open(input, 'r');
	let next = 0;
	try {
		await Promise.all(Array.from({ length: os.availableParallelism() }, async () => {
			while (next < count) {
				const index = next++;
				const raw = await readAll(handle, Math.min(chunkSize, rawSize - index * chunkSize), index * chunkSize);
				const pages: Buffer[] = [];
				for (let page = 0; page * PAGE < raw.length; page++) {
					const data = raw.subarray(page * PAGE, (page + 1) * PAGE);
					if (!data.equals(zeros.subarray(0, data.length))) {
						masks[index] |= 1 << page;
						pages.push(data);
					}
				}
				if (pages.length) {
					frames[index] = await zstdCompress(pages.length === Math.ceil(raw.length / PAGE) ? raw : Buffer.concat(pages), options);
				}
			}
		}));
	} finally {
		await handle.close();
	}
	const header: ImageHeader = { rawSize, chunkSize, level, chunks: Array.from({ length: count }, (_, index) => [frames[index]?.length ?? 0, masks[index] >>> 0]) };
	const json = Buffer.from(JSON.stringify(header));
	const prefix = Buffer.alloc(IMAGE_MAGIC.length + 4);
	IMAGE_MAGIC.copy(prefix);
	prefix.writeUInt32LE(json.length, IMAGE_MAGIC.length);
	const out = await fs.promises.open(output, 'w');
	try {
		let position = 0;
		for (const part of [prefix, json, ...frames]) {
			if (part) {
				await writeAll(out, part, position);
				position += part.length;
			}
		}
	} finally {
		await out.close();
	}
	const packed = header.chunks.reduce((sum, [length]) => sum + length, 0);
	log(`packed ${Math.round(rawSize / 1e6)} MB into ${Math.round(packed / 1e6)} MB with zstd -${level}, ${header.chunks.filter(([length]) => !length).length} of ${count} chunks empty`);
}

/**
 * Recreates a disk image from a packed one: downloads, decompresses and writes its chunks at the
 * same time, in order. With `sparse`, the pages of zeros stay holes of the file.
 */
async function unpack(source: Source, file: string, options: { readonly sparse: boolean; readonly existing: boolean; readonly connections: number }): Promise<string> {
	let head = await source.read(0, Math.min(source.size, PAGE));
	if (!head.subarray(0, IMAGE_MAGIC.length).equals(IMAGE_MAGIC)) {
		throw new Error('Not a packed image');
	}
	const headerEnd = IMAGE_MAGIC.length + 4 + head.readUInt32LE(IMAGE_MAGIC.length);
	if (headerEnd > head.length) {
		head = await source.read(0, headerEnd);
	}
	const header: ImageHeader = JSON.parse(head.toString('utf8', IMAGE_MAGIC.length + 4, headerEnd));
	const offsets: number[] = [];
	let offset = headerEnd;
	for (const [length] of header.chunks) {
		offsets.push(offset);
		offset += length;
	}
	const count = header.chunks.length;
	// Bounds the memory to the decompressed chunks of the window
	const window = 64;
	const ready = new Map<number, Buffer | undefined>();
	let next = 0;
	let written = 0;
	let wakeWriter: (() => void) | undefined;
	let wakeWorkers: (() => void)[] = [];
	let writtenBytes = 0;
	const worker = async () => {
		while (next < count) {
			const index = next++;
			while (index >= written + window) {
				await new Promise<void>(resolve => wakeWorkers.push(resolve));
			}
			const [length] = header.chunks[index];
			ready.set(index, length > 0 ? await zstdDecompress(await source.read(offsets[index], length), { chunkSize: ZLIB_CHUNK }) : undefined);
			wakeWriter?.();
		}
	};
	// An existing file keeps its attributes, such as FILE_ATTRIBUTE_TEMPORARY, which asks Windows to
	// keep its data in memory instead of writing it to the disk
	const handle = await fs.promises.open(file, options.existing ? 'r+' : 'w');
	const writer = async () => {
		await handle.truncate(0);
		for (let index = 0; index < count; index++) {
			while (!ready.has(index)) {
				await new Promise<void>(resolve => wakeWriter = resolve);
			}
			wakeWriter = undefined;
			const data = ready.get(index);
			ready.delete(index);
			const position = index * header.chunkSize;
			const length = Math.min(header.chunkSize, header.rawSize - position);
			const runs = pageRuns(header.chunks[index][1], Math.ceil(length / PAGE));
			const pageBytes = (page: number, pages: number) => Math.min(pages * PAGE, length - page * PAGE);
			const stored = runs.reduce((sum, [page, pages]) => sum + pageBytes(page, pages), 0);
			if ((data?.length ?? 0) !== stored) {
				throw new Error(`Chunk ${index} has ${data?.length ?? 0} bytes instead of ${stored}`);
			}
			if (options.sparse) {
				let from = 0;
				for (const [page, pages] of runs) {
					const bytes = pageBytes(page, pages);
					await writeAll(handle, data!.subarray(from, from + bytes), position + page * PAGE);
					from += bytes;
					writtenBytes += bytes;
				}
			} else {
				let chunk = data ?? Buffer.alloc(length);
				if (data && stored !== length) {
					chunk = Buffer.alloc(length);
					let from = 0;
					for (const [page, pages] of runs) {
						const bytes = pageBytes(page, pages);
						data.copy(chunk, page * PAGE, from, from + bytes);
						from += bytes;
					}
				}
				await writeAll(handle, chunk, position);
				writtenBytes += length;
			}
			written = index + 1;
			const waiting = wakeWorkers;
			wakeWorkers = [];
			waiting.forEach(resolve => resolve());
		}
		await handle.truncate(header.rawSize);
	};
	try {
		await Promise.all([writer(), ...Array.from({ length: options.connections }, worker)]);
	} finally {
		await handle.close();
	}
	return `downloaded ${Math.round(source.size / 1e6)} MB and wrote ${Math.round(writtenBytes / 1e6)} MB of ${Math.round(header.rawSize / 1e6)} MB`;
}

//#endregion

//#region restore

interface Metadata {
	readonly commit: string;
	readonly workspace: string;
	readonly created: string;
}

function samePath(a: string, b: string): boolean {
	return process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
}

/** Mounts a disk image at the root folder, and returns how to unmount it */
async function mount(source: Source, root: string, connections: number): Promise<() => void> {
	const temp = process.env.RUNNER_TEMP ?? os.tmpdir();
	const ws = workspace();
	switch (process.platform) {
		case 'linux': {
			// An ext4 volume in a sparse file. noinit_itable leaves the inode tables that mkfs left to
			// initialize alone, as they are zeros already, instead of writing them during the job.
			const file = path.join(temp, 'workspace-image.ext4');
			log(await unpack(source, file, { sparse: true, existing: false, connections }));
			run('sudo', ['mount', '-o', 'loop,noatime,noinit_itable', file, root]);
			return () => {
				spawnSync('sudo', ['umount', root], { stdio: 'inherit' });
			};
		}
		case 'darwin': {
			// An APFS volume in a sparse ASIF image, which hides the empty workspace folder of the runner
			const file = path.join(temp, 'workspace-image.asif');
			log(await unpack(source, file, { sparse: true, existing: false, connections }));
			run('diskutil', ['image', 'attach', '--nobrowse', '--mountPoint', root, file]);
			return () => {
				spawnSync('diskutil', ['unmount', 'force', root], { stdio: 'inherit' });
			};
		}
		case 'win32': {
			// A Dev Drive in a VHDX, in a temporary file, attached through the file system cache. One
			// PowerShell prepares the file, compiles the virtual disk API while the image downloads, and
			// attaches the VHDX when it is complete.
			const file = path.join(temp, 'workspace-image.vhdx');
			const ready = `${file}.ready`;
			fs.rmSync(file, { force: true });
			fs.rmSync(ready, { force: true });
			const attach = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-File', path.join(import.meta.dirname, 'vhd.ps1'), '-Path', file, '-Prepare', '-WaitFor', ready, '-MountFolder', root, '-CachedIo', '-Trust'], { stdio: 'inherit' });
			const exited = new Promise<number | null>(resolve => {
				attach.on('error', () => resolve(null));
				attach.on('exit', code => resolve(code));
			});
			let removed = false;
			try {
				while (!fs.existsSync(file)) {
					if (await Promise.race([exited.then(() => true), new Promise<false>(resolve => setTimeout(() => resolve(false), 20))])) {
						throw new Error('vhd.ps1 exited before it prepared the file');
					}
				}
				log(await unpack(source, file, { sparse: false, existing: true, connections }));
				// A volume can only be mounted at an empty folder
				fs.rmdirSync(ws);
				removed = true;
				fs.writeFileSync(ready, '');
				const code = await exited;
				if (code !== 0) {
					throw new Error(`vhd.ps1 exited with ${code}`);
				}
			} catch (err) {
				attach.kill();
				if (removed) {
					fs.mkdirSync(ws, { recursive: true });
				}
				throw err;
			}
			return () => {
				spawnSync('mountvol', [`${root}\\`, '/D'], { stdio: 'inherit' });
				fs.mkdirSync(ws, { recursive: true });
			};
		}
		default:
			throw new Error(`No workspace images on ${process.platform}`);
	}
}

async function restoreImage(args: Args): Promise<void> {
	const name = required(args, 'name');
	const branch = args.get('branch') || 'main';
	const connections = Number(args.get('connections') ?? '16');
	const ws = workspace();
	const root = imageRoot();
	if (fs.readdirSync(ws).length) {
		throw new Error(`${ws} is not empty`);
	}
	const others = fs.readdirSync(root).filter(entry => entry !== path.basename(ws));
	if (others.length) {
		throw new Error(`${root} holds more than the workspace: ${others.join(', ')}`);
	}
	const artifact = await locate(name, branch);
	log(`found artifact ${artifact.id} of ${Math.round(artifact.size_in_bytes / 1e6)} MB, built at ${artifact.workflow_run!.head_sha} on ${artifact.created_at}`);
	const unmount = await mount(await openArtifact(artifact.id), root, connections);
	log(`mounted the image at ${root}`);
	let metadata: Metadata;
	try {
		metadata = JSON.parse(fs.readFileSync(path.join(root, METADATA_FILE), 'utf8'));
		// pnpm links the packages of different folders with absolute paths on Windows
		if (!samePath(metadata.workspace, ws)) {
			throw new Error(`The image holds the workspace ${metadata.workspace}, not ${ws}`);
		}
		if (!fs.existsSync(path.join(ws, '.git'))) {
			throw new Error('The image holds no .git');
		}
	} catch (err) {
		unmount();
		throw err;
	}
	setEnv(toolFolders(root));
	// The files of an image belong to the user of the machine that built it
	run('git', ['config', '--global', '--add', 'safe.directory', '*']);
	setOutput('used', 'true');
	setOutput('commit', metadata.commit);
	const seconds = ((performance.now() - started) / 1000).toFixed(1);
	log(`restored the workspace image of ${metadata.commit} in ${seconds} s`);
	summary(`Restored the workspace image of ${metadata.commit} (artifact ${artifact.id}, ${Math.round(artifact.size_in_bytes / 1e6)} MB) in ${seconds} s`);
}

async function restore(args: Args): Promise<void> {
	try {
		await restoreImage(args);
	} catch (err) {
		// The job installs everything instead
		console.log(`::warning title=Workspace image::No workspace image: ${err instanceof Error ? err.message : String(err)}`);
		setOutput('used', 'false');
	}
}

//#endregion

//#region after the checkout

interface InstallState {
	readonly nodeVersion: string;
	readonly fileHashes: Record<string, string>;
}

/**
 * Compares the install state that the postinstall script saved in the image with the checkout:
 * the dependencies are current when no input of the install changed (see build/npm/installStateHash.ts).
 */
async function deps(): Promise<void> {
	const ws = workspace();
	const installState: { readSavedState(): InstallState | undefined; computeState(): InstallState } = await import(pathToFileURL(path.join(ws, 'build', 'npm', 'installStateHash.ts')).href);
	const saved = installState.readSavedState();
	const current = installState.computeState();
	const changed: string[] = [];
	if (!saved) {
		changed.push('node_modules/.postinstall-state');
	} else {
		if (saved.nodeVersion !== current.nodeVersion) {
			changed.push(`Node.js ${saved.nodeVersion} → ${current.nodeVersion}`);
		}
		for (const file of [...new Set([...Object.keys(saved.fileHashes), ...Object.keys(current.fileHashes)])].sort()) {
			if (saved.fileHashes[file] !== current.fileHashes[file]) {
				changed.push(file);
			}
		}
	}
	if (changed.length) {
		console.log(`::notice title=Workspace image::${changed.length} inputs of the install changed since the image, so the job installs the dependencies: ${changed.join(', ')}`);
	} else {
		log('The dependencies of the image are current');
	}
	setOutput('current', String(changed.length === 0));
}

//#endregion

//#region building images

function env(): void {
	const folders = toolFolders(imageRoot());
	for (const folder of [folders.pnpm_config_store_dir, folders.PLAYWRIGHT_BROWSERS_PATH]) {
		fs.mkdirSync(folder, { recursive: true });
	}
	setEnv(folders);
}

/**
 * Leaves the checkout of an image ready for the checkouts of the jobs: HEAD detached at its commit,
 * which actions/checkout would otherwise check out again, a tag at the commit, which actions/checkout
 * keeps when it reuses the repository (it deletes the branches) and which its shallow fetch sends,
 * so that it downloads only what changed, and git comparing only the sizes and modification times
 * of the files, which the images keep (unlike their inodes and change times), so that the checkout
 * writes only the files that changed.
 */
async function seed(): Promise<void> {
	const ws = workspace();
	const git = (...args: string[]) => run('git', ['-C', ws, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
	const commit = git('rev-parse', 'HEAD').trim();
	git('checkout', '--quiet', '--detach');
	git('tag', '--force', SEED_TAG, 'HEAD');
	git('config', '--local', 'core.checkStat', 'minimal');
	git('config', '--local', 'core.trustctime', 'false');
	// No credentials in an image
	const keys = spawnSync('git', ['-C', ws, 'config', '--local', '--name-only', '--get-regexp', '^(http\\..*\\.extraheader|includeif\\..*)$'], { encoding: 'utf8' }).stdout ?? '';
	for (const key of new Set(keys.split(/\r?\n/).filter(Boolean))) {
		git('config', '--local', '--unset-all', key);
	}
	const metadata: Metadata = { commit, workspace: ws, created: new Date().toISOString() };
	fs.writeFileSync(path.join(imageRoot(), METADATA_FILE), `${JSON.stringify(metadata, null, '\t')}\n`);
	log(`prepared the checkout of ${commit}`);
}

//#endregion

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
switch (command) {
	case 'restore': await restore(args); break;
	case 'deps': await deps(); break;
	case 'env': env(); break;
	case 'seed': await seed(); break;
	case 'pack': await pack(args); break;
	default:
		console.error(`Unknown command: ${command}`);
		process.exit(1);
}
