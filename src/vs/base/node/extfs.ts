/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as uuid from 'vs/base/common/uuid';
import * as strings from 'vs/base/common/strings';
import * as platform from 'vs/base/common/platform';
import * as flow from 'vs/base/node/flow';

import * as fs from 'fs';
import * as paths from 'path';

const loop = flow.loop;

export function readdirSync(path: string): string[] {
	// Mac: uses NFD unicode form on disk, but we want NFC
	// See also https://github.com/nodejs/node/issues/2165
	if (platform.isMacintosh) {
		return fs.readdirSync(path).map(c => strings.normalizeNFC(c));
	}

	return fs.readdirSync(path);
}

export function readdir(path: string, callback: (error: Error, files: string[]) => void): void {
	// Mac: uses NFD unicode form on disk, but we want NFC
	// See also https://github.com/nodejs/node/issues/2165
	if (platform.isMacintosh) {
		return fs.readdir(path, (error, children) => {
			if (error) {
				return callback(error, null);
			}

			return callback(null, children.map(c => strings.normalizeNFC(c)));
		});
	}

	return fs.readdir(path, callback);
}

export function mkdirp(path: string, mode: number, callback: (error: Error) => void): void {
	fs.exists(path, (exists) => {
		if (exists) {
			return isDirectory(path, (err: Error, itIs?: boolean) => {
				if (err) {
					return callback(err);
				}

				if (!itIs) {
					return callback(new Error('"' + path + '" is not a directory.'));
				}

				callback(null);
			});
		}

		mkdirp(paths.dirname(path), mode, (err: Error) => {
			if (err) { callback(err); return; }

			if (mode) {
				fs.mkdir(path, mode, (error) => {
					if (error) {
						return callback(error);
					}

					fs.chmod(path, mode, callback); // we need to explicitly chmod because of https://github.com/nodejs/node/issues/1104
				});
			} else {
				fs.mkdir(path, null, callback);
			}
		});
	});
}

function isDirectory(path: string, callback: (error: Error, isDirectory?: boolean) => void): void {
	fs.stat(path, (error, stat) => {
		if (error) { return callback(error); }

		callback(null, stat.isDirectory());
	});
}

export function copy(source: string, target: string, callback: (error: Error) => void, copiedSources?: { [path: string]: boolean }): void {
	if (!copiedSources) {
		copiedSources = Object.create(null);
	}

	fs.stat(source, (error, stat) => {
		if (error) { return callback(error); }
		if (!stat.isDirectory()) { return pipeFs(source, target, stat.mode & 511, callback); }

		if (copiedSources[source]) {
			return callback(null); // escape when there are cycles (can happen with symlinks)
		} else {
			copiedSources[source] = true; // remember as copied
		}

		mkdirp(target, stat.mode & 511, (err) => {
			readdir(source, (err, files) => {
				loop(files, (file: string, clb: (error: Error) => void) => {
					copy(paths.join(source, file), paths.join(target, file), clb, copiedSources);
				}, callback);
			});
		});
	});
}

function pipeFs(source: string, target: string, mode: number, callback: (error: Error) => void): void {
	let callbackHandled = false;

	let readStream = fs.createReadStream(source);
	let writeStream = fs.createWriteStream(target, { mode: mode });

	let onError = (error: Error) => {
		if (!callbackHandled) {
			callbackHandled = true;
			callback(error);
		}
	};

	readStream.on('error', onError);
	writeStream.on('error', onError);

	readStream.on('end', () => {
		(<any>writeStream).end(() => { // In this case the write stream is known to have an end signature with callback
			if (!callbackHandled) {
				callbackHandled = true;

				fs.chmod(target, mode, callback); // we need to explicitly chmod because of https://github.com/nodejs/node/issues/1104
			}
		});
	});

	// In node 0.8 there is no easy way to find out when the pipe operation has finished. As such, we use the end property = false
	// so that we are in charge of calling end() on the write stream and we will be notified when the write stream is really done.
	// We can do this because file streams have an end() method that allows to pass in a callback.
	// In node 0.10 there is an event 'finish' emitted from the write stream that can be used. See
	// https://groups.google.com/forum/?fromgroups=#!topic/nodejs/YWQ1sRoXOdI
	readStream.pipe(writeStream, { end: false });
}

