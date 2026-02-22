/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import lazy from 'lazy.js';
import eventStream from 'event-stream';
import File from 'vinyl';
import sm from 'source-map';
import path from 'path';
import sort from 'gulp-sort';
import { type ISpan, analyzeLocalizeCalls, TextModel, parseLocalizeKeyOrValue } from './nls-analysis.ts';

type FileWithSourcemap = File & { sourceMap: sm.RawSourceMap };

/**
 * Returns a stream containing the patched JavaScript and source maps.
 */
export function nls(options: { preserveEnglish: boolean }): NodeJS.ReadWriteStream {
	let base: string;
	const input = eventStream.through();
	const output = input
		.pipe(sort()) // IMPORTANT: to ensure stable NLS metadata generation, we must sort the files because NLS messages are globally extracted and indexed across all files
		.pipe(eventStream.through(function (f: FileWithSourcemap) {
			if (!f.sourceMap) {
				return this.emit('error', new Error(`File ${f.relative} does not have sourcemaps.`));
			}

			let source = f.sourceMap.sources[0];
			if (!source) {
				return this.emit('error', new Error(`File ${f.relative} does not have a source in the source map.`));
			}

			const root = f.sourceMap.sourceRoot;
			if (root) {
				source = path.join(root, source);
			}

			const typescript = f.sourceMap.sourcesContent![0];
			if (!typescript) {
				return this.emit('error', new Error(`File ${f.relative} does not have the original content in the source map.`));
			}

			base = f.base;
			this.emit('data', _nls.patchFile(f, typescript, options));
		}, function () {
			for (const file of [
				new File({
					contents: Buffer.from(JSON.stringify({
						keys: _nls.moduleToNLSKeys,
						messages: _nls.moduleToNLSMessages,
					}, null, '\t')),
					base,
					path: `${base}/nls.metadata.json`
				}),
				new File({
					contents: Buffer.from(JSON.stringify(_nls.allNLSMessages)),
					base,
					path: `${base}/nls.messages.json`
				}),
				new File({
					contents: Buffer.from(JSON.stringify(_nls.allNLSModulesAndKeys)),
					base,
					path: `${base}/nls.keys.json`
				}),
				new File({
					contents: Buffer.from(`/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
globalThis._VSCODE_NLS_MESSAGES=${JSON.stringify(_nls.allNLSMessages)};`),
					base,
					path: `${base}/nls.messages.js`
				})
			]) {
				this.emit('data', file);
			}

			this.emit('end');
		}));

	return eventStream.duplex(input, output);
}

