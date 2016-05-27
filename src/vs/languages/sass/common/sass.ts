/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Types = require('vs/editor/common/modes/monarch/monarchTypes');
import Compile = require('vs/editor/common/modes/monarch/monarchCompile');
import winjs = require('vs/base/common/winjs.base');
import URI from 'vs/base/common/uri';
import editorCommon = require('vs/editor/common/editorCommon');
import modes = require('vs/editor/common/modes');
import sassWorker = require('vs/languages/sass/common/sassWorker');
import * as sassTokenTypes from 'vs/languages/sass/common/sassTokenTypes';
import {ModeWorkerManager, AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {wireCancellationToken} from 'vs/base/common/async';
import {createRichEditSupport} from 'vs/editor/common/modes/monarch/monarchDefinition';
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';

export var language = <Types.ILanguage>{
	displayName: 'Sass',
	name: 'sass',

	// TODO@Martin: This definition does not work with umlauts for example
	wordDefinition: /(#?-?\d*\.\d\w*%?)|([$@#!.:]?[\w-?]+%?)|[$@#!.]/g,

	defaultToken: '',

	lineComment: '//',
	blockCommentStart: '/*',
	blockCommentEnd: '*/',

	ws: '[ \t\n\r\f]*', // whitespaces (referenced in several rules)
	identifier: '-?-?([a-zA-Z]|(\\\\(([0-9a-fA-F]{1,6}\\s?)|[^[0-9a-fA-F])))([\\w\\-]|(\\\\(([0-9a-fA-F]{1,6}\\s?)|[^[0-9a-fA-F])))*',

	brackets: [
		{ open: '{', close: '}', token: 'punctuation.curly' },
		{ open: '[', close: ']', token: 'punctuation.bracket' },
		{ open: '(', close: ')', token: 'punctuation.parenthesis' },
		{ open: '<', close: '>', token: 'punctuation.angle' }
	],

	tokenizer: {
		root: [
			{ include: '@selector' },
		],

		selector: [
			{ include: '@comments' },
			{ include: '@import' },
			{ include: '@variabledeclaration' },
			{ include: '@warndebug' }, // sass: log statements
			['[@](include)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@includedeclaration'}], // sass: include statement
			['[@](keyframes|-webkit-keyframes|-moz-keyframes|-o-keyframes)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@keyframedeclaration'}],
			['[@](page|content|font-face|-moz-document)', { token: sassTokenTypes.TOKEN_AT_KEYWORD}], // sass: placeholder for includes
			['[@](charset|namespace)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@declarationbody'}],
			['[@](function)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@functiondeclaration'}],
			['[@](mixin)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@mixindeclaration'}],
			['url(\\-prefix)?\\(', { token: 'support.function.name', bracket: '@open', next: '@urldeclaration'}],
			{ include: '@controlstatement' }, // sass control statements
			{ include: '@selectorname' },
			['[&\\*]', sassTokenTypes.TOKEN_SELECTOR_TAG], // selector symbols
			['[>\\+,]', 'punctuation'], // selector operators
			['\\[', { token: 'punctuation.bracket', bracket: '@open', next: '@selectorattribute' }],
			['{', { token: 'punctuation.curly', bracket: '@open', next: '@selectorbody' }],
		],

		selectorbody: [
			['[*_]?@identifier@ws:(?=(\\s|\\d|[^{;}]*[;}]))', sassTokenTypes.TOKEN_PROPERTY, '@rulevalue'], // rule definition: to distinguish from a nested selector check for whitespace, number or a semicolon
			{ include: '@selector'}, // sass: nested selectors
			['[@](extend)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@extendbody'}], // sass: extend other selectors
			['[@](return)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@declarationbody'}],
			['}', { token: 'punctuation.curly', bracket: '@close', next: '@pop'}],
		],

		selectorname: [
			['#{', { token: 'support.function.interpolation', bracket: '@open', next: '@variableinterpolation' }], // sass: interpolation
			['(\\.|#(?=[^{])|%|(@identifier)|:)+', sassTokenTypes.TOKEN_SELECTOR], // selector (.foo, div, ...)
		],

		selectorattribute: [
			{ include: '@term' },
			[']', { token: 'punctuation.bracket', bracket: '@close', next: '@pop'}],
		],

		term: [
			{ include: '@comments' },
			['url(\\-prefix)?\\(', { token: 'support.function.name', bracket: '@open', next: '@urldeclaration'}],
			{ include: '@functioninvocation'},
			{ include: '@numbers' },
			{ include: '@strings' },
			{ include: '@variablereference' },
			['(and\\b|or\\b|not\\b)', 'keyword.operator'],
			{ include: '@name'},
			['([<>=\\+\\-\\*\\/\\^\\|\\~,])', 'keyword.operator'],
			[',', 'punctuation'],
			['!default', 'literal'],
			['\\(', { token: 'punctuation.parenthesis', bracket: '@open', next: '@parenthizedterm'}],
		],

		rulevalue: [
			{ include: '@term' },
			['!important', 'literal'],
			[';', 'punctuation', '@pop'],
			['{', { token: 'punctuation.curly', bracket: '@open', switchTo: '@nestedproperty' }], // sass: nested properties
			['(?=})', { token: '', next: '@pop'}], // missing semicolon
		],

		nestedproperty: [
			['[*_]?@identifier@ws:', sassTokenTypes.TOKEN_PROPERTY, '@rulevalue'],
			{ include: '@comments' },
			['}', { token: 'punctuation.curly', bracket: '@close', next: '@pop'}],
		],

		warndebug: [
			['[@](warn|debug)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@declarationbody'}],
		],

		import: [
			['[@](import)', { token: sassTokenTypes.TOKEN_AT_KEYWORD, next: '@declarationbody'}],
		],

		variabledeclaration: [ // sass variables
			['\\$@identifier@ws:', 'variable.decl', '@declarationbody'],
		],

		urldeclaration: [
			{ include: '@strings'},
			[ '[^)\r\n]+', 'string' ],
			['\\)', { token: 'support.function.name', bracket: '@close', next: '@pop'}],
		],

		parenthizedterm: [
			{ include: '@term' },
			['\\)', { token: 'punctuation.parenthesis', bracket: '@close', next: '@pop'}],
		],

		declarationbody: [
			{ include: '@term' },
			[';', 'punctuation', '@pop'],
			['(?=})', { token: '', next: '@pop'}], // missing semicolon
		],

		extendbody: [
			{ include: '@selectorname' },
			['!optional', 'literal'],
			[';', 'punctuation', '@pop'],
			['(?=})', { token: '', next: '@pop'}], // missing semicolon
		],

		variablereference: [ // sass variable reference
			['\\$@identifier', 'variable.ref'],
			['\\.\\.\\.', 'keyword.operator'], // var args in reference
			['#{', { token: 'support.function.interpolation', bracket: '@open', next: '@variableinterpolation' }], // sass var resolve
		],

		variableinterpolation: [
			{ include: '@variablereference' },
			['}', { token: 'support.function.interpolation', bracket: '@close', next: '@pop'}],
		],

		comments: [
			['\\/\\*', 'comment', '@comment'],
			['\\/\\/+.*', 'comment'],
		],

		comment: [
			['\\*\\/', 'comment', '@pop'],
			['.', 'comment'],
		],

		name: [
			['@identifier', sassTokenTypes.TOKEN_VALUE],
		],

		numbers: [
			['(\\d*\\.)?\\d+([eE][\\-+]?\\d+)?', { token: 'constant.numeric', next: '@units' }],
			['#[0-9a-fA-F_]+(?!\\w)', 'constant.rgb-value'],
		],

		units: [
			['(em|ex|ch|rem|vw|vh|vm|cm|mm|in|px|pt|pc|deg|grad|rad|turn|s|ms|Hz|kHz|%)?', 'constant.numeric', '@pop']
		],

		functiondeclaration: [
			['@identifier@ws\\(', { token: 'support.function.name', bracket: '@open', next: '@parameterdeclaration'}],
			['{', { token: 'punctuation.curly', bracket: '@open', switchTo: '@functionbody' }],
		],

		mixindeclaration: [
			// mixin with parameters
			['@identifier@ws\\(', { token: 'support.function.name', bracket: '@open', next: '@parameterdeclaration'}],
			// mixin without parameters
			['@identifier', 'support.function.name'],
			['{', { token: 'punctuation.curly', bracket: '@open', switchTo: '@selectorbody' }],
		],

		parameterdeclaration: [
			['\\$@identifier@ws:', 'variable'],
			['\\.\\.\\.', 'keyword.operator'], // var args in declaration
			[',', 'punctuation'],
			{ include: '@term' },
			['\\)', { token: 'support.function.name', bracket: '@close', next: '@pop'}],
		],

		includedeclaration: [
			{ include: '@functioninvocation' },
			['@identifier', 'support.function.name'],
			[';', 'punctuation', '@pop'],
			['(?=})', { token: '', next: '@pop'}], // missing semicolon
			['{', { token: 'punctuation.curly', bracket: '@open', switchTo: '@selectorbody' }],
		],

		keyframedeclaration: [
			['@identifier', 'support.function.name'],
			['{', { token: 'punctuation.curly', bracket: '@open', switchTo: '@keyframebody' }],
		],

		keyframebody: [
			{ include: '@term' },
			['{', { token: 'punctuation.curly', bracket: '@open', next: '@selectorbody' }],
			['}', { token: 'punctuation.curly', bracket: '@close', next: '@pop'}],
		],

		controlstatement: [
			['[@](if|else|for|while|each|media)', { token: 'keyword.flow.control.at-rule', next: '@controlstatementdeclaration'}],
		],

		controlstatementdeclaration: [
			['(in|from|through|if|to)\\b', { token: 'keyword.flow.control.at-rule'}],
			{ include: '@term' },
			['{', { token: 'punctuation.curly', bracket: '@open', switchTo: '@selectorbody' }],
		],

		functionbody: [
			['[@](return)', { token: sassTokenTypes.TOKEN_AT_KEYWORD}],
			{ include: '@variabledeclaration' },
			{ include: '@term' },
			{ include: '@controlstatement' },
			[';', 'punctuation'],
			['}', { token: 'punctuation.curly', bracket: '@close', next: '@pop'}],
		],

		functioninvocation: [
			['@identifier\\(', { token: 'support.function.name', bracket: '@open', next: '@functionarguments' }],
		],

		functionarguments: [
			['\\$@identifier@ws:', sassTokenTypes.TOKEN_PROPERTY],
			['[,]', 'punctuation'],
			{ include: '@term' },
			['\\)', { token: 'support.function.name', bracket: '@close', next: '@pop'}],
		],

		strings: [
			['~?"', { token: 'string.punctuation', bracket: '@open', next: '@stringenddoublequote' }],
			['~?\'', { token: 'string.punctuation', bracket: '@open', next: '@stringendquote' }]
		],

		stringenddoublequote: [
			['\\\\.', 'string'],
			['"', { token: 'string.punctuation', next: '@pop', bracket: '@close' }],
			['.', 'string']
		],

		stringendquote: [
			['\\\\.', 'string'],
			['\'', { token: 'string.punctuation', next: '@pop', bracket: '@close' }],
			['.', 'string']
		]
	}
};

