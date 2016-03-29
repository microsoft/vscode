/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import Modes = require('vs/editor/common/modes');
import lifecycle = require('vs/base/common/lifecycle');
import tokenization = require('vs/languages/typescript/common/features/tokenization');
import {AbstractMode, createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import AbstractWorker from './worker/abstractWorker';

import registerLanguaeFeatures from './languageFeatures';


export class TypeScriptMode extends AbstractMode implements lifecycle.IDisposable {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;

	private _modelService: IModelService;
	private _disposables: lifecycle.IDisposable[] = [];

	constructor(
		descriptor: Modes.IModeDescriptor,
		@IModelService modelService: IModelService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor.id);

		this._modelService = modelService;
		if (threadService.isInMainThread) {
			this._setupWorker();
		}

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.TypeScript);
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

	private _setupWorker(): void {

		const factory = new DefaultWorkerFactory();
		let client: SimpleWorkerClient<AbstractWorker>;
		let handle: number;

		this._disposables.push({
			dispose() {
				clearTimeout(handle);
				if (client) {
					client.dispose();
				}
			}
		});

		const worker = () => {

			if (!client) {
				client = new SimpleWorkerClient<AbstractWorker>(
					factory,
					'vs/languages/typescript/common/worker/typescriptWorker',
					AbstractWorker);

				handle = setInterval(() => {
					if (Date.now() - client.getLastRequestTimestamp() > 1000 * 60 * 5) {
						dispose();
					}
				}, 1000 * 60);

				function dispose() {
					clearTimeout(handle);
					client.dispose();
					client = undefined;
				}
			}

			let result = client.get();
			return WinJS.TPromise.as(result);
		};

		// --- register features
		registerLanguaeFeatures(this.getId(), this._modelService, worker);
	}
}