const _nls = (() => {

	const moduleToNLSKeys: { [name: string /* module ID */]: ILocalizeKey[] /* keys */ } = {};
	const moduleToNLSMessages: { [name: string /* module ID */]: string[] /* messages */ } = {};
	const allNLSMessages: string[] = [];
	const allNLSModulesAndKeys: Array<[string /* module ID */, string[] /* keys */]> = [];
	let allNLSMessagesIndex = 0;

	type ILocalizeKey = string | { key: string }; // key might contain metadata for translators and then is not just a string

	interface INlsPatchResult {
		javascript: string;
		sourcemap: sm.RawSourceMap;
		nlsMessages?: string[];
		nlsKeys?: ILocalizeKey[];
	}

	interface IPatch {
		span: ISpan;
		content: string;
	}

	function fileFrom(file: File, contents: string, path: string = file.path) {
		return new File({
			contents: Buffer.from(contents),
			base: file.base,
			cwd: file.cwd,
			path: path
		});
	}

	function mappedPositionFrom(source: string, lc: ts.LineAndCharacter): sm.MappedPosition {
		return { source, line: lc.line + 1, column: lc.character };
	}

	function lcFrom(position: sm.Position): ts.LineAndCharacter {
		return { line: position.line - 1, character: position.column };
	}

	function patchJavascript(patches: IPatch[], contents: string): string {
		const model = new TextModel(contents);

		// patch the localize calls
		lazy(patches).reverse().each(p => model.apply(p.span, p.content));

		return model.toString();
	}

	function patchSourcemap(patches: IPatch[], rsm: sm.RawSourceMap, smc: sm.SourceMapConsumer): sm.RawSourceMap {
		const smg = new sm.SourceMapGenerator({
			file: rsm.file,
			sourceRoot: rsm.sourceRoot
		});

		patches = patches.reverse();
		let currentLine = -1;
		let currentLineDiff = 0;
		let source: string | null = null;

		smc.eachMapping(m => {
			const patch = patches[patches.length - 1];
			const original = { line: m.originalLine, column: m.originalColumn };
			const generated = { line: m.generatedLine, column: m.generatedColumn };

			if (currentLine !== generated.line) {
				currentLineDiff = 0;
			}

			currentLine = generated.line;
			generated.column += currentLineDiff;

			if (patch && m.generatedLine - 1 === patch.span.end.line && m.generatedColumn === patch.span.end.character) {
				const originalLength = patch.span.end.character - patch.span.start.character;
				const modifiedLength = patch.content.length;
				const lengthDiff = modifiedLength - originalLength;
				currentLineDiff += lengthDiff;
				generated.column += lengthDiff;

				patches.pop();
			}

			source = rsm.sourceRoot ? path.relative(rsm.sourceRoot, m.source) : m.source;
			source = source.replace(/\\/g, '/');
			smg.addMapping({ source, name: m.name, original, generated });
		}, null, sm.SourceMapConsumer.GENERATED_ORDER);

		if (source) {
			smg.setSourceContent(source, smc.sourceContentFor(source));
		}

		return JSON.parse(smg.toString());
	}

	function patch(typescript: string, javascript: string, sourcemap: sm.RawSourceMap, options: { preserveEnglish: boolean }): INlsPatchResult {
		const localizeCalls = analyzeLocalizeCalls(typescript, 'localize');
		const localize2Calls = analyzeLocalizeCalls(typescript, 'localize2');

		if (localizeCalls.length === 0 && localize2Calls.length === 0) {
			return { javascript, sourcemap };
		}

		const nlsKeys = localizeCalls.map(lc => parseLocalizeKeyOrValue(lc.key)).concat(localize2Calls.map(lc => parseLocalizeKeyOrValue(lc.key)));
		const nlsMessages = localizeCalls.map(lc => parseLocalizeKeyOrValue(lc.value) as string).concat(localize2Calls.map(lc => parseLocalizeKeyOrValue(lc.value) as string));
		const smc = new sm.SourceMapConsumer(sourcemap);
		const positionFrom = mappedPositionFrom.bind(null, sourcemap.sources[0]);

		// build patches
		const toPatch = (c: { range: ISpan; content: string }): IPatch => {
			const start = lcFrom(smc.generatedPositionFor(positionFrom(c.range.start)));
			const end = lcFrom(smc.generatedPositionFor(positionFrom(c.range.end)));
			return { span: { start, end }, content: c.content };
		};

		const localizePatches = lazy(localizeCalls)
			.map(lc => (
				options.preserveEnglish ? [
					{ range: lc.keySpan, content: `${allNLSMessagesIndex++}` } 	// localize('key', "message") => localize(<index>, "message")
				] : [
					{ range: lc.keySpan, content: `${allNLSMessagesIndex++}` }, // localize('key', "message") => localize(<index>, null)
					{ range: lc.valueSpan, content: 'null' }
				]))
			.flatten()
			.map(toPatch);

		const localize2Patches = lazy(localize2Calls)
			.map(lc => (
				{ range: lc.keySpan, content: `${allNLSMessagesIndex++}` } // localize2('key', "message") => localize(<index>, "message")
			))
			.map(toPatch);

		// Sort patches by their start position
		const patches = localizePatches.concat(localize2Patches).toArray().sort((a, b) => {
			if (a.span.start.line < b.span.start.line) {
				return -1;
			} else if (a.span.start.line > b.span.start.line) {
				return 1;
			} else if (a.span.start.character < b.span.start.character) {
				return -1;
			} else if (a.span.start.character > b.span.start.character) {
				return 1;
			} else {
				return 0;
			}
		});

		javascript = patchJavascript(patches, javascript);

		sourcemap = patchSourcemap(patches, sourcemap, smc);

		return { javascript, sourcemap, nlsKeys, nlsMessages };
	}

	function patchFile(javascriptFile: File, typescript: string, options: { preserveEnglish: boolean }): File {
		// hack?
		const moduleId = javascriptFile.relative
			.replace(/\.js$/, '')
			.replace(/\\/g, '/');

		const { javascript, sourcemap, nlsKeys, nlsMessages } = patch(
			typescript,
			javascriptFile.contents!.toString(),
			javascriptFile.sourceMap,
			options
		);

		const result = fileFrom(javascriptFile, javascript);
		result.sourceMap = sourcemap;

		if (nlsKeys) {
			moduleToNLSKeys[moduleId] = nlsKeys;
			allNLSModulesAndKeys.push([moduleId, nlsKeys.map(nlsKey => typeof nlsKey === 'string' ? nlsKey : nlsKey.key)]);
		}

		if (nlsMessages) {
			moduleToNLSMessages[moduleId] = nlsMessages;
			allNLSMessages.push(...nlsMessages);
		}

		return result;
	}

	return {
		moduleToNLSKeys,
		moduleToNLSMessages,
		allNLSMessages,
		allNLSModulesAndKeys,
		patchFile
	};
})();
