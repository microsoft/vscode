/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import javascriptWorker = require('vs/languages/javascript/common/javascriptWorker');
import typescriptMode = require('vs/languages/typescript/common/typescriptMode');
import typescript = require('vs/languages/typescript/common/typescript');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import extensions = require('vs/languages/javascript/common/javascript.extensions');
import {createWordRegExp, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {DeclarationSupport} from 'vs/editor/common/modes/supports/declarationSupport';
import {ReferenceSupport} from 'vs/editor/common/modes/supports/referenceSupport';
import {ParameterHintsSupport} from 'vs/editor/common/modes/supports/parameterHintsSupport';
import {SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';

import tokenization = typescriptMode.tokenization;

export class JSMode extends typescriptMode.TypeScriptMode<javascriptWorker.JavaScriptWorker> {

	public outlineSupport: Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public extraInfoSupport: Modes.IExtraInfoSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public typeDeclarationSupport: Modes.ITypeDeclarationSupport;
	public suggestSupport: Modes.ISuggestSupport;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(descriptor, instantiationService, threadService, telemetryService);

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.EcmaScript5);
		this.referenceSupport = new ReferenceSupport(this.getId(), {
			tokens: [],
			findReferences: (resource, position, includeDeclaration) => this.findReferences(resource, position, includeDeclaration)});

		this.declarationSupport = new DeclarationSupport(this.getId(), {
			tokens: [],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.parameterHintsSupport = new ParameterHintsSupport(this.getId(), {
			triggerCharacters: ['(', ','],
			excludeTokens: ['string.js', 'string.escape.js'],
			getParameterHints: (resource, position) => this.getParameterHints(resource, position)});

		this.richEditSupport = new RichEditSupport(this.getId(), null, {
			wordPattern: createWordRegExp('$'),

			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			},

			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],

			onEnterRules: [
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
			],

			__electricCharacterSupport: {
				docComment: { scope: 'comment.doc', open: '/**', lineStart: ' * ', close: ' */' }
			},

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string', 'comment'] }
				]
			}
		});

		this.suggestSupport = new SuggestSupport(this.getId(), {
			triggerCharacters: ['.'],
			excludeTokens: ['string', 'comment', 'number', 'numeric'],
			suggest: (resource, position) => this.suggest(resource, position),
			getSuggestionDetails: (resource, position, suggestion) => this.getSuggestionDetails(resource, position, suggestion)});
	}

	protected _createModeWorkerManager(descriptor:Modes.IModeDescriptor, instantiationService: IInstantiationService): ModeWorkerManager<javascriptWorker.JavaScriptWorker> {
		return new ModeWorkerManager<javascriptWorker.JavaScriptWorker>(descriptor, 'vs/languages/javascript/common/javascriptWorker', 'JavaScriptWorker', 'vs/languages/typescript/common/typescriptWorker2', instantiationService);
	}

	// ---- specialize by override

	protected _getProjectResolver(): AsyncDescriptor<typescript.IProjectResolver2>|typescript.IProjectResolver2 {
		return extensions.Defaults.ProjectResolver;
	}

	_shouldBeValidated(model: EditorCommon.IModel): boolean {
		return model.getMode() === this || /\.(d\.ts|js)$/.test(model.getAssociatedResource().fsPath);
	}

	public get filter() {
		return void 0;
	}
}
