/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//
// AUTO-GENERATED from help.json; do not edit.
//

import { Event } from '../../../../base/common/event.js';
import { ErdosBaseComm, ErdosCommOptions } from './erdosBaseComm.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

export interface ShowHelpTopicParams {
	topic: string;
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
	ShowHelpTopic = 'show_help_topic'
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


	onDidShowHelp: Event<ShowHelpEvent>;
}

