/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileSystemProvider, getScheme } from '../requests';
import { URI as Uri } from 'vscode-uri';

import * as fs from 'fs';
import { FileType } from 'vscode-css-languageservice';
import { FileStat } from 'vscode-html-languageservice';

/**
 * This extension is for the TSServer in the JavaScript mode which
 * require sync access to stat's mtime due to TSServer API limitations
 */
export interface NodeRequestService extends FileSystemProvider {
	statSync(location: string): FileStat
}

export function getNodeFileFS(): NodeRequestService {
	function ensureFileUri(location: string) {
		if (getScheme(location) !== 'file' && getScheme(location) !== '') {
			throw new Error(`fileSystemProvider can only handle file URLs, got ${getScheme(location)}`);
		}
	}

	const fsStatToFileStat = (stats: fs.Stats) => {
		let type = FileType.Unknown;
		if (stats.isFile()) {
			type = FileType.File;
		} else if (stats.isDirectory()) {
			type = FileType.Directory;
		} else if (stats.isSymbolicLink()) {
			type = FileType.SymbolicLink;
		}

		return {
			type,
			ctime: stats.ctime.getTime(),
			mtime: stats.mtime.getTime(),
			size: stats.size
		};
	};

	return {
		stat(location: string) {
			ensureFileUri(location);
			return new Promise((c, e) => {
				const uri = Uri.parse(location);
				fs.stat(uri.fsPath, (err, stats) => {
					if (err) {
						if (err.code === 'ENOENT') {
							return c({ type: FileType.Unknown, ctime: -1, mtime: -1, size: -1 });
						} else {
							return e(err);
						}
					}

					c(fsStatToFileStat(stats));
				});
			});
		},
		statSync(location: string) {
			ensureFileUri(location);
			const uri = Uri.parse(location);
			const stats = fs.statSync(uri.fsPath);
			return fsStatToFileStat(stats);
		},
		readDirectory(location: string) {
			ensureFileUri(location);
			return new Promise((c, e) => {
				const path = Uri.parse(location).fsPath;

				fs.readdir(path, { withFileTypes: true }, (err, children) => {
					if (err) {
						return e(err);
					}
					c(children.map(stat => {
						if (stat.isSymbolicLink()) {
							return [stat.name, FileType.SymbolicLink];
						} else if (stat.isDirectory()) {
							return [stat.name, FileType.Directory];
						} else if (stat.isFile()) {
							return [stat.name, FileType.File];
						} else {
							return [stat.name, FileType.Unknown];
						}
					}));
				});
			});
		}
	};
}
