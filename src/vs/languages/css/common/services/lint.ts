/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import languageFacts = require('vs/languages/css/common/services/languageFacts');
import lintRules = require('vs/languages/css/common/services/lintRules');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import nls = require('vs/nls');
import _level = require('vs/languages/css/common/level');

class Element {

	public name: string;
	public node: nodes.Declaration;

	constructor(text:string, data:nodes.Declaration){
		this.name = text;
		this.node = data;
	}
}

class NodesByRootMap {
		public data:{[name:string]:{nodes:nodes.Node[];names:string[]}} = {};

		public add(root:string, name:string, node:nodes.Node) : void {
			var entry = this.data[root];
			if (!entry) {
				entry = { nodes: [], names: []};
				this.data[root] = entry;
			}
			entry.names.push(name);
			if (node) {
				entry.nodes.push(node);
			}
		}
	}

export class LintVisitor implements nodes.IVisitor {

	static entries(node:nodes.Node, settings: lintRules.IConfigurationSettings):nodes.IMarker[] {
		var visitor = new LintVisitor(settings);
		node.accept(visitor);
		return visitor.getEntries();
	}

	static prefixes = [
		'-ms-', '-moz-', '-o-', '-webkit-', // Quite common
//		'-xv-', '-atsc-', '-wap-', '-khtml-', 'mso-', 'prince-', '-ah-', '-hp-', '-ro-', '-rim-', '-tc-' // Quite un-common
	];

	private warnings:nodes.IMarker[] = [];
	private configuration:{ [id:string] : _level.Level };

	constructor(settings: lintRules.IConfigurationSettings = {}) {
		this.configuration = {};
		for (var ruleKey in lintRules.Rules) {
			var rule = lintRules.Rules[ruleKey];
			var level = settings[rule.id] || _level.toLevel(rule.defaultValue);
			this.configuration[rule.id] = level;
		}
	}

	private fetch(input: Element[], s:string): Element[] {
		var elements: Element[] = [];

		for (var i = 0; i < input.length; i++) {
			if (input[i].name.toLowerCase() === s) {
				elements.push(input[i]);
			}
		}

		return elements;
	}

	private fetchWithValue(input: Element[], s:string, v:string): Element[] {
		var elements: Element[] = [];
		for (var i = 0; i < input.length; i++) {
			if (input[i].name.toLowerCase() === s) {
				var expression = input[i].node.getValue();
				if (expression && this.findValueInExpression(expression, v)) {
					elements.push(input[i]);
				}
			}
		}
		return elements;
	}

	private findValueInExpression(expression: nodes.Expression, v:string):boolean {
		var found= false;
		expression.accept(function(node) {
			if (node.type === nodes.NodeType.Identifier && node.getText() === v) {
				found= true;
			}
			return !found;
		});
		return found;
	}


	private fetchWithin(input: Element[], s:string): Element[] {
		var elements: Element[] = [];

		for (var i = 0; i < input.length; i++) {
			if (input[i].name.toLowerCase().indexOf(s) >= 0) {
				elements.push(input[i]);
			}
		}

		return elements;
	}

	public getEntries(filter:number=(_level.Level.Warning | _level.Level.Error)):nodes.IMarker[] {
		return this.warnings.filter((entry) => {
			return (entry.getLevel() & filter) !== 0;
		});
	}

	private addEntry(node:nodes.Node, rule:lintRules.Rule, details?:string):void {
		var entry = new nodes.Marker(node, rule, this.configuration[rule.id], details);
		this.warnings.push(entry);
	}

	private getMissingNames(expected:string[], actual: string[]) : string {
		expected = expected.slice(0); // clone
		for (var i = 0; i < actual.length; i++) {
			var k = expected.indexOf(actual[i]);
			if (k !== -1) {
				expected[k] = null;
			}
		}
		var result: string = null;
		for (var i = 0; i < expected.length; i++) {
			var curr = expected[i];
			if (curr) {
				if (result === null) {
					result = nls.localize('namelist.single', "'{0}'", curr);
				} else {
					result = nls.localize('namelist.concatenated', "{0}, '{1}'", result, curr);
				}
			}
		}
		return result;
	}

	public visitNode(node:nodes.Node):boolean {
		switch (node.type) {
			case nodes.NodeType.Stylesheet:
				return this.visitStylesheet(<nodes.Stylesheet> node);
			case nodes.NodeType.FontFace:
				return this.visitFontFace(<nodes.FontFace> node);
			case nodes.NodeType.Ruleset:
				return this.visitRuleSet(<nodes.RuleSet> node);
			case nodes.NodeType.SimpleSelector:
				return this.visitSimpleSelector(<nodes.SimpleSelector> node);
			case nodes.NodeType.Function:
				return this.visitFunction(<nodes.Function> node);
			case nodes.NodeType.NumericValue:
				return this.visitNumericValue(<nodes.NumericValue> node);
			case nodes.NodeType.Import:
				return this.visitImport(<nodes.Import> node);
		}
		return this.visitUnknownNode(node);
	}

