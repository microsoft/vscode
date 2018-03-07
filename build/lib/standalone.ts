/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const OUT_EDITOR = path.join(REPO_ROOT, 'out-editor');

export interface IOptions {
	entryPoints: string[];
	outFolder: string;
	outResourcesFolder: string;
	redirects: { [module: string]: string; };
}

export function createESMSourcesAndResources(options: IOptions): void {
	const OUT_FOLDER = path.join(REPO_ROOT, options.outFolder);
	const OUT_RESOURCES_FOLDER = path.join(REPO_ROOT, options.outResourcesFolder);

	let in_queue: { [module: string]: boolean; } = Object.create(null);
	let queue: string[] = [];

	const enqueue = (module: string) => {
		if (in_queue[module]) {
			return;
		}
		in_queue[module] = true;
		queue.push(module);
	};

	const seenDir: { [key: string]: boolean; } = {};
	const createDirectoryRecursive = (dir: string) => {
		if (seenDir[dir]) {
			return;
		}

		let lastSlash = dir.lastIndexOf('/');
		if (lastSlash === -1) {
			lastSlash = dir.lastIndexOf('\\');
		}
		if (lastSlash !== -1) {
			createDirectoryRecursive(dir.substring(0, lastSlash));
		}
		seenDir[dir] = true;
		try { fs.mkdirSync(dir); } catch (err) { }
	};

	seenDir[REPO_ROOT] = true;

	const toggleComments = (fileContents: string) => {
		let lines = fileContents.split(/\r\n|\r|\n/);
		let mode = 0;
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
				lines[i] = '// ' + line;
				continue;
			}

			if (mode === 2) {
				if (/\/\/ ESM-uncomment-end/.test(line)) {
					mode = 0;
					continue;
				}
				lines[i] = line.replace(/^(\s*)\/\/ ?/, function (_, indent) {
					return indent;
				});
			}
		}

		return lines.join('\n');
	};

	const write = (filePath: string, contents: string | Buffer) => {
		let absoluteFilePath: string;
		if (/\.ts$/.test(filePath)) {
			absoluteFilePath = path.join(OUT_FOLDER, filePath);
		} else {
			absoluteFilePath = path.join(OUT_RESOURCES_FOLDER, filePath);
		}
		createDirectoryRecursive(path.dirname(absoluteFilePath));
		if (/(\.ts$)|(\.js$)/.test(filePath)) {
			contents = toggleComments(contents.toString());
		}
		fs.writeFileSync(absoluteFilePath, contents);
	};

	options.entryPoints.forEach((entryPoint) => enqueue(entryPoint));

	while (queue.length > 0) {
		const module = queue.shift();
		if (transportCSS(options, module, enqueue, write)) {
			continue;
		}
		if (transportResource(options, module, enqueue, write)) {
			continue;
		}
		if (transportDTS(options, module, enqueue, write)) {
			continue;
		}

		let filename: string;
		if (options.redirects[module]) {
			filename = path.join(SRC_DIR, options.redirects[module] + '.ts');
		} else {
			filename = path.join(SRC_DIR, module + '.ts');
		}
		let fileContents = fs.readFileSync(filename).toString();

		const info = ts.preProcessFile(fileContents);
		if (info.isLibFile) {
			console.log(`1. oh no, what does this mean!!!`);
		}
		if (info.typeReferenceDirectives.length > 0) {
			console.log(`2. oh no, what does this mean!!!`);
		}
		if (info.referencedFiles.length > 0) {
			console.log(`3. oh no, what does this mean!!!`);
		}

		for (let i = info.importedFiles.length - 1; i >= 0; i--) {
			const importedFilename = info.importedFiles[i].fileName;
			const pos = info.importedFiles[i].pos;
			const end = info.importedFiles[i].end;

			let importedFilepath: string;
			if (/^vs\/css!/.test(importedFilename)) {
				importedFilepath = importedFilename.substr('vs/css!'.length) + '.css';
			} else {
				importedFilepath = importedFilename;
			}
			if (/(^\.\/)|(^\.\.\/)/.test(importedFilepath)) {
				importedFilepath = path.join(path.dirname(module), importedFilepath);
			}

			enqueue(importedFilepath);

			let relativePath: string;
			if (importedFilepath === path.dirname(module)) {
				relativePath = '../' + path.basename(path.dirname(module));
			} else if (importedFilepath === path.dirname(path.dirname(module))) {
				relativePath = '../../' + path.basename(path.dirname(path.dirname(module)));
			} else {
				relativePath = path.relative(path.dirname(module), importedFilepath);
			}
			if (!/(^\.\/)|(^\.\.\/)/.test(relativePath)) {
				relativePath = './' + relativePath;
			}
			fileContents = (
				fileContents.substring(0, pos + 1)
				+ relativePath
				+ fileContents.substring(end + 1)
			);
		}

		fileContents = fileContents.replace(/import ([a-zA-z0-9]+) = require\(('[^']+')\);/g, function (_, m1, m2) {
			return `import * as ${m1} from ${m2};`;
		});
		fileContents = fileContents.replace(/Thenable/g, 'PromiseLike');

		write(module + '.ts', fileContents);
	}

	const esm_opts = {
		"compilerOptions": {
			"outDir": path.relative(path.dirname(OUT_FOLDER), OUT_RESOURCES_FOLDER),
			"rootDir": "src",
			"module": "es6",
			"target": "es5",
			"experimentalDecorators": true,
			"lib": [
				"dom",
				"es5",
				"es2015.collection",
				"es2015.promise"
			],
			"types": [
			]
		}
	};
	fs.writeFileSync(path.join(path.dirname(OUT_FOLDER), 'tsconfig.json'), JSON.stringify(esm_opts, null, '\t'));

	const monacodts = fs.readFileSync(path.join(SRC_DIR, 'vs/monaco.d.ts')).toString();
	fs.writeFileSync(path.join(OUT_FOLDER, 'vs/monaco.d.ts'), monacodts);

}

