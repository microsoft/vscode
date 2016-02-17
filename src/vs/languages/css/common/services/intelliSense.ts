/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nodes = require('vs/languages/css/common/parser/cssNodes');
import cssSymbols = require('vs/languages/css/common/parser/cssSymbols');
import languageFacts = require('vs/languages/css/common/services/languageFacts');
import service = require('vs/languages/css/common/services/cssLanguageService');
import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import nls = require('vs/nls');

export class CSSIntellisense {

	private static colorFunctions = [
		{ func: 'rgb($red, $green, $blue)', desc: nls.localize('css.builtin.rgb', 'Creates a Color from red, green, and blue values.') },
		{ func: 'rgba($red, $green, $blue, $alpha)', desc: nls.localize('css.builtin.rgba', 'Creates a Color from red, green, blue, and alpha values.') },
		{ func: 'hsl($hue, $saturation, $lightness)', desc: nls.localize('css.builtin.hsl', 'Creates a Color from hue, saturation, and lightness values.') },
		{ func: 'hsla($hue, $saturation, $lightness, $alpha)', desc: nls.localize('css.builtin.hsla', 'Creates a Color from hue, saturation, lightness, and alpha values.') }
	];

	variablePrefix: string;
	position: EditorCommon.IPosition;
	offset: number;
	currentWord: string;
	model: EditorCommon.IMirrorModel;
	styleSheet: nodes.Stylesheet;
	symbolContext: cssSymbols.Symbols;
	isIncomplete: boolean;

	constructor(variablePrefix: string = null) {
		this.variablePrefix = variablePrefix;
	}


	private getSymbolContext() : cssSymbols.Symbols {
		if (!this.symbolContext) {
			this.symbolContext = new cssSymbols.Symbols(this.styleSheet);
		}
		return this.symbolContext;
	}


	public getCompletionsAtPosition(languageService:service.ILanguageService, model: EditorCommon.IMirrorModel, resource:URI, position:EditorCommon.IPosition):Modes.ISuggestResult {
		this.offset = model.getOffsetFromPosition(position);
		this.position = position;
		this.currentWord = model.getWordUntilPosition(position).word;
		this.model = model;
		this.styleSheet = languageService.getStylesheet(resource);

		var result : Modes.ISuggestion[] = [];
		var nodepath = nodes.getNodePath(this.styleSheet, this.offset);

		this.isIncomplete = false;
		for (var i = nodepath.length - 1; i >= 0; i--) {
			var node = nodepath[i];
			if (node instanceof nodes.Property) {
				this.getCompletionsForDeclarationProperty(result);
			} else if (node instanceof nodes.Expression) {
				this.getCompletionsForExpression(<nodes.Expression> node, result);
			} else if (node instanceof nodes.SimpleSelector) {
				var parentRuleSet = <nodes.RuleSet> node.findParent(nodes.NodeType.Ruleset);
				this.getCompletionsForSelector(parentRuleSet, result);
			} else if (node instanceof nodes.Declarations) {
				this.getCompletionsForDeclarations(<nodes.Declarations> node, result);
			} else if (node instanceof nodes.VariableDeclaration) {
				this.getCompletionsForVariableDeclaration(<nodes.VariableDeclaration> node, result);
			} else if (node instanceof nodes.RuleSet) {
				this.getCompletionsForRuleSet(<nodes.RuleSet> node, result);
			} else if (node instanceof nodes.Interpolation) {
				this.getCompletionsForInterpolation(<nodes.Interpolation> node, result);
			} else if (node instanceof nodes.FunctionArgument) {
				this.getCompletionsForFunctionArguments(<nodes.FunctionArgument> node, result);
			} else if (node instanceof nodes.FunctionDeclaration) {
				this.getCompletionsForFunctionDeclaration(<nodes.FunctionDeclaration> node, result);
			}
			if (result.length > 0) {
				return { currentWord: this.currentWord, suggestions: result, incomplete: this.isIncomplete };
			}
		}
		this.getCompletionsForStylesheet(result);
		if (result.length > 0) {
			return { currentWord: this.currentWord, suggestions: result };
		}

		if (this.variablePrefix && this.currentWord.indexOf(this.variablePrefix) === 0) {
			this.getVariableProposals(result);
			if (result.length > 0) {
				return { currentWord: this.currentWord, suggestions: result };
			}
			model.getAllUniqueWords(this.currentWord).forEach((word) => {
				result.push({ type: 'text', label: word, codeSnippet: word });
			});
		}

		// no match, don't show text matches
		return {
			currentWord: this.currentWord,
			suggestions: result
		};
	}

