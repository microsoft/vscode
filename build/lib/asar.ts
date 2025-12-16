/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import es from 'event-stream';
import pickle from 'chromium-pickle-js';
import Filesystem from 'asar/lib/filesystem.js';
import VinylFile from 'vinyl';
import minimatch from 'minimatch';

export function createAsar(folderPath: string, unpackGlobs: string[], skipGlobs: string[], duplicateGlobs: string[], destFilename: string): NodeJS.ReadWriteStream {

	const shouldUnpackFile = (file: VinylFile): boolean => {
		for (let i = 0; i < unpackGlobs.length; i++) {
			if (minimatch(file.relative, unpackGlobs[i])) {
				return true;
			}
		}
		return false;
	};

	const shouldSkipFile = (file: VinylFile): boolean => {
		for (const skipGlob of skipGlobs) {
			if (minimatch(file.relative, skipGlob)) {
				return true;
			}
		}
		return false;
	};

	// Files that should be duplicated between
	// node_modules.asar and node_modules
	const shouldDuplicateFile = (file: VinylFile): boolean => {
		for (const duplicateGlob of duplicateGlobs) {
			if (minimatch(file.relative, duplicateGlob)) {
				return true;
			}
		}
		return false;
	};

	const filesystem = new Filesystem(folderPath);
	const out: Buffer[] = [];

	// Keep track of pending inserts
	let pendingInserts = 0;
	let onFileInserted = () => { pendingInserts--; };

	// Do not insert twice the same directory
	const seenDir: { [key: string]: boolean } = {};
	const insertDirectoryRecursive = (dir: string) => {
		if (seenDir[dir]) {
			return;
		}

		let lastSlash = dir.lastIndexOf('/');
		if (lastSlash === -1) {
			lastSlash = dir.lastIndexOf('\\');
		}
		if (lastSlash !== -1) {
			insertDirectoryRecursive(dir.substring(0, lastSlash));
		}
		seenDir[dir] = true;
		filesystem.insertDirectory(dir);
	};

	const insertDirectoryForFile = (file: string) => {
		let lastSlash = file.lastIndexOf('/');
		if (lastSlash === -1) {
			lastSlash = file.lastIndexOf('\\');
		}
		if (lastSlash !== -1) {
			insertDirectoryRecursive(file.substring(0, lastSlash));
		}
	};

	const insertFile = (relativePath: string, stat: { size: number; mode: number }, shouldUnpack: boolean) => {
		insertDirectoryForFile(relativePath);
		pendingInserts++;
		// Do not pass `onFileInserted` directly because it gets overwritten below.
		// Create a closure capturing `onFileInserted`.
		filesystem.insertFile(relativePath, shouldUnpack, { stat: stat }, {}).then(() => onFileInserted(), () => onFileInserted());
	};

	return es.through(function (file) {
		if (file.stat.isDirectory()) {
			return;
		}
		if (!file.stat.isFile()) {
			throw new Error(`unknown item in stream!`);
		}
		if (shouldSkipFile(file)) {
			this.queue(new VinylFile({
				base: '.',
				path: file.path,
				stat: file.stat,
				contents: file.contents
			}));
			return;
		}
		if (shouldDuplicateFile(file)) {
			this.queue(new VinylFile({
				base: '.',
				path: file.path,
				stat: file.stat,
				contents: file.contents
			}));
		}
		const shouldUnpack = shouldUnpackFile(file);
		insertFile(file.relative, { size: file.contents.length, mode: file.stat.mode }, shouldUnpack);

		if (shouldUnpack) {
			// The file goes outside of xx.asar, in a folder xx.asar.unpacked
			const relative = path.relative(folderPath, file.path);
			this.queue(new VinylFile({
				base: '.',
				path: path.join(destFilename + '.unpacked', relative),
				stat: file.stat,
				contents: file.contents
			}));
		} else {
			// The file goes inside of xx.asar
			out.push(file.contents);
		}
	}, function () {

		const finish = () => {
			{
				const headerPickle = pickle.createEmpty();
				headerPickle.writeString(JSON.stringify(filesystem.header));
				const headerBuf = headerPickle.toBuffer();

				const sizePickle = pickle.createEmpty();
				sizePickle.writeUInt32(headerBuf.length);
				const sizeBuf = sizePickle.toBuffer();

				out.unshift(headerBuf);
				out.unshift(sizeBuf);
			}

			const contents = Buffer.concat(out);
			out.length = 0;

			this.queue(new VinylFile({
				base: '.',
				path: destFilename,
				contents: contents
			}));
			this.queue(null);
		};

		// Call finish() only when all file inserts have finished...
		if (pendingInserts === 0) {
			finish();
		} else {
			onFileInserted = () => {
				pendingInserts--;
				if (pendingInserts === 0) {
					finish();
				}
			};
		}
	});
}
