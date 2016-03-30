/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import lifecycle = require('vs/base/common/lifecycle');
import tokenization = require('vs/languages/typescript/common/tokenization');
import {AbstractMode, createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {LanguageServiceDefaults, typeScriptDefaults, javaScriptDefaults} from './typescript';

export abstract class Mode extends AbstractMode implements lifecycle.IDisposable {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;

	private _disposables: lifecycle.IDisposable[] = [];

	constructor(
		descriptor: Modes.IModeDescriptor,
		defaults:LanguageServiceDefaults,
		@IThreadService threadService: IThreadService,
		@IModelService private _modelService: IModelService,
		@IMarkerService private _markerService: IMarkerService
	) {
		super(descriptor.id);

		if (threadService.isInMainThread) {
			// this is needed as long as this mode is also instantiated in the
			// worker
			require(['vs/languages/typescript/common/worker/workerManager'], manager => {
				this._disposables.push(manager.create(this.getId(), defaults, this._modelService, this._markerService));
			}, err => {
				console.error(err);
			});
		}

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
				docComment: {scope:'comment.doc', open:'/**', lineStart:' * ', close:' */'}
			},

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
					{ open: '`', close: '`' }
				]
			}
		});
	}

	public dispose(): void {
		this._disposables = lifecycle.disposeAll(this._disposables);
	}
}

export class TypeScriptMode extends Mode {

	constructor(
		descriptor: Modes.IModeDescriptor,
		@IThreadService threadService: IThreadService,
		@IModelService modelService: IModelService,
		@IMarkerService markerService: IMarkerService
	) {
		super(descriptor, typeScriptDefaults, threadService, modelService, markerService);

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.TypeScript);
	}
}

export class JavaScriptMode extends Mode {

	constructor(
		descriptor: Modes.IModeDescriptor,
		@IThreadService threadService: IThreadService,
		@IModelService modelService: IModelService,
		@IMarkerService markerService: IMarkerService
	) {
		super(descriptor, javaScriptDefaults, threadService, modelService, markerService);

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.EcmaScript5);
	}
}