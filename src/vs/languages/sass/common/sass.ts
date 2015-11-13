/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Monarch = require('vs/editor/common/modes/monarch/monarch');
import Types = require('vs/editor/common/modes/monarch/monarchTypes');
import Compile = require('vs/editor/common/modes/monarch/monarchCompile');
import winjs = require('vs/base/common/winjs.base');
import Network = require('vs/base/common/network');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import sassWorker = require('vs/languages/sass/common/sassWorker');
import supports = require('vs/editor/common/modes/supports');
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import {AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModelService} from 'vs/editor/common/services/modelService';

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
			['[@](charset|namespace)', { token: 'keyword.control.at-rule', next: '@declarationbody'}],
			['[@](function)', { token: 'keyword.control.at-rule', next: '@functiondeclaration'}],
			['[@](mixin)', { token: 'keyword.control.at-rule', next: '@mixindeclaration'}],
		],

		selector: [
			{ include: '@comments' },
			{ include: '@import' },
			{ include: '@variabledeclaration' },
			{ include: '@warndebug' }, // sass: log statements
			['[@](include)', { token: 'keyword.control.at-rule', next: '@includedeclaration'}], // sass: include statement
			['[@](keyframes|-webkit-keyframes|-moz-keyframes|-o-keyframes)', { token: 'keyword.control.at-rule', next: '@keyframedeclaration'}],
			['[@](page|content|font-face|-moz-document)', { token: 'keyword.control.at-rule'}], // sass: placeholder for includes
			['url(\\-prefix)?\\(', { token: 'support.function.name', bracket: '@open', next: '@urldeclaration'}],
			{ include: '@controlstatement' }, // sass control statements
			{ include: '@selectorname' },
			['[&\\*]', 'entity.name.tag'], // selector symbols
			['[>\\+,]', 'punctuation'], // selector operators
			['\\[', { token: 'punctuation.bracket', bracket: '@open', next: '@selectorattribute' }],
			['{', { token: 'punctuation.curly', bracket: '@open', next: '@selectorbody' }],
		],

		selectorbody: [
			['[*_]?@identifier@ws:(?=(\\s|\\d|[^{;}]*[;}]))', 'support.type.property-name', '@rulevalue'], // rule definition: to distinguish from a nested selector check for whitespace, number or a semicolon
			{ include: '@selector'}, // sass: nested selectors
			['[@](extend)', { token: 'keyword.control.at-rule', next: '@extendbody'}], // sass: extend other selectors
			['[@](return)', { token: 'keyword.control.at-rule', next: '@declarationbody'}],
			['}', { token: 'punctuation.curly', bracket: '@close', next: '@pop'}],
		 ],

		selectorname: [
			['#{', { token: 'support.function.interpolation', bracket: '@open', next: '@variableinterpolation' }], // sass: interpolation
			['(\\.|#(?=[^{])|%|(@identifier)|:)+', 'entity.other.attribute-name'], // selector (.foo, div, ...)
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
			['[*_]?@identifier@ws:', 'support.type.property-name', '@rulevalue'],
			{ include: '@comments' },
			['}', { token: 'punctuation.curly', bracket: '@close', next: '@pop'}],
		],

		warndebug: [
			['[@](warn|debug)', { token: 'keyword.control.at-rule', next: '@declarationbody'}],
		],

		import: [
			['[@](import)', { token: 'keyword.control.at-rule', next: '@declarationbody'}],
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
			['@identifier', 'meta.property-value'],
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
			['\\$@identifier@ws:', 'support.type.property-name'],
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
			['[@](return)', { token: 'keyword.control.at-rule'}],
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
			['\\$@identifier@ws:', 'support.type.property-name'],
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

export class SASSMode extends Monarch.MonarchMode<sassWorker.SassWorker> implements Modes.IExtraInfoSupport, Modes.IOutlineSupport {

	public referenceSupport: Modes.IReferenceSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public extraInfoSupport: Modes.IExtraInfoSupport;
	public outlineSupport: Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
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
			tokens: ['support.type.property-name.sass', 'meta.property-value.sass', 'variable.decl.sass', 'variable.ref.sass', 'support.function.name.sass', 'support.type.property-name.sass', 'entity.other.attribute-name.sass'],
			findReferences: (resource, position, /*unused*/includeDeclaration) => this.findReferences(resource, position)});
		this.logicalSelectionSupport = this;
		this.declarationSupport = new supports.DeclarationSupport(this, {
			tokens: ['variable.decl.sass', 'variable.ref.sass', 'support.function.name.sass', 'support.type.property-name.sass', 'entity.other.attribute-name.sass'],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});
		this.outlineSupport = this;

		this.suggestSupport = new supports.SuggestSupport(this, {
			triggerCharacters: [],
			excludeTokens: ['comment.sass', 'string.sass'],
			suggest: (resource, position) => this.suggest(resource, position)});
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], sassWorker.SassWorker> {
		return createAsyncDescriptor2('vs/languages/sass/common/sassWorker', 'SassWorker');
	}

	_worker<T>(runner:(worker:sassWorker.SassWorker)=>winjs.TPromise<T>): winjs.TPromise<T> {
		// TODO@Alex: workaround for missing `bundles` config, before instantiating the sassWorker, we ensure the cssWorker has been loaded
		return this.modeService.getOrCreateMode('css').then((cssMode) => {
			return (<AbstractMode<any>>cssMode)._worker((worker) => winjs.TPromise.as(true));
		}).then(() => {
			return super._worker(runner);
		});
	}

	static $findReferences = OneWorkerAttr(SASSMode, SASSMode.prototype.findReferences);
	public findReferences(resource:Network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference[]> {
		return this._worker((w) => w.findReferences(resource, position));
	}

	static $getRangesToPosition = OneWorkerAttr(SASSMode, SASSMode.prototype.getRangesToPosition);
	public getRangesToPosition(resource:Network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._worker((w) => w.getRangesToPosition(resource, position));
	}

	static $computeInfo = OneWorkerAttr(SASSMode, SASSMode.prototype.computeInfo);
	public computeInfo(resource:Network.URL, position:EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	static $getOutline = OneWorkerAttr(SASSMode, SASSMode.prototype.getOutline);
	public getOutline(resource:Network.URL):winjs.TPromise<Modes.IOutlineEntry[]> {
		return this._worker((w) => w.getOutline(resource));
	}

	static $findDeclaration = OneWorkerAttr(SASSMode, SASSMode.prototype.findDeclaration);
	public findDeclaration(resource:Network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {
		return this._worker((w) => w.findDeclaration(resource, position));
	}

	static $findColorDeclarations = OneWorkerAttr(SASSMode, SASSMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:Network.URL):winjs.TPromise<{range:EditorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}
}