/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/cssNodes';
import {Symbols} from '../parser/cssSymbolScope';
import * as languageFacts from './languageFacts';
import * as strings from '../utils/strings';
import {TextDocument, Position, CompletionList, CompletionItemKind} from 'vscode-languageserver';

export class CSSCompletion {

	variablePrefix: string;
	position: Position;
	offset: number;
	currentWord: string;
	textDocument: TextDocument;
	styleSheet: nodes.Stylesheet;
	symbolContext: Symbols;

	constructor(variablePrefix: string = null) {
		this.variablePrefix = variablePrefix;
	}

	private getSymbolContext(): Symbols {
		if (!this.symbolContext) {
			this.symbolContext = new Symbols(this.styleSheet);
		}
		return this.symbolContext;
	}


	public doComplete(document: TextDocument, position: Position, styleSheet: nodes.Stylesheet): Thenable<CompletionList> {
		this.offset = document.offsetAt(position);
		this.position = position;
		this.currentWord = getCurrentWord(document, this.offset);
		this.textDocument = document;
		this.styleSheet = styleSheet;

		let result: CompletionList = { isIncomplete: false, items: [] };
		let nodepath = nodes.getNodePath(this.styleSheet, this.offset);

		for (let i = nodepath.length - 1; i >= 0; i--) {
			let node = nodepath[i];
			if (node instanceof nodes.Property) {
				this.getCompletionsForDeclarationProperty(result);
			} else if (node instanceof nodes.Expression) {
				this.getCompletionsForExpression(<nodes.Expression>node, result);
			} else if (node instanceof nodes.SimpleSelector) {
				let parentRuleSet = <nodes.RuleSet>node.findParent(nodes.NodeType.Ruleset);
				this.getCompletionsForSelector(parentRuleSet, result);
			} else if (node instanceof nodes.Declarations) {
				this.getCompletionsForDeclarations(<nodes.Declarations>node, result);
			} else if (node instanceof nodes.VariableDeclaration) {
				this.getCompletionsForVariableDeclaration(<nodes.VariableDeclaration>node, result);
			} else if (node instanceof nodes.RuleSet) {
				this.getCompletionsForRuleSet(<nodes.RuleSet>node, result);
			} else if (node instanceof nodes.Interpolation) {
				this.getCompletionsForInterpolation(<nodes.Interpolation>node, result);
			} else if (node instanceof nodes.FunctionArgument) {
				this.getCompletionsForFunctionArgument(<nodes.FunctionArgument>node, <nodes.Function>node.getParent(), result);
			} else if (node instanceof nodes.FunctionDeclaration) {
				this.getCompletionsForFunctionDeclaration(<nodes.FunctionDeclaration>node, result);
			} else if (node instanceof nodes.Function) {
				this.getCompletionsForFunctionArgument(null, <nodes.Function>node, result);
			}
			if (result.items.length > 0) {
				return Promise.resolve(result);
			}
		}
		this.getCompletionsForStylesheet(result);
		if (result.items.length > 0) {
			return Promise.resolve(result);
		}

		if (this.variablePrefix && this.currentWord.indexOf(this.variablePrefix) === 0) {
			this.getVariableProposals(result);
			if (result.items.length > 0) {
				return Promise.resolve(result);
			}
		}

		// no match, don't show text matches
		return Promise.resolve(result);
	}

	public getCompletionsForDeclarationProperty(result: CompletionList): CompletionList {
		return this.getPropertyProposals(result);
	}

	private getPropertyProposals(result: CompletionList): CompletionList {
		let properties = languageFacts.getProperties();

		for (let key in properties) {
			if (properties.hasOwnProperty(key)) {
				let entry = properties[key];
				if (entry.browsers.onCodeComplete) {
					result.items.push({
						label: entry.name,
						documentation: languageFacts.getEntryDescription(entry),
						insertText: entry.name + ': ',
						kind: CompletionItemKind.Property
					});
				}
			}
		}
		return result;
	}

