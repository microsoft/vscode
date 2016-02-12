/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import sassScanner = require ('./sassScanner');
import sassErrors = require('./sassErrors');
import scanner = require('vs/languages/css/common/parser/cssScanner');
import cssParser = require('vs/languages/css/common/parser/cssParser');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import errors = require('vs/languages/css/common/parser/cssErrors');

/// <summary>
/// A parser for Sass
/// http://sass-lang.com/documentation/file.SASS_REFERENCE.html
/// </summary>
export class SassParser extends cssParser.Parser {

	public constructor() {
		super(new sassScanner.SassScanner());
	}

	public _parseStylesheetStatement():nodes.Node {
		return super._parseStylesheetStatement()
			|| this._parseVariableDeclaration()
			|| this._parseWarnAndDebug()
			|| this._parseControlStatement()
			|| this._parseMixinDeclaration()
			|| this._parseMixinContent()
			|| this._parseMixinReference() // @include
			|| this._parseFunctionDeclaration();
	}

	public _parseImport():nodes.Node {
		var node = <nodes.Import> this.create(nodes.Import);
		if(!this.accept(scanner.TokenType.AtKeyword, '@import')) {
			return null;
		}

		if (!this.accept(scanner.TokenType.URI) && !this.accept(scanner.TokenType.String)) {
			return this.finish(node, errors.ParseError.URIOrStringExpected);
		}
		while (this.accept(scanner.TokenType.Comma)) {
			if (!this.accept(scanner.TokenType.URI) && !this.accept(scanner.TokenType.String)) {
				return this.finish(node, errors.ParseError.URIOrStringExpected);
			}
		}

		node.setMedialist(this._parseMediaList());

		return this.finish(node);
	}

	// Sass variables: $font-size: 12px;
	public _parseVariableDeclaration(panic:scanner.TokenType[]=[]): nodes.VariableDeclaration {
		var node = <nodes.VariableDeclaration> this.create(nodes.VariableDeclaration);

		if (!node.setVariable(this._parseVariable())) {
			return null;
		}

		if (!this.accept(scanner.TokenType.Colon, ':')) {
			return this.finish(node, errors.ParseError.ColonExpected);
		}
		node.colonPosition = this.prevToken.offset;

		if (!node.setValue(this._parseExpr())) {
			return this.finish(node, errors.ParseError.VariableValueExpected, [], panic);
		}

		if (this.accept(scanner.TokenType.Exclamation)) {
			if (!this.accept(scanner.TokenType.Ident, 'default', true)) {
				return this.finish(node, errors.ParseError.UnknownKeyword);
			}
		}

		return this.finish(node);
	}

	public _parseMediaFeatureName() : nodes.Node {
		return this._parseFunction() || this._parseIdent() || this._parseVariable(); // first function, the indent
	}

	public _parseKeyframeSelector():nodes.Node {
		return super._parseKeyframeSelector() || this._parseMixinContent();
	}

	public _parseVariable(): nodes.Variable {
		var node = <nodes.Variable> this.create(nodes.Variable);
		if (!this.accept(sassScanner.VariableName)) {
			return null;
		}
		return <nodes.Variable> node;
	}

	public _parseIdent(referenceTypes?: nodes.ReferenceType[]): nodes.Identifier {
		var node = <nodes.Identifier> this.create(nodes.Identifier);
		node.referenceTypes = referenceTypes;
		var hasContent = false;
		while (this.accept(scanner.TokenType.Ident) || node.addChild(this._parseInterpolation())) {
			hasContent = true;
			if (!this.hasWhitespace() && this.accept(scanner.TokenType.Delim, '-')) {
				// '-' is a valid char inside a ident (special treatment here to support #{foo}-#{bar})
			}
			if (this.hasWhitespace()) {
				break;
			}
		}
		return hasContent ? this.finish(node) : null;
	}

	public _parseTerm(): nodes.Term {
		var term = super._parseTerm();
		if (term) { return term; }

		term = <nodes.Term> this.create(nodes.Term);
		if (term.setExpression(this._parseVariable())) {
			return <nodes.Term> this.finish(term);
		}

		return null;
	}

	public _parseInterpolation():nodes.Node {
		var node = this.create(nodes.Interpolation);
		if (this.accept(sassScanner.InterpolationFunction)) {
			if (!node.addChild(this._parseBinaryExpr())) {
				return this.finish(node, errors.ParseError.ExpressionExpected);
			}
			if (!this.accept(scanner.TokenType.CurlyR)) {
				return this.finish(node, errors.ParseError.RightCurlyExpected);
			}
			return this.finish(node);
		}
		return null;
	}