	private visitStylesheet(node: nodes.Stylesheet):boolean {
		// @keyframe and it's vendor specific alternatives
		// @keyframe should be included

		var keyframes = new NodesByRootMap();
		node.accept((node) => {
			if (node instanceof nodes.Keyframe) {
				var keyword = (<nodes.Keyframe> node).getKeyword();
				var text = keyword.getText();
				keyframes.add((<nodes.Keyframe> node).getName(), text, (text !== '@keyframes') ? keyword : null);
			}
			return true;
		});

		var expected = ['@-webkit-keyframes', '@-moz-keyframes', '@-o-keyframes'];


		var addVendorSpecificWarnings = (node: nodes.Node) => {
			if (needsStandard) {
				var message = nls.localize('keyframes.standardrule.missing', "Always define standard rule '@keyframes' when defining keyframes.");
				this.addEntry(node, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix, message);
			}
			if (missingVendorSpecific) {
				var message = nls.localize('keyframes.vendorspecific.missing', "Always include all vendor specific rules: Missing: {0}", missingVendorSpecific);
				this.addEntry(node, lintRules.Rules.AllVendorPrefixes, message);
			}
		};

		for (var name in keyframes.data) {
			var actual = keyframes.data[name].names;
			var needsStandard = (actual.indexOf('@keyframes') === -1);
			if (!needsStandard && actual.length === 1) {
				continue; // only the non-vendor specific keyword is used, that's fine, no warning
			}

			var missingVendorSpecific = this.getMissingNames(expected, actual);
			if (missingVendorSpecific || needsStandard) {
				keyframes.data[name].nodes.forEach(addVendorSpecificWarnings);
			}
		}

		return true;
	}

	private visitSimpleSelector(node: nodes.SimpleSelector): boolean {

		var text = node.getText();

		/////////////////////////////////////////////////////////////
		//	Lint - The universal selector (*) is known to be slow.
		/////////////////////////////////////////////////////////////
		if (text === '*') {
			this.addEntry(node, lintRules.Rules.UniversalSelector);
		}

		/////////////////////////////////////////////////////////////
		//	Lint - Avoid id selectors
		/////////////////////////////////////////////////////////////
		if (text.indexOf('#') === 0) {
			this.addEntry(node, lintRules.Rules.AvoidIdSelector);
		}
		return true;
	}

	private visitImport(node: nodes.Import): boolean {
		/////////////////////////////////////////////////////////////
		//	Lint - Import statements shouldn't be used, because they aren't offering parallel downloads.
		/////////////////////////////////////////////////////////////
		this.addEntry(node, lintRules.Rules.ImportStatemement);
		return true;
	}

