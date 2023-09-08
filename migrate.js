/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const util = require('./util');
// @ts-ignore
const watch = require('./build/lib/watch/index');

const srcFolder = path.join(__dirname, 'src');
const dstFolder = path.join(__dirname, 'src2');

const binaryFileExtensions = new Set([
	'.svg', '.ttf', '.png', '.sh', '.html', '.json', '.zsh', '.scpt', '.mp3', '.fish', '.ps1', '.md', '.txt', '.zip', '.pdf', '.qwoff', '.jxs', '.tst', '.wuff', '.less', '.utf16le'
]);

function migrate() {
	console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`);
	console.log(`STARTING MIGRATION of src to src2.`);

	// installing watcher quickly to avoid missing early events
	const watchSrc = watch('src/**', { base: 'src', readDelay: 200 });

	/** @type {string[]} */
	const files = [];
	util.readdir(path.join(__dirname, 'src'), files);

	for (const filePath of files) {
		const fileContents = fs.readFileSync(filePath);
		migrateOne(filePath, fileContents);
	}

	fs.writeFileSync(path.join(dstFolder, 'vs', 'package.json'), `{"type": "module"}`);
	fs.writeFileSync(path.join(dstFolder, '.gitignore'), `*`);

	console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`);
	console.log(`COMPLETED MIGRATION of src to src2. You can now launch yarn watch or yarn watch-client`);
	console.log(`WATCHING src for changes...`);

	watchSrc.on('data', (e) => {
		migrateOne(e.path, e.contents);
		console.log(`Handled change event for ${e.path}.`);
	});
}

/**
 * @param {string} filePath
 * @param {Buffer} fileContents
 */
function migrateOne(filePath, fileContents) {
	const fileExtension = path.extname(filePath);

	if (fileExtension === '.ts') {
		migrateTS(filePath, fileContents.toString());
	} else if (fileExtension === '.js' || fileExtension === '.cjs') {
		if (
			filePath.endsWith('vs/base/common/performance.js')
			|| filePath.endsWith('vs/platform/environment/node/userDataPath.js')
			|| filePath.endsWith('vs/base/common/stripComments.js')
			|| filePath.endsWith('vs/base/node/languagePacks.js')
			|| filePath.endsWith('vs/base/node/unc.js')
		) {
			// Create .cjs duplicates of these files
			const cjsFilePath = filePath.replace(/\.js$/, '.cjs');
			const cjsFileContents = fileContents.toString().replace(`require('../common/performance')`, `require('../common/performance.cjs')`);
			writeDestFile(cjsFilePath, cjsFileContents);
			writeDestFile(filePath, fileContents.toString());
		} else if (
			filePath.endsWith('vs/base/parts/sandbox/electron-sandbox/preload.js')
		) {
			// Rename to .cjs
			const cjsFilePath = filePath.replace(/\.js$/, '.cjs');
			writeDestFile(cjsFilePath, fileContents);
		} else if (
			filePath.endsWith('vs/loader.js')
		) {
			// fake loader
			writeDestFile(filePath, `(function () {
	if (typeof require !== 'undefined') {
		return;
	}
	globalThis.require = function () {
		console.trace('[require(...)] this is ESM, no more AMD/CJS require');
	};
	globalThis.require.config = function () {
		console.trace('[require.config(...)] this is ESM, no more AMD/CJS require');
	};
})();`);

		} else {
			writeDestFile(filePath, fileContents);
		}
	} else if (fileExtension === '.mjs') {
		writeDestFile(filePath, fileContents);
	} else if (fileExtension === '.css') {
		writeDestFile(filePath, fileContents);
	} else if (filePath.endsWith('tsconfig.base.json')) {
		const opts = JSON.parse(fileContents.toString());
		opts.compilerOptions.module = 'ESNext';
		opts.compilerOptions.allowSyntheticDefaultImports = true;
		writeDestFile(filePath, JSON.stringify(opts, null, '\t'));
	} else if (binaryFileExtensions.has(fileExtension)) {
		writeDestFile(filePath, fileContents);
	} else {
		console.log(`ignoring ${filePath}`);
	}
}