	public _parseOperator(): nodes.Node {
		var node = this.createNode(nodes.NodeType.Operator);
		if (this.peek(sassScanner.EqualsOperator) || this.peek(sassScanner.NotEqualsOperator)
			|| this.peek(sassScanner.GreaterEqualsOperator) || this.peek(sassScanner.SmallerEqualsOperator)
			|| this.peek(scanner.TokenType.Delim, '>') || this.peek(scanner.TokenType.Delim, '<')
			|| this.peek(scanner.TokenType.Ident, 'and') || this.peek(scanner.TokenType.Ident, 'or')
			|| this.peek(scanner.TokenType.Delim, '%')
			) {
			var node = this.createNode(nodes.NodeType.Operator);
			this.consumeToken();
			return this.finish(node);
		}
		return super._parseOperator();
	}

	public _parseUnaryOperator(): nodes.Node {
		if (this.peek(scanner.TokenType.Ident, 'not')) {
			var node = this.create(nodes.Node);
			this.consumeToken();
			return this.finish(node);
		}
		return super._parseUnaryOperator();
	}

	public _parseRuleSetDeclaration() : nodes.Node {
		if (this.peek(scanner.TokenType.AtKeyword)) {
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
			|| this._parseDeclaration(); // try declaration as last so in the error case, the ast will contain a declaration
	}

	public _parseDeclaration(resyncStopTokens?:scanner.TokenType[]): nodes.Declaration {
		var node = <nodes.Declaration> this.create(nodes.Declaration);
		if (!node.setProperty(this._parseProperty())) {
			return null;
		}

		if (!this.accept(scanner.TokenType.Colon, ':')) {
			return this.finish(node, errors.ParseError.ColonExpected, [ scanner.TokenType.Colon ], resyncStopTokens);
		}
		node.colonPosition = this.prevToken.offset;

		var hasContent = false;
		if (node.setValue(this._parseExpr())) {
			hasContent = true;
			node.addChild(this._parsePrio());
		}
		if (this.peek(scanner.TokenType.CurlyL)) {
			node.setNestedProperties(this._parseNestedProperties());
		} else {
			if (!hasContent) {
				return this.finish(node, errors.ParseError.PropertyValueExpected);
			}
		}
		if (this.peek(scanner.TokenType.SemiColon)) {
			node.semicolonPosition = this.token.offset; // not part of the declaration, but useful information for code assist
		}
		return this.finish(node);
	}

	public _parseNestedProperties(): nodes.NestedProperties {
		var node = <nodes.NestedProperties> this.create(nodes.NestedProperties);
		return this._parseBody(node, this._parseDeclaration.bind(this));
	}

	public _parseExtends(): nodes.Node {
		var node = <nodes.ExtendsReference> this.create(nodes.ExtendsReference);
		if (this.accept(scanner.TokenType.AtKeyword, '@extend')) {
			if (!node.setSelector(this._parseSimpleSelector())) {
				return this.finish(node, errors.ParseError.SelectorExpected);
			}
			if (this.accept(scanner.TokenType.Exclamation)) {
				if (!this.accept(scanner.TokenType.Ident, 'optional', true)) {
					return this.finish(node, errors.ParseError.UnknownKeyword);
				}
			}
			return this.finish(node);
		}
		return null;
	}

	public _parseSimpleSelectorBody(): nodes.Node {
		return this._parseSelectorCombinator() || this._parseSelectorPlaceholder() || super._parseSimpleSelectorBody();
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

	public _parseSelectorPlaceholder():nodes.Node {
		var node = this.createNode(nodes.NodeType.SelectorPlaceholder);
		if (this.accept(scanner.TokenType.Delim, '%')) {
			this._parseIdent();
			return this.finish(node);
		}
		return null;
	}

	public _parseWarnAndDebug(): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@debug') && !this.peek(scanner.TokenType.AtKeyword, '@warn')) {
			return null;
		}
		var node = this.createNode(nodes.NodeType.Debug);
		this.consumeToken(); // @debug or @warn
		node.addChild(this._parseExpr()); // optional
		return this.finish(node);
	}