	public getCompletionsForDeclarationValue(node: nodes.Declaration, result: CompletionList): CompletionList {
		let propertyName = node.getFullPropertyName();
		let entry = languageFacts.getProperties()[propertyName];

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
			let existingValues = new Set();
			this.styleSheet.accept(new ValuesCollector(propertyName, existingValues));
			existingValues.getEntries().forEach((existingValue) => {
				result.items.push({
					label: existingValue,
					insertText: existingValue,
					kind: CompletionItemKind.Value
				});
			});
		}
		this.getVariableProposals(result);
		this.getTermProposals(result);
		return result;
	}

	public getValueEnumProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.values) {
			entry.values.forEach((value) => {
				if (languageFacts.isCommonValue(value)) { // only show if supported by more than one browser
					result.items.push({
						label: value.name,
						documentation: languageFacts.getEntryDescription(value),
						insertText: value.name,
						kind: CompletionItemKind.Value
					});
				}
			});
		}
		return result;
	}

	public getCSSWideKeywordProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		for (let keywords in languageFacts.cssWideKeywords) {
			result.items.push({
				label: keywords,
				documentation: languageFacts.cssWideKeywords[keywords],
				insertText: keywords,
				kind: CompletionItemKind.Value
			});
		}
		return result;
	}

	public getCompletionsForInterpolation(node: nodes.Interpolation, result: CompletionList): CompletionList {
		if (this.offset >= node.offset + 2) {
			this.getVariableProposals(result);
		}
		return result;
	}

	public getVariableProposals(result: CompletionList): CompletionList {
		let symbols = this.getSymbolContext().findSymbolsAtOffset(this.offset, nodes.ReferenceType.Variable);
		symbols.forEach((symbol) => {
			result.items.push({
				label: symbol.name,
				insertText: strings.startsWith(symbol.name, '--') ? `let(${symbol.name})` : symbol.name,
				kind: CompletionItemKind.Variable
			});
		});
		return result;
	}

	public getVariableProposalsForCSSVarFunction(result: CompletionList): CompletionList {
		let symbols = this.getSymbolContext().findSymbolsAtOffset(this.offset, nodes.ReferenceType.Variable);
		symbols = symbols.filter((symbol): boolean => {
			return strings.startsWith(symbol.name, '--');
		});
		symbols.forEach((symbol) => {
			result.items.push({
				label: symbol.name,
				insertText: symbol.name,
				kind: CompletionItemKind.Variable
			});
		});
		return result;
	}

	public getUnitProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		let currentWord = '0';
		if (this.currentWord.length > 0) {
			let numMatch = this.currentWord.match(/^-?\d[\.\d+]*/);
			if (numMatch) {
				currentWord = numMatch[0];
				result.isIncomplete = currentWord.length === this.currentWord.length;
			}
		} else if (this.currentWord.length === 0) {
			result.isIncomplete = true;
		}
		entry.restrictions.forEach((restriction) => {
			let units = languageFacts.units[restriction];
			if (units) {
				units.forEach(function (unit: string) {
					result.items.push({
						label: currentWord + unit,
						insertText: currentWord + unit,
						kind: CompletionItemKind.Unit
					});
				});
			}
		});
		return result;
	}

	protected getColorProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('color') !== -1) {
			for (let color in languageFacts.colors) {
				result.items.push({
					label: color,
					documentation: languageFacts.colors[color],
					insertText: color,
					kind: CompletionItemKind.Color
				});
			}
			for (let color in languageFacts.colorKeywords) {
				result.items.push({
					label: color,
					documentation: languageFacts.colorKeywords[color],
					insertText: color,
					kind: CompletionItemKind.Value
				});
			}
			let colorValues = new Set();
			this.styleSheet.accept(new ColorValueCollector(colorValues));
			colorValues.getEntries().forEach((color) => {
				result.items.push({
					label: color,
					insertText: color,
					kind: CompletionItemKind.Color
				});
			});
			languageFacts.colorFunctions.forEach((p) => {
				result.items.push({
					label: p.func.substr(0, p.func.indexOf('(')),
					detail: p.func,
					documentation: p.desc,
					insertText: p.func.replace(/\[?\$(\w+)\]?/g, '{{$1}}'),
					kind: CompletionItemKind.Function
				});
			});
		}
		return result;
	}

	protected getPositionProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('position') !== -1) {
			for (let position in languageFacts.positionKeywords) {
				result.items.push({
					label: position,
					documentation: languageFacts.positionKeywords[position],
					insertText: position,
					kind: CompletionItemKind.Value
				});
			}
		}
		return result;
	}

	protected getRepeatStyleProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('repeat') !== -1) {
			for (let repeat in languageFacts.repeatStyleKeywords) {
				result.items.push({
					label: repeat,
					documentation: languageFacts.repeatStyleKeywords[repeat],
					insertText: repeat,
					kind: CompletionItemKind.Value
				});
			}
		}
		return result;
	}

	protected getLineProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('line-style') !== -1) {
			for (let lineStyle in languageFacts.lineStyleKeywords) {
				result.items.push({
					label: lineStyle,
					documentation: languageFacts.lineStyleKeywords[lineStyle],
					insertText: lineStyle,
					kind: CompletionItemKind.Value
				});
			}
		}
		if (entry.restrictions.indexOf('line-width') !== -1) {
			languageFacts.lineWidthKeywords.forEach((lineWidth) => {
				result.items.push({
					label: lineWidth,
					insertText: lineWidth,
					kind: CompletionItemKind.Value
				});
			});
		}
		return result;
	}

	protected getBoxProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		let geometryBox = entry.restrictions.indexOf('geometry-box');
		if (geometryBox !== -1) {
			for (let box in languageFacts.geometryBoxKeywords) {
				result.items.push({
					label: box,
					documentation: languageFacts.geometryBoxKeywords[box],
					insertText: box,
					kind: CompletionItemKind.Value
				});
			}
		}
		if (entry.restrictions.indexOf('box') !== -1 || geometryBox !== -1) {
			for (let box in languageFacts.boxKeywords) {
				result.items.push({
					label: box,
					documentation: languageFacts.boxKeywords[box],
					insertText: box,
					kind: CompletionItemKind.Value
				});
			}
		}
		return result;
	}

	protected getImageProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('image') !== -1) {
			for (let image in languageFacts.imageFunctions) {
				result.items.push({
					label: image,
					documentation: languageFacts.imageFunctions[image],
					insertText: image,
					kind: CompletionItemKind.Function
				});
			}
		}
		return result;
	}

	protected getTimingFunctionProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('timing-function') !== -1) {
			for (let timing in languageFacts.transitionTimingFunctions) {
				result.items.push({
					label: timing,
					documentation: languageFacts.transitionTimingFunctions[timing],
					insertText: timing,
					kind: CompletionItemKind.Function
				});
			}
		}
		return result;
	}

	protected getBasicShapeProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		if (entry.restrictions.indexOf('shape') !== -1) {
			for (let shape in languageFacts.basicShapeFunctions) {
				result.items.push({
					label: shape,
					documentation: languageFacts.basicShapeFunctions[shape],
					insertText: shape,
					kind: CompletionItemKind.Function
				});
			}
		}
		return result;
	}

	public getCompletionsForStylesheet(result: CompletionList): CompletionList {
		let node = this.styleSheet.findFirstChildBeforeOffset(this.offset);
		if (!node) {
			return this.getCompletionForTopLevel(result);
		}
		if (node instanceof nodes.RuleSet) {
			return this.getCompletionsForRuleSet(<nodes.RuleSet>node, result);
		}
		return result;
	}

	public getCompletionForTopLevel(result: CompletionList): CompletionList {
		languageFacts.getAtDirectives().forEach(function (entry) {
			if (entry.browsers.count > 0) {
				result.items.push({
					label: entry.name,
					insertText: entry.name,
					documentation: languageFacts.getEntryDescription(entry),
					kind: CompletionItemKind.Keyword
				});
			}
		});
		this.getCompletionsForSelector(null, result);
		return result;
	}

	public getCompletionsForRuleSet(ruleSet: nodes.RuleSet, result: CompletionList): CompletionList {
		let declarations = ruleSet.getDeclarations();

		let isAfter = declarations && declarations.endsWith('}') && this.offset >= declarations.end;
		if (isAfter) {
			return this.getCompletionForTopLevel(result);
		}
		let isInSelectors = !declarations || this.offset <= declarations.offset;
		if (isInSelectors) {
			return this.getCompletionsForSelector(ruleSet, result);
		}
		ruleSet.findParent(nodes.NodeType.Ruleset);

		return this.getCompletionsForDeclarations(ruleSet.getDeclarations(), result);
	}

	public getCompletionsForSelector(ruleSet: nodes.RuleSet, result: CompletionList): CompletionList {
		languageFacts.getPseudoClasses().forEach((entry) => {
			if (entry.browsers.onCodeComplete) {
				result.items.push({
					label: entry.name,
					insertText: entry.name,
					documentation: languageFacts.getEntryDescription(entry),
					kind: CompletionItemKind.Function
				});
			}
		});
		languageFacts.getPseudoElements().forEach((entry) => {
			if (entry.browsers.onCodeComplete) {
				result.items.push({
					label: entry.name,
					insertText: entry.name,
					documentation: languageFacts.getEntryDescription(entry),
					kind: CompletionItemKind.Function
				});
			}
		});
		languageFacts.html5Tags.forEach((entry) => {
			result.items.push({
				label: entry,
				insertText: entry,
				kind: CompletionItemKind.Keyword
			});
		});
		languageFacts.svgElements.forEach((entry) => {
			result.items.push({
				label: entry,
				insertText: entry,
				kind: CompletionItemKind.Keyword
			});
		});

		let visited: { [name: string]: boolean } = {};
		visited[this.currentWord] = true;
		let textProvider = this.styleSheet.getTextProvider();
		this.styleSheet.accept(n => {
			if (n.type === nodes.NodeType.SimpleSelector && n.length > 0) {
				let selector = textProvider(n.offset, n.length);
				if (selector.charAt(0) === '.' && !visited[selector]) {
					visited[selector] = true;
					result.items.push({
						label: selector,
						insertText: selector,
						kind: CompletionItemKind.Keyword
					});
				}
				return false;
			}
			return true;
		});

		if (ruleSet && ruleSet.isNested()) {
			let selector = ruleSet.getSelectors().findFirstChildBeforeOffset(this.offset);
			if (selector && ruleSet.getSelectors().getChildren().indexOf(selector) === 0) {
				this.getPropertyProposals(result);
			}
		}
		return result;
	}

	public getCompletionsForDeclarations(declarations: nodes.Declarations, result: CompletionList): CompletionList {
		if (!declarations) { // incomplete nodes
			return result;
		}

		let node = declarations.findFirstChildBeforeOffset(this.offset);
		if (!node) {
			return this.getCompletionsForDeclarationProperty(result);
		}

		if (node instanceof nodes.AbstractDeclaration) {
			let declaration = <nodes.AbstractDeclaration>node;
			if ((!isDefined(declaration.colonPosition) || this.offset <= declaration.colonPosition) || (isDefined(declaration.semicolonPosition) && declaration.semicolonPosition < this.offset)) {
				if (this.offset === declaration.semicolonPosition + 1) {
					return result; // don't show new properties right after semicolon (see Bug 15421:[intellisense] [css] Be less aggressive when manually typing CSS)
				}

				// complete property
				return this.getCompletionsForDeclarationProperty(result);
			}

			if (declaration instanceof nodes.Declaration) {
				// complete value
				return this.getCompletionsForDeclarationValue(declaration, result);
			}
		}
		return result;
	}

	public getCompletionsForVariableDeclaration(declaration: nodes.VariableDeclaration, result: CompletionList): CompletionList {
		if (this.offset > declaration.colonPosition) {
			this.getVariableProposals(result);
		}
		return result;
	}

	public getCompletionsForExpression(expression: nodes.Expression, result: CompletionList): CompletionList {
		if (expression.getParent() instanceof nodes.FunctionArgument) {
			this.getCompletionsForFunctionArgument(<nodes.FunctionArgument>expression.getParent(), <nodes.Function>expression.getParent().getParent(), result);
			return result;
		}

		let declaration = <nodes.Declaration>expression.findParent(nodes.NodeType.Declaration);
		if (!declaration) {
			this.getTermProposals(result);
			return result;
		}

		let node = expression.findChildAtOffset(this.offset, true);
		if (!node) {
			return this.getCompletionsForDeclarationValue(declaration, result);
		}
		if (node instanceof nodes.NumericValue || node instanceof nodes.Identifier) {
			return this.getCompletionsForDeclarationValue(declaration, result);
		}
		return result;
	}

	public getCompletionsForFunctionArgument(arg: nodes.FunctionArgument, func: nodes.Function, result: CompletionList): CompletionList {
		if (func.getIdentifier().getText() === 'let') {
			if (!func.getArguments().hasChildren() || func.getArguments().getChild(0) === arg) {
				this.getVariableProposalsForCSSVarFunction(result);
			}
		}
		return result;
	}

	public getCompletionsForFunctionDeclaration(decl: nodes.FunctionDeclaration, result: CompletionList): CompletionList {
		let declarations = decl.getDeclarations();
		if (declarations && this.offset > declarations.offset && this.offset < declarations.end) {
			this.getTermProposals(result);
		}
		return result;
	}

	public getTermProposals(result: CompletionList): CompletionList {
		let allFunctions = this.getSymbolContext().findSymbolsAtOffset(this.offset, nodes.ReferenceType.Function);
		allFunctions.forEach((functionSymbol) => {
			if (functionSymbol.node instanceof nodes.FunctionDeclaration) {
				let functionDecl = <nodes.FunctionDeclaration>functionSymbol.node;
				let params = functionDecl.getParameters().getChildren().map((c) => {
					return (c instanceof nodes.FunctionParameter) ? (<nodes.FunctionParameter>c).getName() : c.getText();
				});
				result.items.push({
					label: functionSymbol.name,
					detail: functionSymbol.name + '(' + params.join(', ') + ')',
					insertText: functionSymbol.name + '(' + params.map((p) => '{{' + p + '}}').join(', ') + ')',
					kind: CompletionItemKind.Function
				});
			}
		});
		return result;
	}

}

