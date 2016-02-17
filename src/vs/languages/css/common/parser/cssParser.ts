/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import types = require ('vs/base/common/types');
import scanner = require ('./cssScanner');
import nodes = require ('./cssNodes');
import _level = require('vs/languages/css/common/level');
import errors = require('./cssErrors');
import languageFacts = require('vs/languages/css/common/services/languageFacts');
import EditorCommon = require('vs/editor/common/editorCommon');

export interface IMark {
	prev: scanner.IToken;
	curr: scanner.IToken;
	pos: number;
}

/// <summary>
/// A parser for the css core specification. See for reference:
/// http://www.w3.org/TR/CSS21/syndata.html#tokenization
/// </summary>
export class Parser {

	public scanner: scanner.Scanner;
	public token: scanner.IToken;
	public prevToken: scanner.IToken;

	private lastErrorToken: scanner.IToken;

	constructor(scnr: scanner.Scanner=new scanner.Scanner()) {
		this.scanner = scnr;
		this.token = null;
		this.prevToken = null;
	}

	public peek(type:scanner.TokenType, text?:string, ignoreCase:boolean=true): boolean {
		if (type !== this.token.type) {
			return false;
		}
		if (typeof text !== 'undefined') {
			if(ignoreCase) {
				return text.toLowerCase() === this.token.text.toLowerCase();
			} else {
				return text === this.token.text;
			}
		}
		return true;
	}

	public peekRegEx(type:scanner.TokenType, regEx: RegExp): boolean {
		if (type !== this.token.type) {
			return false;
		}
		return regEx.test(this.token.text);
	}

	public hasWhitespace():boolean {
		return this.prevToken && (this.prevToken.offset + this.prevToken.len !== this.token.offset);
	}

	public consumeToken() : void {
		this.prevToken = this.token;
		this.token = this.scanner.scan();
	}

	public mark(): IMark {
		return {
			prev: this.prevToken,
			curr: this.token,
			pos: this.scanner.pos()
		};
	}

	public restoreAtMark(mark: IMark): void {
		this.prevToken= mark.prev;
		this.token= mark.curr;
		this.scanner.goBackTo(mark.pos);
	}

	public acceptOne(type: scanner.TokenType, text?: string[], ignoreCase:boolean=true): boolean {
		for (var i = 0 ; i < text.length; i++) {
			if(this.peek(type, text[i], ignoreCase)) {
				this.consumeToken();
				return true;
			}
		}
		return false;
	}


	public accept(type: scanner.TokenType, text?: string, ignoreCase:boolean=true): boolean {
		if(this.peek(type, text, ignoreCase)) {
			this.consumeToken();
			return true;
		}
		return false;
	}

	public resync(resyncTokens: scanner.TokenType[], resyncStopTokens: scanner.TokenType[]): boolean {
		while (true) {
			if (resyncTokens && resyncTokens.indexOf(this.token.type) !== -1) {
				this.consumeToken();
				return true;
			} else if (resyncStopTokens && resyncStopTokens.indexOf(this.token.type) !== -1) {
				return true;
			} else {
				if (this.token.type === scanner.TokenType.EOF) {
					return false;
				}
				this.token = this.scanner.scan();
			}
		}
	}

	public createNode(nodeType:nodes.NodeType): nodes.Node {
		return new nodes.Node(this.token.offset, this.token.len, nodeType);
	}

	public create(ctor: any): nodes.Node {
		return types.create(ctor, this.token.offset, this.token.len);
	}

	public finish<T extends nodes.Node>(node:T, error?: errors.CSSIssueType, resyncTokens?: scanner.TokenType[], resyncStopTokens?: scanner.TokenType[]): T {
		// parseNumeric misuses error for boolean flagging (however the real error mustn't be a false)
		// + nodelist offsets mustn't be modified, because there is a offset hack in rulesets for smartselection
		if (!(node instanceof nodes.Nodelist)) {
			if (error) {
				this.markError(node, error, resyncTokens, resyncStopTokens);
			}
			// set the node end position
			if ( this.prevToken !== null) {
				// length with more elements belonging together
				var prevEnd = this.prevToken.offset + this.prevToken.len;
				node.length = prevEnd > node.offset ? prevEnd - node.offset: 0; // offset is taken from current token, end from previous: Use 0 for empty nodes
			}

		}
		return node;
	}

