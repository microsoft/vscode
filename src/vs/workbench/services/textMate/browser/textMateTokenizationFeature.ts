/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { IGrammar } from 'vscode-textmate';

export const ITextMateTokenizationFeature = createDecorator<ITextMateTokenizationFeature>('textMateTokenizationFeature');

export interface ITextMateTokenizationFeature {
	readonly _serviceBrand: undefined;

	onDidEncounterLanguage: Event<string>;

	createGrammar(languageId: string): Promise<IGrammar | null>;

	startDebugMode(printFn: (str: string) => void, onStop: () => void): void;
}
