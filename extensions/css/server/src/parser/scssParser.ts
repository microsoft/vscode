/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import * as scssScanner from './scssScanner';
import {TokenType} from './cssScanner';
import * as cssParser from './cssParser';
import * as nodes from './cssNodes';

import {SCSSParseError} from './scssErrors';
import {ParseError} from './cssErrors';

/// <summary>
/// A parser for scss
/// http://sass-lang.com/documentation/file.SASS_REFERENCE.html
/// </summary>
export class SCSSParser extends cssParser.Parser {

	public constructor() {
		super(new scssScanner.SCSSScanner());
	}

	public _parseStylesheetStatement(): nodes.Node {
		return super._parseStylesheetStatement()
			|| this._parseVariableDeclaration()
			|| this._parseWarnAndDebug()
			|| this._parseControlStatement()
			|| this._parseMixinDeclaration()
			|| this._parseMixinContent()
			|| this._parseMixinReference() // @include
			|| this._parseFunctionDeclaration();
	}

	public _parseImport(): nodes.Node {
		let node = <nodes.Import>this.create(nodes.Import);
		if (!this.accept(TokenType.AtKeyword, '@import')) {
			return null;
		}

		if (!this.accept(TokenType.URI) && !this.accept(TokenType.String)) {
			return this.finish(node, ParseError.URIOrStringExpected);
		}
		while (this.accept(TokenType.Comma)) {
			if (!this.accept(TokenType.URI) && !this.accept(TokenType.String)) {
				return this.finish(node, ParseError.URIOrStringExpected);
			}
		}

		node.setMedialist(this._parseMediaList());

		return this.finish(node);
	}

	// scss variables: $font-size: 12px;
	public _parseVariableDeclaration(panic: TokenType[] = []): nodes.VariableDeclaration {
		let node = <nodes.VariableDeclaration>this.create(nodes.VariableDeclaration);

		if (!node.setVariable(this._parseVariable())) {
			return null;
		}

		if (!this.accept(TokenType.Colon, ':')) {
			return this.finish(node, ParseError.ColonExpected);
		}
		node.colonPosition = this.prevToken.offset;

		if (!node.setValue(this._parseExpr())) {
			return this.finish(node, ParseError.VariableValueExpected, [], panic);
		}

		if (this.accept(TokenType.Exclamation)) {
			if (!this.accept(TokenType.Ident, 'default', true)) {
				return this.finish(node, ParseError.UnknownKeyword);
			}
		}

		if (this.peek(TokenType.SemiColon)) {
			node.semicolonPosition = this.token.offset; // not part of the declaration, but useful information for code assist
		}

		return this.finish(node);
	}

	public _parseMediaFeatureName(): nodes.Node {
		return this._parseFunction() || this._parseIdent() || this._parseVariable(); // first function, the indent
	}

	public _parseKeyframeSelector(): nodes.Node {
		return super._parseKeyframeSelector() || this._parseMixinContent();
	}

	public _parseVariable(): nodes.Variable {
		let node = <nodes.Variable>this.create(nodes.Variable);
		if (!this.accept(scssScanner.VariableName)) {
			return null;
		}
		return <nodes.Variable>node;
	}

	public _parseIdent(referenceTypes?: nodes.ReferenceType[]): nodes.Identifier {
		let node = <nodes.Identifier>this.create(nodes.Identifier);
		node.referenceTypes = referenceTypes;
		let hasContent = false;
		while (this.accept(TokenType.Ident) || node.addChild(this._parseInterpolation())) {
			hasContent = true;
			if (!this.hasWhitespace() && this.accept(TokenType.Delim, '-')) {
				// '-' is a valid char inside a ident (special treatment here to support #{foo}-#{bar})
			}
			if (this.hasWhitespace()) {
				break;
			}
		}
		return hasContent ? this.finish(node) : null;
	}

	public _parseTerm(): nodes.Term {
		let term = super._parseTerm();
		if (term) { return term; }

		term = <nodes.Term>this.create(nodes.Term);
		if (term.setExpression(this._parseVariable())) {
			return <nodes.Term>this.finish(term);
		}

		return null;
	}

	public _parseInterpolation(): nodes.Node {
		let node = this.create(nodes.Interpolation);
		if (this.accept(scssScanner.InterpolationFunction)) {
			if (!node.addChild(this._parseBinaryExpr())) {
				return this.finish(node, ParseError.ExpressionExpected);
			}
			if (!this.accept(TokenType.CurlyR)) {
				return this.finish(node, ParseError.RightCurlyExpected);
			}
			return this.finish(node);
		}
		return null;
	}