	private visitRuleSet(node: nodes.RuleSet): boolean {
		/////////////////////////////////////////////////////////////
		//	Lint - Don't use empty rulesets.
		/////////////////////////////////////////////////////////////
		var declarations = node.getDeclarations();
		if (!declarations) {
			// syntax error
			return false;
		}


		if (!declarations.hasChildren()) {
			this.addEntry(node.getSelectors(), lintRules.Rules.EmptyRuleSet);
		}

		var self = this;
		var propertyTable: Element[] = [];
		declarations.getChildren().forEach(function(element) {
			if (element instanceof nodes.Declaration) {
				var decl = <nodes.Declaration> element;
				propertyTable.push(new Element(decl.getFullPropertyName(), decl));
			}
		}, this);

		/////////////////////////////////////////////////////////////
		//	Don't use width or height when using padding or border.
		/////////////////////////////////////////////////////////////
		if ((this.fetch(propertyTable, 'width').length > 0 || this.fetch(propertyTable, 'height').length > 0) && (this.fetchWithin(propertyTable, 'padding').length > 0 || this.fetchWithin(propertyTable, 'border').length > 0)) {
			var elements: Element[] = this.fetch(propertyTable, 'width');
			for (var index = 0; index < elements.length; index++) {
				this.addEntry(elements[index].node, lintRules.Rules.NoWidthOrHeightWhenPaddingOrBorder);
			}
			elements = this.fetch(propertyTable, 'height');
			for (var index = 0; index < elements.length; index++) {
				this.addEntry(elements[index].node, lintRules.Rules.NoWidthOrHeightWhenPaddingOrBorder);
			}
			elements = this.fetchWithin(propertyTable, 'padding');
			for (var index = 0; index < elements.length; index++) {
				this.addEntry(elements[index].node, lintRules.Rules.NoWidthOrHeightWhenPaddingOrBorder);
			}
			elements = this.fetchWithin(propertyTable, 'border');
			for (var index = 0; index < elements.length; index++) {
				this.addEntry(elements[index].node, lintRules.Rules.NoWidthOrHeightWhenPaddingOrBorder);
			}
		}

		/////////////////////////////////////////////////////////////
		//	Properties ignored due to display
		/////////////////////////////////////////////////////////////

		// With 'display: inline', the width, height, margin-top, margin-bottom, and float properties have no effect
		let displayElems = this.fetchWithValue(propertyTable, 'display', 'inline');
		if (displayElems.length > 0) {
			[ 'width', 'height', 'margin-top', 'margin-bottom', 'float'].forEach(function(prop) {
				var elem = self.fetch(propertyTable, prop);
				for (var index = 0; index < elem.length; index++) {
					self.addEntry(elem[index].node, lintRules.Rules.PropertyIgnoredDueToDisplay);
				}
			});
		}

		// With 'display: inline-block', 'float' has no effect
		displayElems = this.fetchWithValue(propertyTable, 'display', 'inline-block');
		if (displayElems.length > 0) {
			var elem = this.fetch(propertyTable, 'float');
			for (var index = 0; index < elem.length; index++) {
				this.addEntry(elem[index].node, lintRules.Rules.PropertyIgnoredDueToDisplay);
			}
		}

		// With 'display: block', 'vertical-align' has no effect
		displayElems = this.fetchWithValue(propertyTable, 'display', 'block');
		if (displayElems.length > 0) {
			var elem = this.fetch(propertyTable, 'vertical-align');
			for (var index = 0; index < elem.length; index++) {
				this.addEntry(elem[index].node, lintRules.Rules.PropertyIgnoredDueToDisplay);
			}
		}

		/////////////////////////////////////////////////////////////
		//	Don't use !important
		/////////////////////////////////////////////////////////////
		node.accept(function(n:nodes.Node) {
			if (n.type === nodes.NodeType.Prio) {
				self.addEntry(n, lintRules.Rules.AvoidImportant);
			}
			return true;
		});

		/////////////////////////////////////////////////////////////
		//	Avoid 'float'
		/////////////////////////////////////////////////////////////

		var elements: Element[] = this.fetch(propertyTable, 'float');
		for (var index = 0; index < elements.length; index++) {
			this.addEntry(elements[index].node, lintRules.Rules.AvoidFloat);
		}

		/////////////////////////////////////////////////////////////
		//	Don't use duplicate declarations.
		/////////////////////////////////////////////////////////////
		for (var i = 0; i < propertyTable.length; i++) {
			var element = propertyTable[i];
			if (element.name.toLowerCase() !== 'background') {
				var value = element.node.getValue();
				if (value && value.getText()[0] !== '-') {
					var elements = this.fetch(propertyTable, element.name);
					if (elements.length > 1) {
						for (var k = 0; k < elements.length; k++) {
							var value = elements[k].node.getValue();
							if (value && value.getText()[0] !== '-' && elements[k] !== element) {
								this.addEntry(element.node, lintRules.Rules.DuplicateDeclarations);
							}
						}
					}
				}
			}
		}

		/////////////////////////////////////////////////////////////
		//	Unknown propery & When using a vendor-prefixed gradient, make sure to use them all.
		/////////////////////////////////////////////////////////////

		var propertiesBySuffix = new NodesByRootMap();
		var containsUnknowns = false;

		declarations.getChildren().forEach((node) => {
			if (this.isCSSDeclaration(node)) {
				var decl = <nodes.Declaration> node;
				var name = decl.getFullPropertyName();
				var firstChar = name.charAt(0);

				if (firstChar === '-') {
					if (name.charAt(1) !== '-') { // avoid css variables
						if (!languageFacts.isKnownProperty(name)) {
							this.addEntry(decl.getProperty(), lintRules.Rules.UnknownVendorSpecificProperty);
						}
						var nonPrefixedName = decl.getNonPrefixedPropertyName();
						propertiesBySuffix.add(nonPrefixedName, name, decl.getProperty());
					}
				} else {
					if (firstChar === '*' || firstChar === '_') {
						this.addEntry(decl.getProperty(), lintRules.Rules.IEStarHack);
						name = name.substr(1);
					}
					if (!languageFacts.isKnownProperty(name)) {
						this.addEntry(decl.getProperty(), lintRules.Rules.UnknownProperty);
					}
					propertiesBySuffix.add(name, name, null); // don't pass the node as we don't show errors on the standard
				}
			} else {
				containsUnknowns = true;
			}
		});

		if (!containsUnknowns) { // don't perform this test if there are

			var addVendorSpecificWarnings = (node: nodes.Node) => {
				if (needsStandard) {
					var message = nls.localize('property.standard.missing', "Also define the standard property '{0}' for compatibility", suffix);
					this.addEntry(node, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix, message);
				}
				if (missingVendorSpecific) {
					var message = nls.localize('property.vendorspecific.missing', "Always include all vendor specific properties: Missing: {0}", missingVendorSpecific);
					this.addEntry(node, lintRules.Rules.AllVendorPrefixes, message);
				}
			};


			for (var suffix in propertiesBySuffix.data) {
				var entry = propertiesBySuffix.data[suffix];
				var actual = entry.names;

				var needsStandard = languageFacts.isKnownProperty(suffix) && (actual.indexOf(suffix) === -1);
				if (!needsStandard && actual.length === 1) {
					continue; // only the non-vendor specific rule is used, that's fine, no warning
				}

				var expected : string[] = [];
				for (var i = 0, len = LintVisitor.prefixes.length; i < len; i++) {
					var prefix = LintVisitor.prefixes[i];
					if (languageFacts.isKnownProperty(prefix + suffix)) {
						expected.push(prefix + suffix);
					}
				}

				var missingVendorSpecific = this.getMissingNames(expected, actual);
				if (missingVendorSpecific || needsStandard) {
					entry.nodes.forEach(addVendorSpecificWarnings);
				}
			}
		}


		return true;
	}

