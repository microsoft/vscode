/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import network = require('vs/base/common/network');
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import converter = require('vs/languages/typescript/common/features/converter');
import nls = require('vs/nls');
import arrays = require('vs/base/common/arrays');
import {IMarker} from 'vs/platform/markers/common/markers';

export function evaluate(languageService: ts.LanguageService, resource: URI, range: EditorCommon.IRange, quickFix: Modes.IQuickFix): Modes.IQuickFixResult {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, { lineNumber: range.endLineNumber, column: range.endColumn }),
		token = ts.findTokenOnLeftOfPosition(sourceFile, offset);

	if (!token || token.getWidth() === 0) {
		return null;
	}

	var [command] = quickFix.command.arguments;
	switch (command.type) {
		case 'rename': {
			let start = sourceFile.getLineAndCharacterOfPosition(token.getStart());
			let end = sourceFile.getLineAndCharacterOfPosition(token.getEnd());
			let renameRange: EditorCommon.IRange = { startLineNumber: start.line + 1, startColumn: start.character + 1, endLineNumber: end.line + 1, endColumn: end.character + 1 };
			return {
				edits: [{ resource, range: renameRange, newText: command.name }]
			};
		}
		case 'addglobal': {
			let content = strings.format('/* global {0} */\n', command.name);
			let renameRange: EditorCommon.IRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
			return {
				edits: [{ resource, range: renameRange, newText: content }]
			};
		}
	}
	return null;
}

function isMarker(obj: any) : boolean {
	return !!obj.code;
}

export function compute(languageService: ts.LanguageService, resource: URI, range: IMarker | EditorCommon.IRange): Modes.IQuickFix[] {
	// so far only support quick fixes on markers
	if (!isMarker(range)) {
		return [];
	}

	var marker = <IMarker> range;
	var code = 0;
	try {
		code = parseInt(marker.code);
	} catch (e) {
		// ignore
	}

	var proposals : Modes.IQuickFix[] = [];

	switch (code) {
		case 2339: //Property_0_does_not_exist_on_type_1:
			computeRenameProposals(languageService, resource, marker, proposals);
			break;
		case 2304: // Cannot_find_name_0:
			computeRenameProposals(languageService, resource, marker, proposals);
			computeAddTypeDefinitionProposals(languageService, resource, marker, proposals);
			break;
	}
	return proposals;
}

function computeRenameProposals(languageService:ts.LanguageService, resource:URI, range:IMarker, result: Modes.IQuickFix[]) : void {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, { lineNumber: range.endLineNumber, column: range.endColumn }),
		token = ts.findTokenOnLeftOfPosition(sourceFile, offset);

	if (!token || token.getWidth() === 0) {
		return;
	}

	var currentWord = ts.getTextOfNode(token);
	currentWord = currentWord.substring(0, currentWord.length - (token.getEnd() - offset));
	var completion = languageService.getCompletionsAtPosition(filename, offset);
	if (!completion || arrays.isFalsyOrEmpty(completion.entries)) {
		return;
	}

	var fixes: Modes.IQuickFix[] = [];
	completion.entries.forEach((entry) => {
		if (entry.name === currentWord) {
			return;
		}

		switch (entry.kind) {
			case ts.ScriptElementKind.classElement:
			case ts.ScriptElementKind.interfaceElement:
			case ts.ScriptElementKind.typeElement:
			case ts.ScriptElementKind.enumElement:
			case ts.ScriptElementKind.variableElement:
			case ts.ScriptElementKind.localVariableElement:
			case ts.ScriptElementKind.functionElement:
			case ts.ScriptElementKind.localFunctionElement:
			case ts.ScriptElementKind.memberFunctionElement:
			case ts.ScriptElementKind.memberGetAccessorElement:
			case ts.ScriptElementKind.memberSetAccessorElement:
			case ts.ScriptElementKind.memberVariableElement:
			case ts.ScriptElementKind.constructorImplementationElement:
			case ts.ScriptElementKind.callSignatureElement:
			case ts.ScriptElementKind.indexSignatureElement:
			case ts.ScriptElementKind.constructSignatureElement:
			case ts.ScriptElementKind.parameterElement:
			case ts.ScriptElementKind.primitiveType:

				var score = strings.difference(currentWord, entry.name);
				if (score < currentWord.length / 2 /*score_lim*/) {
					return;
				}

				fixes.push({
					command: {
						id: 'ts.renameTo',
						title: nls.localize('typescript.quickfix.rename', "Rename to '{0}'", entry.name),
						arguments: [{ type: 'rename', name: entry.name }]
					},
					score
				});
		}
	});

	// Sort in descending order.
	fixes.sort((a, b) => {
		return b.score - a.score;
	});

	var max = Math.min(3, fixes.length);
	for (var i = 0; i < max; i++) {
		result.push(fixes[i]);
	}
}


