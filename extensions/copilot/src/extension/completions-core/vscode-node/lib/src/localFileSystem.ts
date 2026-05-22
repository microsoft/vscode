/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Stats, promises as fsp } from 'fs';
import { join } from 'path';
import { FileIdentifier, FileStat, FileType, ICompletionsFileSystemService } from './fileSystem';
import { fsPath } from './util/uri';

export class LocalFileSystem implements ICompletionsFileSystemService {
	declare _serviceBrand: undefined;

	async readFileString(uri: FileIdentifier): Promise<string> {
		return (await fsp.readFile(fsPath(uri))).toString();
	}

	async stat(uri: FileIdentifier): Promise<FileStat> {
		const { targetStat, lstat, stat } = await this.statWithLink(fsPath(uri));
		return {
			ctime: targetStat.ctimeMs,
			mtime: targetStat.mtimeMs,
			size: targetStat.size,
			type: this.getFileType(targetStat, lstat, stat),
		};
	}

	async readDirectory(uri: FileIdentifier): Promise<[string, FileType][]> {
		const filePath = fsPath(uri);
		const readDir = await fsp.readdir(filePath, { withFileTypes: true });
		const result: [string, FileType][] = [];
		for (const file of readDir) {
			const { targetStat, lstat, stat } = await this.statWithLink(join(filePath, file.name));
			result.push([file.name, this.getFileType(targetStat, lstat, stat)]);
		}
		return result;
	}

	private async statWithLink(fsPath: string): Promise<{ lstat: Stats; stat?: Stats; targetStat: Stats }> {
		const lstat = await fsp.lstat(fsPath);

		if (lstat.isSymbolicLink()) {
			try {
				const stat = await fsp.stat(fsPath);
				return { lstat, stat, targetStat: stat };
			} catch {
				// likely a dangling link or access error
			}
		}

		return { lstat, targetStat: lstat };
	}

	private getFileType(targetStat: Stats, lstat: Stats, stat?: Stats): FileType {
		let type = FileType.Unknown;
		if (targetStat.isFile()) {
			type = FileType.File;
		}
		if (targetStat.isDirectory()) {
			type = FileType.Directory;
		}
		// dangling links have FileType.Unknown
		if (lstat.isSymbolicLink() && stat) {
			type |= FileType.SymbolicLink;
		}
		return type;
	}
}