export class SASSMode extends AbstractMode {

	public inplaceReplaceSupport:modes.IInplaceReplaceSupport;
	public configSupport:modes.IConfigurationSupport;
	public tokenizationSupport: modes.ITokenizationSupport;
	public richEditSupport: modes.IRichEditSupport;

	private modeService: IModeService;
	private _modeWorkerManager: ModeWorkerManager<sassWorker.SassWorker>;
	private _threadService:IThreadService;

	constructor(
		descriptor:modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id);
		let lexer = Compile.compile(language);
		this._modeWorkerManager = new ModeWorkerManager<sassWorker.SassWorker>(descriptor, 'vs/languages/sass/common/sassWorker', 'SassWorker', 'vs/languages/css/common/cssWorker', instantiationService);
		this._threadService = threadService;

		this.modeService = modeService;

		modes.HoverProviderRegistry.register(this.getId(), {
			provideHover: (model, position, token): Thenable<modes.Hover> => {
				return wireCancellationToken(token, this._provideHover(model.uri, position));
			}
		}, true);

		this.inplaceReplaceSupport = this;

		this.configSupport = this;

		modes.ReferenceProviderRegistry.register(this.getId(), {
			provideReferences: (model, position, context, token): Thenable<modes.Location[]> => {
				return wireCancellationToken(token, this._provideReferences(model.uri, position));
			}
		}, true);

