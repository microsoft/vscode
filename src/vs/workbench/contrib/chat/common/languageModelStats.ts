/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const ILanguageModelStatsService = createDecorator<ILanguageModelStatsService>('ILanguageModelStatsService');

export interface ILanguageModelStatsService {
	readonly _serviceBrand: undefined;

	update(model: string, extensionId: ExtensionIdentifier, agent: string | undefined, tokenCount: number | undefined): Promise<void>;
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
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
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

	async update(model: string, extensionId: ExtensionIdentifier, agent: string | undefined, tokenCount: number | undefined): Promise<void> {
		await this.extensionFeaturesManagementService.getAccess(extensionId, CopilotUsageExtensionFeatureId);

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

export const CopilotUsageExtensionFeatureId = 'copilot';
Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: CopilotUsageExtensionFeatureId,
	label: localize('Language Models', "Copilot"),
	description: localize('languageModels', "Language models usage statistics of this extension."),
	icon: Codicon.copilot,
	access: {
		canToggle: false
	},
	accessDataLabel: localize('chat', "chat"),
});
