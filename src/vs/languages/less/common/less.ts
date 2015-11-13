/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import network = require('vs/base/common/network');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import Monarch = require('vs/editor/common/modes/monarch/monarch');
import Types = require('vs/editor/common/modes/monarch/monarchTypes');
import Compile = require('vs/editor/common/modes/monarch/monarchCompile');
import lessWorker = require('vs/languages/less/common/lessWorker');
import supports = require('vs/editor/common/modes/supports');
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import {AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModelService} from 'vs/editor/common/services/modelService';

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
			['[*_]?[a-zA-Z\\-\\s]+(?=:.*(;|(\\\\$)))', 'support.type.property-name', '@attribute'],

			['url(\\-prefix)?\\(', { token: 'function', bracket: '@open', next: '@urldeclaration'}],

			['[{}()\\[\\]]', '@brackets'],
			['[,:;]', 'punctuation'],

			['#@identifierPlus', 'entity.other.attribute-name.id'],
			['&', 'entity.other.attribute-name.placeholder-selector'],

			['\\.@identifierPlus(?=\\()', 'entity.other.attribute-name.class', '@attribute'],
			['\\.@identifierPlus', 'entity.other.attribute-name.class'],

			['@identifierPlus', 'entity.name.tag'],
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

			['[a-zA-Z\\-]+(?=\\()', 'meta.property-value', '@attribute'],
			['>', 'operator', '@pop'],
			['@identifier', 'meta.property-value'],
			{ include: '@operators' },
			['@(@identifier)', 'variable'],

			['[)\\}]', '@brackets', '@pop'],
			['[{}()\\[\\]>]', '@brackets'],

			['[;]', 'punctuation', '@pop'],
			['[,=:]', 'punctuation'],

			['\\s', ''],
			['.', 'meta.property-value']
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
			<any[]>['(\\d*\\.)?\\d+([eE][\\-+]?\\d+)?', { token: 'meta.property-value.numeric', next: '@units' }],
			['#[0-9a-fA-F_]+(?!\\w)', 'meta.property-value.rgb-value']
		],

		units: [
			['((em|ex|ch|rem|vw|vh|vm|cm|mm|in|px|pt|pc|deg|grad|rad|turn|s|ms|Hz|kHz|%)\\b)?', 'meta.property-value.unit', '@pop']
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

export class LESSMode extends Monarch.MonarchMode<lessWorker.LessWorker> implements Modes.IExtraInfoSupport, Modes.IOutlineSupport {

	public referenceSupport: Modes.IReferenceSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public extraInfoSupport: Modes.IExtraInfoSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public outlineSupport: Modes.IOutlineSupport;
	public suggestSupport: Modes.ISuggestSupport;

	private modeService: IModeService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService
	) {
		super(descriptor, Compile.compile(language), instantiationService, threadService, modeService, modelService);

		this.modeService = modeService;

		this.extraInfoSupport = this;
		this.referenceSupport = new supports.ReferenceSupport(this, {
			tokens: ['support.type.property-name.less', 'meta.property-value.less', 'variable.less', 'entity.other.attribute-name.class.less', 'entity.other.attribute-name.id.less', 'selector.less'],
			findReferences: (resource, position, /*unused*/includeDeclaration) => this.findReferences(resource, position)});
		this.logicalSelectionSupport = this;
		this.declarationSupport = new supports.DeclarationSupport(this, {
			tokens: ['variable.less', 'entity.other.attribute-name.class.less', 'entity.other.attribute-name.id.less', 'selector.less'],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});
		this.outlineSupport = this;

		this.suggestSupport = new supports.SuggestSupport(this, {
			triggerCharacters: [],
			excludeTokens: ['comment.less', 'string.less'],
			suggest: (resource, position) => this.suggest(resource, position)});
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], lessWorker.LessWorker> {
		return createAsyncDescriptor2('vs/languages/less/common/lessWorker', 'LessWorker');
	}

	_worker<T>(runner:(worker:lessWorker.LessWorker)=>winjs.TPromise<T>): winjs.TPromise<T> {
		// TODO@Alex: workaround for missing `bundles` config, before instantiating the lessWorker, we ensure the cssWorker has been loaded
		return this.modeService.getOrCreateMode('css').then((cssMode) => {
			return (<AbstractMode<any>>cssMode)._worker((worker) => winjs.TPromise.as(true));
		}).then(() => {
			return super._worker(runner);
		});
	}

	static $findReferences = OneWorkerAttr(LESSMode, LESSMode.prototype.findReferences);
	public findReferences(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference[]> {
		return this._worker((w) => w.findReferences(resource, position));
	}

	static $getRangesToPosition = OneWorkerAttr(LESSMode, LESSMode.prototype.getRangesToPosition);
	public getRangesToPosition(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._worker((w) => w.getRangesToPosition(resource, position));
	}

	static $computeInfo = OneWorkerAttr(LESSMode, LESSMode.prototype.computeInfo);
	public computeInfo(resource:network.URL, position:EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	static $getOutline = OneWorkerAttr(LESSMode, LESSMode.prototype.getOutline);
	public getOutline(resource:network.URL):winjs.TPromise<Modes.IOutlineEntry[]> {
		return this._worker((w) => w.getOutline(resource));
	}

	static $findDeclaration = OneWorkerAttr(LESSMode, LESSMode.prototype.findDeclaration);
	public findDeclaration(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {
		return this._worker((w) => w.findDeclaration(resource, position));
	}

	static $findColorDeclarations = OneWorkerAttr(LESSMode, LESSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:network.URL):winjs.TPromise<{range:EditorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}
}
