/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import converter = require('vs/languages/typescript/common/features/converter');

export function formatDocument(languageService: ts.LanguageService, resource: URI, options: Modes.IFormattingOptions): EditorCommon.ISingleEditOperation[] {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename);

	return languageService.getFormattingEditsForDocument(filename, createFormatCodeOptions(options)).map(edit => {
		return {
			text: edit.newText,
			range: converter.getRange(sourceFile, edit.span)
		};
	});
}

export function formatRange(languageService:ts.LanguageService, resource:URI, range:EditorCommon.IRange, options:Modes.IFormattingOptions):EditorCommon.ISingleEditOperation[] {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		minChar = converter.getStartOffset(sourceFile, range),
		limChar = converter.getEndOffset(sourceFile, range);

	return languageService.getFormattingEditsForRange(filename, minChar, limChar, createFormatCodeOptions(options)).map(edit => {
		// convert TypeScript edit into Monaco edit
		return {
			text: edit.newText,
			range: converter.getRange(sourceFile, edit.span)
		};
	});
}

export function formatAfterKeystroke(languageService: ts.LanguageService, resource: URI, position: EditorCommon.IPosition, ch: string, options: Modes.IFormattingOptions): EditorCommon.ISingleEditOperation[] {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, position);

	return languageService.getFormattingEditsAfterKeystroke(filename, offset, ch, createFormatCodeOptions(options)).map(edit => {
		// convert TypeScript edit into Monaco edit
		return {
			text: edit.newText,
			range: converter.getRange(sourceFile, edit.span)
		};
	});
}

function createFormatCodeOptions(options:{ insertSpaces:boolean; tabSize:number; }):ts.FormatCodeOptions {
	return {
		IndentSize: options.tabSize,
		TabSize: options.tabSize,
		NewLineCharacter: '\n',
		ConvertTabsToSpaces: options.insertSpaces,
		InsertSpaceAfterCommaDelimiter: true,
		InsertSpaceAfterSemicolonInForStatements: true,
		InsertSpaceBeforeAndAfterBinaryOperators: true,
		InsertSpaceAfterKeywordsInControlFlowStatements: true,
		InsertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
		InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
		PlaceOpenBraceOnNewLineForFunctions: false,
		PlaceOpenBraceOnNewLineForControlBlocks: false
	};
}