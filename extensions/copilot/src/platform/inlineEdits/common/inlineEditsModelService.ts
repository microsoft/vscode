/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { ModelConfiguration } from './dataTypes/xtabPromptOptions';

export interface IInlineEditsModelService {
	readonly _serviceBrand: undefined;

	readonly modelInfo: vscode.InlineCompletionModelInfo | undefined;

	readonly onModelListUpdated: Event<void>;

	setCurrentModelId(modelId: string): Promise<void>;

	selectedModelConfiguration(): ModelConfiguration;

	defaultModelConfiguration(): ModelConfiguration;
}

export const IInlineEditsModelService = createServiceIdentifier<IInlineEditsModelService>('IInlineEditsModelService');

export class NullInlineEditsModelService implements IInlineEditsModelService {
	declare _serviceBrand: undefined;

	readonly modelInfo = undefined;

	readonly onModelListUpdated = Event.None;

	setCurrentModelId(_modelId: string): Promise<void> {
		return Promise.resolve();
	}

	selectedModelConfiguration(): ModelConfiguration {
		return NullInlineEditsModelService._defaultConfiguration();
	}

	defaultModelConfiguration(): ModelConfiguration {
		return NullInlineEditsModelService._defaultConfiguration();
	}

	private static _defaultConfiguration(): ModelConfiguration {
		return {
			modelName: '',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: true,
			lintOptions: undefined,
		};
	}
}

export interface IUndesiredModelsManager {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	isUndesiredModelId(modelId: string): boolean;
	addUndesiredModelId(modelId: string): Promise<void>;
	removeUndesiredModelId(modelId: string): Promise<void>;
}

export const IUndesiredModelsManager = createServiceIdentifier<IUndesiredModelsManager>('IUndesiredModelsManager');

export class NullUndesiredModelsManager implements IUndesiredModelsManager {
	declare _serviceBrand: undefined;

	readonly onDidChange = Event.None;

	isUndesiredModelId(_modelId: string): boolean {
		return false;
	}
	addUndesiredModelId(_modelId: string): Promise<void> {
		return Promise.resolve();
	}
	removeUndesiredModelId(_modelId: string): Promise<void> {
		return Promise.resolve();
	}
}