class Set {
	private entries: { [key: string]: boolean } = {};
	public add(entry: string): void {
		this.entries[entry] = true;
	}
	public getEntries(): string[] {
		return Object.keys(this.entries);
	}
}


class InternalValueCollector implements nodes.IVisitor {

	constructor(public entries: Set) {
		// nothing to do
	}

	public visitNode(node: nodes.Node): boolean {
		if (node instanceof nodes.Identifier || node instanceof nodes.NumericValue || node instanceof nodes.HexColorValue) {
			this.entries.add(node.getText());
		}
		return true;
	}
}

class ValuesCollector implements nodes.IVisitor {


	constructor(public propertyName: string, public entries: Set) {
		// nothing to do
	}

	private matchesProperty(decl: nodes.Declaration): boolean {
		let propertyName = decl.getFullPropertyName();
		return this.propertyName === propertyName;
	}

	public visitNode(node: nodes.Node): boolean {
		if (node instanceof nodes.Declaration) {
			if (this.matchesProperty(<nodes.Declaration>node)) {
				let value = (<nodes.Declaration>node).getValue();
				if (value) {
					value.accept(new InternalValueCollector(this.entries));
				}
			}
		}
		return true;
	}
}

class ColorValueCollector implements nodes.IVisitor {

	constructor(public entries: Set) {
		// nothing to do
	}

	public visitNode(node: nodes.Node): boolean {
		if (node instanceof nodes.HexColorValue || (node instanceof nodes.Function && languageFacts.isColorConstructor(<nodes.Function>node))) {
			this.entries.add(node.getText());
		}
		return true;
	}
}

function isDefined(obj: any): boolean {
	return typeof obj !== 'undefined';
}

function getCurrentWord(document: TextDocument, offset: number) {
	let i = offset - 1;
	let text = document.getText();
	while (i >= 0 && ' \t\n\r":{[,'.indexOf(text.charAt(i)) === -1) {
		i--;
	}
	return text.substring(i + 1, offset);
}