function transportCSS(options: IOptions, module: string, enqueue: (module: string) => void, write: (path: string, contents: string | Buffer) => void): boolean {

	if (!/\.css/.test(module)) {
		return false;
	}

	const filename = path.join(SRC_DIR, module);
	const fileContents = fs.readFileSync(filename).toString();
	const inlineResources = 'base64'; // see https://github.com/Microsoft/monaco-editor/issues/148
	const inlineResourcesLimit = 300000;//3000; // see https://github.com/Microsoft/monaco-editor/issues/336

	const newContents = _rewriteOrInlineUrls(filename, fileContents, inlineResources === 'base64', inlineResourcesLimit);
	write(module, newContents);
	return true;

	function _rewriteOrInlineUrls(originalFileFSPath: string, contents: string, forceBase64: boolean, inlineByteLimit: number): string {
		return _replaceURL(contents, (url) => {
			let imagePath = path.join(path.dirname(module), url);
			let fileContents = fs.readFileSync(path.join(SRC_DIR, imagePath));

			if (fileContents.length < inlineByteLimit) {
				const MIME = /\.svg$/.test(url) ? 'image/svg+xml' : 'image/png';
				let DATA = ';base64,' + fileContents.toString('base64');

				if (!forceBase64 && /\.svg$/.test(url)) {
					// .svg => url encode as explained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
					let newText = fileContents.toString()
						.replace(/"/g, '\'')
						.replace(/</g, '%3C')
						.replace(/>/g, '%3E')
						.replace(/&/g, '%26')
						.replace(/#/g, '%23')
						.replace(/\s+/g, ' ');
					let encodedData = ',' + newText;
					if (encodedData.length < DATA.length) {
						DATA = encodedData;
					}
				}
				return '"data:' + MIME + DATA + '"';
			}

			enqueue(imagePath);
			return url;
		});
	}

	function _replaceURL(contents: string, replacer: (url: string) => string): string {
		// Use ")" as the terminator as quotes are oftentimes not used at all
		return contents.replace(/url\(\s*([^\)]+)\s*\)?/g, (_: string, ...matches: string[]) => {
			var url = matches[0];
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

function transportResource(options: IOptions, module: string, enqueue: (module: string) => void, write: (path: string, contents: string | Buffer) => void): boolean {

	if (!/\.svg/.test(module)) {
		return false;
	}

	write(module, fs.readFileSync(path.join(SRC_DIR, module)));
	return true;
}

function transportDTS(options: IOptions, module: string, enqueue: (module: string) => void, write: (path: string, contents: string | Buffer) => void): boolean {

	if (options.redirects[module] && fs.existsSync(path.join(SRC_DIR, options.redirects[module] + '.ts'))) {
		return false;
	}

	if (!fs.existsSync(path.join(SRC_DIR, module + '.d.ts'))) {
		return false;
	}

	write(module + '.d.ts', fs.readFileSync(path.join(SRC_DIR, module + '.d.ts')));
	let filename: string;
	if (options.redirects[module]) {
		write(module + '.js', fs.readFileSync(path.join(SRC_DIR, options.redirects[module] + '.js')));
	} else {
		write(module + '.js', fs.readFileSync(path.join(SRC_DIR, module + '.js')));
	}
	return true;
}
