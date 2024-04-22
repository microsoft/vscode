/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { Extensions, IExtensionFeatureMarkdownAndTableRenderer, IExtensionFeaturesRegistry, IRenderedData, ITableData } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { ILanguageModelsService } from 'vs/workbench/contrib/chat/common/languageModels';
import { getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Registry } from 'vs/platform/registry/common/platform';
import { localize } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';

export interface ILanguageModelStats {
	readonly identifier: string;
	readonly extensions: {
		readonly extensionId: string;
		readonly requestCount: number;
		readonly tokenCount: number;
		readonly sessionRequestCount: number;
		readonly sessionTokenCount: number;
		readonly participants: {
			readonly id: string;
			readonly requestCount: number;
			readonly tokenCount: number;
			readonly sessionRequestCount: number;
			readonly sessionTokenCount: number;
		}[];
	}[];
}

export const ILanguageModelStatsService = createDecorator<ILanguageModelStatsService>('ILanguageModelStatsService');

export interface ILanguageModelStatsService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeLanguageMoelStats: Event<string>;

	hasAccessedModel(extensionId: string, model: string): boolean;

	update(model: string, extensionId: ExtensionIdentifier, agent: string | undefined, tokenCount: number | undefined): Promise<void>;
	fetch(model: string): Promise<ILanguageModelStats>;

}

interface LanguageModelStats {
	extensions: {
		extensionId: string;
		requestCount: number;
		tokenCount: number;
		participants: {
			id: string;
			requestCount: number;
			tokenCount: number;
		}[];
	}[];
}

export class LanguageModelStatsService extends Disposable implements ILanguageModelStatsService {

	private static readonly MODEL_STATS_STORAGE_KEY_PREFIX = 'languageModelStats.';
	private static readonly MODEL_ACCESS_STORAGE_KEY_PREFIX = 'languageModelAccess.';

	declare _serviceBrand: undefined;

	private readonly _onDidChangeStats = this._register(new Emitter<string>());
	readonly onDidChangeLanguageMoelStats = this._onDidChangeStats.event;

	private readonly sessionStats = new Map<string, LanguageModelStats>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._register(_storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, this._store)(e => {
			const model = this.getModel(e.key);
			if (model) {
				this._onDidChangeStats.fire(model);
			}
		}));
	}

	hasAccessedModel(extensionId: string, model: string): boolean {
		return this.getAccessExtensions(model).includes(extensionId.toLowerCase());
	}

	async fetch(model: string): Promise<ILanguageModelStats> {
		const globalStats = await this.read(model);
		const sessionStats = this.sessionStats.get(model) ?? { extensions: [] };
		return {
			identifier: model,
			extensions: globalStats.extensions.map(extension => {
				const sessionExtension = sessionStats.extensions.find(e => e.extensionId === extension.extensionId);
				return {
					extensionId: extension.extensionId,
					requestCount: extension.requestCount,
					tokenCount: extension.tokenCount,
					sessionRequestCount: sessionExtension?.requestCount ?? 0,
					sessionTokenCount: sessionExtension?.tokenCount ?? 0,
					participants: extension.participants.map(participant => {
						const sessionParticipant = sessionExtension?.participants.find(p => p.id === participant.id);
						return {
							id: participant.id,
							requestCount: participant.requestCount,
							tokenCount: participant.tokenCount,
							sessionRequestCount: sessionParticipant?.requestCount ?? 0,
							sessionTokenCount: sessionParticipant?.tokenCount ?? 0
						};
					})
				};
			})
		};
	}

	async update(model: string, extensionId: ExtensionIdentifier, agent: string | undefined, tokenCount: number | undefined): Promise<void> {
		// update model access
		this.addAccess(model, extensionId.value);

		// update session stats
		let sessionStats = this.sessionStats.get(model);
		if (!sessionStats) {
			sessionStats = { extensions: [] };
			this.sessionStats.set(model, sessionStats);
		}
		this.add(sessionStats, extensionId.value, agent, tokenCount);

		this.write(model, extensionId.value, agent, tokenCount);
		this._onDidChangeStats.fire(model);
	}

	private addAccess(model: string, extensionId: string): void {
		extensionId = extensionId.toLowerCase();
		const extensions = this.getAccessExtensions(model);
		if (!extensions.includes(extensionId)) {
			extensions.push(extensionId);
			this._storageService.store(this.getAccessKey(model), JSON.stringify(extensions), StorageScope.APPLICATION, StorageTarget.USER);
		}
	}

	private getAccessExtensions(model: string): string[] {
		const key = this.getAccessKey(model);
		const data = this._storageService.get(key, StorageScope.APPLICATION);
		try {
			if (data) {
				const parsed = JSON.parse(data);
				if (Array.isArray(parsed)) {
					return parsed;
				}
			}
		} catch (e) {
			// ignore
		}
		return [];

	}

	private async write(model: string, extensionId: string, participant: string | undefined, tokenCount: number | undefined): Promise<void> {
		const modelStats = await this.read(model);
		this.add(modelStats, extensionId, participant, tokenCount);
		this._storageService.store(this.getKey(model), JSON.stringify(modelStats), StorageScope.APPLICATION, StorageTarget.USER);
	}

	private add(modelStats: LanguageModelStats, extensionId: string, participant: string | undefined, tokenCount: number | undefined): void {
		let extensionStats = modelStats.extensions.find(e => ExtensionIdentifier.equals(e.extensionId, extensionId));
		if (!extensionStats) {
			extensionStats = { extensionId, requestCount: 0, tokenCount: 0, participants: [] };
			modelStats.extensions.push(extensionStats);
		}
		if (participant) {
			let participantStats = extensionStats.participants.find(p => p.id === participant);
			if (!participantStats) {
				participantStats = { id: participant, requestCount: 0, tokenCount: 0 };
				extensionStats.participants.push(participantStats);
			}
			participantStats.requestCount++;
			participantStats.tokenCount += tokenCount ?? 0;
		} else {
			extensionStats.requestCount++;
			extensionStats.tokenCount += tokenCount ?? 0;
		}
	}

	private async read(model: string): Promise<LanguageModelStats> {
		try {
			const value = this._storageService.get(this.getKey(model), StorageScope.APPLICATION);
			if (value) {
				return JSON.parse(value);
			}
		} catch (error) {
			// ignore
		}
		return { extensions: [] };
	}

	private getModel(key: string): string | undefined {
		if (key.startsWith(LanguageModelStatsService.MODEL_STATS_STORAGE_KEY_PREFIX)) {
			return key.substring(LanguageModelStatsService.MODEL_STATS_STORAGE_KEY_PREFIX.length);
		}
		return undefined;
	}

	private getKey(model: string): string {
		return `${LanguageModelStatsService.MODEL_STATS_STORAGE_KEY_PREFIX}${model}`;
	}

	private getAccessKey(model: string): string {
		return `${LanguageModelStatsService.MODEL_ACCESS_STORAGE_KEY_PREFIX}${model}`;
	}
}

