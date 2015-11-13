/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import types = require('vs/base/common/types');
import EditorCommon = require('vs/editor/common/editorCommon');
import collections = require('vs/base/common/collections');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import Options = require('vs/languages/typescript/common/options');
import rules = require('./rules');
import layoutRules = require('./rules/layout');
import typescriptRules = require('./rules/typescript');
import javascriptRules = require('./rules/javascript');

export interface IError {
	message:string;
	code:string;
	range:EditorCommon.IRange;
	severity:Severity;
}

export interface RuleAndSeverity {
	rule:rules.IStyleRule<any>;
	severity:Severity;
}

export class SimpleStyleRuleChecker implements rules.IRuleContext {

	private _rules:collections.INumberDictionary<RuleAndSeverity[]> = {};
	private _errors:IError[] = [];
	private _currentSeverity:Severity;
	private _sourceFile: ts.SourceFile;

	constructor(rules:RuleAndSeverity[]) {
		for(var i = 0, len = rules.length; i < len; i++) {
			this._addRule(rules[i]);
		}
	}

	private _addRule(entry:RuleAndSeverity):void {
		var callback = (filter:number) => {
			collections.lookupOrInsert(this._rules, filter, []).push(entry);
		};
		if(entry.rule.filter) {
			entry.rule.filter.forEach(callback);
		} else {
			callback(-1);
		}
	}

	public check(sourceFile:ts.SourceFile):IError[] {
		this._errors.length = 0;
		this._currentSeverity = Severity.Warning;
		this._sourceFile = sourceFile;
		this._visit(sourceFile);

		return this._errors.slice(0);
	}

	// ----- context implementation ------------------------------------------------------------

	public reportError(node:ts.Node, message: string, code: string, position?: number, width?: number):void {
		if (!node) {
			return;
		}
		if(typeof position === 'undefined') {
			position = ts.getTokenPosOfNode(node);
		}
		if(typeof width === 'undefined') {
			width = node.getWidth();
		}

		var startPosition = this._sourceFile.getLineAndCharacterOfPosition(position),
			endPosition = this._sourceFile.getLineAndCharacterOfPosition(position + width);

		this._errors.push({
			message: message,
			code: code,
			severity: this._currentSeverity,
			range: {
				startLineNumber: 1 + startPosition.line,
				startColumn: 1 + startPosition.character,
				endLineNumber: 1 + endPosition.line,
				endColumn: 1 + endPosition.character
			}
		});
	}

	// ---- traversal -------------------------------------------------------------------------

	private _visit(node:ts.Node):void {

		if(!node) {
			return;
		}

		// check the syntax element
		this._checkNodeOrToken(node);

		// continue with children
		ts.forEachChild(node, child => {
			this._visit(child);
		});
	}

	private _checkNodeOrToken(node:ts.Node):void {

		var	rules = <RuleAndSeverity[]> collections.lookup(this._rules, node.kind, []).concat(collections.lookup(this._rules, -1, []));

		for(var i = 0, len = rules.length; i < len; i++) {
			this._currentSeverity = rules[i].severity;
			if(this._currentSeverity === Severity.Ignore) {
				continue;
			}
			try {
				rules[i].rule.checkNode(node, this);
			} catch(e) {
				// remove lint rule?
				console.error(e);
			}
		}
	}
}

export class LanuageServiceStyleRuleChecker extends SimpleStyleRuleChecker implements rules.IRuleContext2 {

	private _filename:string;

	constructor(private _languageService:ts.LanguageService, rules:RuleAndSeverity[]) {
		super(rules);
	}

	// ---- context implementation -----------------------------------------------

	public languageService():ts.LanguageService {
		return this._languageService;
	}

	public filename():string {
		return this._filename;
	}

	// ---- checker ---------------------------------------------------------------

	public check(syntaxTree:ts.SourceFile):IError[] {
		this._filename = syntaxTree.fileName;
		return super.check(syntaxTree);
	}
}

export class StyleRuleCheckerWithMessages extends LanuageServiceStyleRuleChecker {

	public reportError(element:any, message: string, code: string, position?: number, width?: number):void {
		return super.reportError(element, this._lookupMessage(message, code), code, position, width);
	}

	private _lookupMessage(message:string, code:string):string {
		switch(code) {
			case 'SA1503': return nls.localize('layout.curlyBracketsMustNotBeOmitted', "Don't spare curly brackets.");
			case 'SA1514': return nls.localize('layout.emptyblock', "Empty block should have a comment.");

			case 'SA9005': return nls.localize('javascript.comparisonOperatorNotStrict', "Use '!==' and '===' instead of '!=' and '=='.");
			case 'SA9050': return nls.localize('javascript.missingSemicolon', "Missing semicolon.");
			case 'SA9051': return nls.localize('javascript.reservedKeyword', "Don't use reserved keywords.");
			case 'SA9052': return nls.localize('javascript.typescriptSpecific', "Don't use a TypeScript specific language construct in JavaScript.");
			case 'SA9053': return nls.localize('javascript.typeofCannotBeCompared', "Unexpected output of the 'typeof'-operator.");
			case 'SA9054': return nls.localize('javascript.semicolonInsteadOfBlock', "Semicolon instead of block.");
			case 'SA9055': return nls.localize('javascript.functionInsideLoop', "Function inside loop.");
			case 'SA9062': return nls.localize('javascript.newOnLowercaseFunctions', "Function with lowercase name used as constructor.");

			case 'SA9002': return nls.localize('typescript.missingReturnType', "Missing return type.");
			case 'SA9056': return nls.localize('typescript.looksLikeTripleSlash', "Did you mean '/// <reference path=\"some/path.ts\" />'?");
			case 'SA9057': return nls.localize('typescript.unusedImport', "Unused import.");
			case 'SA9058': return nls.localize('typescript.unusedLocalVariable', "Unused local variable.");
			case 'SA9059': return nls.localize('typescript.unusedFunction', "Unused local function.");
			case 'SA9060': return nls.localize('typescript.unusedPrivateMember', "Unused private member.");
			case 'SA9061': return nls.localize('typescript.variableUsedBeforeDeclared', "Variable is used before it is declared.");
		}
		return message;
	}
}

function fillInConstructorFunctions(_module:any, result:collections.IStringDictionary<Function>):void {

	for (var name in _module) {
		if (_module.hasOwnProperty(name)) {
			var ctor = _module[name];
			if(typeof ctor === 'function') {
				result[String(name).toLowerCase()] = ctor;
			}
		}
	}
}

function createRulesFromSettings(options: Options): RuleAndSeverity[] {

	var functions: collections.IStringDictionary<Function> = {},
		result: RuleAndSeverity[] = [],
		settings = options.validate.lint;

	fillInConstructorFunctions(layoutRules, functions);
	fillInConstructorFunctions(javascriptRules, functions);
	fillInConstructorFunctions(typescriptRules, functions);

	for (var key in settings) {
		if (settings.hasOwnProperty(key)) {
			var ctor = collections.lookup(functions, String(key).toLowerCase());
			if (ctor) {
				result.push({
					rule: <rules.IStyleRule<any>> types.create(ctor),
					severity: Severity.fromValue(settings[key])
				});
			}
		}
	}

	return result;
}

export function check(settings: Options, languageService: ts.LanguageService, resource: URI): IError[]{
	var rules = createRulesFromSettings(settings),
		checker = new StyleRuleCheckerWithMessages(languageService, rules);

	return checker.check(languageService.getSourceFile(resource.toString()));
}