	public getCompletionsForDeclarationProperty(result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		return this.getPropertyProposals(result);
	}

	private getPropertyProposals(result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		var properties = languageFacts.getProperties();

		for (var key in properties) {
			if (properties.hasOwnProperty(key)) {
				var entry = properties[key];
				if (entry.browsers.onCodeComplete) {
					result.push({
						label: entry.name,
						documentationLabel: languageFacts.getEntryDescription(entry),
						codeSnippet: entry.name + ': ',
						type: 'property'
					});
				}
			}
		}
		return result;
	}

	public getCompletionsForDeclarationValue(node: nodes.Declaration, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		var propertyName = node.getFullPropertyName();
		var entry = languageFacts.getProperties()[propertyName];

		if (entry) {
			this.getColorProposals(entry, result);
			this.getPositionProposals(entry, result);
			this.getRepeatStyleProposals(entry, result);
			this.getLineProposals(entry, result);
			this.getBoxProposals(entry, result);
			this.getImageProposals(entry, result);
			this.getTimingFunctionProposals(entry, result);
			this.getBasicShapeProposals(entry, result);
			this.getValueEnumProposals(entry, result);
			this.getCSSWideKeywordProposals(entry, result);
			this.getUnitProposals(entry, result);
		} else {
			var existingValues = new Set();
			this.styleSheet.accept(new ValuesCollector(propertyName, existingValues));
			existingValues.getEntries().forEach((existingValue) => {
				result.push({
					label: existingValue,
					codeSnippet: existingValue,
					type: 'value'
				});
			});
		}
		this.getVariableProposals(result);
		this.getTermProposals(result);
		return result;
	}

	public getValueEnumProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[]{
		if (entry.values) {
			var type = 'value';
			entry.values.forEach((value) => {
				if (languageFacts.isCommonValue(value)) { // only show if supported by more than one browser
					result.push({
						label: value.name,
						documentationLabel: languageFacts.getEntryDescription(value),
						codeSnippet: value.name,
						type: type
					});
				}
			});
		}
		return result;
	}

