/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import collections = require('vs/base/common/collections');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import converter = require('vs/languages/typescript/common/features/converter');
import previewer = require('vs/languages/typescript/common/features/previewer');
import Options = require('vs/languages/typescript/common/options');

function getWordAtOffset(text: string, offset: number): string {
	var endOffset = offset;
	while(offset > 0 && /\w|\$/.test(text.charAt(offset - 1))) {
		offset -= 1;
	}
	return text.substring(offset, endOffset);
}

function suggestionHashFn(suggestion:Modes.ISuggestion):string {
	return suggestion.type + suggestion.label + suggestion.codeSnippet;
}

export function computeSuggestions(languageService: ts.LanguageService, resource: URI,
	position: EditorCommon.IPosition, options: Options): Modes.ISuggestResult {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, position);

	// ask language service to complete at this offset
	var completions = languageService.getCompletionsAtPosition(filename, offset),
		suggestions = collections.createStringDictionary<Modes.ISuggestion>();

	if (completions) {
		for (var i = 0, len = completions.entries.length; i < len; i++) {
			var entry = completions.entries[i];

			collections.insert(suggestions, {
				label: entry.name,
				codeSnippet: entry.name,
				type: monacoTypeFromEntryKind(entry.kind)
			}, suggestionHashFn);
		}
	}

	let fullText = sourceFile.getFullText();
	let currentWord = getWordAtOffset(fullText, offset);

	if (options.suggest.alwaysAllWords) {
		let words = fullText.split(/\W+/);
		for(let word of words) {
			word = word.trim();
			if(word) {
				collections.insert(suggestions, {
					label: word,
					codeSnippet: word,
					type: 'text'
				}, suggestionHashFn);
			}
		}
	}

	return {
		currentWord: currentWord,
		suggestions: collections.values(suggestions)
	};
}

export function getSuggestionDetails(languageService: ts.LanguageService, resource:URI, position:EditorCommon.IPosition,
	suggestion: Modes.ISuggestion, options: Options): Modes.ISuggestion {

		if(suggestion.type === 'snippet') {
			return suggestion;
		}

		var filename = resource.toString(),
			sourceFile = languageService.getSourceFile(filename),
			offset = converter.getOffset(sourceFile, position),
			details = languageService.getCompletionEntryDetails(filename, offset, suggestion.label);

		if(!details) {
			return suggestion;
		}

		suggestion.documentationLabel = previewer.plain(details.documentation);
		suggestion.typeLabel = previewer.plain(details.displayParts);
		suggestion.codeSnippet = details.name;

		if(options.suggest.useCodeSnippetsOnMethodSuggest && monacoTypeFromEntryKind(details.kind) === 'function') {
			var codeSnippet = details.name,
				suggestionArgumentNames: string[];

			suggestionArgumentNames = details.displayParts
				.filter(part => part.kind === 'parameterName')
				.map(part => `{{${part.text}}}`);

			if (suggestionArgumentNames.length > 0) {
				codeSnippet += '(' + suggestionArgumentNames.join(', ') + '){{}}';
			} else {
				codeSnippet += '()';
			}
			suggestion.codeSnippet = codeSnippet;
		}

		return suggestion;
	}

function monacoTypeFromEntryKind(kind:string):string {
	switch(kind) {
		case ts.ScriptElementKind.primitiveType:
		case ts.ScriptElementKind.keyword:
			return 'keyword';

		case ts.ScriptElementKind.variableElement:
		case ts.ScriptElementKind.localVariableElement:
		case ts.ScriptElementKind.memberVariableElement:
		case ts.ScriptElementKind.memberGetAccessorElement:
		case ts.ScriptElementKind.memberSetAccessorElement:
			return 'field';

		case ts.ScriptElementKind.functionElement:
		case ts.ScriptElementKind.memberFunctionElement:
		case ts.ScriptElementKind.constructSignatureElement:
		case ts.ScriptElementKind.callSignatureElement:
			return 'function';
	}
	return kind;
}
