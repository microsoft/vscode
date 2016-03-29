/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import typescriptMode = require('vs/languages/typescript/common/typescriptMode');
import Modes = require('vs/editor/common/modes');
import {createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModelService} from 'vs/editor/common/services/modelService';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import tokenization = require('vs/languages/typescript/common/features/tokenization');

export class JSMode extends typescriptMode.TypeScriptMode {

	public outlineSupport: Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public extraInfoSupport: Modes.IExtraInfoSupport;
	public logicalSelectionSupport: Modes.ILogicalSelectionSupport;
	public typeDeclarationSupport: Modes.ITypeDeclarationSupport;
	public suggestSupport: Modes.ISuggestSupport;

	constructor(
		descriptor: Modes.IModeDescriptor,
		@IModelService modelService: IModelService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, modelService, threadService);

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.EcmaScript5);
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
	}
}
