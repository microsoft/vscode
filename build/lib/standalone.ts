/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import * as tss from './treeshaking';

const REPO_ROOT = path.join(__dirname, '../../');
const SRC_DIR = path.join(REPO_ROOT, 'src');

const dirCache: { [dir: string]: boolean } = {};

function writeFile(filePath: string, contents: Buffer | string): void {
	function ensureDirs(dirPath: string): void {
		if (dirCache[dirPath]) {
			return;
		}
		dirCache[dirPath] = true;

		ensureDirs(path.dirname(dirPath));
		if (fs.existsSync(dirPath)) {
			return;
		}
		fs.mkdirSync(dirPath);
	}
	ensureDirs(path.dirname(filePath));
	fs.writeFileSync(filePath, contents);
}

export function extractEditor(options: tss.ITreeShakingOptions & { destRoot: string; tsOutDir: string }): void {
	const ts = require('typescript') as typeof import('typescript');

	const tsConfig = JSON.parse(fs.readFileSync(path.join(options.sourcesRoot, 'tsconfig.monaco.json')).toString());
	let compilerOptions: { [key: string]: any };
	if (tsConfig.extends) {
		compilerOptions = Object.assign({}, require(path.join(options.sourcesRoot, tsConfig.extends)).compilerOptions, tsConfig.compilerOptions);
		delete tsConfig.extends;
	} else {
		compilerOptions = tsConfig.compilerOptions;
	}
	tsConfig.compilerOptions = compilerOptions;
	tsConfig.compilerOptions.sourceMap = true;
	tsConfig.compilerOptions.module = 'es2022';
	tsConfig.compilerOptions.outDir = options.tsOutDir;

	compilerOptions.noEmit = false;
	compilerOptions.noUnusedLocals = false;
	compilerOptions.preserveConstEnums = false;
	compilerOptions.declaration = false;
	compilerOptions.moduleResolution = ts.ModuleResolutionKind.Classic;


	options.compilerOptions = compilerOptions;

	console.log(`Running tree shaker with shakeLevel ${tss.toStringShakeLevel(options.shakeLevel)}`);

	// Take the extra included .d.ts files from `tsconfig.monaco.json`
	options.typings = (<string[]>tsConfig.include).filter(includedFile => /\.d\.ts$/.test(includedFile));

	// Add extra .d.ts files from `node_modules/@types/`
	if (Array.isArray(options.compilerOptions?.types)) {
		options.compilerOptions.types.forEach((type: string) => {
			if (type === '@webgpu/types') {
				options.typings.push(`../node_modules/${type}/dist/index.d.ts`);
			} else {
				options.typings.push(`../node_modules/@types/${type}/index.d.ts`);
			}
		});
	}

	const result = tss.shake(options);
	for (const fileName in result) {
		if (result.hasOwnProperty(fileName)) {
			writeFile(path.join(options.destRoot, fileName), result[fileName]);
		}
	}
	const copied: { [fileName: string]: boolean } = {};
	const copyFile = (fileName: string) => {
		if (copied[fileName]) {
			return;
		}
		copied[fileName] = true;
		const srcPath = path.join(options.sourcesRoot, fileName);
		const dstPath = path.join(options.destRoot, fileName);
		writeFile(dstPath, fs.readFileSync(srcPath));
	};
	const writeOutputFile = (fileName: string, contents: string | Buffer) => {
		writeFile(path.join(options.destRoot, fileName), contents);
	};
	for (const fileName in result) {
		if (result.hasOwnProperty(fileName)) {
			const fileContents = result[fileName];
			const info = ts.preProcessFile(fileContents);

			for (let i = info.importedFiles.length - 1; i >= 0; i--) {
				const importedFileName = info.importedFiles[i].fileName;

				let importedFilePath = importedFileName;
				if (/(^\.\/)|(^\.\.\/)/.test(importedFilePath)) {
					importedFilePath = path.join(path.dirname(fileName), importedFilePath);
				}

				if (/\.css$/.test(importedFilePath)) {
					transportCSS(importedFilePath, copyFile, writeOutputFile);
				} else {
					const pathToCopy = path.join(options.sourcesRoot, importedFilePath);
					if (fs.existsSync(pathToCopy) && !fs.statSync(pathToCopy).isDirectory()) {
						copyFile(importedFilePath);
					}
				}
			}
		}
	}

	delete tsConfig.compilerOptions.moduleResolution;
	writeOutputFile('tsconfig.json', JSON.stringify(tsConfig, null, '\t'));

	[
		'vs/loader.js'
	].forEach(copyFile);
}

function transportCSS(module: string, enqueue: (module: string) => void, write: (path: string, contents: string | Buffer) => void): boolean {

	if (!/\.css/.test(module)) {
		return false;
	}

	const filename = path.join(SRC_DIR, module);
	const fileContents = fs.readFileSync(filename).toString();
	const inlineResources = 'base64'; // see https://github.com/microsoft/monaco-editor/issues/148

	const newContents = _rewriteOrInlineUrls(fileContents, inlineResources === 'base64');
	write(module, newContents);
	return true;

	function _rewriteOrInlineUrls(contents: string, forceBase64: boolean): string {
		return _replaceURL(contents, (url) => {
			const fontMatch = url.match(/^(.*).ttf\?(.*)$/);
			if (fontMatch) {
				const relativeFontPath = `${fontMatch[1]}.ttf`; // trim the query parameter
				const fontPath = path.join(path.dirname(module), relativeFontPath);
				enqueue(fontPath);
				return relativeFontPath;
			}

			const imagePath = path.join(path.dirname(module), url);
			const fileContents = fs.readFileSync(path.join(SRC_DIR, imagePath));
			const MIME = /\.svg$/.test(url) ? 'image/svg+xml' : 'image/png';
			let DATA = ';base64,' + fileContents.toString('base64');

			if (!forceBase64 && /\.svg$/.test(url)) {
				// .svg => url encode as explained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
				const newText = fileContents.toString()
					.replace(/"/g, '\'')
					.replace(/</g, '%3C')
					.replace(/>/g, '%3E')
					.replace(/&/g, '%26')
					.replace(/#/g, '%23')
					.replace(/\s+/g, ' ');
				const encodedData = ',' + newText;
				if (encodedData.length < DATA.length) {
					DATA = encodedData;
				}
			}
			return '"data:' + MIME + DATA + '"';
		});
	}

	function _replaceURL(contents: string, replacer: (url: string) => string): string {
		// Use ")" as the terminator as quotes are oftentimes not used at all
		return contents.replace(/url\(\s*([^\)]+)\s*\)?/g, (_: string, ...matches: string[]) => {
			let url = matches[0];
			// Eliminate starting quotes (the initial whitespace is not captured)
			if (url.charAt(0) === '"' || url.charAt(0) === '\'') {
				url = url.substring(1);
			}
			// The ending whitespace is captured
			while (url.length > 0 && (url.charAt(url.length - 1) === ' ' || url.charAt(url.length - 1) === '\t')) {
				url = url.substring(0, url.length - 1);
			}
			// Eliminate ending quotes
			if (url.charAt(url.length - 1) === '"' || url.charAt(url.length - 1) === '\'') {
				url = url.substring(0, url.length - 1);
			}

			if (!_startsWith(url, 'data:') && !_startsWith(url, 'http://') && !_startsWith(url, 'https://')) {
				url = replacer(url);
			}

			return 'url(' + url + ')';
		});
	}

	function _startsWith(haystack: string, needle: string): boolean {
		return haystack.length >= needle.length && haystack.substr(0, needle.length) === needle;
	}
}