// Deletes the given path by first moving it out of the workspace. This has two benefits. For one, the operation can return fast because
// after the rename, the contents are out of the workspace although not yet deleted. The greater benefit however is that this operation
// will fail in case any file is used by another process. fs.unlink() in node will not bail if a file unlinked is used by another process.
// However, the consequences are bad as outlined in all the related bugs from https://github.com/joyent/node/issues/7164
export function del(path: string, tmpFolder: string, callback: (error: Error) => void, done?: (error: Error) => void): void {
	fs.exists(path, (exists) => {
		if (!exists) {
			return callback(null);
		}

		fs.stat(path, (err, stat) => {
			if (err || !stat) {
				return callback(err);
			}

			// Special windows workaround: A file or folder that ends with a "." cannot be moved to another place
			// because it is not a valid file name. In this case, we really have to do the deletion without prior move.
			if (path[path.length - 1] === '.' || strings.endsWith(path, './') || strings.endsWith(path, '.\\')) {
				return rmRecursive(path, callback);
			}

			let pathInTemp = paths.join(tmpFolder, uuid.generateUuid());
			fs.rename(path, pathInTemp, (error: Error) => {
				if (error) {
					return rmRecursive(path, callback); // if rename fails, delete without tmp dir
				}

				// Return early since the move succeeded
				callback(null);

				// do the heavy deletion outside the callers callback
				rmRecursive(pathInTemp, (error) => {
					if (error) {
						console.error(error);
					}

					if (done) {
						done(error);
					}
				});
			});
		});
	});
}

function rmRecursive(path: string, callback: (error: Error) => void): void {
	if (path === '\\' || path === '/') {
		return callback(new Error('Will not delete root!'));
	}

	fs.exists(path, (exists) => {
		if (!exists) {
			callback(null);
		} else {
			fs.lstat(path, (err, stat) => {
				if (err || !stat) {
					callback(err);
				} else if (!stat.isDirectory() || stat.isSymbolicLink() /* !!! never recurse into links when deleting !!! */) {
					let mode = stat.mode;
					if (!(mode & 128)) { // 128 === 0200
						fs.chmod(path, mode | 128, (err: Error) => { // 128 === 0200
							if (err) {
								callback(err);
							} else {
								fs.unlink(path, callback);
							}
						});
					} else {
						fs.unlink(path, callback);
					}
				} else {
					readdir(path, (err, children) => {
						if (err || !children) {
							callback(err);
						} else if (children.length === 0) {
							fs.rmdir(path, callback);
						} else {
							let firstError: Error = null;
							let childrenLeft = children.length;
							children.forEach((child) => {
								rmRecursive(paths.join(path, child), (err: Error) => {
									childrenLeft--;
									if (err) {
										firstError = firstError || err;
									}

									if (childrenLeft === 0) {
										if (firstError) {
											callback(firstError);
										} else {
											fs.rmdir(path, callback);
										}
									}
								});
							});
						}
					});
				}
			});
		}
	});
}

export function delSync(path: string): void {
	try {
		const stat = fs.lstatSync(path);
		if (stat.isDirectory() && !stat.isSymbolicLink()) {
			readdirSync(path).forEach(child => delSync(paths.join(path, child)));
			fs.rmdirSync(path);
		} else {
			fs.unlinkSync(path);
		}
	} catch (err) {
		if (err.code === 'ENOENT') {
			return; // not found
		}

		throw err;
	}
}

