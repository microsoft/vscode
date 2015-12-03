/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import collections = require('vs/base/common/collections');
import winjs = require('vs/base/common/winjs.base');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import projectService = require('vs/languages/typescript/common/project/projectService');
import {IResourceService} from 'vs/editor/common/services/resourceService';

export class PathMaker {

	public makeModulePath(isExternalModule: boolean, filepath: string, relativeToPath: string): string {
		return isExternalModule ? this._toRequirePath(filepath, relativeToPath) : this._toReferencesPath(filepath, relativeToPath);
	}

	private _toRequirePath(filepath: string, relativeToPath: string): string {

		var relativeToFolder = paths.dirname(relativeToPath),
			result: string;

		result = paths.join(paths.relative(relativeToFolder, paths.dirname(filepath)), paths.basename(filepath));
		if (!strings.startsWith(result, '..')) {
			result = './' + result;
		}

		result = strings.rtrim(result, '.ts');
		result = strings.rtrim(result, '.js');
		return result;
	}

	private _toReferencesPath(filepath: string, relativeToPath: string): string {
		var relativeToFolder = paths.dirname(relativeToPath);
		return paths.join(paths.relative(relativeToFolder, paths.dirname(filepath)), paths.basename(filepath));
	}
}

interface IPathInfo {
	external:boolean;
	wordUntilPosition:string;
	wordAfterPosition:string;
}

export class FilenameSuggestions implements Modes.ISuggestParticipant {

	private static _TrippleSlashReference = /^(\/\/\/\s*<reference\s+path=)([^\s>]+)/i;

	private _resourceServices:IResourceService;

	constructor(@IResourceService resourceService:IResourceService) {
		this._resourceServices = resourceService;
	}

	public suggest(resource: URI, position: EditorCommon.IPosition, context?: projectService.ProjectService): winjs.TPromise<Modes.ISuggestResult> {

		if(!(context instanceof projectService.ProjectService)) {
			return winjs.TPromise.as(null);
		}

		var project = context.getProject(resource),
			sourceFile = project.languageService.getSourceFile(resource.toString()),
			wordInfo = this._findCurrentWord(resource, position, sourceFile);

		if(!wordInfo) {
			return winjs.TPromise.as(null);
		}

		var pathMaker = new PathMaker(),
			quoteCharacter = /^['"]/.test(wordInfo.wordUntilPosition) ? wordInfo.wordUntilPosition[0] : '"';

		var result:Modes.ISuggestResult = {
			currentWord: wordInfo.wordUntilPosition,
			suggestions: [],
		};

		var suggestions: collections.IStringDictionary<Modes.ISuggestion> = Object.create(null);

		context.scriptsNames().forEach(fileName => {

			if (wordInfo.external && strings.endsWith(fileName, '.d.ts')) {
				return;
			}

			if (fileName === resource.toString()) {
				return;
			}

			if (suggestions[fileName]) {
				return;
			}

			if (URI.parse(fileName).scheme !== 'file') {
				return;
			}

			var modulePath = pathMaker.makeModulePath(wordInfo.external, fileName, resource.toString());
			suggestions[fileName] = {
				label: strings.format('{0}{1}{0}', quoteCharacter, modulePath),
				codeSnippet: strings.rtrim(strings.format('{0}{1}{0}', quoteCharacter, modulePath), wordInfo.wordAfterPosition),
				documentationLabel: URI.parse(fileName).fsPath,
				type: 'reference',
			};
		});

		result.suggestions = collections.values(suggestions);
		return winjs.TPromise.as(result);
	}

	private _findCurrentWord(resource:URI, position:EditorCommon.IPosition, sourceFile:ts.SourceFile):IPathInfo {

		var mirrorModel = <EditorCommon.IMirrorModel> this._resourceServices.get(resource),
			offset = mirrorModel.getOffsetFromPosition(position),
			token = ts.findTokenOnLeftOfPosition(sourceFile, offset),
			line = mirrorModel.getLineContent(position.lineNumber),
			match = FilenameSuggestions._TrippleSlashReference.exec(line);

		if(match) {
			// triple slash reference
			var	lineOffset = mirrorModel.getOffsetFromPosition({lineNumber: position.lineNumber, column: 1});

			return {
				wordUntilPosition: match[2].substring(0, offset - (lineOffset + match[1].length)),
				wordAfterPosition: match[2].substring(offset - (lineOffset + match[1].length)),
				external: false
			};

		} else if(syntax.isTokenPath(token, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.CallExpression)) {
			// import-require-statement
			return {
				wordUntilPosition: ts.getTextOfNode(token).substr(0, offset - token.getStart()),
				wordAfterPosition: ts.getTextOfNode(token).substr(offset - token.getStart()),
				external: true
			};

		} else if(syntax.isTokenPath(token, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.CallExpression)) {
			// commonjs-require-call
			// AMD-define(['d1','d2'])
			var expression = <ts.CallExpression> syntax.parent(token, 2);
			if(ts.getTextOfNode(expression.expression) === 'require' || ts.getTextOfNode(expression.expression) === 'define') {
				return {
					wordUntilPosition: ts.getTextOfNode(token).substr(0, offset - token.getStart()),
					wordAfterPosition: ts.getTextOfNode(token).substr(offset - token.getStart()),
					external: true
				};
			}
		}
	}
}

namespace syntax {

	export function parent(token:ts.Node, nth:number): ts.Node {
		while(nth-- > 0 && token) {
			token = token.parent;
		}
		return token;
	}

	export function isTokenPath(token:ts.Node, ...kinds:ts.SyntaxKind[]): boolean {
		while(kinds.length > 0 && token) {
			var kind = kinds.shift();
			if(kind !== token.kind) {
				return false;
			}
			token = token.parent;
		}
		return true;
	}
}