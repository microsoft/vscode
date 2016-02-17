/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import strings = require('vs/base/common/strings');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import textEdits = require('vs/languages/typescript/common/js/textEdits');
import htmlContent = require('vs/base/common/htmlContent');

export interface ITranslations {
	getTranslator(resource: URI): ITranslator;
	getOriginal(resource: URI): ts.IScriptSnapshot;
}

export interface ITranslationInfo {
	isInserted: boolean;
	isOverlapping: boolean;
	origin: EditorCommon.IRange;
}

export interface ITranslator {
	to(position: EditorCommon.IPosition): EditorCommon.IPosition;
	to(range: EditorCommon.IRange): EditorCommon.IRange;
	from(position: EditorCommon.IPosition): EditorCommon.IPosition;
	from(range: EditorCommon.IRange): EditorCommon.IRange;
	info(range: EditorCommon.IRange): ITranslationInfo;
}

export class IdentityTranslator implements ITranslator {

	public static Instance = new IdentityTranslator();

	public to(position: EditorCommon.IPosition): EditorCommon.IPosition;
	public to(range: EditorCommon.IRange): EditorCommon.IRange;
	public to(thing: any): any {
		return thing;
	}

	public from(position: EditorCommon.IPosition): EditorCommon.IPosition;
	public from(range: EditorCommon.IRange): EditorCommon.IRange;
	public from(thing: any): any {
		return thing;
	}

	public info(range: EditorCommon.IRange): ITranslationInfo {
		return {
			origin: undefined,
			isInserted: false,
			isOverlapping: false
		};
	}
}

var $measurePerf = false;
var $t1: number;
var $perf: { [n: string]: number };

export function translate(_rewriter: ISyntaxRewriter[], snapshot:string|ts.IScriptSnapshot, sourceFile?:()=>ts.SourceFile): textEdits.ITextOperationResult {

	$perf = Object.create(null);
	$perf['_total'] = Date.now();

	var value = typeof snapshot === 'string' ? snapshot : snapshot.getText(0, snapshot.getLength());

	if (!sourceFile) {
		sourceFile = () => ts.createSourceFile('afile.ts', value, ts.ScriptTarget.Latest, true);
	}

	var context = new AnalyzerContext(sourceFile);
	for (var i = 0, len = _rewriter.length; i < len; i++) {
		$t1 = Date.now();
		_rewriter[i].computeEdits(context);
		$perf[_rewriter[i].name] = Date.now() - $t1;
	}

	if(context.edits.length === 0) {
		return { value: value, doEdits: [], undoEdits: [], derived: [] };
	}

	$t1 = Date.now();
	var result = textEdits.apply(context.edits, value);
	$perf['_apply'] = Date.now() - $t1;
	$perf['_total'] = Date.now() - $perf['_total'];
	if ($measurePerf) {
		console.info($perf);
		console.info(result.value);
	}
	return result;
}

export class AnalyzerContext {

	public sourceFile: ts.SourceFile;
	public edits: textEdits.Edit[];
	public sourceUnitStart: number;

	constructor(sourceFile: () => ts.SourceFile) {
		this.sourceFile = sourceFile();
		this.sourceUnitStart = this.sourceFile.getStart();
		this.edits = [];
	}

	public addEdit(edit: textEdits.Edit): void{
		this.edits.push(edit);
	}

	public newInsert(text: string, ...args:string[]): void;
	public newInsert(offset: number, text: string, ...args:string[]): void;
	public newInsert(offsetOrText: any, ...args: string[]): void {
		var offset: number;
		if(typeof offsetOrText === 'string') {
			offset = this.sourceUnitStart;
			args.unshift(offsetOrText);
		} else {
			offset = offsetOrText;
		}

		this.edits.push(new textEdits.Edit(offset, 0, strings.format.apply(strings, args)));
	}

	public newDerive(node:ts.Node, offsetOrText: number|string, ...args: string[]): void {
		var offset: number;
		if(typeof offsetOrText === 'string') {
			offset = this.sourceUnitStart;
			args.unshift(offsetOrText);
		} else {
			offset = offsetOrText;
		}

		var edit = new textEdits.Edit(offset, 0, strings.format.apply(strings, args));
		edit.origin = new textEdits.TextSpan(node.getStart(), node.getWidth());
		this.edits.push(edit);
	}

	public newDelete(offset: number, length: number): void {
		this.edits.push(new textEdits.Edit(offset, length, strings.empty));
	}

	public newReplace(offset: number, length: number, text: string): void {
		this.edits.push(new textEdits.Edit(offset, length, text));
	}

	public newAppend(text: string): void {
		this.edits.push(new textEdits.Edit(this.sourceFile.getFullWidth(), 0, text));
	}
}

export interface ISyntaxRewriter {
	name: string;
	computeEdits(context: AnalyzerContext): void;
}

var _variableNamePatternString = '_$steroids$_{0}_{1}',
	_variableNamePattern = /_\$steroids\$_(\d+)_(\d+)/g;

export function encodeVariableName(node: ts.Node): string {
	return strings.format(_variableNamePatternString, node.getStart(), node.getEnd());
}

function _doDecodeVariableName(name: string, sourceFile: ts.IScriptSnapshot): string {
	_variableNamePattern.lastIndex = 0;
	return name.replace(_variableNamePattern, (m, g1, g2) => sourceFile.getText(parseInt(g1), parseInt(g2)));
}

export function decodeVariableNames(name: string|htmlContent.IHTMLContentElement[], sourceFile: ts.IScriptSnapshot): string {

	if (typeof name === 'string') {
		return _doDecodeVariableName(name, sourceFile);

	} else if (Array.isArray(name)) {
		var stack = name.slice(0);
		while (stack.length) {
			var element = stack.shift();
			element.markdown = element.markdown && _doDecodeVariableName(element.markdown, sourceFile);
			if(element.children){
				stack.push.apply(stack, element.children);
			}
		}
	}
}

export function containsEncodedVariableName(text: string): boolean {
	_variableNamePattern.lastIndex = 0;
	return _variableNamePattern.test(text);
}