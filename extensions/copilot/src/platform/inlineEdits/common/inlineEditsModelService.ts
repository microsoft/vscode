/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { constObservable, IObservable } from '../../../util/vs/base/common/observable';
import { ModelConfiguration } from './dataTypes/xtabPromptOptions';

export interface IInlineEditsModelService {
	readonly _serviceBrand: undefined;

	readonly modelInfo: vscode.InlineCompletionModelInfo | undefined;

	readonly onModelListUpdated: Event<void>;

	setCurrentModelId(modelId: string): Promise<void>;

	selectedModelConfiguration(): ModelConfiguration;

	defaultModelConfiguration(): ModelConfiguration;

	/**
	 * Whether the selected model handles inline completions itself, or `undefined` when it expresses
	 * no opinion.
	 *
	 * Observable because it is the only baked capability consulted when the inline completion
	 * providers are registered rather than per request, so registration has to re-run when the
	 * selected model changes.
	 *
	 * Every consumer, including the per-request path, resolves through this same observable. If
	 * registration excluded the separate provider while the request path disagreed, NES would decline
	 * to serve a document it is not enabled for and the user would be left with no suggestion at all.
	 */
	readonly supportsUnifiedCompletions: IObservable<boolean | undefined>;
}

export const IInlineEditsModelService = createServiceIdentifier<IInlineEditsModelService>('IInlineEditsModelService');

export class NullInlineEditsModelService implements IInlineEditsModelService {
	declare _serviceBrand: undefined;

	readonly modelInfo = undefined;

	readonly onModelListUpdated = Event.None;

	readonly supportsUnifiedCompletions = constObservable<boolean | undefined>(undefined);

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