var angularDD = 'angularjs/angular.d.ts';
var jqueryDD = 'jquery/jquery.d.ts';
var nodejsDD = 'node/node.d.ts';
var mochaDD = 'mocha/mocha.d.ts';
var underscoreDD = 'underscore/underscore.d.ts';
var knockoutDD = 'knockout/knockout.d.ts';
var backboneDD = 'backbone/backbone.d.ts';
var d3DD = 'd3/d3.d.ts';
var qunitDD = 'qunit/qunit.d.ts';
var reactDD = 'react/react.d.ts';
var emberDD = 'ember/ember.d.ts';
var lodashDD = 'lodash/lodash.d.ts';
var mustacheDD = 'mustache/mustache.d.ts';
var asyncDD = 'async/async.d.ts';
var browserifyDD = 'browserify/browserify.d.ts';
var cordovaDD = 'cordova/cordova.d.ts';
var sinonDD = 'sinon/sinon.d.ts';
var jasmineDD = 'jasmine/jasmine.d.ts';
var handlebarsDD = 'handlebars/handlebars.d.ts';

// exported for tests
export var typingsMap: { [key: string]: string | string[] } = {
	'angular': angularDD,
	'$': jqueryDD, 'jquery': jqueryDD, 'jQuery': jqueryDD,
	'process': nodejsDD, '__dirname': nodejsDD,
	'describe': [mochaDD, jasmineDD],
	'it': [mochaDD, jasmineDD],
	'_': [ underscoreDD, lodashDD],
	'ko': knockoutDD,
	'Backbone': backboneDD,
	'd3': d3DD,
	'QUnit': qunitDD,
	'React': reactDD,
	'Ember': emberDD, 'Em': emberDD,
	'Handlebars': handlebarsDD,
	'Mustache': mustacheDD,
	'async': asyncDD,
	'browserify': browserifyDD,
	'cordova': cordovaDD,
	'sinon': sinonDD,
};

function computeAddTypeDefinitionProposals(languageService: ts.LanguageService, resource: URI, range: IMarker, result: Modes.IQuickFix[]): void {
	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, { lineNumber: range.endLineNumber, column: range.endColumn }),
		token = ts.findTokenOnLeftOfPosition(sourceFile, offset);

	if (!token || token.getWidth() === 0 || (network.Schemas.inMemory === resource.scheme)) {
		return;
	}

	var currentWord = ts.getTextOfNode(token);
	if (typingsMap.hasOwnProperty(currentWord)) {
		var mapping = typingsMap[currentWord];
		var dtsRefs: string[] = Array.isArray(mapping) ? <string[]> mapping : [ <string> mapping ];
		dtsRefs.forEach((dtsRef, idx) => {
			result.push({
				command: {
					id: 'ts.downloadDts',
					title: nls.localize('typescript.quickfix.typeDefinitions', "Download type definition {0}", dtsRef.split('/')[1]),
					arguments: [{ type: 'typedefinitions', name: dtsRef }]
				},
				score: idx
			});
		});
	}

	if (strings.endsWith(resource.path, '.js')) {
		result.push({
			command: {
				id: 'ts.addAsGlobal',
				title: nls.localize('typescript.quickfix.addAsGlobal', "Mark '{0}' as global", currentWord),
				arguments: [{ type: 'addglobal', name: currentWord }]
			},
			score: 1
		});
	}

}
