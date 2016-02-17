/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import lessScanner = require ('./lessScanner');
import scanner = require('vs/languages/css/common/parser/cssScanner');
import cssParser = require('vs/languages/css/common/parser/cssParser');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import errors = require('vs/languages/css/common/parser/cssErrors');

/// <summary>
/// A parser for LESS
/// http://lesscss.org/
/// </summary>
export class LessParser extends cssParser.Parser {

	public constructor() {
		super(new lessScanner.LessScanner());
	}

	public _parseStylesheetStatement():nodes.Node {
		return this._tryParseMixinDeclaration() || super._parseStylesheetStatement() || this._parseVariableDeclaration();
	}

	public _parseImport():nodes.Node {
		var node = <nodes.Import> this.create(nodes.Import);
		if(!this.accept(scanner.TokenType.AtKeyword, '@import') && !this.accept(scanner.TokenType.AtKeyword, '@import-once') /* deprecated in less 1.4.1 */) {
			return null;
		}

		// less 1.4.1: @import (css) "lib"
		if (this.accept(scanner.TokenType.ParenthesisL)) {
			if (!this.accept(scanner.TokenType.Ident)) {
				return this.finish(node, errors.ParseError.IdentifierExpected, [ scanner.TokenType.SemiColon ] );
			}
			if (!this.accept(scanner.TokenType.ParenthesisR)) {
				return this.finish(node, errors.ParseError.RightParenthesisExpected, [ scanner.TokenType.SemiColon ]);
			}
		}

		if(!this.accept(scanner.TokenType.URI) && !this.accept(scanner.TokenType.String)) {
			return this.finish(node, errors.ParseError.URIOrStringExpected, [ scanner.TokenType.SemiColon ]);
		}

		node.setMedialist(this._parseMediaList());

		return this.finish(node);
	}

	public _parseMediaQuery(resyncStopToken: scanner.TokenType[]): nodes.Node {
		var node = <nodes.MediaQuery> super._parseMediaQuery(resyncStopToken);
		if (!node) {
			var node = <nodes.MediaQuery> this.create(nodes.MediaQuery);
			if (node.addChild(this._parseVariable())) {
				return this.finish(node);
			}
			return null;
		}
		return node;
	}

	public _parseVariableDeclaration(panic:scanner.TokenType[]=[]): nodes.VariableDeclaration {
		var node = <nodes.VariableDeclaration> this.create(nodes.VariableDeclaration);

		var mark= this.mark();
		if (!node.setVariable(this._parseVariable())) {
			return null;
		}

		if (this.accept(scanner.TokenType.Colon, ':')) {
			node.colonPosition = this.prevToken.offset;
			if (!node.setValue(this._parseExpr())) {
				return <nodes.VariableDeclaration> this.finish(node, errors.ParseError.VariableValueExpected, [], panic);
			}
		} else {
			this.restoreAtMark(mark);
			return null; // at keyword, but no ':', not a variable declaration but some at keyword
		}
		return <nodes.VariableDeclaration> this.finish(node);
	}

	public _parseVariable(): nodes.Variable {
		var node = <nodes.Variable> this.create(nodes.Variable);
		var mark= this.mark();
		while (this.accept(scanner.TokenType.Delim, '@')) {
			if (this.hasWhitespace()) {
				this.restoreAtMark(mark);
				return null;
			}
		}
		if (!this.accept(scanner.TokenType.AtKeyword)) {
			this.restoreAtMark(mark);
			return null;
		}
		return <nodes.Variable> node;
	}

	public _parseTerm(): nodes.Term {
		var term = super._parseTerm();
		if (term) { return term; }

		term = <nodes.Term> this.create(nodes.Term);
		if (term.setExpression(this._parseVariable()) ||
			term.setExpression(this._parseEscaped())) {

			return <nodes.Term> this.finish(term);
		}

		return null;
	}

	public _parseEscaped():nodes.Node {
		var node = this.createNode(nodes.NodeType.EscapedValue);
		if(this.accept(scanner.TokenType.EscapedJavaScript) ||
			this.accept(scanner.TokenType.BadEscapedJavaScript)) {

			return this.finish(node);
		}

		if(this.accept(scanner.TokenType.Delim, '~')) {
			return this.finish(node, this.accept(scanner.TokenType.String) ? null : errors.ParseError.TermExpected);
		}

		return null;
	}

	public _parseOperator(): nodes.Node {
		var node = this._parseGuardOperator();
		if(node) {
			return node;
		} else {
			return super._parseOperator();
		}
	}

