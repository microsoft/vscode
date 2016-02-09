/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import tokenization = require('vs/languages/typescript/common/features/tokenization');
import javascriptWorker = require('vs/languages/javascript/common/javascriptWorker');
import typescriptMode = require('vs/languages/typescript/common/typescriptMode');
import typescript = require('vs/languages/typescript/common/typescript');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import supports = require('vs/editor/common/modes/supports');
import extensions = require('vs/languages/javascript/common/javascript.extensions');
import {createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {AsyncDescriptor, AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';
import {OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

export class JSMode extends typescriptMode.TypeScriptMode<javascriptWorker.JavaScriptWorker> {

	public outlineSupport: Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public extraInfoSupport: Modes.IExtraInfoSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public typeDeclarationSupport: Modes.ITypeDeclarationSupport;
	public suggestSupport: Modes.ISuggestSupport;
	public onEnterSupport: Modes.IOnEnterSupport;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(descriptor, instantiationService, threadService, telemetryService);

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.EcmaScript5);
		this.referenceSupport = new supports.ReferenceSupport(this, {
			tokens: [],
			findReferences: (resource, position, includeDeclaration) => this.findReferences(resource, position, includeDeclaration)});

		this.declarationSupport = new supports.DeclarationSupport(this, {
			tokens: [],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.parameterHintsSupport = new supports.ParameterHintsSupport(this, {
			triggerCharacters: ['(', ','],
			excludeTokens: ['string.js', 'string.escape.js'],
			getParameterHints: (resource, position) => this.getParameterHints(resource, position)});

		this.electricCharacterSupport = new supports.BracketElectricCharacterSupport(this,
			{
				brackets: [
					{ tokenType: 'delimiter.bracket.js', open: '{', close: '}', isElectric: true },
					{ tokenType: 'delimiter.array.js', open: '[', close: ']', isElectric: true },
					{ tokenType: 'delimiter.parenthesis.js', open: '(', close: ')', isElectric: true } ],
				docComment: { scope: 'comment.doc', open: '/**', lineStart: ' * ', close: ' */' }
			});

		this.characterPairSupport = new supports.CharacterPairSupport(this, {
			autoClosingPairs:
				[	{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string', 'comment'] }
				]});

		this.onEnterSupport = new OnEnterSupport(this.getId(), {
			brackets: [
				{ open: '(', close: ')' },
				{ open: '{', close: '}' },
				{ open: '[', close: ']' }
			],
			regExpRules: [
				{
					// e.g. /** | */
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					afterText: /^\s*\*\/$/,
					action: { indentAction: Modes.IndentAction.IndentOutdent, appendText: ' * ' }
				},
				{
					// e.g. /** ...|
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					action: { indentAction: Modes.IndentAction.None, appendText: ' * ' }
				},
				{
					// e.g.  * ...|
					beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
					action: { indentAction: Modes.IndentAction.None, appendText: '* ' }
				},
				{
					// e.g.  */|
					beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
					action: { indentAction: Modes.IndentAction.None, removeText: 1 }
				}
			]
		});

		this.suggestSupport = new supports.SuggestSupport(this, {
			triggerCharacters: ['.'],
			excludeTokens: ['string', 'comment', 'number', 'numeric'],
			suggest: (resource, position) => this.suggest(resource, position),
			getSuggestionDetails: (resource, position, suggestion) => this.getSuggestionDetails(resource, position, suggestion)});
	}

	public asyncCtor(): winjs.Promise {
		if (!this._threadService.isInMainThread) {
			return new winjs.Promise((c, e, p) => {
				// TODO@Alex: workaround for missing `bundles` config, before instantiating the javascriptWorker, we ensure the typescriptWorker has been loaded
				(<any>require)(['vs/languages/typescript/common/typescriptWorker2'], (worker:any) => {
					c(this);
				});
			});
		} else {
			return winjs.TPromise.as(this);
		}
	}

	// ---- specialize by override

	protected _getProjectResolver(): AsyncDescriptor<typescript.IProjectResolver2>|typescript.IProjectResolver2 {
		return extensions.Extensions.getProjectResolver() || extensions.Defaults.ProjectResolver;
	}

	_shouldBeValidated(model: EditorCommon.IModel): boolean {
		return model.getMode() === this || /\.(d\.ts|js)$/.test(model.getAssociatedResource().fsPath);
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], javascriptWorker.JavaScriptWorker> {
		return createAsyncDescriptor2('vs/languages/javascript/common/javascriptWorker', 'JavaScriptWorker');
	}

	public getCommentsConfiguration(): Modes.ICommentsConfiguration {
		return { lineCommentTokens: ['//'], blockCommentStartToken: '/*', blockCommentEndToken: '*/' };
	}

	private static JS_WORD_DEFINITION = createWordRegExp('$');
	public getWordDefinition(): RegExp {
		return JSMode.JS_WORD_DEFINITION;
	}

	public get filter() {
		return void 0;
	}
}