interface Stats {
	requestCount: number;
	tokenCount: number;
	sessionRequestCount: number;
	sessionTokenCount: number;
}

interface ExtensionLanguageModelStats extends Stats {
	languageModelId: string;
	other: Stats;
	participants: Array<Stats & { name: string }>;
}

class LanguageModelFeatureRenderer extends Disposable implements IExtensionFeatureMarkdownAndTableRenderer {

	readonly type = 'markdown+table';

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILanguageModelStatsService private readonly _languageModelStatsService: ILanguageModelStatsService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {
		super();
	}

	shouldRender(manifest: IExtensionManifest): boolean {
		if (!!manifest.contributes?.chatParticipants?.length) {
			return true;
		}
		const extensionId = getExtensionId(manifest.publisher, manifest.name);
		if (this._languageModelsService.getLanguageModelIds().some(id =>
			this._languageModelStatsService.hasAccessedModel(extensionId, id)
			|| ExtensionIdentifier.equals(this._languageModelsService.lookupLanguageModel(id)?.extension, extensionId))) {
			return true;
		}
		return false;
	}

	render(manifest: IExtensionManifest): IRenderedData<Array<IMarkdownString | ITableData>> {
		const disposables = new DisposableStore();
		const extensionId = getExtensionId(manifest.publisher, manifest.name);
		const emitter = disposables.add(new Emitter<Array<IMarkdownString | ITableData>>());

		this.fetchAllLanguageModelStats(extensionId).then(({ data, onDidChange, disposable }) => {
			disposables.add(disposable);
			const renderData = (languageModelStats: ExtensionLanguageModelStats[]) => {
				const data: Array<IMarkdownString | ITableData> = [];
				for (const stats of languageModelStats) {
					if (stats.requestCount > 0) {
						const languageModelTitle = new MarkdownString();
						languageModelTitle.appendMarkdown(`&nbsp;&nbsp;`);
						languageModelTitle.appendMarkdown(`\n\n### ${stats.languageModelId}\n---\n\n`);
						data.push(languageModelTitle);
						const tableData: ITableData = {
							headers: [localize('participant', "Participant"), localize('requests', "Requests"), localize('tokens', "Tokens"), localize('requests session', "Requests (Session)"), localize('tokens session', "Tokens (Session)")],
							rows: [
								...stats.participants.map(participant => [participant.name, `${participant.requestCount}`, `${participant.tokenCount}`, `${participant.sessionRequestCount}`, `${participant.sessionTokenCount}`]),
								stats.other.requestCount > 0 ? [stats.participants.length ? 'Other' : '', `${stats.other.requestCount}`, `${stats.other.tokenCount}`, `${stats.other.sessionRequestCount}`, `${stats.other.sessionTokenCount}`] : [],
								stats.participants.length ? ['Total', `${stats.requestCount}`, `${stats.tokenCount}`, `${stats.sessionRequestCount}`, `${stats.sessionTokenCount}`] : [],
							]
						};
						data.push(tableData);
					}
				}
				return data;
			};
			emitter.fire(renderData(data));
			disposables.add(onDidChange(data => emitter.fire(renderData(data))));
		});

		const data: Array<IMarkdownString | ITableData> = [];
		data.push(new MarkdownString().appendMarkdown(`Fetching...`));

		return {
			data,
			onDidChange: emitter.event,
			dispose: () => {
				disposables.dispose();
			}
		};
	}

