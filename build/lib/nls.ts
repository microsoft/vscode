/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as ts from 'typescript';
import * as lazy from 'lazy.js';
import { duplex, through } from 'event-stream';
import * as File from 'vinyl';
import * as sm from 'source-map';
import * as path from 'path';
import * as sort from 'gulp-sort';

declare class FileSourceMap extends File {
	public sourceMap: sm.RawSourceMap;
}

enum CollectStepResult {
	Yes,
	YesAndRecurse,
	No,
	NoAndRecurse
}

function collect(ts: typeof import('typescript'), node: ts.Node, fn: (node: ts.Node) => CollectStepResult): ts.Node[] {
	const result: ts.Node[] = [];

	function loop(node: ts.Node) {
		const stepResult = fn(node);

		if (stepResult === CollectStepResult.Yes || stepResult === CollectStepResult.YesAndRecurse) {
			result.push(node);
		}

		if (stepResult === CollectStepResult.YesAndRecurse || stepResult === CollectStepResult.NoAndRecurse) {
			ts.forEachChild(node, loop);
		}
	}

	loop(node);
	return result;
}

function clone<T extends object>(object: T): T {
	const result = {} as any as T;
	for (const id in object) {
		result[id] = object[id];
	}
	return result;
}

/**
 * Returns a stream containing the patched JavaScript and source maps.
 */