	public _parseControlStatement(parseStatement: () => nodes.Node = this._parseRuleSetDeclaration.bind(this)): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword)) {
			return null;
		}
		return this._parseIfStatement(parseStatement) || this._parseForStatement(parseStatement)
			|| this._parseEachStatement(parseStatement) || this._parseWhileStatement(parseStatement);
	}

	public _parseIfStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@if')) {
			return null;
		}
		return this._internalParseIfStatement(parseStatement);
	}

	private _internalParseIfStatement(parseStatement: () => nodes.Node): nodes.IfStatement {
		var node = <nodes.IfStatement> this.create(nodes.IfStatement);
		this.consumeToken(); // @if or if
		if (!node.setExpression(this._parseBinaryExpr())) {
			return this.finish(node, errors.ParseError.ExpressionExpected);
		}
		this._parseBody(node, parseStatement);
		if (this.accept(scanner.TokenType.AtKeyword, '@else')) {
			if (this.peek(scanner.TokenType.Ident, 'if')) {
				node.setElseClause(this._internalParseIfStatement(parseStatement));
			} else if (this.peek(scanner.TokenType.CurlyL)) {
				var elseNode = <nodes.BodyDeclaration> this.create(nodes.ElseStatement);
				this._parseBody(elseNode, parseStatement);
				node.setElseClause(elseNode);
			}
		}
		return this.finish(node);
	}

	public _parseForStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@for')) {
			return null;
		}

		var node = <nodes.ForStatement> this.create(nodes.ForStatement);
		this.consumeToken(); // @for
		if (!node.setVariable(this._parseVariable())) {
			return this.finish(node, errors.ParseError.VariableNameExpected, [ scanner.TokenType.CurlyR ]);
		}
		if (!this.accept(scanner.TokenType.Ident, 'from')) {
			return this.finish(node, sassErrors.ParseError.FromExpected, [ scanner.TokenType.CurlyR ]);
		}
		if (!node.addChild(this._parseBinaryExpr())) {
			return this.finish(node, errors.ParseError.ExpressionExpected, [ scanner.TokenType.CurlyR ]);
		}
		if (!this.accept(scanner.TokenType.Ident, 'to') && !this.accept(scanner.TokenType.Ident, 'through')) {
			return this.finish(node, sassErrors.ParseError.ThroughOrToExpected, [ scanner.TokenType.CurlyR ]);
		}
		if (!node.addChild(this._parseBinaryExpr())) {
			return this.finish(node, errors.ParseError.ExpressionExpected, [ scanner.TokenType.CurlyR ]);
		}

		return this._parseBody(node, parseStatement);
	}

	public _parseEachStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@each')) {
			return null;
		}

		var node = <nodes.EachStatement> this.create(nodes.EachStatement);
		this.consumeToken(); // @each
		if (!node.setVariable(this._parseVariable())) {
			return this.finish(node, errors.ParseError.VariableNameExpected, [ scanner.TokenType.CurlyR ]);
		}
		if (!this.accept(scanner.TokenType.Ident, 'in')) {
			return this.finish(node, sassErrors.ParseError.InExpected, [ scanner.TokenType.CurlyR ]);
		}
		if (!node.addChild(this._parseExpr())) {
			return this.finish(node, errors.ParseError.ExpressionExpected, [ scanner.TokenType.CurlyR ]);
		}

		return this._parseBody(node, parseStatement);
	}

	public _parseWhileStatement(parseStatement: () => nodes.Node): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@while')) {
			return null;
		}

		var node = <nodes.WhileStatement> this.create(nodes.WhileStatement);
		this.consumeToken(); // @while
		if (!node.addChild(this._parseBinaryExpr())) {
			return this.finish(node, errors.ParseError.ExpressionExpected, [ scanner.TokenType.CurlyR ]);
		}

		return this._parseBody(node, parseStatement);
	}

	public _parseFunctionBodyDeclaration(): nodes.Node {
		return this._parseVariableDeclaration() || this._parseReturnStatement()
			|| this._parseControlStatement(this._parseFunctionBodyDeclaration.bind(this));
	}

	public _parseFunctionDeclaration(): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@function')) {
			return null;
		}

		var node = <nodes.FunctionDeclaration> this.create(nodes.FunctionDeclaration);
		this.consumeToken(); // @function

		if (!node.setIdentifier(this._parseIdent([nodes.ReferenceType.Function ]))) {
			return this.finish(node, errors.ParseError.IdentifierExpected, [ scanner.TokenType.CurlyR ]);
		}

		if (!this.accept(scanner.TokenType.ParenthesisL)) {
			return this.finish(node, errors.ParseError.LeftParenthesisExpected, [ scanner.TokenType.CurlyR ] );
		}

		if (node.getParameters().addChild(this._parseParameterDeclaration())) {
			while (this.accept(scanner.TokenType.Comma)) {
				if (!node.getParameters().addChild(this._parseParameterDeclaration())) {
					return this.finish(node, errors.ParseError.VariableNameExpected);
				}
			}
		}

		if (!this.accept(scanner.TokenType.ParenthesisR)) {
			return this.finish(node, errors.ParseError.RightParenthesisExpected, [ scanner.TokenType.CurlyR ] );
		}

		return this._parseBody(node, this._parseFunctionBodyDeclaration.bind(this));
	}

	public _parseReturnStatement(): nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@return')) {
			return null;
		}

		var node = this.createNode(nodes.NodeType.ReturnStatement);
		this.consumeToken(); // @function

		if (!node.addChild(this._parseExpr())) {
			return this.finish(node, errors.ParseError.ExpressionExpected);
		}
		return this.finish(node);
	}

	public _parseMixinDeclaration():nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@mixin')) {
			return null;
		}

		var node = <nodes.MixinDeclaration> this.create(nodes.MixinDeclaration);
		this.consumeToken();

		if (!node.setIdentifier(this._parseIdent([nodes.ReferenceType.Mixin]))) {
			return this.finish(node, errors.ParseError.IdentifierExpected, [ scanner.TokenType.CurlyR ]);
		}

		if (this.accept(scanner.TokenType.ParenthesisL)) {
			if (node.getParameters().addChild(this._parseParameterDeclaration())) {
				while (this.accept(scanner.TokenType.Comma)) {
					if (!node.getParameters().addChild(this._parseParameterDeclaration())) {
						return this.finish(node, errors.ParseError.VariableNameExpected);
					}
				}
			}

			if (!this.accept(scanner.TokenType.ParenthesisR)) {
				return this.finish(node, errors.ParseError.RightParenthesisExpected, [ scanner.TokenType.CurlyR ] );
			}
		}

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseParameterDeclaration():nodes.Node {

		var node = <nodes.FunctionParameter> this.create(nodes.FunctionParameter);

		if (!node.setIdentifier(this._parseVariable())) {
			return null;
		}

		if (this.accept(sassScanner.Ellipsis)) {
			// ok
		}

		if (this.accept(scanner.TokenType.Colon)) {
			if (!node.setDefaultValue(this._parseExpr(true))) {
				return this.finish(node, errors.ParseError.VariableValueExpected, [], [scanner.TokenType.Comma, scanner.TokenType.ParenthesisR]);
			}
		}
		return this.finish(node);
	}

	public _parseMixinContent():nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@content')) {
			return null;
		}
		var node = this.createNode(nodes.NodeType.MixinContent);
		this.consumeToken();
		return this.finish(node);
	}


	public _parseMixinReference():nodes.Node {
		if (!this.peek(scanner.TokenType.AtKeyword, '@include')) {
			return null;
		}

		var node = <nodes.MixinReference> this.create(nodes.MixinReference);
		this.consumeToken();

		if (!node.setIdentifier(this._parseIdent([nodes.ReferenceType.Mixin]))) {
			return this.finish(node, errors.ParseError.IdentifierExpected, [ scanner.TokenType.CurlyR ]);
		}

		if (this.accept(scanner.TokenType.ParenthesisL)) {
			if (node.getArguments().addChild(this._parseFunctionArgument())) {
				while (this.accept(scanner.TokenType.Comma)) {
					if (!node.getArguments().addChild(this._parseFunctionArgument())) {
						return this.finish(node, errors.ParseError.ExpressionExpected);
					}
				}
			}

			if (!this.accept(scanner.TokenType.ParenthesisR)) {
				return this.finish(node, errors.ParseError.RightParenthesisExpected);
			}
		}

		if (this.peek(scanner.TokenType.CurlyL)) {
			var content = <nodes.BodyDeclaration> this.create(nodes.BodyDeclaration);
			this._parseBody(content, this._parseMixinReferenceBodyStatement.bind(this));
			node.setContent(content);
		}
		return this.finish(node);
	}

	public _parseMixinReferenceBodyStatement(): nodes.Node {
		return this._parseRuleSetDeclaration() || this._parseKeyframeSelector();
	}

	public _parseFunctionArgument():nodes.Node {
		// [variableName ':'] expression | variableName '...'
		var node = <nodes.FunctionArgument> this.create(nodes.FunctionArgument);

		var pos = this.mark();
		var argument = this._parseVariable();
		if (argument) {
			if (!this.accept(scanner.TokenType.Colon)) {
				if (this.accept(sassScanner.Ellipsis)) { // optional
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