	public markError<T extends nodes.Node>(node:T, error: errors.CSSIssueType, resyncTokens?: scanner.TokenType[], resyncStopTokens?: scanner.TokenType[]): void {
		if (this.token !== this.lastErrorToken) { // do not report twice on the same token
			node.addIssue(new nodes.Marker(node, error, _level.Level.Error, null, this.token.offset, this.token.len));
			this.lastErrorToken = this.token;
		}
		if (resyncTokens || resyncStopTokens) {
			this.resync(resyncTokens, resyncStopTokens);
		}
	}

	public parseStylesheet(model: EditorCommon.IMirrorModel): nodes.Stylesheet {
		var versionId = model.getVersionId();
		var textProvider = (offset:number, length:number) => {
				if (model.getVersionId() !== versionId) {
					throw new Error('Underlying model has changed, AST is no longer valid');
				}
				var range = model.getRangeFromOffsetAndLength(offset, length);
				return model.getValueInRange(range);
			};

		return this.internalParse(model.getValue(), this._parseStylesheet, textProvider);
	}

	public internalParse<T extends nodes.Node>(input: string, parseFunc:()=>T, textProvider?:nodes.ITextProvider): T {
		this.scanner.setSource(input);
		this.token = this.scanner.scan();
		var node = parseFunc.bind(this)();
		if (node) {
			if (textProvider) {
				node.textProvider = textProvider;
			} else {
				node.textProvider = (offset:number, length:number) => { return input.substr(offset, length); };
			}
		}
		return node;
	}

	public _parseStylesheet(): nodes.Stylesheet {
		var node = <nodes.Stylesheet> this.create(nodes.Stylesheet);
		node.addChild(this._parseCharset());

		var inRecovery= false;
		do {
			var hasMatch = false;
			do {
				hasMatch= false;
				var statement = this._parseStylesheetStatement();
				if (statement) {
					node.addChild(statement);
					hasMatch= true;
					inRecovery = false;
					if (!this.peek(scanner.TokenType.EOF) && this._needsSemicolonAfter(statement) && !this.accept(scanner.TokenType.SemiColon)) {
						this.markError(node, errors.ParseError.SemiColonExpected);
					}
				}
				while (this.accept(scanner.TokenType.SemiColon) || this.accept(scanner.TokenType.CDO) || this.accept(scanner.TokenType.CDC)) {
					// accept empty statements
					hasMatch= true;
					inRecovery = false;
				}
			} while (hasMatch);

			if (this.peek(scanner.TokenType.EOF)) {
				break;
			}

			if (!inRecovery) {
				if (this.peek(scanner.TokenType.AtKeyword)) {
					this.markError(node, errors.ParseError.UnknownAtRule);
				} else {
					this.markError(node, errors.ParseError.RuleOrSelectorExpected);
				}
				inRecovery= true;
			}
			this.consumeToken();
		} while (!this.peek(scanner.TokenType.EOF));

		return this.finish(node);
	}

	public _parseStylesheetStatement():nodes.Node {
		return this._parseRuleset(false)
			|| this._parseImport()
			|| this._parseMedia()
			|| this._parsePage()
			|| this._parseFontFace()
			|| this._parseKeyframe()
			|| this._parseMSViewPort()
			|| this._parseNamespace()
			|| this._parseDocument();
	}

	public _tryParseRuleset(isNested: boolean): nodes.RuleSet {
		var mark= this.mark();
		if (this._parseSelector(isNested)) {
			while (this.accept(scanner.TokenType.Comma) && this._parseSelector(isNested)) {
				// loop
			}
			if (this.accept(scanner.TokenType.CurlyL)) {
				this.restoreAtMark(mark);
				return this._parseRuleset(isNested);
			}
		}
		this.restoreAtMark(mark);
		return null;
	}