	public _parseOperator(): nodes.Node {
		if (this.peek(scssScanner.EqualsOperator) || this.peek(scssScanner.NotEqualsOperator)
			|| this.peek(scssScanner.GreaterEqualsOperator) || this.peek(scssScanner.SmallerEqualsOperator)
			|| this.peek(TokenType.Delim, '>') || this.peek(TokenType.Delim, '<')
			|| this.peek(TokenType.Ident, 'and') || this.peek(TokenType.Ident, 'or')
			|| this.peek(TokenType.Delim, '%')
		) {
			let node = this.createNode(nodes.NodeType.Operator);
			this.consumeToken();
			return this.finish(node);
		}
		return super._parseOperator();
	}

	public _parseUnaryOperator(): nodes.Node {
		if (this.peek(TokenType.Ident, 'not')) {
			let node = this.create(nodes.Node);
			this.consumeToken();
			return this.finish(node);
		}
		return super._parseUnaryOperator();
	}

	public _parseRuleSetDeclaration(): nodes.Node {
		if (this.peek(TokenType.AtKeyword)) {
			return this._parseKeyframe() // nested @keyframe
				|| this._parseImport() // nested @import
				|| this._parseMedia() // nested @media
				|| this._parseFontFace() // nested @font-face
				|| this._parseWarnAndDebug() // @warn and @debug statements
				|| this._parseControlStatement() // @if, @while, @for, @each
				|| this._parseFunctionDeclaration() // @function
				|| this._parseExtends() // @extends
				|| this._parseMixinReference() // @include
				|| this._parseMixinContent() // @content
				|| this._parseMixinDeclaration(); // nested @mixin
		}
		return this._parseVariableDeclaration() // variable declaration
			|| this._tryParseRuleset(true) // nested ruleset
			|| super._parseRuleSetDeclaration(); // try css ruleset declaration as last so in the error case, the ast will contain a declaration
	}

	public _parseDeclaration(resyncStopTokens?: TokenType[]): nodes.Declaration {
		let node = <nodes.Declaration>this.create(nodes.Declaration);
		if (!node.setProperty(this._parseProperty())) {
			return null;
		}

		if (!this.accept(TokenType.Colon, ':')) {
			return this.finish(node, ParseError.ColonExpected, [TokenType.Colon], resyncStopTokens);
		}
		node.colonPosition = this.prevToken.offset;

		let hasContent = false;
		if (node.setValue(this._parseExpr())) {
			hasContent = true;
			node.addChild(this._parsePrio());
		}
		if (this.peek(TokenType.CurlyL)) {
			node.setNestedProperties(this._parseNestedProperties());
		} else {
			if (!hasContent) {
				return this.finish(node, ParseError.PropertyValueExpected);
			}
		}
		if (this.peek(TokenType.SemiColon)) {
			node.semicolonPosition = this.token.offset; // not part of the declaration, but useful information for code assist
		}
		return this.finish(node);
	}

	public _parseNestedProperties(): nodes.NestedProperties {
		let node = <nodes.NestedProperties>this.create(nodes.NestedProperties);
		return this._parseBody(node, this._parseDeclaration.bind(this));
	}

	public _parseExtends(): nodes.Node {
		let node = <nodes.ExtendsReference>this.create(nodes.ExtendsReference);
		if (this.accept(TokenType.AtKeyword, '@extend')) {
			if (!node.setSelector(this._parseSimpleSelector())) {
				return this.finish(node, ParseError.SelectorExpected);
			}
			if (this.accept(TokenType.Exclamation)) {
				if (!this.accept(TokenType.Ident, 'optional', true)) {
					return this.finish(node, ParseError.UnknownKeyword);
				}
			}
			return this.finish(node);
		}
		return null;
	}

	public _parseSimpleSelectorBody(): nodes.Node {
		return this._parseSelectorCombinator() || this._parseSelectorPlaceholder() || super._parseSimpleSelectorBody();
	}

	public _parseSelectorCombinator(): nodes.Node {
		let node = this.createNode(nodes.NodeType.SelectorCombinator);
		if (this.accept(TokenType.Delim, '&')) {
			while (!this.hasWhitespace() && (this.accept(TokenType.Delim, '-') || node.addChild(this._parseIdent()) || this.accept(TokenType.Delim, '&'))) {
				//  support &-foo
			}
			return this.finish(node);
		}
		return null;
	}

	public _parseSelectorPlaceholder(): nodes.Node {
		let node = this.createNode(nodes.NodeType.SelectorPlaceholder);
		if (this.accept(TokenType.Delim, '%')) {
			this._parseIdent();
			return this.finish(node);
		}
		return null;
	}