	public getCSSWideKeywordProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		for (var keywords in languageFacts.cssWideKeywords) {
			result.push({
				label: keywords,
				documentationLabel: languageFacts.cssWideKeywords[keywords],
				codeSnippet: keywords,
				type: 'value'
			});
		}
		return result;
	}

	public getCompletionsForInterpolation(node: nodes.Interpolation, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (this.offset >= node.offset + 2) {
			this.getVariableProposals(result);
		}
		return result;
	}

	public getVariableProposals(result:Modes.ISuggestion[]):Modes.ISuggestion[]{
		var symbols = this.getSymbolContext().findSymbolsAtOffset(this.offset, nodes.ReferenceType.Variable);
		symbols.forEach((symbol) => {
			result.push({
				label: symbol.name,
				codeSnippet: symbol.name,
				type: 'variable'
			});
		});
		return result;
	}

	public getUnitProposals(entry: languageFacts.IEntry, result: Modes.ISuggestion[]): Modes.ISuggestion[]{
		var currentWord = '0';
		if (this.currentWord.length > 0) {
			var numMatch = this.currentWord.match(/-?\d[\.\d+]*/);
			if (numMatch) {
				currentWord = numMatch[0];
			}
		}
		entry.restrictions.forEach((restriction) => {
			var units= languageFacts.units[restriction];
			if (units) {
				units.forEach(function(unit:string) {
					result.push({
						label: currentWord + unit,
						codeSnippet: currentWord + unit,
						type: 'unit'
					});
				});
			}
		});
		this.isIncomplete = true;
		return result;
	}

	protected getColorProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('color') !== -1) {
			for (var color in languageFacts.colors) {
				result.push({
					label: color,
					documentationLabel: languageFacts.colors[color],
					codeSnippet: color,
					type: '#' + languageFacts.colors[color]
				});
			}
			for (var color in languageFacts.colorKeywords) {
				result.push({
					label: color,
					documentationLabel: languageFacts.colorKeywords[color],
					codeSnippet: color,
					type: 'value'
				});
			}
			var colorValues = new Set();
			this.styleSheet.accept(new ColorValueCollector(colorValues));
			colorValues.getEntries().forEach((color) => {
				result.push({
					label: color,
					codeSnippet: color,
					type: '#' + color
				});
			});
			CSSIntellisense.colorFunctions.forEach((p) => {
				result.push({
					label: p.func.substr(0, p.func.indexOf('(')),
					typeLabel: p.func,
					documentationLabel: p.desc,
					codeSnippet: p.func.replace(/\[?\$(\w+)\]?/g, '{{$1}}'),
					type: 'function'
				});
			});
		}
		return result;
	}

	protected getPositionProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('position') !== -1) {
			for (var position in languageFacts.positionKeywords) {
				result.push({
					label: position,
					documentationLabel: languageFacts.positionKeywords[position],
					codeSnippet: position,
					type: 'value'
				});
			}
		}
		return result;
	}

	protected getRepeatStyleProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('repeat') !== -1) {
			for (var repeat in languageFacts.repeatStyleKeywords) {
				result.push({
					label: repeat,
					documentationLabel: languageFacts.repeatStyleKeywords[repeat],
					codeSnippet: repeat,
					type: 'value'
				});
			}
		}
		return result;
	}

	protected getLineProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('line-style') !== -1) {
			for (var lineStyle in languageFacts.lineStyleKeywords) {
				result.push({
					label: lineStyle,
					documentationLabel: languageFacts.lineStyleKeywords[lineStyle],
					codeSnippet: lineStyle,
					type: 'value'
				});
			}
		}
		if (entry.restrictions.indexOf('line-width') !== -1) {
			languageFacts.lineWidthKeywords.forEach((lineWidth) => {
				result.push({
					label: lineWidth,
					codeSnippet: lineWidth,
					type: 'value'
				});
			});
		}
		return result;
	}

	protected getBoxProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		var geometryBox = entry.restrictions.indexOf('geometry-box');
		if (geometryBox !== -1) {
			for (var box in languageFacts.geometryBoxKeywords) {
				result.push({
					label: box,
					documentationLabel: languageFacts.geometryBoxKeywords[box],
					codeSnippet: box,
					type: 'value'
				});
			}
		}
		if (entry.restrictions.indexOf('box') !== -1 || geometryBox !== -1) {
			for (var box in languageFacts.boxKeywords) {
				result.push({
					label: box,
					documentationLabel: languageFacts.boxKeywords[box],
					codeSnippet: box,
					type: 'value'
				});
			}
		}
		return result;
	}

	protected getImageProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('image') !== -1) {
			for (var image in languageFacts.imageFunctions) {
				result.push({
					label: image,
					documentationLabel: languageFacts.imageFunctions[image],
					codeSnippet: image,
					type: 'function'
				});
			}
		}
		return result;
	}

	protected getTimingFunctionProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('timing-function') !== -1) {
			for (var timing in languageFacts.transitionTimingFunctions) {
				result.push({
					label: timing,
					documentationLabel: languageFacts.transitionTimingFunctions[timing],
					codeSnippet: timing,
					type: 'function'
				});
			}
		}
		return result;
	}

	protected getBasicShapeProposals(entry:languageFacts.IEntry, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (entry.restrictions.indexOf('shape') !== -1) {
			for (var shape in languageFacts.basicShapeFunctions) {
				result.push({
					label: shape,
					documentationLabel: languageFacts.basicShapeFunctions[shape],
					codeSnippet: shape,
					type: 'function'
				});
			}
		}
		return result;
	}

	public getCompletionsForStylesheet(result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		var node = this.styleSheet.findFirstChildBeforeOffset(this.offset);
		if (!node) {
			return this.getCompletionForTopLevel(result);
		}
		if (node instanceof nodes.RuleSet) {
			return this.getCompletionsForRuleSet(<nodes.RuleSet> node, result);
		}
		return result;
	}

	public getCompletionForTopLevel(result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		languageFacts.getAtDirectives().forEach(function(entry) {
			if (entry.browsers.count > 0) {
				result.push({
					label: entry.name,
					codeSnippet: entry.name,
					documentationLabel: languageFacts.getEntryDescription(entry),
					type: 'keyword'
				});
			}
		});
		this.getCompletionsForSelector(null, result);
		return result;
	}

	public getCompletionsForRuleSet(ruleSet: nodes.RuleSet, result: Modes.ISuggestion[]): Modes.ISuggestion[]{
		var declarations = ruleSet.getDeclarations();

		var isAfter = declarations && declarations.endsWith('}') && this.offset >= declarations.offset + declarations.length;
		if (isAfter) {
			return this.getCompletionForTopLevel(result);
		}
		var isInSelectors = !declarations || this.offset <= declarations.offset;
		if (isInSelectors) {
			return this.getCompletionsForSelector(ruleSet, result);
		}
		ruleSet.findParent(nodes.NodeType.Ruleset);

		return this.getCompletionsForDeclarations(ruleSet.getDeclarations(), result);
	}

	public getCompletionsForSelector(ruleSet: nodes.RuleSet, result:Modes.ISuggestion[]): Modes.ISuggestion[] {
		languageFacts.getPseudoClasses().forEach((entry) => {
			if (entry.browsers.onCodeComplete) {
				result.push({
					label: entry.name,
					codeSnippet: entry.name,
					documentationLabel: languageFacts.getEntryDescription(entry),
					type: 'function'
				});
			}
		});
		languageFacts.getPseudoElements().forEach((entry) => {
			if (entry.browsers.onCodeComplete) {
				result.push({
					label: entry.name,
					codeSnippet: entry.name,
					documentationLabel: languageFacts.getEntryDescription(entry),
					type: 'function'
				});
			}
		});
		languageFacts.html5Tags.forEach((entry) => {
			result.push({
				label: entry,
				codeSnippet: entry,
				type: 'keyword'
			});
		});
		languageFacts.svgElements.forEach((entry) => {
			result.push({
				label: entry,
				codeSnippet: entry,
				type: 'keyword'
			});
		});

		var visited: { [name: string]: boolean } = {};
		visited[this.currentWord] = true;
		var textProvider = this.styleSheet.getTextProvider();
		this.styleSheet.accept(n => {
			if (n.type === nodes.NodeType.SimpleSelector && n.length > 0) {
				var selector = textProvider(n.offset, n.length);
				if (selector.charAt(0) === '.' && !visited[selector]) {
					visited[selector] = true;
					result.push({
						label: selector,
						codeSnippet: selector,
						type: 'keyword'
					});
				}
				return false;
			}
			return true;
		});

		if (ruleSet && ruleSet.isNested()) {
			var selector = ruleSet.getSelectors().findFirstChildBeforeOffset(this.offset);
			if (selector && ruleSet.getSelectors().getChildren().indexOf(selector) === 0) {
				this.getPropertyProposals(result);
			}
		}
		return result;
	}

	public getCompletionsForDeclarations(declarations: nodes.Declarations, result: Modes.ISuggestion[]): Modes.ISuggestion[]{
		if (!declarations) { // incomplete nodes
			return result;
		}
		var node = declarations.findFirstChildBeforeOffset(this.offset);
		if (!node) {
			return this.getCompletionsForDeclarationProperty(result);
		}
		if (node instanceof nodes.Declaration) {
			var declaration = <nodes.Declaration> node;
			if ((!isDefined(declaration.colonPosition) || this.offset <= declaration.colonPosition) || (isDefined(declaration.semicolonPosition) && declaration.semicolonPosition < this.offset)) {
				if (this.offset === declaration.semicolonPosition + 1) {
					return result; // don't show new properties right after semicolon (see Bug 15421:[intellisense] [css] Be less aggressive when manually typing CSS)
				}

				// complete property
				return this.getCompletionsForDeclarationProperty(result);
			}
			// complete value
			return this.getCompletionsForDeclarationValue(declaration, result);
		}
		return result;
	}


	public getCompletionsForVariableDeclaration(declaration: nodes.VariableDeclaration, result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		if (this.offset > declaration.colonPosition) {
			this.getVariableProposals(result);
		}
		return result;
	}

	public getCompletionsForExpression(expression: nodes.Expression, result:Modes.ISuggestion[]):Modes.ISuggestion[]{
		var declaration = <nodes.Declaration> expression.findParent(nodes.NodeType.Declaration);
		if (!declaration) {
			this.getTermProposals(result);
			return result;
		}

		var node = expression.findChildAtOffset(this.offset, true);
		if (!node) {
			return this.getCompletionsForDeclarationValue(declaration, result);
		}
		if (node instanceof nodes.NumericValue || node instanceof nodes.Identifier) {
			return this.getCompletionsForDeclarationValue(declaration, result);
		}
		return result;
	}

	public getCompletionsForFunctionArguments(arg: nodes.FunctionArgument, result: Modes.ISuggestion[]): Modes.ISuggestion[] {
		return result;
	}

	public getCompletionsForFunctionDeclaration(decl: nodes.FunctionDeclaration, result: Modes.ISuggestion[]): Modes.ISuggestion[]{
		var declarations = decl.getDeclarations();
		if (declarations && this.offset > declarations.offset && this.offset < declarations.offset + declarations.length) {
			this.getTermProposals(result);
		}
		return result;
	}

	public getTermProposals(result: Modes.ISuggestion[]): Modes.ISuggestion[]{
		var allFunctions = this.getSymbolContext().findSymbolsAtOffset(this.offset, nodes.ReferenceType.Function);
		allFunctions.forEach((functionSymbol) => {
			if (functionSymbol.node instanceof nodes.FunctionDeclaration) {
				var functionDecl = <nodes.FunctionDeclaration> functionSymbol.node;
				var params = functionDecl.getParameters().getChildren().map((c) => {
					return (c instanceof nodes.FunctionParameter) ? (<nodes.FunctionParameter> c).getName() : c.getText();
				});
				result.push({
					label: functionSymbol.name,
					typeLabel: functionSymbol.name + '(' + params.join(', ') + ')',
					codeSnippet: functionSymbol.name + '(' + params.map((p) => '{{' + p + '}}').join(', ') + ')',
					type: 'function'
				});
			}
		});
		return result;
	}

}