	public _parseRuleset(isNested: boolean = false): nodes.RuleSet {
		var node = <nodes.RuleSet> this.create(nodes.RuleSet);

		if(!node.getSelectors().addChild(this._parseSelector(isNested))) {
			return null;
		}

		while (this.accept(scanner.TokenType.Comma) && node.getSelectors().addChild(this._parseSelector(isNested))) {
			// loop
		}

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseRuleSetDeclaration() : nodes.Node {
		return this._parseDeclaration();
	}

	public _needsSemicolonAfter(node: nodes.Node) : boolean {
		switch (node.type) {
			case nodes.NodeType.Keyframe:
			case nodes.NodeType.MSViewPort:
			case nodes.NodeType.Media:
			case nodes.NodeType.Ruleset:
			case nodes.NodeType.Namespace:
			case nodes.NodeType.If:
			case nodes.NodeType.For:
			case nodes.NodeType.Each:
			case nodes.NodeType.While:
			case nodes.NodeType.MixinDeclaration:
			case nodes.NodeType.FunctionDeclaration:
				return false;
			case nodes.NodeType.VariableDeclaration:
			case nodes.NodeType.ExtendsReference:
			case nodes.NodeType.MixinContent:
			case nodes.NodeType.ReturnStatement:
			case nodes.NodeType.MediaQuery:
			case nodes.NodeType.Debug:
			case nodes.NodeType.Import:
				return true;
			case nodes.NodeType.MixinReference:
				return !(<nodes.MixinReference> node).getContent();
			case nodes.NodeType.Declaration:
				return !(<nodes.Declaration> node).getNestedProperties();
		}
		return false;
	}

	public _parseDeclarations(parseDeclaration: () => nodes.Node) : nodes.Declarations {
		var node = <nodes.Declarations> this.create(nodes.Declarations);
		if (!this.accept(scanner.TokenType.CurlyL)) {
			return null;
		}

		var decl = parseDeclaration();
		while (node.addChild(decl)) {
			if (this.peek(scanner.TokenType.CurlyR)) {
				break;
			}
			if (this._needsSemicolonAfter(decl) && !this.accept(scanner.TokenType.SemiColon)) {
				return this.finish(node, errors.ParseError.SemiColonExpected, [ scanner.TokenType.SemiColon, scanner.TokenType.CurlyR ]);
			}
			while (this.accept(scanner.TokenType.SemiColon)) {
				// accept empty statements
			}
			decl = parseDeclaration();
		}

		if (!this.accept(scanner.TokenType.CurlyR)) {
			return this.finish(node, errors.ParseError.RightCurlyExpected, [scanner.TokenType.CurlyR, scanner.TokenType.SemiColon ]);
		}
		return this.finish(node);
	}

	public _parseBody<T extends nodes.BodyDeclaration>(node: T, parseDeclaration: () => nodes.Node): T {
		if (!node.setDeclarations(this._parseDeclarations(parseDeclaration))) {
			return this.finish(node, errors.ParseError.LeftCurlyExpected, [scanner.TokenType.CurlyR, scanner.TokenType.SemiColon ]);
		}
		return this.finish(node);
	}

	public _parseSelector(isNested: boolean): nodes.Selector {
		var node = <nodes.Selector> this.create(nodes.Selector);

		var hasContent = false;
		if (isNested) {
			// nested selectors can start with a combinator
			hasContent = node.addChild(this._parseCombinator());
		}
		while (node.addChild(this._parseSimpleSelector())) {
			hasContent = true;
			node.addChild(this._parseCombinator()); // optional
		}
		return hasContent ? this.finish(node) : null;
	}

	public _parseDeclaration(resyncStopTokens?:scanner.TokenType[]): nodes.Declaration {
		var node = <nodes.Declaration> this.create(nodes.Declaration);
		if (!node.setProperty(this._parseProperty())) {
			return null;
		}

		if (!this.accept(scanner.TokenType.Colon)) {
			return <nodes.Declaration> this.finish(node, errors.ParseError.ColonExpected, [ scanner.TokenType.Colon ], resyncStopTokens);
		}
		node.colonPosition = this.prevToken.offset;

		if (!node.setValue(this._parseExpr())) {
			return this.finish(node, errors.ParseError.PropertyValueExpected);
		}
		node.addChild(this._parsePrio());

		if (this.peek(scanner.TokenType.SemiColon)) {
			node.semicolonPosition = this.token.offset; // not part of the declaration, but useful information for code assist
		}

		return this.finish(node);
	}

	public _tryToParseDeclaration(): nodes.Declaration {
		var mark= this.mark();
		if (this._parseProperty() && this.accept(scanner.TokenType.Colon)) {
			// looks like a declaration, go ahead
			this.restoreAtMark(mark);
			return this._parseDeclaration();
		}

		this.restoreAtMark(mark);
		return null;
	}

	public _parseProperty(): nodes.Property {
		var node = <nodes.Property> this.create(nodes.Property);

		var mark= this.mark();
		if (this.accept(scanner.TokenType.Delim, '*') || this.accept(scanner.TokenType.Delim, '_')) {
			// support for  IE 5.x, 6 and 7 star hack: see http://en.wikipedia.org/wiki/CSS_filter#Star_hack
			if (this.hasWhitespace()) {
				this.restoreAtMark(mark);
				return null;
			}
		}
		if (node.setIdentifier(this._parseIdent())) {
			return <nodes.Property> this.finish(node);
		}
		return null;
	}

	public _parseCharset():nodes.Node {
		var node = this.create(nodes.Node);
		if(!this.accept(scanner.TokenType.Charset)) {
			return null;
		}
		if (!this.accept(scanner.TokenType.String)) {
			return this.finish(node, errors.ParseError.IdentifierExpected);
		}
		if(!this.accept(scanner.TokenType.SemiColon)) {
			return this.finish(node, errors.ParseError.SemiColonExpected);
		}
		return this.finish(node);
	}



	public _parseImport():nodes.Node {
		var node = <nodes.Import> this.create(nodes.Import);
		if(!this.accept(scanner.TokenType.AtKeyword, '@import')) {
			return null;
		}

		if(!this.accept(scanner.TokenType.URI) && !this.accept(scanner.TokenType.String)) {
			return this.finish(node, errors.ParseError.URIOrStringExpected);
		}

		node.setMedialist(this._parseMediaList());

		return this.finish(node);
	}

	public _parseNamespace():nodes.Node {
		// http://www.w3.org/TR/css3-namespace/
		// namespace  : NAMESPACE_SYM S* [IDENT S*]? [STRING|URI] S* ';' S*

		var node = <nodes.Namespace> this.create(nodes.Namespace);
		if(!this.accept(scanner.TokenType.AtKeyword, '@namespace')) {
			return null;
		}

		node.addChild(this._parseIdent()); // optional prefix

		if( !this.accept(scanner.TokenType.URI) && !this.accept(scanner.TokenType.String)) {
			return this.finish(node, errors.ParseError.URIExpected, [ scanner.TokenType.SemiColon ]);
		}

		if(!this.accept(scanner.TokenType.SemiColon)) {
			return this.finish(node, errors.ParseError.SemiColonExpected);
		}

		return this.finish(node);
	}

	public _parseFontFace():nodes.Node {
		if(!this.peek(scanner.TokenType.AtKeyword, '@font-face')) {
			return null;
		}
		var node = <nodes.FontFace> this.create(nodes.FontFace);
		this.consumeToken(); // @font-face

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseMSViewPort():nodes.Node {
		if(!this.peek(scanner.TokenType.AtKeyword, '@-ms-viewport')) {
			return null;
		}
		var node = <nodes.MSViewPort> this.create(nodes.MSViewPort);
		this.consumeToken(); // @-ms-viewport

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseKeyframe():nodes.Node {
		var node = <nodes.Keyframe> this.create(nodes.Keyframe);

		var atNode = this.create(nodes.Node);

		if(!this.accept(scanner.TokenType.AtKeyword, '@keyframes') &&
			!this.accept(scanner.TokenType.AtKeyword, '@-webkit-keyframes') &&
			!this.accept(scanner.TokenType.AtKeyword, '@-ms-keyframes') &&
			!this.accept(scanner.TokenType.AtKeyword, '@-moz-keyframes') &&
			!this.accept(scanner.TokenType.AtKeyword, '@-o-keyframes')) {

			return null;
		}
		node.setKeyword(this.finish(atNode));
		if (atNode.getText() === '@-ms-keyframes') { // -ms-keyframes never existed
			this.markError(atNode, errors.ParseError.UnknownKeyword);
		}

		if (!node.setIdentifier(this._parseIdent([ nodes.ReferenceType.Keyframe ]))) {
			return this.finish(node, errors.ParseError.IdentifierExpected, [ scanner.TokenType.CurlyR ]);
		}

		return this._parseBody(node, this._parseKeyframeSelector.bind(this));
	}

	public _parseKeyframeSelector():nodes.Node {
		var node = <nodes.KeyframeSelector> this.create(nodes.KeyframeSelector);

		if (!node.addChild(this._parseIdent()) && !this.accept(scanner.TokenType.Percentage)) {
			return null;
		}

		while (this.accept(scanner.TokenType.Comma)) {
			if (!node.addChild(this._parseIdent()) && !this.accept(scanner.TokenType.Percentage)) {
				return this.finish(node, errors.ParseError.PercentageExpected);
			}
		}

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}

	public _parseMediaDeclaration(): nodes.Node {
		return this._tryParseRuleset(false) || this._tryToParseDeclaration() || this._parseStylesheetStatement();
	}

	public _parseMedia(): nodes.Node {
		// MEDIA_SYM S* media_query_list '{' S* ruleset* '}' S*
		// media_query_list : S* [media_query [ ',' S* media_query ]* ]?
		var node = <nodes.Media> this.create(nodes.Media);
		if (!this.accept(scanner.TokenType.AtKeyword, '@media')) {
			return null;
		}
		if (!node.addChild(this._parseMediaQuery([scanner.TokenType.CurlyL]))) {
			return this.finish(node, errors.ParseError.IdentifierExpected);
		}
		while (this.accept(scanner.TokenType.Comma)) {
			if (!node.addChild(this._parseMediaQuery([scanner.TokenType.CurlyL]))) {
				return this.finish(node, errors.ParseError.IdentifierExpected);
			}
		}

		return this._parseBody(node, this._parseMediaDeclaration.bind(this));
	}

	public _parseMediaQuery(resyncStopToken: scanner.TokenType[]): nodes.Node {
		// http://www.w3.org/TR/css3-mediaqueries/
		// media_query : [ONLY | NOT]? S* IDENT S* [ AND S* expression ]* | expression [ AND S* expression ]*
		// expression : '(' S* IDENT S* [ ':' S* expr ]? ')' S*

		var node = <nodes.MediaQuery> this.create(nodes.MediaQuery);

		var parseExpression= true;
		var hasContent = false;
		if (!this.peek(scanner.TokenType.ParenthesisL)) {
			if (this.accept(scanner.TokenType.Ident, 'only', true) || this.accept(scanner.TokenType.Ident, 'not', true)) {
				// optional
			}
			if (!node.addChild(this._parseIdent())) {
				return null;
			}
			hasContent= true;
			parseExpression= this.accept(scanner.TokenType.Ident, 'and', true);
		}
		while (parseExpression) {
			if (!this.accept(scanner.TokenType.ParenthesisL)) {
				if (hasContent) {
					return this.finish(node, errors.ParseError.LeftParenthesisExpected, [], resyncStopToken);
				}
				return null;
			}
			if (!node.addChild(this._parseMediaFeatureName())) {
				return this.finish(node, errors.ParseError.IdentifierExpected, [], resyncStopToken);
			}
			if (this.accept(scanner.TokenType.Colon)) {
				if (!node.addChild(this._parseExpr())) {
					return this.finish(node, errors.ParseError.TermExpected, [], resyncStopToken);
				}
			}
			if (!this.accept(scanner.TokenType.ParenthesisR)) {
				return this.finish(node, errors.ParseError.RightParenthesisExpected, [], resyncStopToken);
			}
			parseExpression= this.accept(scanner.TokenType.Ident, 'and', true);
		}
		return node;
	}

	public _parseMediaFeatureName() : nodes.Node {
		return this._parseIdent();
	}

	public _parseMediaList(): nodes.Medialist {
		var node = <nodes.Medialist> this.create(nodes.Medialist);
		if (node.getMediums().addChild(this._parseMedium())) {
			while (this.accept(scanner.TokenType.Comma)) {
				if (!node.getMediums().addChild(this._parseMedium())) {
					return this.finish(node, errors.ParseError.IdentifierExpected);
				}
			}
			return <nodes.Medialist> this.finish(node);
		}
		return null;
	}

	public _parseMedium(): nodes.Node {
		var node = this.create(nodes.Node);
		if (node.addChild(this._parseIdent())) {
			return this.finish(node);
		} else {
			return null;
		}
	}

	public _parsePageDeclaration(): nodes.Node {
		return this._parsePageMarginBox() || this._parseRuleSetDeclaration();
	}

	public _parsePage(): nodes.Node {
		// http://www.w3.org/TR/css3-page/
		// page_rule : PAGE_SYM S* page_selector_list '{' S* page_body '}' S*
		// page_body :  /* Can be empty */ declaration? [ ';' S* page_body ]? | page_margin_box page_body

		var node = <nodes.Page> this.create(nodes.Page);
		if (!this.accept(scanner.TokenType.AtKeyword, '@Page')) {
			return null;
		}
		if (node.addChild(this._parsePageSelector())) {
			while (this.accept(scanner.TokenType.Comma)) {
				if (!node.addChild(this._parsePageSelector())) {
					return this.finish(node, errors.ParseError.IdentifierExpected);
				}
			}
		}

		return this._parseBody(node, this._parsePageDeclaration.bind(this));
	}

	public _parsePageMarginBox() : nodes.Node {
		// page_margin_box :  margin_sym S* '{' S* declaration? [ ';' S* declaration? ]* '}' S*
		var node = <nodes.PageBoxMarginBox> this.create(nodes.PageBoxMarginBox);
		if (!this.peek(scanner.TokenType.AtKeyword)) {
			return null;
		}

		if (!this.acceptOne(scanner.TokenType.AtKeyword, languageFacts.getPageBoxDirectives())) {
			this.markError(node, errors.ParseError.UnknownAtRule, [], [scanner.TokenType.CurlyL] );
		}

		return this._parseBody(node, this._parseRuleSetDeclaration.bind(this));
	}


	public _parsePageSelector(): nodes.Node {
		// page_selector : pseudo_page+ | IDENT pseudo_page*
		// pseudo_page :  ':' [ "left" | "right" | "first" | "blank" ];

		var node = this.create(nodes.Node);
		if (!this.peek(scanner.TokenType.Ident) && !this.peek(scanner.TokenType.Colon)) {
			return null;
		}
		node.addChild(this._parseIdent()); // optional ident

		if (this.accept(scanner.TokenType.Colon)) {
			if (!node.addChild(this._parseIdent())) { // optional ident
				return this.finish(node, errors.ParseError.IdentifierExpected);
			}
		}
		return this.finish(node);
	}

	public _parseDocument(): nodes.Node {
		// -moz-document is experimental but has been pushed to css4

		var node = <nodes.Document> this.create(nodes.Document);
		if (!this.accept(scanner.TokenType.AtKeyword, '@-moz-document')) {
			return null;
		}
		this.resync([], [ scanner.TokenType.CurlyL ]); // ignore all the rules
		return this._parseBody(node, this._parseStylesheetStatement.bind(this));
	}

	public _parseOperator(): nodes.Node {
		// these are operators for binary expressions
		var node = this.createNode(nodes.NodeType.Operator);
		if (this.accept(scanner.TokenType.Delim, '/') ||
			this.accept(scanner.TokenType.Delim, '*') ||
			this.accept(scanner.TokenType.Delim, '+') ||
			this.accept(scanner.TokenType.Delim, '-') ||
			this.accept(scanner.TokenType.Dashmatch) ||
			this.accept(scanner.TokenType.Includes) ||
			this.accept(scanner.TokenType.SubstringOperator) ||
			this.accept(scanner.TokenType.PrefixOperator) ||
			this.accept(scanner.TokenType.SuffixOperator) ||
			this.accept(scanner.TokenType.Delim, '=')) { // doesn't stick to the standard here

			return this.finish(node);

		} else {
			return null;
		}
	}

	public _parseUnaryOperator(): nodes.Node {
		var node = this.create(nodes.Node);
		if (this.accept(scanner.TokenType.Delim, '+') || this.accept(scanner.TokenType.Delim, '-')) {
			return this.finish(node);
		} else {
			return null;
		}
	}

	public _parseCombinator(): nodes.Node {
		var node = this.create(nodes.Node);
		if (this.accept(scanner.TokenType.Delim, '>')) {
			node.type = nodes.NodeType.SelectorCombinatorParent;
			return this.finish(node);
		} else if(this.accept(scanner.TokenType.Delim, '+')) {
			node.type = nodes.NodeType.SelectorCombinatorSibling;
			return this.finish(node);
		} else if(this.accept(scanner.TokenType.Delim, '~')) {
			node.type = nodes.NodeType.SelectorCombinatorAllSiblings;
			return this.finish(node);
		} else {
			return null;
		}
	}

	public _parseSimpleSelector(): nodes.Node {
		// simple_selector
		//  : element_name [ HASH | class | attrib | pseudo ]* | [ HASH | class | attrib | pseudo ]+ ;

		var node = <nodes.SimpleSelector> this.create(nodes.SimpleSelector);
		var c = 0;
		if (node.addChild(this._parseElementName())) {
			c++;
		}
		while ((c === 0 || !this.hasWhitespace()) && node.addChild(this._parseSimpleSelectorBody())) {
			c++;
		}
		return c > 0 ? this.finish(node) : null;
	}

	public _parseSimpleSelectorBody():nodes.Node {
		return this._parsePseudo() || this._parseHash() || this._parseClass() || this._parseAttrib();
	}

	public _parseSelectorIdent() : nodes.Node {
		return this._parseIdent();
	}

	public _parseHash(): nodes.Node {
		if (!this.peek(scanner.TokenType.Hash) && !this.peek(scanner.TokenType.Delim, '#')) {
			return null;
		}
		var node = this.createNode(nodes.NodeType.IdentifierSelector);
		if (this.accept(scanner.TokenType.Delim, '#')) {
			if (this.hasWhitespace() || !node.addChild(this._parseSelectorIdent())) {
				return this.finish(node, errors.ParseError.IdentifierExpected);
			}
		} else {
			this.consumeToken(); // TokenType.Hash
		}
		return this.finish(node);
	}

	public _parseClass(): nodes.Node {
		// class: '.' IDENT ;
		if (!this.peek(scanner.TokenType.Delim, '.')) {
			return null;
		}
		var node = this.createNode(nodes.NodeType.ClassSelector);
		this.consumeToken(); // '.'
		if (this.hasWhitespace() || !node.addChild(this._parseSelectorIdent())) {
			return this.finish(node, errors.ParseError.IdentifierExpected);
		}
		return this.finish(node);
	}

	public _parseElementName(): nodes.Node {
		// element_name: IDENT | '*';
		var node = this.createNode(nodes.NodeType.ElementNameSelector);
		if (node.addChild(this._parseSelectorIdent()) || this.accept(scanner.TokenType.Delim, '*')) {
			return this.finish(node);
		}
		return null;
	}

	public _parseAttrib(): nodes.Node {
		// attrib : '[' S* IDENT S* [ [ '=' | INCLUDES | DASHMATCH ] S*   [ IDENT | STRING ] S* ]? ']'
		if (!this.peek(scanner.TokenType.BracketL)) {
			return null;
		}
		var node = this.createNode(nodes.NodeType.AttributeSelector);
		this.consumeToken(); // BracketL
		if(!node.addChild(this._parseBinaryExpr())) {
			// is this bad?
		}
		if (!this.accept(scanner.TokenType.BracketR)) {
			return this.finish(node, errors.ParseError.RightSquareBracketExpected);
		}
		return this.finish(node);
	}

	public _parsePseudo(): nodes.Node {
		// pseudo: ':' [ IDENT | FUNCTION S* [IDENT S*]? ')' ]
		if (!this.peek(scanner.TokenType.Colon)) {
			return null;
		}
		var pos = this.mark();
		var node = this.createNode(nodes.NodeType.PseudoSelector);
		this.consumeToken(); // Colon
		if (!this.hasWhitespace() && this.accept(scanner.TokenType.Colon)) {
			// optional, support ::
		}
		if (!this.hasWhitespace()) {
			if (!node.addChild(this._parseIdent())) {
				return this.finish(node, errors.ParseError.IdentifierExpected);
			}
			if (!this.hasWhitespace() && this.accept(scanner.TokenType.ParenthesisL)) {
				node.addChild(this._parseBinaryExpr() || this._parseSimpleSelector());
				if (!this.accept(scanner.TokenType.ParenthesisR)) {
					return this.finish(node, errors.ParseError.RightParenthesisExpected);
				}
			}
			return this.finish(node);
		}
		this.restoreAtMark(pos);
		return null;
	}

	public _parsePrio(): nodes.Node {
		if (!this.peek(scanner.TokenType.Exclamation)) {
			return null;
		}

		var node = this.createNode(nodes.NodeType.Prio);
		if (this.accept(scanner.TokenType.Exclamation) && this.accept(scanner.TokenType.Ident, 'important', true)) {
			return this.finish(node);
		}
		return null;
	}

	public _parseExpr(stopOnComma:boolean = false): nodes.Expression {
		var node = <nodes.Expression> this.create(nodes.Expression);
		if (!node.addChild(this._parseBinaryExpr())) {
			return null;
		}

		while (true) {
			if (this.peek(scanner.TokenType.Comma)) { // optional
				if (stopOnComma) {
					return this.finish(node);
				}
				this.consumeToken();
			}
			if (!node.addChild(this._parseBinaryExpr())) {
				break;
			}
		}

		return this.finish(node);
	}

	public _parseBinaryExpr(preparsedLeft?:nodes.BinaryExpression, preparsedOper?:nodes.Node): nodes.Node {
		var node = <nodes.BinaryExpression> this.create(nodes.BinaryExpression);

		if(!node.setLeft((<nodes.Node> preparsedLeft || this._parseTerm()))) {
			return null;
		}

		if(!node.setOperator(preparsedOper || this._parseOperator())) {
			return this.finish(node);
		}

		if(!node.setRight(this._parseTerm())) {
			return this.finish(node, errors.ParseError.TermExpected);
		}

		// things needed for multiple binary expressions
		node = <nodes.BinaryExpression> this.finish(node);
		var operator = this._parseOperator();
		if(operator) {
			node = <nodes.BinaryExpression> this._parseBinaryExpr(node, operator);
		}

		return this.finish(node);
	}

	public _parseTerm(): nodes.Term {

		var node = <nodes.Term> this.create(nodes.Term);
		node.setOperator(this._parseUnaryOperator()); // optional

		if (node.setExpression(this._parseFunction()) || // first function then ident
			node.setExpression(this._parseIdent()) ||
			node.setExpression(this._parseURILiteral()) ||
			node.setExpression(this._parseStringLiteral()) ||
			node.setExpression(this._parseNumeric()) ||
			node.setExpression(this._parseHexColor()) ||
			node.setExpression(this._parseOperation())
		) {
			return <nodes.Term> this.finish(node);
		}

		return null;
	}

	public _parseOperation():nodes.Node {
		var node = this.create(nodes.Node);
		if (!this.accept(scanner.TokenType.ParenthesisL)) {
			return null;
		}
		node.addChild(this._parseExpr());
		if (!this.accept(scanner.TokenType.ParenthesisR)) {
			return this.finish(node, errors.ParseError.RightParenthesisExpected);
		}
		return this.finish(node);
	}

	public _parseNumeric(): nodes.NumericValue {
		var node = <nodes.NumericValue> this.create(nodes.NumericValue);
		if(this.accept(scanner.TokenType.Num) ||
			this.accept(scanner.TokenType.Percentage) ||
			this.accept(scanner.TokenType.Resolution) ||
			this.accept(scanner.TokenType.Length) ||
			this.accept(scanner.TokenType.EMS) ||
			this.accept(scanner.TokenType.EXS) ||
			this.accept(scanner.TokenType.Angle) ||
			this.accept(scanner.TokenType.Time) ||
			this.accept(scanner.TokenType.Dimension) ||
			this.accept(scanner.TokenType.Freq)) {

			return <nodes.NumericValue> this.finish(node);
		}

		return null;
	}

	public _parseStringLiteral(): nodes.Node {
		var node = this.createNode(nodes.NodeType.StringLiteral);
		if (this.accept(scanner.TokenType.String) || this.accept(scanner.TokenType.BadString)) {
			return this.finish(node);
		}
		return null;
	}

	public _parseURILiteral(): nodes.Node {
		var node = this.createNode(nodes.NodeType.URILiteral);
		if (this.accept(scanner.TokenType.URI) || this.accept(scanner.TokenType.BadUri)) {
			return this.finish(node);
		}
		return null;
	}

	public _parseIdent(referenceTypes?: nodes.ReferenceType[]): nodes.Identifier {
		var node = <nodes.Identifier> this.create(nodes.Identifier);
		if (referenceTypes) {
			node.referenceTypes = referenceTypes;
		}
		if (this.accept(scanner.TokenType.Ident)) {
			return this.finish(node);
		}
		return null;
	}


	public _parseFunction(): nodes.Function {

		var pos = this.mark();
		var node = <nodes.Function> this.create(nodes.Function);

		if (!node.setIdentifier(this._parseFunctionIdentifier())) {
			return null;
		}
		if (this.hasWhitespace() || !this.accept(scanner.TokenType.ParenthesisL)) {
			this.restoreAtMark(pos);
			return null;
		}

		// arguments
		if (node.getArguments().addChild(this._parseFunctionArgument())) {
			while (this.accept(scanner.TokenType.Comma)) {
				if (!node.getArguments().addChild(this._parseFunctionArgument())) {
					return this.finish(node, errors.ParseError.ExpressionExpected);
				}
			}
		}

		if (!this.accept(scanner.TokenType.ParenthesisR)) {
			return <nodes.Function> this.finish(node, errors.ParseError.RightParenthesisExpected);
		}
		return <nodes.Function> this.finish(node);
	}

	public _parseFunctionIdentifier(): nodes.Identifier {
		var node = <nodes.Identifier> this.create(nodes.Identifier);
		node.referenceTypes = [ nodes.ReferenceType.Function ];
		if (this.accept(scanner.TokenType.Ident, 'progid')) {
			// support for IE7 specific filters: 'progid:DXImageTransform.Microsoft.MotionBlur(strength=13, direction=310)'
			if (this.accept(scanner.TokenType.Colon)) {
				while (this.accept(scanner.TokenType.Ident) && this.accept(scanner.TokenType.Delim, '.')) {
					// loop
				}
			}
			return this.finish(node);
		} else if (this.accept(scanner.TokenType.Ident)) {
			return this.finish(node);
		}
		return null;
	}

	public _parseFunctionArgument(): nodes.Node {
		var node = <nodes.FunctionArgument> this.create(nodes.FunctionArgument);
		if (node.setValue(this._parseExpr(true))) {
			return this.finish(node);
		}
		return null;
	}

	public _parseHexColor(): nodes.Node {
		var node = this.create(nodes.HexColorValue);
		if (this.peekRegEx(scanner.TokenType.Hash, /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/g)) {
			this.consumeToken();
			return this.finish(node);
		} else {
			return null;
		}
	}
}
