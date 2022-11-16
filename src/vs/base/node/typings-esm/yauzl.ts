/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as _yauzl from 'yauzl';
// ESM-comment-end

// ESM-uncomment-begin
// const _yauzl = globalThis.MonacoNodeModules.yauzl;
// ESM-uncomment-end

export type Entry = import('yauzl').Entry;
export type RandomAccessReader = import('yauzl').RandomAccessReader;
export type ZipFile = import('yauzl').ZipFile;
export const dosDateTimeToDate = _yauzl.dosDateTimeToDate;
export const fromBuffer = _yauzl.fromBuffer;
export const fromFd = _yauzl.fromFd;
export const fromRandomAccessReader = _yauzl.fromRandomAccessReader;
export const open = _yauzl.open;
export const validateFileName = _yauzl.validateFileName;