export function mv(source: string, target: string, callback: (error: Error) => void): void {
	if (source === target) {
		return callback(null);
	}

	function updateMtime(err: Error): void {
		if (err) {
			return callback(err);
		}

		fs.stat(target, (error, stat) => {
			if (error) {
				return callback(error);
			}

			if (stat.isDirectory()) {
				return callback(null);
			}

			fs.open(target, 'a', null, (err: Error, fd: number) => {
				if (err) {
					return callback(err);
				}

				fs.futimes(fd, stat.atime, new Date(), (err: Error) => {
					if (err) {
						return callback(err);
					}

					fs.close(fd, callback);
				});
			});
		});
	}

	// Try native rename()
	fs.rename(source, target, (err: Error) => {
		if (!err) {
			return updateMtime(null);
		}

		// In two cases we fallback to classic copy and delete:
		//
		// 1.) The EXDEV error indicates that source and target are on different devices
		// In this case, fallback to using a copy() operation as there is no way to
		// rename() between different devices.
		//
		// 2.) The user tries to rename a file/folder that ends with a dot. This is not
		// really possible to move then, at least on UNC devices.
		if (err && source.toLowerCase() !== target.toLowerCase() && ((<any>err).code === 'EXDEV') || strings.endsWith(source, '.')) {
			return copy(source, target, (err: Error) => {
				if (err) {
					return callback(err);
				}

				rmRecursive(source, updateMtime);
			});
		}

		return callback(err);
	});
}

// Calls fs.writeFile() followed by a fs.sync() call to flush the changes to disk
// We do this in cases where we want to make sure the data is really on disk and
// not in some cache.
//
// See https://github.com/nodejs/node/blob/v5.10.0/lib/fs.js#L1194
let canFlush = true;
export function writeFileAndFlush(path: string, data: string | NodeBuffer, options: { encoding?: string; mode?: number; flag?: string; }, callback: (error: Error) => void): void {
	if (!canFlush) {
		return fs.writeFile(path, data, options, callback);
	}

	if (!options) {
		options = { encoding: 'utf8', mode: 0o666, flag: 'w' };
	} else if (typeof options === 'string') {
		options = { encoding: <string>options, mode: 0o666, flag: 'w' };
	}

	// Open the file with same flags and mode as fs.writeFile()
	fs.open(path, options.flag, options.mode, (openError, fd) => {
		if (openError) {
			return callback(openError);
		}

		// It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
		fs.writeFile(fd, data, options.encoding, (writeError) => {
			if (writeError) {
				return fs.close(fd, () => callback(writeError)); // still need to close the handle on error!
			}

			// Flush contents (not metadata) of the file to disk
			fs.fdatasync(fd, (syncError) => {

				// In some exotic setups it is well possible that node fails to sync
				// In that case we disable flushing and warn to the console
				if (syncError) {
					console.warn('[node.js fs] fdatasync is now disabled for this session because it failed: ', syncError);
					canFlush = false;
				}

				return fs.close(fd, (closeError) => callback(closeError));
			});
		});
	});
}

/**
 * Copied from: https://github.com/Microsoft/vscode-node-debug/blob/master/src/node/pathUtilities.ts#L83
 *
 * Given an absolute, normalized, and existing file path 'realpath' returns the exact path that the file has on disk.
 * On a case insensitive file system, the returned path might differ from the original path by character casing.
 * On a case sensitive file system, the returned path will always be identical to the original path.
 * In case of errors, null is returned. But you cannot use this function to verify that a path exists.
 * realpathSync does not handle '..' or '.' path segments and it does not take the locale into account.
 */
export function realpathSync(path: string): string {
	const dir = paths.dirname(path);
	if (path === dir) {	// end recursion
		return path;
	}

	const name = paths.basename(path).toLowerCase();
	try {
		const entries = readdirSync(dir);
		const found = entries.filter(e => e.toLowerCase() === name);	// use a case insensitive search
		if (found.length === 1) {
			// on a case sensitive filesystem we cannot determine here, whether the file exists or not, hence we need the 'file exists' precondition
			const prefix = realpathSync(dir);   // recurse
			if (prefix) {
				return paths.join(prefix, found[0]);
			}
		} else if (found.length > 1) {
			// must be a case sensitive $filesystem
			const ix = found.indexOf(name);
			if (ix >= 0) {	// case sensitive
				const prefix = realpathSync(dir);   // recurse
				if (prefix) {
					return paths.join(prefix, found[ix]);
				}
			}
		}
	} catch (error) {
		// silently ignore error
	}

	return null;
}