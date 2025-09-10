/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

//
// AUTO-GENERATED from help.json; do not edit.
//

import { Event } from '../../../../base/common/event.js';
import { ErdosBaseComm, ErdosCommOptions } from './erdosBaseComm.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

export interface ParseFunctionsResult {
	functions: Array<string>;

	success: boolean;

	error?: string;

}

export enum ParseFunctionsLanguage {
	Python = 'python',
	R = 'r'
}

export interface ShowHelpTopicParams {
	topic: string;
}

export interface SearchHelpTopicsParams {
	query: string;
}

export interface ParseFunctionsParams {
	code: string;

	language: ParseFunctionsLanguage;
}

export enum ShowHelpKind {
	Html = 'html',
	Markdown = 'markdown',
	Url = 'url'
}

export interface ShowHelpParams {
	content: string;

	kind: ShowHelpKind;

	focus: boolean;
}

export interface ShowHelpEvent {
	content: string;

	kind: ShowHelpKind;

	focus: boolean;

}

export enum HelpFrontendEvent {
	ShowHelp = 'show_help'
}

export enum HelpBackendRequest {
	ShowHelpTopic = 'show_help_topic',
	SearchHelpTopics = 'search_help_topics',
	ParseFunctions = 'parse_functions'
}

export class ErdosHelpComm extends ErdosBaseComm {
	constructor(
		instance: IRuntimeClientInstance<any, any>,
		options?: ErdosCommOptions<HelpBackendRequest>,
	) {
		super(instance, options);
		this.onDidShowHelp = super.createEventEmitter('show_help', ['content', 'kind', 'focus']);
	}

	showHelpTopic(topic: string): Promise<boolean> {
		return super.performRpc('show_help_topic', ['topic'], [topic]);
	}

	searchHelpTopics(query: string): Promise<Array<string>> {
		return super.performRpc('search_help_topics', ['query'], [query]);
	}

	parseFunctions(code: string, language: ParseFunctionsLanguage): Promise<ParseFunctionsResult> {
		return super.performRpc('parse_functions', ['code', 'language'], [code, language]);
	}


	onDidShowHelp: Event<ShowHelpEvent>;
}

