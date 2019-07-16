/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const enum ExperimentState {
	Evaluating,
	NoRun,
	Run,
	Complete
}

export interface IExperimentAction {
	type: ExperimentActionType;
	properties: any;
}

export enum ExperimentActionType {
	Custom = 'Custom',
	Prompt = 'Prompt',
	AddToRecommendations = 'AddToRecommendations',
	ExtensionSearchResults = 'ExtensionSearchResults'
}

export type LocalizedPromptText = { [locale: string]: string; };

export interface IExperimentActionPromptProperties {
	promptText: string | LocalizedPromptText;
	commands: IExperimentActionPromptCommand[];
}

export interface IExperimentActionPromptCommand {
	text: string | { [key: string]: string };
	externalLink?: string;
	curatedExtensionsKey?: string;
	curatedExtensionsList?: string[];
}

export interface IExperiment {
	id: string;
	enabled: boolean;
	state: ExperimentState;
	action?: IExperimentAction;
}

export interface IExperimentService {
	_serviceBrand: any;
	getExperimentById(id: string): Promise<IExperiment>;
	getExperimentsByType(type: ExperimentActionType): Promise<IExperiment[]>;
	getCuratedExtensionsList(curatedExtensionsKey: string): Promise<string[]>;
	markAsCompleted(experimentId: string): void;

	onExperimentEnabled: Event<IExperiment>;
}

export const IExperimentService = createDecorator<IExperimentService>('experimentService');