	private async fetchAllLanguageModelStats(extensionId: string): Promise<{ data: ExtensionLanguageModelStats[]; onDidChange: Event<ExtensionLanguageModelStats[]>; disposable: IDisposable }> {
		const disposables = new DisposableStore();
		const data: ExtensionLanguageModelStats[] = [];
		const emitter = disposables.add(new Emitter<ExtensionLanguageModelStats[]>());

		const models = this._languageModelsService.getLanguageModelIds();
		for (const model of models) {
			data.push(await this.fetchLanguageModelStats(extensionId, model));
		}

		disposables.add(this._languageModelStatsService.onDidChangeLanguageMoelStats(model => {
			this.fetchLanguageModelStats(extensionId, model).then(stats => {
				const index = data.findIndex(d => d.languageModelId === model);
				if (index !== -1) {
					data[index] = stats;
				} else {
					data.push(stats);
				}
				emitter.fire(data);
			});
		}));

		return {
			data,
			onDidChange: emitter.event,
			disposable: disposables
		};
	}

	private async fetchLanguageModelStats(extensionId: string, languageModel: string): Promise<ExtensionLanguageModelStats> {
		const result: ExtensionLanguageModelStats = {
			languageModelId: languageModel,
			requestCount: 0,
			tokenCount: 0,
			sessionRequestCount: 0,
			sessionTokenCount: 0,
			other: {
				requestCount: 0,
				tokenCount: 0,
				sessionRequestCount: 0,
				sessionTokenCount: 0,
			},
			participants: []
		};
		const stats = await this._languageModelStatsService.fetch(languageModel);
		const extensionStats = stats?.extensions.find(e => ExtensionIdentifier.equals(e.extensionId, extensionId));
		if (extensionStats) {
			result.requestCount = extensionStats.requestCount;
			result.tokenCount = extensionStats.tokenCount;
			result.sessionRequestCount = extensionStats.sessionRequestCount;
			result.sessionTokenCount = extensionStats.sessionTokenCount;
			result.other.requestCount = extensionStats.requestCount;
			result.other.tokenCount = extensionStats.tokenCount;
			result.other.sessionRequestCount = extensionStats.sessionRequestCount;
			result.other.sessionTokenCount = extensionStats.sessionTokenCount;
			for (const participant of extensionStats.participants) {
				const agent = this._chatAgentService.getAgent(participant.id);
				result.requestCount += participant.requestCount;
				result.tokenCount += participant.tokenCount;
				result.sessionRequestCount += participant.sessionRequestCount;
				result.sessionTokenCount += participant.sessionTokenCount;
				result.participants.splice(agent?.isDefault ? 0 : result.participants.length, 0, {
					name: agent ?
						agent?.isDefault ?
							agent.locations.includes(ChatAgentLocation.Editor) ? localize('chat editor', "Inline Chat (Editor)") : localize('chat', "Chat")
							: `@${agent.name}`
						: participant.id,
					requestCount: participant.requestCount,
					tokenCount: participant.tokenCount,
					sessionRequestCount: participant.sessionRequestCount,
					sessionTokenCount: participant.sessionTokenCount
				});
			}
		}
		return result;
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'languageModels',
	label: localize('Language Models', "Language Models"),
	description: localize('languageModels', "Language models usage statistics of this extension."),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LanguageModelFeatureRenderer),
});