	public _parseGuardOperator(): nodes.Node {
		var node = this.createNode(nodes.NodeType.Operator);
		if (this.accept(scanner.TokenType.Delim, '>')) {
			this.accept(scanner.TokenType.Delim, '=');
			return node;
		} else if (this.accept(scanner.TokenType.Delim,  '=')) {
			this.accept(scanner.TokenType.Delim,  '<');
			return node;
		} else if (this.accept(scanner.TokenType.Delim,  '<')) {
			return node;
		}
		return null;
	}

	public _parseRuleSetDeclaration() : nodes.Node {
		if (this.peek(scanner.TokenType.AtKeyword)) {
			return this._parseKeyframe()
				|| this._parseMedia()
				|| this._parseVariableDeclaration(); // Variable declarations
		}
		return this._tryParseMixinDeclaration()
			|| this._tryParseRuleset(true)  // nested ruleset
			|| this._parseMixinReference() // less mixin reference
			|| this._parseExtend() // less extend declaration
			|| this._parseDeclaration(); // try declaration as the last option
	}

	public _parseSimpleSelectorBody(): nodes.Node {
		return this._parseSelectorCombinator() || super._parseSimpleSelectorBody();
	}

	public _parseSelectorCombinator():nodes.Node {
		var node = this.createNode(nodes.NodeType.SelectorCombinator);
		if (this.accept(scanner.TokenType.Delim, '&')) {
			while (!this.hasWhitespace() && (this.accept(scanner.TokenType.Delim, '-') || node.addChild(this._parseIdent()) || this.accept(scanner.TokenType.Delim, '&'))) {
				//  support &-foo
			}
			return this.finish(node);
		}
		return null;
	}

	public _parseSelectorIdent() : nodes.Node {
		return this._parseIdent() || this._parseSelectorInterpolation();
	}

	public _parseSelectorInterpolation():nodes.Node {
		// Selector interpolation;  old: ~"@{name}", new: @{name}
		var node = this.createNode(nodes.NodeType.SelectorInterpolation);
		if (this.accept(scanner.TokenType.Delim, '~')) {
			if (!this.hasWhitespace() && (this.accept(scanner.TokenType.String) || this.accept(scanner.TokenType.BadString))) {
				return this.finish(node);
			}
			return this.finish(node, errors.ParseError.StringLiteralExpected);
		} else if (this.accept(scanner.TokenType.Delim, '@')) {
			if (this.hasWhitespace() || !this.accept(scanner.TokenType.CurlyL)) {
				return this.finish(node, errors.ParseError.LeftCurlyExpected);
			}
			if (!node.addChild(this._parseIdent())) {
				return this.finish(node, errors.ParseError.IdentifierExpected);
			}
			if (!this.accept(scanner.TokenType.CurlyR)) {
				return this.finish(node, errors.ParseError.RightCurlyExpected);
			}
			return this.finish(node);
		}
		return null;
	}

