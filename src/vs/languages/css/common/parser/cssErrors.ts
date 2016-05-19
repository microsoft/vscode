/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import nodes = require('./cssNodes');

export class CSSIssueType implements nodes.IRule {
	id: string;
	message: string;

	public constructor(id:string, message: string) {
		this.id = id;
		this.message = message;
	}
}

export var ParseError = {
	NumberExpected: new CSSIssueType('css-numberexpected', nls.localize('expected.number', "number expected")),
	ConditionExpected: new CSSIssueType('css-conditionexpected', nls.localize('expected.condt', "condition expected")),
	RuleOrSelectorExpected: new CSSIssueType('css-ruleorselectorexpected', nls.localize('expected.ruleorselector', "at-rule or selector expected")),
	DotExpected: new CSSIssueType('css-dotexpected', nls.localize('expected.dot', "dot expected")),
	ColonExpected: new CSSIssueType('css-colonexpected', nls.localize('expected.colon', "colon expected")),
	SemiColonExpected: new CSSIssueType('css-semicolonexpected', nls.localize('expected.semicolon', "semi-colon expected")),
	TermExpected: new CSSIssueType('css-termexpected', nls.localize('expected.term', "term expected")),
	ExpressionExpected: new CSSIssueType('css-expressionexpected', nls.localize('expected.expression', "expression expected")),
	OperatorExpected: new CSSIssueType('css-operatorexpected', nls.localize('expected.operator', "operator expected")),
	IdentifierExpected: new CSSIssueType('css-identifierexpected', nls.localize('expected.ident', "identifier expected")),
	PercentageExpected: new CSSIssueType('css-percentageexpected', nls.localize('expected.percentage', "percentage expected")),
	URIOrStringExpected: new CSSIssueType('css-uriorstringexpected', nls.localize('expected.uriorstring', "uri or string expected")),
	URIExpected: new CSSIssueType('css-uriexpected', nls.localize('expected.uri', "URI expected")),
	VariableNameExpected: new CSSIssueType('css-varnameexpected', nls.localize('expected.varname', "variable name expected")),
	VariableValueExpected: new CSSIssueType('css-varvalueexpected', nls.localize('expected.varvalue', "variable value expected")),
	PropertyValueExpected: new CSSIssueType('css-propertyvalueexpected', nls.localize('expected.propvalue', "property value expected")),
	LeftCurlyExpected: new CSSIssueType('css-lcurlyexpected', nls.localize('expected.lcurly', "{ expected")),
	RightCurlyExpected: new CSSIssueType('css-rcurlyexpected', nls.localize('expected.rcurly', "} expected")),
	LeftSquareBracketExpected: new CSSIssueType('css-rbracketexpected', nls.localize('expected.lsquare', "[ expected")),
	RightSquareBracketExpected: new CSSIssueType('css-lbracketexpected', nls.localize('expected.rsquare', "] expected")),
	LeftParenthesisExpected: new CSSIssueType('css-lparentexpected', nls.localize('expected.lparen', "( expected")),
	RightParenthesisExpected: new CSSIssueType('css-rparentexpected', nls.localize('expected.rparent', ") expected")),
	CommaExpected: new CSSIssueType('css-commaexpected', nls.localize('expected.comma', "comma expected")),
	PageDirectiveOrDeclarationExpected: new CSSIssueType('css-pagedirordeclexpected', nls.localize('expected.pagedirordecl', "page directive or declaraton expected")),
	UnknownAtRule: new CSSIssueType('css-unknownatrule', nls.localize('unknown.atrule', "at-rule unknown")),
	UnknownKeyword: new CSSIssueType('css-unknownkeyword', nls.localize('unknown.keyword', "unknown keyword")),
	SelectorExpected: new CSSIssueType('css-selectorexpected', nls.localize('expected.selector', "selector expected")),
	StringLiteralExpected: new CSSIssueType('css-stringliteralexpected', nls.localize('expected.stringliteral', "string literal expected")),
};
