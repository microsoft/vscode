/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'yauzl' {

	import { EventEmitter } from 'events';
	import { Readable } from 'stream';

	export class Entry {
		fileName: string;
		extraFields: { id: number; data: Buffer; }[];
		comment: string;
		versionMadeBy: number;
		versionNeededToExtract: number;
		generalPurposeBitFlag: number;
		compressionMethod: number;
		lastModFileTime: number;
		lastModFileDate: number;
		crc32: number;
		compressedSize: number;
		uncompressedSize: number;
		fileNameLength: number;
		extraFieldLength: number;
		fileCommentLength: number;
		internalFileAttributes: number;
		externalFileAttributes: number;
		relativeOffsetOfLocalHeader: number;
		getLastModDate(): Date;
	}

	export class ZipFile extends EventEmitter {
		openReadStream(entry: Entry, callback: (err?: Error, stream?: Readable) => void);
		close();
		isOpen: boolean;
		entryCount: number;
		comment: string;
	}

	export interface IOptions {
		autoClose: boolean;
	}

	export function open(path: string, callback: (err?: Error, zipfile?: ZipFile) => void): void;
	export function open(path: string, options: IOptions, callback: (err?: Error, zipfile?: ZipFile) => void): void;
}