	public _tryParseMixinDeclaration():nodes.Node {
		if (!this.peek(scanner.TokenType.Delim, '.')) {
			return null;
		}

		var mark = this.mark();
		var node = <nodes.MixinDeclaration> this.create(nodes.MixinDeclaration);

		if (!node.setIdentifier(this._parseMixinDeclarationIdentifier()) || !this.accept(scanner.TokenType.ParenthesisL)) {
			this.restoreAtMark(mark);
			return null;
		}

		if (node.getParameters().addChild(this._parseMixinParameter())) {
			while (this.accept(scanner.TokenType.Comma) || this.accept(scanner.TokenType.SemiColon)) {
				if (!node.getParameters().addChild(this._parseMixinParameter())) {
					return this.finish(node, errors.ParseError.IdentifierExpected);
				}
			}
		}

		if (!this.accept(scanner.TokenType.ParenthesisR)) {
			return this.finish(node, errors.ParseError.RightParenthesisExpected);
		}
		node.setGuard(this._parseGuard());

		if (!this.peek(scanner.TokenType.CurlyL)) {
			this.restoreAtMark(mark);
			return null;
		}

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseMixinDeclarationIdentifier() : nodes.Identifier {
		var identifier = <nodes.Identifier> this.create(nodes.Identifier); // identifier should contain dot
		this.consumeToken(); // .
		if (this.hasWhitespace() || !this.accept(scanner.TokenType.Ident)) {
			return null;
		}
		identifier.referenceTypes = [ nodes.ReferenceType.Mixin ];
		return this.finish(identifier);
	}

	public _parseExtend():nodes.Node {
		if (!this.peek(scanner.TokenType.Delim, '&')) {
			return null;
		}
		var mark = this.mark();

		var node = <nodes.ExtendsReference> this.create(nodes.ExtendsReference);
		this.consumeToken(); // &
		if (this.hasWhitespace() || !this.accept(scanner.TokenType.Colon) || !this.accept(scanner.TokenType.Ident, 'extend')) {
			this.restoreAtMark(mark);
			return null;
		}
		if (!this.accept(scanner.TokenType.ParenthesisL)) {
			return this.finish(node, errors.ParseError.LeftParenthesisExpected);
		}
		if (!node.setSelector(this._parseSimpleSelector())) {
			return this.finish(node, errors.ParseError.SelectorExpected);
		}
		if (!this.accept(scanner.TokenType.ParenthesisR)) {
			return this.finish(node, errors.ParseError.RightParenthesisExpected);
		}
		return this.finish(node);
	}

	public _parseMixinReference():nodes.Node {
		if (!this.peek(scanner.TokenType.Delim, '.')) {
			return null;
		}

		var node = <nodes.MixinReference> this.create(nodes.MixinReference);

		var identifier = <nodes.Identifier> this.create(nodes.Identifier);
		this.consumeToken(); // dot, part of the identifier
		if (this.hasWhitespace() || !this.accept(scanner.TokenType.Ident)) {
			return this.finish(node, errors.ParseError.IdentifierExpected);
		}
		node.setIdentifier(this.finish(identifier));

		if (!this.hasWhitespace() && this.accept(scanner.TokenType.ParenthesisL)) {
			if (node.getArguments().addChild(this._parseFunctionArgument())) {
				while (this.accept(scanner.TokenType.Comma) || this.accept(scanner.TokenType.SemiColon)) {
					if (!node.getArguments().addChild(this._parseExpr())) {
						return this.finish(node, errors.ParseError.ExpressionExpected);
					}
				}
			}
			if (!this.accept(scanner.TokenType.ParenthesisR)) {
				return this.finish(node, errors.ParseError.RightParenthesisExpected);
			}
			identifier.referenceTypes = [ nodes.ReferenceType.Mixin ];
		} else {
			identifier.referenceTypes = [ nodes.ReferenceType.Mixin, nodes.ReferenceType.Rule ];
		}

		node.addChild(this._parsePrio());

		return this.finish(node);
	}

	public _parseMixinParameter():nodes.Node {

		var node = <nodes.FunctionParameter> this.create(nodes.FunctionParameter);

		// special rest variable: @rest...
		if (this.peek(scanner.TokenType.AtKeyword, '@rest')) {
			var restNode = this.create(nodes.Node);
			this.consumeToken();
			if (!this.accept(lessScanner.Ellipsis)) {
				return this.finish(node, errors.ParseError.DotExpected, [], [scanner.TokenType.Comma, scanner.TokenType.ParenthesisR]);
			}
			node.setIdentifier(this.finish(restNode));
			return this.finish(node);
		}

		// special var args: ...
		if (this.peek(lessScanner.Ellipsis)) {
			var varargsNode = this.create(nodes.Node);
			this.consumeToken();
			node.setIdentifier(this.finish(varargsNode));
			return this.finish(node);
		}

		// default variable declaration: @param: 12 or @name
		if (node.setIdentifier(this._parseVariable())) {
			this.accept(scanner.TokenType.Colon);
		}
		node.setDefaultValue(this._parseExpr(true));

		return this.finish(node);
	}

	public _parseGuard():nodes.LessGuard {

		var node = <nodes.LessGuard> this.create(nodes.LessGuard);
		if(!this.accept(scanner.TokenType.Ident, 'when')) {
			return null;
		}

		node.isNegated = this.accept(scanner.TokenType.Ident, 'not');

		if(!node.getConditions().addChild(this._parseGuardCondition())) {
			return <nodes.LessGuard> this.finish(node, errors.ParseError.ConditionExpected);
		}
		while(this.accept(scanner.TokenType.Ident, 'and') || this.accept(scanner.TokenType.Comma, ',')) {
			if(!node.getConditions().addChild(this._parseGuardCondition())) {
				return <nodes.LessGuard> this.finish(node, errors.ParseError.ConditionExpected);
			}
		}

		return <nodes.LessGuard> this.finish(node);
	}

	public _parseGuardCondition():nodes.Node {
		var node = this.create(nodes.GuardCondition);
		if(!this.accept(scanner.TokenType.ParenthesisL)) {
			return null;
		}

		if(!node.addChild(this._parseExpr())) {
			// empty (?)
		}

		if(!this.accept(scanner.TokenType.ParenthesisR)) {
			return this.finish(node, errors.ParseError.RightParenthesisExpected);
		}

		return this.finish(node);
	}

	public _parseFunctionIdentifier(): nodes.Identifier {
		if (this.peek(scanner.TokenType.Delim, '%')) {
			var node = <nodes.Identifier> this.create(nodes.Identifier);
			node.referenceTypes = [ nodes.ReferenceType.Function ];
			this.consumeToken();
			return this.finish(node);
		}

		return super._parseFunctionIdentifier();
	}
}
