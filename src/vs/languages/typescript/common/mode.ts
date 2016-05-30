/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';
import * as lifecycle from 'vs/base/common/lifecycle';
import {createTokenizationSupport2, Language} from 'vs/languages/typescript/common/tokenization';
import {createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {RichEditSupport, IRichLanguageConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {LanguageServiceDefaults, typeScriptDefaults, javaScriptDefaults, LanguageServiceMode} from './typescript';
import {register} from './languageFeatures';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import * as workerManager from 'vs/languages/typescript/common/workerManager';

function setupMode(modelService:IModelService, markerService:IMarkerService, modeService:IModeService, defaults:LanguageServiceDefaults, modeId:string, language:Language): void {

	let disposables: lifecycle.IDisposable[] = [];

	const client = <LanguageServiceMode & lifecycle.IDisposable>workerManager.create(defaults, modelService);
	disposables.push(client);

	const registration = register(
		modelService,
		markerService,
		modeId,
		defaults,
		(first, ...more) => client.getLanguageServiceWorker(...[first].concat(more))
	);
	disposables.push(registration);

	disposables.push(modeService.registerRichEditSupport(modeId, richEditConfiguration));

	disposables.push(modeService.registerTokenizationSupport2(modeId, createTokenizationSupport2(language)));
}

const richEditConfiguration:IRichLanguageConfiguration = {
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
			action: { indentAction: modes.IndentAction.IndentOutdent, appendText: ' * ' }
		},
		{
			// e.g. /** ...|
			beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
			action: { indentAction: modes.IndentAction.None, appendText: ' * ' }
		},
		{
			// e.g.  * ...|
			beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
			action: { indentAction: modes.IndentAction.None, appendText: '* ' }
		},
		{
			// e.g.  */|
			beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
			action: { indentAction: modes.IndentAction.None, removeText: 1 }
		},
		{
			// e.g.  *-----*/|
			beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
			action: { indentAction: modes.IndentAction.None, removeText: 1 }
		}
	],

	__electricCharacterSupport: {
		docComment: {scope:'comment.doc', open:'/**', lineStart:' * ', close:' */'}
	},

	autoClosingPairs: [
		{ open: '{', close: '}' },
		{ open: '[', close: ']' },
		{ open: '(', close: ')' },
		{ open: '"', close: '"', notIn: ['string'] },
		{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
		{ open: '`', close: '`' }
	]
};

export function createRichEditSupport(modeId:string): RichEditSupport {
	return new RichEditSupport(modeId, null, richEditConfiguration);
}

let isActivated = false;
export function activate(ctx:ServicesAccessor): void {
	if (isActivated) {
		return;
	}
	isActivated = true;

	let modelService = ctx.get(IModelService);
	let markerService = ctx.get(IMarkerService);
	let modeService = ctx.get(IModeService);

	setupMode(
		modelService,
		markerService,
		modeService,
		typeScriptDefaults,
		'typescript',
		Language.TypeScript
	);

	setupMode(
		modelService,
		markerService,
		modeService,
		javaScriptDefaults,
		'javascript',
		Language.EcmaScript5
	);
}
