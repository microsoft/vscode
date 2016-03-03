/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {JSONLocation} from './jsonLocation';
import {ISuggestionsCollector} from './jsonCompletion';

import {MarkedString, CompletionItem} from 'vscode-languageserver';

export {ISuggestionsCollector} from './jsonCompletion';


export interface IJSONWorkerContribution {
	getInfoContribution(resource: string, location: JSONLocation) : Thenable<MarkedString[]>;
	collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: ISuggestionsCollector) : Thenable<any>;
	collectValueSuggestions(resource: string, location: JSONLocation, propertyKey: string, result: ISuggestionsCollector): Thenable<any>;
	collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any>;
	resolveSuggestion?(item: CompletionItem): Thenable<CompletionItem>;
}