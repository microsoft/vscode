/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

// *****************************************************************
// *                                                               *
// *               AMD-TO-ESM MIGRATION SCRIPT                     *
// *                                                               *
// *****************************************************************

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { preProcessFile } from 'typescript';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'node:url';

// @ts-expect-error
import watch from './build/lib/watch/index.js';

const enableWatching = !process.argv.includes('--disable-watch');
const enableInPlace = process.argv.includes('--enable-in-place');
const esmToAmd = process.argv.includes('--enable-esm-to-amd');
const amdToEsm = !esmToAmd;

const srcFolder = fileURLToPath(new URL('src', import.meta.url));
const dstFolder = fileURLToPath(new URL(enableInPlace ? 'src' : 'src2', import.meta.url));

const binaryFileExtensions = new Set([
	'.svg', '.ttf', '.png', '.sh', '.html', '.json', '.zsh', '.scpt', '.mp3', '.fish', '.ps1', '.psm1', '.md', '.txt', '.zip', '.pdf', '.qwoff', '.jxs', '.tst', '.wuff', '.less', '.utf16le', '.snap', '.actual', '.tsx', '.scm'
]);

function migrate() {
	console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`);
	console.log(`STARTING ${amdToEsm ? 'AMD->ESM' : 'ESM->AMD'} MIGRATION of ${enableInPlace ? 'src in-place' : 'src to src2'}.`);

	// installing watcher quickly to avoid missing early events
	const watchSrc = enableWatching ? watch('src/**', { base: 'src', readDelay: 200 }) : undefined;

	/** @type {string[]} */
	const files = [];
	readdir(srcFolder, files);

	for (const filePath of files) {
		const fileContents = readFileSync(filePath);
		migrateOne(filePath, fileContents);
	}

	if (amdToEsm) {
		writeFileSync(join(dstFolder, 'package.json'), `{"type": "module"}`);
	} else {
		unlinkSync(join(dstFolder, 'package.json'));
	}

	if (!enableInPlace) {
		writeFileSync(join(dstFolder, '.gitignore'), `*`);
	}

	console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`);
	console.log(`COMPLETED ${amdToEsm ? 'AMD->ESM' : 'ESM->AMD'} MIGRATION of ${enableInPlace ? 'src in-place' : 'src to src2'}. You can now launch yarn watch-esm or yarn watch-client-esm`);
	if (amdToEsm) {
		console.log(`Make sure to set the environment variable VSCODE_BUILD_ESM to a string of value 'true' if you want to build VS Code`);
	}

	if (watchSrc) {
		console.log(`WATCHING src for changes...`);

		watchSrc.on('data', (e) => {
			migrateOne(e.path, e.contents);
			console.log(`Handled change event for ${e.path}.`);
		});
	}
}

/**
 * @param filePath
 * @param fileContents
 */
function migrateOne(filePath, fileContents) {
	const fileExtension = extname(filePath);

	if (fileExtension === '.ts') {
		migrateTS(filePath, fileContents.toString());
	} else if (filePath.endsWith('tsconfig.base.json')) {
		const opts = JSON.parse(fileContents.toString());
		if (amdToEsm) {
			opts.compilerOptions.module = 'es2022';
			opts.compilerOptions.allowSyntheticDefaultImports = true;
		} else {
			opts.compilerOptions.module = 'amd';
			delete opts.compilerOptions.allowSyntheticDefaultImports;
		}
		writeDestFile(filePath, JSON.stringify(opts, null, '\t'));
	} else if (fileExtension === '.js' || fileExtension === '.cjs' || fileExtension === '.mjs' || fileExtension === '.css' || binaryFileExtensions.has(fileExtension)) {
		writeDestFile(filePath, fileContents);
	} else {
		console.log(`ignoring ${filePath}`);
	}
}

/**
 * @param fileContents
 * @typedef {{pos:number;end:number;}} Import
 * @return
 */
function discoverImports(fileContents) {
	const info = preProcessFile(fileContents);
	const search = /export .* from ['"]([^'"]+)['"]/g;
	/** typedef {Import[]} */
	let result = [];
	do {
		const m = search.exec(fileContents);
		if (!m) {
			break;
		}
		const end = m.index + m[0].length - 2;
		const pos = end - m[1].length;
		result.push({ pos, end });
	} while (true);

	result = result.concat(info.importedFiles);

	result.sort((a, b) => {
		return a.pos - b.pos;
	});
	for (let i = 1; i < result.length; i++) {
		const prev = result[i - 1];
		const curr = result[i];
		if (prev.pos === curr.pos) {
			result.splice(i, 1);
			i--;
		}
	}
	return result;
}

/**
 * @param filePath
 * @param fileContents
 */