	private visitNumericValue(node:nodes.NumericValue): boolean {
		/////////////////////////////////////////////////////////////
		//	0 has no following unit
		/////////////////////////////////////////////////////////////
		var value = node.getValue();
		if(value.unit === '%') {
			return true;
		}

		if(parseFloat(value.value) === 0.0 && !!value.unit) {
			this.addEntry(node, lintRules.Rules.ZeroWithUnit);
		}

		return true;
	}

	private visitFontFace(node: nodes.FontFace): boolean {
		var declarations = node.getDeclarations();
		if (!declarations) {
			// syntax error
			return;
		}

		var definesSrc = false, definesFontFamily = false;
		var containsUnknowns = false;
		declarations.getChildren().forEach((node) => {
			if (this.isCSSDeclaration(node)) {
				var name = ((<nodes.Declaration> node).getProperty().getName().toLocaleLowerCase());
				if (name === 'src') { definesSrc = true; }
				if (name === 'font-family') { definesFontFamily = true; }
			} else {
				containsUnknowns = true;
			}
		});

		if (!containsUnknowns && (!definesSrc || !definesFontFamily)) {
			this.addEntry(node, lintRules.Rules.RequiredPropertiesForFontFace);
		}

		return true;
	}

	private isCSSDeclaration(node:nodes.Node): boolean {
		if (node instanceof nodes.Declaration) {
			if (!(<nodes.Declaration> node).getValue()) {
				return false;
			}
			var property = (<nodes.Declaration> node).getProperty();
			if (!property || property.getIdentifier().containsInterpolation()) {
				return false;
			}
			return true;
		}
		return false;
	}

	private visitUnknownNode(node:nodes.Node):boolean {

		// Rule: #eeff00 or #ef0
		if(node.type === nodes.NodeType.HexColorValue) {
			var text = node.getText();
			if(text.length !== 7 && text.length !== 4) {
				this.addEntry(node, lintRules.Rules.HexColorLength);
			}
		}
		return true;
	}

	private visitFunction(node:nodes.Function):boolean {

		var fnName = node.getName().toLowerCase(),
			expectedAttrCount = -1,
			actualAttrCount = 0;

		switch(fnName) {
			case 'rgb(':
			case 'hsl(':
				expectedAttrCount = 3;
				break;
			case 'rgba(':
			case 'hsla(':
				expectedAttrCount = 4;
				break;
		}

		if(expectedAttrCount !== -1) {
			node.getArguments().accept((n) => {
				if(n instanceof nodes.BinaryExpression) {
					actualAttrCount += 1;
					return false;
				}
				return true;
			});

			if(actualAttrCount !== expectedAttrCount) {
				this.addEntry(node, lintRules.Rules.ArgsInColorFunction);
			}
		}

		return true;
	}
}


