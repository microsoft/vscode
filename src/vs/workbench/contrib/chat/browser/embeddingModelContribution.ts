/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
// eslint-disable-next-line local/code-import-patterns
import { IEmbeddingsService } from '../../../api/browser/mainThreadEmbeddings.js';
import { ChatConfiguration } from '../common/constants.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const defaultEntryLabel = localize('chat.embeddingModel.defaultEntry.label', 'Default');
const defaultEntryDescription = localize('chat.embeddingModel.defaultEntry.description', "Use the built-in default embedding model");

const embeddingModelIds: string[] = [''];
const embeddingModelLabels: string[] = [defaultEntryLabel];
const embeddingModelDescriptions: string[] = [defaultEntryDescription];

/**
 * Populates the dynamic enum of embedding models for the `chat.embeddingModel`
 * setting. Lists all embedding models registered via
 * `vscode.lm.registerEmbeddingsProvider` from any extension (BYOK, Ollama,
 * Copilot, etc.). Selecting a model here overrides the internal CAPI
 * embedding endpoint used for code search, context retrieval, and other
 * embedding-dependent flows.
 */
export class EmbeddingModelContribution extends Disposable {
	static readonly ID = 'workbench.contrib.embeddingModel';

	static readonly modelIds = embeddingModelIds;
	static readonly modelLabels = embeddingModelLabels;
	static readonly modelDescriptions = embeddingModelDescriptions;

	constructor(
		@IEmbeddingsService private readonly _embeddingsService: IEmbeddingsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_embeddingsService.onDidChange(() => this._updateModelValues()));
		this._updateModelValues();
	}

	private _updateModelValues(): void {
		const { modelIds, modelLabels, modelDescriptions } = EmbeddingModelContribution;

		try {
			// Clear arrays
			modelIds.length = 0;
			modelLabels.length = 0;
			modelDescriptions.length = 0;

			// Add default/empty option
			modelIds.push('');
			modelLabels.push(defaultEntryLabel);
			modelDescriptions.push(defaultEntryDescription);

			// Collect all registered embedding provider IDs
			const providers = Array.from(this._embeddingsService.allProviders);
			providers.sort();

			for (const providerId of providers) {
				modelIds.push(providerId);
				modelLabels.push(providerId);
				modelDescriptions.push('Embedding model: ' + providerId);
			}

			configurationRegistry.notifyConfigurationSchemaUpdated({
				id: 'chatSidebar',
				properties: {
					[ChatConfiguration.EmbeddingModel]: {}
				}
			});
		} catch (e) {
			this._logService.error('[EmbeddingModel] Error updating model values:', e);
		}
	}
}

registerWorkbenchContribution2(EmbeddingModelContribution.ID, EmbeddingModelContribution, WorkbenchPhase.BlockRestore);
