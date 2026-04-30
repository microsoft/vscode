/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, CommandInformationResult, RelatedInformationProvider, RelatedInformationResult, SettingInformationResult } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { sanitizeVSCodeVersion } from '../../../util/common/vscodeVersion';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IEnvService } from '../../env/common/envService';
import { ILogService } from '../../log/common/logService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { IWorkbenchService } from '../../workbench/common/workbenchService';
import { distance, Embedding, EmbeddingType, EmbeddingVector, IEmbeddingsComputer } from './embeddingsComputer';
import { BaseEmbeddingsIndex, EmbeddingCacheType, IEmbeddingsCache, LocalEmbeddingsCache, RemoteCacheType, RemoteEmbeddingsExtensionCache } from './embeddingsIndex';

// A command entry in the embedding index
export type CommandListItem = {
	key: string;
	embedding?: EmbeddingVector;
	keybinding: string;
	label: string;
	originalLabel: string;
};

// A setting entry in the embedding index
export type SettingListItem = {
	key: string;
	type: string;
	default?: unknown;
	description?: string;
	deprecationMessage?: string;
	markdownDeprecationMessage?: string;
	markdownDescription?: string;
	enum?: unknown[];
	enumDescriptions?: string[];
	source?: { id: string; displayName: string };
	embedding?: EmbeddingVector;
};

export function settingItemToContext(item: SettingListItem): string {
	let result = `Setting Id: ${item.key}\n`;
	result += `Type: ${item.type}\n`;
	result += `Description: ${item.description ?? item.markdownDescription ?? ''}\n`;
	if (item.enum) {
		result += `Possible values:\n`;

		for (let i = 0; i < item.enum.length; i++) {
			result += ` - ${item.enum[i]} - ${item.enumDescriptions?.[i] ?? ''}\n`;
		}
	}

	result += '\n';

	return result;
}

// Lifted from proposed API
// TODO @lramos15 where should things like this go?
enum RelatedInformationType {
	SymbolInformation = 1,
	CommandInformation = 2,
	SearchInformation = 3,
	SettingInformation = 4
}

abstract class RelatedInformationProviderEmbeddingsIndex<V extends { key: string; embedding?: EmbeddingVector }> extends BaseEmbeddingsIndex<V> implements RelatedInformationProvider {
	constructor(
		loggerContext: string,
		embeddingType: EmbeddingType,
		cacheKey: string,
		embeddingsComputer: IEmbeddingsComputer,
		embeddingsCache: IEmbeddingsCache,
		private readonly relatedInformationConfig: { type: RelatedInformationType; threshold: number; maxResults: number },
		private readonly _logService: ILogService,
		protected readonly telemetryService: ITelemetryService
	) {
		super(
			loggerContext,
			embeddingType,
			cacheKey,
			embeddingsCache,
			embeddingsComputer,
			_logService
		);
		this.isIndexLoaded = false;
	}