export function nls(options: { preserveEnglish: boolean }): NodeJS.ReadWriteStream {
	let base: string;
	const input = through();
	const output = input
		.pipe(sort()) // IMPORTANT: to ensure stable NLS metadata generation, we must sort the files because NLS messages are globally extracted and indexed across all files
		.pipe(through(function (f: FileSourceMap) {
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

	return duplex(input, output);
}

function isImportNode(ts: typeof import('typescript'), node: ts.Node): boolean {
	return node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ImportEqualsDeclaration;
}

module _nls {

	export const moduleToNLSKeys: { [name: string /* module ID */]: ILocalizeKey[] /* keys */ } = {};
	export const moduleToNLSMessages: { [name: string /* module ID */]: string[] /* messages */ } = {};
	export const allNLSMessages: string[] = [];
	export const allNLSModulesAndKeys: Array<[string /* module ID */, string[] /* keys */]> = [];
	let allNLSMessagesIndex = 0;

	type ILocalizeKey = string | { key: string }; // key might contain metadata for translators and then is not just a string

	interface INlsPatchResult {
		javascript: string;
		sourcemap: sm.RawSourceMap;
		nlsMessages?: string[];
		nlsKeys?: ILocalizeKey[];
	}

	interface ISpan {
		start: ts.LineAndCharacter;
		end: ts.LineAndCharacter;
	}

	interface ILocalizeCall {
		keySpan: ISpan;
		key: string;
		valueSpan: ISpan;
		value: string;
	}

	interface ILocalizeAnalysisResult {
		localizeCalls: ILocalizeCall[];
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

	class SingleFileServiceHost implements ts.LanguageServiceHost {

		private file: ts.IScriptSnapshot;
		private lib: ts.IScriptSnapshot;

		constructor(ts: typeof import('typescript'), private options: ts.CompilerOptions, private filename: string, contents: string) {
			this.file = ts.ScriptSnapshot.fromString(contents);
			this.lib = ts.ScriptSnapshot.fromString('');
		}

		getCompilationSettings = () => this.options;
		getScriptFileNames = () => [this.filename];
		getScriptVersion = () => '1';
		getScriptSnapshot = (name: string) => name === this.filename ? this.file : this.lib;
		getCurrentDirectory = () => '';
		getDefaultLibFileName = () => 'lib.d.ts';

		readFile(path: string, _encoding?: string): string | undefined {
			if (path === this.filename) {
				return this.file.getText(0, this.file.getLength());
			}
			return undefined;
		}
		fileExists(path: string): boolean {
			return path === this.filename;
		}
	}

	function isCallExpressionWithinTextSpanCollectStep(ts: typeof import('typescript'), textSpan: ts.TextSpan, node: ts.Node): CollectStepResult {
		if (!ts.textSpanContainsTextSpan({ start: node.pos, length: node.end - node.pos }, textSpan)) {
			return CollectStepResult.No;
		}

		return node.kind === ts.SyntaxKind.CallExpression ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse;
	}

	function analyze(
		ts: typeof import('typescript'),
		contents: string,
		functionName: 'localize' | 'localize2',
		options: ts.CompilerOptions = {}
	): ILocalizeAnalysisResult {
		const filename = 'file.ts';
		const serviceHost = new SingleFileServiceHost(ts, Object.assign(clone(options), { noResolve: true }), filename, contents);
		const service = ts.createLanguageService(serviceHost);
		const sourceFile = ts.createSourceFile(filename, contents, ts.ScriptTarget.ES5, true);

		// all imports
		const imports = lazy(collect(ts, sourceFile, n => isImportNode(ts, n) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse));

		// import nls = require('vs/nls');
		const importEqualsDeclarations = imports
			.filter(n => n.kind === ts.SyntaxKind.ImportEqualsDeclaration)
			.map(n => <ts.ImportEqualsDeclaration>n)
			.filter(d => d.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference)
			.filter(d => (<ts.ExternalModuleReference>d.moduleReference).expression.getText().endsWith(`/nls.js'`));

		// import ... from 'vs/nls';
		const importDeclarations = imports
			.filter(n => n.kind === ts.SyntaxKind.ImportDeclaration)
			.map(n => <ts.ImportDeclaration>n)
			.filter(d => d.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral)
			.filter(d => d.moduleSpecifier.getText().endsWith(`/nls.js'`))
			.filter(d => !!d.importClause && !!d.importClause.namedBindings);

		// `nls.localize(...)` calls
		const nlsLocalizeCallExpressions = importDeclarations
			.filter(d => !!(d.importClause && d.importClause.namedBindings && d.importClause.namedBindings.kind === ts.SyntaxKind.NamespaceImport))
			.map(d => (<ts.NamespaceImport>d.importClause!.namedBindings).name)
			.concat(importEqualsDeclarations.map(d => d.name))

			// find read-only references to `nls`
			.map(n => service.getReferencesAtPosition(filename, n.pos + 1))
			.flatten()
			.filter(r => !r.isWriteAccess)

			// find the deepest call expressions AST nodes that contain those references
			.map(r => collect(ts, sourceFile, n => isCallExpressionWithinTextSpanCollectStep(ts, r.textSpan, n)))
			.map(a => lazy(a).last())
			.filter(n => !!n)
			.map(n => <ts.CallExpression>n)

			// only `localize` calls
			.filter(n => n.expression.kind === ts.SyntaxKind.PropertyAccessExpression && (<ts.PropertyAccessExpression>n.expression).name.getText() === functionName);

		// `localize` named imports
		const allLocalizeImportDeclarations = importDeclarations
			.filter(d => !!(d.importClause && d.importClause.namedBindings && d.importClause.namedBindings.kind === ts.SyntaxKind.NamedImports))
			.map(d => ([] as any[]).concat((<ts.NamedImports>d.importClause!.namedBindings!).elements))
			.flatten();

		// `localize` read-only references
		const localizeReferences = allLocalizeImportDeclarations
			.filter(d => d.name.getText() === functionName)
			.map(n => service.getReferencesAtPosition(filename, n.pos + 1))
			.flatten()
			.filter(r => !r.isWriteAccess);

		// custom named `localize` read-only references
		const namedLocalizeReferences = allLocalizeImportDeclarations
			.filter(d => d.propertyName && d.propertyName.getText() === functionName)
			.map(n => service.getReferencesAtPosition(filename, n.name.pos + 1))
			.flatten()
			.filter(r => !r.isWriteAccess);

		// find the deepest call expressions AST nodes that contain those references
		const localizeCallExpressions = localizeReferences
			.concat(namedLocalizeReferences)
			.map(r => collect(ts, sourceFile, n => isCallExpressionWithinTextSpanCollectStep(ts, r.textSpan, n)))
			.map(a => lazy(a).last())
			.filter(n => !!n)
			.map(n => <ts.CallExpression>n);

		// collect everything
		const localizeCalls = nlsLocalizeCallExpressions
			.concat(localizeCallExpressions)
			.map(e => e.arguments)
			.filter(a => a.length > 1)
			.sort((a, b) => a[0].getStart() - b[0].getStart())
			.map<ILocalizeCall>(a => ({
				keySpan: { start: ts.getLineAndCharacterOfPosition(sourceFile, a[0].getStart()), end: ts.getLineAndCharacterOfPosition(sourceFile, a[0].getEnd()) },
				key: a[0].getText(),
				valueSpan: { start: ts.getLineAndCharacterOfPosition(sourceFile, a[1].getStart()), end: ts.getLineAndCharacterOfPosition(sourceFile, a[1].getEnd()) },
				value: a[1].getText()
			}));

		return {
			localizeCalls: localizeCalls.toArray()
		};
	}

	class TextModel {

		private lines: string[];
		private lineEndings: string[];

		constructor(contents: string) {
			const regex = /\r\n|\r|\n/g;
			let index = 0;
			let match: RegExpExecArray | null;

			this.lines = [];
			this.lineEndings = [];

			while (match = regex.exec(contents)) {
				this.lines.push(contents.substring(index, match.index));
				this.lineEndings.push(match[0]);
				index = regex.lastIndex;
			}

			if (contents.length > 0) {
				this.lines.push(contents.substring(index, contents.length));
				this.lineEndings.push('');
			}
		}

		public get(index: number): string {
			return this.lines[index];
		}

		public set(index: number, line: string): void {
			this.lines[index] = line;
		}

		public get lineCount(): number {
			return this.lines.length;
		}

		/**
		 * Applies patch(es) to the model.
		 * Multiple patches must be ordered.
		 * Does not support patches spanning multiple lines.
		 */
		public apply(patch: IPatch): void {
			const startLineNumber = patch.span.start.line;
			const endLineNumber = patch.span.end.line;

			const startLine = this.lines[startLineNumber] || '';
			const endLine = this.lines[endLineNumber] || '';

			this.lines[startLineNumber] = [
				startLine.substring(0, patch.span.start.character),
				patch.content,
				endLine.substring(patch.span.end.character)
			].join('');

			for (let i = startLineNumber + 1; i <= endLineNumber; i++) {
				this.lines[i] = '';
			}
		}

		public toString(): string {
			return lazy(this.lines).zip(this.lineEndings)
				.flatten().toArray().join('');
		}
	}

	function patchJavascript(patches: IPatch[], contents: string): string {
		const model = new TextModel(contents);

		// patch the localize calls
		lazy(patches).reverse().each(p => model.apply(p));

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

	function parseLocalizeKeyOrValue(sourceExpression: string) {
		// sourceValue can be "foo", 'foo', `foo` or { .... }
		// in its evalulated form
		// we want to return either the string or the object
		// eslint-disable-next-line no-eval
		return eval(`(${sourceExpression})`);
	}

	function patch(ts: typeof import('typescript'), typescript: string, javascript: string, sourcemap: sm.RawSourceMap, options: { preserveEnglish: boolean }): INlsPatchResult {
		const { localizeCalls } = analyze(ts, typescript, 'localize');
		const { localizeCalls: localize2Calls } = analyze(ts, typescript, 'localize2');

		if (localizeCalls.length === 0 && localize2Calls.length === 0) {
			return { javascript, sourcemap };
		}

		const nlsKeys = localizeCalls.map(lc => parseLocalizeKeyOrValue(lc.key)).concat(localize2Calls.map(lc => parseLocalizeKeyOrValue(lc.key)));
		const nlsMessages = localizeCalls.map(lc => parseLocalizeKeyOrValue(lc.value)).concat(localize2Calls.map(lc => parseLocalizeKeyOrValue(lc.value)));
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

	export function patchFile(javascriptFile: File, typescript: string, options: { preserveEnglish: boolean }): File {
		const ts = require('typescript') as typeof import('typescript');
		// hack?
		const moduleId = javascriptFile.relative
			.replace(/\.js$/, '')
			.replace(/\\/g, '/');

		const { javascript, sourcemap, nlsKeys, nlsMessages } = patch(
			ts,
			typescript,
			javascriptFile.contents.toString(),
			(<any>javascriptFile).sourceMap,
			options
		);

		const result = fileFrom(javascriptFile, javascript);
		(<any>result).sourceMap = sourcemap;

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
}