class Set {
	private entries: { [key:string]: boolean } = {};
	public add(entry: string) : void {
		this.entries[entry] = true;
	}
	public getEntries() : string[] {
		return Object.keys(this.entries);
	}
}


class InternalValueCollector implements nodes.IVisitor {

	constructor(public entries:Set) {
		// nothing to do
	}

	public visitNode(node:nodes.Node):boolean {
		if (node instanceof nodes.Identifier || node instanceof nodes.NumericValue || node instanceof nodes.HexColorValue) {
			this.entries.add(node.getText());
		}
		return true;
	}
}

class ValuesCollector implements nodes.IVisitor {


	constructor(public propertyName: string, public entries:Set) {
		// nothing to do
	}

	private matchesProperty(decl : nodes.Declaration) : boolean {
		var propertyName = decl.getFullPropertyName();
		return this.propertyName === propertyName;
	}

	public visitNode(node:nodes.Node):boolean {
		if (node instanceof nodes.Declaration) {
			if (this.matchesProperty(<nodes.Declaration> node)) {
				var value = (<nodes.Declaration> node).getValue();
				if (value) {
					value.accept(new InternalValueCollector(this.entries));
				}
			}
		}
		return true;
	}
}

class ColorValueCollector implements nodes.IVisitor {

	constructor(public entries:Set) {
		// nothing to do
	}

	public visitNode(node:nodes.Node): boolean {
		if (node instanceof nodes.HexColorValue || (node instanceof nodes.Function && languageFacts.isColorConstructor(<nodes.Function> node))) {
			this.entries.add(node.getText());
		}
		return true;
	}
}

function isDefined(obj: any) : boolean {
	return typeof obj !== 'undefined';
}