	/**
	 * Returns related information for the given query
	 * @param query The base string which will be compared against indexed items
	 * @param types The types of related information to return
	 * @param token A cancellation token to cancel the request
	 * @returns An array of RelatedInformationResult objects
	 */
	async provideRelatedInformation(query: string, token: CancellationToken): Promise<RelatedInformationResult[]> {
		const similarityStart = Date.now();
		if (!this.isIndexLoaded) {
			// Queue off the calculation, but don't await as the user doesn't need to wait for it
			this.calculateEmbeddings();
			this._logService.debug(`Related Information: Index not loaded yet triggering background calculation, returning ${Date.now() - similarityStart}ms`);
			return [];
		}
		if (token.isCancellationRequested) {
			// return an array of 0s the same length as comparisons
			this._logService.debug(`Related Information: Request cancelled, returning ${Date.now() - similarityStart}ms`);
			return [];
		}
		const startOfEmbeddingRequest = Date.now();
		const embeddingResult = await this.embeddingsComputer.computeEmbeddings(EmbeddingType.text3small_512, [query], {}, new TelemetryCorrelationId('RelatedInformationProviderEmbeddingsIndex::provideRelatedInformation'), token);
		this._logService.debug(`Related Information: Remote similarly request took ${Date.now() - startOfEmbeddingRequest}ms`);
		if (token.isCancellationRequested) {
			// return an array of 0s the same length as comparisons
			this._logService.debug(`Related Information: Request cancelled or no embeddings computed, returning ${Date.now() - similarityStart}ms`);
			return [];
		}

		const results: RelatedInformationResult[] = [];
		for (const item of this._items.values()) {
			if (token.isCancellationRequested) {
				this._logService.debug(`Related Information: Request cancelled, returning ${Date.now() - similarityStart}ms`);
				break;
			}
			if (item.embedding) {
				const score = distance(embeddingResult.values[0], { value: item.embedding, type: EmbeddingType.text3small_512 }).value;
				if (score > this.relatedInformationConfig.threshold) {
					results.push(this.toRelatedInformation(item, score));
				}
			}
		}

		this.logService.debug(`Related Information: Successfully Calculated, returning ${Date.now() - similarityStart}ms`);

		// Only log non-cancelled settings related information queries
		if (this.relatedInformationConfig.type === RelatedInformationType.SettingInformation) {
			this.telemetryService.sendInternalMSFTTelemetryEvent('relatedInformationSettings', { query });
		}

		const returnthis = results
			.sort((a, b) => b.weight - a.weight)
			.slice(0, this.relatedInformationConfig.maxResults);

		return returnthis;
	}

	protected abstract toRelatedInformation(value: V, score: number): RelatedInformationResult;
}

class CommandIdIndex extends RelatedInformationProviderEmbeddingsIndex<CommandListItem> {
	constructor(
		embeddingscache: IEmbeddingsCache,
		@IEmbeddingsComputer embeddingsFetcher: IEmbeddingsComputer,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchService private readonly workbenchService: IWorkbenchService
	) {
		super(
			'CommandIdIndex',
			EmbeddingType.text3small_512,
			'commandEmbeddings',
			embeddingsFetcher,
			embeddingscache,
			{
				type: RelatedInformationType.CommandInformation,
				threshold: /* min threshold of 0 for text-3-small*/ 0,
				maxResults: 100,
			},
			logService,
			telemetryService
		);
	}

	protected override async getLatestItems(): Promise<CommandListItem[]> {
		const allCommands = await this.workbenchService.getAllCommands();
		// This isn't in the command palette, but it's a useful command to suggest
		allCommands.push({
			label: 'Extensions: Search the marketplace for extensions',
			command: 'workbench.extensions.search',
			keybinding: 'Not set',
		});
		allCommands.push({
			label: 'Extensions: Install extension from marketplace',
			command: 'workbench.extensions.installExtension',
			keybinding: 'Not set',
		});
		return allCommands.map(c => {
			return {
				key: c.command,
				label: c.label.replace('View: Toggle', 'View: Toggle or Show or Hide'),
				originalLabel: c.label,
				keybinding: c.keybinding ?? 'Not set',
			};
		});
	}

	protected override getEmbeddingQueryString(value: CommandListItem): string {
		return `${value.label} - ${value.key}`;
	}

	protected override toRelatedInformation(value: CommandListItem, score: number): CommandInformationResult {
		return {
			type: RelatedInformationType.CommandInformation,
			weight: score,
			command: value.key,
		};
	}

}

class SettingsIndex extends RelatedInformationProviderEmbeddingsIndex<SettingListItem> {
	constructor(
		embeddingsCache: IEmbeddingsCache,
		@IEmbeddingsComputer embeddingsFetcher: IEmbeddingsComputer,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchService private readonly workbenchService: IWorkbenchService
	) {
		super(
			'SettingsIndex',
			EmbeddingType.text3small_512,
			'settingEmbeddings',
			embeddingsFetcher,
			embeddingsCache,
			{
				type: RelatedInformationType.SettingInformation,
				threshold: /* min threshold of 0 for text-3-small*/ 0,
				maxResults: 100,
			},
			logService,
			telemetryService
		);
	}

