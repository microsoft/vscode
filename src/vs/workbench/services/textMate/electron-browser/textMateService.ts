/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { LanguageId } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IGrammar } from 'vscode-textmate';

export const ITextMateService = createDecorator<ITextMateService>('textMateService');

export interface ITextMateService {
	_serviceBrand: any;

	onDidEncounterLanguage: Event<LanguageId>;

	createGrammar(modeId: string): Promise<IGrammar>;
}
