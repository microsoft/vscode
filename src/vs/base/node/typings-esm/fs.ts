/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as fs from 'fs';
// ESM-comment-end

// ESM-uncomment-begin
// const fs = globalThis.MonacoNodeModules.fs;
// ESM-uncomment-end

export type Dir = import('fs').Dir;
export type Dirent = import('fs').Dirent;
export type ReadStream = import('fs').ReadStream;
export type Stats = import('fs').Stats;
export type WriteStream = import('fs').WriteStream;
export const Dir = fs.Dir;
export const Dirent = fs.Dirent;
export const ReadStream = fs.ReadStream;
export const Stats = fs.Stats;
export const WriteStream = fs.WriteStream;
export const access = fs.access;
export const accessSync = fs.accessSync;
export const appendFile = fs.appendFile;
export const appendFileSync = fs.appendFileSync;
export const chmod = fs.chmod;
export const chmodSync = fs.chmodSync;
export const chown = fs.chown;
export const chownSync = fs.chownSync;
export const close = fs.close;
export const closeSync = fs.closeSync;
export const constants = fs.constants;
export const copyFile = fs.copyFile;
export const copyFileSync = fs.copyFileSync;
export const cp = fs.cp;
export const cpSync = fs.cpSync;
export const createReadStream = fs.createReadStream;
export const createWriteStream = fs.createWriteStream;
export const existsSync = fs.existsSync;
export const fchmod = fs.fchmod;
export const fchmodSync = fs.fchmodSync;
export const fchown = fs.fchown;
export const fchownSync = fs.fchownSync;
export const fdatasync = fs.fdatasync;
export const fdatasyncSync = fs.fdatasyncSync;
export const fstat = fs.fstat;
export const fstatSync = fs.fstatSync;
export const fsync = fs.fsync;
export const fsyncSync = fs.fsyncSync;
export const ftruncate = fs.ftruncate;
export const ftruncateSync = fs.ftruncateSync;
export const futimes = fs.futimes;
export const futimesSync = fs.futimesSync;
export const lchown = fs.lchown;
export const lchownSync = fs.lchownSync;
export const link = fs.link;
export const linkSync = fs.linkSync;
export const lstat = fs.lstat;
export const lstatSync = fs.lstatSync;
export const lutimes = fs.lutimes;
export const lutimesSync = fs.lutimesSync;
export const mkdir = fs.mkdir;
export const mkdirSync = fs.mkdirSync;
export const mkdtemp = fs.mkdtemp;
export const mkdtempSync = fs.mkdtempSync;
export const open = fs.open;
export const openSync = fs.openSync;
export const opendir = fs.opendir;
export const opendirSync = fs.opendirSync;
export const promises = fs.promises;
export const read = fs.read;
export const readFile = fs.readFile;
export const readFileSync = fs.readFileSync;
export const readSync = fs.readSync;
export const readdir = fs.readdir;
export const readdirSync = fs.readdirSync;
export const readlink = fs.readlink;
export const readlinkSync = fs.readlinkSync;
export const readv = fs.readv;
export const readvSync = fs.readvSync;
export const realpath = fs.realpath;
export const realpathSync = fs.realpathSync;
export const rename = fs.rename;
export const renameSync = fs.renameSync;
export const rm = fs.rm;
export const rmSync = fs.rmSync;
export const rmdir = fs.rmdir;
export const rmdirSync = fs.rmdirSync;
export const stat = fs.stat;
export const statSync = fs.statSync;
export const symlink = fs.symlink;
export const symlinkSync = fs.symlinkSync;
export const truncate = fs.truncate;
export const truncateSync = fs.truncateSync;
export const unlink = fs.unlink;
export const unlinkSync = fs.unlinkSync;
export const unwatchFile = fs.unwatchFile;
export const utimes = fs.utimes;
export const utimesSync = fs.utimesSync;
export const watch = fs.watch;
export const watchFile = fs.watchFile;
export const write = fs.write;
export const writeFile = fs.writeFile;
export const writeFileSync = fs.writeFileSync;
export const writeSync = fs.writeSync;
export const writev = fs.writev;
export const writevSync = fs.writevSync;
export const exists = fs.exists;
export const lchmod = fs.lchmod;
export const lchmodSync = fs.lchmodSync;