	protected override async getLatestItems(): Promise<SettingListItem[]> {
		const settings = await this.workbenchService.getAllSettings();
		const settingsList: SettingListItem[] = [];
		for (const settingId of Object.keys(settings)) {
			const setting = settings[settingId];
			if (setting.deprecationMessage || setting.markdownDeprecationMessage) {
				continue;
			}
			settingsList.push({ ...setting, key: settingId });
		}
		return settingsList;
	}

	protected override getEmbeddingQueryString(value: SettingListItem): string {
		return settingItemToContext(value);
	}

	protected override toRelatedInformation(value: SettingListItem, score: number): SettingInformationResult {
		return {
			type: RelatedInformationType.SettingInformation,
			weight: score,
			setting: value.key,
		};
	}
}

export interface ICombinedEmbeddingIndex {
	readonly _serviceBrand: undefined;
	readonly commandIdIndex: CommandIdIndex;
	readonly settingsIndex: SettingsIndex;
	loadIndexes(): Promise<void>;
	nClosestValues(embedding: Embedding, n: number): Promise<{ commands: CommandListItem[]; settings: SettingListItem[] }>;
	hasSetting(settingId: string): boolean;
	hasCommand(commandId: string): boolean;
	getSetting(settingId: string): SettingListItem | undefined;
	getCommand(commandId: string): CommandListItem | undefined;
}

export const ICombinedEmbeddingIndex = createServiceIdentifier<ICombinedEmbeddingIndex>('ICombinedEmbeddingIndex');

/**
 * Combines the settings and command indexes into a single index. This is what is consumed externally
 * If necessary, the individual indices can be accessed
 */
export class VSCodeCombinedIndexImpl implements ICombinedEmbeddingIndex {
	declare readonly _serviceBrand: undefined;
	public readonly commandIdIndex: CommandIdIndex;
	public readonly settingsIndex: SettingsIndex;
	constructor(
		useRemoteCache: boolean = true,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvService envService: IEnvService
	) {
		// Local embeddings cache version is locked to 1.98
		const settingsEmbeddingsCache = useRemoteCache ?
			instantiationService.createInstance(RemoteEmbeddingsExtensionCache, EmbeddingCacheType.GLOBAL, 'settingEmbeddings', sanitizeVSCodeVersion(envService.getEditorInfo().version), EmbeddingType.text3small_512, RemoteCacheType.Settings) :
			instantiationService.createInstance(LocalEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'settingEmbeddings', '1.98', EmbeddingType.text3small_512);
		const commandsEmbeddingsCache = useRemoteCache ?
			instantiationService.createInstance(RemoteEmbeddingsExtensionCache, EmbeddingCacheType.GLOBAL, 'commandEmbeddings', sanitizeVSCodeVersion(envService.getEditorInfo().version), EmbeddingType.text3small_512, RemoteCacheType.Commands) :
			instantiationService.createInstance(LocalEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'commandEmbeddings', '1.98', EmbeddingType.text3small_512);

		this.settingsIndex = instantiationService.createInstance(SettingsIndex, settingsEmbeddingsCache);
		this.commandIdIndex = instantiationService.createInstance(CommandIdIndex, commandsEmbeddingsCache);
	}

	public async loadIndexes() {
		await Promise.all([
			this.commandIdIndex.isIndexLoaded ? Promise.resolve() : this.commandIdIndex.calculateEmbeddings(),
			this.settingsIndex.isIndexLoaded ? Promise.resolve() : this.settingsIndex.calculateEmbeddings(),
		]);
	}

	public async nClosestValues(embedding: Embedding, n: number) {
		await this.loadIndexes();
		return {
			commands: this.commandIdIndex.nClosestValues(embedding, n),
			settings: this.settingsIndex.nClosestValues(embedding, n),
		};
	}

	public hasSetting(settingId: string): boolean {
		return this.settingsIndex.hasItem(settingId);
	}

	public hasCommand(commandId: string): boolean {
		return this.commandIdIndex.hasItem(commandId);
	}

	public getSetting(settingId: string): SettingListItem | undefined {
		return this.settingsIndex.getItem(settingId);
	}

	public getCommand(commandId: string): CommandListItem | undefined {
		return this.commandIdIndex.getItem(commandId);
	}
}
