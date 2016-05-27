/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import URI from 'vs/base/common/uri';
import editorCommon = require('vs/editor/common/editorCommon');
import modes = require('vs/editor/common/modes');
import Types = require('vs/editor/common/modes/monarch/monarchTypes');
import Compile = require('vs/editor/common/modes/monarch/monarchCompile');
import lessWorker = require('vs/languages/less/common/lessWorker');
import * as lessTokenTypes from 'vs/languages/less/common/lessTokenTypes';
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

export var language: Types.ILanguage = <Types.ILanguage> {
	displayName: 'LESS',
	name: 'less',

	// TODO@Martin: This definition does not work with umlauts for example
	wordDefinition: /(#?-?\d*\.\d\w*%?)|([@#!.:]?[\w-?]+%?)|[@#!.]/g,

	defaultToken: '',

	lineComment: '//',
	blockCommentStart: '/*',
	blockCommentEnd: '*/',

	identifier: '-?-?([a-zA-Z]|(\\\\(([0-9a-fA-F]{1,6}\\s?)|[^[0-9a-fA-F])))([\\w\\-]|(\\\\(([0-9a-fA-F]{1,6}\\s?)|[^[0-9a-fA-F])))*',
	identifierPlus: '-?-?([a-zA-Z:.]|(\\\\(([0-9a-fA-F]{1,6}\\s?)|[^[0-9a-fA-F])))([\\w\\-:.]|(\\\\(([0-9a-fA-F]{1,6}\\s?)|[^[0-9a-fA-F])))*',

	brackets: [
		{ open: '{', close: '}', token: 'punctuation.curly' },
		{ open: '[', close: ']', token: 'punctuation.bracket' },
		{ open: '(', close: ')', token: 'punctuation.parenthesis' },
		{ open: '<', close: '>', token: 'punctuation.angle' }
	],

	tokenizer: {
		root: <any[]>[
			{ include: '@nestedJSBegin' },

			['[ \\t\\r\\n]+', ''],

			{ include: '@comments' },
			{ include: '@keyword' },
			{ include: '@strings' },
			{ include: '@numbers' },
			['[*_]?[a-zA-Z\\-\\s]+(?=:.*(;|(\\\\$)))', lessTokenTypes.TOKEN_PROPERTY, '@attribute'],

			['url(\\-prefix)?\\(', { token: 'function', bracket: '@open', next: '@urldeclaration'}],

			['[{}()\\[\\]]', '@brackets'],
			['[,:;]', 'punctuation'],

			['#@identifierPlus', lessTokenTypes.TOKEN_SELECTOR + '.id'],
			['&', lessTokenTypes.TOKEN_SELECTOR_TAG],

			['\\.@identifierPlus(?=\\()', lessTokenTypes.TOKEN_SELECTOR + '.class', '@attribute'],
			['\\.@identifierPlus', lessTokenTypes.TOKEN_SELECTOR + '.class'],

			['@identifierPlus', lessTokenTypes.TOKEN_SELECTOR_TAG],
			{ include: '@operators' },

			['@(@identifier(?=[:,\\)]))', 'variable', '@attribute'],
			['@(@identifier)', 'variable'],
			['@', 'key', '@atRules']
		],

		nestedJSBegin: [
			['``', 'punctuation.backtick'],
			<any[]>['`', { token: 'punctuation.backtick', bracket: '@open', next: '@nestedJSEnd', nextEmbedded: 'text/javascript' }],
		],

		nestedJSEnd: [
			<any[]>['`', { token: 'punctuation.backtick', bracket: '@close', next: '@pop' }],
			<any[]>['.', { token: '@rematch', next: '@javascript_block' }],
		],

		javascript_block: [
			<any[]>['`', { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
		],

		operators: [
			['[<>=\\+\\-\\*\\/\\^\\|\\~]', 'operator']
		],

		keyword: [
			['(@[\\s]*import|![\\s]*important|true|false|when|iscolor|isnumber|isstring|iskeyword|isurl|ispixel|ispercentage|isem|hue|saturation|lightness|alpha|lighten|darken|saturate|desaturate|fadein|fadeout|fade|spin|mix|round|ceil|floor|percentage)\\b', 'keyword']
		],

		urldeclaration: [
			{ include: '@strings'},
			[ '[^)\r\n]+', 'string' ],
			['\\)', { token: 'tag', bracket: '@close', next: '@pop'}],
		],

		attribute: <any[]>[
			{ include: '@nestedJSBegin' },
			{ include: '@comments' },
			{ include: '@strings' },
			{ include: '@numbers' },

			{ include: '@keyword' },

			['[a-zA-Z\\-]+(?=\\()', lessTokenTypes.TOKEN_VALUE, '@attribute'],
			['>', 'operator', '@pop'],
			['@identifier', lessTokenTypes.TOKEN_VALUE],
			{ include: '@operators' },
			['@(@identifier)', 'variable'],

			['[)\\}]', '@brackets', '@pop'],
			['[{}()\\[\\]>]', '@brackets'],

			['[;]', 'punctuation', '@pop'],
			['[,=:]', 'punctuation'],

			['\\s', ''],
			['.', lessTokenTypes.TOKEN_VALUE]
		],

		comments: [
			['\\/\\*', 'comment', '@comment'],
			['\\/\\/+.*', 'comment'],
		],

		comment: [
			['\\*\\/', 'comment', '@pop'],
			['.', 'comment'],
		],

		numbers: [
			<any[]>['(\\d*\\.)?\\d+([eE][\\-+]?\\d+)?', { token: lessTokenTypes.TOKEN_VALUE + '.numeric', next: '@units' }],
			['#[0-9a-fA-F_]+(?!\\w)', lessTokenTypes.TOKEN_VALUE + '.rgb-value']
		],

		units: [
			['((em|ex|ch|rem|vw|vh|vm|cm|mm|in|px|pt|pc|deg|grad|rad|turn|s|ms|Hz|kHz|%)\\b)?', lessTokenTypes.TOKEN_VALUE + '.unit', '@pop']
		],

		strings: [
			<any[]>['~?"', { token: 'string.punctuation', bracket: '@open', next: '@stringsEndDoubleQuote' }],
			<any[]>['~?\'', { token: 'string.punctuation', bracket: '@open', next: '@stringsEndQuote' }]
		],

		stringsEndDoubleQuote: [
			['\\\\"', 'string'],
			<any[]>['"', { token: 'string.punctuation', next: '@popall', bracket: '@close' }],
			['.', 'string']
		],

		stringsEndQuote: [
			['\\\\\'', 'string'],
			<any[]>['\'', { token: 'string.punctuation', next: '@popall', bracket: '@close' }],
			['.', 'string']
		],

		atRules: <any[]>[
			{ include: '@comments' },
			{ include: '@strings' },
			['[()]', 'punctuation'],
			['[\\{;]', 'punctuation', '@pop'],
			['.', 'key']
		]
	}
};

export class LESSMode extends AbstractMode {

	public inplaceReplaceSupport:modes.IInplaceReplaceSupport;
	public configSupport:modes.IConfigurationSupport;
	public tokenizationSupport: modes.ITokenizationSupport;
	public richEditSupport: modes.IRichEditSupport;

	private modeService: IModeService;
	private _modeWorkerManager: ModeWorkerManager<lessWorker.LessWorker>;
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

		this._modeWorkerManager = new ModeWorkerManager<lessWorker.LessWorker>(descriptor, 'vs/languages/less/common/lessWorker', 'LessWorker', 'vs/languages/css/common/cssWorker', instantiationService);
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

	private _worker<T>(runner:(worker:lessWorker.LessWorker)=>winjs.TPromise<T>): winjs.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	public configure(options:any): winjs.TPromise<void> {
		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(LESSMode, LESSMode.prototype._configureWorkers);
	private _configureWorkers(options:any): winjs.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $navigateValueSet = OneWorkerAttr(LESSMode, LESSMode.prototype.navigateValueSet);
	public navigateValueSet(resource:URI, position:editorCommon.IRange, up:boolean):winjs.TPromise<modes.IInplaceReplaceSupportResult> {
		return this._worker((w) => w.navigateValueSet(resource, position, up));
	}

	static $_pickAWorkerToValidate = OneWorkerAttr(LESSMode, LESSMode.prototype._pickAWorkerToValidate, ThreadAffinity.Group1);
	private _pickAWorkerToValidate(): winjs.TPromise<void> {
		return this._worker((w) => w.enableValidator());
	}

	static $_provideReferences = OneWorkerAttr(LESSMode, LESSMode.prototype._provideReferences);
	private _provideReferences(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.Location[]> {
		return this._worker((w) => w.provideReferences(resource, position));
	}

	static $_provideCompletionItems = OneWorkerAttr(LESSMode, LESSMode.prototype._provideCompletionItems);
	private _provideCompletionItems(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult[]> {
		return this._worker((w) => w.provideCompletionItems(resource, position));
	}

	static $_provideHover = OneWorkerAttr(LESSMode, LESSMode.prototype._provideHover);
	private _provideHover(resource:URI, position:editorCommon.IPosition): winjs.TPromise<modes.Hover> {
		return this._worker((w) => w.provideHover(resource, position));
	}

	static $_provideDocumentSymbols = OneWorkerAttr(LESSMode, LESSMode.prototype._provideDocumentSymbols);
	private _provideDocumentSymbols(resource:URI):winjs.TPromise<modes.SymbolInformation[]> {
		return this._worker((w) => w.provideDocumentSymbols(resource));
	}

	static $_provideDefinition = OneWorkerAttr(LESSMode, LESSMode.prototype._provideDefinition);
	private _provideDefinition(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.Definition> {
		return this._worker((w) => w.provideDefinition(resource, position));
	}

	static $findColorDeclarations = OneWorkerAttr(LESSMode, LESSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:URI):winjs.TPromise<{range:editorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}
}