/**
 * @param {string} fileContents
 * @typedef {{pos:number;end:number;}} Import
 * @return {Import[]}
 */
function discoverImports(fileContents) {
	const info = ts.preProcessFile(fileContents);
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
 * @param {string} filePath
 * @param {string} fileContents
 */
function migrateTS(filePath, fileContents) {
	if (filePath.endsWith('.d.ts') || filePath.includes('/typings-esm/')) {
		return writeDestFile(filePath, fileContents);
	}

	// fileContents = patchCSSImportsAdoptedStyleSheet(filePath, fileContents);
	// fileContents = patchFileAccess(filePath, fileContents);

	const imports = discoverImports(fileContents);
	/** @type {Replacement[]} */
	let replacements = [];
	for (let i = imports.length - 1; i >= 0; i--) {
		const pos = imports[i].pos + 1;
		const end = imports[i].end + 1;
		const importedFilename = fileContents.substring(pos, end);

		/** @type {string} */
		let importedFilepath;
		if (/^vs\/css!/.test(importedFilename)) {
			importedFilepath = importedFilename.substr('vs/css!'.length) + '.css';
		} else {
			importedFilepath = importedFilename;
		}

		// list of node modules that we swap out for ESM-AMD magic files
		// to some guess for what files endup in the shared process
		if (!filePath.includes('vs/workbench/') && !filePath.includes('vs/editor/')) {
			const monacoNodeModules = new Set([
				'child_process', // inside worker of shared process
				'console', // inside worker of shared process
			]);
			if (monacoNodeModules.has(importedFilename)) {
				importedFilepath = `vs/base/node/typings-esm/${importedFilename}`;
			}
		}

		if (
			importedFilepath === 'electron'
			&& !filePath.endsWith('vs/base/electron-main/electron.ts')
			&& !filePath.endsWith('vs/base/electron-browser/electron.ts')
		) {
			if (/electron-main/.test(filePath)) {
				importedFilepath = 'vs/base/electron-main/electron';
			} else if (/electron-browser/.test(filePath)) {
				importedFilepath = 'vs/base/electron-browser/electron';
			} else {
				importedFilepath = 'electron';
			}
		}

		/** @type {boolean} */
		let isRelativeImport;
		if (/(^\.\/)|(^\.\.\/)/.test(importedFilepath)) {
			importedFilepath = path.join(path.dirname(filePath), importedFilepath);
			isRelativeImport = true;
		} else if (/^vs\//.test(importedFilepath)) {
			importedFilepath = path.join(srcFolder, importedFilepath);
			isRelativeImport = true;
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

	replacements = replacements.concat(rewriteDefaultImports(fileContents));

	fileContents = applyReplacements(fileContents, replacements);

	fileContents = fileContents.replace(/require\.__\$__nodeRequire/g, 'require');


	writeDestFile(filePath, fileContents);
}

/**
 * @param {string} filePath
 * @param {string} importedFilepath
 */
function generateRelativeImport(filePath, importedFilepath) {
	/** @type {string} */
	let relativePath;
	// See https://github.com/microsoft/TypeScript/issues/16577#issuecomment-754941937
	if (!importedFilepath.endsWith('.css') && !importedFilepath.endsWith('.cjs')) {
		importedFilepath = `${importedFilepath}.js`;
	}
	relativePath = path.relative(path.dirname(filePath), `${importedFilepath}`);
	relativePath = relativePath.replace(/\\/g, '/');
	if (!/(^\.\/)|(^\.\.\/)/.test(relativePath)) {
		relativePath = './' + relativePath;
	}
	return relativePath;
}

/**
 * @param {string} fileContents
 */
function rewriteDefaultImports(fileContents) {
	const imports = new Set([
		'assert',
		'minimist',
		'sinon-test',
	]);
	const search = /(import )(\* as )\w+ from ['"]([^'"]+)['"];/g;
	/** @type {Replacement[]} */
	const replacements = [];
	do {
		const m = search.exec(fileContents);
		if (!m) {
			break;
		}
		const pos = m.index + m[1].length;
		const end = pos + m[2].length;
		const importText = m[3];
		if (imports.has(importText)) {
			replacements.push({ pos, end, text: `` });
		}
	} while (true);

	return replacements;
}

/**
 * @param {string} filePath
 * @param {string} fileContents
 */
function patchCSSImportsAdoptedStyleSheet(filePath, fileContents) {
	const search = /import ['"]vs\/css!([^'"]+)['"];/g;
	let lastUsedVariable = 0;
	let lastImportPos = -1;
	/** @type {Replacement[]} */
	const replacements = [];
	do {
		const m = search.exec(fileContents);
		if (!m) {
			break;
		}

		const pos = m.index;
		const end = pos + m[0].length;

		const variableName = ++lastUsedVariable === 1 ? 'sheet' : `sheet_${lastUsedVariable}`;
		replacements.push({ pos, end, text: `import ${variableName} from '${m[1]}.css' assert { type: 'css' };` });

		if (lastImportPos === -1) {
			lastImportPos = findLastImportPosition(fileContents);
		}
		replacements.push({ pos: lastImportPos + 1, end: lastImportPos + 1, text: `registerStyleSheet(${variableName});\n` });
	} while (true);

	if (replacements.length > 0) {
		const firstImportStart = findFirstImportPosition(fileContents);
		const cssModuleRelativePath = path.relative(path.dirname(filePath), path.join(__dirname, 'src/vs/base/browser/css')).replace(/\\/g, '/');
		replacements.unshift({ pos: firstImportStart, end: firstImportStart, text: `import { registerStyleSheet } from '${cssModuleRelativePath}';\n` });
	}

	fileContents = applyReplacements(fileContents, replacements);

	return fileContents;
}

/**
 * @param {string} fileContents
 */
function findFirstImportPosition(fileContents) {
	const search = /import (([^']* from '[^']+')|('[^']+'));/g;
	do {
		const m = search.exec(fileContents);
		if (m) {
			return m.index;
		}
		return 0;
	} while (true);
}

/**
 * @param {string} fileContents
 */
function findLastImportPosition(fileContents) {
	const search = /import (([^']* from '[^']+')|('[^']+'));/g;
	let lastImportEnd = 0;
	do {
		const m = search.exec(fileContents);
		if (!m) {
			break;
		}
		lastImportEnd = m.index + m[0].length;
	} while (true);

	return lastImportEnd;
}

/** @typedef {{pos:number;end:number;text:string;}} Replacement */

/**
 * @param {string} str
 * @param {Replacement[]} replacements
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
 * @param {string} srcFilePath
 * @param {string | Buffer} fileContents
 */
function writeDestFile(srcFilePath, fileContents) {
	const destFilePath = srcFilePath.replace(srcFolder, dstFolder);
	util.ensureDir(path.dirname(destFilePath));

	if (/(\.ts$)|(\.js$)|(\.html$)/.test(destFilePath)) {
		fileContents = toggleComments(fileContents);
	}

	/** @type {Buffer | undefined} */
	let existingFileContents = undefined;
	try {
		existingFileContents = fs.readFileSync(destFilePath);
	} catch (err) { }
	if (!buffersAreEqual(existingFileContents, fileContents)) {
		fs.writeFileSync(destFilePath, fileContents);
	}

	/**
	 * @param {string|Buffer} fileContents
	 */
	function toggleComments(fileContents) {
		const lines = String(fileContents).split(/\r\n|\r|\n/);
		let mode = 0;
		let didChange = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (mode === 0) {
				if (/\/\/ ESM-comment-begin/.test(line)) {
					mode = 1;
					continue;
				}
				if (/\/\/ ESM-uncomment-begin/.test(line)) {
					mode = 2;
					continue;
				}
				continue;
			}

			if (mode === 1) {
				if (/\/\/ ESM-comment-end/.test(line)) {
					mode = 0;
					continue;
				}
				didChange = true;
				lines[i] = '// ' + line;
				continue;
			}

			if (mode === 2) {
				if (/\/\/ ESM-uncomment-end/.test(line)) {
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
 * @param {Buffer | undefined} existingFileContents
 * @param {Buffer | string} fileContents
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

migrate();
