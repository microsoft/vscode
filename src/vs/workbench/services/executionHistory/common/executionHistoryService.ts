/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const IExecutionHistoryService = createDecorator<IExecutionHistoryService>('executionHistoryService');

export const EXECUTION_HISTORY_STORAGE_PREFIX = 'positron.executionHistory';
export const INPUT_HISTORY_STORAGE_PREFIX = 'positron.inputHistory';

export interface IExecutionHistoryEntry<T> {
	id: string;
	when: number;
	prompt: string;
	input: string;
	outputType: string;
	output: T;
	error?: IExecutionHistoryError;
	durationMs: number;
}

export enum ExecutionEntryType {
	Startup = 'startup',
	Execution = 'execution',
}

export interface IExecutionHistoryError {
	name: string;
	message: string;
	traceback: string[];
}

export interface IInputHistoryEntry {
	when: number;
	input: string;
}

export interface IExecutionHistoryService extends IDisposable {
	readonly _serviceBrand: undefined;

	getInputEntries(languageId: string): IInputHistoryEntry[];
	getSessionInputEntries(sessionId: string): IInputHistoryEntry[];
	clearInputEntries(languageId: string): void;
	getExecutionEntries(sessionId: string): IExecutionHistoryEntry<any>[];
	clearExecutionEntries(sessionId: string): void;
}

export const replConfigurationBaseNode = Object.freeze<IConfigurationNode>({
	id: 'repl',
	order: 100,
	type: 'object',
	title: nls.localize('consoleConfigurationTitle', "Console"),
	scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
});

export const inputHistorySizeSettingId = 'console.inputHistorySize';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const inputHistoryConfigurationNode: IConfigurationNode = {
	...replConfigurationBaseNode,
	properties: {
		'console.inputHistorySize': {
			type: 'number',
			markdownDescription: nls.localize('console.inputHistorySize', "The number of recent commands to store for each language. Set to 0 to disable history storage."),
			'default': 1000,
			'minimum': 0
		}
	}
};

configurationRegistry.registerConfiguration(inputHistoryConfigurationNode);
