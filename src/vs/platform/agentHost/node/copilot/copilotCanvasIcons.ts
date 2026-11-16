/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants, promises as fs } from 'fs';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { isEqualOrParent } from '../../../../base/common/extpath.js';
import { LRUCache } from '../../../../base/common/map.js';
import { basename, dirname, extname, isAbsolute, join } from '../../../../base/common/path.js';
import { ILogService } from '../../../log/common/log.js';
import { isBoundedPngSize, MAX_CANVAS_ICON_BYTES, toCanvasIconDataUri } from '../../common/meta/agentCanvasIconMeta.js';

/** The entry modules the runtime discovers an extension by, which mark its directory. */
const EXTENSION_ENTRY_FILES = ['extension.mjs', 'extension.cjs', 'extension.js'];
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

interface ICachedCanvasIcon {
	readonly mtimeMs: number;
	readonly size: number;
	readonly icon: string | undefined;
}

/**
 * Reads the PNG icons Copilot extensions declare for their canvases, so that the host can send them to clients, which
 * cannot read host paths. The runtime only checks that a path names a `.png` inside its extension's directory, and only
 * by its text: the loader reads only a regular file inside the extension's real directory, after resolving symbolic
 * links, that is a bounded PNG image. It never waits on a special file, such as a FIFO, that has no writer.
 *
 * Swapping a directory between the checks and the read could still redirect it, but only to a PNG image shown to the
 * same user, and only by code that already runs as that user.
 */
export class CopilotCanvasIconLoader {

	private readonly _cache = new LRUCache<string, ICachedCanvasIcon>(64);

	constructor(private readonly _logService: ILogService) { }

	/**
	 * The icon at `path` that extension `extensionId` declares, as a canvas icon data URI, or `undefined` when there is
	 * none it can show.
	 */
	async load(path: string | undefined, extensionId: string): Promise<string | undefined> {
		if (!path) {
			return undefined;
		}
		try {
			return await this._load(path, extensionId);
		} catch (error) {
			this._logService.trace(`[Copilot] Not showing a canvas icon: ${getErrorMessage(error)}`);
			return undefined;
		}
	}

	private async _load(path: string, extensionId: string): Promise<string | undefined> {
		if (!isAbsolute(path) || extname(path).toLowerCase() !== '.png') {
			return undefined;
		}
		const extensionDirectory = await findExtensionDirectory(path, extensionId);
		if (!extensionDirectory) {
			return undefined;
		}
		const [icon, directory] = await Promise.all([fs.realpath(path), fs.realpath(extensionDirectory)]);
		// Both paths are canonical, so they compare exactly, even on a file system that ignores case.
		if (icon === directory || !isEqualOrParent(icon, directory, false)) {
			return undefined;
		}
		// Opening a FIFO waits for a writer, so only a regular file is opened.
		const linkStat = await fs.lstat(icon);
		if (!linkStat.isFile() || linkStat.size > MAX_CANVAS_ICON_BYTES) {
			return undefined;
		}
		// The resolved path has no symbolic links left; refuse a file that replaces it meanwhile.
		const handle = await fs.open(icon, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
		try {
			const stat = await handle.stat();
			if (!stat.isFile() || stat.dev !== linkStat.dev || stat.ino !== linkStat.ino || stat.size > MAX_CANVAS_ICON_BYTES) {
				return undefined;
			}
			const cached = this._cache.get(icon);
			if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
				return cached.icon;
			}
			const bytes = new Uint8Array(stat.size);
			let length = 0;
			while (length < bytes.length) {
				const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
				if (bytesRead === 0) {
					break;
				}
				length += bytesRead;
			}
			const result = length === stat.size && isBoundedPng(bytes) ? toCanvasIconDataUri(bytes) : undefined;
			this._cache.set(icon, { mtimeMs: stat.mtimeMs, size: stat.size, icon: result });
			return result;
		} finally {
			await handle.close();
		}
	}
}

/**
 * The directory of extension `extensionId` that the runtime keeps `iconPath` inside. The runtime names an extension after
 * its directory and joins the declared icon to it, so the directory is above the icon, has the extension's name, and holds
 * an entry module. The runtime does not report the directory, so when another directory above the icon matches too, as a
 * linked directory inside the extension or a project folder named like it may, the loader cannot tell them apart and
 * shows no icon.
 */
async function findExtensionDirectory(iconPath: string, extensionId: string): Promise<string | undefined> {
	let extensionDirectory: string | undefined;
	let directory = dirname(iconPath);
	while (true) {
		const name = basename(directory);
		if (name && extensionId.endsWith(`:${name}`) && await hasEntryModule(directory)) {
			if (extensionDirectory) {
				return undefined;
			}
			extensionDirectory = directory;
		}
		const parent = dirname(directory);
		if (parent === directory) {
			return extensionDirectory;
		}
		directory = parent;
	}
}

async function hasEntryModule(directory: string): Promise<boolean> {
	for (const entry of EXTENSION_ENTRY_FILES) {
		try {
			if ((await fs.stat(join(directory, entry))).isFile()) {
				return true;
			}
		} catch {
			// Not this entry module.
		}
	}
	return false;
}

/** Whether `bytes` starts as a PNG image does, with a header declaring a bounded, non-empty image. */
function isBoundedPng(bytes: Uint8Array): boolean {
	if (bytes.length < 24 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
		return false;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return view.getUint32(8) === 13
		&& String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) === 'IHDR'
		&& isBoundedPngSize(view.getUint32(16), view.getUint32(20));
}