	public _parseWarnAndDebug(): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@debug') && !this.peek(TokenType.AtKeyword, '@warn')) {
			return null;
		}
		let node = this.createNode(nodes.NodeType.Debug);
		this.consumeToken(); // @debug or @warn
		node.addChild(this._parseExpr()); // optional
		return this.finish(node);
	}

	public _parseControlStatement(parseStatement: () => nodes.Node = this._parseRuleSetDeclaration.bind(this)): nodes.Node {
		if (!this.peek(TokenType.AtKeyword)) {
			return null;
		}
		return this._parseIfStatement(parseStatement) || this._parseForStatement(parseStatement)
			|| this._parseEachStatement(parseStatement) || this._parseWhileStatement(parseStatement);
	}

	public _parseIfStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@if')) {
			return null;
		}
		return this._internalParseIfStatement(parseStatement);
	}

	private _internalParseIfStatement(parseStatement: () => nodes.Node): nodes.IfStatement {
		let node = <nodes.IfStatement>this.create(nodes.IfStatement);
		this.consumeToken(); // @if or if
		if (!node.setExpression(this._parseBinaryExpr())) {
			return this.finish(node, ParseError.ExpressionExpected);
		}
		this._parseBody(node, parseStatement);
		if (this.accept(TokenType.AtKeyword, '@else')) {
			if (this.peek(TokenType.Ident, 'if')) {
				node.setElseClause(this._internalParseIfStatement(parseStatement));
			} else if (this.peek(TokenType.CurlyL)) {
				let elseNode = <nodes.BodyDeclaration>this.create(nodes.ElseStatement);
				this._parseBody(elseNode, parseStatement);
				node.setElseClause(elseNode);
			}
		}
		return this.finish(node);
	}

	public _parseForStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@for')) {
			return null;
		}

		let node = <nodes.ForStatement>this.create(nodes.ForStatement);
		this.consumeToken(); // @for
		if (!node.setVariable(this._parseVariable())) {
			return this.finish(node, ParseError.VariableNameExpected, [TokenType.CurlyR]);
		}
		if (!this.accept(TokenType.Ident, 'from')) {
			return this.finish(node, SCSSParseError.FromExpected, [TokenType.CurlyR]);
		}
		if (!node.addChild(this._parseBinaryExpr())) {
			return this.finish(node, ParseError.ExpressionExpected, [TokenType.CurlyR]);
		}
		if (!this.accept(TokenType.Ident, 'to') && !this.accept(TokenType.Ident, 'through')) {
			return this.finish(node, SCSSParseError.ThroughOrToExpected, [TokenType.CurlyR]);
		}
		if (!node.addChild(this._parseBinaryExpr())) {
			return this.finish(node, ParseError.ExpressionExpected, [TokenType.CurlyR]);
		}

		return this._parseBody(node, parseStatement);
	}

	public _parseEachStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@each')) {
			return null;
		}

		let node = <nodes.EachStatement>this.create(nodes.EachStatement);
		this.consumeToken(); // @each
		if (!node.setVariable(this._parseVariable())) {
			return this.finish(node, ParseError.VariableNameExpected, [TokenType.CurlyR]);
		}
		if (!this.accept(TokenType.Ident, 'in')) {
			return this.finish(node, SCSSParseError.InExpected, [TokenType.CurlyR]);
		}
		if (!node.addChild(this._parseExpr())) {
			return this.finish(node, ParseError.ExpressionExpected, [TokenType.CurlyR]);
		}

		return this._parseBody(node, parseStatement);
	}

	public _parseWhileStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@while')) {
			return null;
		}

		let node = <nodes.WhileStatement>this.create(nodes.WhileStatement);
		this.consumeToken(); // @while
		if (!node.addChild(this._parseBinaryExpr())) {
			return this.finish(node, ParseError.ExpressionExpected, [TokenType.CurlyR]);
		}

		return this._parseBody(node, parseStatement);
	}

	public _parseFunctionBodyDeclaration(): nodes.Node {
		return this._parseVariableDeclaration() || this._parseReturnStatement()
			|| this._parseControlStatement(this._parseFunctionBodyDeclaration.bind(this));
	}

	public _parseFunctionDeclaration(): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@function')) {
			return null;
		}

		let node = <nodes.FunctionDeclaration>this.create(nodes.FunctionDeclaration);
		this.consumeToken(); // @function

		if (!node.setIdentifier(this._parseIdent([nodes.ReferenceType.Function]))) {
			return this.finish(node, ParseError.IdentifierExpected, [TokenType.CurlyR]);
		}

		if (!this.accept(TokenType.ParenthesisL)) {
			return this.finish(node, ParseError.LeftParenthesisExpected, [TokenType.CurlyR]);
		}

		if (node.getParameters().addChild(this._parseParameterDeclaration())) {
			while (this.accept(TokenType.Comma)) {
				if (!node.getParameters().addChild(this._parseParameterDeclaration())) {
					return this.finish(node, ParseError.VariableNameExpected);
				}
			}
		}

		if (!this.accept(TokenType.ParenthesisR)) {
			return this.finish(node, ParseError.RightParenthesisExpected, [TokenType.CurlyR]);
		}

		return this._parseBody(node, this._parseFunctionBodyDeclaration.bind(this));
	}

	public _parseReturnStatement(): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@return')) {
			return null;
		}

		let node = this.createNode(nodes.NodeType.ReturnStatement);
		this.consumeToken(); // @function

		if (!node.addChild(this._parseExpr())) {
			return this.finish(node, ParseError.ExpressionExpected);
		}
		return this.finish(node);
	}

	public _parseMixinDeclaration(): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@mixin')) {
			return null;
		}

		let node = <nodes.MixinDeclaration>this.create(nodes.MixinDeclaration);
		this.consumeToken();

		if (!node.setIdentifier(this._parseIdent([nodes.ReferenceType.Mixin]))) {
			return this.finish(node, ParseError.IdentifierExpected, [TokenType.CurlyR]);
		}

		if (this.accept(TokenType.ParenthesisL)) {
			if (node.getParameters().addChild(this._parseParameterDeclaration())) {
				while (this.accept(TokenType.Comma)) {
					if (!node.getParameters().addChild(this._parseParameterDeclaration())) {
						return this.finish(node, ParseError.VariableNameExpected);
					}
				}
			}

			if (!this.accept(TokenType.ParenthesisR)) {
				return this.finish(node, ParseError.RightParenthesisExpected, [TokenType.CurlyR]);
			}
		}

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseParameterDeclaration(): nodes.Node {

		let node = <nodes.FunctionParameter>this.create(nodes.FunctionParameter);

		if (!node.setIdentifier(this._parseVariable())) {
			return null;
		}

		if (this.accept(scssScanner.Ellipsis)) {
			// ok
		}

		if (this.accept(TokenType.Colon)) {
			if (!node.setDefaultValue(this._parseExpr(true))) {
				return this.finish(node, ParseError.VariableValueExpected, [], [TokenType.Comma, TokenType.ParenthesisR]);
			}
		}
		return this.finish(node);
	}

	public _parseMixinContent(): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@content')) {
			return null;
		}
		let node = this.createNode(nodes.NodeType.MixinContent);
		this.consumeToken();
		return this.finish(node);
	}


	public _parseMixinReference(): nodes.Node {
		if (!this.peek(TokenType.AtKeyword, '@include')) {
			return null;
		}

		let node = <nodes.MixinReference>this.create(nodes.MixinReference);
		this.consumeToken();

		if (!node.setIdentifier(this._parseIdent([nodes.ReferenceType.Mixin]))) {
			return this.finish(node, ParseError.IdentifierExpected, [TokenType.CurlyR]);
		}

		if (this.accept(TokenType.ParenthesisL)) {
			if (node.getArguments().addChild(this._parseFunctionArgument())) {
				while (this.accept(TokenType.Comma)) {
					if (!node.getArguments().addChild(this._parseFunctionArgument())) {
						return this.finish(node, ParseError.ExpressionExpected);
					}
				}
			}

			if (!this.accept(TokenType.ParenthesisR)) {
				return this.finish(node, ParseError.RightParenthesisExpected);
			}
		}

		if (this.peek(TokenType.CurlyL)) {
			let content = <nodes.BodyDeclaration>this.create(nodes.BodyDeclaration);
			this._parseBody(content, this._parseMixinReferenceBodyStatement.bind(this));
			node.setContent(content);
		}
		return this.finish(node);
	}

	public _parseMixinReferenceBodyStatement(): nodes.Node {
		return this._parseRuleSetDeclaration() || this._parseKeyframeSelector();
	}

	public _parseFunctionArgument(): nodes.Node {
		// [variableName ':'] expression | variableName '...'
		let node = <nodes.FunctionArgument>this.create(nodes.FunctionArgument);

		let pos = this.mark();
		let argument = this._parseVariable();
		if (argument) {
			if (!this.accept(TokenType.Colon)) {
				if (this.accept(scssScanner.Ellipsis)) { // optional
					node.setValue(argument);
					return this.finish(node);
				} else {
					this.restoreAtMark(pos);
				}
			} else {
				node.setIdentifier(argument);
			}
		}

		if (node.setValue(this._parseExpr(true))) {
			return this.finish(node);
		}

		return null;
	}
}