/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ITextMateService, IGrammar } from 'vs/workbench/services/textMate/common/textMateService';
import { LanguageId } from 'vs/editor/common/modes';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SimpleTextMateService implements ITextMateService {

	_serviceBrand: any;

	onDidEncounterLanguage: Event<LanguageId> = Event.None;

	createGrammar(modeId: string): Promise<IGrammar> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(ITextMateService, SimpleTextMateService, true);