		modes.DefinitionProviderRegistry.register(this.getId(), {
			provideDefinition: (model, position, token): Thenable<modes.Definition> => {
				return wireCancellationToken(token, this._provideDefinition(model.uri, position));
			}
		}, true);

		modes.DocumentSymbolProviderRegistry.register(this.getId(), {
			provideDocumentSymbols: (model, token): Thenable<modes.SymbolInformation[]> => {
				return wireCancellationToken(token, this._provideDocumentSymbols(model.uri));
			}
		}, true);

		modes.SuggestRegistry.register(this.getId(), {
			triggerCharacters: [],
			shouldAutotriggerSuggest: true,
			provideCompletionItems: (model, position, token): Thenable<modes.ISuggestResult[]> => {
				return wireCancellationToken(token, this._provideCompletionItems(model.uri, position));
			}
		}, true);

		this.tokenizationSupport = createTokenizationSupport(modeService, this, lexer);

		this.richEditSupport = new RichEditSupport(this.getId(), null, createRichEditSupport(lexer));
	}

	public creationDone(): void {
		if (this._threadService.isInMainThread) {
			// Pick a worker to do validation
			this._pickAWorkerToValidate();
		}
	}

	private _worker<T>(runner:(worker:sassWorker.SassWorker)=>winjs.TPromise<T>): winjs.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	public configure(options:any): winjs.TPromise<void> {
		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(SASSMode, SASSMode.prototype._configureWorkers);
	private _configureWorkers(options:any): winjs.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $navigateValueSet = OneWorkerAttr(SASSMode, SASSMode.prototype.navigateValueSet);
	public navigateValueSet(resource:URI, position:editorCommon.IRange, up:boolean):winjs.TPromise<modes.IInplaceReplaceSupportResult> {
		return this._worker((w) => w.navigateValueSet(resource, position, up));
	}

	static $_pickAWorkerToValidate = OneWorkerAttr(SASSMode, SASSMode.prototype._pickAWorkerToValidate, ThreadAffinity.Group1);
	private _pickAWorkerToValidate(): winjs.TPromise<void> {
		return this._worker((w) => w.enableValidator());
	}

	static $_provideReferences = OneWorkerAttr(SASSMode, SASSMode.prototype._provideReferences);
	private _provideReferences(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.Location[]> {
		return this._worker((w) => w.provideReferences(resource, position));
	}

	static $_provideCompletionItems = OneWorkerAttr(SASSMode, SASSMode.prototype._provideCompletionItems);
	private _provideCompletionItems(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult[]> {
		return this._worker((w) => w.provideCompletionItems(resource, position));
	}

	static $_provideHover = OneWorkerAttr(SASSMode, SASSMode.prototype._provideHover);
	private _provideHover(resource:URI, position:editorCommon.IPosition): winjs.TPromise<modes.Hover> {
		return this._worker((w) => w.provideHover(resource, position));
	}

	static $_provideDocumentSymbols = OneWorkerAttr(SASSMode, SASSMode.prototype._provideDocumentSymbols);
	private _provideDocumentSymbols(resource:URI):winjs.TPromise<modes.SymbolInformation[]> {
		return this._worker((w) => w.provideDocumentSymbols(resource));
	}

	static $_provideDefinition = OneWorkerAttr(SASSMode, SASSMode.prototype._provideDefinition);
	private _provideDefinition(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.Definition> {
		return this._worker((w) => w.provideDefinition(resource, position));
	}

	static $findColorDeclarations = OneWorkerAttr(SASSMode, SASSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:URI):winjs.TPromise<{range:editorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}
}