function migrateTS(filePath, fileContents) {
	if (filePath.endsWith('.d.ts')) {
		return writeDestFile(filePath, fileContents);
	}

	const imports = discoverImports(fileContents);
	/** @type {Replacement[]} */
	const replacements = [];
	for (let i = imports.length - 1; i >= 0; i--) {
		const pos = imports[i].pos + 1;
		const end = imports[i].end + 1;
		const importedFilename = fileContents.substring(pos, end);

		/** @type {string|undefined} */
		let importedFilepath = undefined;
		if (amdToEsm) {
			if (/^vs\/css!/.test(importedFilename)) {
				importedFilepath = importedFilename.substr('vs/css!'.length) + '.css';
			} else {
				importedFilepath = importedFilename;
			}
		} else {
			if (importedFilename.endsWith('.css')) {
				importedFilepath = `vs/css!${importedFilename.substr(0, importedFilename.length - 4)}`;
			} else if (importedFilename.endsWith('.js')) {
				importedFilepath = importedFilename.substr(0, importedFilename.length - 3);
			}
		}

		if (typeof importedFilepath !== 'string') {
			continue;
		}

		/** @type {boolean} */
		let isRelativeImport;
		if (amdToEsm) {
			if (/(^\.\/)|(^\.\.\/)/.test(importedFilepath)) {
				importedFilepath = join(dirname(filePath), importedFilepath);
				isRelativeImport = true;
			} else if (/^vs\//.test(importedFilepath)) {
				importedFilepath = join(srcFolder, importedFilepath);
				isRelativeImport = true;
			} else {
				importedFilepath = importedFilepath;
				isRelativeImport = false;
			}
		} else {
			importedFilepath = importedFilepath;
			isRelativeImport = false;
		}

		/** @type {string} */
		let replacementImport;

		if (isRelativeImport) {
			replacementImport = generateRelativeImport(filePath, importedFilepath);
		} else {
			replacementImport = importedFilepath;
		}

		replacements.push({ pos, end, text: replacementImport });
	}

	fileContents = applyReplacements(fileContents, replacements);

	writeDestFile(filePath, fileContents);
}

/**
 * @param filePath
 * @param importedFilepath
 */
function generateRelativeImport(filePath, importedFilepath) {
	/** @type {string} */
	let relativePath;
	// See https://github.com/microsoft/TypeScript/issues/16577#issuecomment-754941937
	if (!importedFilepath.endsWith('.css') && !importedFilepath.endsWith('.cjs')) {
		importedFilepath = `${importedFilepath}.js`;
	}
	relativePath = relative(dirname(filePath), `${importedFilepath}`);
	relativePath = relativePath.replace(/\\/g, '/');
	if (!/(^\.\/)|(^\.\.\/)/.test(relativePath)) {
		relativePath = './' + relativePath;
	}
	return relativePath;
}

/** @typedef {{pos:number;end:number;text:string;}} Replacement */

/**
 * @param str
 * @param replacements
 */
function applyReplacements(str, replacements) {
	replacements.sort((a, b) => {
		return a.pos - b.pos;
	});

	/** @type {string[]} */
	const result = [];
	let lastEnd = 0;
	for (const replacement of replacements) {
		const { pos, end, text } = replacement;
		result.push(str.substring(lastEnd, pos));
		result.push(text);
		lastEnd = end;
	}
	result.push(str.substring(lastEnd, str.length));
	return result.join('');
}

/**
 * @param srcFilePath
 * @param fileContents
 */
function writeDestFile(srcFilePath, fileContents) {
	const destFilePath = srcFilePath.replace(srcFolder, dstFolder);
	ensureDir(dirname(destFilePath));

	if (/(\.ts$)|(\.js$)|(\.html$)/.test(destFilePath)) {
		fileContents = toggleComments(fileContents);
	}

	/** @type {Buffer | undefined} */
	let existingFileContents = undefined;
	try {
		existingFileContents = readFileSync(destFilePath);
	} catch (err) { }
	if (!buffersAreEqual(existingFileContents, fileContents)) {
		writeFileSync(destFilePath, fileContents);
	}

	/**
	 * @param fileContents
	 */
	function toggleComments(fileContents) {
		const lines = String(fileContents).split(/\r\n|\r|\n/);
		let mode = 0;
		let didChange = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (mode === 0) {
				if (amdToEsm ? /\/\/ ESM-comment-begin/.test(line) : /\/\/ ESM-uncomment-begin/.test(line)) {
					mode = 1;
					continue;
				}
				if (amdToEsm ? /\/\/ ESM-uncomment-begin/.test(line) : /\/\/ ESM-comment-begin/.test(line)) {
					mode = 2;
					continue;
				}
				continue;
			}

			if (mode === 1) {
				if (amdToEsm ? /\/\/ ESM-comment-end/.test(line) : /\/\/ ESM-uncomment-end/.test(line)) {
					mode = 0;
					continue;
				}
				didChange = true;
				lines[i] = line.replace(/^\s*/, (match) => match + '// ');
				continue;
			}

			if (mode === 2) {
				if (amdToEsm ? /\/\/ ESM-uncomment-end/.test(line) : /\/\/ ESM-comment-end/.test(line)) {
					mode = 0;
					continue;
				}
				didChange = true;
				lines[i] = line.replace(/^(\s*)\/\/ ?/, function (_, indent) {
					return indent;
				});
			}
		}

		if (didChange) {
			return lines.join('\n');
		}
		return fileContents;
	}
}

/**
 * @param existingFileContents
 * @param fileContents
 */
function buffersAreEqual(existingFileContents, fileContents) {
	if (!existingFileContents) {
		return false;
	}
	if (typeof fileContents === 'string') {
		fileContents = Buffer.from(fileContents);
	}
	return existingFileContents.equals(fileContents);
}

const ensureDirCache = new Set();
function ensureDir(dirPath) {
	if (ensureDirCache.has(dirPath)) {
		return;
	}
	ensureDirCache.add(dirPath);
	ensureDir(dirname(dirPath));
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath);
	}
}

function readdir(dirPath, result) {
	const entries = readdirSync(dirPath);
	for (const entry of entries) {
		const entryPath = join(dirPath, entry);
		const stat = statSync(entryPath);
		if (stat.isDirectory()) {
			readdir(join(dirPath, entry), result);
		} else {
			result.push(entryPath);
		}
	}
}

migrate();
