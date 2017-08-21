/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IGrammar } from 'vscode-textmate';
import { LanguageId } from 'vs/editor/common/modes';

export var ITextMateService = createDecorator<ITextMateService>('textMateService');

export interface ITextMateService {
	_serviceBrand: any;

	onDidEncounterLanguage: Event<LanguageId>;

	createGrammar(modeId: string): TPromise<IGrammar>;
}
